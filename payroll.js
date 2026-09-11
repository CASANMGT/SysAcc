// payroll.js — Hitungan gaji UU Ketenagakerjaan (murni, bisa di-test).
// Referensi: BPJS Kes (PBI), BPJS TK (PP 44/2015 + PP 82/2019),
// THR (Permenaker 6/2016), PPh 21 TER bulanan (PMK 168/2023).
// Catatan: plafon & tarif bisa berubah — sesuaikan konstanta bila aturan baru keluar.

export const KES_CAP = 12000000; // plafon upah BPJS Kesehatan
export const JP_CAP = 10042000; // plafon upah Jaminan Pensiun
export const KES_COMPANY = 0.04;
export const KES_SELF = 0.01;
export const JHT_COMPANY = 0.037;
export const JHT_SELF = 0.02;
export const JP_COMPANY = 0.02;
export const JP_SELF = 0.01;
export const JKK_DEFAULT = 0.0054; // risiko sedang (0.24%–1.74% sesuai tingkat risiko)
export const JKM_COMPANY = 0.003;

// Set tarif lengkap — dipakai computeSlip, bisa dioverride per proses gaji
// (panel ⚙️ Tarif). Semua nilai pecahan (0.04 = 4%).
export const DEFAULT_RATES = {
  kesComp: KES_COMPANY, jhtComp: JHT_COMPANY, jpComp: JP_COMPANY,
  jkk: JKK_DEFAULT, jkm: JKM_COMPANY,
  kesSelf: KES_SELF, jhtSelf: JHT_SELF, jpSelf: JP_SELF,
};
export function sanitizeRates(r) {
  const out = {};
  Object.keys(DEFAULT_RATES).forEach(k => {
    const n = Number(r && r[k]);
    const valid = Number.isFinite(n) && n >= 0 && n <= (RATE_LIMITS[k] ?? 1);
    // Guard anti salah ketik: di atas batas legal tarif → kembali ke standar
    // (mis. jkk 54 berarti 54% — 300× lipat batas risiko 1,74%)
    out[k] = valid ? n : DEFAULT_RATES[k];
  });
  return out;
}
// Batas masuk akal per tarif (fraksi). Di atas ini dianggap salah ketik.
export const RATE_LIMITS = {
  kesComp: 0.05, jhtComp: 0.05, jpComp: 0.03,
  jkk: 0.0174, jkm: 0.01,
  kesSelf: 0.03, jhtSelf: 0.025, jpSelf: 0.02,
};
// JKK per karyawan: SELALU pecahan dalam batas risiko legal.
// Nilai di luar batas (mis. 0.54 gaya-persen dari data lama, atau 54)
// → fallback (tarif panel / standar). Satu-satunya pintu tarif JKK final.
export function sanitizeJkkRate(v, fallback) {
  const n = Number(v);
  const fb = Number(fallback) > 0 && Number.isFinite(Number(fallback)) ? Number(fallback) : JKK_DEFAULT;
  if (!Number.isFinite(n) || n <= 0 || n > RATE_LIMITS.jkk) return fb;
  return n;
}
// PPh 21 TER (PMK 168/2023): tarif dikenakan atas PENGHASILAN NETO bulanan.
export const BIAYA_JABATAN_RATE = 0.05; // 5% bruto
export const BIAYA_JABATAN_MAX = 500000; // maks Rp500rb/bulan
export const NPWP_SURCHARGE = 0.2; // tanpa NPWP → +20%

