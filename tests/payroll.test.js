import { describe, it, expect } from 'vitest';
import { terCategory, terRate, tenureMonths, thrAmount, computeSlip, KES_CAP, JP_CAP, annualPPh21, ptkpAnnual, decRecon } from '../payroll.js';

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
  it('guard salah ketik: jkk 54 (54%) → balik ke standar 0,54%', () => {
    // kasus nyata: 0,54% × 7,5jt = Rp40.500, bukan Rp4.050.000
    const s = computeSlip({ baseSalary: 6500000, allowance: 1000000 }, { rates: { jkk: 0.54 } });
    expect(s.comp.jkk).toBe(Math.round(7500000 * 0.0054)); // 40500
    expect(s.rates.jkk).toBe(0.0054);
  });
  it('jkk rata-rata 1,2% masih diizinkan (dalam batas risiko)', () => {
    const s = computeSlip(emp, { rates: { jkk: 0.012 } });
    expect(s.comp.jkk).toBe(60000);
    expect(s.rates.jkk).toBe(0.012);
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

describe('PPh 21 tahunan — SUMBER: UU PPh 36/2008 jo. UU HPP 7/2021 (wajib konfirmasi konsultan sebelum filing)', () => {
  it('ptkpAnnual sesuai tabel', () => {
    expect(ptkpAnnual('TK/0')).toBe(54000000);
    expect(ptkpAnnual('K/3')).toBe(72000000);
    expect(ptkpAnnual('ngaco')).toBe(54000000);
  });
  it('annualPPh21 progresif — hitung tangan', () => {
    expect(annualPPh21(0)).toBe(0);
    // 56,4jt seluruhnya di lapis 5%: 56.400.000 × 0,05 = 2.820.000
    expect(annualPPh21(56400000)).toBe(2820000);
    // 300jt: 60jt×5% + 190jt×15% + 50jt×25% = 3jt + 28,5jt + 12,5jt = 44jt
    expect(annualPPh21(300000000)).toBe(44000000);
  });
  it('decRecon: 12×10jt TK/0 ber-NPWP — hitung tangan', () => {
    // Jan–Nov aktual + Des draf: bruto 120jt; JHT 2,4jt; JP 1,2jt
    // jabatan min(6jt;6jt)=6jt; netto = 120 − 6 − 3,6 = 110,4jt
    // PKP = 110,4 − 54 = 56,4jt; tahunan = 56,4jt × 5% = 2.820.000
    // bayar Jan–Nov = 11 × 161.000 = 1.771.000 → Des = 1.049.000
    const ms = Array.from({ length: 11 }, () => ({ gross: 10000000, thr: 0, jhtSelf: 200000, jpSelf: 100000, pphPaid: 161000 }));
    const dec = { gross: 10000000, thr: 0, jhtSelf: 200000, jpSelf: 100000 };
    const r = decRecon({ ptkp: 'TK/0', npwp: '123' }, ms, dec);
    expect(r.annualGross).toBe(120000000);
    expect(r.jabatan).toBe(6000000);
    expect(r.netto).toBe(110400000);
    expect(r.pkp).toBe(56400000);
    expect(r.annualDue).toBe(2820000);
    expect(r.paidJanNov).toBe(1771000);
    expect(r.decAdjust).toBe(1049000);
  });
  it('decRecon tanpa NPWP kena +20%', () => {
    // tahunan = 2.820.000 × 1,2 = 3.384.000 → Des = 3.384.000 − 1.771.000 = 1.613.000
    const ms = Array.from({ length: 11 }, () => ({ gross: 10000000, thr: 0, jhtSelf: 200000, jpSelf: 100000, pphPaid: 161000 }));
    const r = decRecon({ ptkp: 'TK/0' }, ms, { gross: 10000000, thr: 0, jhtSelf: 200000, jpSelf: 100000 });
    expect(r.annualDue).toBe(3384000);
    expect(r.decAdjust).toBe(1613000);
  });
  it('decRecon floor 0 bila sudah lebih bayar', () => {
    // bruto 44jt; netto 40,48jt < PTKP → due 0; bayar 5,5jt → Des 0
    const ms = Array.from({ length: 11 }, () => ({ gross: 4000000, thr: 0, jhtSelf: 80000, jpSelf: 40000, pphPaid: 500000 }));
    const r = decRecon({ ptkp: 'TK/0', npwp: '1' }, ms, { gross: 4000000, thr: 0, jhtSelf: 80000, jpSelf: 40000 });
    expect(r.annualDue).toBe(0);
    expect(r.decAdjust).toBe(0);
  });
  it('pphOverride menggantikan TER + flag transparan', () => {
    const s = computeSlip({ baseSalary: 4000000, allowance: 1000000, ptkp: 'TK/0', npwp: '1' }, { pph: true, pphOverride: 1049000 });
    expect(s.ded.pph21).toBe(1049000);
    expect(s.pphOverridden).toBe(true);
    const s2 = computeSlip({ baseSalary: 4000000, allowance: 1000000, ptkp: 'TK/0', npwp: '1' }, { pph: true });
    expect(s2.pphOverridden).toBe(false);
  });
});
