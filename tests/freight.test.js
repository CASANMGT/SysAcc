import { describe, it, expect } from 'vitest';
import { cbmFromDims, volumetricKg, seaFreight, airFreight, estimateBelanja } from '../freight.js';

describe('cbmFromDims', () => {
  it('40×30×25 cm → 0,03 CBM', () => {
    expect(cbmFromDims(40, 30, 25)).toBeCloseTo(0.03, 6);
  });
  it('× jumlah karton', () => {
    expect(cbmFromDims(40, 30, 25, 4)).toBeCloseTo(0.12, 6);
  });
  it('dimensi kosong → 0 (bukan NaN)', () => {
    expect(cbmFromDims(0, 30, 25)).toBe(0);
    expect(cbmFromDims('', '', '')).toBe(0);
  });
});

describe('volumetricKg', () => {
  it('40×30×25 cm ÷ 6000 = 5 kg', () => {
    expect(volumetricKg(40, 30, 25, 6000)).toBeCloseTo(5, 6);
  });
  it('divisor default 6000 dipakai bila kosong', () => {
    expect(volumetricKg(40, 30, 25)).toBeCloseTo(5, 6);
  });
});

describe('seaFreight', () => {
  it('minimum 0,1 diterapkan & ditandai', () => {
    const r = seaFreight({ cbm: 0.06, ratePerCbm: 3100000 });
    expect(r.billable).toBe(0.1);
    expect(r.amount).toBe(310000);
    expect(r.raisedByMinimum).toBe(true);
  });
  it('1,2 CBM × 3.100.000 = 3.720.000', () => {
    const r = seaFreight({ cbm: 1.2, ratePerCbm: 3100000 });
    expect(r.amount).toBe(3720000);
    expect(r.raisedByMinimum).toBe(false);
  });
  it('minimum berlaku per koli', () => {
    const r = seaFreight({ cbm: 0.15, ratePerCbm: 1000000, koliCount: 2 });
    expect(r.billable).toBe(0.2);
  });
});

describe('airFreight', () => {
  it('berat volumetrik menang bila lebih besar', () => {
    const r = airFreight({ weightKg: 2, dims: { p: 40, l: 30, t: 25 }, ratePerKg: 100000 });
    expect(r.volumetric).toBeCloseTo(5, 6);
    expect(r.chargeable).toBeCloseTo(5, 6);
    expect(r.winner).toBe('volumetrik');
    expect(r.amount).toBe(500000);
  });
  it('berat aktual menang bila lebih besar', () => {
    const r = airFreight({ weightKg: 9, dims: { p: 40, l: 30, t: 25 }, ratePerKg: 100000 });
    expect(r.winner).toBe('aktual');
    expect(r.amount).toBe(900000);
  });
});

describe('estimateBelanja — contoh kerja', () => {
  it('40 × ¥28, ongkir ¥45, 1,2 CBM, kurs 2.250 → Rp 6.341.250 / Rp 158.531 per unit', () => {
    const e = estimateBelanja({
      lines: [{ name: 'Produk X', qty: 40, cnyUnit: 28 }],
      kurs: 2250, ongkirCny: 45, cbm: 1.2, seaRatePerCbm: 3100000,
    });
    expect(e.goodsIdr).toBe(2520000);
    expect(e.ongkirIdr).toBe(101250);
    expect(e.freight.amount).toBe(3720000);
    expect(e.total).toBe(6341250);
    expect(e.perUnit).toBe(158531);
    expect(e.provisional).toBe(true);
  });
});
