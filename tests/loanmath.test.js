import { describe, it, expect } from 'vitest';
import {
  calcTenor, paidOf, outstandingOf, nextInstallmentAmount,
  scheduleData, nextDue, monthLabelId,
  interestRateOf, interestAmount, totalOwed, splitRepaymentPortions
} from '../loanmath.js';

const loan = (over = {}) => ({
  id: 'l1', direction: 'given', loanType: 'cicilan',
  installmentAmount: 250000, person: 'Budi', amount: 3000000,
  date: '2026-01-15', status: 'active', ...over
});
const reps = (amounts, loanId = 'l1') =>
  amounts.map((a, i) => ({ id: `r${i}`, loanId, amount: a, date: `2026-0${i + 1}-15` }));

describe('calcTenor', () => {
  it('cicilan 3jt / 250rb = 12', () => {
    expect(calcTenor(loan())).toBe(12);
  });
  it('lunas selalu 1', () => {
    expect(calcTenor(loan({ loanType: 'lunas' }))).toBe(1);
  });
  it('cicilan tanpa nominal = 1 (tidak pecah)', () => {
    expect(calcTenor(loan({ installmentAmount: 0 }))).toBe(1);
  });
  it('3jt / 400rb dibulatkan ke atas = 8', () => {
    expect(calcTenor(loan({ installmentAmount: 400000 }))).toBe(8);
  });
  it('loan rusak/null aman', () => {
    expect(calcTenor(null)).toBe(1);
    expect(calcTenor({})).toBe(1);
  });
});

describe('paidOf / outstandingOf', () => {
  it('total terbayar', () => {
    expect(paidOf(reps([250000, 250000]))).toBe(500000);
  });
  it('sisa = pokok − terbayar', () => {
    expect(outstandingOf(loan(), reps([250000, 250000]))).toBe(2500000);
  });
  it('kelebihan bayar tidak negatif', () => {
    expect(outstandingOf(loan(), reps([3000000, 100000]))).toBe(0);
  });
  it('tahan data rusak', () => {
    expect(paidOf(null)).toBe(0);
    expect(paidOf([{ amount: 'x' }])).toBe(0);
    expect(outstandingOf(null, null)).toBe(0);
  });
});

describe('nextInstallmentAmount', () => {
  it('cicilan normal', () => {
    expect(nextInstallmentAmount(loan(), reps([250000]))).toBe(250000);
  });
  it('cicilan terakhir dipangkas ke sisa', () => {
    expect(nextInstallmentAmount(loan(), reps(Array(11).fill(250000)))).toBe(250000);
    expect(nextInstallmentAmount(loan({ amount: 2900000 }), reps(Array(11).fill(250000)))).toBe(150000);
  });
});

describe('scheduleData', () => {
  it('12 baris, total = pokok', () => {
    const rows = scheduleData(loan(), []);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(3000000);
  });
  it('flag bayar/berikutnya benar', () => {
    const rows = scheduleData(loan(), reps([250000, 250000]));
    expect(rows[0].paid).toBe(true);
    expect(rows[1].paid).toBe(true);
    expect(rows[2].paid).toBe(false);
    expect(rows[2].isNext).toBe(true);
    expect(rows[3].isNext).toBe(false);
  });
  it('cicilan terakhir = sisa (pembulatan)', () => {
    const rows = scheduleData(loan({ amount: 2900000, installmentAmount: 250000 }), []);
    expect(rows).toHaveLength(12);
    expect(rows[11].amount).toBe(150000);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(2900000);
  });
  it('lunas penuh → isNext false, 1 baris', () => {
    const rows = scheduleData(loan({ loanType: 'lunas', status: 'paid' }), reps([3000000]));
    expect(rows).toHaveLength(1);
    expect(rows[0].isNext).toBe(false);
  });
});

describe('nextDue', () => {
  it('lunas → null', () => {
    expect(nextDue(loan({ status: 'paid' }), 5)).toBeNull();
  });
  it('cicilan tanpa dueDate: mulai + terbayar', () => {
    const d = nextDue(loan(), 2);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // Jan + 2 = Mar
  });
  it('dueDate eksplisit dipakai', () => {
    const d = nextDue(loan({ dueDate: '2026-06-10' }), 1);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // Jun + 1 = Jul
  });
  it('tanggal rusak → null', () => {
    expect(nextDue(loan({ date: 'xxx' }), 0)).toBeNull();
  });
});

describe('bunga flat', () => {
  const withRate = loan({ amount: 1000000, installmentAmount: 0, loanType: 'lunas', interestRate: 5 });
  it('rate dijepit 0–100, rusak → 0', () => {
    expect(interestRateOf(withRate)).toBe(5);
    expect(interestRateOf(loan())).toBe(0);
    expect(interestRateOf(loan({ interestRate: 250 }))).toBe(100);
    expect(interestRateOf(loan({ interestRate: -3 }))).toBe(0);
    expect(interestRateOf(loan({ interestRate: 'x' }))).toBe(0);
  });
  it('1jt + 5% = 1.050.000', () => {
    expect(interestAmount(withRate)).toBe(50000);
    expect(totalOwed(withRate)).toBe(1050000);
  });
  it('tanpa bunga total = pokok', () => {
    expect(totalOwed(loan())).toBe(3000000);
  });
  it('sisa termasuk bunga', () => {
    expect(outstandingOf(withRate, reps([200000], 'l1'))).toBe(850000);
  });
  it('jadwal lunas bunga 1 baris = total', () => {
    const rows = scheduleData(withRate, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1050000);
  });
  it('jadwal cicilan berbunga totalnya pas', () => {
    const l = loan({ amount: 1000000, installmentAmount: 200000, interestRate: 10 });
    const rows = scheduleData(l, []);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1100000);
    expect(calcTenor(l)).toBe(6);
  });
});

describe('monthLabelId', () => {
  it('label Indonesia', () => {
    expect(monthLabelId('2026-08-15')).toMatch(/Agu.*2026/);
  });
  it('invalid → string kosong', () => {
    expect(monthLabelId('xxx')).toBe('');
  });
});

describe('splitRepaymentPortions (B7)', () => {
  const withRate = () => loan({ amount: 1000000, installmentAmount: 0, loanType: 'lunas', interestRate: 10 });
  it('tanpa bunga → semua pokok', () => {
    const r = splitRepaymentPortions(loan({ interestRate: 0 }), 250000, []);
    expect(r).toEqual({ principalPortion: 250000, interestPortion: 0 });
  });
  it('pelunasan penuh → pokok + bunga persis', () => {
    const r = splitRepaymentPortions(withRate(), 1100000, []);
    expect(r.principalPortion).toBe(1000000);
    expect(r.interestPortion).toBe(100000);
  });
  it('proporsional dan kumulatif tidak melebihi bunga', () => {
    const l = withRate();
    const got = [];
    let prior = [];
    for (let i = 0; i < 4; i++) {
      const r = splitRepaymentPortions(l, 275000, prior);
      got.push(r);
      prior = prior.concat([{ amount: 275000 }]);
    }
    expect(got.reduce((s, r) => s + r.interestPortion, 0)).toBe(100000);
    expect(got.reduce((s, r) => s + r.principalPortion, 0)).toBe(1000000);
  });
  it('kumulatif lebih kecil/lebih besar dari proporsional-naif tetap konsisten', () => {
    const l = withRate();
    const first = splitRepaymentPortions(l, 550000, []);
    const second = splitRepaymentPortions(l, 550000, [{ amount: 550000 }]);
    expect(first.interestPortion + second.interestPortion).toBe(100000);
  });
});
