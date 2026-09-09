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
  it('tarif iuran bisa dioverwrite — JKK risiko tinggi 1,74% & iuran karyawan 2%', () => {
    const s = computeSlip(emp, { rates: { jkk: 0.0174, kesSelf: 0.02, jpSelf: 0.02 } });
    expect(s.comp.jkk).toBe(87000); // 1,74% × 5jt
    expect(s.ded.kesSelf).toBe(100000); // 2% × 5jt
    expect(s.ded.jpSelf).toBe(100000);
    expect(s.comp.kesComp).toBe(200000); // tarif perusahaan tetap default
    expect(s.rates.jkk).toBe(0.0174);
    expect(s.rates.kesComp).toBe(0.04);
    expect(s.takeHome).toBe(5000000 - 100000 - 100000 - 100000);
  });
  it('tarif invalid → kembali ke default', () => {
    const s = computeSlip(emp, { rates: { jkk: -1, jkm: 'bukan angka', kesSelf: 2 } });
    expect(s.comp.jkk).toBe(27000);
    expect(s.comp.jkm).toBe(15000);
    expect(s.ded.kesSelf).toBe(50000); // >1 dianggap invalid → default 1%
  });
  it('plafon kes 12jt & JP', () => {
    const s = computeSlip({ baseSalary: 15000000, allowance: 5000000 }, {});
    expect(s.comp.kesComp).toBe(Math.round(KES_CAP * 0.04));
    expect(s.comp.jpComp).toBe(Math.round(JP_CAP * 0.02));
    expect(s.comp.jhtComp).toBe(Math.round(20000000 * 0.037)); // JHT tanpa plafon
    expect(s.bases.gross).toBe(20000000);
    expect(s.bases.kesWage).toBe(KES_CAP);
    expect(s.bases.jpWage).toBe(JP_CAP);
  });
  it('opt-out BPJS → nol', () => {
    const s = computeSlip({ ...emp, bpjsKes: false, bpjsTk: false }, {});
    expect(s.totalDed).toBe(0);
    expect(s.totalComp).toBe(0);
    expect(s.takeHome).toBe(5000000);
  });
  it('PPh 21 TER dihitung dari NETO (biaya jabatan + iuran JHT/JP dikurangkan), tanpa NPWP +20%', () => {
    // bruto+THR = 10jt; jabatan 500rb (5% = 500rb, pas di cap)
    // iuran dihitung dari UPAH (tanpa THR): JHT 2%×5jt = 100rb; JP 1%×5jt = 50rb
    // netto = 10jt − 500rb − 100rb − 50rb = 9.350.000 → TER A 1,75% → 163.625 → ×1,2 = 196.350
    const s = computeSlip(emp, { pph: true, thr: 5000000 });
    expect(s.pphJabatan).toBe(500000);
    expect(s.pphNetto).toBe(9350000);
    expect(s.ded.pph21).toBe(196350);
    expect(s.takeHome).toBe(10000000 - 396350);
  });
  it('punya NPWP → tanpa surcharge 20%', () => {
    const s = computeSlip({ ...emp, npwp: '123456789' }, { pph: true, thr: 5000000 });
    expect(s.ded.pph21).toBe(163625);
    expect(s.takeHome).toBe(10000000 - 363625);
  });
  it('biaya jabatan di-cap 500rb saat bruto besar', () => {
    const s = computeSlip({ baseSalary: 15000000, allowance: 5000000, ptkp: 'TK/0' }, { pph: true });
    // bruto 20jt → 5% = 1jt → cap 500rb; JHT 400rb; JP 1% × 10.042.000 (cap) = 100.420
    expect(s.pphJabatan).toBe(500000);
    // netto = 20jt − 500rb − 400rb − 100.420 = 18.999.580 → TER A 8% → 1.519.966 → ×1,2 = 1.823.959
    expect(s.ded.pph21).toBe(1823959);
  });
  it('bonus masuk bruto BPJS & PPh', () => {
    // gross = 6jt; kes 60rb, jht 120rb, jp 60rb; jabatan 300rb
    // netto = 6jt − 300rb − 120rb − 60rb = 5.520.000 → TER A 0,25% = 13.800 → ×1,2 = 16.560
    const s = computeSlip(emp, { bonus: 1000000, pph: true });
    expect(s.gross).toBe(6000000);
    expect(s.ded.jhtSelf).toBe(120000);
    expect(s.ded.jpSelf).toBe(60000);
    expect(s.ded.pph21).toBe(16560);
  });
  it('deduct (denda) hanya memotong take-home, bukan dasar BPJS/PPh', () => {
    const s = computeSlip(emp, { deduct: 50000, pph: false });
    expect(s.gross).toBe(5000000);
    expect(s.totalDed).toBe(200000);
    expect(s.takeHome).toBe(5000000 - 200000 - 50000);
    expect(s.employerCost).toBe(5000000 + 527000);
  });
  it('THR auto penuh untuk karyawan lama', () => {
    const s = computeSlip({ ...emp, startDate: '2020-01-01' }, { thr: 'auto' });
    expect(s.thr).toBe(5000000);
  });
});
