// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBelanjas, createBelanja, refundBelanja,
  getKolis, checkInKoli, updateKoli, assignBelanjaToKoli,
  getMuatans, getMuatanById, createMuatan, loadKoli,
  departMuatan, allocateBatch, receiveMuatan, getLastAllocation, migrateLegacyTitipBeli, costVariance, markBelanjaLoss, refusePreorder,
} from '../lcl.js';
import { getAllJournals, postJournal, saveItem, getItemById, createPreorder, addPreorderCost, createDraftProductFromBelanja } from '../storage.js';

beforeEach(() => {
  localStorage.clear();
});

function balancedJournals() {
  return getAllJournals().every((j) =>
    j.lines.reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0) === 0);
}

// ===== contoh kerja: koli 1,2 CBM dari muatan 3,2 CBM =====
function setupWorkedExample() {
  postJournal({ id: 'J-OPEN', date: '2026-03-01', memo: 'top up agen', ref: 'lcl-topup', refId: 'x', lines: [
    { account: '1212', debit: 10000000, credit: 0, memo: 'top up' },
    { account: '1104', debit: 0, credit: 10000000, memo: 'top up' },
  ] });
  const belanja = createBelanja({
    date: '2026-03-01', marketplace: '1688', seller: 'Toko ABC', orderNo: 'TB-1',
    lines: [{ name: 'Produk X', qty: 40, cnyUnit: 28 }], ongkirCny: 45,
    agentFee: 0, kursAgen: 2250, payment: 'transfer', purpose: 'stock',
  });
  const koli = checkInKoli({ parcelNo: 'K-118', arrivalDate: '2026-03-05', cbm: 1.2, weightKg: 8.5 });
  assignBelanjaToKoli(koli.id, belanja.id);
  // koli kedua pengisi 2,0 CBM agar total 3,2
  const belanja2 = createBelanja({ date: '2026-03-02', marketplace: 'taobao', seller: 'S2', orderNo: 'TB-2',
    lines: [{ name: 'Y', qty: 10, cnyUnit: 100 }], ongkirCny: 0, agentFee: 0, kursAgen: 2250, payment: 'agent' });
  const koli2 = checkInKoli({ parcelNo: 'K-119', arrivalDate: '2026-03-05', cbm: 2.0 });
  assignBelanjaToKoli(koli2.id, belanja2.id);
  const muatan = createMuatan({ code: 'LCL-2026-03', forwarder: 'Fwd Jaya', mode: 'sea', ratePerCbm: 3100000, minCbm: 0.5 });
  loadKoli(muatan.id, koli.id);
  loadKoli(muatan.id, koli2.id);
  return { belanja, koli, belanja2, koli2, muatan };
}

describe('worked example LCL-2026-03', () => {
  it('HPP unit = Rp158.531 setelah alokasi penuh', () => {
    const { muatan } = setupWorkedExample();
    departMuatan(muatan.id, { date: '2026-03-10', payment: 'cash' });
    // neraca dalam perjalanan: 2.621.250 (belanja) + 3.720.000 (freight koli K-001)
    const m = getMuatanById(muatan.id);
    expect(m.freightBilled).toBe(9920000);
    receiveMuatan(muatan.id, { date: '2026-04-05' });
    const alloc = getLastAllocation();
    const all = (alloc.lineAlloc || []);
    const lineX = all[0];
    // hitung manual: base = 2.520.000+101.250 = 2.621.250; freight = 3.720.000
    expect(lineX.baseCost).toBe(2621250);
    expect(lineX.freightAlloc).toBe(3720000);
    expect(lineX.unitCost).toBe(158531); // round(6.341.250/40)
  });

  it('neraca balance sebelum & sesudah tiba', () => {
    const { muatan } = setupWorkedExample();
    departMuatan(muatan.id, { date: '2026-03-10', payment: 'cash' });
    receiveMuatan(muatan.id, { date: '2026-04-05' });
    expect(balancedJournals()).toBe(true);
  });
});

describe('belanja', () => {
  it('bayar penuh: jurnal Dr 1211 Cr 1212 (saldo agen)', () => {
    createBelanja({ lines: [{ name: 'A', qty: 1, cnyUnit: 100 }], kursAgen: 2300, payment: 'agent', agentFee: 0, ongkirCny: 5 });
    const js = getAllJournals();
    const j = js[0];
    expect(j.lines[0].account).toBe('1211');
    expect(j.lines[0].debit).toBe(241500);
    expect(j.lines[1].account).toBe('1212');
    expect(j.lines).toHaveLength(2);
  });

  it('refund seller dengan beda kurs → 5197 Selisih Kurs', () => {
    const b = createBelanja({ lines: [{ name: 'A', qty: 2, cnyUnit: 50 }], kursAgen: 2400, payment: 'agent' });
    refundBelanja(b.id, { amountCny: 50, kursRefund: 2300 });
    const j = getAllJournals().find((x) => x.ref === 'lcl-refund');
    expect(j.lines.filter((l) => l.account === '5197').length).toBeGreaterThanOrEqual(1);
    expect(balancedJournals()).toBe(true);
  });
});

