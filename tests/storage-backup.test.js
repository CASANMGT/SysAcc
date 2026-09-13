// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { validateBackupJSON, importEntries, getAllEntries, clearAllEntries, createEntry, createLoan, addRepayment, getLoanById, updateLoan, parseCsvRow, lockMonth, unlockMonth, isMonthLocked, getLockedMonths, assertUnlocked, postJournal, saveCustomAccount, getCustomAccounts, deleteCustomAccount, saveItem, getItemById, createPurchase, addPurchasePayment, getPurchaseById, purchaseOutstanding, deletePurchase, deleteEntry, getAllJournals, getRole, setRole, setRolePersisted, clearPersistedRole, setActor, getActor, isKasir, requireOwner, logAudit, getAudit } from '../storage.js';

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
    saveCustomAccount({ code: '5120', name: 'Beban Iklan', type: 'expense', category: 'iklan' });
    expect(getCustomAccounts().some(a => a.code === '5120')).toBe(true);
    expect(() => saveCustomAccount({ code: '5120', name: 'X', type: 'expense' })).toThrow();
    expect(() => saveCustomAccount({ code: '12', name: 'X', type: 'expense' })).toThrow();
    deleteCustomAccount('5120', {});
    expect(getCustomAccounts().some(a => a.code === '5120')).toBe(false);
  });
  it('tak bisa hapus akun bermutasi', () => {
    saveCustomAccount({ code: '5121', name: 'Y', type: 'expense' });
    expect(() => deleteCustomAccount('5121', { 5121: { debit: 100, credit: 0 } })).toThrow();
    deleteCustomAccount('5121', {});
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
