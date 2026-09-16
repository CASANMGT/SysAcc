// freight.js — kalkulator ongkos impor (laut LCL per CBM, udara per kg tertagih).
// Semua nilai dihitung; tidak ada CBM/berat tertagih yang diketik manual.
export const IMPOR_DEFAULTS = {
  kurs: 2250,          // Rp per ¥
  ratePerCbm: 3100000, // laut, Rp per CBM
  ratePerKg: 0,        // udara, Rp per kg (0 = belum diatur)
  divisor: 6000,       // pembagi berat volumetrik udara
  minCbm: 0.1,         // minimum CBM per koli
};

const n0 = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// CBM dari dimensi cm. qtyCarton default 1.
export function cbmFromDims(p, l, t, qtyCarton = 1) {
  const P = n0(p), L = n0(l), T = n0(t), q = n0(qtyCarton) || 0;
  if (!P || !L || !T) return 0;
  return (P * L * T * q) / 1000000;
}

// Berat volumetrik udara (kg) dari dimensi cm.
export function volumetricKg(p, l, t, divisor = IMPOR_DEFAULTS.divisor, qtyCarton = 1) {
  const d = n0(divisor) || IMPOR_DEFAULTS.divisor;
  const P = n0(p), L = n0(l), T = n0(t), q = n0(qtyCarton) || 0;
  if (!P || !L || !T) return 0;
  return (P * L * T * q) / d;
}

// Laut: billable = max(CBM, minCbm) per koli. Flag bila minimum menaikkan tagihan.
export function seaFreight({ cbm = 0, ratePerCbm = 0, minCbm = IMPOR_DEFAULTS.minCbm, koliCount = 1 } = {}) {
  const measured = n0(cbm);
  const min = n0(minCbm);
  const kolis = Math.max(Math.floor(n0(koliCount) || 1), 1);
  const billable = Math.max(measured, min * kolis);
  const rounded = Math.ceil(billable * 100) / 100;
  return {
    measured, billable: rounded, rate: n0(ratePerCbm),
    amount: Math.round(rounded * n0(ratePerCbm)),
    raisedByMinimum: rounded > measured + 1e-9,
  };
}

// Udara: berat tertagih = max(berat aktual, berat volumetrik); tandai pemenangnya.
export function airFreight({ weightKg = 0, dims = null, divisor = IMPOR_DEFAULTS.divisor, ratePerKg = 0, lines = null } = {}) {
  const actual = n0(weightKg);
  let vol = 0;
  if (Array.isArray(lines) && lines.length) {
    vol = lines.reduce((s, x) => s + volumetricKg(x.p, x.l, x.t, divisor, x.qty), 0);
  } else if (dims) {
    vol = volumetricKg(dims.p, dims.l, dims.t, divisor, dims.qty || 1);
  }
  const chargeable = Math.max(actual, vol);
  const winner = vol > actual ? 'volumetrik' : 'aktual';
  return { actual, volumetric: vol, chargeable, winner, rate: n0(ratePerKg), amount: Math.round(chargeable * n0(ratePerKg)) };
}

// Estimasi satu Belanja: barang + ongkir China + estimasi ongkir (laut/udara).
// Selalu diberi label estimasi — angka final muncul saat muatan tiba.
export function estimateBelanja({
  lines = [], kurs = IMPOR_DEFAULTS.kurs, ongkirCny = 0, cbm = 0, koliCount = 1,
  seaRatePerCbm = IMPOR_DEFAULTS.ratePerCbm, airRatePerKg = IMPOR_DEFAULTS.ratePerKg,
  divisor = IMPOR_DEFAULTS.divisor, minCbm = IMPOR_DEFAULTS.minCbm, mode = 'sea',
} = {}) {
  const k = n0(kurs) || IMPOR_DEFAULTS.kurs;
  const goodsCny = (Array.isArray(lines) ? lines : []).reduce((s, l) => s + (n0(l.qty) || 0) * (Number(l.cnyUnit) || 0), 0);
  const qty = (Array.isArray(lines) ? lines : []).reduce((s, l) => s + (Math.floor(n0(l.qty)) || 0), 0);
  const goodsIdr = Math.round(goodsCny * k);
  const ongkirIdr = Math.round((Number(ongkirCny) || 0) * k);
  const freight = mode === 'air'
    ? airFreight({ weightKg: 0, ratePerKg: airRatePerKg, divisor, lines: null })
    : seaFreight({ cbm, ratePerCbm: seaRatePerCbm, minCbm, koliCount });
  const total = goodsIdr + ongkirIdr + freight.amount;
  return {
    mode, kurs: k, goodsCny, goodsIdr, ongkirCny: Number(ongkirCny) || 0, ongkirIdr,
    freight, total, qty, perUnit: qty > 0 ? Math.round(total / qty) : 0,
    provisional: true,
  };
}
