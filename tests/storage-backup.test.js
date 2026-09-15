// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { validateBackupJSON, importEntries, getAllEntries, clearAllEntries, createEntry, createLoan, addRepayment, getLoanById, updateLoan, getEntryById, parseCsvRow, lockMonth, unlockMonth, isMonthLocked, getLockedMonths, assertUnlocked, postJournal, saveCustomAccount, getCustomAccounts, deleteCustomAccount, saveItem, getItemById, getAllItems, deleteItem, getStockMoves, getStockGroups, restockItem, adjustStock, transferStock, setItemsActive, setItemsCategory, setItemsUnit, setItemsPricePct, deleteItemsBulk, getReorderList, returnSale, getSaleReturns, returnedQtyFor, itemNetPrice, itemVariantLabel, importItemsBulk, dataHealthCheck, applyStockMove, snapshotAll, restoreAll, importBankLines, getShops, saveShops, getActiveShopId, setActiveShopId, shopStockOf, createPurchase, addPurchasePayment, getPurchaseById, purchaseOutstanding, deletePurchase, deleteEntry, getAllJournals, getAllRepayments, getKasbonLoans, applyPayrollKasbon, saveEmployee, backupSelfTest, getLastSelfTest, getUmp, saveUmp, getLeave, addLeave, getRole, setRole, setRolePersisted, clearPersistedRole, setActor, getActor, isKasir, requireOwner, can, requireCap, setRolePin, rolePinEnabled, verifyRolePin, logAudit, getAudit, createCreditSale, getCreditSales, getCreditSaleById, creditOutstanding, creditPaidTotal, payCreditSale, deleteCreditSale, creditSalesSummary } from '../storage.js';

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

describe('period lock', () => {
  it('kunci & buka', () => {
    expect(isMonthLocked('2026-09-01')).toBe(false);
    lockMonth('2026-09');
    expect(isMonthLocked('2026-09-15')).toBe(true);
    expect(isMonthLocked('2026-10-01')).toBe(false);
    expect(getLockedMonths()).toContain('2026-09');
    unlockMonth('2026-09');
    expect(isMonthLocked('2026-09-01')).toBe(false);
  });
  it('bulan invalid ditolak', () => {
    expect(() => lockMonth('ngawur')).toThrow();
  });
});

describe('penegakan kunci periode di lapisan storage (V3)', () => {
  const journalFor = (date) => ({
    id: 'J-' + Math.random().toString(36).slice(2), date, memo: 'uji kunci',
    lines: [{ account: '1101', debit: 1000, credit: 0 }, { account: '4101', debit: 0, credit: 1000 }],
  });
  it('createEntry + createLoan + postJournal + assertUnlocked ditolak di bulan terkunci', () => {
    lockMonth('2026-09');
    expect(() => createEntry({ date: '2026-09-03', type: 'expense', category: 'lainnya', amount: 1000 })).toThrow(/terkunci/);
    expect(() => createLoan({ direction: 'given', person: 'Budi', amount: 1000, date: '2026-09-03' })).toThrow(/terkunci/);
    expect(() => postJournal(journalFor('2026-09-05'))).toThrow(/terkunci/);
    expect(() => assertUnlocked('2026-09-01')).toThrow(/terkunci/);
  });
  it('addRepayment di bulan terkunci ditolak, pinjaman lama tetap utuh', () => {
    const loan = createLoan({ direction: 'given', person: 'Ani', amount: 1000000, date: '2026-08-01' });
    lockMonth('2026-09');
    expect(() => addRepayment({ loanId: loan.id, amount: 100000, date: '2026-09-10' })).toThrow(/terkunci/);
    expect(getLoanById(loan.id).status).toBe('active');
  });
  it('bulan tak terkunci tetap bisa; setelah buka kunci normal lagi', () => {
    lockMonth('2026-09');
    expect(() => createEntry({ date: '2026-10-01', type: 'expense', category: 'lainnya', amount: 1000 })).not.toThrow();
    unlockMonth('2026-09');
    expect(() => createEntry({ date: '2026-09-03', type: 'expense', category: 'lainnya', amount: 1000 })).not.toThrow();
  });
});

describe('custom COA storage', () => {
  it('tambah + tolak duplikat + hapus', () => {
    saveCustomAccount({ code: '5180', name: 'Beban Iklan', type: 'expense', category: 'iklan_adv' });
    expect(getCustomAccounts().some(a => a.code === '5180')).toBe(true);
    expect(() => saveCustomAccount({ code: '5180', name: 'X', type: 'expense' })).toThrow();
    expect(() => saveCustomAccount({ code: '12', name: 'X', type: 'expense' })).toThrow();
    deleteCustomAccount('5180', {});
    expect(getCustomAccounts().some(a => a.code === '5180')).toBe(false);
  });
  it('tak bisa hapus akun bermutasi', () => {
    saveCustomAccount({ code: '5181', name: 'Y', type: 'expense' });
    expect(() => deleteCustomAccount('5181', { 5181: { debit: 100, credit: 0 } })).toThrow();
    deleteCustomAccount('5181', {});
  });
});

