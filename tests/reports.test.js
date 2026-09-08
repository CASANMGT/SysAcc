import { describe, it, expect } from 'vitest';
import {
  filterEntries, computeTotals, computeCategoryBreakdown,
  computeCashflow, getMonthsBetween, formatCurrency
} from '../reports.js';

const entries = [
  { id: '1', date: '2026-08-05', type: 'income', category: 'gaji', amount: 5000000 },
  { id: '2', date: '2026-08-10', type: 'expense', category: 'makanan', amount: 50000 },
  { id: '3', date: '2026-08-12', type: 'expense', category: 'makanan', amount: 75000 },
  { id: '4', date: '2026-07-01', type: 'expense', category: 'kos', amount: 1000000 },
  { id: '5', date: '2026-07-03', type: 'income', category: 'freelance', amount: 1500000 },
];

describe('computeTotals', () => {
  it('jumlah + hitung', () => {
    const t = computeTotals(entries);
    expect(t.income).toBe(6500000);
    expect(t.expense).toBe(1125000);
    expect(t.net).toBe(5375000);
    expect(t.incomeCount).toBe(2);
    expect(t.expenseCount).toBe(3);
  });
  it('kosong / rusak aman', () => {
    expect(computeTotals([])).toEqual({ income: 0, expense: 0, net: 0, incomeCount: 0, expenseCount: 0 });
    expect(computeTotals(null).net).toBe(0);
  });
});

describe('filterEntries', () => {
  it('filter jenis', () => {
    expect(filterEntries(entries, { period: 'all', type: 'income', category: 'all' })).toHaveLength(2);
    expect(filterEntries(entries, { period: 'all', type: 'expense', category: 'all' })).toHaveLength(3);
  });
  it('filter kategori', () => {
    expect(filterEntries(entries, { period: 'all', type: 'all', category: 'makanan' })).toHaveLength(2);
  });
  it('urut terbaru dulu', () => {
    const r = filterEntries(entries, { period: 'all', type: 'all', category: 'all' });
    expect(r[0].id).toBe('3');
  });
});

describe('computeCategoryBreakdown', () => {
  it('kelompok + urut terbesar', () => {
    const b = computeCategoryBreakdown(entries);
    const makanan = b.find(x => x.category === 'makanan');
    expect(makanan.total).toBe(125000);
    expect(makanan.count).toBe(2);
    expect(b[0].total).toBeGreaterThanOrEqual(b[1].total);
  });
});

describe('computeCashflow', () => {
  it('per bulan menaik', () => {
    const c = computeCashflow(entries);
    expect(c.map(x => x.month)).toEqual(['2026-07', '2026-08']);
    const agu = c.find(x => x.month === '2026-08');
    expect(agu.income).toBe(5000000);
    expect(agu.expense).toBe(125000);
  });
  it('tanggal rusak dilewati', () => {
    const c = computeCashflow([{ date: 'xxx', type: 'income', amount: 99 }]);
    expect(c).toHaveLength(0);
  });
});

describe('getMonthsBetween', () => {
  it('rentang inklusif', () => {
    const r = getMonthsBetween(new Date(2026, 5, 1), new Date(2026, 7, 1));
    expect(r).toEqual(['2026-06', '2026-07', '2026-08']);
  });
});

describe('formatCurrency', () => {
  it('Rupiah tanpa desimal', () => {
    expect(formatCurrency(1500)).toMatch(/1\.500/);
    expect(formatCurrency(1500)).not.toMatch(/,00/);
  });
});
