// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { validateBackupJSON, importEntries, getAllEntries, clearAllEntries, createLoan, addRepayment, getLoanById, updateLoan, parseCsvRow } from '../storage.js';

beforeEach(() => {
  localStorage.clear();
});

const goodBackup = JSON.stringify({
  entries: [{ id: 'e1', date: '2026-08-01', type: 'income', category: 'gaji', payment: 'transfer', amount: 5000000 }],
  loans: [{ id: 'l1', direction: 'given', person: 'Budi', amount: 1000000, date: '2026-08-02', status: 'active' }],
  repayments: [],
  people: [{ name: 'Budi', type: 'person' }],
  version: 1
});

describe('validateBackupJSON', () => {
  it('backup valid → ok', () => {
    expect(validateBackupJSON(goodBackup).ok).toBe(true);
  });
  it('bukan JSON → pesan jelas', () => {
    const r = validateBackupJSON('{{{bukan json');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/JSON/i);
  });
  it('JSON tapi bukan backup → ditolak', () => {
    expect(validateBackupJSON('"cuma string"').ok).toBe(false);
    expect(validateBackupJSON('{"hello":1}').ok).toBe(false);
    expect(validateBackupJSON('null').ok).toBe(false);
  });
  it('file raksasa ditolak (anti-freeze)', () => {
    const big = JSON.stringify({ entries: new Array(50001).fill({}) });
    const r = validateBackupJSON(big);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/besar/i);
  });
});

describe('importEntries', () => {
  it('impor + buang baris rusak', () => {
    const rows = [
      { date: '2026-08-01', type: 'income', category: 'gaji', amount: 5000000 },
      { date: 'xxx', type: 'income', category: 'gaji', amount: 1 },
      { date: '2026-08-01', type: 'income', category: 'gaji', amount: -5 },
      null
    ];
    const added = importEntries(JSON.stringify(rows));
    expect(added).toHaveLength(1);
    expect(getAllEntries()).toHaveLength(1);
  });
  it('impor kedua = duplikat → 0 baru', () => {
    const rows = [{ date: '2026-08-01', type: 'income', category: 'gaji', amount: 5000000 }];
    importEntries(JSON.stringify(rows));
    expect(importEntries(JSON.stringify(rows))).toHaveLength(0);
  });
  it('file rusak → throw pesan jelas', () => {
    expect(() => importEntries('bukan json')).toThrow(/invalid/i);
    expect(() => clearAllEntries()).not.toThrow();
  });
});

describe('parseCsvRow', () => {
  it('kutip dengan koma tetap 1 kolom', () => {
    expect(parseCsvRow('"2026-09-01","Makan, minum",50000')).toEqual(['2026-09-01', 'Makan, minum', '50000']);
  });
  it('kutip ganda jadi 1 kutip', () => {
    expect(parseCsvRow('"a""b",c')).toEqual(['a"b', 'c']);
  });
  it('delimiter titik-koma', () => {
    expect(parseCsvRow('a;b;c', ';')).toEqual(['a', 'b', 'c']);
  });
});

describe('updateLoan', () => {
  it('status ikut kebenaran saat pokok dikecilkan di bawah terbayar', () => {
    const loan = createLoan({ direction: 'given', person: 'Budi', amount: 1000000, date: '2026-08-01' });
    addRepayment({ loanId: loan.id, amount: 600000, date: '2026-08-10' });
    expect(getLoanById(loan.id).status).toBe('active');
    updateLoan(loan.id, { amount: 500000 });
    expect(getLoanById(loan.id).status).toBe('paid');
  });
  it('status eksplisit dihormati', () => {
    const loan = createLoan({ direction: 'given', person: 'Ani', amount: 1000000, date: '2026-08-01' });
    updateLoan(loan.id, { status: 'paid' });
    expect(getLoanById(loan.id).status).toBe('paid');
  });
});