describe('purchase flow', () => {
  it('beli masuk stok + jurnal + hutang; bayar melunasi', () => {
    const it = saveItem({ name: 'Gula', cost: 10000, price: 15000, stock: 0 });
    const p = createPurchase({
      supplier: 'Toko Makmur', date: '2026-09-01', dueDate: '2026-09-15',
      lines: [{ itemId: it.id, qty: 10, unitCost: 10000 }]
    });
    expect(p.totalCost).toBe(100000);
    expect(getItemById(it.id).stock).toBe(10);
    expect(getItemById(it.id).cost).toBe(10000);
    // jurnal beli ada
    expect(getAllJournals().some(j => j.ref === 'purchase' && j.refId === p.id)).toBe(true);
    // bayar sebagian
    const p2 = addPurchasePayment(p.id, { amount: 40000, date: '2026-09-05', payment: 'transfer' });
    expect(purchaseOutstanding(p2)).toBe(60000);
    expect(getPurchaseById(p.id).status).toBe('active');
    addPurchasePayment(p.id, { amount: 60000, date: '2026-09-06', payment: 'cash' });
    expect(getPurchaseById(p.id).status).toBe('paid');
    expect(getAllJournals().filter(j => j.ref === 'purchase-pay').length).toBe(2);
  });
  it('validasi: supplier kosong, baris kosong, melebihi sisa', () => {
    expect(() => createPurchase({ supplier: '', date: '2026-09-01', lines: [] })).toThrow();
    const it = saveItem({ name: 'Kopi', cost: 5000, price: 8000, stock: 0 });
    const p = createPurchase({ supplier: 'S', date: '2026-09-01', lines: [{ itemId: it.id, qty: 2, unitCost: 5000 }] });
    expect(() => addPurchasePayment(p.id, { amount: 20000, date: '2026-09-02' })).toThrow();
  });
  it('hapus kembalikan stok; tolak bila sudah terjual', () => {
    const it = saveItem({ name: 'Teh', cost: 3000, price: 5000, stock: 0 });
    const p = createPurchase({ supplier: 'S2', date: '2026-09-01', lines: [{ itemId: it.id, qty: 5, unitCost: 3000 }] });
    expect(getItemById(it.id).stock).toBe(5);
    // jual 5 via entry langsung? simulasi: kurangi stok manual lalu hapus → gagal
    saveItem({ id: it.id, name: 'Teh', cost: 3000, price: 5000, stock: 0 });
    expect(() => deletePurchase(p.id)).toThrow();
  });
});

describe('auth lokal', () => {
  it('default admin/admin, ganti, reset', async () => {
    const { verifyLogin, setPassword, resetAuth, getAuth } = await import('../storage.js');
    expect(await verifyLogin('admin', 'admin')).toBe(true);
    expect(await verifyLogin('admin', 'salah')).toBe(false);
    expect(await verifyLogin('budi', 'admin')).toBe(false);
    await setPassword('rahasia123');
    expect(getAuth().user).toBe('admin');
    expect(getAuth().hash).not.toBe('rahasia123');
    expect(await verifyLogin('admin', 'rahasia123')).toBe(true);
    expect(await verifyLogin('admin', 'admin')).toBe(false);
    await expect(setPassword('abc')).rejects.toThrow();
    resetAuth();
    expect(await verifyLogin('admin', 'admin')).toBe(true);
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

describe('retur penjualan (F1)', () => {
  it('retur parsial: stok balik + jurnal (pendapatan & HPP dibalik)', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'Kopi', price: 10000, cost: 5000, stock: 10 });
    const e = createEntry({ date: '2026-08-01', type: 'income', category: 'jualan', amount: 20000, sale: { lines: [{ itemId: it.id, qty: 2, price: 10000 }] } });
    expect(getItemById(it.id).stock).toBe(8);
    const rec = returnSale(e.id, [{ itemId: it.id, qty: 1 }], { date: '2026-08-02', payment: 'cash' });
    expect(rec.refund).toBe(10000);
    expect(getItemById(it.id).stock).toBe(9);
    expect(returnedQtyFor(e.id)[it.id]).toBe(1);
    const j = getAllJournals().find(x => x.ref === 'sale-return');
    expect(j.lines.find(l => l.account === '4101').debit).toBe(10000);
    expect(j.lines.find(l => l.account === '1105').debit).toBe(5000);
    expect(j.lines.find(l => l.account === '5109').credit).toBe(5000);
    expect(getSaleReturns(e.id).length).toBe(1);
  });
  it('retur melebihi sisa ditolak', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'Teh', price: 5000, cost: 2000, stock: 5 });
    const e = createEntry({ date: '2026-08-01', type: 'income', category: 'jualan', amount: 5000, sale: { lines: [{ itemId: it.id, qty: 1, price: 5000 }] } });
    expect(() => returnSale(e.id, [{ itemId: it.id, qty: 2 }], { date: '2026-08-02' })).toThrow(/Melebihi/);
  });
});