// ===== Rekonsiliasi Desember: tarif PROGRESIF TAHUNAN atas penghasilan neto
// setahun dikurangi PTKP. SUMBER STATUTER: UU PPh 36/2008 jo. UU HPP 7/2021.
// PERHATIAN: angka di bawah adalah tarif/PTKP per UU tersebut. JANGAN ubah
// tanpa dasar PER/UU baru. Minta konsultan pajak konfirmasi sebelum filing.
// Mekanisme Des (PMK 168/2023): TER bulanan = estimasi; Desember = hitung
// tahunan − yang sudah dipotong Jan–Nov → selisih dipotongkan di Desember.
export const ANNUAL_BRACKETS = [
  [60000000, 0.05], [250000000, 0.15], [500000000, 0.25],
  [5000000000, 0.30], [Infinity, 0.35],
];
export const BIAYA_JABATAN_MAX_ANNUAL = 6000000; // 500rb × 12
export const PTKP_ANNUAL = {
  'TK/0': 54000000, 'TK/1': 58500000, 'TK/2': 63000000, 'TK/3': 67500000,
  'K/0': 58500000, 'K/1': 63000000, 'K/2': 67500000, 'K/3': 72000000,
};
export function ptkpAnnual(ptkp) {
  const s = String(ptkp || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
  return PTKP_ANNUAL[s] ?? 54000000;
}
// PPh tahunan atas PKP (PKP dibulatkan ke bawah ribuan penuh).
export function annualPPh21(pkp) {
  let rest = Math.max(Math.floor((Number(pkp) || 0) / 1000) * 1000, 0);
  let tax = 0, prev = 0;
  for (const [cap, rate] of ANNUAL_BRACKETS) {
    if (rest <= 0) break;
    const portion = Math.min(rest, cap - prev);
    tax += portion * rate;
    rest -= portion;
    prev = cap;
  }
  return Math.round(tax);
}
// Rekonsiliasi Desember. monthsJanNov: array bulan Jan..Nov berisi
// { gross, thr, jhtSelf, jpSelf, pphPaid }. decMonth: draf Desember berisi
// { gross, thr, jhtSelf, jpSelf } (pphPaid Desember BELUM dibayar → tidak
// dihitung sebagai sudah-bayar, mencegah hitung ganda).
// Return rincian lengkap + decAdjust (dibulatkan, floor 0).
export function decRecon(emp, monthsJanNov, decMonth = {}) {
  const e = emp || {};
  const ms = Array.isArray(monthsJanNov) ? monthsJanNov : [];
  const dm = decMonth || {};
  const all = ms.concat([{ gross: dm.gross, thr: dm.thr, jhtSelf: dm.jhtSelf, jpSelf: dm.jpSelf, pphPaid: 0 }]);
  const annualGross = all.reduce((s, m) => s + (Number(m.gross) || 0) + (Number(m.thr) || 0), 0);
  const annualJhtJp = all.reduce((s, m) => s + (Number(m.jhtSelf) || 0) + (Number(m.jpSelf) || 0), 0);
  const jabatan = Math.min(Math.round(annualGross * BIAYA_JABATAN_RATE), BIAYA_JABATAN_MAX_ANNUAL);
  const netto = Math.max(annualGross - jabatan - annualJhtJp, 0);
  const ptkp = ptkpAnnual(e.ptkp);
  const pkp = Math.max(Math.floor(netto / 1000) * 1000 - ptkp, 0);
  let annualDue = annualPPh21(pkp);
  if (!e.npwp && annualDue > 0) annualDue = Math.round(annualDue * (1 + NPWP_SURCHARGE));
  const paidJanNov = ms.reduce((s, m) => s + (Number(m.pphPaid) || 0), 0);
  return {
    months: ms.length, annualGross, annualJhtJp, jabatan, netto,
    ptkp, pkp, annualDue, paidJanNov,
    decAdjust: Math.max(annualDue - paidJanNov, 0),
  };
}

// TER bulanan PMK 168/2023: [batasAtas, tarif]. Kategori dari status PTKP.
const TER_A = [
  [5400000, 0], [5650000, 0.0025], [5950000, 0.005], [6300000, 0.0075],
  [6750000, 0.01], [7500000, 0.0125], [8550000, 0.015], [9650000, 0.0175],
  [10950000, 0.02], [11200000, 0.0225], [11600000, 0.025], [12600000, 0.03],
  [13600000, 0.04], [14900000, 0.05], [16350000, 0.06], [18050000, 0.07],
  [20000000, 0.08], [24150000, 0.09], [26450000, 0.1], [28300000, 0.11],
  [30000000, 0.12], [35400000, 0.13], [45250000, 0.14], [62250000, 0.15],
  [66750000, 0.16], [88400000, 0.17], [124000000, 0.18], [229500000, 0.19],
  [Infinity, 0.2],
];
const TER_B = [
  [6200000, 0], [6450000, 0.0025], [6850000, 0.005], [7300000, 0.0075],
  [9200000, 0.01], [9600000, 0.015], [10050000, 0.02], [10350000, 0.025],
  [10700000, 0.03], [11250000, 0.04], [12050000, 0.05], [12950000, 0.06],
  [14150000, 0.07], [15850000, 0.08], [17400000, 0.09], [19350000, 0.1],
  [22300000, 0.11], [25000000, 0.12], [28000000, 0.13], [32600000, 0.14],
  [35400000, 0.15], [45250000, 0.16], [62250000, 0.17], [66750000, 0.18],
  [88400000, 0.19], [124000000, 0.2], [229500000, 0.21], [Infinity, 0.22],
];
const TER_C = [
  [6600000, 0], [6950000, 0.0025], [7450000, 0.005], [8050000, 0.0075],
  [9500000, 0.01], [9900000, 0.015], [10400000, 0.02], [10650000, 0.025],
  [11000000, 0.03], [11600000, 0.04], [12500000, 0.05], [13700000, 0.06],
  [15150000, 0.07], [16950000, 0.08], [19750000, 0.09], [22000000, 0.1],
  [24700000, 0.11], [28000000, 0.12], [32600000, 0.13], [35400000, 0.14],
  [43900000, 0.15], [62250000, 0.16], [66750000, 0.17], [88400000, 0.18],
  [124000000, 0.19], [229500000, 0.2], [Infinity, 0.21],
];

// Status PTKP → kategori TER. Tak dikenal → B (tengah, aman).
export function terCategory(ptkp) {
  const s = String(ptkp || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (['TK/0', 'TK/1', 'K/0'].includes(s)) return 'A';
  if (['TK/2', 'TK/3', 'K/1', 'K/2'].includes(s)) return 'B';
  if (['K/3'].includes(s)) return 'C';
  return 'B';
}

export function terRate(grossMonthly, category) {
  const table = category === 'A' ? TER_A : category === 'C' ? TER_C : TER_B;
  const g = Math.max(Number(grossMonthly) || 0, 0);
  for (const [cap, rate] of table) {
    if (g <= cap) return rate;
  }
  return 0;
}

function rupiah(n) {
  return Math.round(Number(n) || 0);
}

// Upah acuan iuran = gaji pokok + tunjangan tetap.
function wageBase(emp) {
  return rupiah(emp.baseSalary) + rupiah(emp.allowance);
}

// Masa kerja dalam bulan penuh s/d tanggal referensi.
export function tenureMonths(startDate, refDate) {
  const s = new Date(startDate);
  const r = refDate instanceof Date ? refDate : new Date();
  if (isNaN(s) || isNaN(r) || s > r) return 0;
  let m = (r.getFullYear() - s.getFullYear()) * 12 + (r.getMonth() - s.getMonth());
  if (r.getDate() < s.getDate()) m -= 1;
  return Math.max(m, 0);
}

// THR Permenaker 6/2016: ≥12 bln → 1× upah; <12 bln → proporsional n/12 (min 1 bln).
export function thrAmount(emp, refDate) {
  const base = wageBase(emp);
  if (base <= 0) return 0;
  const months = tenureMonths(emp.startDate, refDate);
  if (months <= 0) return 0;
  if (months >= 12) return base;
  return Math.round((base * months) / 12);
}

// Slip lengkap. opts: { overtime, bonus, deduct, thr (0/otomatis), pph (true/false), refDate,
// rates ({kesComp,jhtComp,jpComp,jkk,jkm,kesSelf,jhtSelf,jpSelf} — pecahan, opsional) }
// bonus: tambahan bulan ini (masuk bruto BPJS & PPh). deduct: potongan langsung
// (denda/absensi) — memotong take-home, TIDAK mengurangi dasar BPJS/PPh.
export function computeSlip(emp, opts = {}) {
  const e = emp || {};
  const ref = opts.refDate instanceof Date ? opts.refDate : new Date();
  const R = sanitizeRates(opts.rates);
  const base = rupiah(e.baseSalary);
  const allow = rupiah(e.allowance);
  const overtime = rupiah(opts.overtime);
  const bonus = rupiah(opts.bonus);
  const deduct = rupiah(opts.deduct);
  const gross = base + allow + overtime + bonus;
  const thr = opts.thr === 'auto' ? thrAmount(e, ref) : rupiah(opts.thr);
  const useKes = e.bpjsKes !== false;
  const useTk = e.bpjsTk !== false;
  const wage = Math.min(gross, KES_CAP);
  const wageJp = Math.min(gross, JP_CAP);
  const jkkRate = sanitizeJkkRate(e.jkkRate, R.jkk);

  const ded = { kesSelf: 0, jhtSelf: 0, jpSelf: 0, pph21: 0 };
  const comp = { kesComp: 0, jhtComp: 0, jpComp: 0, jkk: 0, jkm: 0 };
  if (useKes && gross > 0) {
    comp.kesComp = rupiah(wage * R.kesComp);
    ded.kesSelf = rupiah(wage * R.kesSelf);
  }
  if (useTk && gross > 0) {
    comp.jhtComp = rupiah(gross * R.jhtComp);
    ded.jhtSelf = rupiah(gross * R.jhtSelf);
    comp.jpComp = rupiah(wageJp * R.jpComp);
    ded.jpSelf = rupiah(wageJp * R.jpSelf);
    comp.jkk = rupiah(gross * jkkRate);
    comp.jkm = rupiah(gross * R.jkm);
  }
  // PPh 21 TER (PMK 168/2023): bruto − biaya jabatan (5%, maks 500rb) − iuran
  // JHT/JP dibayar sendiri = netto. Tarif TER dihitung atas netto.
  const jabatan = Math.min(rupiah((gross + thr) * BIAYA_JABATAN_RATE), BIAYA_JABATAN_MAX);
  const netto = Math.max(gross + thr - jabatan - ded.jhtSelf - ded.jpSelf, 0);
  if (opts.pph === true && netto > 0) {
    let pph = rupiah(netto * terRate(netto, terCategory(e.ptkp)));
    if (!e.npwp && pph > 0) pph = rupiah(pph * (1 + NPWP_SURCHARGE)); // pasal 21 tanpa NPWP
    ded.pph21 = pph;
  }
  // Override hasil rekonsiliasi Desember (dihitung via decRecon): menggantikan
  // TER bulan berjalan. Dicatat transparan lewat flag pphOverridden.
  let pphOverridden = false;
  if (Number.isFinite(Number(opts.pphOverride)) && Number(opts.pphOverride) >= 0) {
    ded.pph21 = Math.round(Number(opts.pphOverride));
    pphOverridden = true;
  }
  const totalDed = ded.kesSelf + ded.jhtSelf + ded.jpSelf + ded.pph21;
  const totalComp = comp.kesComp + comp.jhtComp + comp.jpComp + comp.jkk + comp.jkm;
  return {
    base, allow, overtime, bonus, deduct, gross, thr,
    ded, comp, totalDed, totalComp,
    rates: R,
    pphOverridden,
    takeHome: gross + thr - totalDed - deduct,
    employerCost: gross + thr + totalComp,
    tenureMonths: tenureMonths(e.startDate, ref),
    bases: { gross, kesWage: wage, jpWage: wageJp },
    pphJabatan: jabatan,
    pphNetto: netto,
  };
}
