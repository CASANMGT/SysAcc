import { describe, it, expect } from 'vitest';
import { terCategory, terRate, tenureMonths, thrAmount, computeSlip, KES_CAP, JP_CAP } from '../payroll.js';

describe('terCategory', () => {
  it('TK/0, TK/1, K/0 → A', () => {
    expect(terCategory('TK/0')).toBe('A');
    expect(terCategory('K/0')).toBe('A');
  });
  it('TK/2, K/2 → B; K/3 → C; kosong → B', () => {
    expect(terCategory('TK/2')).toBe('B');
    expect(terCategory('K/3')).toBe('C');
    expect(terCategory('')).toBe('B');
  });
});

describe('terRate', () => {
  it('A: 5jt bebas, 6jt = 0.75%', () => {
    expect(terRate(5000000, 'A')).toBe(0);
    expect(terRate(6000000, 'A')).toBe(0.0075);
  });
  it('batas atas inklusif', () => {
    expect(terRate(5400000, 'A')).toBe(0);
    expect(terRate(5400001, 'A')).toBe(0.0025);
  });
  it('gaji raksasa kena tarif puncak', () => {
    expect(terRate(500000000, 'A')).toBe(0.2);
    expect(terRate(500000000, 'C')).toBe(0.21);
  });
});

describe('tenureMonths', () => {
  it('2 tahun = 24', () => {
    expect(tenureMonths('2024-09-01', new Date('2026-09-09'))).toBe(24);
  });
  it('belum sebulan = 0, masa depan = 0', () => {
    expect(tenureMonths('2026-08-20', new Date('2026-09-09'))).toBe(0);
    expect(tenureMonths('2027-01-01', new Date('2026-09-09'))).toBe(0);
  });
});

describe('thrAmount', () => {
  const emp = { baseSalary: 4000000, allowance: 1000000 };
  it('≥12 bulan = penuh 5jt', () => {
    expect(thrAmount({ ...emp, startDate: '2024-01-01' }, new Date('2026-09-09'))).toBe(5000000);
  });
  it('6 bulan = setengah', () => {
    expect(thrAmount({ ...emp, startDate: '2026-03-09' }, new Date('2026-09-09'))).toBe(2500000);
  });
  it('belum sebulan = 0', () => {
    expect(thrAmount({ ...emp, startDate: '2026-09-01' }, new Date('2026-09-09'))).toBe(0);
  });
});

describe('computeSlip', () => {
  const emp = { baseSalary: 4000000, allowance: 1000000, ptkp: 'TK/0' };
  it('BPJS gaji 5jt (tanpa lembur/THR/PPh)', () => {
    const s = computeSlip(emp, {});
    expect(s.gross).toBe(5000000);
    expect(s.comp.kesComp).toBe(200000);
    expect(s.ded.kesSelf).toBe(50000);
    expect(s.comp.jhtComp).toBe(185000);
    expect(s.ded.jhtSelf).toBe(100000);
    expect(s.comp.jpComp).toBe(100000);
    expect(s.ded.jpSelf).toBe(50000);
    expect(s.comp.jkk).toBe(27000);
    expect(s.comp.jkm).toBe(15000);
    expect(s.takeHome).toBe(5000000 - 200000);
    expect(s.employerCost).toBe(5000000 + 200000 + 185000 + 100000 + 27000 + 15000);
  });
  it('plafon kes 12jt & JP', () => {
    const s = computeSlip({ baseSalary: 15000000, allowance: 5000000 }, {});
    expect(s.comp.kesComp).toBe(Math.round(KES_CAP * 0.04));
    expect(s.comp.jpComp).toBe(Math.round(JP_CAP * 0.02));
    expect(s.comp.jhtComp).toBe(Math.round(20000000 * 0.037)); // JHT tanpa plafon
  });
  it('opt-out BPJS → nol', () => {
    const s = computeSlip({ ...emp, bpjsKes: false, bpjsTk: false }, {});
    expect(s.totalDed).toBe(0);
    expect(s.totalComp).toBe(0);
    expect(s.takeHome).toBe(5000000);
  });
  it('PPh TER ikut bruto + THR', () => {
    const s = computeSlip(emp, { pph: true, thr: 5000000 });
    // bruto 10jt kat A → 2%
    expect(s.ded.pph21).toBe(200000);
    expect(s.takeHome).toBe(10000000 - 200000 - 200000);
  });
  it('THR auto penuh untuk karyawan lama', () => {
    const s = computeSlip({ ...emp, startDate: '2020-01-01' }, { thr: 'auto' });
    expect(s.thr).toBe(5000000);
  });
});