describe('aksi massal & restock (F1)', () => {
  it('getReorderList, aktif/nonaktif massal, set kategori', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const a = saveItem({ name: 'A', price: 1000, cost: 500, stock: 1, minStock: 5 });
    const b = saveItem({ name: 'B', price: 1000, cost: 500, stock: 10, minStock: 5 });
    const reorder = getReorderList('main').map(r => r.item.id);
    expect(reorder).toContain(a.id);
    expect(reorder).not.toContain(b.id);
    setItemsActive([a.id], false);
    expect(getItemById(a.id).active).toBe(false);
    expect(getReorderList('main').map(r => r.item.id)).not.toContain(a.id);
    setItemsCategory([b.id], 'Minuman');
    expect(getItemById(b.id).category).toBe('Minuman');
  });
  it('setItemsUnit & setItemsPricePct mengubah satuan dan harga/modal', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const a = saveItem({ name: 'Kaos', price: 100000, cost: 60000, stock: 1 });
    setItemsUnit([a.id], 'box');
    setItemsPricePct([a.id], 10);
    const u = getItemById(a.id);
    expect(u.unit).toBe('box');
    expect(u.price).toBe(110000);
    expect(u.cost).toBe(66000);
    setItemsPricePct([a.id], -50);
    expect(getItemById(a.id).price).toBe(55000);
  });
  it('deleteItemsBulk menghapus yang tidak dipakai, melewati yang sudah dipakai', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const free = saveItem({ name: 'Free', price: 1000, cost: 500, stock: 1 });
    const used = saveItem({ name: 'Used', price: 2000, cost: 1000, stock: 5 });
    createEntry({ date: '2026-08-01', type: 'income', category: 'jualan', amount: 2000, sale: { lines: [{ itemId: used.id, qty: 1, price: 2000 }] } });
    const r = deleteItemsBulk([free.id, used.id]);
    expect(r.deleted).toBe(1);
    expect(r.skipped).toBe(1);
    expect(getItemById(free.id)).toBeFalsy();
    expect(getItemById(used.id)).toBeTruthy();
  });
});