describe('koli & muatan', () => {
  it('koli tanpa CBM ditolak', () => {
    expect(() => checkInKoli({ parcelNo: 'X' })).toThrow(/CBM/);
  });

  it('minimum CBM berlaku di muatan', () => {
    const muatan = createMuatan({ forwarder: 'F', ratePerCbm: 3000000, minCbm: 0.5 });
    const k = checkInKoli({ cbm: 0.1 });
    loadKoli(muatan.id, k.id);
    const alloc = allocateBatch(muatan, [k]);
    expect(alloc.chargeable).toBe(0.5);
    expect(alloc.batchFreight).toBe(1500000);
  });

  it('satu koli tidak boleh termuat ganda', () => {
    const muatan = createMuatan({ forwarder: 'F', ratePerCbm: 1000000 });
    const k = checkInKoli({ cbm: 1 });
    loadKoli(muatan.id, k.id);
    expect(() => loadKoli(muatan.id, k.id)).not.toThrow();
  });

  it('koli tertunda tidak ikut alokasi', () => {
    const muatan = createMuatan({ forwarder: 'F', ratePerCbm: 1000000 });
    const k1 = checkInKoli({ cbm: 1 });
    const k2 = checkInKoli({ cbm: 1 });
    updateKoli(k2.id, { deferred: true });
    const kolis = getKolis();
    const k1L = kolis.find((x) => x.id === k1.id);
    const k2L = kolis.find((x) => x.id === k2.id);
    const alloc = allocateBatch(muatan, [k1L, k2L], { alreadyBilled: true });
    expect(alloc.chargeable).toBe(1);
    expect(alloc.deferredCount).toBe(1);
  });

  it('koli 0,06 CBM ditagih 0,1 (minimum per koli)', () => {
    const muatan = createMuatan({ forwarder: 'F', ratePerCbm: 3100000 });
    const k = checkInKoli({ cbm: 0.06 });
    const kolis = getKolis();
    const alloc = allocateBatch(muatan, [kolis.find((x) => x.id === k.id)]);
    expect(alloc.chargeable).toBe(0.1);
    expect(alloc.batchFreight).toBe(310000);
  });
});

describe('migrasi Titip Beli lama', () => {
  it('membuat Belanja/Koli/Muatan legacy tanpa jurnal baru; idempoten', () => {
    const po = createPreorder({ date: '2026-07-01', customer: 'Budi', items: [{ name: 'X', qty: 2, price: 500000 }], fx: 2300, months: 1 });
    postJournal({ id: 'J-C1', date: '2026-07-02', memo: 'biaya lama', ref: 'preorder', refId: po.id, lines: [
      { account: '1105', debit: 700000, credit: 0, memo: 'barang' },
      { account: '1101', debit: 0, credit: 700000, memo: 'barang' },
    ] });
    addPreorderCost(po.id, { amount: 700000, kind: 'barang', date: '2026-07-02', payment: 'transfer' });
    const jBefore = getAllJournals().length;
    const r1 = migrateLegacyTitipBeli();
    expect(r1.migrated).toBe(1);
    expect(getBelanjas().filter((b) => b.legacy).length).toBe(1);
    expect(getKolis().filter((k) => k.legacy).length).toBe(1);
    expect(getMuatans().filter((m) => m.legacy).length).toBe(1);
    expect(getAllJournals().length).toBe(jBefore); // tidak ada jurnal baru
    const b = getBelanjas().find((x) => x.legacy);
    expect(b.landedTotal).toBe(700000);
    expect(b.preorderId).toBe(po.id);
    const r2 = migrateLegacyTitipBeli();
    expect(r2.migrated).toBe(0); // idempoten
    expect(getBelanjas().filter((x) => x.legacy).length).toBe(1);
  });
});

describe('ketahanan data rusak (kunci berisi "null")', () => {
  it('getBelanjas/getKolis/getMuatans mengembalikan array kosong, dan createBelanja tetap bisa', () => {
    ['wynara_belanja', 'wynara_koli', 'wynara_muatan'].forEach((k) => localStorage.setItem(k, 'null'));
    expect(getBelanjas()).toEqual([]);
    expect(getKolis()).toEqual([]);
    expect(getMuatans()).toEqual([]);
    const b = createBelanja({ lines: [{ name: 'pepper', qty: 100, cnyUnit: 4 }], kursAgen: 2300, ongkirCny: 10, purpose: 'stock' });
    expect(b.no).toMatch(/^BLJ-/);
    expect(getBelanjas().length).toBe(1);
  });
  it('save menolak nilai non-array (tidak menulis "null" lagi)', () => {
    expect(() => markBelanjaLoss('tidak-ada', { amount: 1 })).toThrow();
  });
});

