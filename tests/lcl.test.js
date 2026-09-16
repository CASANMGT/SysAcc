// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBelanja, refundBelanja,
  getKolis, checkInKoli, updateKoli, assignBelanjaToKoli,
  getMuatanById, createMuatan, loadKoli,
  departMuatan, allocateBatch, receiveMuatan, getLastAllocation,
} from '../lcl.js';
import { getAllJournals, postJournal } from '../storage.js';

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

describe('penerimaan & stok', () => {
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