describe('dokumen stok: penyesuaian & transfer', () => {
  it('adjustStock (+/−) + jurnal Dr/Cr 1105 vs 5199', () => {
    saveShops([{ id: 'main', name: 'Toko Utama' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'Kopi', price: 10000, cost: 5000, stock: 5 });
    adjustStock(it.id, { qty: -2, reason: 'rusak', date: '2026-08-01' });
    expect(getItemById(it.id).stock).toBe(3);
    const j = getAllJournals().find(x => x.ref === 'adjust');
    expect(j.lines.find(l => l.account === '5199').debit).toBe(10000);
    expect(j.lines.find(l => l.account === '1105').credit).toBe(10000);
  });
  it('transferStock pindah antar toko tanpa jurnal', () => {
    saveShops([{ id: 'main', name: 'A' }, { id: 'b', name: 'B' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'Teh', price: 5000, stock: 4 });
    transferStock(it.id, { fromShop: 'main', toShop: 'b', qty: 3 });
    const a = getItemById(it.id);
    expect(shopStockOf(a, 'main')).toBe(1);
    expect(shopStockOf(a, 'b')).toBe(3);
  });
});

describe('multi-toko (stok per lokasi)', () => {
  it('stok dicatat per toko + total; jual kurangi toko aktif saja', () => {
    saveShops([{ id: 'main', name: 'Toko Utama' }, { id: 'b', name: 'Cabang' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'Kopi', price: 10000, stock: 5 });
    setActiveShopId('b');
    const it2 = saveItem({ id: it.id, name: 'Kopi', price: 10000, stock: 3 });
    expect(shopStockOf(it2, 'main')).toBe(5);
    expect(shopStockOf(it2, 'b')).toBe(3);
    expect(it2.stock).toBe(8);
    applyStockMove(it.id, { qtyOut: 2 });
    const after = getItemById(it.id);
    expect(shopStockOf(after, 'b')).toBe(1);
    expect(shopStockOf(after, 'main')).toBe(5);
  });
  it('applyStockMove menolak bila stok toko itu kurang', () => {
    saveShops([{ id: 'main', name: 'Toko Utama' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'Teh', price: 5000, stock: 1 });
    expect(() => applyStockMove(it.id, { qtyOut: 5 })).toThrow(/kurang/);
  });
});

describe('perbaikan stok v1.60 (kebenaran)', () => {
  it('importItemsBulk menulis stok per toko aktif + total konsisten', () => {
    saveShops([{ id: 'main', name: 'A' }, { id: 'b', name: 'B' }]);
    setActiveShopId('main');
    importItemsBulk([{ name: 'X', sku: 'X1', price: 1000, stock: 5 }]);
    let it = getAllItems().find(x => x.sku === 'X1');
    expect(shopStockOf(it, 'main')).toBe(5);
    setActiveShopId('b');
    importItemsBulk([{ name: 'X', sku: 'X1', price: 1000, stock: 2 }]);
    it = getAllItems().find(x => x.sku === 'X1');
    expect(shopStockOf(it, 'main')).toBe(5);
    expect(shopStockOf(it, 'b')).toBe(2);
    expect(it.stock).toBe(7);
  });
  it('saveItem menolak SKU/barcode duplikat', () => {
    saveItem({ name: 'P1', sku: 'SKU-9', barcode: '999', stock: 0 });
    expect(() => saveItem({ name: 'P2', sku: 'SKU-9', stock: 0 })).toThrow(/sudah dipakai/);
    expect(() => saveItem({ name: 'P3', barcode: '999', stock: 0 })).toThrow(/sudah dipakai/);
  });
  it('saveItem mencatat gerakan stok opening/opname (kartu stok)', () => {
    const it = saveItem({ name: 'Mov', stock: 4, cost: 1000, price: 2000 });
    expect(getStockMoves(it.id).some(m => m.type === 'opening' && m.qtyIn === 4)).toBe(true);
    saveItem({ id: it.id, name: 'Mov', stock: 6, cost: 1000, price: 2000 });
    expect(getStockMoves(it.id).some(m => m.type === 'opname' && m.qtyIn === 2)).toBe(true);
  });
  it('transferStock ditolak di bulan terkunci', () => {
    saveShops([{ id: 'main', name: 'A' }, { id: 'b', name: 'B' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'T', stock: 3, price: 1000 });
    lockMonth('2026-08');
    expect(() => transferStock(it.id, { fromShop: 'main', toShop: 'b', qty: 1, date: '2026-08-05' })).toThrow(/terkunci/);
  });
  it('HPP dibekukan saat penjualan; retur pakai HPP asli', () => {
    const it = saveItem({ name: 'Frz', stock: 10, cost: 1000, price: 5000 });
    const e = createEntry({ date: '2026-09-01', type: 'income', category: 'jualan', amount: 5000, sale: { lines: [{ itemId: it.id, qty: 1, price: 5000 }] } });
    expect(e.sale.lines[0].avgCost).toBe(1000);
    saveItem({ id: it.id, name: 'Frz', stock: 10, cost: 9000, price: 5000 });
    const r = returnSale(e.id, [{ itemId: it.id, qty: 1 }], { date: '2026-09-02', payment: 'cash' });
    expect(r.costBack).toBe(1000);
  });
});

describe('perbaikan bug (audit)', () => {
  it('saveItem dengan peta stocks (restore backup) tidak mengkolaps stok per-toko', () => {
    saveShops([{ id: 'main', name: 'A' }, { id: 'b', name: 'B' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'Multi', price: 1000, stocks: { main: 4, b: 7 }, stock: 11 });
    expect(shopStockOf(it, 'main')).toBe(4);
    expect(shopStockOf(it, 'b')).toBe(7);
    expect(it.stock).toBe(11);
  });
  it('importItemsBulk tidak menghapus SKU/barcode lama saat kolom kosong', () => {
    importItemsBulk([{ name: 'Kaos', sku: 'K-9', barcode: '999', price: 100000, stock: 1 }]);
    importItemsBulk([{ name: 'Kaos', sku: '', barcode: '', price: 120000 }]);
    const it = getAllItems().find(x => x.name === 'Kaos');
    expect(it.sku).toBe('K-9');
    expect(it.barcode).toBe('999');
    expect(it.price).toBe(120000);
  });
  it('restore tidak menggandakan stok dari pembelian', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'R', price: 1000, cost: 500, stock: 0 });
    createPurchase({ supplier: 'S', date: '2026-08-01', lines: [{ itemId: it.id, qty: 10, unitCost: 500 }] });
    expect(getItemById(it.id).stock).toBe(10);
    const snap = JSON.parse(JSON.stringify(snapshotAll()));
    localStorage.clear();
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    restoreAll(snap);
    expect(getItemById(it.id).stock).toBe(10);
  });
  it('restore mempertahankan baris penjualan & flag PPN', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'P', price: 5000, cost: 2000, stock: 5 });
    const e = createEntry({ date: '2026-09-01', type: 'income', category: 'jualan', amount: 5000, ppn: true, sale: { lines: [{ itemId: it.id, qty: 1, price: 5000 }], total: 5000, subtotal: 5000, discount: 0 } });
    const snap = JSON.parse(JSON.stringify(snapshotAll()));
    localStorage.clear();
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    restoreAll(snap);
    const got = getEntryById(e.id);
    expect(got.ppn).toBe(true);
    expect(got.sale && got.sale.lines.length).toBe(1);
    expect(got.sale.lines[0].itemId).toBe(it.id);
  });
  it('retur memperhitungkan diskon nota', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'D', price: 100000, cost: 60000, stock: 5 });
    const e = createEntry({ date: '2026-09-01', type: 'income', category: 'jualan', amount: 90000, sale: { lines: [{ itemId: it.id, qty: 1, price: 100000 }], total: 90000, subtotal: 100000, discount: 10000 } });
    const r = returnSale(e.id, [{ itemId: it.id, qty: 1 }], { date: '2026-09-02', payment: 'cash' });
    expect(r.refund).toBe(90000);
  });
  it('hapus penjualan setelah retur sebagian mengembalikan stok dengan benar', () => {
    saveShops([{ id: 'main', name: 'A' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'H', price: 10000, cost: 5000, stock: 10 });
    const e = createEntry({ date: '2026-09-01', type: 'income', category: 'jualan', amount: 20000, sale: { lines: [{ itemId: it.id, qty: 2, price: 10000 }], total: 20000, subtotal: 20000, discount: 0 } });
    expect(getItemById(it.id).stock).toBe(8);
    returnSale(e.id, [{ itemId: it.id, qty: 1 }], { date: '2026-09-02' });
    expect(getItemById(it.id).stock).toBe(9);
    deleteEntry(e.id);
    expect(getItemById(it.id).stock).toBe(10);
  });
  it('pembatalan penjualan mengembalikan stok ke toko asal (multi-toko)', () => {
    saveShops([{ id: 'main', name: 'A' }, { id: 'b', name: 'B' }]);
    setActiveShopId('main');
    const it = saveItem({ name: 'MS', price: 10000, cost: 5000, stock: 5 });
    const e = createEntry({ date: '2026-09-01', type: 'income', category: 'jualan', amount: 20000, sale: { lines: [{ itemId: it.id, qty: 2, price: 10000 }], total: 20000, subtotal: 20000, discount: 0 } });
    expect(shopStockOf(getItemById(it.id), 'main')).toBe(3);
    setActiveShopId('b');
    deleteEntry(e.id);
    expect(shopStockOf(getItemById(it.id), 'main')).toBe(5);
    expect(shopStockOf(getItemById(it.id), 'b')).toBe(0);
  });
  it('akun custom tidak boleh memakai kode akun bawaan', () => {
    expect(() => saveCustomAccount({ code: '4101', name: 'X', type: 'asset' })).toThrow(/bawaan|dipakai/);
  });
  it('importBankLines memposting jurnal bank↔COA (balance)', () => {
    const res = importBankLines([{ date: '2026-09-01', amount: 15000, direction: 'out', counterAccount: '6205', memo: 'Biaya adm' }], { bankAccount: '1101' });
    expect(res.ok).toBe(1);
    const j = getAllJournals().find(x => x.ref === 'bank');
    expect(j).toBeTruthy();
    expect(j.lines.find(l => l.account === '6205').debit).toBe(15000);
    expect(j.lines.find(l => l.account === '1101').credit).toBe(15000);
  });
});

