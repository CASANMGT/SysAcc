// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import * as Storage from '../storage.js';
import { createBelanja, getBelanjas } from '../lcl.js';

beforeEach(() => localStorage.clear());

describe('repro alur simpan Belanja (sama seperti UI)', () => {
  it('draft + belanja + snapshot tidak melempar', () => {
    const lines = [{ name: 'pepper', qty: 100, cnyUnit: 6, weightKg: 6 }];
    const kurs = 2700;
    const existing = Storage.getAllItems();
    lines.forEach((l) => {
      const hit = existing.find((i) => String(i.name).toLowerCase() === String(l.name).toLowerCase());
      if (hit) { l.itemId = hit.id; return; }
      const dup = Storage.createDraftProductFromBelanja({ name: l.name, cost: Math.round(l.cnyUnit * kurs), weightKg: l.weightKg, price: Math.round(l.cnyUnit * kurs) });
      l.itemId = dup.id;
    });
    const b = createBelanja({ date: '2026-09-17', marketplace: 'taobao', seller: 'nama toko', lines, ongkirCny: 20, agentFee: 0, kursAgen: kurs, payment: 'transfer', purpose: 'stock', preorderId: null, chinaTracking: 'Fast' });
    expect(b.totalIdr).toBe(Math.round((100 * 6 + 20) * 2700));
    expect(getBelanjas().length).toBe(1);
    const snap = Storage.snapshotAll();
    expect(snap.belanjas.length).toBe(1);
  });
});
