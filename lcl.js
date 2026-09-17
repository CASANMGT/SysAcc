// lcl.js — Alur belanja LCL konsolidasi untuk importir marketplace.
// Rantai: Belanja (order marketplace) → Koli (paket di gudang China)
//         → Muatan (batch LCL) → Penerimaan (alokasi biaya mendarat).
// Uang yang sudah dibayar tapi belum sampai gudang lokal = 1211 Persediaan dalam Perjalanan.
// Saldo ke agen pembayaran = 1212 Uang Muka Agen. Selisih kurs = 5197 (SAK EMKM, modalisasi biaya).
import { assertUnlocked, postJournal, logAudit, applyStockMove, setItemStatus } from './storage.js';
import { accountForPayment } from './coa.js';

export const TRANSIT_ACCOUNT = '1211';   // Persediaan dalam Perjalanan
export const AGENT_ACCOUNT = '1212';     // dipertahankan utk data lama; tidak dipakai baru (tanpa agen)
export const FX_ACCOUNT = '5197';        // Selisih Kurs
export const INVENTORY_ACCOUNT = '1105';
export const AP_ACCOUNT = '2102';
export const MIN_CBM = 0.1;              // fakta usaha: minimum 0,1 CBM per koli, tanpa langkah pembulatan lain

const BELANJA_KEY = 'wynara_belanja';
const KOLI_KEY = 'wynara_koli';
const MUATAN_KEY = 'wynara_muatan';

