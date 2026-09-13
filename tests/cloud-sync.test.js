// @vitest-environment jsdom
// Sync engine: hanya logika murni (tanpa network). Aturan yang dijaga:
// LWW per baris, seri → lokal menang, tombstone menekan kebangkitan,
// hapus lokal terdeteksi, tombstone kedaluwarsa dibuang.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mergeTable, detectDeletions, pruneTombstones, rowTs,
  saveCloudConfig, getCloudConfig, clearCloudConfig,
} from '../supabase.js';

beforeEach(() => { localStorage.clear(); });

describe('rowTs', () => {
  it('pakai updatedAt, fallback createdAt, lalu 0', () => {
    expect(rowTs({ updatedAt: '2026-09-01T00:00:00.000Z' })).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
    expect(rowTs({ createdAt: '2026-09-01T00:00:00.000Z' })).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
    expect(rowTs({})).toBe(0);
    expect(rowTs(null)).toBe(0);
  });
});

describe('mergeTable', () => {
  it('baris hanya-lokal ikut push; hanya-remote ikut merge', () => {
    const r = mergeTable([{ id: 'a', v: 1 }], [{ id: 'b', data: { v: 2 }, updated_at: '2026-09-02T00:00:00.000Z' }], {});
    expect(r.merged).toHaveLength(2);
    expect(r.push.map(p => p.id)).toEqual(['a']);
    expect(r.conflicts).toBe(0);
  });
  it('last-write-wins: remote lebih baru menang + dihitung konflik', () => {
    const r = mergeTable(
      [{ id: 'a', v: 1, updatedAt: '2026-09-01T00:00:00.000Z' }],
      [{ id: 'a', data: { v: 2 }, updated_at: '2026-09-02T00:00:00.000Z' }], {}
    );
    expect(r.merged).toEqual([{ v: 2 }]);
    expect(r.push).toEqual([]);
    expect(r.conflicts).toBe(1);
  });
  it('lokal lebih baru menang + ikut push', () => {
    const r = mergeTable(
      [{ id: 'a', v: 3, updatedAt: '2026-09-03T00:00:00.000Z' }],
      [{ id: 'a', data: { v: 2 }, updated_at: '2026-09-02T00:00:00.000Z' }], {}
    );
    expect(r.merged).toEqual([{ id: 'a', v: 3, updatedAt: '2026-09-03T00:00:00.000Z' }]);
    expect(r.push.map(p => p.id)).toEqual(['a']);
  });
  it('seri → lokal menang deterministik, tanpa konflik palsu bila isi sama', () => {
    const r = mergeTable(
      [{ id: 'a', v: 1, updatedAt: '2026-09-02T00:00:00.000Z' }],
      [{ id: 'a', data: { id: 'a', v: 1, updatedAt: '2026-09-02T00:00:00.000Z' }, updated_at: '2026-09-02T00:00:00.000Z' }], {}
    );
    expect(r.conflicts).toBe(0);
    expect(r.push.map(p => p.id)).toEqual(['a']);
  });
  it('tombstone menekan baris remote yang lebih tua (anti-bangkit)', () => {
    const r = mergeTable(
      [],
      [{ id: 'x', data: { v: 9 }, updated_at: '2026-09-01T00:00:00.000Z' }],
      { x: Date.parse('2026-09-05T00:00:00.000Z') }
    );
    expect(r.merged).toEqual([]);
    expect(r.push).toEqual([]);
  });
  it('remote lebih baru dari tombstone = dibuat ulang → menang', () => {
    const r = mergeTable(
      [],
      [{ id: 'x', data: { v: 9 }, updated_at: '2026-09-06T00:00:00.000Z' }],
      { x: Date.parse('2026-09-05T00:00:00.000Z') }
    );
    expect(r.merged).toEqual([{ v: 9 }]);
  });
});

describe('detectDeletions + pruneTombstones', () => {
  it('id hilang dari lokal = terhapus', () => {
    expect(detectDeletions(['a', 'b', 'c'], [{ id: 'a' }, { id: 'c' }])).toEqual(['b']);
    expect(detectDeletions([], [{ id: 'a' }])).toEqual([]);
  });
  it('tombstone >30 hari dibuang', () => {
    const now = Date.parse('2026-10-15T00:00:00.000Z');
    const out = pruneTombstones({
      fresh: Date.parse('2026-10-01T00:00:00.000Z'),
      stale: Date.parse('2026-08-01T00:00:00.000Z'),
    }, now);
    expect(Object.keys(out)).toEqual(['fresh']);
  });
});

describe('saveCloudConfig', () => {  it('menolak URL aneh dan key pendek', () => {
    expect(() => saveCloudConfig('https://evil.com', 'x'.repeat(40))).toThrow();
    expect(() => saveCloudConfig('https://abc.supabase.co', 'pendek')).toThrow();
  });
  it('menerima URL + anon key valid, menolak service_role secara implisit (format sama — diedukasi di UI)', () => {
    saveCloudConfig('https://abc.supabase.co', 'x'.repeat(40));
    expect(getCloudConfig().url).toBe('https://abc.supabase.co');
    clearCloudConfig();
    expect(getCloudConfig()).toBe(null);
  });
});

describe('cloudSignInAnonymously (fetch di-stub, tanpa network)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; try { localStorage.clear(); } catch {} });
  it('POST /auth/v1/authorize + simpan sesi', async () => {
    const { saveCloudConfig, cloudSignInAnonymously, getCloudSession } = await import('../supabase.js');
    saveCloudConfig('https://abc.supabase.co', 'x'.repeat(40));
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push([url, opts]);
      return { ok: true, json: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'u1' } }) };
    };
    const s = await cloudSignInAnonymously();
    expect(s.user_id).toBe('u1');
    expect(calls[0][0]).toContain('/auth/v1/authorize');
    expect(getCloudSession().user_id).toBe('u1');
  });
  it('pesan jelas bila anonymous dimatikan di dashboard', async () => {
    const { saveCloudConfig, cloudSignInAnonymously } = await import('../supabase.js');
    saveCloudConfig('https://abc.supabase.co', 'x'.repeat(40));
    globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ message: 'Anonymous sign-ins are disabled' }) });
    await expect(cloudSignInAnonymously()).rejects.toThrow(/Allow anonymous/);
  });
});
