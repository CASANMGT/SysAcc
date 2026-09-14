// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { suggestMatches, reconSummary, entryDirection } from '../bankmatch.js';
import { upsertBankStatement, getBankStatement, updateBankStatement } from '../storage.js';

const ENTRIES = [
  { id: 'e1', date: '2026-09-10', type: 'income', amount: 100000, description: 'Setoran' },
  { id: 'e2', date: '2026-09-12', type: 'expense', amount: 50000, description: 'Sewa' },
];

describe('bankmatch engine', () => {
  it('entryDirection memetakan income→in, expense→out', () => {
    expect(entryDirection({ type: 'income' })).toBe('in');
    expect(entryDirection({ type: 'expense' })).toBe('out');
  });
  it('menyarankan transaksi nominal sama & tanggal dekat', () => {
    const st = [{ key: 'a', date: '2026-09-11', direction: 'in', amount: 100000 }];
    const r = suggestMatches(st, ENTRIES, { days: 3 });
    expect(r[0].candidates.map(c => c.id)).toEqual(['e1']);
  });
  it('tidak menyarankan bila arah beda atau di luar rentang tanggal', () => {
    const st = [
      { key: 'b', date: '2026-09-10', direction: 'out', amount: 100000 },
      { key: 'c', date: '2026-09-25', direction: 'in', amount: 100000 },
    ];
    const r = suggestMatches(st, ENTRIES);
    expect(r[0].candidates.length).toBe(0);
    expect(r[1].candidates.length).toBe(0);
  });
  it('ringkasan menghitung status cocok/posting/abaikan', () => {
    const st = [
      { key: 'a', date: '2026-09-10', direction: 'in', amount: 100000, matchedId: 'e1' },
      { key: 'b', posted: true },
      { key: 'c', ignored: true },
    ];
    const s = reconSummary(suggestMatches(st, ENTRIES));
    expect(s.matched).toBe(1);
    expect(s.posted).toBe(1);
    expect(s.ignored).toBe(1);
  });
});

describe('bank statement store', () => {
  beforeEach(() => localStorage.clear());
  it('upsert + update status', () => {
    upsertBankStatement([{ key: 'k1', date: '2026-09-10', direction: 'in', amount: 1000 }]);
    expect(getBankStatement().length).toBe(1);
    updateBankStatement('k1', { matchedId: 'e9' });
    expect(getBankStatement()[0].matchedId).toBe('e9');
  });
  it('upsert tidak menghapus status lama (matched/posted/ignored)', () => {
    upsertBankStatement([{ key: 'k1', date: '2026-09-10', amount: 1000, matchedId: 'e9' }]);
    upsertBankStatement([{ key: 'k1', date: '2026-09-10', amount: 1000, desc: 'updated' }]);
    const s = getBankStatement()[0];
    expect(s.matchedId).toBe('e9');
    expect(s.desc).toBe('updated');
  });
});
