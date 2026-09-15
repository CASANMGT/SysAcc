// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { suggestMatches, reconSummary, entryDirection, suggestRules } from '../bankmatch.js';
import { upsertBankStatement, getBankStatement, updateBankStatement, getBankRules, addBankRule, deleteBankRule, updateBankRule, matchBankRule, getBankEndBalances, setBankEndBalance } from '../storage.js';

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
  it('suggestRules mengelompokkan mutasi nyata & usul akun terpopuler', () => {
    const st = [
      { key: 'a', desc: 'BIAYA ADM BULANAN', amount: 15000, direction: 'out', counterAccount: '6205' },
      { key: 'b', desc: 'BIAYA ADM KARTU', amount: 5000, direction: 'out', counterAccount: '6205' },
      { key: 'c', desc: 'GRABFOOD', amount: 85000, direction: 'out', counterAccount: '5103' },
      { key: 'd', desc: 'SUDAH DIPROSES', amount: 1000, direction: 'out', counterAccount: '5199', posted: true },
      { key: 'e', desc: 'DIABAIKAN', amount: 1000, direction: 'out', counterAccount: '5199', ignored: true },
    ];
    const r = suggestRules(st);
    expect(r[0].keyword).toBe('biaya');
    expect(r[0].count).toBe(2);
    expect(r[0].total).toBe(20000);
    expect(r[0].code).toBe('6205');
    expect(r.some(x => x.keyword === 'grabfood')).toBe(true);
    expect(r.some(x => x.keyword === 'diproses')).toBe(false);
    expect(r.some(x => x.keyword === 'diabaikan')).toBe(false);
    expect(r[0].examples.length).toBeGreaterThan(0);
    expect(typeof r[0].confirmed).toBe('number');
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

describe('aturan bank & saldo akhir', () => {
  beforeEach(() => localStorage.clear());
  it('aturan keyword → akun (dipakai saat import)', () => {
    addBankRule('gojek', '5104');
    expect(matchBankRule('TRANSFER GOJEK 123')).toBe('5104');
    expect(matchBankRule('makan siang')).toBe(null);
  });
  it('kata kunci sama memperbarui aturan (tidak menumpuk)', () => {
    addBankRule('gojek', '5104');
    addBankRule('gojek', '5199');
    const r = getBankRules();
    expect(r.length).toBe(1);
    expect(r[0].code).toBe('5199');
  });
  it('hapus aturan', () => {
    const list = addBankRule('grab', '5104');
    deleteBankRule(list[0].id);
    expect(getBankRules().length).toBe(0);
  });
  it('aturan berarah: hanya berlaku untuk arah yang cocok', () => {
    addBankRule('bunga', '5113', 'out');
    expect(matchBankRule('BUNGA TABUNGAN', 'out')).toBe('5113');
    expect(matchBankRule('BUNGA TABUNGAN', 'in')).toBe(null);
  });
  it('kata kunci terpanjang menang (grabfood > grab)', () => {
    addBankRule('grab', '5104');
    addBankRule('grabfood', '5103');
    expect(matchBankRule('GRABFOOD ORDER', 'out')).toBe('5103');
    expect(matchBankRule('GRAB CAR', 'out')).toBe('5104');
  });
  it('updateBankRule mengubah akun & arah (inline edit)', () => {
    const list = addBankRule('gojek', '5104');
    updateBankRule(list[0].id, { code: '5103', direction: 'out' });
    const r = getBankRules()[0];
    expect(r.code).toBe('5103');
    expect(r.direction).toBe('out');
  });
  it('saldo akhir tersimpan; 0 menghapus', () => {
    setBankEndBalance('1102', 5000000);
    expect(getBankEndBalances()['1102']).toBe(5000000);
    setBankEndBalance('1102', 0);
    expect(getBankEndBalances()['1102']).toBeUndefined();
  });
});