function jid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
// PENTING: kunci yang berisi string "null" lolos dari `|| '[]'` (truthy) dan JSON.parse
// mengembalikan null — itulah yang dulu membuat `list.length` di nextNo meledak.
function load(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function save(key, list) {
  if (!Array.isArray(list)) throw new Error('Data tidak valid (bukan daftar) — muat ulang lalu coba lagi');
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { throw new Error('Gagal simpan data'); }
}
function num(v) { const n = Math.round(Number(v) || 0); return n > 0 ? n : 0; }
function nextNo(list, prefix) {
  const d = new Date();
  return `${prefix}-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(list.length + 1).padStart(3, '0')}`;
}

export const MARKETPLACES = [
  { id: 'taobao', label: 'Taobao' },
  { id: 'pinduoduo', label: 'Pinduoduo' },
  { id: '1688', label: '1688' },
  { id: 'other', label: 'Lainnya' },
];

// ---------- BELANJA ----------
export function getBelanjas() { return load(BELANJA_KEY); }
export function getBelanjaById(idv) { return getBelanjas().find((x) => x.id === idv) || null; }

// Satu order marketplace: bayar penuh saat buat (saldo agen / kontan).
// lines: [{name, qty, cnyUnit}]; kursAgen = Rp per ¥ sesuai agen (lebih tinggi dari kurs bank — spread jadi biaya nyata).
export function createBelanja({ date, marketplace, seller, orderNo, lines, ongkirCny, agentFee, kursAgen, payment, purpose, customerNote, chinaTracking, preorderId, draft = false, link } = {}) {
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const clean = (Array.isArray(lines) ? lines : [])
    .filter((l) => l && String(l.name || '').trim() && Number(l.qty) > 0 && Number(l.cnyUnit) >= 0)
    .map((l) => ({ ...(l.itemId ? { itemId: String(l.itemId) } : {}), name: String(l.name).trim().slice(0, 80), qty: Math.floor(Number(l.qty) || 1), cnyUnit: Number(l.cnyUnit) || 0 }));
  if (!clean.length) throw new Error('Tambahkan minimal satu barang belanja');
  const kurs = Number(kursAgen) || 0;
  if (kurs <= 0) throw new Error('Isi kurs agen (Rp per ¥)');
  const goodsCny = clean.reduce((s, l) => s + l.qty * l.cnyUnit, 0);
  const ongCny = Number(ongkirCny) || 0;
  const totalCny = goodsCny + ongCny;
  const totalIdr = Math.round(totalCny * kurs) + num(agentFee);
  const list = getBelanjas();
  const rec = {
    id: jid('BLJ'), no: nextNo(list, 'BLJ'), date: d,
    marketplace: MARKETPLACES.some((m) => m.id === marketplace) ? marketplace : 'other',
    seller: String(seller || '').trim().slice(0, 60),
    orderNo: String(orderNo || '').trim().slice(0, 40),
    lines: clean, goodsCny, ongkirCny: ongCny, totalCny,
    agentFee: num(agentFee), kursAgen: kurs, totalIdr,
    estimatedIdr: totalIdr, // §4: modal estimasi saat beli (¥ + ongkir, sebelum ongkir laut)
    payment: payment || 'transfer',
    purpose: purpose === 'stock' ? 'stock' : 'preorder',
    preorderId: String(preorderId || '').slice(0, 60) || null,
    link: String(link || '').slice(0, 300) || null,
    // draft = disimpan tanpa jurnal (kas tidak bergerak); final = sudah dijurnal.
    status: draft ? 'draft' : 'final',
    payments: [], paidIdr: 0,
    customerNote: String(customerNote || '').slice(0, 80),
    chinaTracking: String(chinaTracking || '').trim().slice(0, 40),
    koliId: null, stage: 'paid',
    createdAt: new Date().toISOString(),
  };
  if (draft) {
    // Belum ada jurnal: barang belum diakui sebagai persediaan dalam perjalanan.
    const out0 = list.concat(rec);
    save(BELANJA_KEY, out0);
    logAudit('create', 'lcl-belanja', rec.id, null, { no: rec.no, totalIdr, draft: true });
    return rec;
  }
  const j = {
    id: jid('J'), date: d, memo: `Belanja ${rec.no}${rec.seller ? ' — ' + rec.seller : ''}`,
    ref: 'lcl-belanja', refId: rec.id,
    lines: [
      { account: TRANSIT_ACCOUNT, debit: totalIdr, credit: 0, memo: 'Belanja marketplace (dalam perjalanan)' },
      { account: rec.payment === 'agent' ? AGENT_ACCOUNT : accountForPayment(rec.payment), debit: 0, credit: totalIdr, memo: rec.payment === 'agent' ? 'Pakai saldo agen' : 'Bayar belanja' },
    ],
  };
  postJournal(j);
  rec.payments = [{ id: jid('P'), date: d, amount: totalIdr, payment: rec.payment, note: 'Bayar saat simpan' }];
  rec.paidIdr = totalIdr;
  const out = list.concat(rec);
  save(BELANJA_KEY, out);
  logAudit('create', 'lcl-belanja', rec.id, null, { no: rec.no, totalIdr, totalCny });
  return rec;
}

// Sisa yang belum dibayar ke seller (draft belum berutang sampai difinalkan).
export function belanjaOutstanding(b) {
  if (!b || b.status !== 'final') return 0;
  return Math.max((Number(b.totalIdr) || 0) - (Number(b.paidIdr) || Number((b.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0)) || 0), 0);
}

// Finalkan draft: jurnal Dr 1211 / Cr kas (yang benar-benar dibayar) + Cr 2102 Hutang Supplier (sisanya).
export function finalizeBelanja(belanjaId, { date, payment, payNow } = {}) {
  const list = getBelanjas();
  const i = list.findIndex((x) => x.id === belanjaId);
  if (i < 0) throw new Error('Belanja tidak ditemukan');
  const b = list[i];
  if (b.status === 'final') throw new Error('Pembelian ini sudah disimpan final');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const total = Math.round(Number(b.totalIdr) || 0);
  const bayar = Math.min(Math.max(Math.round(Number(payNow) || 0), 0), total);
  const sisa = total - bayar;
  const cash = payment === 'agent' ? AGENT_ACCOUNT : accountForPayment(payment || 'transfer');
  const lines = [{ account: TRANSIT_ACCOUNT, debit: total, credit: 0, memo: `Belanja ${b.no}` }];
  if (bayar > 0) lines.push({ account: cash, debit: 0, credit: bayar, memo: 'Bayar belanja' });
  if (sisa > 0) lines.push({ account: AP_ACCOUNT, debit: 0, credit: sisa, memo: 'Hutang supplier (belum dibayar)' });
  postJournal({ id: jid('J'), date: d, memo: `Belanja ${b.no} (final)`, ref: 'lcl-belanja', refId: b.id, lines });
  b.status = 'final';
  b.payment = payment || 'transfer';
  if (bayar > 0) b.payments = (b.payments || []).concat({ id: jid('P'), date: d, amount: bayar, payment: b.payment, note: 'Bayar saat finalisasi' });
  b.paidIdr = (Number(b.paidIdr) || 0) + bayar;
  list[i] = b;
  save(BELANJA_KEY, list);
  logAudit('update', 'lcl-belanja', b.id, null, { final: true, bayar, sisa });
  return b;
}

// Bayar kekurangan ke seller: Dr 2102 Hutang Supplier / Cr kas.
export function payBelanja(belanjaId, { amount, date, payment, note } = {}) {
  const list = getBelanjas();
  const i = list.findIndex((x) => x.id === belanjaId);
  if (i < 0) throw new Error('Belanja tidak ditemukan');
  const b = list[i];
  if (b.status !== 'final') throw new Error('Simpan final dulu sebelum mencatat pembayaran');
  const out = belanjaOutstanding(b);
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah pembayaran harus > 0');
  if (amt > out + 0.01) throw new Error(`Melebihi sisa hutang (Rp ${Math.round(out).toLocaleString('id-ID')})`);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const cash = payment === 'agent' ? AGENT_ACCOUNT : accountForPayment(payment || 'transfer');
  postJournal({
    id: jid('J'), date: d, memo: `Bayar belanja ${b.no}${note ? ' — ' + note : ''}`, ref: 'lcl-bayar', refId: b.id,
    lines: [
      { account: AP_ACCOUNT, debit: amt, credit: 0, memo: 'Bayar hutang supplier' },
      { account: cash, debit: 0, credit: amt, memo: 'Bayar belanja' },
    ],
  });
  b.payments = (b.payments || []).concat({ id: jid('P'), date: d, amount: amt, payment: payment || 'transfer', note: String(note || '').slice(0, 80) });
  b.paidIdr = (Number(b.paidIdr) || 0) + amt;
  list[i] = b;
  save(BELANJA_KEY, list);
  logAudit('create', 'lcl-bayar', b.id, null, { amount: amt });
  return b;
}

// Refund/kembalian dari seller (dalam ¥, kurs saat refund): Dr kas/saldo agen Cr 1211;
// beda kurs dibeli vs refund → 5197 Selisih Kurs.
export function refundBelanja(idv, { date, amountCny, kursRefund, payment } = {}) {
  const list = getBelanjas();
  const i = list.findIndex((x) => x.id === idv);
  if (i < 0) throw new Error('Belanja tidak ditemukan');
  const b = list[i];
  const cny = Number(amountCny) || 0;
  if (cny <= 0) throw new Error('Jumlah refund ¥ harus > 0');
  const kr = Number(kursRefund) > 0 ? Number(kursRefund) : b.kursAgen;
  const refundIdr = Math.round(cny * kr);
  const costIdr = Math.round(cny * b.kursAgen);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const lines = [
    { account: payment === 'agent' ? AGENT_ACCOUNT : accountForPayment(payment || 'agent'), debit: refundIdr, credit: 0, memo: 'Refund seller' },
    { account: TRANSIT_ACCOUNT, debit: 0, credit: refundIdr, memo: 'Refund seller' },
  ];
  const diff = costIdr - refundIdr; // >0 = rugi kurs
  if (diff !== 0) {
    lines.push({ account: FX_ACCOUNT, debit: diff, credit: 0, memo: 'Selisih kurs refund' });
    lines.push({ account: TRANSIT_ACCOUNT, debit: 0, credit: diff, memo: 'Selisih kurs refund' });
  }
  postJournal({ id: jid('J'), date: d, memo: `Refund ${b.no}`, ref: 'lcl-refund', refId: b.id, lines });
  b.refunds = (b.refunds || []).concat({ date: d, amountCny: cny, kursRefund: kr, refundIdr, costIdr });
  list[i] = b;
  save(BELANJA_KEY, list);
  logAudit('create', 'lcl-refund', b.id, null, { refundIdr, cny });
  return b;
}

// ---------- KOLI ----------
export function getKolis() { return load(KOLI_KEY); }
export function getKoliById(idv) { return getKolis().find((x) => x.id === idv) || null; }

// Paket dicek masuk gudang China — CBM diukur DI SINI (bukan saat beli).
export function checkInKoli({ parcelNo, arrivalDate, cbm, weightKg, note } = {}) {
  const cb = Number(cbm) || 0;
  if (cb <= 0) throw new Error('CBM ukuran gudang wajib diisi (mis. 0,25)');
  const list = getKolis();
  const rec = {
    id: jid('K'), parcelNo: String(parcelNo || '').trim().slice(0, 40) || nextNo(list, 'K'),
    arrivalDate: String(arrivalDate || new Date().toISOString().split('T')[0]).slice(0, 10),
    cbm: cb, weightKg: Number(weightKg) || 0, note: String(note || '').slice(0, 80),
    belanjaIds: [], muatanId: null, deferred: false, createdAt: new Date().toISOString(),
  };
  const out = list.concat(rec);
  save(KOLI_KEY, out);
  logAudit('create', 'lcl-koli', rec.id, null, { parcelNo: rec.parcelNo, cbm: cb });
  return rec; // tanpa jurnal — hanya perubahan kondisi
}

export function updateKoli(idv, patch) {
  const list = getKolis();
  const i = list.findIndex((x) => x.id === idv);
  if (i < 0) throw new Error('Koli tidak ditemukan');
  const k = list[i];
  if (patch.cbm != null) k.cbm = Math.max(Number(patch.cbm) || 0, 0);
  if (patch.weightKg != null) k.weightKg = Math.max(Number(patch.weightKg) || 0, 0);
  if (patch.parcelNo != null) k.parcelNo = String(patch.parcelNo).trim().slice(0, 40);
  if (patch.note != null) k.note = String(patch.note).slice(0, 80);
  if (patch.deferred != null) k.deferred = !!patch.deferred;
  list[i] = k;
  save(KOLI_KEY, list);
  logAudit('update', 'lcl-koli', idv, null, patch);
  return k;
}

// Belanja masuk koli (versi ringkas: 1 belanja utuh ke 1 koli per event).
export function assignBelanjaToKoli(koliId, belanjaId) {
  const kolis = getKolis();
  const i = kolis.findIndex((x) => x.id === koliId);
  if (i < 0) throw new Error('Koli tidak ditemukan');
  const b = getBelanjaById(belanjaId);
  if (!b) throw new Error('Belanja tidak ditemukan');
  if (b.koliId && b.koliId !== koliId) throw new Error('Belanja sudah masuk koli lain');
  kolis[i].belanjaIds = (kolis[i].belanjaIds || []).concat(belanjaId);
  save(KOLI_KEY, kolis);
  const bels = getBelanjas();
  const bi = bels.findIndex((x) => x.id === belanjaId);
  if (bi >= 0) { bels[bi].koliId = koliId; bels[bi].stage = 'china'; save(BELANJA_KEY, bels); }
  logAudit('update', 'lcl-koli', koliId, null, { assign: belanjaId });
  return kolis[i];
}

// ---------- MUATAN ----------
export function getMuatans() { return load(MUATAN_KEY); }
export function getMuatanById(idv) { return getMuatans().find((x) => x.id === idv) || null; }

export function createMuatan({ code, forwarder, mode, ratePerCbm, ratePerKg, minCbm, etd, eta, charges } = {}) {
  const rate = Number(mode === 'air' ? ratePerKg : ratePerCbm) || 0;
  if (rate <= 0) throw new Error('Tarif per CBM (laut) atau per kg (udara) wajib diisi');
  const list = getMuatans();
  const rec = {
    id: jid('MUT'), code: String(code || '').trim().slice(0, 40) || nextNo(list, 'MUT'),
    forwarder: String(forwarder || '').trim().slice(0, 60),
    mode: mode === 'air' ? 'air' : 'sea',
    ratePerCbm: mode === 'air' ? 0 : Number(ratePerCbm) || 0,
    ratePerKg: mode === 'air' ? Number(ratePerKg) || 0 : 0,
    minCbm: Math.max(Number(minCbm) || 0, 0),
    etd: String(etd || '').slice(0, 10), eta: String(eta || '').slice(0, 10),
    charges: (Array.isArray(charges) ? charges : []).filter((c) => c && c.label)
      .map((c) => ({ label: String(c.label).slice(0, 40), amount: num(c.amount) })),
    koliIds: [], departed: '', arrived: '', freightBilled: 0, allocated: false,
    createdAt: new Date().toISOString(),
  };
  const out = list.concat(rec);
  save(MUATAN_KEY, out);
  logAudit('create', 'lcl-muatan', rec.id, null, { code: rec.code, rate });
  return rec;
}

export function updateMuatan(idv, patch) {
  const list = getMuatans();
  const i = list.findIndex((x) => x.id === idv);
  if (i < 0) throw new Error('Muatan tidak ditemukan');
  const m = list[i];
  for (const f of ['ratePerCbm', 'ratePerKg', 'minCbm']) if (patch[f] != null) m[f] = Math.max(Number(patch[f]) || 0, 0);
  for (const f of ['forwarder', 'etd', 'eta']) if (patch[f] != null) m[f] = String(patch[f]).slice(0, 60);
  if (patch.code) m.code = String(patch.code).trim().slice(0, 40);
  if (patch.charges) {
    m.charges = (Array.isArray(patch.charges) ? patch.charges : []).filter((c) => c && c.label)
      .map((c) => ({ label: String(c.label).slice(0, 40), amount: num(c.amount) }));
  }
  list[i] = m;
  save(MUATAN_KEY, list);
  logAudit('update', 'lcl-muatan', idv, null, patch);
  return m;
}

// Muat / bongkar koli.
export function loadKoli(muatanId, koliId) {
  const muats = getMuatans();
  const i = muats.findIndex((x) => x.id === muatanId);
  if (i < 0) throw new Error('Muatan tidak ditemukan');
  const k = getKoliById(koliId);
  if (!k) throw new Error('Koli tidak ditemukan');
  if (k.muatanId && k.muatanId !== muatanId) throw new Error('Koli sudah termuat di muatan lain');
  if (k.deferred) throw new Error('Koli ditunda — batalkan tunda dulu');
  muats[i].koliIds = (muats[i].koliIds || []).concat(koliId);
  save(MUATAN_KEY, muats);
  const kolis = getKolis();
  const ki = kolis.findIndex((x) => x.id === koliId);
  kolis[ki].muatanId = muatanId;
  save(KOLI_KEY, kolis);
  const bels = getBelanjas();
  for (const bid of (k.belanjaIds || [])) {
    const bi = bels.findIndex((x) => x.id === bid);
    if (bi >= 0) { bels[bi].stage = 'batch'; }
  }
  save(BELANJA_KEY, bels);
  logAudit('update', 'lcl-muatan', muatanId, null, { load: koliId });
  return muats[i];
}

export function unloadKoli(muatanId, koliId) {
  const muats = getMuatans();
  const i = muats.findIndex((x) => x.id === muatanId);
  if (i < 0) throw new Error('Muatan tidak ditemukan');
  muats[i].koliIds = (muats[i].koliIds || []).filter((x) => x !== koliId);
  save(MUATAN_KEY, muats);
  const kolis = getKolis();
  const ki = kolis.findIndex((x) => x.id === koliId);
  if (ki >= 0) { kolis[ki].muatanId = null; save(KOLI_KEY, kolis); }
  logAudit('update', 'lcl-muatan', muatanId, null, { unload: koliId });
  return muats[i];
}

// Muatan berangkat: tagih ongkos = chargeable CBM × tarif (+ extra batch). Dr 1211 Cr kas/hutang forwarder.
export function departMuatan(muatanId, { date, payment, delegateAp } = {}) {
  const m = getMuatanById(muatanId);
  if (!m) throw new Error('Muatan tidak ditemukan');
  if (m.freightBilled > 0) throw new Error('Muatan sudah berangkat');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const kolis = getKolis().filter((k) => (m.koliIds || []).includes(k.id) && !k.deferred);
  if (!kolis.length) throw new Error('Belum ada koli termuat');
  const alloc = allocateBatch(m, kolis);
  m.freightBilled = alloc.freightBill;
  m.chargeableCbm = alloc.chargeable;
  m.departed = d;
  const j = {
    id: jid('J'), date: d, memo: `Muatan berangkat ${m.code}`,
    ref: 'lcl-freight', refId: m.id,
    lines: [
      { account: TRANSIT_ACCOUNT, debit: alloc.batchFreight, credit: 0, memo: 'Ongkos muatan (freight + biaya lain)' },
      { account: delegateAp ? AP_ACCOUNT : accountForPayment(payment || 'cash'), debit: 0, credit: alloc.batchFreight, memo: delegateAp ? 'Hutang forwarder' : 'Bayar muatan' },
    ],
  };
  postJournal(j);
  const bels = getBelanjas();
  for (const k of kolis) for (const bid of (k.belanjaIds || [])) {
    const bi = bels.findIndex((x) => x.id === bid);
    if (bi >= 0) bels[bi].stage = 'ship';
  }
  save(BELANJA_KEY, bels);
  const list = getMuatans();
  const oi = list.findIndex((x) => x.id === muatanId);
  list[oi] = m; save(MUATAN_KEY, list);
  logAudit('update', 'lcl-muatan', muatanId, null, { departed: d, freight: alloc.batchFreight });
  return m;
}

// ---------- ALLOCATION ENGINE ----------
// Kaskade 3 tingkat: muatan → koli (bagian CBM/kg) → belanja (bagian nilai FOB) → unit.
// Pembulatan tingkat muatan: chargeable = max(ceil(total×100)/100, min total) — laut dgn batas 100g.
// Selisih pembulatan tingkat muatan diberikan ke koli terbesar (aturan residual).

// Kaskade 3 tingkat: muatan → koli (bagian CBM) → belanja (bagian nilai) → unit.
// Aturan residual: selisih pembulatan → koli dengan CBM terbesar; residu tingkat belanja →
// belanja dengan nilai FOB terbesar dalam koli tersebut.
export function allocateBatch(muatan, kolis, { basis = 'cbm', arrivedKoliIds = null, alreadyBilled = false } = {}) {
  const mode = muatan.mode === 'air' ? 'air' : 'sea';
  const loaded = kolis.filter((k) => !k.deferred && (arrivedKoliIds ? arrivedKoliIds.includes(k.id) : true));
  const deferred = kolis.filter((k) => k.deferred);
  if (!loaded.length) return { batchFreight: 0, chargeable: 0, koliAlloc: [], lineAlloc: [], deferredCount: deferred.length };

  // Udara: berat tertagih = max(kg aktual, volumetrik). 1 CBM ≈ 166,7 kg (pembagi 6000) — bisa ditimpa per muatan.
  const kgPerCbm = Number(muatan.kgPerCbm) > 0 ? Number(muatan.kgPerCbm) : 167;
  const measure = (k) => (mode === 'air' ? Math.max(k.weightKg || 0, (k.cbm || 0) * kgPerCbm) : Math.max(k.cbm || 0, MIN_CBM));
  const rawTotal = loaded.reduce((s, k) => s + measure(k), 0);
  const minChg = mode === 'air' ? 0 : (muatan.minCbm || 0);
  const chargeable = mode === 'air' ? Math.ceil(rawTotal) : Math.max(Math.ceil(rawTotal * 100) / 100, minChg);
  const rate = mode === 'air' ? (muatan.ratePerKg || 0) : (muatan.ratePerCbm || 0);
  const freightBill = alreadyBilled && muatan.freightBilled > 0 ? muatan.freightBilled : Math.round(chargeable * rate);
  const extras = (muatan.charges || []).reduce((s, c) => s + num(c.amount), 0);
  const batchFreight = freightBill + extras;

  // Tingkat 1: muatan → koli, bagian ukuran; residu → koli terbesar
  let koliAlloc = loaded.map((k) => {
    const share = rawTotal > 0 ? measure(k) / rawTotal : 0;
    return { koli: k, measure: measure(k), alloc: Math.round(share * batchFreight) };
  });
  const resid1 = batchFreight - koliAlloc.reduce((s, a) => s + a.alloc, 0);
  if (resid1 !== 0 && koliAlloc.length) {
    const biggest = koliAlloc.reduce((a, b) => (b.measure > a.measure ? b : a));
    biggest.alloc += resid1;
  }

  // Tingkat 2: koli → belanja di dalamnya, bagian nilai FOB+ongkir+fee (kurs agen koli ini)
  const belanjaMap = new Map(getBelanjas().map((b) => [b.id, b]));
  const lineAlloc = [];
  for (const a of koliAlloc) {
    const bels = (a.koli.belanjaIds || []).map((bid) => belanjaMap.get(bid)).filter(Boolean);
    if (!bels.length) continue;
    const vals = bels.map((b) => Math.max(1, b.totalIdr || (b.totalCny || 0) * b.kursAgen || 1));
    const vTot = vals.reduce((s, v) => s + v, 0);
    const parts = bels.map((b, ix) => ({ b, alloc: Math.round((vals[ix] / vTot) * a.alloc) }));
    const resid = a.alloc - parts.reduce((s, p) => s + p.alloc, 0);
    if (resid !== 0 && parts.length) {
      const bi = vals.reduce((mi, v, ix) => (v > vals[mi] ? ix : mi), 0);
      parts[bi].alloc += resid;
    }
    for (const p of parts) lineAlloc.push({ belanja: p.b, koli: a.koli, freightAlloc: p.alloc });
  }

  // Tingkat 3: belanja → satuan
  for (const la of lineAlloc) {
    const b = la.belanja;
    const kurs = b.kursAgen || 0;
    const goodsIdr = Math.round((b.goodsCny || 0) * kurs);
    const ongIdr = Math.round((b.ongkirCny || 0) * kurs);
    const feeIdr = num(b.agentFee);
    const baseCost = goodsIdr + ongIdr + feeIdr;
    const totQty = (b.lines || []).reduce((s, l) => s + l.qty, 0);
    // ongkir + fee dibagi porsi unit; barang per satuan + freight alokasi per unit
    const unitBase = totQty > 0 ? Math.round(baseCost / totQty) : 0;
    const unitFreight = la.freightAlloc && totQty > 0 ? Math.round(la.freightAlloc / totQty) : 0;
    la.unitCost = unitBase + unitFreight;
    // landedTotal = jumlah persis yang dijurnal (baseCost + alokasi freight), bukan hasil pembulatan per unit,
    // supaya laporan estimasi vs aktual cocok dengan invoice forwarder.
    const landed = baseCost + (la.freightAlloc || 0);
    la.baseCost = baseCost;
    la.goodsIdr = goodsIdr;
    la.ongIdr = ongIdr;
    la.feeIdr = feeIdr;
    la.landedTotal = landed;
    la.residual = la.freightAlloc + baseCost - landed; // residu pembulatan tingkat item
  }
  return { batchFreight, chargeable, koliAlloc, lineAlloc, deferredCount: deferred.length, freightBill };
}

// ---------- PENERIMAAN (batch tiba di gudang lokal) ----------
// Alokasi hanya atas koli yang benar-benar tiba; koli tertunda tetap duduk di 1211
// dengan biaya pra-freight-nya. Jurnal: Dr 1105 / Cr 1211 per belanja
// (baseCost + freightAlloc) — Neraca tetap balance.
export function receiveMuatan(muatanId, { date, koliIds = null } = {}) {
  const m = getMuatanById(muatanId);
  if (!m) throw new Error('Muatan tidak ditemukan');
  if (!(m.freightBilled > 0)) throw new Error('Muatan belum berangkat — record berangkat dulu');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const allKolis = getKolis().filter((k) => (m.koliIds || []).includes(k.id) && !k.deferred);
  const prev = new Set(m.arrivedKoliIds || []);
  const nowIn = (koliIds && koliIds.length ? allKolis.filter((k) => koliIds.includes(k.id)) : allKolis)
    .filter((k) => !prev.has(k.id));
  if (!nowIn.length) throw new Error('Tidak ada koli baru yang tiba');
  for (const k of nowIn) prev.add(k.id);
  const arrivedArr = allKolis.filter((k) => prev.has(k.id));
  lastAlloc = allocateBatch(m, allKolis, { arrivedKoliIds: arrivedArr.map((k) => k.id), alreadyBilled: true });

  const lines = [];
  const stockMoves = [];
  for (const la of lastAlloc.lineAlloc || []) {
    const amt = (la.baseCost || 0) + (la.freightAlloc || 0);
    if (amt <= 0) continue;
    lines.push({ account: INVENTORY_ACCOUNT, debit: amt, credit: 0, memo: `${la.belanja.no} ${la.koli.parcelNo}` });
    lines.push({ account: TRANSIT_ACCOUNT, debit: 0, credit: amt, memo: `${la.belanja.no} sampai gudang lokal` });
    // 4.4: biaya belanja → baris menurut porsi nilai barang, lalu ÷ qty → modal/pcs (weighted-average).
    const b = la.belanja;
    const goodsCny = b.goodsCny || 0;
    const totQty = (b.lines || []).reduce((s, l) => s + l.qty, 0);
    for (const l of b.lines || []) {
      if (!l.itemId) continue;
      const share = goodsCny > 0 ? (l.qty * l.cnyUnit) / goodsCny : (totQty > 0 ? l.qty / totQty : 0);
      const lineCost = Math.round(amt * share);
      stockMoves.push({ itemId: l.itemId, qty: l.qty, unitCost: l.qty > 0 ? Math.round(lineCost / l.qty) : 0 });
    }
  }
  if (lines.length) {
    postJournal({
      id: jid('J'), date: d, memo: `Terima muatan ${m.code} dari perjalanan`,
      ref: 'lcl-receive', refId: m.id, lines,
    });
    for (const sm of stockMoves) {
      try {
        applyStockMove(sm.itemId, { qtyIn: sm.qty, unitCost: sm.unitCost, ref: 'muatan', note: `muatan ${m.code}`, type: 'muatan' });
      } catch {}
      // Produk draft jadi aktif begitu barangnya benar-benar tiba.
      try { setItemStatus(sm.itemId, 'aktif'); } catch {}
    }
  }
  m.arrivedKoliIds = Array.from(prev);
  m.arrived = m.arrived || d;
  m.allocated = m.arrivedKoliIds.length >= allKolis.length;
  const list = getMuatans();
  const oi = list.findIndex((x) => x.id === muatanId);
  list[oi] = m; save(MUATAN_KEY, list);
  // belanja lines: stage 'arrived'
  const bels = getBelanjas();
  for (const k of nowIn) for (const bid of (k.belanjaIds || [])) {
    const bi = bels.findIndex((x) => x.id === bid);
    if (bi >= 0) {
      bels[bi].stage = 'arrived';
      const laA = (lastAlloc && lastAlloc.lineAlloc || []).find((z) => z.belanja.id === bid);
      if (laA) { bels[bi].landedTotal = laA.landedTotal; bels[bi].freightAlloc = laA.freightAlloc; }
    }
  }
  save(BELANJA_KEY, bels);
  //pesanan pelanggan: barang sudah di gudang lokal → tahap 'in_wh' (kirim ke pelanggan berikutnya)
  try {
    const snp = (() => { try { return JSON.parse(localStorage.getItem('wynara_preorders') || '[]'); } catch { return []; } })();
    for (const la of (lastAlloc && lastAlloc.lineAlloc) || []) {
      const pid = la.belanja.preorderId;
      if (!pid) continue;
      const pi = snp.findIndex((p) => p.id === pid);
      if (pi >= 0 && !['settled', 'cancelled', 'in_wh', 'sent', 'invoiced', 'done'].includes(snp[pi].stage)) {
        snp[pi].stage = 'in_wh';
        snp[pi].events = (snp[pi].events || []).concat([{ date: d, stage: 'received', note: `Muatan ${m.code} tiba — biaya mendarat diposting`, tracking: '', schedule: '' }]);
      }
    }
    try { localStorage.setItem('wynara_preorders', JSON.stringify(snp)); } catch {}
  } catch {}
  logAudit('update', 'lcl-muatan', muatanId, null, { received: nowIn.map((k) => k.id) });
  return m;
}

// ---------- Migrasi data lama: Titip Beli → Belanja/Koli/Muatan (Stage 7, idempoten) ----------
// Paket lama hanya punya daftar biaya di pesanan. Kita bentuk Belanja (barang + ongkir + lain),
// bungkus jadi Koli (CBM perkiraan minimum 0,1) dan Muatan bertanda legacy agar TIDAK memposting
// jurnal lagi (biaya historis sudah dijurnal) — riwayat tetap membawa biayanya.
export function migrateLegacyTitipBeli() {
  let changed = 0;
  let pos = [];
  try { const v = JSON.parse(localStorage.getItem('wynara_preorders') || '[]'); pos = Array.isArray(v) ? v : []; } catch { return { migrated: 0 }; }
  const bels = getBelanjas();
  const kolis = getKolis();
  const muats = getMuatans();
  let dirtyB = false, dirtyK = false, dirtyM = false;
  pos.forEach((po) => {
    if (!po || po.lclMigrated) return;
    const costs = Array.isArray(po.costs) ? po.costs : [];
    if (!costs.length) return;
    const barang = costs.filter((c) => c.kind === 'barang').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const kirim = costs.filter((c) => c.kind === 'kirim').reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const lain = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0) - barang - kirim;
    const kurs = Number(po.fx) || 2300;
    const lines = (po.items || []).map((l) => ({ name: l.name, qty: l.qty, cnyUnit: kurs > 0 ? Math.round(((Number(l.price) || 0) * l.qty) / kurs / Math.max(l.qty, 1)) : 0 }));
    const b = {
      id: jid('BLJ'), no: `BLJ-LEGACY-${String(pos.indexOf(po) + 1).padStart(3, '0')}`, date: po.date || '',
      marketplace: 'other', seller: 'Migrasi data lama', orderNo: po.no || '', lines,
      goodsCny: lines.reduce((s, l) => s + l.qty * l.cnyUnit, 0), ongkirCny: 0,
      totalCny: lines.reduce((s, l) => s + l.qty * l.cnyUnit, 0),
      agentFee: Math.round(lain), kursAgen: kurs, totalIdr: Math.round(barang + kirim + lain),
      payment: 'transfer', purpose: po.target === 'stock' ? 'stock' : 'preorder', preorderId: po.id,
      customerNote: '', chinaTracking: '', koliId: null, stage: 'arrived',
      landedTotal: Math.round(barang + kirim + lain), legacy: true, note: 'Migrasi otomatis dari Titip Beli',
      createdAt: new Date().toISOString(),
    };
    const k = {
      id: jid('K'), parcelNo: `K-LEGACY-${String(pos.indexOf(po) + 1).padStart(3, '0')}`,
      arrivalDate: po.date || '', cbm: MIN_CBM, weightKg: 0,
      note: 'Perkiraan migrasi — CBM asli tidak tercatat', belanjaIds: [b.id], muatanId: null, deferred: false,
      legacy: true, createdAt: new Date().toISOString(),
    };
    const m = {
      id: jid('MUT'), code: `MUT-LEGACY-${String(pos.indexOf(po) + 1).padStart(3, '0')}`,
      forwarder: 'Migrasi data lama', mode: 'sea', ratePerCbm: 0, ratePerKg: 0, minCbm: MIN_CBM,
      etd: '', eta: '', charges: [], koliIds: [k.id], departed: po.date || '', arrived: po.date || '',
      freightBilled: 0, allocated: true, arrivedKoliIds: [k.id], legacy: true, createdAt: new Date().toISOString(),
    };
    k.muatanId = m.id;
    bels.push(b); kolis.push(k); muats.push(m);
    dirtyB = dirtyK = dirtyM = true;
    po.lclMigrated = true;
    po.events = (po.events || []).concat([{ date: new Date().toISOString().split('T')[0], stage: 'migrated', note: 'Data biaya dipindah ke Papan Muatan (Belanja/Koli/Muatan)', tracking: '', schedule: '' }]);
    changed++;
  });
  if (dirtyB) save(BELANJA_KEY, bels);
  if (dirtyK) save(KOLI_KEY, kolis);
  if (dirtyM) save(MUATAN_KEY, muats);
  if (changed) {
    try { localStorage.setItem('wynara_preorders', JSON.stringify(pos)); } catch {}
    logAudit('create', 'lcl-migrate', 'legacy', null, { migrated: changed });
  }
  return { migrated: changed };
}