describe('kesehatan data (F4)', () => {
  it('data bersih (backup baru) → ok tanpa isu', () => {
    localStorage.setItem('wynara_lastBackup', new Date().toISOString());
    const r = dataHealthCheck();
    expect(r.ok).toBe(true);
    expect(r.issues.length).toBe(0);
  });
  it('akun tak dikenal di jurnal → peringatan', () => {
    postJournal({ id: 'JX', date: '2026-08-01', memo: 'uji', lines: [{ account: '9999', debit: 1000, credit: 0, memo: 'x' }, { account: '1101', debit: 0, credit: 1000, memo: 'x' }] });
    const r = dataHealthCheck();
    expect(r.issues.some(i => /tak dikenal/.test(i.label))).toBe(true);
  });
});

describe('peran akuntan/hrd (OQ4)', () => {
  beforeEach(() => { try { sessionStorage.clear(); } catch {} });
  it('matriks cap: akuntan ledger+payroll, hrd hanya payroll/petty', () => {
    setRole('akuntan');
    expect(can('ledger')).toBe(true);
    expect(can('payroll')).toBe(true);
    expect(can('settings')).toBe(true);
    setRole('hrd');
    expect(can('payroll')).toBe(true);
    expect(can('petty')).toBe(true);
    expect(can('ledger')).toBe(false);
    setRole('kasir');
    expect(can('ledger')).toBe(false);
    expect(can('transact')).toBe(true);
    setRole('owner');
    expect(can('whatever')).toBe(true);
    expect(() => requireCap('ledger')).not.toThrow();
    setRole('hrd');
    expect(() => requireCap('ledger')).toThrow(/Akses ditolak/);
    setRole('owner');
  });
  it('PIN peran akuntan: set, verify, matikan', async () => {
    setRole('owner');
    await setRolePin('akuntan', '2468', true);
    expect(rolePinEnabled('akuntan')).toBe(true);
    expect(await verifyRolePin('akuntan', '2468')).toBe(true);
    expect(await verifyRolePin('akuntan', '0000')).toBe(false);
    await setRolePin('akuntan', '', false);
    expect(rolePinEnabled('akuntan')).toBe(false);
  });
  it('HRD hanya boleh gaji/petty: createLoan ditolak, saveEmployee boleh', () => {
    setRole('hrd');
    expect(() => createLoan({ direction: 'given', person: 'X', amount: 1000, date: '2026-08-01' })).toThrow(/Akses ditolak/);
    expect(() => saveEmployee({ name: 'Budi', baseSalary: 3000000 })).not.toThrow();
    setRole('owner');
  });
});