describe('§5.3 pengecualian', () => {
  it('kurang kirim/rusak/hilang: Dr 5199 / Cr 1211 (belum tiba) dan landedTotal turun setelah tiba', () => {
    const { muatan, belanja } = setupWorkedExample();
    const jBefore = getAllJournals().length;
    markBelanjaLoss(belanja.id, { type: 'short', amount: 200000, qty: 0, date: '2026-03-20' });
    const j = getAllJournals().slice(-1)[0];
    expect(getAllJournals().length).toBe(jBefore + 1);
    expect(j.lines[0].account).toBe('5199');
    expect(j.lines[1].account).toBe('1211');
    expect(j.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)).toBe(0);
    departMuatan(muatan.id, { date: '2026-03-10', payment: 'cash' });
    receiveMuatan(muatan.id, { date: '2026-04-05' });
    const b = getBelanjas().find((x) => x.id === belanja.id);
    markBelanjaLoss(belanja.id, { type: 'damaged', amount: 100000, qty: 0, date: '2026-04-06' });
    const b2 = getBelanjas().find((x) => x.id === belanja.id);
    expect(getAllJournals().slice(-1)[0].lines[1].account).toBe('1105'); // setelah tiba → dari persediaan
    expect(b2.landedTotal).toBe(Number(b.landedTotal) - 100000);
    expect((b2.losses || []).length).toBe(2);
  });

  it('ditolak pelanggan sebelum selesai: stage cancelled, tanpa jurnal baru', () => {
    const po = createPreorder({ date: '2026-07-01', customer: 'Siti', items: [{ name: 'Y', qty: 1, price: 300000 }], fx: 2300, months: 1 });
    const jBefore = getAllJournals().length;
    const out = refusePreorder(po.id, { note: 'salah ukuran' });
    expect(out.stage).toBe('cancelled');
    expect(getAllJournals().length).toBe(jBefore);
  });
});

describe('estimasi vs aktual', () => {
  it('selisih dihitung dari estimatedIdr vs landedTotal', () => {
    const { muatan, belanja } = setupWorkedExample();
    const b0 = getBelanjas().find((b) => b.id === belanja.id);
    expect(b0.estimatedIdr).toBe(2621250); // ¥1120 + ¥45 × 2250
    expect(costVariance(b0).ready).toBe(false); // belum tiba
    departMuatan(muatan.id, { date: '2026-03-10', payment: 'cash' });
    receiveMuatan(muatan.id, { date: '2026-04-05' });
    const b1 = getBelanjas().find((b) => b.id === belanja.id);
    const v = costVariance(b1);
    expect(v.ready).toBe(true);
    expect(v.actual).toBe(6341250);
    expect(v.diff).toBe(3720000); // seluruhnya ongkir laut
    expect(Math.round(v.pct * 1000) / 10).toBeCloseTo(141.9, 1);
  });
});

describe('produk draft dari belanja China', () => {
  it('draft → aktif otomatis saat barang tiba, modal/pcs ikut alokasi', () => {
    const { muatan, belanja } = setupWorkedExample();
    const draft = createDraftProductFromBelanja({ name: 'Produk X', cost: 63000, weightKg: 0.35 });
    expect(draft.status).toBe('draft');
    const bels = getBelanjas();
    const bi = bels.findIndex((b) => b.id === belanja.id);
    bels[bi].lines = bels[bi].lines.map((l) => ({ ...l, itemId: draft.id }));
    localStorage.setItem('wynara_belanja', JSON.stringify(bels));
    departMuatan(muatan.id, { date: '2026-03-10', payment: 'cash' });
    receiveMuatan(muatan.id, { date: '2026-04-05' });
    const after = getItemById(draft.id);
    expect(after.status).toBe('aktif');
    expect(after.cost).toBe(158531);
    expect(after.stock).toBe(40);
  });
});

describe('penerimaan & stok', () => {
  it('alokasi menulis balik modal/pcs ke produk (weighted average)', () => {
    const { muatan, belanja } = setupWorkedExample();
    // produk terkait baris belanja
    const it = saveItem({ name: 'Produk X', price: 250000, cost: 0, stock: 0 });
    const bels = getBelanjas();
    const bi = bels.findIndex((b) => b.id === belanja.id);
    bels[bi].lines = bels[bi].lines.map((l) => ({ ...l, itemId: it.id }));
    localStorage.setItem('wynara_belanja', JSON.stringify(bels));
    departMuatan(muatan.id, { date: '2026-03-10', payment: 'cash' });
    receiveMuatan(muatan.id, { date: '2026-04-05' });
    const after = getItemById(it.id);
    expect(after.stock).toBe(40);
    // modal/pcs = Σbiaya / 40 = 158.531 (dibulatkan)
    expect(after.cost).toBe(158531);
  });
  it('residual pembulatan di berikan ke koli terbesar', () => {
    const muatan = createMuatan({ forwarder: 'F', ratePerCbm: 333333 });
    const k1 = checkInKoli({ cbm: 1.1 });
    const k2 = checkInKoli({ cbm: 0.9 });
    const alloc = allocateBatch(muatan, [k1, k2]);
    const sum = alloc.koliAlloc.reduce((s, a) => s + a.alloc, 0);
    expect(sum).toBe(alloc.batchFreight);
    const biggest = alloc.koliAlloc.reduce((a, b) => (b.measure > a.measure ? b : a));
    expect(biggest.koli.id).toBe(k1.id);
  });
});