// §5.3 Exceptions: kurang kirim · rusak · hilang di perjalanan.
// Barang tidak sampai utuh → bagian yang hilang TIDAK boleh jadi persediaan.
// Jurnal: Dr 5199 Beban Lainnya / Cr 1211 Persediaan dalam Perjalanan (atau 1105 bila sudah diterima).
export function markBelanjaLoss(belanjaId, { type = 'short', amount = 0, qty = 0, date, note } = {}) {
  const list = getBelanjas();
  const i = list.findIndex((x) => x.id === belanjaId);
  if (i < 0) throw new Error('Belanja tidak ditemukan');
  const b = list[i];
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Nilai kerugian harus > 0');
  const kind = ['short', 'damaged', 'lost'].includes(type) ? type : 'short';
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const arrived = b.landedTotal != null;
  const label = kind === 'short' ? 'Kurang kirim' : kind === 'damaged' ? 'Rusak' : 'Hilang di perjalanan';
  const q = Math.max(Math.floor(Number(qty) || 0), 0);
  postJournal({
    id: jid('J'), date: d, memo: `${label} ${b.no}${note ? ' — ' + note : ''}`,
    ref: 'lcl-loss', refId: b.id,
    lines: [
      { account: '5199', debit: amt, credit: 0, memo: `${label} (barang tidak masuk)` },
      { account: arrived ? INVENTORY_ACCOUNT : TRANSIT_ACCOUNT, debit: 0, credit: amt, memo: label },
    ],
  });
  b.losses = (b.losses || []).concat({ date: d, type: kind, amount: amt, qty: q, note: String(note || '').slice(0, 80) });
  if (arrived) b.landedTotal = Math.max((Number(b.landedTotal) || 0) - amt, 0);
  // KEPUTUSAN: kurang kirim/rusak/hilang pada pesanan pelanggan otomatis MENGURANGI nilai jual pesanan
  // (dan karena itu piutang/sisa tagihannya), supaya pelanggan tidak ditagih barang yang tak pernah datang.
  if (q > 0 && b.preorderId) {
    try {
      const pos = (() => { const v = JSON.parse(localStorage.getItem('wynara_preorders') || '[]'); return Array.isArray(v) ? v : []; })();
      const pi = pos.findIndex((p) => p.id === b.preorderId);
      if (pi >= 0) {
        const po = pos[pi];
        const lostNames = (b.lines || []).map((l) => String(l.name).toLowerCase());
        let cut = q;
        po.items = (po.items || []).map((l) => {
          if (cut <= 0 || !lostNames.includes(String(l.name).toLowerCase())) return l;
          const take = Math.min(cut, Number(l.qty) || 0);
          cut -= take;
          return { ...l, qty: Math.max((Number(l.qty) || 0) - take, 0) };
        }).filter((l) => (Number(l.qty) || 0) > 0);
        const sub = (po.items || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
        po.subtotal = sub;
        po.sellTotal = Math.max(sub - (Number(po.discount) || 0), 0);
        po.events = (po.events || []).concat([{ date: d, stage: po.stage, note: `${label} ${q} pcs — nilai pesanan disesuaikan ke ${'Rp' + Math.round(po.sellTotal).toLocaleString('id-ID')}`, tracking: '', schedule: '' }]);
        pos[pi] = po;
        try { localStorage.setItem('wynara_preorders', JSON.stringify(pos)); } catch {}
        logAudit('update', 'preorder', po.id, null, { shortShipment: q, sellTotal: po.sellTotal });
      }
    } catch {}
  }
  // Kuantitas produk ikut dikurangi bila baris terkait produk.
  if (q > 0) {
    const totQty = (b.lines || []).reduce((s, l) => s + l.qty, 0);
    for (const l of b.lines || []) {
      if (!l.itemId || !totQty) continue;
      const cut = Math.min(Math.round((l.qty / totQty) * q), l.qty);
      if (cut > 0) {
        l.qty -= cut;
        try { applyStockMove(l.itemId, { qtyOut: cut, ref: 'loss', note: `${label} ${b.no}`, type: 'loss' }); } catch {}
      }
    }
  }
  list[i] = b;
  save(BELANJA_KEY, list);
  logAudit('update', 'lcl-loss', b.id, null, { type: kind, amount: amt, qty: q });
  return b;
}

// Ditolak pelanggan SEBELUM pendapatan diakui (belum lunas/selesai): barang balik ke stok, tanpa jurnal pendapatan.
// Bila pesanan sudah selesai (pendapatan & HPP sudah diakui), arahkan ke retur penjualan, jangan dibalik di sini.
export function refusePreorder(poId, { date, note } = {}) {
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const list = (() => { try { const v = JSON.parse(localStorage.getItem('wynara_preorders') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })();
  const i = list.findIndex((p) => p.id === poId);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (po.stage === 'settled') throw new Error('Pesanan sudah selesai — catat lewat retur penjualan agar pendapatan & HPP dibalik dengan benar');
  // Barang yang sudah di gudang lokal dikembalikan ke stok untuk dijual lagi.
  const bels = getBelanjas();
  for (const b of bels.filter((x) => x.preorderId === poId)) {
    for (const l of b.lines || []) {
      if (!l.itemId) continue;
      try { applyStockMove(l.itemId, { qtyIn: Math.max(l.qty, 0), ref: 'refuse', note: `Ditolak pelanggan ${po.no}`, type: 'refuse' }); } catch {}
    }
  }
  po.stage = 'cancelled';
  po.events = (po.events || []).concat([{ date: d, stage: 'cancelled', note: `Ditolak pelanggan${note ? ' — ' + note : ''}`, tracking: '', schedule: '' }]);
  list[i] = po;
  try { localStorage.setItem('wynara_preorders', JSON.stringify(list)); } catch {}
  logAudit('update', 'preorder', poId, null, { stage: 'cancelled', reason: 'ditolak pelanggan' });
  return po;
}

export let lastAlloc = null;
export function getLastAllocation() { return lastAlloc; }

// ---------- Tautan belanja ↔ pesanan pelanggan ----------
export function belanjasForPreorder(poId) {
  return getBelanjas().filter((b) => b.preorderId === poId);
}
// Total biaya mendarat untuk pesanan pelanggan (alokasi bila muatan sudah tiba, else biaya dasar).
export function preorderLandedTotal(poId) {
  const base = belanjasForPreorder(poId).reduce((s, b) => s + (b.landedTotal != null ? b.landedTotal : b.totalIdr || 0), 0);
  // Biaya kirim ke pelanggan yang ditanggung perusahaan ikut jadi bagian biaya pesanan (margin nyata).
  let delivery = 0;
  try {
    const pos = JSON.parse(localStorage.getItem('wynara_preorders') || '[]');
    const po = Array.isArray(pos) ? pos.find((p) => p.id === poId) : null;
    delivery = Number(po && po.deliveryCostIdr) || 0;
  } catch {}
  return base + delivery;
}
// Sudah dibeli untuk satu pesanan (semua status belanja, termasuk draft) → untuk peringatan beli berlebih.
export function purchasedQtyFor(orderId, itemId = null, name = null) {
  return getBelanjas().filter((b) => b.preorderId === orderId)
    .flatMap((b) => b.lines || [])
    .filter((l) => (itemId ? l.itemId === itemId : (name ? String(l.name).toLowerCase() === String(name).toLowerCase() : true)))
    .reduce((a, l) => a + (Number(l.qty) || 0), 0);
}
// Sisa yang masih perlu dibeli untuk sebuah pesanan (dipesan − sudah dibeli).
export function toBuyLinesFor(order) {
  return ((order && order.items) || []).map((l) => {
    const ordered = Number(l.qty) || 0;
    const bought = purchasedQtyFor(order.id, l.itemId || null, l.name);
    return { itemId: l.itemId || '', name: l.name, ordered, bought, remaining: Math.max(ordered - bought, 0), price: Number(l.price) || 0 };
  });
}

// §4 Selisih estimasi vs aktual per belanja: aktual = biaya mendarat hasil alokasi.
export function costVariance(belanja) {
  const est = Number(belanja && belanja.estimatedIdr) || 0;
  const act = Number(belanja && belanja.landedTotal) || 0;
  if (!est || !act) return { estimated: est, actual: act, diff: 0, pct: 0, ready: false };
  const diff = act - est;
  return { estimated: est, actual: act, diff, pct: est > 0 ? diff / est : 0, ready: true };
}

// Total biaya belanja marketplace untuk satu pesanan pelanggan (dikurangi refund).
export function preorderLclCost(poId) {
  return belanjasForPreorder(poId).reduce((s, b) => {
    const refunds = (b.refunds || []).reduce((r, f) => r + (f.refundIdr || 0), 0);
    return s + Math.max((b.totalIdr || 0) - refunds, 0);
  }, 0);
}
// Margin nyata: harga jual − biaya mendarat. Angka terpenting utk bisnis ini.
export function preorderRealisedMargin(po) {
  if (!po) return { sell: 0, landed: 0, margin: 0, pct: 0 };
  const sell = po.sellTotal != null ? po.sellTotal : (po.items || []).reduce((s, l) => s + l.qty * l.price, 0);
  const landed = preorderLandedTotal(po.id) || StoragePreorderGoods(po);
  const margin = sell - landed;
  return { sell, landed, margin, pct: sell > 0 ? margin / sell : 0 };
}
function StoragePreorderGoods(po) { return ((po && po.costs) || []).filter((c) => c.kind === 'barang').reduce((s, c) => s + c.amount, 0); }