describe('peran & audit actor (B3)', () => {
  beforeEach(() => { try { sessionStorage.clear(); } catch {} });
  it('owner default: guard lolos', () => {
    expect(getRole()).toBe('owner');
    expect(isKasir()).toBe(false);
    expect(() => requireOwner()).not.toThrow();
  });
  it('kasir: aksi admin/hapus ditolak di lapisan data; mencatat transaksi tetap boleh', () => {
    const e = createEntry({ date: '2026-08-01', type: 'expense', category: 'lainnya', amount: 1000 });
    setRole('kasir');
    expect(isKasir()).toBe(true);
    expect(() => requireOwner()).toThrow(/Akses ditolak/);
    expect(() => deleteEntry(e.id)).toThrow(/Akses ditolak/);
    expect(() => createLoan({ direction: 'given', person: 'Budi', amount: 1000, date: '2026-08-01' })).toThrow(/Akses ditolak/);
    expect(getAllEntries().some(x => x.id === e.id)).toBe(true);
    expect(() => createEntry({ date: '2026-08-02', type: 'income', category: 'lainnya', amount: 2000 })).not.toThrow();
    setRole('owner');
  });
  it('role kasir bertahan saat login diingat (persisted)', () => {
    setRolePersisted('kasir');
    try { sessionStorage.removeItem('wynara_role'); } catch {}
    expect(getRole()).toBe('kasir');
    clearPersistedRole();
    expect(getRole()).toBe('owner');
  });
  it('logAudit mencatat actor', () => {
    setActor({ role: 'kasir', user: 'kasir' });
    expect(getActor()).toEqual({ role: 'kasir', user: 'kasir' });
    logAudit('create', 'entry', 'x', null, { amount: 1 });
    expect(getAudit()[0].actor).toEqual({ role: 'kasir', user: 'kasir' });
    setActor(null);
  });
});

describe('backup self-test', () => {
  it('snapshot lolos round-trip + validasi skema', () => {
    createEntry({ date: '2026-08-01', type: 'income', category: 'lainnya', amount: 1000 });
    createLoan({ direction: 'given', person: 'Budi', amount: 100000, date: '2026-08-02' });
    const r = backupSelfTest();
    expect(r.ok).toBe(true);
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.counts.entries).toBe(2);
    expect(r.counts.loans).toBe(1);
    expect(getLastSelfTest().ok).toBe(true);
  });
});

describe('cuti & UMP (storage)', () => {
  it('saldo cuti default 12 hari; addLeave menambah comp & taken', () => {
    const emp = saveEmployee({ name: 'Cuti Satu', baseSalary: 4000000 });
    expect(getLeave(emp.id, 2026)).toEqual({ entitled: 12, taken: 0, comp: 0 });
    addLeave(emp.id, 2026, { comp: 1, taken: 2 });
    expect(getLeave(emp.id, 2026)).toEqual({ entitled: 12, taken: 2, comp: 1 });
  });
  it('UMP disimpan sebagai angka', () => {
    expect(getUmp().amount).toBe(0);
    saveUmp('3.500.000');
    expect(getUmp().amount).toBe(3500000);
  });
});

describe('produk: grup & restock', () => {
  it('getStockGroups mengelompokkan varian + total/harga', () => {
    saveItem({ name: 'Kaos • S • Hitam', sku: 'K-1', size: 'S', color: 'Hitam', price: 100000, stock: 3, groupId: 'G1', baseName: 'Kaos' });
    saveItem({ name: 'Kaos • M • Hitam', sku: 'K-2', size: 'M', color: 'Hitam', price: 110000, stock: 2, groupId: 'G1', baseName: 'Kaos' });
    const g = getStockGroups().find(x => x.key === 'g1');
    expect(g).toBeTruthy();
    expect(g.variants.length).toBe(2);
    expect(g.totalStock).toBe(5);
    expect(g.minPrice).toBe(100000);
    expect(g.maxPrice).toBe(110000);
  });
  it('restockItem menambah stok + jurnal Dr Persediaan / Cr Kas', () => {
    const it = saveItem({ name: 'Kopi', price: 20000, cost: 10000, stock: 0 });
    restockItem(it.id, 5, 12000, { date: '2026-08-01', payment: 'cash' });
    expect(getItemById(it.id).stock).toBe(5);
    const j = getAllJournals().find(x => x.ref === 'restock');
    expect(j.lines.find(l => l.account === '1105').debit).toBe(60000);
    expect(j.lines.find(l => l.account === '1104').credit).toBe(60000);
  });
});

describe('produk: varian & diskon', () => {
  it('saveItem menyimpan ukuran/warna/diskon; itemNetPrice & label', () => {
    const it = saveItem({ name: 'Kaos', price: 100000, cost: 60000, stock: 10, size: 'L', color: 'Hitam', discountPct: 25 });
    expect(it.size).toBe('L');
    expect(it.color).toBe('Hitam');
    expect(it.discountPct).toBe(25);
    expect(itemNetPrice(it)).toBe(75000);
    expect(itemVariantLabel(it)).toBe('L / Hitam');
  });
  it('diskon dibatasi 0–100', () => {
    expect(saveItem({ name: 'X', price: 1000, discountPct: 150 }).discountPct).toBe(100);
    expect(saveItem({ name: 'Y', price: 1000, discountPct: -5 }).discountPct).toBe(0);
  });
  it('saveItem menyimpan satuan, kategori, barcode', () => {
    const it = saveItem({ name: 'Susu', price: 20000, stock: 2, unit: 'box', category: 'Minuman', barcode: '899123' });
    expect(it.unit).toBe('box');
    expect(it.category).toBe('Minuman');
    expect(it.barcode).toBe('899123');
  });
  it('saveItem menyimpan foto + berat/dimensi kirim', () => {
    const it = saveItem({ name: 'Kaos', price: 50000, stock: 1, image: 'data:image/jpeg;base64,AAA', weight: 250, length: 30, width: 20, height: 3 });
    const got = getItemById(it.id);
    expect(got.image).toBe('data:image/jpeg;base64,AAA');
    expect(got.weight).toBe(250);
    expect(got.length).toBe(30);
    expect(got.width).toBe(20);
    expect(got.height).toBe(3);
  });
  it('importItemsBulk upsert per SKU + simpan varian', () => {
    const r1 = importItemsBulk([{ name: 'Kaos', sku: 'K-1', price: 100000, size: 'L', color: 'Hitam', discountPct: 10, stock: 3 }]);
    expect(r1.added).toBe(1);
    const r2 = importItemsBulk([{ name: 'Kaos', sku: 'K-1', price: 120000 }]);
    expect(r2.updated).toBe(1);
    const it = getAllItems().find(x => x.sku === 'K-1');
    expect(it.price).toBe(120000);
    expect(it.size).toBe('L');
  });
});

describe('stok & penjualan (regresi #1 — sale.lines)', () => {
  it('penjualan via sale.lines MENGURANGI stok + tercatat di kartu stok; hapus → stok balik', () => {
    const it = saveItem({ name: 'Kopi', stock: 10, cost: 10000, price: 15000 });
    const e = createEntry({ date: '2026-08-01', type: 'income', category: 'jualan', amount: 50000, sale: { lines: [{ itemId: it.id, qty: 2, price: 25000 }] } });
    expect(getItemById(it.id).stock).toBe(8);
    expect(getStockMoves(it.id).some(m => m.qtyOut === 2)).toBe(true);
    deleteEntry(e.id);
    expect(getItemById(it.id).stock).toBe(10);
  });
  it('hapus barang yang sudah dipakai transaksi ditolak', () => {
    const it = saveItem({ name: 'Teh', stock: 5, cost: 5000, price: 8000 });
    createEntry({ date: '2026-08-01', type: 'income', category: 'jualan', amount: 8000, sale: { lines: [{ itemId: it.id, qty: 1, price: 8000 }] } });
    expect(() => deleteItem(it.id)).toThrow(/sudah dipakai/);
  });
  it('pembelian di bulan terkunci ditolak di lapisan storage', () => {
    const it = saveItem({ name: 'Gula', stock: 0, cost: 12000, price: 15000 });
    lockMonth('2026-08');
    expect(() => createPurchase({ supplier: 'PT S', date: '2026-08-05', lines: [{ itemId: it.id, qty: 1, unitCost: 12000 }] })).toThrow(/terkunci/);
  });
});

describe('kasbon karyawan (storage)', () => {
  it('createLoan ke nama karyawan otomatis ter-link (employeeId) + terdeteksi getKasbonLoans', () => {
    const emp = saveEmployee({ name: 'Budi Santoso', baseSalary: 5000000 });
    const loan = createLoan({ direction: 'given', person: 'Budi Santoso', amount: 1000000, date: '2026-08-01', installmentAmount: 200000 });
    expect(loan.employeeId).toBe(emp.id);
    expect(getKasbonLoans(emp.id, 'Budi Santoso').some(l => l.id === loan.id)).toBe(true);
  });
  it('kontak "karyawan" dipertahankan saat create (bukan dipaksa jadi person)', () => {
    const emp = saveEmployee({ name: 'Karyawan Dua', baseSalary: 5000000 });
    const loan = createLoan({ direction: 'given', person: 'Karyawan Dua', contactType: 'karyawan', amount: 500000, date: '2026-08-01' });
    expect(loan.contactType).toBe('karyawan');
    expect(loan.employeeId).toBe(emp.id);
  });
  it('applyPayrollKasbon mengurangi sisa + jurnal Dr Beban Gaji Cr Piutang', () => {
    const emp = saveEmployee({ name: 'Ani Kasbon', baseSalary: 4000000 });
    const loan = createLoan({ direction: 'given', person: 'Ani Kasbon', amount: 1000000, date: '2026-08-01' });
    const rep = applyPayrollKasbon(loan.id, 300000, '2026-08-31', '2026-08');
    expect(rep.source).toBe('payroll');
    expect(getAllRepayments().filter(r => r.loanId === loan.id).reduce((s, r) => s + r.amount, 0)).toBe(300000);
    const j = getAllJournals().find(x => x.ref === 'repayment' && x.refId === rep.id);
    expect(j.lines.find(l => l.account === '6201').debit).toBe(300000);
    expect(j.lines.find(l => l.account === '1201').credit).toBe(300000);
  });
  it('applyPayrollKasbon dibatasi sisa; lunas → status paid', () => {
    const emp = saveEmployee({ name: 'Clamp Kasbon', baseSalary: 4000000 });
    const loan = createLoan({ direction: 'given', person: 'Clamp Kasbon', amount: 500000, date: '2026-08-01' });
    const rep = applyPayrollKasbon(loan.id, 9999999, '2026-08-31', '2026-08');
    expect(rep.amount).toBe(500000);
    expect(getLoanById(loan.id).status).toBe('paid');
  });
});

describe('JKK anti-racun (regresi Rp4.050.000)', () => {
  it('saveEmployee tanpa jkkRate menyimpan pecahan legal, bukan 0.54', async () => {
    const { saveEmployee, getAllEmployees } = await import('../storage.js');
    const saved = saveEmployee({ name: 'Korban JKK', baseSalary: 6500000, allowance: 1000000 });
    expect(saved.jkkRate).toBe(0.0054);
    expect(getAllEmployees().find(e => e.id === saved.id).jkkRate).toBe(0.0054);
  });
  it('slip karyawan hasil save = JKK 0,54% x 7,5jt = Rp40.500', async () => {
    const { saveEmployee, getAllEmployees } = await import('../storage.js');
    const { computeSlip } = await import('../payroll.js');
    const saved = saveEmployee({ name: 'Slip JKK', baseSalary: 6500000, allowance: 1000000 });
    const emp = getAllEmployees().find(e => e.id === saved.id);
    const s = computeSlip(emp, {});
    expect(s.comp.jkk).toBe(40500);
  });
  it('record lama beracun (jkkRate 0.54) tetap dihitung benar + sembuh saat disimpan ulang', async () => {
    const { saveEmployee, getAllEmployees } = await import('../storage.js');
    const { computeSlip } = await import('../payroll.js');
    const s = computeSlip({ baseSalary: 6500000, allowance: 1000000, jkkRate: 0.54 }, {});
    expect(s.comp.jkk).toBe(40500);
    const healed = saveEmployee({ name: 'Sembuh', baseSalary: 1000000, jkkRate: 0.54 });
    expect(healed.jkkRate).toBe(0.0054);
    expect(getAllEmployees().find(e => e.id === healed.id).jkkRate).toBe(0.0054);
  });
  it('override legal 1,2% tetap dihormati', async () => {
    const { computeSlip } = await import('../payroll.js');
    const s = computeSlip({ baseSalary: 4000000, allowance: 1000000, jkkRate: 0.012 }, {});
    expect(s.comp.jkk).toBe(60000);
  });
});

describe('penjualan kredit (bayar nanti)', () => {
  it('DP + sisa piutang + jurnal seimbang + stok turun', () => {
    saveShops([{ id: 'main', name: 'A' }]); setActiveShopId('main');
    const it = saveItem({ name: 'KreditItem', price: 100000, cost: 60000, stock: 5 });
    const cs = createCreditSale({ date: '2026-09-01', dueDate: '2026-10-01', customer: 'Budi', lines: [{ itemId: it.id, qty: 1, price: 100000 }], discount: 0, ppn: false, depositPct: 20, terms: 2, payment: 'cash' });
    expect(cs.total).toBe(100000);
    expect(cs.deposit).toBe(20000);
    expect(creditOutstanding(cs)).toBe(80000);
    expect(getItemById(it.id).stock).toBe(4);
    const j = getAllJournals().find(x => x.ref === 'credit-sale');
    expect(j).toBeTruthy();
    const deb = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const cred = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    expect(deb).toBe(cred);
    expect(j.lines.find(l => l.account === '1201').debit).toBe(80000);
  });
  it('bayar sebagian open; lunas paid; overpay ditolak', () => {
    saveShops([{ id: 'main', name: 'A' }]); setActiveShopId('main');
    const it = saveItem({ name: 'K2', price: 50000, cost: 30000, stock: 3 });
    const cs = createCreditSale({ date: '2026-09-01', dueDate: '2026-10-01', customer: 'Ani', lines: [{ itemId: it.id, qty: 1, price: 50000 }], deposit: 0, terms: 1, payment: 'cash' });
    expect(creditOutstanding(cs)).toBe(50000);
    payCreditSale(cs.id, { amount: 20000, date: '2026-09-02', payment: 'cash' });
    expect(creditOutstanding(getCreditSaleById(cs.id))).toBe(30000);
    expect(getCreditSaleById(cs.id).status).toBe('open');
    expect(() => payCreditSale(cs.id, { amount: 999999, date: '2026-09-03' })).toThrow(/Melebihi/);
    payCreditSale(cs.id, { amount: 30000, date: '2026-09-03', payment: 'cash' });
    expect(getCreditSaleById(cs.id).status).toBe('paid');
    const s = creditSalesSummary();
    expect(s.received30).toBe(50000);
  });
  it('hapus penjualan kredit mengembalikan stok', () => {
    saveShops([{ id: 'main', name: 'A' }]); setActiveShopId('main');
    const it = saveItem({ name: 'K3', price: 10000, cost: 5000, stock: 2 });
    const cs = createCreditSale({ date: '2026-09-01', dueDate: '2026-10-01', customer: 'C', lines: [{ itemId: it.id, qty: 2, price: 10000 }], deposit: 0, terms: 1, payment: 'cash' });
    expect(getItemById(it.id).stock).toBe(0);
    deleteCreditSale(cs.id);
    expect(getItemById(it.id).stock).toBe(2);
    expect(getCreditSales().length).toBe(0);
  });
});


