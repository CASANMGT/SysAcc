import { totalOwed } from './loanmath.js';
import { sanitizeJkkRate, JKK_DEFAULT } from './payroll.js';
import { buildEntryJournal, buildLoanJournal, buildRepaymentJournal, buildPurchaseJournal, buildPurchasePayJournal, buildPayrollKasbonJournal, buildRestockJournal, buildAdjustJournal, buildSaleReturnJournal, buildBankLineJournal, buildCreditSaleJournal, buildCreditPaymentJournal, buildPreorderPayJournal, buildPreorderCostJournal, buildPreorderSettleJournal, buildPreorderRefundJournal, findUnbalanced } from './journals.js';
import { getAccounts, ACCOUNTS, COA_RENUMBER, INVENTORY_ACCOUNT, accountForPayment } from './coa.js';
import { exportBlobs, importBlobs } from './files.js';

const STORAGE_KEY = 'ledger_entries';

// Kategori custom bisa diketik user / datang dari file import —
// buang karakter HTML supaya tidak bisa jadi injeksi script di render.
export function sanitizeCategory(cat) {
  return String(cat || '').trim().replace(/[<>"'&]/g, '').slice(0, 60);
}

function generateId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function getEntries() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') throw new Error('Penyimpanan penuh. Hapus beberapa transaksi.');
    throw e;
  }
}

export function getAllEntries() {
  return getEntries().sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    const na = isNaN(da) ? 0 : da.getTime();
    const nb = isNaN(db) ? 0 : db.getTime();
    return nb - na;
  });
}

export function getEntryById(id) {
  const entries = getEntries();
  return entries.find(e => e.id === id);
}

export function createEntry(entry) {
  const entries = getEntries();
  const amount = Number(entry.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Jumlah tidak valid');
  assertUnlocked(entry.date);
  const newEntry = {
    id: generateId(),
    date: entry.date,
    type: entry.type === 'income' ? 'income' : 'expense',
    category: sanitizeCategory(entry.category) || 'lainnya',
    payment: entry.payment || 'cash',
    paymentDetail: String(entry.paymentDetail || '').slice(0, 60),
    description: String(entry.description || '').slice(0, 120),
    amount,
    person: String(entry.person || '').slice(0, 60),
    loanId: entry.loanId || null,
    ppn: !!entry.ppn,
    payroll: entry.payroll && typeof entry.payroll === 'object' ? entry.payroll : undefined,
    sale: entry.sale && typeof entry.sale === 'object' ? entry.sale : undefined,
    itemId: entry.itemId ? String(entry.itemId).slice(0, 60) : null,
    qty: Math.max(Math.floor(Number(entry.qty) || 0), 0) || null,
    unitCost: entry.unitCost !== undefined ? Math.max(Number(entry.unitCost) || 0, 0) : undefined,
    createdAt: new Date().toISOString()
  };
  if (entry.loanDue) newEntry.loanDue = entry.loanDue;
  if (entry.loanType) newEntry.loanType = entry.loanType;
  if (entry.installmentAmount) newEntry.installmentAmount = Number(entry.installmentAmount) || 0;
  if (entry.contactType) newEntry.contactType = entry.contactType;
  // Simpan toko asal agar pembatalan/edit/retur mengembalikan stok ke toko yang benar.
  if ((newEntry.itemId && newEntry.qty > 0) || (newEntry.sale && Array.isArray(newEntry.sale.lines) && newEntry.sale.lines.length)) {
    newEntry.shop = entry.shop ? String(entry.shop).slice(0, 40) : getActiveShopId();
  }
  // Bekukan HPP per baris saat penjualan dibuat (agar COGS tidak bergeser bila modal berubah).
  if (newEntry.sale && Array.isArray(newEntry.sale.lines)) {
    newEntry.sale.lines = newEntry.sale.lines.map(l => {
      if (!l || !l.itemId) return l;
      if (l.avgCost != null) return { ...l, avgCost: Number(l.avgCost) || 0 };
      const it = getItemById(l.itemId);
      return { ...l, avgCost: it ? Number(it.cost) || 0 : 0 };
    });
  }
  entries.push(newEntry);
  saveEntries(entries);
  // Stok: jual kurangi (item tunggal ATAU baris penjualan), beli tambah.
  // Gagal → rollback entry (jangan tinggalkan stok/jurnal setengah jalan).
  const hasSaleLines = !!(newEntry.sale && Array.isArray(newEntry.sale.lines) && newEntry.sale.lines.some(l => l && l.itemId && l.qty > 0));
  if (!newEntry.loanId && ((newEntry.itemId && newEntry.qty > 0) || hasSaleLines)) {
    try {
      applyStockMoveForEntry(newEntry);
    } catch (err) {
      saveEntries(getEntries().filter(e => e.id !== newEntry.id));
      throw err;
    }
  }
  // Jurnal (bukan entry pinjaman — itu ikut jurnal loan/repayment)
  if (!newEntry.loanId) {
    try {
      const j = buildEntryJournal(newEntry, journalOptsFor(newEntry));
      if (j) { j.refId = newEntry.id; postJournal(j); }
    } catch {}
    logAudit('create', 'entry', newEntry.id, null, { amount: newEntry.amount, category: newEntry.category, date: newEntry.date });
  }
  return newEntry;
}

// Semua gerakan stok sebuah entry: item tunggal + baris-baris penjualan.
function stockMovesFor(entry) {
  const moves = [];
  if (entry.itemId && entry.qty > 0) {
    moves.push({
      itemId: entry.itemId, qty: entry.qty,
      dir: entry.type === 'income' ? 'out' : 'in',
      unitCost: entry.unitCost, shop: entry.shop
    });
  }
  if (entry.type === 'income' && entry.sale && Array.isArray(entry.sale.lines)) {
    entry.sale.lines.forEach(l => {
      if (l && l.itemId && l.qty > 0) moves.push({ itemId: l.itemId, qty: l.qty, dir: 'out', shop: entry.shop });
    });
  }
  return moves;
}

// Opsi jurnal + gerakan stok untuk sebuah entry (dibaca saat post).
function journalOptsFor(entry) {
  const opts = { ppn: !!entry.ppn };
  if (opts.ppn) opts.ppnRate = getPpn().rate;
  if (entry.itemId && entry.qty > 0) {
    const item = getItemById(entry.itemId);
    if (item) {
      if (entry.type === 'income') opts.item = { qty: entry.qty, avgCost: item.cost, name: item.name };
      else opts.item = { qty: entry.qty, unitCost: entry.unitCost || item.cost, name: item.name };
    }
  }
  if (entry.type === 'income' && entry.sale && Array.isArray(entry.sale.lines)) {
    const lines = [];
    entry.sale.lines.forEach(l => {
      const item = l && l.itemId ? getItemById(l.itemId) : null;
      if (item && l.qty > 0) lines.push({ qty: l.qty, avgCost: (l.avgCost != null ? Number(l.avgCost) || 0 : item.cost), name: item.name });
    });
    if (lines.length) opts.saleLines = lines;
  }
  return opts;
}

function applyStockMoveForEntry(entry) {
  stockMovesFor(entry).forEach(m => {
    if (m.dir === 'out') applyStockMove(m.itemId, { qtyOut: m.qty, ref: entry.id, type: 'sale', shop: m.shop });
    else applyStockMove(m.itemId, { qtyIn: m.qty, unitCost: m.unitCost || 0, ref: entry.id, type: 'purchase', shop: m.shop });
  });
}

function reverseStockMoveForEntry(entry) {
  // JANGAN telan error: kegagalan balik stok harus terlihat (cek stok kurang).
  stockMovesFor(entry).forEach(m => {
    if (m.dir === 'out') applyStockMove(m.itemId, { qtyIn: m.qty, unitCost: 0, keepCost: true, ref: entry.id, note: 'reversal', type: 'reversal', shop: m.shop });
    else applyStockMove(m.itemId, { qtyOut: m.qty, ref: entry.id, note: 'reversal', type: 'reversal', shop: m.shop });
  });
}

export function updateEntry(id, updates) {
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) return null;
  const before = { ...entries[index] };
  if (!before.loanId) {
    assertUnlocked(before.date);
    if (updates && updates.date) assertUnlocked(updates.date);
  }
  const safe = { ...updates };
  delete safe.id;
  delete safe.loanId;
  delete safe.createdAt;
  if (safe.amount !== undefined) {
    const n = Number(safe.amount);
    if (!isFinite(n) || n <= 0) throw new Error('Jumlah tidak valid');
    safe.amount = n;
  }
  entries[index] = { ...entries[index], ...safe };
  if (entries[index].sale && Array.isArray(entries[index].sale.lines)) {
    entries[index].sale = {
      ...entries[index].sale,
      lines: entries[index].sale.lines.map(l => (l && l.itemId && l.avgCost == null) ? { ...l, avgCost: (getItemById(l.itemId) || {}).cost || 0 } : l),
    };
  }
  saveEntries(entries);
  if (!entries[index].loanId) {
    if (before.itemId || entries[index].itemId || (before.sale && before.sale.lines) || (entries[index].sale && entries[index].sale.lines)) {
      try {
        reverseStockMoveForEntry(before);
      } catch (err) {
        // Gagal membalik stok lama → batalkan edit, jangan rusak data
        entries[index] = before;
        saveEntries(entries);
        throw err;
      }
      try {
        applyStockMoveForEntry(entries[index]);
      } catch (err) {
        // Gagal terapkan baru → kembalikan lama (best-effort)
        try { applyStockMoveForEntry(before); } catch {}
        entries[index] = before;
        saveEntries(entries);
        throw err;
      }
    }
    // Bangun jurnal baru DULU; hanya hapus yang lama bila yang baru valid (jangan tinggalkan tanpa jurnal).
    let newJournal = null;
    try { newJournal = buildEntryJournal(entries[index], journalOptsFor(entries[index])); } catch { newJournal = null; }
    if (newJournal) {
      deleteJournalsByRef('entry', id);
      newJournal.refId = id;
      try { postJournal(newJournal); } catch {}
    }
    logAudit('update', 'entry', id, { amount: before.amount, category: before.category }, { amount: entries[index].amount, category: entries[index].category });
  }
  return entries[index];
}

export function deleteEntry(id) {
  requireCap('ledger');
  const entries = getEntries();
  const target = entries.find(e => e.id === id);
  if (!target) return false;
  // Balik stok DULU (net dari yang sudah diretur) — bila gagal, batalkan.
  if (!target.loanId) {
    const returned = returnedQtyFor(id);
    stockMovesFor(target).forEach(m => {
      const net = Math.max((Number(m.qty) || 0) - (returned[m.itemId] || 0), 0);
      if (net <= 0) return;
      if (m.dir === 'out') applyStockMove(m.itemId, { qtyIn: net, unitCost: 0, keepCost: true, ref: id, note: 'reversal', type: 'reversal', shop: m.shop });
      else applyStockMove(m.itemId, { qtyOut: net, ref: id, note: 'reversal', type: 'reversal', shop: m.shop });
    });
    // Hapus retur penjualan terkait + jurnalnya agar tidak menggantung.
    if (getSaleReturns(id).length) {
      saveSaleReturns(getSaleReturns().filter(r => r.saleId !== id));
      deleteJournalsByRef('sale-return', id);
    }
  }
  saveEntries(entries.filter(e => e.id !== id));
  if (!target.loanId) {
    deleteJournalsByRef('entry', id);
    logAudit('delete', 'entry', id, { amount: target.amount, category: target.category, date: target.date }, null);
  }
  return true;
}

// Masukkan kembali entry persis (untuk Urungkan hapus). Return true jika masuk.
export function restoreEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id) return false;
  const entries = getEntries();
  if (entries.some(e => e.id === entry.id)) return false;
  const copy = { ...entry };
  entries.push(copy);
  saveEntries(entries);
  if (!copy.loanId) {
    try { applyStockMoveForEntry(copy); } catch {}
    try {
      const j = buildEntryJournal(copy, journalOptsFor(copy));
      if (j) { j.refId = copy.id; postJournal(j); }
    } catch {}
  }
  return true;
}

// Masukkan kembali repayment persis (untuk Urungkan hapus). Return true jika masuk.
export function restoreRepayment(rep) {
  if (!rep || typeof rep !== 'object' || !rep.id) return false;
  const reps = getRepayments();
  if (reps.some(r => r.id === rep.id)) return false;
  reps.push({ ...rep });
  saveRepayments(reps);
  try {
    const loan = getLoanById(rep.loanId);
    if (loan) {
      const j = buildRepaymentJournal(loan, rep, reps.filter(r => r.id !== rep.id));
      if (j) { j.refId = rep.id; postJournal(j); }
    }
  } catch {}
  return true;
}

export function clearAllEntries() {
  localStorage.removeItem(STORAGE_KEY);
}

// Hapus TOTAL (dipakai tombol reset): transaksi + pinjaman + jurnal + audit
// + recurring + anggaran + stok + karyawan + ekuitas. Kontak dipertahankan.
export function clearAllData() {
  [
    STORAGE_KEY, LOAN_KEY, REPAY_KEY, JOURN_KEY, AUDIT_KEY,
    'wynara_recurring', 'wynara_budget', 'wynara_catBudget',
    ITEM_KEY, EMP_KEY, 'wynara_equity', 'wynara_lastBackup', COA_KEY, LOCK_KEY, PURCH_KEY, DRAFT_KEY,
    SALE_RET_KEY, MOVE_KEY, 'wynara_assets', SHOP_KEY, ACTIVE_SHOP_KEY,
    'wynara_leave', 'wynara_ump', 'wynara_selfTest', 'wynara_ppn', 'wynara_payroll_rates',
    BANK_STMT_KEY, BANK_RULES_KEY, BANK_ENDBAL_KEY, CREDIT_KEY, COA_ALIAS_KEY, PREORDER_KEY
  ].forEach(k => { try { localStorage.removeItem(k); } catch {} });
  // Mirror IDB ikut kosong saat refresh berikutnya (queueMirror di app.js)
}

export function exportEntries() {
  const entries = getEntries();
  return JSON.stringify(entries, null, 2);
}

export async function exportJSON() {
  const data = snapshotAll();
  // Lampiran (blob) ikut ke dalam backup supaya benar-benar bisa dipulihkan di perangkat lain.
  try { data.files = await exportBlobs(); }
  catch { data.files = []; data.filesError = true; }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wynara-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  stampLastBackup();
  try { localStorage.setItem('wynara_last_export', String(Date.now())); } catch {}
}

// String backup untuk dibagikan (WhatsApp/Email) tanpa unduhan dulu
export function backupJSONString() {
  return JSON.stringify(snapshotAll(), null, 2);
}

export function exportExcel() {
  if (typeof XLSX === 'undefined') throw new Error('Excel library belum dimuat');
  const wb = XLSX.utils.book_new();

  const entries = getEntries().map(e => ({
    Tanggal: e.date,
    Jenis: e.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    Kategori: e.category,
    'Cara Bayar': e.payment || '',
    'Detail Bayar': e.paymentDetail || '',
    Deskripsi: e.description || '',
    Jumlah: e.amount,
    Person: e.person || '',
    LoanId: e.loanId || ''
  }));
  const wsEntries = XLSX.utils.json_to_sheet(entries);
  XLSX.utils.book_append_sheet(wb, wsEntries, 'Transaksi');

  const loans = getLoans().map(l => ({
    Tanggal: l.date,
    Direksi: l.direction === 'given' ? 'Piutang' : 'Hutang',
    'Tipe Kontak': l.contactType === 'perusahaan' ? 'Perusahaan' : l.contactType === 'karyawan' ? 'Karyawan' : 'Orang',
    Nama: l.person,
    Jumlah: l.amount,
    'Tipe Pinjaman': l.loanType === 'cicilan' ? 'Cicilan' : 'Lunas (1x)',
    'Cicilan/Bulan': l.installmentAmount || '',
    'Bunga %': Number(l.interestRate) || '',
    'Jatuh Tempo': l.dueDate || '',
    Keterangan: l.description || '',
    Status: l.status === 'paid' ? 'Lunas' : 'Aktif'
  }));
  const wsLoans = XLSX.utils.json_to_sheet(loans);
  XLSX.utils.book_append_sheet(wb, wsLoans, 'Pinjaman');

  const loansCache = getLoans();
  const reps = getRepayments().map(r => {
    const loan = loansCache.find(l => l.id === r.loanId);
    return {
      Tanggal: r.date,
      'Nama Pinjaman': loan ? loan.person : '',
      Jumlah: r.amount,
      Keterangan: r.description || ''
    };
  });
  const wsReps = XLSX.utils.json_to_sheet(reps);
  XLSX.utils.book_append_sheet(wb, wsReps, 'Pembayaran');

  const people = getPeopleList().map(p => ({
    Nama: p.name,
    Tipe: p.type === 'perusahaan' ? 'Perusahaan' : p.type === 'karyawan' ? 'Karyawan' : 'Orang'
  }));
  const wsPeople = XLSX.utils.json_to_sheet(people);
  XLSX.utils.book_append_sheet(wb, wsPeople, 'Kontak');

  XLSX.writeFile(wb, `wynara-${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportExcelEntries(list, filename) {
  if (typeof XLSX === 'undefined') throw new Error('Excel library belum dimuat');
  const wb = XLSX.utils.book_new();
  const rows = (Array.isArray(list) ? list : []).map(e => ({
    Tanggal: e.date,
    Jenis: e.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
    Kategori: e.category,
    'Cara Bayar': e.payment || '',
    'Detail Bayar': e.paymentDetail || '',
    Deskripsi: e.description || '',
    Jumlah: e.amount,
    Person: e.person || '',
    LoanId: e.loanId || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Transaksi');
  XLSX.writeFile(wb, filename || `wynara-tampilan-${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Cegah formula injection di spreadsheet: sel ber-leading = + - @ ditab-kan.
function csvCell(v) {
  if (v === 0) return '"0"';
  if (v === null || v === undefined || v === '') return '""';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function exportCSVEntries(list, filename) {
  const esc = csvCell;
  const rows = [];
  rows.push(['Tanggal', 'Jenis', 'Kategori', 'Cara Bayar', 'Detail Bayar', 'Deskripsi', 'Jumlah', 'Person']);
  (Array.isArray(list) ? list : []).forEach(e => {
    rows.push([e.date, e.type === 'income' ? 'Pemasukan' : 'Pengeluaran', e.category, e.payment || '', e.paymentDetail || '', e.description || '', e.amount, e.person || '']);
  });
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `wynara-tampilan-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCSV() {
  const entries = getEntries();
  const loans = getLoans();
  const reps = getRepayments();

  const esc = csvCell;
  const rows = [];

  rows.push(['=== TRANSAKSI ===']);
  rows.push(['Tanggal', 'Jenis', 'Kategori', 'Cara Bayar', 'Detail Bayar', 'Deskripsi', 'Jumlah', 'Person']);
  entries.forEach(e => {
    rows.push([
      e.date,
      e.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      e.category,
      e.payment || '',
      e.paymentDetail || '',
      e.description || '',
      e.amount,
      e.person || ''
    ]);
  });

  rows.push([]);
  rows.push(['=== PINJAMAN ===']);
  rows.push(['Tanggal', 'Direksi', 'Tipe Kontak', 'Nama', 'Jumlah', 'Tipe Pinjaman', 'Cicilan/Bulan', 'Bunga %', 'Jatuh Tempo', 'Keterangan', 'Status']);
  loans.forEach(l => {
    rows.push([
      l.date,
      l.direction === 'given' ? 'Piutang' : 'Hutang',
      l.contactType === 'perusahaan' ? 'Perusahaan' : l.contactType === 'karyawan' ? 'Karyawan' : 'Orang',
      l.person,
      l.amount,
      l.loanType === 'cicilan' ? 'Cicilan' : 'Lunas (1x)',
      l.installmentAmount || '',
      Number(l.interestRate) || '',
      l.dueDate || '',
      l.description || '',
      l.status === 'paid' ? 'Lunas' : 'Aktif'
    ]);
  });

  rows.push([]);
  rows.push(['=== PEMBAYARAN ===']);
  rows.push(['Tanggal', 'Nama Pinjaman', 'Jumlah', 'Keterangan']);
  reps.forEach(r => {
    const loan = loans.find(l => l.id === r.loanId);
    rows.push([
      r.date,
      loan ? loan.person : '',
      r.amount,
      r.description || ''
    ]);
  });

  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wynara-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dedupEntries(existing, incoming) {
  // Duplikat bila id sama (restore) ATAU konten sama (impor CSV berulang).
  const contentKey = (e) => `${e.date}|${e.type || ''}|${e.category}|${e.amount}|${e.payment || ''}|${e.description || ''}|${e.person || ''}`;
  const ids = new Set(existing.filter(e => e.id).map(e => e.id));
  const keys = new Set(existing.map(contentKey));
  const out = [];
  for (const e of incoming) {
    const dup = (e.id && ids.has(e.id)) || keys.has(contentKey(e));
    if (dup) continue;
    if (e.id) ids.add(e.id);
    keys.add(contentKey(e));
    out.push(e);
  }
  return out;
}

export function importExcel(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'json') return importJSONFile(file);
  if (ext === 'csv') return importCSVFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        let cE = 0, cL = 0, cR = 0, cP = 0;

        const entrySheet = wb.Sheets['Transaksi'] || wb.Sheets['transaksi'] || wb.Sheets[wb.SheetNames[0]];
        if (entrySheet && wb.SheetNames.includes('Transaksi')) {
          const rows = XLSX.utils.sheet_to_json(entrySheet);
          const entries = rows.map(r => ({
            id: generateId(),
            date: String(r.Tanggal || '').slice(0, 10),
            type: r.Jenis === 'Pemasukan' ? 'income' : 'expense',
            category: sanitizeCategory(r.Kategori),
            payment: String(r['Cara Bayar'] || 'cash').trim() || 'cash',
            paymentDetail: String(r['Detail Bayar'] || r['Detail'] || '').slice(0, 60),
            description: String(r.Deskripsi || '').slice(0, 120),
            amount: Number(r.Jumlah),
            person: String(r.Person || '').slice(0, 60),
            loanId: r.LoanId || null
          })).filter(e => e.date && !isNaN(new Date(e.date)) && e.category && isFinite(e.amount) && e.amount > 0);
          const deduped = dedupEntries(getEntries(), entries);
          if (deduped.length) {
            saveEntries(getEntries().concat(deduped));
            cE = deduped.length;
          }
        }

        const loanSheet = wb.Sheets['Pinjaman'];
        if (loanSheet) {
          const rows = XLSX.utils.sheet_to_json(loanSheet);
          const loans = rows.map(r => ({
            id: generateId(),
            direction: r.Direksi === 'Piutang' ? 'given' : 'taken',
            contactType: r['Tipe Kontak'] === 'Perusahaan' ? 'perusahaan' : r['Tipe Kontak'] === 'Karyawan' ? 'karyawan' : 'person',
            person: String(r.Nama || '').trim(),
            amount: Number(r.Jumlah),
            loanType: r['Tipe Pinjaman'] === 'Cicilan' ? 'cicilan' : 'lunas',
            installmentAmount: Number(r['Cicilan/Bulan']) || 0,
            interestRate: clampInterestRate(r['Bunga %']),
            date: String(r.Tanggal || '').slice(0, 10),
            dueDate: String(r['Jatuh Tempo'] || '').slice(0, 10),
            description: String(r.Keterangan || '').slice(0, 120),
            status: r.Status === 'Lunas' ? 'paid' : 'active'
          })).filter(l => l.date && !isNaN(new Date(l.date)) && l.person && isFinite(l.amount) && l.amount > 0);
          if (loans.length) {
            const existing = getLoans();
            const deduped = loans.filter(nl => !existing.some(el => el.person === nl.person && el.amount === nl.amount && el.date === nl.date));
            if (deduped.length) {
              saveLoans(existing.concat(deduped));
              cL = deduped.length;
            }
          }
        }

        const repSheet = wb.Sheets['Pembayaran'];
        if (repSheet) {
          const rows = XLSX.utils.sheet_to_json(repSheet);
          // repayments need loan mapping by person name
          const loans = getLoans();
          const reps = rows.map(r => {
            const person = String(r['Nama Pinjaman'] || '').trim();
            const loan = loans.find(l => l.person === person);
            return {
              id: generateId(),
              loanId: loan ? loan.id : null,
              amount: Number(r.Jumlah),
              date: String(r.Tanggal || '').slice(0, 10),
              description: String(r.Keterangan || '').slice(0, 120)
            };
          }).filter(r => r.loanId && isFinite(r.amount) && r.amount > 0 && r.date && !isNaN(new Date(r.date)));
          if (reps.length) {
            const existing = getRepayments();
            saveRepayments(existing.concat(reps));
            cR = reps.length;
            // update loan status
            reps.forEach(r => {
              const loan = getLoanById(r.loanId);
              if (loan) {
                const total = getRepayments().filter(x => x.loanId === loan.id).reduce((s, x) => s + x.amount, 0);
                if (total >= totalOwed(loan)) updateLoan(loan.id, { status: 'paid' });
              }
            });
          }
        }

        const peopleSheet = wb.Sheets['Kontak'];
        if (peopleSheet) {
          const rows = XLSX.utils.sheet_to_json(peopleSheet);
          let added = 0;
          rows.forEach(r => {
            const name = String(r.Nama || '').trim();
            const type = r.Tipe === 'Perusahaan' ? 'perusahaan' : r.Tipe === 'Karyawan' ? 'karyawan' : 'person';
            if (name) {
              const before = getPeopleList().length;
              savePerson(name, type);
              if (getPeopleList().length > before) added++;
            }
          });
          cP = added;
        }

        resolve({ entries: cE, loans: cL, repayments: cR, people: cP });
      } catch (err) {
        reject(new Error('Gagal membaca file Excel: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });
}

const MAX_IMPORT_ROWS = 50000;
const VALID_PAYMENTS = ['cash', 'credit', 'qris', 'transfer', 'debit', 'ewallet', 'paylater', 'other'];

function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s));
}

function sanitizeEntry(ent) {
  if (!ent || typeof ent !== 'object') return null;
  const amount = Number(ent.amount);
  const date = String(ent.date || '').slice(0, 10);
  const type = ent.type === 'income' ? 'income' : (ent.type === 'expense' ? 'expense' : null);
  const category = sanitizeCategory(ent.category);
  if (!isValidDateStr(date) || !type || !category || !isFinite(amount) || amount <= 0) return null;
  const payment = VALID_PAYMENTS.includes(ent.payment) ? ent.payment : 'cash';
  const rec = {
    id: String(ent.id || generateId()).slice(0, 60),
    date, type, category, payment,
    paymentDetail: String(ent.paymentDetail || '').slice(0, 60),
    description: String(ent.description || '').slice(0, 120),
    amount,
    person: String(ent.person || '').slice(0, 60),
    loanId: ent.loanId ? String(ent.loanId).slice(0, 60) : null
  };
  // Jangan buang data penting saat restore/import: PPN, barang, baris penjualan, payroll, pinjaman.
  if (ent.ppn) rec.ppn = true;
  if (ent.verified === true) { rec.verified = true; rec.verifiedAt = String(ent.verifiedAt || '').slice(0, 40); rec.verifiedBy = String(ent.verifiedBy || '').slice(0, 40); }
  if (ent.shop) rec.shop = String(ent.shop).slice(0, 40);
  if (ent.itemId) rec.itemId = String(ent.itemId).slice(0, 60);
  if (Number(ent.qty) > 0) rec.qty = Math.floor(Number(ent.qty));
  if (ent.unitCost !== undefined) rec.unitCost = Math.max(Number(ent.unitCost) || 0, 0);
  if (ent.sale && typeof ent.sale === 'object') {
    const lines = Array.isArray(ent.sale.lines) ? ent.sale.lines.filter(l => l && l.itemId && Number(l.qty) > 0).map(l => ({
      itemId: String(l.itemId).slice(0, 60), qty: Math.floor(Number(l.qty)) || 0,
      price: Math.max(Number(l.price) || 0, 0), avgCost: l.avgCost != null ? Math.max(Number(l.avgCost) || 0, 0) : undefined,
    })) : [];
    rec.sale = { lines, total: Math.max(Number(ent.sale.total) || 0, 0), subtotal: Math.max(Number(ent.sale.subtotal) || 0, 0), discount: Math.max(Number(ent.sale.discount) || 0, 0) };
  }
  if (ent.payroll && typeof ent.payroll === 'object') rec.payroll = ent.payroll;
  if (ent.loanDue) rec.loanDue = String(ent.loanDue).slice(0, 10);
  if (ent.loanType) rec.loanType = ent.loanType;
  if (ent.installmentAmount) rec.installmentAmount = Number(ent.installmentAmount) || 0;
  if (ent.contactType) rec.contactType = ent.contactType;
  if (ent.createdAt) rec.createdAt = ent.createdAt;
  return rec;
}

function clampInterestRate(r) {
  const n = Number(r);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 100) / 100, 100);
}

function sanitizeLoan(l) {
  if (!l || typeof l !== 'object') return null;
  const amount = Number(l.amount);
  const date = String(l.date || '').slice(0, 10);
  const person = String(l.person || '').trim().slice(0, 60);
  if (!isValidDateStr(date) || !person || !isFinite(amount) || amount <= 0) return null;
  return {
    id: String(l.id || generateId()).slice(0, 60),
    direction: l.direction === 'taken' ? 'taken' : 'given',
    contactType: l.contactType === 'perusahaan' ? 'perusahaan' : l.contactType === 'karyawan' ? 'karyawan' : 'person',
    loanType: l.loanType === 'cicilan' ? 'cicilan' : 'lunas',
    installmentAmount: Math.max(Number(l.installmentAmount) || 0, 0),
    interestRate: clampInterestRate(l.interestRate),
    invoiceNo: String(l.invoiceNo || '').slice(0, 30),
    employeeId: l.employeeId ? String(l.employeeId).slice(0, 60) : undefined,
    person, amount, date,
    dueDate: isValidDateStr(l.dueDate) ? String(l.dueDate).slice(0, 10) : '',
    description: String(l.description || '').slice(0, 120),
    status: l.status === 'paid' ? 'paid' : 'active',
    entryId: l.entryId ? String(l.entryId).slice(0, 60) : undefined,
    createdAt: l.createdAt || new Date().toISOString()
  };
}

function sanitizeRepayment(r, knownLoanIds) {
  if (!r || typeof r !== 'object') return null;
  const amount = Number(r.amount);
  const date = String(r.date || '').slice(0, 10);
  const loanId = String(r.loanId || '');
  if (!loanId || !knownLoanIds.has(loanId)) return null;
  if (!isValidDateStr(date) || !isFinite(amount) || amount <= 0) return null;
  return {
    id: String(r.id || generateId()).slice(0, 60),
    loanId,
    amount, date,
    description: String(r.description || '').slice(0, 120),
    entryId: r.entryId ? String(r.entryId).slice(0, 60) : undefined,
    createdAt: r.createdAt || new Date().toISOString()
  };
}

// Validasi schema file backup JSON. Return { ok, errors[], skipped }.
// Tidak pernah crash untuk input apapun — selalu return atau throw pesan jelas.
export function validateBackupJSON(text) {
  const errors = [];
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File bukan JSON yang valid'], skipped: 0 };
  }
  if (data === null || typeof data !== 'object') {
    return { ok: false, errors: ['File ini bukan backup Wynara (isi harus objek atau daftar transaksi)'], skipped: 0 };
  }
  const rows = Array.isArray(data) ? data : (data.entries || data.loans || data.repayments || data.people ? data : null);
  if (!rows) {
    return { ok: false, errors: ['File ini bukan backup Wynara (tidak ada entries / loans / repayments / people)'], skipped: 0 };
  }
  const counts = ['entries', 'loans', 'repayments', 'people'].map(k => Array.isArray(data[k]) ? data[k].length : (Array.isArray(rows) && k === 'entries' ? rows.length : 0));
  if (counts.some(c => c > MAX_IMPORT_ROWS)) {
    errors.push(`File terlalu besar (maks ${MAX_IMPORT_ROWS} baris per bagian)`);
    return { ok: false, errors, skipped: 0 };
  }
  return { ok: true, errors, skipped: 0 };
}

async function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const check = validateBackupJSON(e.target.result);
        if (!check.ok) {
          reject(new Error(check.errors[0]));
          return;
        }
        const data = JSON.parse(e.target.result);
        let cE = 0, cL = 0, cR = 0, cP = 0, cJ = 0, cI = 0, cM = 0, cB = 0, skipped = 0;
        if (Array.isArray(data)) {
          // legacy: array of entries
          const valid = [];
          data.forEach(ent => { const s = sanitizeEntry(ent); if (s) valid.push(s); else skipped++; });
          const deduped = dedupEntries(getEntries(), valid);
          if (deduped.length) { saveEntries(getEntries().concat(deduped)); cE = deduped.length; }
          skipped += valid.length - deduped.length;
        } else {
          if (Array.isArray(data.entries)) {
            const valid = [];
            data.entries.forEach(ent => { const s = sanitizeEntry(ent); if (s) valid.push(s); else skipped++; });
            const deduped = dedupEntries(getEntries(), valid);
            if (deduped.length) { saveEntries(getEntries().concat(deduped)); cE = deduped.length; }
            skipped += valid.length - deduped.length;
          }
          const knownLoanIds = new Set(getLoans().map(l => l.id));
          if (Array.isArray(data.loans)) {
            const existing = getLoans();
            const toAdd = [];
            data.loans.forEach(nl => {
              const s = sanitizeLoan(nl);
              if (!s) { skipped++; return; }
              if (existing.some(el => el.person === s.person && el.amount === s.amount && el.date === s.date)) { skipped++; return; }
              toAdd.push(s);
              knownLoanIds.add(s.id);
            });
            if (toAdd.length) { saveLoans(existing.concat(toAdd)); cL = toAdd.length; }
          }
          if (Array.isArray(data.repayments)) {
            const existing = getRepayments();
            const have = new Set(existing.map(r => r.id + '|' + r.loanId + '|' + r.amount + '|' + r.date));
            const toAdd = [];
            data.repayments.forEach(r => {
              const s = sanitizeRepayment(r, knownLoanIds);
              if (!s) { skipped++; return; }
              const key = s.id + '|' + s.loanId + '|' + s.amount + '|' + s.date;
              if (have.has(key)) { skipped++; return; }
              have.add(key);
              toAdd.push(s);
            });
            if (toAdd.length) {
              saveRepayments(existing.concat(toAdd));
              cR = toAdd.length;
              // refresh loan paid status
              toAdd.forEach(r => {
                const loan = getLoanById(r.loanId);
                if (loan) {
                  const total = getRepayments().filter(x => x.loanId === loan.id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
                  if (total >= totalOwed(loan)) updateLoan(loan.id, { status: 'paid' });
                }
              });
            }
          }
          if (Array.isArray(data.people)) {
            let added = 0;
            data.people.forEach(p => {
              const name = p && String(p.name || '').trim().slice(0, 60);
              if (!name) { skipped++; return; }
              const before = getPeopleList().length;
              try { savePerson(name, p.type === 'perusahaan' ? 'perusahaan' : 'person', p.phone); } catch { skipped++; return; }
              if (getPeopleList().length > before) added++; else skipped++;
            });
            cP = added;
          }
          // Backup v3 juga bawa jurnal/barang/karyawan/ekuitas — gabungkan juga
          if (Array.isArray(data.journals)) {
            const have = new Set(getJournals().map(j => j.id));
            const toAdd = data.journals.filter(j => j && j.id && !have.has(j.id) && Array.isArray(j.lines) && j.lines.length);
            if (toAdd.length) { saveJournals(getJournals().concat(toAdd)); cJ = toAdd.length; }
            skipped += data.journals.length - toAdd.length;
          }
          if (Array.isArray(data.items)) {
            const have = new Set(getItems().map(i => i.id));
            data.items.forEach(it => {
              if (!it || typeof it !== 'object') { skipped++; return; }
              if (it.id && have.has(it.id)) { skipped++; return; }
              try {
                const before = getItems().length;
                saveItem({ ...it });
                if (it.id) have.add(it.id);
                if (getItems().length > before) cI++; else skipped++;
              } catch { skipped++; }
            });
          }
          if (Array.isArray(data.employees)) {
            const have = new Set(getAllEmployees().map(e => e.id));
            data.employees.forEach(em => {
              if (!em || typeof em !== 'object') { skipped++; return; }
              if (em.id && have.has(em.id)) { skipped++; return; }
              try {
                const before = getAllEmployees().length;
                saveEmployee({ ...em });
                if (em.id) have.add(em.id);
                if (getAllEmployees().length > before) cM++; else skipped++;
              } catch { skipped++; }
            });
          }
          if (data.budget && typeof data.budget === 'object' && Number(data.budget.amount) > 0) {
            try { saveBudget({ amount: Number(data.budget.amount), updatedAt: data.budget.updatedAt || new Date().toISOString() }); } catch {}
          }
          if (Array.isArray(data.recurring)) {
            try { saveRecurring(data.recurring.filter(r => r && typeof r === 'object')); } catch {}
          }
          if (data.equity && typeof data.equity === 'object' && Number(data.equity.amount) > 0) {
            try { saveOpeningEquity(data.equity.amount); } catch {}
          }
          if (Array.isArray(data.locks)) {
            try {
              const valid = data.locks.filter(m => /^\d{4}-\d{2}$/.test(m));
              const merged = [...new Set(getLockedMonths().concat(valid))].sort();
              localStorage.setItem(LOCK_KEY, JSON.stringify(merged));
            } catch {}
          }
          if (data.drafts && typeof data.drafts === 'object' && !Array.isArray(data.drafts)) {
            try {
              let o = {};
              try { o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch {}
              Object.keys(data.drafts).forEach(k => {
                if (/^\d{4}-\d{2}$/.test(k) && data.drafts[k] && typeof data.drafts[k] === 'object' && !o[k]) o[k] = data.drafts[k];
              });
              localStorage.setItem(DRAFT_KEY, JSON.stringify(o));
            } catch {}
          }
          if (Array.isArray(data.purchases)) {
            const have = new Set(getPurchases().map(p => p.id));
            const toAdd = [];
            data.purchases.forEach(p => {
              if (!p || !p.id || have.has(p.id)) { skipped++; return; }
              if (!p.supplier || !isValidDateStr(String(p.date || '').slice(0, 10)) || !Array.isArray(p.lines) || !p.lines.length) { skipped++; return; }
              have.add(p.id);
              toAdd.push(p);
            });
            if (toAdd.length) {
              savePurchases(getPurchases().concat(toAdd));
              cB = toAdd.length;
              // Item sudah diimpor dengan stok terkini — jangan terapkan qty pembelian lagi (gandakan stok).
            }
          }
        }
          if (Array.isArray(data.coa)) {
            const have = new Set(getCustomAccounts().map(a => a.code));
            const clean = data.coa.filter(a => a && /^\d{4}$/.test(a.code) && !have.has(a.code) && COA_TYPES.includes(a.type) && a.name);
            if (clean.length) {
              try { localStorage.setItem(COA_KEY, JSON.stringify(getCustomAccounts().concat(clean))); } catch { skipped += clean.length; }
            }
          }
        // Lampiran (blob) dari backup — dipulihkan tanpa menimpa berkas yang sudah ada.
        importBlobs(data.files).then((cF) => {
          resolve({ entries: cE, loans: cL, repayments: cR, people: cP, journals: cJ || 0, items: cI || 0, employees: cM || 0, purchases: cB || 0, files: cF || 0, skipped });
        }).catch(() => {
          resolve({ entries: cE, loans: cL, repayments: cR, people: cP, journals: cJ || 0, items: cI || 0, employees: cM || 0, purchases: cB || 0, files: 0, skipped });
        });
      } catch (err) {
        reject(new Error('Gagal membaca JSON: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsText(file);
  });
}

// Parser baris CSV yang hormati kutip ("a,b" tetap 1 kolom).
export function parseCsvRow(line, delim) {
  const d = delim === ';' ? ';' : ',';
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === d) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function importCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target.result || '').replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('==='));
        // Deteksi delimiter dari baris header (koma vs titik-koma)
        const headLine = lines.find(l => l.includes('Tanggal') && l.includes('Jenis')) || lines[0] || '';
        const nComma = (headLine.match(/,/g) || []).length;
        const nSemi = (headLine.match(/;/g) || []).length;
        const delim = nSemi > nComma ? ';' : ',';
        const rows = [];
        for (const line of lines) {
          if (line.includes('Tanggal') && line.includes('Jenis')) continue;
          if (line.includes('=== PINJAMAN') || line.includes('=== PEMBAYARAN')) break;
          const cols = parseCsvRow(line, delim);
          if (cols.length >= 6 && cols[0] && !isNaN(new Date(cols[0]))) {
            rows.push(cols);
          }
        }
        const entries = rows.map(cols => ({
          id: generateId(),
          date: cols[0],
          type: cols[1] === 'Pemasukan' ? 'income' : 'expense',
          category: sanitizeCategory(cols[2]),
          payment: cols[3] || 'cash',
          paymentDetail: cols[4] || '',
          description: cols[5] || '',
          amount: Number(cols[6]),
          person: cols[7] || '',
          loanId: null
        })).filter(en => en.date && en.category && isFinite(en.amount) && en.amount > 0);
        const deduped = dedupEntries(getEntries(), entries);
        if (deduped.length) saveEntries(getEntries().concat(deduped));
        resolve({ entries: deduped.length, loans: 0, repayments: 0, people: 0 });
      } catch (err) {
        reject(new Error('Gagal membaca CSV: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsText(file);
  });
}

export function importEntries(jsonString) {
  let entries;
  try {
    entries = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON file');
  }
  if (!Array.isArray(entries)) throw new Error('Invalid format');
  // baris rusak (null, tanggal salah, nominal ≤ 0) dilewati satu-satu
  const validEntries = entries.map(sanitizeEntry).filter(Boolean);
  const deduped = dedupEntries(getEntries(), validEntries);
  saveEntries(getEntries().concat(deduped));
  return deduped;
}

export function getCategories() {
  const entries = getEntries();
  const categories = new Set();
  entries.forEach(e => categories.add(e.category));
  return Array.from(categories).sort();
}

// ===== Loans (Piutang / Hutang) =====
const LOAN_KEY = 'ledger_loans';
const REPAY_KEY = 'ledger_repayments';

function getLoans() {
  try {
    const data = localStorage.getItem(LOAN_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLoans(loans) {
  try {
    localStorage.setItem(LOAN_KEY, JSON.stringify(loans));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') throw new Error('Penyimpanan pinjaman penuh');
    throw e;
  }
}

function getRepayments() {
  try {
    const data = localStorage.getItem(REPAY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveRepayments(repayments) {
  try {
    localStorage.setItem(REPAY_KEY, JSON.stringify(repayments));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') throw new Error('Penyimpanan pembayaran penuh');
    throw e;
  }
}

function loanEntryData(loan, isRepayment, amount, date, payment, paymentDetail) {
  const isPiutang = loan.direction === 'given';
  const pay = payment || loan.payment || 'cash';
  const payDetail = (paymentDetail !== undefined ? paymentDetail : loan.paymentDetail) || '';
  if (!isRepayment) {
    const type = isPiutang ? 'expense' : 'income';
    const category = isPiutang ? 'Piutang' : 'Hutang';
    const desc = (isPiutang ? 'Kasih pinjam ke ' : 'Pinjam dari ') + loan.person;
    // Jangan timpa catatan user saat loan diedit (updateLoan pakai fungsi ini juga)
    const keepDesc = String(loan.description || '').trim() || desc;
    return { type, category, amount: loan.amount, date: loan.date, description: keepDesc, person: loan.person, loanId: loan.id, payment: pay, paymentDetail: String(payDetail).slice(0, 60), loanDue: loan.dueDate || '', loanType: loan.loanType || 'lunas', installmentAmount: loan.installmentAmount || 0, contactType: loan.contactType || 'person' };
  }
  const type = isPiutang ? 'income' : 'expense';
  const category = isPiutang ? 'Piutang' : 'Hutang';
  const desc = (isPiutang ? 'Dibalikin dari ' : 'Balikin ke ') + loan.person;
  return { type, category, amount, date, description: desc, person: loan.person, loanId: loan.id, payment: pay, paymentDetail: String(payDetail).slice(0, 60) };
}

export function getAllLoans() {
  return getLoans().sort((a, b) => {
    const da = new Date(a.date), db = new Date(b.date);
    return (isNaN(db) ? 0 : db.getTime()) - (isNaN(da) ? 0 : da.getTime());
  });
}

export function getLoanById(id) {
  return getLoans().find(l => l.id === id);
}

// Cocokkan nama kontak ke karyawan aktif (untuk kasbon otomatis dari gaji).
function matchEmployeeId(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return '';
  try {
    const e = getAllEmployees().find(x => String(x.name || '').trim().toLowerCase() === n);
    return e ? e.id : '';
  } catch { return ''; }
}

// Pinjaman (piutang) milik seorang karyawan — untuk potong gaji otomatis.
export function getKasbonLoans(employeeId, employeeName) {
  const name = String(employeeName || '').trim().toLowerCase();
  return getLoans().filter(l => l.direction === 'given' && l.status !== 'paid' &&
    ((employeeId && l.employeeId === employeeId) ||
      (!l.employeeId && name && String(l.person || '').trim().toLowerCase() === name)));
}

export function createLoan(loan) {
  requireCap('ledger');
  const loans = getLoans();
  const amount = Number(loan.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Jumlah pinjaman tidak valid');
  if (!loan.person || !String(loan.person).trim()) throw new Error('Nama kontak wajib');
  assertUnlocked(loan.date);
  const newLoan = {
    id: generateId(),
    direction: loan.direction === 'taken' ? 'taken' : 'given',
    contactType: loan.contactType || 'person',
    loanType: loan.loanType || 'lunas',
    installmentAmount: Number(loan.installmentAmount) || 0,
    person: String(loan.person).trim().slice(0, 60),
    amount,
    date: loan.date,
    dueDate: loan.dueDate || '',
    description: String(loan.description || '').slice(0, 120),
    payment: loan.payment || 'cash',
    paymentDetail: String(loan.paymentDetail || '').slice(0, 60),
    interestRate: clampInterestRate(loan.interestRate),
    invoiceNo: String(loan.invoiceNo || '').slice(0, 30),
    employeeId: loan.employeeId || matchEmployeeId(loan.person),
    status: 'active',
    createdAt: new Date().toISOString()
  };
  loans.push(newLoan);
  saveLoans(loans);
  try {
    const entry = createEntry(loanEntryData(newLoan, false));
    newLoan.entryId = entry.id;
    saveLoans(loans);
  } catch (e) {
    // rollback loan if entry fails
    saveLoans(getLoans().filter(l => l.id !== newLoan.id));
    throw e;
  }
  try {
    const j = buildLoanJournal(newLoan);
    if (j) { j.refId = newLoan.id; postJournal(j); }
  } catch {}
  try { savePerson(newLoan.person, newLoan.contactType); } catch {}
  logAudit('create', 'loan', newLoan.id, null, { person: newLoan.person, amount: newLoan.amount, direction: newLoan.direction });
  return newLoan;
}

export function updateLoan(id, updates) {
  requireCap('ledger');
  const loans = getLoans();
  const index = loans.findIndex(l => l.id === id);
  if (index === -1) return null;
  const oldPerson = loans[index].person;
  const sanitized = { ...updates };
  if (sanitized.person) sanitized.person = String(sanitized.person).trim().slice(0, 60);
  if (sanitized.amount !== undefined) {
    const n = Number(sanitized.amount);
    if (!isFinite(n) || n <= 0) throw new Error('Jumlah tidak valid');
    sanitized.amount = n;
  }
  if (sanitized.interestRate !== undefined) {
    sanitized.interestRate = clampInterestRate(sanitized.interestRate);
  }
  loans[index] = { ...loans[index], ...sanitized };
  const loan = loans[index];
  if (sanitized.person !== undefined && sanitized.employeeId === undefined) {
    loan.employeeId = matchEmployeeId(loan.person);
  }
  // Status ikut kebenaran: lunas kalau terbayar >= total (kecuali status diset eksplisit)
  if (sanitized.status === undefined) {
    try {
      const total = getRepayments().filter(r => r.loanId === id).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      loan.status = total >= totalOwed(loan) ? 'paid' : 'active';
    } catch {}
  }
  // cascade rename if person changed
  if (oldPerson !== loan.person) {
    // update related entries person field
    const entries = getEntries();
    let changed = false;
    entries.forEach(en => {
      if (en.loanId === loan.id) { en.person = loan.person; changed = true; }
    });
    if (changed) saveEntries(entries);
  }
  if (loan.entryId) {
    try { updateEntry(loan.entryId, loanEntryData(loan, false)); } catch {}
  }
  deleteJournalsByRef('loan', id);
  try {
    const j = buildLoanJournal(loan);
    if (j) { j.refId = id; postJournal(j); }
  } catch {}
  saveLoans(loans);
  logAudit('update', 'loan', id, { amount: undefined }, { person: loan.person, amount: loan.amount, status: loan.status });
  return loan;
}

export function deleteLoan(id) {
  requireCap('ledger');
  const loan = getLoanById(id);
  if (loan && loan.entryId) try { deleteEntry(loan.entryId); } catch {}
  const reps = getRepayments().filter(r => r.loanId === id);
  reps.forEach(r => { if (r.entryId) try { deleteEntry(r.entryId); } catch {} });
  saveLoans(getLoans().filter(l => l.id !== id));
  saveRepayments(getRepayments().filter(r => r.loanId !== id));
  deleteJournalsByRef('loan', id);
  reps.forEach(r => deleteJournalsByRef('repayment', r.id));
  if (loan) logAudit('delete', 'loan', id, { person: loan.person, amount: loan.amount }, null);
}

export function getAllRepayments() {
  return getRepayments();
}

export function addRepayment(repayment) {
  requireCap('ledger');
  const loan = getLoanById(repayment.loanId);
  if (!loan) throw new Error('Pinjaman tidak ditemukan');
  const amount = Number(repayment.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Jumlah bayar tidak valid');
  assertUnlocked(repayment.date);
  const repayments = getRepayments();
  const newRep = {
    id: generateId(),
    loanId: repayment.loanId,
    amount,
    date: repayment.date,
    description: String(repayment.description || '').slice(0, 120),
    payment: repayment.payment || 'cash',
    paymentDetail: String(repayment.paymentDetail || '').slice(0, 60),
    createdAt: new Date().toISOString()
  };
  const entry = createEntry(loanEntryData(loan, true, newRep.amount, newRep.date, newRep.payment, newRep.paymentDetail));
  newRep.entryId = entry.id;
  repayments.push(newRep);
  saveRepayments(repayments);
  try {
    const j = buildRepaymentJournal(loan, newRep, repayments.filter(r => r.id !== newRep.id));
    if (j) { j.refId = newRep.id; postJournal(j); }
  } catch {}
  logAudit('create', 'repayment', newRep.id, null, { loanId: newRep.loanId, amount: newRep.amount, date: newRep.date });

  const totalRepaid = repayments
    .filter(r => r.loanId === loan.id)
    .reduce((sum, r) => sum + r.amount, 0);
  if (totalRepaid >= totalOwed(loan)) {
    updateLoan(loan.id, { status: 'paid' });
  }
  return newRep;
}

// Potong kasbon dari gaji: catat pelunasan + Dr Beban Gaji Cr Piutang.
// Menghindari "kas masuk palsu" karena THP gaji sudah dikurangi potongan ini.
export function applyPayrollKasbon(loanId, amount, date, monthKey) {
  requireCap('payroll');
  const loan = getLoanById(loanId);
  if (!loan) throw new Error('Pinjaman tidak ditemukan');
  const reps = getRepayments();
  const loanReps = reps.filter(r => r.loanId === loan.id);
  const paid = loanReps.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const outstanding = Math.max(totalOwed(loan) - paid, 0);
  const amt = Math.min(Math.round(Number(amount) || 0), Math.round(outstanding));
  if (amt <= 0) return null;
  const prior = loanReps.slice();
  const newRep = {
    id: generateId(),
    loanId,
    amount: amt,
    date,
    description: `Kasbon ${loan.person || ''} (gaji ${monthKey})`.trim(),
    payment: 'payroll',
    source: 'payroll',
    payrollMonth: String(monthKey || ''),
    createdAt: new Date().toISOString()
  };
  reps.push(newRep);
  saveRepayments(reps);
  try {
    const j = buildPayrollKasbonJournal(loan, amt, date, newRep.description, prior);
    if (j) { j.refId = newRep.id; postJournal(j); }
  } catch {}
  logAudit('create', 'repayment', newRep.id, null, { loanId, amount: amt, source: 'payroll', month: monthKey });
  if (paid + amt >= totalOwed(loan)) updateLoan(loan.id, { status: 'paid' });
  return newRep;
}

export function deleteRepayment(id) {
  requireCap('ledger');
  const rep = getRepayments().find(r => r.id === id);
  if (rep && rep.entryId) try { deleteEntry(rep.entryId); } catch {}
  const repayments = getRepayments().filter(r => r.id !== id);
  saveRepayments(repayments);
  deleteJournalsByRef('repayment', id);
  if (rep) logAudit('delete', 'repayment', id, { loanId: rep.loanId, amount: rep.amount }, null);
  if (rep) {
    const loan = getLoanById(rep.loanId);
    if (loan) {
      const total = repayments
        .filter(r => r.loanId === loan.id)
        .reduce((sum, r) => sum + r.amount, 0);
      updateLoan(loan.id, { status: total >= totalOwed(loan) ? 'paid' : 'active' });
    }
  }
}

export function getLoanRepayments(loanId) {
  return getRepayments().filter(r => r.loanId === loanId);
}

export function getRepaymentById(id) {
  return getRepayments().find(r => r.id === id) || null;
}

export function clearAllLoans() {
  const loans = getLoans();
  const reps = getRepayments();
  // remove orphan ledger entries
  const loanEntryIds = new Set([...loans.map(l => l.entryId), ...reps.map(r => r.entryId)].filter(Boolean));
  if (loanEntryIds.size) {
    // remove all entries with loanId (principal + repayments)
    const clean = getEntries().filter(e => !e.loanId);
    saveEntries(clean);
  }
  localStorage.removeItem(LOAN_KEY);
  localStorage.removeItem(REPAY_KEY);
}

// ===== People (saved contacts for loans) =====
const PEOPLE_KEY = 'ledger_people';

function getPeopleList() {
  try {
    const data = localStorage.getItem(PEOPLE_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed : []; // jangan pernah kembalikan null
  } catch {
    return [];
  }
}

function savePeopleList(people) {
  try {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(people));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') throw new Error('Penyimpanan kontak penuh');
    throw e;
  }
}

export function getAllPeople() {
  return getPeopleList().sort((a, b) => a.name.localeCompare(b.name));
}

// 5.8 Normalisasi nama kontak: rapikan spasi (dalam & tepi) agar "Aan"/"Aan " tak jadi dua kontak.
function cleanPersonName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}
export function savePerson(name, type, phone) {
  const trimmed = cleanPersonName(name);
  if (!trimmed) return;
  if (trimmed.length > 60) throw new Error('Nama terlalu panjang');
  const cleanPhone = String(phone || '').replace(/[^0-9+]/g, '').slice(0, 18);
  const people = getPeopleList();
  if (!people.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
    people.push({ id: generateId(), name: trimmed, type: type || 'person', phone: cleanPhone });
    savePeopleList(people);
  } else {
    // update type/phone if different
    const idx = people.findIndex(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (idx !== -1) {
      if (people[idx].type !== (type || 'person')) people[idx].type = type || 'person';
      if (cleanPhone && people[idx].phone !== cleanPhone) people[idx].phone = cleanPhone;
      savePeopleList(people);
    }
  }
}

export function updatePerson(id, name, type, phone) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Nama wajib');
  if (trimmed.length > 60) throw new Error('Nama terlalu panjang');
  const people = getPeopleList().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'id', { sensitivity: 'base' }));
  const index = people.findIndex(p => p.id === id);
  if (index === -1) return null;
  // check duplicate (case-insensitive) excluding self
  if (people.some(p => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Nama kontak sudah ada');
  }
  const oldName = people[index].name;
  const cleanPhone = phone === undefined ? people[index].phone : String(phone || '').replace(/[^0-9+]/g, '').slice(0, 18);
  people[index] = { ...people[index], name: trimmed, type: type || 'person', phone: cleanPhone || '' };
  savePeopleList(people);
  // cascade rename to loans
  if (oldName !== trimmed) {
    const loans = getLoans();
    let changed = false;
    loans.forEach(l => { if (l.person === oldName) { l.person = trimmed; l.contactType = type || l.contactType; changed = true; } });
    if (changed) saveLoans(loans);
    // also update entries person
    const entries = getEntries();
    let eChanged = false;
    entries.forEach(en => { if (en.person === oldName) { en.person = trimmed; eChanged = true; } });
    if (eChanged) saveEntries(entries);
  }
  return people[index];
}

export function deletePerson(id) {
  const people = getPeopleList().filter(p => p.id !== id);
  savePeopleList(people);
  // keep loans but they will show orphan - not delete
}

export function getBudget() {
  try {
    const v = localStorage.getItem('wynara_budget');
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

export function saveBudget(budget) {
  localStorage.setItem('wynara_budget', JSON.stringify(budget));
}

// Anggaran per kategori: { [category]: amount }
export function getCategoryBudgets() {
  try {
    const v = localStorage.getItem('wynara_catBudget');
    const o = v ? JSON.parse(v) : {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out = {};
    Object.keys(o).forEach(k => {
      const n = Number(o[k]);
      if (k && isFinite(n) && n > 0) out[k.slice(0, 60)] = n;
    });
    return out;
  } catch { return {}; }
}

export function saveCategoryBudgets(obj) {
  localStorage.setItem('wynara_catBudget', JSON.stringify(obj || {}));
}

export function setCategoryBudget(category, amount) {
  const all = getCategoryBudgets();
  const n = Number(amount);
  if (!category) return all;
  if (!isFinite(n) || n <= 0) delete all[category];
  else all[category] = n;
  saveCategoryBudgets(all);
  return all;
}

export function getRecurring() {
  try {
    const v = localStorage.getItem('wynara_recurring');
    const parsed = v ? JSON.parse(v) : [];
    return Array.isArray(parsed) ? parsed : []; // "null" di localStorage jangan sampai jadi null
  } catch { return []; }
}

export function saveRecurring(list) {
  localStorage.setItem('wynara_recurring', JSON.stringify(list));
}

function monthKey(y, m) { return y + '-' + String(m + 1).padStart(2, '0'); }

function monthsBetween(a, b) {
  // daftar [y, m] dari a (inklusif) sampai b (inklusif)
  const out = [];
  let y = a.y, m = a.m, guard = 0;
  while ((y < b.y || (y === b.y && m <= b.m)) && guard < 25) {
    out.push({ y, m });
    m++;
    if (m > 11) { m = 0; y++; }
    guard++;
  }
  return out;
}

// Engine recurring: posting otomatis tiap bulan untuk template yang jatuh tempo.
// Dipanggil saat boot. Maks 12 posting per boot. Return { posted }.
export function runRecurringEngine(today) {
  const now = today instanceof Date ? today : new Date();
  const cur = { y: now.getFullYear(), m: now.getMonth() };
  const list = getRecurring();
  if (!Array.isArray(list) || !list.length) return { posted: 0 };
  let posted = 0;
  let changed = false;
  list.forEach(t => {
    if (!t || typeof t !== 'object' || !t.recurringId) return;
    if (t.paused) return;
    const created = new Date(t.createdAt || t.date || now);
    if (isNaN(created)) return;
    const start = { y: created.getFullYear(), m: created.getMonth() };
    if (!Array.isArray(t.postedPeriods)) { t.postedPeriods = []; changed = true; }
    const day = Math.min(Math.max(parseInt(String(t.date || '').slice(8, 10), 10) || created.getDate() || 1, 1), 28);
    monthsBetween(start, cur).forEach(({ y, m }) => {
      if (posted >= 12) return;
      const key = monthKey(y, m);
      if (t.postedPeriods.includes(key)) return;
      const isCurMonth = y === cur.y && m === cur.m;
      if (isCurMonth && day > now.getDate()) return; // hari belum tiba bulan ini
      const lastDay = new Date(y, m + 1, 0).getDate();
      const dd = String(Math.min(day, lastDay)).padStart(2, '0');
      const mm = String(m + 1).padStart(2, '0');
      try {
        createEntry({
          date: `${y}-${mm}-${dd}`,
          type: t.type === 'income' ? 'income' : 'expense',
          category: String(t.category || 'lainnya'),
          payment: t.payment || 'cash',
          paymentDetail: String(t.paymentDetail || '').slice(0, 60),
          description: String(t.description || ''),
          amount: Number(t.amount),
          person: '',
          itemId: t.itemId || null,
          qty: t.qty || null,
          unitCost: t.unitCost
        });
        // tandai entry sebagai hasil auto-post (untuk jejak, tanpa merusak dedup)
        const all = getEntries();
        const match = all.find(e => e.date === `${y}-${mm}-${dd}` && Number(e.amount) === Number(t.amount) && e.category === String(t.category || 'lainnya') && !e.autoRecurringId);
        if (match) {
          match.autoRecurringId = t.recurringId;
          match.autoPeriod = key;
          saveEntries(all);
        }
        t.postedPeriods.push(key);
        posted++;
        changed = true;
      } catch {}
    });
  });
  if (changed) saveRecurring(list);
  return { posted };
}

export function pauseRecurring(recurringId, paused) {
  const list = getRecurring();
  const t = list.find(x => x && x.recurringId === recurringId);
  if (!t) return false;
  t.paused = !!paused;
  saveRecurring(list);
  return true;
}

export function deleteRecurring(recurringId) {
  const list = getRecurring();
  saveRecurring(list.filter(x => !x || x.recurringId !== recurringId));
}

// ===== Snapshot / Restore (untuk backup file + mirror IndexedDB) =====
export function snapshotAll() {
  return {
    entries: getEntries(),
    loans: getLoans(),
    repayments: getRepayments(),
    people: getPeopleList(),
    budget: getBudget(),
    recurring: getRecurring(),
    journals: getJournals(),
    items: getItems(),
    employees: getAllEmployees(),
    equity: getOpeningEquity(),
    coa: getCustomAccounts(),
    locks: getLockedMonths(),
    purchases: getPurchases(),
    drafts: (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } })(),
    shops: getShops(),
    saleReturns: getSaleReturns(),
    preorders: getPreorders(),
    belanjas: (() => { try { return JSON.parse(localStorage.getItem('wynara_belanja') || '[]'); } catch { return []; } })(),
    kolis: (() => { try { return JSON.parse(localStorage.getItem('wynara_koli') || '[]'); } catch { return []; } })(),
    muatans: (() => { try { return JSON.parse(localStorage.getItem('wynara_muatan') || '[]'); } catch { return []; } })(),
    shipments: getShipments(),
    impor: getImporSettings(),
    checklist: (() => { try { return JSON.parse(localStorage.getItem('wynara_checklist') || '{}'); } catch { return {}; } })(),
    exportedAt: new Date().toISOString(),
    // v4: + belanjas/kolis/muatans/shipments/impor (v3 & lebih lama tetap bisa dipulihkan)
    version: 4
  };
}

export function snapshotSize(snap) {
  const s = snap || snapshotAll();
  return (s.entries?.length || 0) + (s.loans?.length || 0) + (s.repayments?.length || 0) + (s.people?.length || 0);
}

// Uji-diri backup: snapshot → JSON → parse ulang → validasi skema.
// Membuktikan file backup benar-benar bisa dipulihkan, bukan sekadar terunduh.
export function backupSelfTest() {
  const snap = snapshotAll();
  let json = '';
  let parseOk = false;
  let valid = { ok: false, errors: [] };
  let err = '';
  try {
    json = JSON.stringify(snap);
    const parsed = JSON.parse(json);
    parseOk = JSON.stringify(parsed) === json;
    valid = validateBackupJSON(json);
  } catch (e) { err = e && e.message ? e.message : String(e); }
  const counts = {
    entries: snap.entries?.length || 0,
    loans: snap.loans?.length || 0,
    repayments: snap.repayments?.length || 0,
    journals: snap.journals?.length || 0,
    items: snap.items?.length || 0,
    employees: snap.employees?.length || 0,
    purchases: snap.purchases?.length || 0,
  };
  const result = {
    ok: parseOk && valid.ok && !err,
    err: err || (valid.errors && valid.errors[0]) || '',
    bytes: json.length,
    counts,
    at: new Date().toISOString(),
  };
  try { localStorage.setItem('wynara_lastSelfTest', JSON.stringify({ at: result.at, ok: result.ok, bytes: result.bytes })); } catch {}
  logAudit('update', 'backup-selftest', '', null, { ok: result.ok, bytes: result.bytes });
  return result;
}
export function getLastSelfTest() {
  try { return JSON.parse(localStorage.getItem('wynara_lastSelfTest') || 'null'); } catch { return null; }
}

// ===== Kesehatan data (uji-diri integritas) =====
// Cek jurnal tak seimbang, akun tak dikenal, stok negatif, kesegaran backup,
// dan hasil uji backup terakhir. Return { ok, issues[], at }.
export function dataHealthCheck() {
  const issues = [];
  try {
    const ub = findUnbalanced(getJournals());
    if (ub.length) issues.push({ level: 'error', label: `${ub.length} jurnal tidak seimbang`, detail: ub.slice(0, 5).join(', ') });
  } catch {}
  try {
    const known = new Set(getAccounts().map(a => a.code));
    const bad = new Set();
    getJournals().forEach(j => (j.lines || []).forEach(l => { if (l && l.account && !known.has(String(l.account))) bad.add(String(l.account)); }));
    if (bad.size) issues.push({ level: 'warn', label: `${bad.size} akun tak dikenal di jurnal`, detail: [...bad].slice(0, 8).join(', ') });
  } catch {}
  try {
    const neg = getItems().filter(i => Number(i.stock) < 0);
    if (neg.length) issues.push({ level: 'error', label: `${neg.length} barang stok negatif`, detail: neg.slice(0, 5).map(i => i.name).join(', ') });
  } catch {}
  try {
    const last = localStorage.getItem('wynara_lastBackup');
    if (!last) issues.push({ level: 'warn', label: 'Belum pernah backup', detail: 'Lakukan JSON Backup di Pengaturan' });
    else {
      const days = Math.floor((Date.now() - Date.parse(last)) / 86400000);
      if (days >= 7) issues.push({ level: 'warn', label: `Backup terakhir ${days} hari lalu`, detail: 'Segera backup lagi' });
    }
  } catch {}
  const st = getLastSelfTest();
  if (st && !st.ok) issues.push({ level: 'error', label: 'Uji backup terakhir gagal', detail: '' });
  return { ok: !issues.some(x => x.level === 'error'), issues, at: new Date().toISOString() };
}

// Kembalikan snapshot (dari file backup / IDB). Semua baris disanitasi.
// Return { entries, loans, repayments, people } jumlah yang masuk.
export function restoreAll(snap) {
  if (!snap || typeof snap !== 'object') throw new Error('Snapshot tidak valid');
  if (Array.isArray(snap.shops) && snap.shops.length) { try { saveShops(snap.shops); } catch {} }
  if (Array.isArray(snap.saleReturns)) { try { saveSaleReturns(snap.saleReturns); } catch {} }
  if (Array.isArray(snap.preorders)) { try { savePreorders(snap.preorders); } catch {} }
  if (Array.isArray(snap.belanjas)) { try { localStorage.setItem('wynara_belanja', JSON.stringify(snap.belanjas)); } catch {} }
  if (Array.isArray(snap.kolis)) { try { localStorage.setItem('wynara_koli', JSON.stringify(snap.kolis)); } catch {} }
  if (Array.isArray(snap.muatans)) { try { localStorage.setItem('wynara_muatan', JSON.stringify(snap.muatans)); } catch {} }
  if (Array.isArray(snap.shipments)) { try { localStorage.setItem('wynara_shipments', JSON.stringify(snap.shipments)); } catch {} }
  if (snap.impor && typeof snap.impor === 'object') { try { localStorage.setItem('wynara_impor', JSON.stringify(snap.impor)); } catch {} }
  if (snap.checklist && typeof snap.checklist === 'object') { try { localStorage.setItem('wynara_checklist', JSON.stringify(snap.checklist)); } catch {} }
  let cE = 0, cL = 0, cR = 0, cP = 0;
  if (Array.isArray(snap.entries)) {
    const valid = snap.entries.map(sanitizeEntry).filter(Boolean);
    const deduped = dedupEntries(getEntries(), valid);
    if (deduped.length) { saveEntries(getEntries().concat(deduped)); cE = deduped.length; }
  }
  const knownLoanIds = new Set(getLoans().map(l => l.id));
  if (Array.isArray(snap.loans)) {
    const existing = getLoans();
    const toAdd = [];
    snap.loans.forEach(nl => {
      const s = sanitizeLoan(nl);
      if (!s) return;
      if (existing.some(el => el.person === s.person && el.amount === s.amount && el.date === s.date)) return;
      toAdd.push(s);
      knownLoanIds.add(s.id);
    });
    if (toAdd.length) { saveLoans(existing.concat(toAdd)); cL = toAdd.length; }
  }
  if (Array.isArray(snap.repayments)) {
    const existing = getRepayments();
    const have = new Set(existing.map(r => r.id));
    const toAdd = snap.repayments.map(r => sanitizeRepayment(r, knownLoanIds)).filter(r => r && !have.has(r.id));
    if (toAdd.length) { saveRepayments(existing.concat(toAdd)); cR = toAdd.length; }
  }
  if (Array.isArray(snap.people)) {
    snap.people.forEach(p => {
      const name = p && String(p.name || '').trim().slice(0, 60);
      if (!name) return;
      const before = getPeopleList().length;
      try { savePerson(name, p.type === 'perusahaan' ? 'perusahaan' : 'person', p.phone); } catch {}
      if (getPeopleList().length > before) cP++;
    });
  }
  if (snap.budget && typeof snap.budget === 'object' && Number(snap.budget.amount) > 0) {
    try { saveBudget({ amount: Number(snap.budget.amount), updatedAt: snap.budget.updatedAt || new Date().toISOString() }); } catch {}
  }
  if (Array.isArray(snap.recurring)) {
    try { saveRecurring(snap.recurring.filter(r => r && typeof r === 'object')); } catch {}
  }
  let cJ = 0, cI = 0, cM = 0;
  if (Array.isArray(snap.journals)) {
    const have = new Set(getJournals().map(j => j.id));
    const toAdd = snap.journals.filter(j => j && j.id && !have.has(j.id) && Array.isArray(j.lines) && j.lines.length);
    if (toAdd.length) { saveJournals(getJournals().concat(toAdd)); cJ = toAdd.length; }
  }
  if (Array.isArray(snap.items)) {
    const have = new Set(getItems().map(i => i.id));
    snap.items.forEach(it => {
      if (!it || typeof it !== 'object') return;
      if (it.id && have.has(it.id)) return;
      try {
        const before = getItems().length;
        saveItem({ ...it }); // pertahankan id agar baris penjualan/pembelian tetap terhubung
        if (it.id) have.add(it.id);
        if (getItems().length > before) cI++;
      } catch {}
    });
  }
  if (Array.isArray(snap.employees)) {
    snap.employees.forEach(e => {
      try {
        const before = getAllEmployees().length;
        saveEmployee({ ...(e && typeof e === 'object' ? e : {}) }); // pertahankan id (tautan payroll/kasbon)
        if (getAllEmployees().length > before) cM++;
      } catch {}
    });
  }
  if (snap.equity && typeof snap.equity === 'object' && Number(snap.equity.amount) > 0) {
    try { saveOpeningEquity(snap.equity.amount); } catch {}
  }
  if (Array.isArray(snap.locks)) {
    try {
      const valid = snap.locks.filter(m => /^\d{4}-\d{2}$/.test(m));
      const merged = [...new Set(getLockedMonths().concat(valid))].sort();
      localStorage.setItem(LOCK_KEY, JSON.stringify(merged));
    } catch {}
  }
  if (snap.drafts && typeof snap.drafts === 'object' && !Array.isArray(snap.drafts)) {
    try {
      let o = {};
      try { o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch {}
      Object.keys(snap.drafts).forEach(k => {
        if (/^\d{4}-\d{2}$/.test(k) && snap.drafts[k] && typeof snap.drafts[k] === 'object' && !o[k]) o[k] = snap.drafts[k];
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(o));
    } catch {}
  }
  if (Array.isArray(snap.coa)) {
    const have = new Set(getCustomAccounts().map(a => a.code));
    const clean = snap.coa.filter(a => a && /^\d{4}$/.test(a.code) && !have.has(a.code) && COA_TYPES.includes(a.type) && a.name);
    if (clean.length) {
      try { localStorage.setItem(COA_KEY, JSON.stringify(getCustomAccounts().concat(clean.map(a => ({ code: a.code, name: String(a.name).slice(0, 60), type: a.type, category: String(a.category || '').slice(0, 60), custom: true }))))) ; } catch {}
    }
  }
  let cB = 0;
  if (Array.isArray(snap.purchases)) {
    const have = new Set(getPurchases().map(p => p.id));
    const toAdd = [];
    snap.purchases.forEach(p => {
      if (!p || !p.id || have.has(p.id)) return;
      if (!p.supplier || !isValidDateStr(String(p.date || '').slice(0, 10))) return;
      if (!Array.isArray(p.lines) || !p.lines.length) return;
      have.add(p.id);
      toAdd.push(p);
    });
    if (toAdd.length) {
      savePurchases(getPurchases().concat(toAdd));
      cB = toAdd.length;
      // JANGAN terapkan stok lagi: item sudah dipulihkan beserta stok terkini
      // (menerapkan ulang qty pembelian akan menggandakan stok).
    }
  }
  return { entries: cE, loans: cL, repayments: cR, people: cP, journals: cJ, items: cI, employees: cM, purchases: cB };
}

export function stampLastBackup() {
  try { localStorage.setItem('wynara_lastBackup', new Date().toISOString()); } catch {}
}

export function getLastBackup() {
  try {
    const v = localStorage.getItem('wynara_lastBackup');
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d : null;
  } catch { return null; }
}

// ===== Jurnal double-entry =====
const JOURN_KEY = 'wynara_journals';

function getJournals() {
  try {
    const v = localStorage.getItem(JOURN_KEY);
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

function saveJournals(list) {
  try {
    localStorage.setItem(JOURN_KEY, JSON.stringify(list));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') throw new Error('Penyimpanan jurnal penuh. Backup lalu hapus data lama.');
    throw e;
  }
}

export function getAllJournals() {
  return getJournals().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

export function postJournal(j) {
  if (!j || !Array.isArray(j.lines) || !j.lines.length) throw new Error('Jurnal tidak valid');
  if (j.date) assertUnlocked(j.date); // kunci periode ditegakkan di sini juga
  const d = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (!(Math.abs(d - c) < 0.005 && d > 0)) throw new Error('Jurnal tidak balance');
  const list = getJournals();
  list.push({ ...j, postedAt: new Date().toISOString() });
  saveJournals(list);
  return j;
}

// ===== Saldo awal per akun (draft + posting reversible) =====
const OPEN_KEY = 'wynara_opening';
export function getOpeningDraft() {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null');
    return v && typeof v === 'object' ? v : { date: '', rows: {} };
  } catch { return { date: '', rows: {} }; }
}
export function saveOpeningDraft(d) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify(d && typeof d === 'object' ? d : { date: '', rows: {} })); } catch {}
}

export function deleteJournalsByRef(ref, refId) {
  if (!refId) return 0;
  const list = getJournals();
  const kept = list.filter(j => !(j.ref === ref && j.refId === refId));
  const n = list.length - kept.length;
  if (n) saveJournals(kept);
  return n;
}

// Backfill jurnal untuk data lama (sekali saja). Return jumlah dibuat.
export function backfillJournals(builders) {
  const { buildEntryJournal, buildLoanJournal, buildRepaymentJournal } = builders;
  const existing = new Set(getJournals().map(j => `${j.ref}:${j.refId}`));
  const made = [];
  getEntries().forEach(e => {
    if (e.loanId || existing.has(`entry:${e.id}`)) return;
    try {
      const j = buildEntryJournal(e, journalOptsFor(e));
      if (j) { made.push(j); existing.add(`entry:${e.id}`); }
    } catch {}
  });
  getLoans().forEach(l => {
    if (existing.has(`loan:${l.id}`)) return;
    try {
      const j = buildLoanJournal(l);
      if (j) { made.push(j); existing.add(`loan:${l.id}`); }
    } catch {}
  });
  const loanById = new Map(getLoans().map(l => [l.id, l]));
  // Urut kronologis agar porsi bunga kumulatif benar saat backfill.
  const allReps = getRepayments().slice().sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  allReps.forEach((r, idx) => {
    if (existing.has(`repayment:${r.id}`)) return;
    const loan = loanById.get(r.loanId);
    if (!loan) return;
    try {
      const j = buildRepaymentJournal(loan, r, allReps.slice(0, idx));
      if (j) { made.push(j); existing.add(`repayment:${r.id}`); }
    } catch {}
  });
  if (made.length) saveJournals(getJournals().concat(made));
  return made.length;
}

// ===== Audit trail =====
const AUDIT_KEY = 'wynara_audit';
const AUDIT_MAX = 500;

export function logAudit(action, entity, entityId, before, after) {
  try {
    const list = getAudit();
    list.unshift({
      id: generateId(),
      ts: new Date().toISOString(),
      actor: getActor(),
      action: String(action || '').slice(0, 20),
      entity: String(entity || '').slice(0, 20),
      entityId: String(entityId || '').slice(0, 60),
      before: before === undefined ? null : before,
      after: after === undefined ? null : after
    });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, AUDIT_MAX)));
  } catch {}
}

export function getAudit() {
  try {
    const v = localStorage.getItem(AUDIT_KEY);
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

// ===== Barang (stok) =====
const ITEM_KEY = 'wynara_items';

function getItems() {
  try {
    const v = localStorage.getItem(ITEM_KEY);
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

export function getAllItems() {
  return getItems().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

// Kelompok produk (SKU) — varian berbagi groupId/baseName; fallback nama dasar.
export function itemGroupKey(item) {
  const raw = item && (item.groupId || item.baseName || String(item.name || '').split(' • ')[0]);
  return String(raw || '').trim().toLowerCase();
}
export function getStockGroups() {
  const map = new Map();
  getAllItems().forEach(it => {
    const key = itemGroupKey(it) || ('id:' + it.id);
    if (!map.has(key)) {
      map.set(key, { key, name: String(it.name || '').split(' • ')[0] || it.name, sku: String(it.sku || '').replace(/-\d+$/, ''), variants: [], totalStock: 0, low: 0, minPrice: Infinity, maxPrice: 0 });
    }
    const g = map.get(key);
    g.variants.push(it);
    g.totalStock += Number(it.stock) || 0;
    if ((Number(it.minStock) || 0) > 0 && Number(it.stock) <= Number(it.minStock)) g.low++;
    const net = itemNetPrice(it);
    if (net > 0) { g.minPrice = Math.min(g.minPrice, net); g.maxPrice = Math.max(g.maxPrice, net); }
    if (!g.sku && it.sku) g.sku = String(it.sku).replace(/-\d+$/, '');
  });
  return [...map.values()]
    .map(g => ({ ...g, minPrice: g.minPrice === Infinity ? 0 : g.minPrice }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Restock cepat: tambah stok @modal (rata-rata) + jurnal Dr Persediaan / Cr Kas.
export function restockItem(itemId, qty, unitCost, { date, payment, note } = {}) {
  requireCap('ledger');
  const it = getItemById(itemId);
  if (!it) throw new Error('Barang tidak ditemukan');
  const q = Math.max(Math.floor(Number(qty) || 0), 0);
  if (q <= 0) throw new Error('Jumlah restock harus > 0');
  const cost = Math.max(Number(unitCost) || 0, 0);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const updated = applyStockMove(itemId, { qtyIn: q, unitCost: cost, ref: 'restock', note: note || 'restock', type: 'restock' });
  try {
    const j = buildRestockJournal({ amount: q * cost, date: d, payment: payment || 'cash', memo: `Restock ${it.name} ${q} pcs` });
    if (j) postJournal(j);
  } catch {}
  logAudit('create', 'restock', itemId, null, { qty: q, unitCost: cost, date: d });
  return updated;
}

export function getItemById(id) {
  return getItems().find(i => i.id === id) || null;
}

// Harga jual setelah diskon produk. Label varian (ukuran/warna) untuk tampilan.
export function itemNetPrice(item) {
  const price = Math.max(Number(item && item.price) || 0, 0);
  const d = Math.min(Math.max(Number(item && item.discountPct) || 0, 0), 100);
  return Math.round(price * (1 - d / 100));
}
export function itemVariantLabel(item) {
  // A3: buang nilai sumbu yang identik (30cm + 30cm → 30cm).
  const parts = [item && item.size, item && item.color].filter(Boolean);
  const seen = new Set();
  const fresh = [];
  parts.forEach((p) => {
    const key = String(p).toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    fresh.push(String(p).trim());
  });
  return fresh.join(' / ');
}
// Nama lengkap: nama dasar + token varian yang BELUM ada di nama (anti "30cm 30cm").
export function fullItemName(item) {
  const base = String((item && item.name) || '').trim();
  const variant = itemVariantLabel(item);
  if (!variant) return base;
  let low = base.toLowerCase();
  const extra = variant.split('/').map((s) => s.trim()).filter(Boolean)
    .filter((tok) => {
      const tokKey = tok.toLowerCase();
      if (low.includes(tokKey)) return false;
      low = low + ' ' + tokKey; // cegah duplikat antar sumbu juga
      return true;
    });
  return extra.length ? `${base} ${extra.join(' ')}` : base;
}

// 3.1 Terima Barang dengan sumber eksplisit: tunai lokal / hutang supplier / stok awal.
// (Sumber 'muatan' tidak lewat sini — biaya dari alokasi muatan, lihat Papan Muatan.)
export function receiveStockBySource(itemId, qty, unitCost, { date, payment, source } = {}) {
  requireCap('ledger');
  const it = getItemById(itemId);
  if (!it) throw new Error('Barang tidak ditemukan');
  const q = Math.max(Math.floor(Number(qty) || 0), 0);
  if (q <= 0) throw new Error('Jumlah masuk harus > 0');
  const cost = Math.max(Number(unitCost) || 0, 0);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const src = ['tunai', 'hutang', 'awal'].includes(source) ? source : 'tunai';
  const updated = applyStockMove(itemId, { qtyIn: q, unitCost: cost, ref: 'receive', note: `Terima barang (${src})`, type: 'receive' });
  const amount = Math.round(q * cost);
  const memo = `Terima barang ${it.name} ${q} pcs`;
  if (amount > 0) {
    let lines;
    if (src === 'hutang') {
      lines = [
        { account: INVENTORY_ACCOUNT, debit: amount, credit: 0, memo },
        { account: '2102', debit: 0, credit: amount, memo: 'Hutang supplier lokal' },
      ];
    } else if (src === 'awal') {
      lines = [
        { account: INVENTORY_ACCOUNT, debit: amount, credit: 0, memo },
        { account: '3101', debit: 0, credit: amount, memo: 'Stok awal (modal)' },
      ];
    } else {
      const cash = accountForPayment(payment || 'cash');
      lines = [
        { account: INVENTORY_ACCOUNT, debit: amount, credit: 0, memo },
        { account: cash, debit: 0, credit: amount, memo: 'Beli lokal tunai' },
      ];
    }
    postJournal({ id: generateId(), date: d, memo, ref: 'receive-stock', refId: itemId, lines });
  }
  logAudit('create', 'receive-stock', itemId, null, { qty: q, cost, source: src });
  return updated;
}

// ===== Pengiriman (shipment) — pengiriman lokal ke pelanggan, dukung kirim sebagian =====
const SHIP_KEY = 'wynara_shipments';
export function getShipments() {
  try { const v = JSON.parse(localStorage.getItem(SHIP_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveShipments(list) { try { localStorage.setItem(SHIP_KEY, JSON.stringify(list)); } catch {} }
export function nextShipmentNo() {
  const n = getShipments().length + 1;
  const d = new Date();
  return `SJ-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(n).padStart(3, '0')}`;
}
// Sudah dikirim untuk satu pesanan (per item) — dari pengiriman yang dikonfirmasi.
export function shippedQtyFor(orderId, itemId = null) {
  return getShipments().filter((s) => s.orderId === orderId && s.status === 'confirmed')
    .flatMap((s) => s.lines || [])
    .filter((l) => !itemId || l.itemId === itemId)
    .reduce((a, l) => a + (Number(l.qty) || 0), 0);
}
// Siap dikirim per baris pesanan = dipesan − sudah dikirim.
export function readyToShipLines(order) {
  const shipped = {};
  getShipments().filter((s) => s.orderId === order.id && s.status === 'confirmed')
    .forEach((s) => (s.lines || []).forEach((l) => { shipped[l.itemId || l.name] = (shipped[l.itemId || l.name] || 0) + (Number(l.qty) || 0); }));
  // Pesanan pelanggan menyimpan barang di `items` (preorder) atau `lines` (penjualan kredit).
  const src = ((order && order.items) || (order && order.lines) || []);
  return src.map((l) => ({
    itemId: l.itemId || '', name: l.name, ordered: Number(l.qty) || 0,
    shipped: shipped[l.itemId || l.name] || 0,
    ready: Math.max((Number(l.qty) || 0) - (shipped[l.itemId || l.name] || 0), 0),
    price: Number(l.price) || 0,
  }));
}
export function createShipment(d = {}) {
  requireCap('ledger');
  const kind = ['customer', 'supplier', 'transfer'].includes(d.kind) ? d.kind : 'customer';
  const lines = (Array.isArray(d.lines) ? d.lines : [])
    .filter((l) => (l.itemId || l.name) && Number(l.qty) > 0)
    .map((l) => ({ itemId: String(l.itemId || ''), name: String(l.name || '').slice(0, 80), qty: Math.floor(Number(l.qty) || 0) }));
  if (!lines.length) throw new Error('Pilih minimal satu barang untuk dikirim');
  const date = String(d.date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(date);
  const rec = {
    id: generateId(), no: nextShipmentNo(), kind, date,
    orderId: String(d.orderId || ''), orderNo: String(d.orderNo || ''),
    recipient: String(d.recipient || '').slice(0, 60), address: String(d.address || '').slice(0, 160),
    origin: String(d.origin || '').slice(0, 60),
    courier: String(d.courier || '').slice(0, 30), service: String(d.service || '').slice(0, 30),
    tracking: String(d.tracking || '').slice(0, 40),
    shippingCost: Math.max(Number(d.shippingCost) || 0, 0),
    borneBy: d.borneBy === 'customer' ? 'customer' : 'company',
    status: 'draft', lines,
    note: String(d.note || '').slice(0, 120), createdAt: new Date().toISOString(),
  };
  saveShipments(getShipments().concat(rec));
  logAudit('create', 'shipment', rec.id, null, { no: rec.no, kind, lines: lines.length, draft: !!d.draft });
  return rec;
}
// Konfirmasi pengiriman: tandai pesanan terkirim + biaya kirim (bila ditanggung perusahaan).
export function confirmShipment(id, { date, payment } = {}) {
  requireCap('ledger');
  const list = getShipments();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) throw new Error('Pengiriman tidak ditemukan');
  const s = list[i];
  if (s.status === 'confirmed') throw new Error('Pengiriman ini sudah dikonfirmasi');
  const d = String(date || s.date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  if (s.borneBy === 'company' && s.shippingCost > 0) {
    // KEPUTUSAN: biaya kirim ditanggung perusahaan DIKAPITALISASI ke persediaan (bagian biaya pesanan),
    // bukan langsung dibebankan — supaya margin nyata pesanan ikut menghitungnya.
    const cash = accountForPayment(payment || 'cash');
    postJournal({
      id: generateId(), date: d, memo: `Biaya kirim ${s.no}${s.recipient ? ' — ' + s.recipient : ''}`, ref: 'shipment', refId: s.id,
      lines: [
        { account: INVENTORY_ACCOUNT, debit: s.shippingCost, credit: 0, memo: 'Biaya kirim (bagian harga pokok pesanan)' },
        { account: cash, debit: 0, credit: s.shippingCost, memo: 'Bayar kirim' },
      ],
    });
    if (s.orderId) {
      try {
        if (getPreorderById(s.orderId)) {
          const pos = getPreorders();
          const pi = pos.findIndex((p) => p.id === s.orderId);
          if (pi >= 0) {
            pos[pi].deliveryCostIdr = (Number(pos[pi].deliveryCostIdr) || 0) + s.shippingCost;
            pos[pi].events = (pos[pi].events || []).concat([{ date: d, stage: pos[pi].stage, note: 'Biaya kirim ditanggung perusahaan', tracking: '', schedule: '' }]);
            savePreorders(pos);
          }
        } else {
          const list2 = getCreditSales();
          const ci = list2.findIndex((c) => c.id === s.orderId);
          if (ci >= 0) {
            list2[ci].deliveryCostIdr = (Number(list2[ci].deliveryCostIdr) || 0) + s.shippingCost;
            saveCreditSales(list2);
          }
        }
      } catch {}
    }
  }
  if (s.kind === 'customer') {
    // Preorder: barang SUDAH masuk persediaan saat muatan tiba (receiveMuatan) → keluar saat dikirim.
    // Penjualan ready/kredit: stok sudah keluar saat penjualan dibuat → jangan dikurangi dua kali.
    if (getPreorderById(s.orderId)) {
      for (const l of s.lines) {
        if (!l.itemId) continue;
        try { applyStockMove(l.itemId, { qtyOut: Number(l.qty) || 0, ref: 'shipment', note: `Kirim ${s.no}`, type: 'ship' }); }
        catch (err) { logAudit('update', 'shipment', s.id, null, { stockSkip: l.name, reason: String((err && err.message) || '') }); }
      }
    }
  }
  s.status = 'confirmed';
  list[i] = s;
  saveShipments(list);
  // Pesanan: tandai terkirim (hanya untuk pengiriman ke pelanggan).
  if (s.kind === 'customer' && s.orderId) {
    const order = getPreorderById(s.orderId) || getCreditSaleById(s.orderId);
    if (order) {
      const lines = readyToShipLines(order);
      const allSent = lines.every((l) => l.ready <= 0);
      if (getPreorderById(s.orderId)) {
        trackPreorder(s.orderId, { stage: allSent ? 'sent' : 'in_wh', date: d, note: `Kirim ${allSent ? 'lengkap' : 'sebagian'} via ${s.courier || 'kurir'}${s.tracking ? ' — resi ' + s.tracking : ''}`, tracking: s.tracking, schedule: '' });
      } else if (allSent) {
        trackCreditOrder(s.orderId, { stage: 'received', date: d, note: `Kirim lengkap via ${s.courier || 'kurir'}${s.tracking ? ' — resi ' + s.tracking : ''}`, tracking: s.tracking, schedule: '' });
      } else {
        trackCreditOrder(s.orderId, { stage: order.stage, date: d, note: `Kirim sebagian via ${s.courier || 'kurir'}${s.tracking ? ' — resi ' + s.tracking : ''}`, tracking: s.tracking, schedule: '' });
      }
    }
  }
  logAudit('update', 'shipment', id, null, { confirmed: true });
  return s;
}

// ===== Produk draft (dibuat dari pembelian China; jadi aktif saat barang tiba) =====
// Draft: tampil di katalog & pipeline dengan badge, TIDAK dihitung sebagai stok siap jual.
export function isDraft(item) { return !!(item && item.status === 'draft'); }
export function setItemStatus(id, status) {
  requireCap('ledger');
  const list = getItems();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Barang tidak ditemukan');
  list[i].status = status === 'draft' ? 'draft' : 'aktif';
  list[i].updatedAt = new Date().toISOString();
  localStorage.setItem(ITEM_KEY, JSON.stringify(list));
  return list[i];
}
// Buat produk draft dari satu baris belanja China. cost = estimasi modal/pcs (ditimpa saat tiba).
export function createDraftProductFromBelanja({ name, cost = 0, weightKg = 0, price = 0 } = {}) {
  requireCap('ledger');
  const nm = String(name || '').trim().slice(0, 60);
  if (!nm) throw new Error('Nama produk wajib');
  const it = saveItem({ name: nm, cost: Math.max(Number(cost) || 0, 0), price: Math.max(Number(price) || 0, 0), stock: 0, weight: Math.max(Number(weightKg) || 0, 0), status: 'draft' });
  return it;
}

// ===== Pengaturan Impor (default per batch; selalu bisa ditimpa di muatan/belanja) =====
const IMPOR_KEY = 'wynara_impor';
export const IMPOR_DEFAULTS = { kurs: 2250, ratePerCbm: 3100000, ratePerKg: 0, divisor: 6000, minCbm: 0.1 };
export function getImporSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(IMPOR_KEY) || 'null');
    if (o && typeof o === 'object') {
      const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
      return {
        kurs: num(o.kurs, IMPOR_DEFAULTS.kurs) || IMPOR_DEFAULTS.kurs,
        ratePerCbm: num(o.ratePerCbm, IMPOR_DEFAULTS.ratePerCbm),
        ratePerKg: num(o.ratePerKg, IMPOR_DEFAULTS.ratePerKg),
        divisor: num(o.divisor, IMPOR_DEFAULTS.divisor) || IMPOR_DEFAULTS.divisor,
        minCbm: num(o.minCbm, IMPOR_DEFAULTS.minCbm) || IMPOR_DEFAULTS.minCbm,
      };
    }
  } catch {}
  return { ...IMPOR_DEFAULTS };
}
export function saveImporSettings(patch = {}) {
  requireCap('settings');
  const cur = getImporSettings();
  const next = {
    kurs: Math.max(Number(patch.kurs ?? cur.kurs) || 0, 1),
    ratePerCbm: Math.max(Number(patch.ratePerCbm ?? cur.ratePerCbm) || 0, 0),
    ratePerKg: Math.max(Number(patch.ratePerKg ?? cur.ratePerKg) || 0, 0),
    divisor: Math.max(Number(patch.divisor ?? cur.divisor) || 6000, 1),
    minCbm: Math.max(Number(patch.minCbm ?? cur.minCbm) || 0.1, 0.01),
  };
  try { localStorage.setItem(IMPOR_KEY, JSON.stringify(next)); } catch {}
  return next;
}

// ===== Toko / lokasi (multi-toko) =====
const SHOP_KEY = 'wynara_shops';
const ACTIVE_SHOP_KEY = 'wynara_active_shop';
export function getShops() {
  try {
    const v = JSON.parse(localStorage.getItem(SHOP_KEY) || 'null');
    if (Array.isArray(v) && v.length) return v.map(s => ({ id: String(s.id), name: String(s.name) }));
  } catch {}
  return [{ id: 'main', name: 'Toko Utama' }];
}
export function saveShops(list) {
  requireCap('settings');
  const clean = (Array.isArray(list) ? list : [])
    .map(s => ({ id: String(s.id || '').trim().slice(0, 30), name: String(s.name || '').trim().slice(0, 40) }))
    .filter(s => s.id && s.name);
  if (!clean.length) throw new Error('Minimal satu toko');
  try { localStorage.setItem(SHOP_KEY, JSON.stringify(clean)); } catch {}
  return clean;
}
export function getActiveShopId() {
  try {
    const id = localStorage.getItem(ACTIVE_SHOP_KEY);
    const shops = getShops();
    if (id && shops.some(s => s.id === id)) return id;
    return shops[0].id;
  } catch { return 'main'; }
}
export function setActiveShopId(id) {
  const shops = getShops();
  const found = shops.find(s => s.id === id);
  if (!found) throw new Error('Toko tidak dikenal');
  try { localStorage.setItem(ACTIVE_SHOP_KEY, found.id); } catch {}
  return found.id;
}
// Stok sebuah barang DI toko tertentu (fallback ke stok tunggal lama).
export function shopStockOf(item, shopId) {
  const s = shopId || getActiveShopId();
  if (item && item.stocks && typeof item.stocks === 'object') return Math.max(Math.floor(Number(item.stocks[s]) || 0), 0);
  return Math.max(Math.floor(Number(item && item.stock) || 0), 0);
}

// Buat SKU otomatis dari nama (inisial + nomor urut) yang unik.
export function autoSku(name, list) {
  const items = Array.isArray(list) ? list : getItems();
  const base = String(name || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'BRG';
  const used = new Set(items.map(i => String(i.sku || '').toUpperCase()));
  let n = 1, sku;
  do { sku = `${base}-${String(n).padStart(3, '0')}`; n++; } while (used.has(sku));
  return sku;
}

export function saveItem(item) {
  requireCap('ledger');
  const list = getItems();
  const name = String(item.name || '').trim().replace(/[<>"'&]/g, '').slice(0, 60);
  if (!name) throw new Error('Nama barang wajib');
  const skuV = String(item.sku || '').trim().slice(0, 30) || autoSku(name, list);
  const barV = String(item.barcode || '').trim().slice(0, 40) || skuV;
  const selfId = item.id || '';
  if (skuV) {
    const d = list.find(i => i.id !== selfId && String(i.sku || '').trim().toLowerCase() === skuV.toLowerCase());
    if (d) throw new Error(`Kode "${skuV}" sudah dipakai "${d.name}"`);
  }
  if (barV) {
    const d = list.find(i => i.id !== selfId && String(i.barcode || '').trim() === barV);
    if (d) throw new Error(`Barcode "${barV}" sudah dipakai "${d.name}"`);
  }
  const shopId = getActiveShopId();
  const prevItem = list.find(i => i.id === (item.id || ''));
  // Bila diberi peta `stocks` (mis. restore backup), pakai apa adanya agar stok per-toko tidak kolaps.
  const hasStocksMap = item.stocks && typeof item.stocks === 'object' && !Array.isArray(item.stocks);
  const stocks = hasStocksMap
    ? { ...item.stocks }
    : ((prevItem && prevItem.stocks && typeof prevItem.stocks === 'object') ? { ...prevItem.stocks } : {});
  if (!hasStocksMap) stocks[shopId] = Math.max(Math.floor(Number(item.stock) || 0), 0);
  const stock = Object.values(stocks).reduce((s, n) => s + Math.max(Math.floor(Number(n) || 0), 0), 0);
  const cost = Math.max(Number(item.cost) || 0, 0);
  const price = Math.max(Number(item.price) || 0, 0);
  const minStock = Math.max(Math.floor(Number(item.minStock) || 0), 0);
  const discountPct = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
  const rec = {
    id: item.id || generateId(),
    name,
    sku: skuV,
    barcode: barV,
    category: String(item.category || '').slice(0, 30),
    unit: String(item.unit || '').slice(0, 12),
    size: String(item.size || '').slice(0, 20),
    color: String(item.color || '').slice(0, 20),
    image: String(item.image || '').slice(0, 120000),
    weight: Math.max(Number(item.weight) || 0, 0),
    length: Math.max(Number(item.length) || 0, 0),
    width: Math.max(Number(item.width) || 0, 0),
    height: Math.max(Number(item.height) || 0, 0),
    discountPct,
    stocks, stock, cost, price, minStock,
    status: item.status === 'draft' ? 'draft' : (prevItem && item.status === undefined ? (prevItem.status || 'aktif') : 'aktif'),
    active: item.active !== false,
    updatedAt: new Date().toISOString()
  };
  if (item.groupId) rec.groupId = String(item.groupId).slice(0, 40);
  if (item.baseName) rec.baseName = String(item.baseName).slice(0, 60);
  const idx = list.findIndex(i => i.id === rec.id);
  if (idx === -1) list.push(rec);
  else list[idx] = { ...list[idx], ...rec };
  localStorage.setItem(ITEM_KEY, JSON.stringify(list));
  // Catat perubahan qty sebagai gerakan stok (kartu stok) — jangan ubah rata-rata modal.
  const prevShopQty = prevItem ? Math.max(Math.floor(Number((prevItem.stocks || {})[shopId]) || 0), 0) : 0;
  const newShopQty = Math.max(Math.floor(Number(stocks[shopId]) || 0), 0);
  if (!hasStocksMap && newShopQty !== prevShopQty) {
    try {
      recordStockMove({
        itemId: rec.id,
        qtyIn: Math.max(newShopQty - prevShopQty, 0),
        qtyOut: Math.max(prevShopQty - newShopQty, 0),
        unitCost: cost, balance: newShopQty,
        ref: prevItem ? 'opname' : 'opening',
        note: prevItem ? 'opname (edit barang)' : 'stok awal',
        shop: shopId,
        type: prevItem ? 'opname' : 'opening',
      });
    } catch {}
  }
  return rec;
}

export function deleteItem(id) {
  requireCap('ledger');
  // Jangan hapus barang yang sudah dipakai pembelian/penjualan (bikin data menggantung).
  const usedByPurchase = getPurchases().some(p => (p.lines || []).some(l => l && l.itemId === id));
  if (usedByPurchase) throw new Error('Barang dipakai di pembelian — tidak bisa dihapus. Kosongkan stoknya saja bila sudah tidak dijual.');
  const usedByEntry = getEntries().some(e => e.itemId === id || (e.sale && Array.isArray(e.sale.lines) && e.sale.lines.some(l => l && l.itemId === id)));
  if (usedByEntry) throw new Error('Barang sudah dipakai transaksi — tidak bisa dihapus (riwayat penjualan tetap utuh).');
  localStorage.setItem(ITEM_KEY, JSON.stringify(getItems().filter(i => i.id !== id)));
}

// Stok + rata-rata tertimbang. qtyOut untuk jual (cek stok), qtyIn untuk beli.
// keepCost: tambah stok tanpa ubah rata-rata (untuk reversal).
export function applyStockMove(itemId, { qtyIn = 0, qtyOut = 0, unitCost = 0, keepCost = false, ref = '', note = '', shop, type = '' } = {}) {
  const list = getItems();
  const idx = list.findIndex(i => i.id === itemId);
  if (idx === -1) throw new Error('Barang tidak ditemukan');
  const it = { ...list[idx] };
  const shopId = shop || getActiveShopId();
  if (!it.stocks || typeof it.stocks !== 'object') it.stocks = { [shopId]: Math.max(Math.floor(Number(it.stock) || 0), 0) };
  const cur = Math.max(Math.floor(Number(it.stocks[shopId]) || 0), 0);
  const qi = Math.max(Math.floor(Number(qtyIn) || 0), 0);
  const qo = Math.max(Math.floor(Number(qtyOut) || 0), 0);
  if (qo > cur) throw new Error(`Stok ${it.name} di toko ini kurang (sisa ${cur})`);
  const totalQty = Object.values(it.stocks).reduce((s, n) => s + Math.max(Math.floor(Number(n) || 0), 0), 0);
  if (qi > 0) {
    if (!keepCost) {
      const c = Math.max(Number(unitCost) || 0, 0);
      it.cost = totalQty + qi > 0 ? Math.round(((totalQty * it.cost) + (qi * c)) / (totalQty + qi)) : c;
    }
    it.stocks[shopId] = cur + qi;
  }
  if (qo > 0) it.stocks[shopId] = (it.stocks[shopId] || cur) - qo;
  it.stock = Object.values(it.stocks).reduce((s, n) => s + Math.max(Math.floor(Number(n) || 0), 0), 0);
  it.updatedAt = new Date().toISOString();
  list[idx] = it;
  localStorage.setItem(ITEM_KEY, JSON.stringify(list));
  if (qi > 0 || qo > 0) {
    try { recordStockMove({ itemId, qtyIn: qi, qtyOut: qo, unitCost: Math.max(Number(unitCost) || 0, 0), balance: it.stocks[shopId], ref, note, shop: shopId, type }); } catch {}
  }
  return it;
}

// ===== Kartu stok (riwayat mutasi per barang) =====
const MOVE_KEY = 'wynara_stock_moves';
function recordStockMove(m) {
  let list = [];
  try { const v = JSON.parse(localStorage.getItem(MOVE_KEY) || '[]'); list = Array.isArray(v) ? v : []; } catch {}
  list.unshift({
    id: generateId(), ts: new Date().toISOString(),
    itemId: m.itemId, qtyIn: m.qtyIn || 0, qtyOut: m.qtyOut || 0,
    unitCost: m.unitCost || 0, balance: m.balance || 0, ref: String(m.ref || ''), note: String(m.note || ''),
    shop: String(m.shop || ''), type: String(m.type || ''),
  });
  if (list.length > 2000) list = list.slice(0, 2000);
  localStorage.setItem(MOVE_KEY, JSON.stringify(list));
}
export function getStockMoves(itemId, shopId) {
  try {
    const v = JSON.parse(localStorage.getItem(MOVE_KEY) || '[]');
    let list = Array.isArray(v) ? v : [];
    if (itemId) list = list.filter(m => m.itemId === itemId);
    if (shopId) list = list.filter(m => !m.shop || m.shop === shopId);
    return list;
  } catch { return []; }
}

// ===== Import produk massal (Shopee/marketplace/offline) =====
// Upsert per SKU (bila ada) atau nama. Return jumlah added/updated/skipped.
export function importItemsBulk(list) {
  requireCap('ledger');
  const items = getItems();
  const shopId = getActiveShopId();
  let added = 0, updated = 0, skipped = 0;
  (Array.isArray(list) ? list : []).forEach(raw => {
    const name = String((raw && raw.name) || '').trim().replace(/[<>"'&]/g, '').slice(0, 60);
    if (!name) { skipped++; return; }
    const sku = String((raw && raw.sku) || '').trim().slice(0, 30);
    const barcode = String((raw && raw.barcode) || '').trim().slice(0, 40);
    const rec = {
      name,
      price: Math.max(Number(raw.price) || 0, 0),
      cost: Math.max(Number(raw.cost) || 0, 0),
      minStock: Math.max(Math.floor(Number(raw.minStock) || 0), 0),
      updatedAt: new Date().toISOString(),
    };
    // Kolom opsional: hanya ubah bila memang diisi (jangan kosongkan data lama).
    if (sku) rec.sku = sku;
    if (barcode) rec.barcode = barcode;
    if (raw && raw.size !== undefined) rec.size = String(raw.size || '').trim().slice(0, 20);
    if (raw && raw.color !== undefined) rec.color = String(raw.color || '').trim().slice(0, 20);
    if (raw && raw.discountPct !== undefined) rec.discountPct = Math.min(Math.max(Number(raw.discountPct) || 0, 0), 100);
    if (raw && raw.unit !== undefined) rec.unit = String(raw.unit || '').trim().slice(0, 12);
    if (raw && raw.category !== undefined) rec.category = String(raw.category || '').trim().slice(0, 30);
    const idx = items.findIndex(i => (sku && String(i.sku || '').toLowerCase() === sku.toLowerCase())
      || (!sku && String(i.name || '').toLowerCase() === name.toLowerCase()));
    const prev = idx === -1 ? null : items[idx];
    // Stok: tulis ke peta per-toko toko aktif + hitung ulang total (jangan set `stock` mentah).
    if (raw && raw.stock !== undefined) {
      const stocks = (prev && prev.stocks && typeof prev.stocks === 'object') ? { ...prev.stocks } : {};
      stocks[shopId] = Math.max(Math.floor(Number(raw.stock) || 0), 0);
      rec.stocks = stocks;
      rec.stock = Object.values(stocks).reduce((s, n) => s + Math.max(Math.floor(Number(n) || 0), 0), 0);
    }
    if (idx === -1) { items.push({ id: generateId(), size: '', color: '', discountPct: 0, ...rec }); added++; }
    else { items[idx] = { ...items[idx], ...rec }; updated++; }
  });
  localStorage.setItem(ITEM_KEY, JSON.stringify(items));
  return { added, updated, skipped };
}

// ===== Buat penjualan dari pesanan hasil impor =====
// orders: hasil resolveOrders() (lines punya itemId). Melewati baris tanpa item.
export function createSalesFromOrders(orders, { date, payment, channel } = {}) {
  requireCap('ledger');
  const created = [];
  (Array.isArray(orders) ? orders : []).forEach(o => {
    const lines = (o.lines || []).filter(l => l && l.itemId && Number(l.qty) > 0);
    if (!lines.length) return;
    const total = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
    if (total <= 0) return;
    const desc = `Jual ${channel || 'pesanan'}${o.buyer ? ' — ' + o.buyer : ''}${o.orderId ? ' • ' + o.orderId : ''}: ${lines.map(l => `${l.qty}× ${l.name || ''}`).join(', ')}`;
    const entry = createEntry({
      date: o.date || date || new Date().toISOString().split('T')[0],
      type: 'income', category: 'jualan', payment: payment || 'transfer',
      description: desc.slice(0, 120), amount: total, person: o.buyer || '',
      sale: { lines: lines.map(l => ({ itemId: l.itemId, qty: Number(l.qty) || 1, price: Number(l.price) || 0 })), total },
    });
    logAudit('create', 'entry', entry.id, null, { amount: total, channel: channel || '', order: o.orderId || '' });
    created.push(entry);
  });
  return created;
}

// ===== Karyawan =====
const EMP_KEY = 'wynara_employees';

export function getAllEmployees() {
  try {
    const v = localStorage.getItem(EMP_KEY);
    const a = v ? JSON.parse(v) : [];
    return (Array.isArray(a) ? a : []).sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')));
  } catch { return []; }
}

function cleanEmpStr(v, max) {
  return String(v || '').replace(/[<>"'&]/g, '').trim().slice(0, max);
}

export function saveEmployee(emp) {
  requireCap('payroll');
  const list = getAllEmployees();
  const name = cleanEmpStr(emp.name, 60);
  if (!name) throw new Error('Nama karyawan wajib');
  // Kompatibel data lama: salary → baseSalary
  const base = emp.baseSalary !== undefined ? Number(emp.baseSalary) : Number(emp.salary);
  const rec = {
    id: emp.id || generateId(),
    name,
    role: cleanEmpStr(emp.role, 40),
    baseSalary: Math.max(Math.round(Number(base) || 0), 0),
    allowance: Math.max(Math.round(Number(emp.allowance) || 0), 0),
    gender: emp.gender === 'P' ? 'P' : (emp.gender === 'L' ? 'L' : ''),
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(emp.birthDate || '') ? emp.birthDate : '',
    phone: String(emp.phone || '').replace(/[^0-9+]/g, '').slice(0, 18),
    email: String(emp.email || '').replace(/[<>"'&\s]/g, '').slice(0, 80),
    npwp: String(emp.npwp || '').replace(/[^0-9]/g, '').slice(0, 20),
    bankName: cleanEmpStr(emp.bankName, 40),
    bankAcc: String(emp.bankAcc || '').replace(/[^0-9]/g, '').slice(0, 30),
    address: cleanEmpStr(emp.address, 120),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(emp.startDate || '') ? emp.startDate : '',
    contract: ['tetap', 'kontrak', 'harian'].includes(emp.contract) ? emp.contract : 'tetap',
    ptkp: String(emp.ptkp || 'TK/0').toUpperCase().slice(0, 5),
    bpjsKes: emp.bpjsKes === undefined ? true : !!emp.bpjsKes,
    bpjsTk: emp.bpjsTk === undefined ? true : !!emp.bpjsTk,
    jkkRate: sanitizeJkkRate(emp.jkkRate, JKK_DEFAULT),
    active: emp.active === undefined ? true : !!emp.active,
    updatedAt: new Date().toISOString()
  };
  if (!(rec.baseSalary > 0)) throw new Error('Gaji pokok harus lebih dari 0');
  const idx = list.findIndex(e => e.id === rec.id);
  if (idx === -1) list.push(rec);
  else list[idx] = { ...list[idx], ...rec };
  localStorage.setItem(EMP_KEY, JSON.stringify(list));
  return rec;
}

// salary lama → baseSalary (migrasi tampilan, tanpa ubah storage)
export function empGross(emp) {
  if (!emp) return 0;
  const base = emp.baseSalary !== undefined ? Number(emp.baseSalary) : Number(emp.salary);
  return Math.max(Math.round(base || 0), 0) + Math.max(Math.round(Number(emp.allowance) || 0), 0);
}

export function deleteEmployee(id) {
  requireCap('payroll');
  localStorage.setItem(EMP_KEY, JSON.stringify(getAllEmployees().filter(e => e.id !== id)));
}

// ===== Draft proses gaji per bulan: { [YYYY-MM]: { items: {empId: {overtime, withThr, withPph, checked}}, status } =====
const DRAFT_KEY = 'wynara_payroll_drafts';

export function getPayrollDraft(monthKey) {
  try {
    const v = localStorage.getItem(DRAFT_KEY);
    const o = v ? JSON.parse(v) : {};
    return (o && o[monthKey]) || null;
  } catch { return null; }
}

export function savePayrollDraft(monthKey, draft) {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch {}
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Periode tidak valid');
  o[monthKey] = { items: (draft && draft.items) || {}, status: (draft && draft.status) || 'draft', updatedAt: new Date().toISOString() };
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch {}
  return o[monthKey];
}

export function markPayrollFinal(monthKey) {
  return savePayrollDraft(monthKey, { ...(getPayrollDraft(monthKey) || {}), status: 'final' });
}

// Siapa yang sudah dibayar untuk bulan tertentu. Dipakai untuk menjaga agar payroll
// tidak dobel-posting: id karyawan (akurat) + fallback nama (untuk data lama).
export function payrollPaidEmployeeIds(monthKey) {
  const mk = String(monthKey || '').slice(0, 7);
  const ids = new Set();
  const names = new Set();
  getEntries().forEach((e) => {
    if (e.category !== 'gaji-out') return;
    if (String(e.date || '').slice(0, 7) !== mk) return;
    const pid = e.payroll && e.payroll.employeeId;
    if (pid) ids.add(String(pid));
    if (e.person) names.add(String(e.person).toLowerCase().trim());
  });
  return { ids: Array.from(ids), names: Array.from(names) };
}

// ===== Verifikasi pengeluaran (advisory, bukan penghalang posting) =====
// Entry yang dibuat operator ditandai belum diverifikasi; pemilik menandai "diverifikasi"
// sebagai bukti sudah diperiksa. Tidak mengubah jurnal apa pun.
export function setEntryVerified(id, verified = true) {
  const list = getEntries();
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) throw new Error('Transaksi tidak ditemukan');
  if (verified) {
    list[i].verified = true;
    list[i].verifiedAt = new Date().toISOString();
    list[i].verifiedBy = (getActor() || {}).user || 'owner';
  } else {
    delete list[i].verified; delete list[i].verifiedAt; delete list[i].verifiedBy;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  logAudit('update', 'entry-verify', id, null, { verified: !!verified });
  return list[i];
}
export function unverifiedCount(monthKey = '') {
  const mk = String(monthKey || '').slice(0, 7);
  return getEntries().filter((e) => e.type === 'expense' && !e.verified && (!mk || String(e.date).slice(0, 7) === mk)).length;
}

// ===== Checklist pajak & tutup buku (advisory) =====
// Disimpan per bulan: { 'YYYY-MM': { stepId: {done, at, auto} } }
const CHECK_KEY = 'wynara_checklist';
export function getChecklist(monthKey) {
  const mk = String(monthKey || '').slice(0, 7);
  let all = {};
  try { const v = JSON.parse(localStorage.getItem(CHECK_KEY) || '{}'); all = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch {}
  const m = (all[mk] && typeof all[mk] === 'object') ? all[mk] : {};
  return m;
}
export function setChecklistStep(monthKey, stepId, done) {
  const mk = String(monthKey || '').slice(0, 7);
  let all = {};
  try { const v = JSON.parse(localStorage.getItem(CHECK_KEY) || '{}'); all = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch {}
  const m = (all[mk] && typeof all[mk] === 'object') ? all[mk] : {};
  m[stepId] = done ? { done: true, at: new Date().toISOString() } : { done: false };
  all[mk] = m;
  try { localStorage.setItem(CHECK_KEY, JSON.stringify(all)); } catch {}
  logAudit('update', 'checklist', `${mk}:${stepId}`, null, { done: !!done });
  return m;
}

// ===== Nomor invoice: INV/2026/09/0042 =====
const COUNTER_KEY = 'wynara_counters';

export function nextInvoiceNo() {
  let counters = {};
  try { counters = JSON.parse(localStorage.getItem(COUNTER_KEY) || '{}'); } catch {}
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  counters.invoiceSeq = counters.invoiceSeq || {};
  counters.invoiceSeq[key] = (Number(counters.invoiceSeq[key]) || 0) + 1;
  try { localStorage.setItem(COUNTER_KEY, JSON.stringify(counters)); } catch {}
  return `INV/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(counters.invoiceSeq[key]).padStart(4, '0')}`;
}

// ===== Akun custom (COA) =====
const COA_KEY = 'wynara_coa_custom';
export const COA_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export function getCustomAccounts() {
  try {
    const v = localStorage.getItem(COA_KEY);
    const a = v ? JSON.parse(v) : [];
    return (Array.isArray(a) ? a : []).filter(x => x && /^\d{4}$/.test(x.code));
  } catch { return []; }
}

export function saveCustomAccount(acc) {
  requireCap('ledger');
  const code = String(acc.code || '').trim();
  if (!/^\d{4}$/.test(code)) throw new Error('Kode akun harus 4 digit (mis. 5120)');
  const type = COA_TYPES.includes(acc.type) ? acc.type : 'expense';
  const name = String(acc.name || '').replace(/[<>"'&]/g, '').trim().slice(0, 60);
  if (!name) throw new Error('Nama akun wajib');
  const list = getCustomAccounts();
  if (ACCOUNTS.some(a => a.code === code)) throw new Error(`Kode ${code} sudah dipakai akun bawaan`);
  if (list.some(a => a.code === code)) throw new Error(`Kode ${code} sudah dipakai`);
  const rec = {
    code, name, type,
    category: type === 'expense' ? String(acc.category || '').trim().slice(0, 60) : '',
    custom: true, updatedAt: new Date().toISOString()
  };
  list.push(rec);
  localStorage.setItem(COA_KEY, JSON.stringify(list));
  return rec;
}

export function renameCustomAccount(code, name) {
  const clean = String(name || '').replace(/[<>"'&]/g, '').trim().slice(0, 60);
  if (!clean) throw new Error('Nama akun wajib');
  const list = getCustomAccounts();
  const idx = list.findIndex(a => a.code === code);
  if (idx === -1) throw new Error('Akun tidak ditemukan');
  list[idx] = { ...list[idx], name: clean, updatedAt: new Date().toISOString() };
  localStorage.setItem(COA_KEY, JSON.stringify(list));
  return list[idx];
}

export function deleteCustomAccount(code, journalBalances) {
  requireCap('ledger');
  const bal = journalBalances && journalBalances[code];
  if (bal && ((bal.debit || 0) - (bal.credit || 0)) !== 0) {
    throw new Error('Akun sudah ada mutasi — tidak bisa dihapus');
  }
  localStorage.setItem(COA_KEY, JSON.stringify(getCustomAccounts().filter(a => a.code !== code)));
}

// ===== Beli ke supplier (hutang usaha + stok masuk) =====
const PURCH_KEY = 'wynara_purchases';

function getPurchases() {
  try {
    const v = localStorage.getItem(PURCH_KEY);
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}

function savePurchases(list) {
  try {
    localStorage.setItem(PURCH_KEY, JSON.stringify(list));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') throw new Error('Penyimpanan pembelian penuh');
    throw e;
  }
}

export function getAllPurchases() {
  return getPurchases().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function getPurchaseById(id) {
  return getPurchases().find(p => p.id === id) || null;
}

export function purchasePaidTotal(p) {
  return (Array.isArray(p.payments) ? p.payments : []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

// ===== Rekonsiliasi bank: posting mutasi langsung ke COA =====
export function importBankLines(lines, { bankAccount } = {}) {
  requireCap('ledger');
  let ok = 0, locked = 0, skipped = 0;
  (Array.isArray(lines) ? lines : []).forEach(l => {
    if (!l || !l.date || !l.counterAccount || !(Number(l.amount) > 0)) { skipped++; return; }
    try {
      assertUnlocked(l.date);
      const j = buildBankLineJournal({
        date: l.date, amount: l.amount, direction: l.direction === 'in' ? 'in' : 'out',
        bankAccount, counterAccount: l.counterAccount, memo: l.memo || l.desc || 'Mutasi bank',
      });
      if (!j) { skipped++; return; }
      postJournal(j);
      ok++;
    } catch { locked++; }
  });
  logAudit('create', 'bank-import', '', null, { ok, locked, skipped, bank: bankAccount });
  return { ok, locked, skipped };
}

// ===== Rekonsiliasi bank: simpan baris mutasi + status pencocokan =====
const BANK_STMT_KEY = 'wynara_bank_statement';
export function getBankStatement() {
  try { const v = JSON.parse(localStorage.getItem(BANK_STMT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveBankStatement(list) {
  try { localStorage.setItem(BANK_STMT_KEY, JSON.stringify((Array.isArray(list) ? list : []).slice(0, 1000))); } catch {}
  return getBankStatement();
}
export function upsertBankStatement(rows) {
  const cur = getBankStatement();
  const byKey = new Map(cur.map(s => [s.key, s]));
  (Array.isArray(rows) ? rows : []).forEach(r => {
    if (!r || !r.key) return;
    const ex = byKey.get(r.key);
    if (ex) byKey.set(r.key, { ...ex, ...r, matchedId: ex.matchedId || null, matchedType: ex.matchedType || null, posted: ex.posted || false, ignored: ex.ignored || false });
    else byKey.set(r.key, { ...r, matchedId: r.matchedId || null, matchedType: r.matchedType || null, posted: r.posted || false, ignored: r.ignored || false });
  });
  saveBankStatement([...byKey.values()]);
  return getBankStatement();
}
export function updateBankStatement(key, patch) {
  const list = getBankStatement();
  const i = list.findIndex(s => s.key === key);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch };
  saveBankStatement(list);
  return list[i];
}
export function clearBankStatement() { try { localStorage.removeItem(BANK_STMT_KEY); } catch {} }

// ===== Aturan bank (keyword → akun COA) untuk auto-isi impor berikutnya =====
const BANK_RULES_KEY = 'wynara_bank_rules';
export function getBankRules() {
  try { const v = JSON.parse(localStorage.getItem(BANK_RULES_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function saveBankRules(list) {
  try { localStorage.setItem(BANK_RULES_KEY, JSON.stringify((Array.isArray(list) ? list : []).slice(0, 200))); } catch {}
  return getBankRules();
}
export function addBankRule(keyword, code, direction) {
  const k = String(keyword || '').trim().toLowerCase().slice(0, 40);
  if (!k) throw new Error('Kata kunci wajib diisi');
  if (!/^\d{4}$/.test(String(code || ''))) throw new Error('Akun COA tidak valid');
  const dir = (direction === 'in' || direction === 'out') ? direction : '';
  const list = getBankRules().filter(r => !(r.keyword === k && (r.direction || '') === dir));
  list.push({ id: generateId(), keyword: k, code: String(code), direction: dir });
  logAudit('create', 'bank-rule', '', null, { keyword: k, code: String(code), direction: dir });
  return saveBankRules(list);
}
export function deleteBankRule(id) {
  return saveBankRules(getBankRules().filter(r => r.id !== id));
}
export function updateBankRule(id, patch) {
  const list = getBankRules();
  const i = list.findIndex(r => r.id === id);
  if (i < 0) return null;
  const p = patch || {};
  const next = { ...list[i] };
  if (p.keyword !== undefined) { const k = String(p.keyword).trim().toLowerCase().slice(0, 40); if (k) next.keyword = k; }
  if (p.code !== undefined && /^\d{4}$/.test(String(p.code))) next.code = String(p.code);
  if (p.direction !== undefined) next.direction = (p.direction === 'in' || p.direction === 'out') ? p.direction : '';
  list[i] = next;
  saveBankRules(list);
  return next;
}
export function clearBankRules() { return saveBankRules([]); }

// Alias nama akun bawaan (kode & tahan tetap; hanya label tampilan).
const COA_ALIAS_KEY = 'wynara_coa_alias';
export function getCoaAliases() {
  try { const v = JSON.parse(localStorage.getItem(COA_ALIAS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function saveCoaAliases(map) {
  try { localStorage.setItem(COA_ALIAS_KEY, JSON.stringify(map || {})); } catch {}
  return map || {};
}
// Cari akun dari aturan (substring kata kunci; kata kunci terpanjang menang). Null bila tidak ada.
export function matchBankRule(desc, direction) {
  const s = String(desc || '').toLowerCase();
  const dir = (direction === 'in' || direction === 'out') ? direction : '';
  const hits = getBankRules().filter(r =>
    r.keyword && s.includes(r.keyword) && (!r.direction || !dir || r.direction === dir));
  if (!hits.length) return null;
  hits.sort((a, b) => String(b.keyword).length - String(a.keyword).length);
  return hits[0].code;
}

// ===== Saldo akhir rekening koran (untuk indikator selisih) =====
const BANK_ENDBAL_KEY = 'wynara_bank_endbal';
export function getBankEndBalances() {
  try { const v = JSON.parse(localStorage.getItem(BANK_ENDBAL_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function setBankEndBalance(code, amount) {
  const all = getBankEndBalances();
  const c = String(code || '').slice(0, 10);
  if (!c) return all;
  const n = Number(amount);
  if (!isFinite(n) || n === 0) delete all[c]; else all[c] = Math.round(n);
  try { localStorage.setItem(BANK_ENDBAL_KEY, JSON.stringify(all)); } catch {}
  return all;
}

// ===== Penjualan kredit (jual dulu, bayar nanti) =====
const CREDIT_KEY = 'wynara_credit_sales';

// ===== Titip beli / Preorder (beli barang atas nama pelanggan) =====
const PREORDER_KEY = 'wynara_preorders';
export function getPreorders() {
  try { const d = JSON.parse(localStorage.getItem(PREORDER_KEY) || '[]'); return Array.isArray(d) ? d : []; }
  catch { return []; }
}
function savePreorders(list) { try { localStorage.setItem(PREORDER_KEY, JSON.stringify(list)); } catch {} }
export function getPreorderById(id) { return getPreorders().find(x => x.id === id) || null; }
export function preorderSellTotal(po) {
  // pakai sellTotal tersimpan (sudah diskon); fallback recompute untuk data lama
  if (po && po.sellTotal != null && Number.isFinite(Number(po.sellTotal))) return Math.max(Number(po.sellTotal) || 0, 0);
  return ((po && po.items) || []).reduce((s, l) => s + Math.max(Number(l.qty) || 0, 0) * Math.max(Number(l.price) || 0, 0), 0);
}
export function preorderCostTotal(po) {
  return ((po && po.costs) || []).reduce((s, c) => s + Math.max(Number(c.amount) || 0, 0), 0);
}
export function preorderGoodsCost(po) {
  return ((po && po.costs) || []).filter(c => c.kind === 'barang').reduce((s, c) => s + Math.max(Number(c.amount) || 0, 0), 0);
}
export function preorderPaidTotal(po) {
  return ((po && po.payments) || []).reduce((s, p) => s + Math.max(Number(p.amount) || 0, 0), 0);
}
export function preorderBalance(po) {
  return Math.max(preorderSellTotal(po) - preorderPaidTotal(po), 0);
}
// Kelebihan bayar: pelanggan sudah bayar melebihi nilai pesanan (mis. setelah kurang kirim) → harus dikembalikan.
export function preorderRefundTotal(po) {
  return ((po && po.refunds) || []).reduce((s, r) => s + Math.max(Number(r.amount) || 0, 0), 0);
}
export function preorderRefundDue(po) {
  return Math.max(preorderPaidTotal(po) - preorderRefundTotal(po) - preorderSellTotal(po), 0);
}
// Refund ke pelanggan: uang muka (2101) berkurang, kas keluar.
export function refundPreorder(id, { amount, date, payment, note } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  const due = preorderRefundDue(po);
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah refund harus > 0');
  if (amt > due + 0.01) throw new Error(`Melebihi kelebihan bayar (Rp ${Math.round(due).toLocaleString('id-ID')})`);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const j = buildPreorderRefundJournal({ date: d, amount: amt, payment: payment || 'transfer', memo: `Refund kelebihan bayar ${po.no}${po.customer ? ' — ' + po.customer : ''}` });
  if (j) { j.refId = id; postJournal(j); }
  po.refunds = (po.refunds || []).concat({ id: generateId(), date: d, amount: amt, payment: payment || 'transfer', note: String(note || '').slice(0, 80) });
  po.events = (po.events || []).concat([{ date: d, stage: po.stage, note: `Refund ke pelanggan Rp ${Math.round(amt).toLocaleString('id-ID')}`, tracking: '', schedule: '' }]);
  list[i] = po;
  savePreorders(list);
  logAudit('create', 'preorder-refund', id, null, { amount: amt });
  return po;
}
export function preorderProfit(po) {
  return preorderPaidTotal(po) - preorderCostTotal(po);
}
function nextPreorderNo() {
  const list = getPreorders();
  const d = new Date();
  return `PO-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(list.length + 1).padStart(3, '0')}`;
}
// Buat pesanan titip beli: DP opsional langsung masuk (Cr 2101 Customer Deposit).
// months = estimasi berapa bulan barang tiba (preorder luar negeri).
// Buat pesanan titip beli: DP opsional langsung masuk (Cr 2101 Customer Deposit).
// months = estimasi berapa bulan barang tiba (preorder luar negeri); fx = kurs Rp per ¥.
export function createPreorder({ date, customer, items, deposit, payment, note, eta, months, discount, fx, target, channel, shopId, draft } = {}) {
  requireCap('ledger');
  const isStock = target === 'stock';
  if (isStock) {
    // Order stok: item WAJIB terhubung ke produk (barang masuk stok saat diterima)
    const bad = (Array.isArray(items) ? items : []).some(l => !l || !l.itemId);
    if (bad) throw new Error('Pesanan stok perlu barang dari daftar produk');
  }
  const wantDp = !isStock; // order stok: pembayaran ke supplier dicatat sebagai biaya, bukan DP
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const clean = (Array.isArray(items) ? items : []).filter(l => l && String(l.name || '').trim() && Number(l.qty) > 0)
    .map(l => ({ ...(l.itemId ? { itemId: l.itemId } : {}), name: String(l.name).trim().slice(0, 80), qty: Math.floor(Number(l.qty) || 1), price: Math.max(Math.round(Number(l.price) || 0), 0) }));
  if (!clean.length) throw new Error('Tambahkan minimal satu barang pesanan');
  const sub = clean.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), sub);
  const sellTotal = Math.max(sub - disc, 0);
  if (sellTotal <= 0) throw new Error('Total pesanan harus > 0');
  let dp = Math.min(Math.max(Math.round(Number(deposit) || 0), 0), sellTotal);
  if (!wantDp) dp = 0;
  const id = generateId();
  const cleanItems = clean.map(l => ({ ...(l.itemId ? { itemId: String(l.itemId) } : {}), name: l.name, qty: l.qty, price: l.price }));
  const monthsEta = Math.max(Number(months) || 0, 0);
  const fxRate = Math.max(Number(fx) || 2300, 1);
  const rec = {
    id, no: nextPreorderNo(), date: d, eta: String(eta || '').slice(0, 40), monthsEta, fx: fxRate,
    target: isStock ? 'stock' : 'customer', channel: (channel === 'lokal' || channel === 'luar') ? channel : 'luar',
    shopId: (shopId || '').slice(0, 60),
    customer: String(customer || '').trim().slice(0, 60),
    items: cleanItems, subtotal: sub, discount: disc, sellTotal, deposit: dp, payment: payment || 'cash',
    costs: [], payments: [], status: draft ? 'draft' : 'final',
    stage: draft ? 'draft' : (dp > 0 ? 'dp_paid' : 'ordered'),
    events: [{ date: d, stage: dp > 0 ? 'dp_paid' : 'ordered', note: customer ? 'Pesanan dibuat' : 'Pesanan dibuat', tracking: '', schedule: '' }],
    note: String(note || '').slice(0, 120), createdAt: new Date().toISOString(),
  };
  if (dp > 0 && !draft) {
    const j = buildPreorderPayJournal({ date: d, amount: dp, payment: rec.payment, memo: `DP titip beli ${rec.no}${rec.customer ? ' — ' + rec.customer : ''}` });
    if (j) { j.refId = id; postJournal(j); }
    rec.payments = [{ id: generateId(), date: d, amount: dp, payment: rec.payment, kind: 'DP', note: 'DP saat pesan' }];
  }
  if (draft) { rec.deposit = 0; rec.plannedDeposit = dp; } // draft belum menerima uang
  const list = getPreorders().concat(rec);
  savePreorders(list);
  logAudit('create', 'preorder', id, null, { no: rec.no, sellTotal, deposit: dp });
  return rec;
}
// Pelanggan bayar (DP sisa / pelunasan): Dr kas / Cr Customer Deposit.
export function payPreorder(id, { amount, date, payment, note } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (po.stage === 'settled' || po.stage === 'cancelled') throw new Error('Pesanan sudah selesai');
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah bayar harus > 0');
  const bal = preorderBalance(po);
  if (amt > bal + 0.01) throw new Error(`Melebihi sisa tagihan (Rp${Math.round(bal).toLocaleString('id-ID')})`);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const j = buildPreorderPayJournal({ date: d, amount: amt, payment, memo: `Bayar titip beli ${po.no}${po.customer ? ' — ' + po.customer : ''}` });
  if (j) { j.refId = id; postJournal(j); }
  po.payments = (po.payments || []).concat({ id: generateId(), date: d, amount: amt, payment: payment || 'cash', kind: preorderPaidTotal(po) === 0 ? 'DP' : 'bayar', note: String(note || '').slice(0, 80) });
  if (po.stage === 'ordered') po.stage = 'dp_paid';
  po.events = (po.events || []).concat([{ date: d, stage: po.stage, note: `Pembayaran ${('Rp' + Math.round(amt).toLocaleString('id-ID'))}`, tracking: '', schedule: '' }]);
  list[i] = po;
  savePreorders(list);
  logAudit('create', 'preorder-pay', id, null, { amount: amt });
  return po;
}
// Biaya titip beli dari kita (beli barang/kirim/bea masuk/jasa): Dr 1105/6208/5199 Cr kas.
export function addPreorderCost(id, { amount, kind, date, payment, note } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (po.stage === 'cancelled') throw new Error('Pesanan dibatalkan');
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah biaya harus > 0');
  const k = ['barang', 'kirim', 'lain'].includes(kind) ? kind : 'barang';
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const j = buildPreorderCostJournal({ date: d, amount: amt, kind: k, payment, memo: `Biaya ${po.no}${po.customer ? ' — ' + po.customer : ''}${note ? ' • ' + note : ''}` });
  if (j) { j.refId = id; postJournal(j); }
  po.costs = (po.costs || []).concat({ id: generateId(), date: d, amount: amt, kind: k, payment: payment || 'cash', note: String(note || '').slice(0, 80) });
  list[i] = po;
  savePreorders(list);
  logAudit('create', 'preorder-cost', id, null, { amount: amt, kind: k });
  return po;
}
// Finalkan draft pesanan: catat DP (bila benar-benar diterima) dan masukkan ke alur pesanan.
export function finalizePreorderDraft(id, { deposit, payment, date } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (po.status !== 'draft') throw new Error('Pesanan ini bukan draft');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const amt = Math.min(Math.max(Math.round(Number(deposit) || 0), 0), preorderSellTotal(po));
  if (amt > 0) {
    const j = buildPreorderPayJournal({ date: d, amount: amt, payment: payment || 'transfer', memo: `DP titip beli ${po.no}${po.customer ? ' — ' + po.customer : ''}` });
    if (j) { j.refId = id; postJournal(j); }
    po.payments = (po.payments || []).concat({ id: generateId(), date: d, amount: amt, payment: payment || 'transfer', kind: 'DP', note: 'DP saat finalisasi' });
    po.deposit = amt;
  }
  po.status = 'final';
  po.stage = amt > 0 ? 'dp_paid' : 'ordered';
  po.events = (po.events || []).concat([{ date: d, stage: po.stage, note: 'Pesanan difinalkan', tracking: '', schedule: '' }]);
  list[i] = po;
  savePreorders(list);
  logAudit('update', 'preorder', id, null, { final: true, deposit: amt });
  return po;
}


// Barang dibeli & dikirim (pengiriman dari China): hanya update tahap.
export function shipPreorder(id, { note, tracking, cny } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (!['ordered', 'dp_paid'].includes(po.stage)) throw new Error('Tahap sudah ' + po.stage);
  const d = new Date().toISOString().split('T')[0];
  po.stage = 'china';
  po.shipNotes = String(note || '').slice(0, 80);
  po.shipment = { ...(po.shipment || {}), tracking: String(tracking || '').slice(0, 40), date: d };
  po.events = (po.events || []).concat([{ date: d, stage: 'china', note: `Barang dibeli${cny > 0 ? ' ¥' + Number(cny).toLocaleString('id-ID') : ''}${note ? ' • ' + note : ''}`, tracking: String(tracking || '').slice(0, 40), schedule: '' }]);
  list[i] = po;
  savePreorders(list);
  logAudit('update', 'preorder', id, null, { stage: 'china' });
  return po;
}
// Barang sampai + pelanggan bayar penuh sisa → uang muka jadi pendapatan, barang jadi HPP.
export function settlePreorder(id, { date, payment, note, costGoodsOvr } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (po.target === 'stock') throw new Error('Pesanan stok tidak memiliki pelunasan pelanggan — gunakan Terima stok di Pembelian');
  if (!['ordered', 'dp_paid', 'shipping', 'shipped', 'arrived', 'received', 'invoiced'].includes(po.stage)) throw new Error('Status pesanan: ' + po.stage);
  const bal = preorderBalance(po);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  if (bal > 0.01) {
    payPreorder(id, { amount: bal, date: d, payment, note: 'Pelunasan (barang sampai)' });
    po.stage = 'shipping';
  }
  const cur = getPreorderById(id) || po;
  // Pendapatan yang diakui = uang yang benar-benar ditahan (bayar − refund), bukan total bayar bruto.
  const paid = Math.max(preorderPaidTotal(cur) - preorderRefundTotal(cur), 0);
  const goods = costGoodsOvr != null ? Math.max(Math.round(Number(costGoodsOvr) || 0), 0) : preorderGoodsCost(cur);
  const j = buildPreorderSettleJournal({ date: d, totalPaid: paid, costGoods: goods, memo: `Pelunasan titip beli ${po.no}${po.customer ? ' — ' + po.customer : ''}` });
  if (j) { j.refId = id; postJournal(j); }
  cur.stage = 'settled';
  cur.settledDate = d;
  cur.settledNote = String(note || '').slice(0, 80);
  cur.events = (cur.events || []).concat([{ date: d, stage: 'done', note: 'Lunas & selesai' + (note ? ' • ' + note : ''), tracking: '', schedule: '' }]);
  const out = getPreorders();
  const oi = out.findIndex(x => x.id === id);
  if (oi >= 0) out[oi] = cur; else out.push(cur);
  savePreorders(out);
  logAudit('update', 'preorder', id, null, { stage: 'settled', paid, goods });
  return cur;
}
// Selesaikan manual (barang sampai, pembayaran belum penuh) — tanpa jurnal pelunasan penuh.
export function arrivePreorder(id, { date, note } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (!['ordered', 'dp_paid', 'shipping', 'shipped'].includes(po.stage)) throw new Error('Status pesanan: ' + po.stage);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  po.stage = 'arrived';
  po.arrivedDate = d;
  po.events = (po.events || []).concat([{ date: d, stage: 'received', note: `Barang sampai${note ? ' • ' + note : ''}`, tracking: '', schedule: '' }]);
  list[i] = po;
  savePreorders(list);
  logAudit('update', 'preorder', id, null, { stage: 'arrived' });
  return po;
}
// Order stok: barang sampai → masuk gudang (kuantitas). Uang sudah dicatat sbg biaya.
export function receivePreorderStock(id, { date, note, tracking } = {}) {
  requireCap('ledger');
  const po = getPreorderById(id);
  if (!po) throw new Error('Pesanan tidak ditemukan');
  if (po.target !== 'stock') throw new Error('Bukan pesanan stok');
  if (po.stockReceived) throw new Error('Stok sudah diterima untuk pesanan ini');
  if (po.stage === 'cancelled') throw new Error('Pesanan dibatalkan');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  const list = getPreorders();
  const i = list.findIndex(x => x.id === id);
  const applied = [];
  try {
    (po.items || []).forEach(l => {
      if (!l.itemId) return;
      applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: 0, keepCost: true, ref: id, note: 'order stok diterima', type: 'restock' });
      applied.push(l);
    });
  } catch (e) {
    applied.forEach(l => { try { applyStockMove(l.itemId, { qtyOut: l.qty, keepCost: true, ref: id, note: 'reversal', type: 'reversal' }); } catch {} });
    throw e;
  }
  const cur = list[i];
  cur.stage = 'received';
  cur.stockReceived = true;
  cur.receivedDate = d;
  cur.shipment = { ...(cur.shipment || {}), ...(tracking ? { tracking: String(tracking).slice(0, 40) } : {}), date: (cur.shipment || {}).date || d };
  cur.events = (cur.events || []).concat([{ date: d, stage: 'received', note: 'Stok masuk gudang', tracking: String(tracking || '').slice(0, 40), schedule: '' }]);
  list[i] = cur;
  savePreorders(list);
  logAudit('update', 'preorder-stock', id, null, { items: applied.length });
  return cur;
}
// Batalkan & hapus pesanan: jurnal terkait dihapus agar kas & laba konsisten.
export function deletePreorder(id) {  requireCap('ledger');
  const list = getPreorders();
  const po = list.find(x => x.id === id);
  if (!po) return false;
  deleteJournalsByRef('preorder', id);
  savePreorders(list.filter(x => x.id !== id));
  logAudit('delete', 'preorder', id, null, { no: po.no });
  return true;
}
export function getCreditSales() {
  try { const v = JSON.parse(localStorage.getItem(CREDIT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveCreditSales(list) { try { localStorage.setItem(CREDIT_KEY, JSON.stringify(list)); } catch {} }
export function getCreditSaleById(id) { return getCreditSales().find(x => x.id === id) || null; }
export function creditPaidTotal(cs) {
  const pay = ((cs && cs.payments) || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return pay + (Number(cs && cs.deposit) || 0);
}
export function creditOutstanding(cs) {
  if (!cs) return 0;
  return Math.max((Number(cs.total) || 0) - creditPaidTotal(cs), 0);
}
export function creditSalesSummary() {
  const list = getCreditSales();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = Date.now() - 30 * 86400000;
  let outstanding = 0, overdue = 0, openCount = 0, overdueCount = 0, received30 = 0;
  list.forEach(cs => {
    const out = creditOutstanding(cs);
    if (out > 0.01) {
      outstanding += out; openCount++;
      if (cs.dueDate && new Date(cs.dueDate + 'T00:00:00') < today) { overdue += out; overdueCount++; }
    }
    // DP dihitung diterima pada tanggal pembuatan pesanan (uang sudah benar-benar masuk)
    const dp = Number(cs.deposit) || 0;
    if (dp > 0 && Number.isFinite(Date.parse(cs.date)) && Date.parse(cs.date) >= cutoff) received30 += dp;
    (cs.payments || []).forEach(p => {
      const t = Date.parse(p.date || p.createdAt || '');
      if (Number.isFinite(t) && t >= cutoff) received30 += Number(p.amount) || 0;
    });
  });
  return { outstanding, overdue, openCount, overdueCount, received30, count: list.length };
}
function nextCreditInvoiceNo() {
  const list = getCreditSales();
  const d = new Date();
  return `INV-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(list.length + 1).padStart(3, '0')}`;
}
// Penjualan kredit: pendapatan penuh + DP masuk kas + sisa jadi Piutang (1201), stok & HPP diakui.
// flow='order': alur pesanan DP → dikirim → diterima → pelunasan (dilacak lewat Pemeriksaan Pengiriman).
export function createCreditSale({ date, dueDate, customer, person, lines, discount, ppn, deposit, depositPct, terms, payment, note, flow }) {
  requireCap('ledger');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  // Barang boleh dari master (itemId) atau manual (nama saja) — manual tidak menyentuh stok.
  const cleanLines = (Array.isArray(lines) ? lines : []).filter(l => l && (l.itemId || String(l.name || '').trim()) && Number(l.qty) > 0).map(l => {
    const it = l.itemId ? (getItemById(l.itemId) || {}) : {};
    const qty = Math.floor(Number(l.qty) || 0);
    const cost = (l.avgCost != null) ? Number(l.avgCost) || 0 : Number(it.cost) || 0;
    return { itemId: String(l.itemId || ''), qty, price: Math.max(Number(l.price) || 0, 0), name: String(l.name || it.name || '').slice(0, 80), avgCost: cost };
  });
  if (!cleanLines.length) throw new Error('Tambahkan minimal satu barang');
  const sub = cleanLines.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), sub);
  const total = Math.max(sub - disc, 0);
  if (total <= 0) throw new Error('Total penjualan harus lebih dari 0');
  const pct = Math.min(Math.max(Number(depositPct) || 0, 0), 100);
  const rawDp = (deposit !== undefined && deposit !== null && deposit !== '') ? Number(deposit) : Math.round(total * pct / 100);
  const dp = Math.min(Math.max(Math.round(rawDp || 0), 0), total);
  const id = generateId();
  const invoiceNo = nextCreditInvoiceNo();
  const rate = getPpn().rate;
  const cogs = cleanLines.reduce((s, l) => s + Math.round(l.qty * l.avgCost), 0);
  const applied = [];
  try {
    cleanLines.forEach(l => { if (l.itemId) { applyStockMove(l.itemId, { qtyOut: l.qty, ref: id, type: 'sale' }); applied.push(l); } });
  } catch (e) {
    applied.forEach(l => { try { applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: 0, keepCost: true, ref: id, note: 'reversal', type: 'reversal' }); } catch {} });
    throw e;
  }
  try {
    const j = buildCreditSaleJournal({ date: d, total, ppn: !!ppn, ppnRate: rate, deposit: dp, payment, cogs, memo: `Penjualan kredit ${invoiceNo}${customer ? ' — ' + customer : ''}` });
    if (j) { j.refId = id; postJournal(j); }
  } catch {}
  const rec = {
    id, invoiceNo, date: d, dueDate: String(dueDate || '').slice(0, 10),
    customer: String(customer || '').slice(0, 60), person: String(person || customer || '').slice(0, 60),
    lines: cleanLines, subtotal: sub, discount: disc, ppn: !!ppn, total, deposit: dp,
    terms: Math.max(Math.floor(Number(terms) || 1), 1), payments: [],
    flow: flow === 'order' ? 'order' : 'credit',
    stage: flow === 'order' ? 'ordered' : '',
    shipment: null, deliveredDate: '',
    timeline: [],
    status: dp >= total - 0.01 ? 'paid' : 'open',
    note: String(note || '').slice(0, 120), createdAt: new Date().toISOString(),
  };
  if (flow === 'order') {
    rec.timeline = [{ date: d, stage: 'ordered', note: customer ? `Pesanan dibuat${note ? ' — ' + note : ''}` : 'Pesanan dibuat', tracking: '', schedule: '' }];
    if (dp > 0) {
      rec.stage = 'dp_paid';
      rec.timeline.push({ date: d, stage: 'dp_paid', note: `DP diterima ${('Rp' + Math.round(dp).toLocaleString('id-ID'))}`, tracking: '', schedule: '' });
    }
  }
  if (rec.status === 'paid' && rec.flow === 'order') { rec.stage = 'done'; rec.deliveredDate = d; rec.timeline.push({ date: d, stage: 'done', note: 'Lunas di awal — tidak perlu kirim lagung', tracking: '', schedule: '' }); }
  saveCreditSales(getCreditSales().concat(rec));
  logAudit('create', 'credit-sale', id, null, { invoiceNo, total, deposit: dp });
  return rec;
}
export function payCreditSale(id, { amount, date, payment, note } = {}) {
  requireCap('ledger');
  const list = getCreditSales();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Penjualan kredit tidak ditemukan');
  const cs = list[i];
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Jumlah bayar harus > 0');
  const out = creditOutstanding(cs);
  if (amt > out + 0.01) throw new Error(`Melebihi sisa tagihan (Rp${Math.round(out).toLocaleString('id-ID')})`);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const j = buildCreditPaymentJournal({ date: d, amount: amt, payment, memo: `Bayar ${cs.invoiceNo}${cs.customer ? ' — ' + cs.customer : ''}` });
  if (j) { j.refId = id; postJournal(j); }
  cs.payments = (cs.payments || []).concat({ id: generateId(), date: d, amount: amt, payment: payment || 'cash', note: String(note || '').slice(0, 80), createdAt: new Date().toISOString() });
  cs.status = creditOutstanding(cs) <= 0.01 ? 'paid' : 'open';
  if (cs.flow === 'order') {
    if (creditOutstanding(cs) <= 0.01) cs.stage = 'done';
    else if (cs.stage === 'ordered') cs.stage = 'dp_paid';
    cs.timeline = (cs.timeline || []).concat([{ date: d, stage: cs.stage, note: `Pembayaran ${('Rp' + Math.round(amt).toLocaleString('id-ID'))}`, tracking: '', schedule: '' }]);
  }
  list[i] = cs;
  saveCreditSales(list);
  logAudit('create', 'credit-sale-pay', id, null, { amount: amt });
  return cs;
}
// Pemeriksaan Pengiriman: tandai pesanan sedang dikirim (single shipment).
export function shipCreditSale(id, { courier, tracking, date, note } = {}) {
  requireCap('ledger');
  const list = getCreditSales();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Penjualan tidak ditemukan');
  const cs = list[i];
  if (cs.flow !== 'order') throw new Error('Bukan pesanan alur pengiriman');
  if (cs.stage && !['ordered', 'dp_paid'].includes(cs.stage)) throw new Error('Pesanan sudah dikirim — status: ' + cs.stage);
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  cs.stage = 'shipped';
  cs.shipment = {
    courier: String(courier || '').slice(0, 60), tracking: String(tracking || '').slice(0, 40),
    date: d, note: String(note || '').slice(0, 80),
  };
  cs.timeline = (cs.timeline || []).concat([{ date: d, stage: 'shipped', note: `Dikirim${courier ? ' via ' + courier : ''}${note ? ' • ' + note : ''}`, tracking: String(tracking || '').slice(0, 40), schedule: '' }]);
  list[i] = cs;
  saveCreditSales(list);
  logAudit('update', 'credit-sale', id, null, { stage: 'shipped', shipment: cs.shipment });
  return cs;
}
// Pemeriksaan Pengiriman: tandai kedatangan barang (diterima pelanggan), tunggu pelunasan.
export function receiveCreditSale(id, { date } = {}) {
  requireCap('ledger');
  const list = getCreditSales();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Penjualan tidak ditemukan');
  const cs = list[i];
  if (cs.flow !== 'order') throw new Error('Bukan pesanan alur pengiriman');
  if (cs.stage && !['dp_paid', 'ordered', 'shipped'].includes(cs.stage)) throw new Error('Status sekarang: ' + cs.stage + ' — barang tidak bisa ditandai diterima pada status ini');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  cs.stage = 'received';
  cs.deliveredDate = d;
  cs.timeline = (cs.timeline || []).concat([{ date: d, stage: 'received', note: 'Barang diterima pelanggan', tracking: '', schedule: '' }]);
  list[i] = cs;
  saveCreditSales(list);
  logAudit('update', 'credit-sale', id, null, { stage: 'received', deliveredDate: cs.deliveredDate });
  return cs;
}
// Update status manual (riwayat bebas): kirim resi, sampai di perusahaan, kirim invoice,
// jadwal pembayaran, dll. Stage hanya maju; pembayaran tercatat lewat tombol bayar.
const ORDER_TRACK_STAGES = ['ordered', 'dp_paid', 'shipped', 'received', 'invoiced', 'done'];
export function trackCreditOrder(id, { stage, date, note, tracking, schedule } = {}) {
  requireCap('ledger');
  const list = getCreditSales();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const cs = list[i];
  if (cs.flow !== 'order') throw new Error('Bukan pesanan alur pesanan');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  let st = stage;
  if (st === 'done' && creditOutstanding(cs) > 0.01) throw new Error('Belum lunas — tandai Lunas via tombol Bayar, atau pilih status lain');
  if (st && !ORDER_TRACK_STAGES.includes(st)) throw new Error('Status tidak dikenal: ' + st);
  if (st === 'shipped') {
    cs.shipment = { ...(cs.shipment || {}), tracking: String(tracking || '').slice(0, 40), date: (cs.shipment && cs.shipment.date) || d };
  }
  cs.stage = st || cs.stage;
  cs.timeline = (cs.timeline || []).concat([{
    date: d, stage: cs.stage, note: String(note || '').slice(0, 140),
    tracking: String(tracking || '').slice(0, 40), schedule: String(schedule || '').slice(0, 10),
  }]);
  list[i] = cs;
  saveCreditSales(list);
  logAudit('update', 'credit-sale', id, null, { stage: cs.stage, note, tracking, schedule });
  return cs;
}
const PO_TRACK_STAGES = ['ordered', 'dp_paid', 'paid', 'china', 'to_indo', 'in_wh', 'sent', 'invoiced', 'shipping', 'arrived', 'received', 'shipped'];
// Update status manual (riwayat bebas): barang dibeli→gudang China, China→Indo (bayar kirim),
// gudang kita, dikirim ke pelanggan, invoice terkirim (immediate/scheduled), dll.
export function trackPreorder(id, { stage, date, note, tracking, schedule } = {}) {
  requireCap('ledger');
  const list = getPreorders();
  const i = list.findIndex(x => x.id === id);
  if (i < 0) throw new Error('Pesanan tidak ditemukan');
  const po = list[i];
  if (po.stage === 'cancelled') throw new Error('Pesanan dibatalkan');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  let st = stage;
  if (st === 'done') throw new Error('Gunakan tombol Lunas & Selesai untuk menyelesaikan pesanan');
  if (st && !PO_TRACK_STAGES.includes(st)) throw new Error('Status tidak dikenal: ' + st);
  if (st === 'shipped') po.stage = 'shipping';
  else if (st === 'received') po.stage = 'arrived';
  else if (st) po.stage = st;
  if ((st === 'shipped' || st === 'to_indo' || st === 'sent') && tracking) {
    po.shipment = { ...(po.shipment || {}), tracking: String(tracking).slice(0, 40), date: d };
  }
  po.events = (po.events || []).concat([{
    date: d, stage: st || po.stage, note: String(note || '').slice(0, 140),
    tracking: String(tracking || '').slice(0, 40), schedule: String(schedule || '').slice(0, 10),
  }]);
  list[i] = po;
  savePreorders(list);
  logAudit('update', 'preorder', id, null, { newStage: st, note, tracking, schedule });
  return po;
}
export function deleteCreditSale(id) {
  requireCap('ledger');
  const list = getCreditSales();
  const cs = list.find(x => x.id === id);
  if (!cs) return false;
  (cs.lines || []).forEach(l => { try { applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: 0, keepCost: true, ref: id, note: 'reversal', type: 'reversal' }); } catch {} });
  deleteJournalsByRef('credit-sale', id);
  deleteJournalsByRef('credit-pay', id);
  saveCreditSales(list.filter(x => x.id !== id));
  logAudit('delete', 'credit-sale', id, null, null);
  return true;
}

// ===== Preview migrasi renumber COA (belum mengubah data) =====
export function previewCoaRenumber() {
  const map = COA_RENUMBER;
  const hits = new Map();
  const bump = (code) => { if (code && map[code] && map[code] !== code) hits.set(code, (hits.get(code) || 0) + 1); };
  let jLines = 0, jAffected = 0;
  getAllJournals().forEach(j => {
    let touched = false;
    (j.lines || []).forEach(l => { if (map[l.account] && map[l.account] !== l.account) { jLines++; touched = true; bump(l.account); } });
    if (touched) jAffected++;
  });
  let stmtHits = 0;
  getBankStatement().forEach(s => {
    if ((map[s.counterAccount] && map[s.counterAccount] !== s.counterAccount) || (map[s.bankAccount] && map[s.bankAccount] !== s.bankAccount)) stmtHits++;
    bump(s.counterAccount); bump(s.bankAccount);
  });
  let ruleHits = 0;
  getBankRules().forEach(r => { if (map[r.code] && map[r.code] !== r.code) { ruleHits++; bump(r.code); } });
  const openDraft = (() => { try { return JSON.parse(localStorage.getItem('wynara_opening') || 'null'); } catch { return null; } })();
  const openingCodes = openDraft && openDraft.rows ? Object.keys(openDraft.rows).filter(c => map[c] && map[c] !== c) : [];
  const known = new Set(getAccounts().map(a => a.code));
  const unknown = new Set();
  getAllJournals().forEach(j => (j.lines || []).forEach(l => { if (!known.has(l.account)) unknown.add(l.account); }));
  return {
    mapSize: Object.keys(map).length,
    journalLines: jLines,
    journalsAffected: jAffected,
    statementsAffected: stmtHits,
    rulesAffected: ruleHits,
    openingCodes,
    unknownCodes: [...unknown],
    merged: Object.entries(map).filter(([a, b]) => a !== b && mapHasDuplicateTarget(map, b)),
    hits: [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
  };
}
function mapHasDuplicateTarget(map, target) {
  return Object.values(map).filter(v => v === target).length > 1;
}

// ===== Migrasi renumber COA (sekali). Backup → tulis ulang kode → tandai versi. =====
const COA_VER_KEY = 'wynara_coa_version';
const COA_BAK_KEY = 'wynara_coa_backup';
export function isCoaRenumbered() { return localStorage.getItem(COA_VER_KEY) === '2'; }
export function migrateCoaRenumber() {
  if (isCoaRenumbered()) return { skipped: true };
  const map = COA_RENUMBER;
  const remap = (c) => (c && map[c]) ? map[c] : c;
  // 1) backup
  try {
    const backup = {
      at: new Date().toISOString(),
      journals: getAllJournals(),
      bankStatement: getBankStatement(),
      bankRules: getBankRules(),
      opening: (() => { try { return JSON.parse(localStorage.getItem('wynara_opening') || 'null'); } catch { return null; } })(),
      customAccounts: getCustomAccounts(),
      aliases: getCoaAliases(),
    };
    localStorage.setItem(COA_BAK_KEY, JSON.stringify(backup));
  } catch {}
  let lines = 0, journals = 0;
  // 2) jurnal
  try {
    const js = getAllJournals().map(j => {
      let touched = false;
      const nl = (j.lines || []).map(l => {
        const nc = remap(l.account);
        if (nc !== l.account) { lines++; touched = true; return { ...l, account: nc }; }
        return l;
      });
      if (touched) journals++;
      return { ...j, lines: nl };
    });
    localStorage.setItem(JOURN_KEY, JSON.stringify(js));
  } catch {}
  // 3) mutasi bank
  try {
    saveBankStatement(getBankStatement().map(s => ({ ...s, counterAccount: remap(s.counterAccount), bankAccount: remap(s.bankAccount) })));
  } catch {}
  // 4) aturan bank (dedupe setelah merge)
  try {
    const seen = new Set();
    saveBankRules(getBankRules().map(r => ({ ...r, code: remap(r.code) }))
      .filter(r => { const k = `${r.keyword}|${r.direction || ''}`; if (seen.has(k)) return false; seen.add(k); return true; }));
  } catch {}
  // 5) saldo awal
  try {
    const op = JSON.parse(localStorage.getItem('wynara_opening') || 'null');
    if (op && op.rows) {
      const nrows = {};
      Object.keys(op.rows).forEach(c => {
        const nc = remap(c); const v = op.rows[c] || { debit: 0, credit: 0 };
        if (nrows[nc]) nrows[nc] = { debit: (Number(nrows[nc].debit) || 0) + (Number(v.debit) || 0), credit: (Number(nrows[nc].credit) || 0) + (Number(v.credit) || 0) };
        else nrows[nc] = v;
      });
      op.rows = nrows;
      localStorage.setItem('wynara_opening', JSON.stringify(op));
    }
  } catch {}
  // 6) akun custom: remap + buang yang kini jadi akun bawaan + dedupe
  try {
    const builtins = new Set(ACCOUNTS.map(a => a.code));
    const seen = new Set();
    const cust = getCustomAccounts().map(a => ({ ...a, code: remap(a.code) }))
      .filter(a => !builtins.has(a.code) && !seen.has(a.code) && (seen.add(a.code), true));
    localStorage.setItem(COA_KEY, JSON.stringify(cust));
  } catch {}
  // 7) alias lama tidak diperlukan lagi (nama sudah di chart baru)
  try { localStorage.removeItem('wynara_coa_alias'); } catch {}
  try { localStorage.setItem(COA_VER_KEY, '2'); } catch {}
  logAudit('update', 'coa-renumber', '', null, { lines, journals });
  return { lines, journals, done: true };
}

export function purchaseOutstanding(p) {
  return Math.max((Number(p.totalCost) || 0) - purchasePaidTotal(p), 0);
}

function sanitizePurchaseLine(l) {
  if (!l || typeof l !== 'object') return null;
  const item = getItemById(l.itemId);
  if (!item) return null;
  const qty = Math.max(Math.floor(Number(l.qty) || 0), 0);
  const unitCost = Math.max(Number(l.unitCost) || 0, 0);
  if (qty <= 0 || unitCost <= 0) return null;
  return { itemId: item.id, name: item.name, qty, unitCost, lineTotal: Math.round(qty * unitCost) };
}

export function createPurchase({ supplier, date, dueDate, lines, note }) {
  requireCap('ledger');
  assertUnlocked(String(date || '').slice(0, 10));
  const cleanLines = (Array.isArray(lines) ? lines : []).map(sanitizePurchaseLine).filter(Boolean);
  if (!cleanLines.length) throw new Error('Isi dulu barang + qty + harga modal');
  if (!isValidDateStr(String(date || '').slice(0, 10))) throw new Error('Tanggal tidak valid');
  const person = String(supplier || '').trim().replace(/[<>"'&]/g, '').slice(0, 60);
  if (!person) throw new Error('Tulis dulu nama supplier');
  const totalCost = cleanLines.reduce((s, l) => s + l.lineTotal, 0);
  const rec = {
    id: generateId(),
    supplier: person,
    date: String(date).slice(0, 10),
    dueDate: isValidDateStr(dueDate) ? String(dueDate).slice(0, 10) : '',
    lines: cleanLines,
    totalCost,
    payments: [],
    status: 'active',
    note: String(note || '').slice(0, 100),
    createdAt: new Date().toISOString()
  };
  // Stok masuk dulu (gagal → batal semua)
  const applied = [];
  try {
    cleanLines.forEach(l => {
      applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: l.unitCost, ref: rec.id, type: 'purchase' });
      applied.push(l);
    });
  } catch (err) {
    applied.forEach(l => { try { applyStockMove(l.itemId, { qtyOut: l.qty, type: 'purchase' }); } catch {} });
    throw err;
  }
  const list = getPurchases();
  list.push(rec);
  savePurchases(list);
  try {
    const j = buildPurchaseJournal({ amount: totalCost, date: rec.date, memo: `Beli ke ${person}` });
    if (j) { j.refId = rec.id; postJournal(j); }
  } catch {}
  try { savePerson(person, 'perusahaan'); } catch {}
  logAudit('create', 'purchase', rec.id, null, { supplier: person, total: totalCost });
  return rec;
}

export function addPurchasePayment(purchaseId, { amount, date, payment, paymentDetail, note, withhold: whRaw }) {
  requireCap('ledger');
  assertUnlocked(String(date || '').slice(0, 10));
  const list = getPurchases();
  const idx = list.findIndex(p => p.id === purchaseId);
  if (idx === -1) throw new Error('Pembelian tidak ditemukan');
  const p = list[idx];
  const amt = Math.round(Number(amount) || 0);
  if (!isFinite(amt) || amt <= 0) throw new Error('Nominal harus lebih dari 0');
  if (amt > purchaseOutstanding(p) + 0.01) throw new Error(`Melebihi sisa ${purchaseOutstanding(p).toLocaleString('id-ID')}`);
  if (!isValidDateStr(String(date || '').slice(0, 10))) throw new Error('Tanggal tidak valid');
  // Pemotongan pajak atas nama vendor (PPh 23 jasa 2% / PPh 4(2) sewa 10%)
  let withhold = null;
  const whType = String(whRaw || '');
  if (whType === '23' || whType === '42') {
    const pph = Math.round(amt * (whType === '23' ? 0.02 : 0.10));
    if (pph <= 0 || pph >= amt) throw new Error('Nominal terlalu kecil untuk pemotongan pajak');
    withhold = { type: whType, amount: pph };
  }
  p.payments.push({
    id: generateId(),
    amount: amt,
    date: String(date).slice(0, 10),
    payment: payment || 'transfer',
    paymentDetail: String(paymentDetail || '').slice(0, 60),
    note: String(note || '').slice(0, 100),
    withhold,
    createdAt: new Date().toISOString()
  });
  if (purchaseOutstanding(p) <= 0.01) p.status = 'paid';
  savePurchases(list);
  try {
    const j = buildPurchasePayJournal({ amount: amt, date: String(date).slice(0, 10), payment: payment || 'transfer', memo: `Bayar ${p.supplier}`, withhold });
    if (j) { j.refId = purchaseId; postJournal(j); }
  } catch {}
  logAudit('create', 'purchase-pay', purchaseId, null, { amount: amt, date: p.payments[p.payments.length - 1].date });
  return p;
}

export function deletePurchase(id) {
  requireCap('ledger');
  const list = getPurchases();
  const p = list.find(x => x.id === id);
  if (!p) return false;
  assertUnlocked(p.date);
  if ((p.payments || []).length) throw new Error('Sudah ada pembayaran — hapus pembayaran dulu via riwayat? (belum didukung, hubungi admin data)');
  // Kembalikan stok (gagal bila sudah terjual → tolak hapus)
  p.lines.forEach(l => applyStockMove(l.itemId, { qtyOut: l.qty, ref: id, note: 'hapus beli', type: 'purchase' }));
  savePurchases(list.filter(x => x.id !== id));
  deleteJournalsByRef('purchase', id);
  deleteJournalsByRef('purchase-pay', id);
  logAudit('delete', 'purchase', id, { supplier: p.supplier, total: p.totalCost }, null);
  return true;
}

// ===== Kunci periode (YYYY-MM) — bulan dikunci tak bisa tambah/ubah =====
const LOCK_KEY = 'wynara_locks';

export function getLockedMonths() {
  try {
    const v = localStorage.getItem(LOCK_KEY);
    const a = v ? JSON.parse(v) : [];
    return (Array.isArray(a) ? a : []).filter(m => /^\d{4}-\d{2}$/.test(m));
  } catch { return []; }
}

export function isMonthLocked(dateStr) {
  const m = String(dateStr || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) return false;
  return getLockedMonths().includes(m);
}

// Penegakan kunci di lapisan storage (bukan hanya UI): money-path apa pun
// yang menyentuh bulan terkunci harus GAGAL, bukan diam-diam lolos.
export function assertUnlocked(dateStr) {
  if (isMonthLocked(dateStr)) {
    const m = String(dateStr || '').slice(0, 7);
    throw new Error(`Bulan ${m} terkunci — buka kunci di Pengaturan untuk mengubah`);
  }
}

export function lockMonth(mm) {
  requireCap('settings');
  if (!/^\d{4}-\d{2}$/.test(mm)) throw new Error('Bulan tidak valid');
  const list = getLockedMonths();
  if (!list.includes(mm)) {
    list.push(mm);
    localStorage.setItem(LOCK_KEY, JSON.stringify(list.sort()));
  }
  return list;
}

export function unlockMonth(mm) {
  requireCap('settings');
  localStorage.setItem(LOCK_KEY, JSON.stringify(getLockedMonths().filter(m => m !== mm)));
}

// ===== Kredensial lokal (1 pengguna, hash SHA-256) =====
const AUTH_KEY = 'wynara_auth';

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'dj2:' + h.toString(16);
}

export async function hashPassword(pw) {
  const s = String(pw || '');
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && window.isSecureContext !== false) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('wynara$' + s));
      return 'sha:' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  return djb2('wynara$' + s);
}

export function getAuth() {
  try {
    const v = localStorage.getItem(AUTH_KEY);
    if (v) {
      const o = JSON.parse(v);
      if (o && o.user) return o;
    }
  } catch {}
  return { user: 'admin', alg: 'plain', hash: 'admin' };
}

export async function verifyLogin(user, pass) {
  const a = getAuth();
  if (String(user || '').trim().toLowerCase() !== String(a.user || '').toLowerCase()) return false;
  if (a.alg === 'plain') {
    const ok = String(pass || '') === String(a.hash || '');
    if (ok) {
      // migrasi ke hash saat berhasil masuk
      try { localStorage.setItem(AUTH_KEY, JSON.stringify({ user: a.user, alg: 'hash', hash: await hashPassword(pass) })); } catch {}
    }
    return ok;
  }
  return (await hashPassword(pass)) === a.hash;
}

export async function setPassword(newPass) {
  const p = String(newPass || '');
  if (p.length < 4) throw new Error('Kata sandi minimal 4 karakter');
  const a = getAuth();
  const rec = { user: a.user || 'admin', alg: 'hash', hash: await hashPassword(p) };
  localStorage.setItem(AUTH_KEY, JSON.stringify(rec));
  return true;
}

export function resetAuth() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

// ===== Peran & PIN (owner / akuntan / hrd / kasir) =====
const KASIR_KEY = 'wynara_kasir_pin';
const PIN_KEYS = { kasir: KASIR_KEY, akuntan: 'wynara_akuntan_pin', hrd: 'wynara_hrd_pin' };
const ROLES = ['owner', 'akuntan', 'hrd', 'kasir'];
const ROLE_KEY = 'wynara_role';
const ROLE_SAVED_KEY = 'wynara_role_saved';
const ACTOR_KEY = 'wynara_actor';

// Matriks izin (OQ4, keputusan manusia 2026-09-13):
// owner = semua (termasuk keamanan/PIN); akuntan = semua akuntansi (ledger+payroll+data+settings);
// hrd = gaji + penggantian kas kecil (petty = catat entri pengeluaran); kasir = catat transaksi.
const ROLE_CAPS = {
  owner: ['*'],
  akuntan: ['ledger', 'payroll', 'data', 'settings'],
  hrd: ['payroll', 'petty'],
  kasir: ['transact'],
};
export function can(cap) {
  const caps = ROLE_CAPS[getRole()] || ROLE_CAPS.owner;
  return caps.includes('*') || caps.includes(cap);
}
export function requireCap(cap) {
  if (!can(cap)) throw new Error('Akses ditolak — peran ini tidak diizinkan melakukan aksi tersebut');
}

function normRole(r) { return ROLES.includes(r) ? r : 'owner'; }

export async function verifyRolePin(role, pin) {
  const key = PIN_KEYS[role];
  if (!key) return false;
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  if (!rec || !rec.hash) {
    // Hanya kasir punya PIN default 1234 (dipaksa ganti oleh pemilik kapan saja).
    if (role === 'kasir' && String(pin || '') === '1234') {
      try { localStorage.setItem(key, JSON.stringify({ alg: 'hash', hash: await hashPassword('1234') })); } catch {}
      return true;
    }
    return false;
  }
  return (await hashPassword(pin)) === rec.hash;
}

export async function setRolePin(role, pin, enabled = true) {
  requireOwner();
  const key = PIN_KEYS[role];
  if (!key) throw new Error('Peran tidak dikenal');
  if (!enabled) { try { localStorage.removeItem(key); } catch {} return true; }
  const p = String(pin || '').trim();
  if (!/^\d{4,8}$/.test(p)) throw new Error('PIN harus 4–8 angka');
  try { localStorage.setItem(key, JSON.stringify({ alg: 'hash', hash: await hashPassword(p) })); } catch {}
  return true;
}
export function rolePinEnabled(role) {
  const key = PIN_KEYS[role];
  try { return !!key && !!localStorage.getItem(key); } catch { return false; }
}
// Kompat lama
export function verifyKasirPin(pin) { return verifyRolePin('kasir', pin); }
export function setKasirPin(pin, enabled = true) { return setRolePin('kasir', pin, enabled); }
export function kasirEnabled() { return rolePinEnabled('kasir'); }

export function setRole(role) {
  const r = normRole(role);
  try { if (r !== 'owner') sessionStorage.setItem(ROLE_KEY, r); else sessionStorage.removeItem(ROLE_KEY); } catch {}
}
export function setRolePersisted(role) {
  const r = normRole(role);
  setRole(r);
  try { if (r !== 'owner') localStorage.setItem(ROLE_SAVED_KEY, r); else localStorage.removeItem(ROLE_SAVED_KEY); } catch {}
}
export function clearPersistedRole() {
  try { localStorage.removeItem(ROLE_SAVED_KEY); } catch {}
}

export function getRole() {
  try {
    const s = sessionStorage.getItem(ROLE_KEY);
    if (ROLES.includes(s)) return s;
    const p = localStorage.getItem(ROLE_SAVED_KEY);
    if (ROLES.includes(p)) return p;
    return 'owner';
  } catch { return 'owner'; }
}

// Identitas pelaku (actor) untuk audit trail. Sesi-scoped — bukan dari data
// yang bisa diubah tanpa login.
export function setActor(actor) {
  try {
    if (actor && (actor.role || actor.user)) {
      sessionStorage.setItem(ACTOR_KEY, JSON.stringify({ role: String(actor.role || ''), user: String(actor.user || '') }));
    } else sessionStorage.removeItem(ACTOR_KEY);
  } catch {}
}
export function getActor() {
  try {
    const v = JSON.parse(sessionStorage.getItem(ACTOR_KEY) || 'null');
    if (v && (v.role || v.user)) return { role: v.role || 'owner', user: v.user || '' };
  } catch {}
  return { role: getRole(), user: '' };
}

export function isKasir() {
  return getRole() === 'kasir';
}
// Owner-only: aksi keamanan/peran (PIN, kredensial).
export function requireOwner() {
  if (getRole() !== 'owner') throw new Error('Akses ditolak — hanya pemilik yang bisa melakukan ini');
}

// ===== Tarif PPN configurable (default 11%) =====
// OQ2 SELESAI (keputusan manusia 2026-09-13): pakai 11% flat & tetap bisa
// diubah lewat Pengaturan; pengguna non-PKP (tak menerbitkan faktur pajak).
// Jangan hardcode di pemanggil — selalu baca getPpn().rate.
const PPN_KEY = 'wynara_ppn';
export function getPpn() {
  try {
    const v = JSON.parse(localStorage.getItem(PPN_KEY) || 'null');
    const r = Number(v && v.rate);
    if (Number.isFinite(r) && r >= 0 && r <= 0.3) return { rate: r };
  } catch {}
  return { rate: 0.11 };
}
export function savePpn(rate) {
  requireCap('settings');
  const r = Number(String(rate ?? '').replace(',', '.'));
  if (!Number.isFinite(r) || r < 0 || r > 0.3) throw new Error('Tarif PPN harus 0–30%');
  try { localStorage.setItem(PPN_KEY, JSON.stringify({ rate: r })); } catch {}
  return r;
}

// ===== UMP (upah minimum) configurable =====
// JANGAN mengarang angka per provinsi — pemilik mengisi UMP daerahnya.
const UMP_KEY = 'wynara_ump';
export function getUmp() {
  try {
    const v = JSON.parse(localStorage.getItem(UMP_KEY) || 'null');
    const n = Number(v && v.amount);
    if (Number.isFinite(n) && n > 0) return { amount: n };
  } catch {}
  return { amount: 0 };
}
export function saveUmp(amount) {
  requireCap('settings');
  const n = Math.max(Number(String(amount ?? '').replace(/[^0-9]/g, '')) || 0, 0);
  try { localStorage.setItem(UMP_KEY, JSON.stringify({ amount: n })); } catch {}
  return n;
}

// ===== Cuti karyawan (UU 13/2003 Ps.79): saldo per karyawan per tahun =====
const LEAVE_KEY = 'wynara_leave';
export function getLeaveAll() {
  try { const v = JSON.parse(localStorage.getItem(LEAVE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function getLeave(empId, year) {
  const all = getLeaveAll();
  const y = String(year || new Date().getFullYear());
  const rec = all[empId] && all[empId][y];
  return rec ? { entitled: Number(rec.entitled) || 12, taken: Number(rec.taken) || 0, comp: Number(rec.comp) || 0 } : { entitled: 12, taken: 0, comp: 0 };
}
export function saveLeave(empId, year, obj) {
  const all = getLeaveAll();
  const y = String(year || new Date().getFullYear());
  all[empId] = all[empId] || {};
  all[empId][y] = {
    entitled: Math.max(Number(obj && obj.entitled) || 12, 0),
    taken: Math.max(Number(obj && obj.taken) || 0, 0),
    comp: Math.max(Number(obj && obj.comp) || 0, 0),
  };
  try { localStorage.setItem(LEAVE_KEY, JSON.stringify(all)); } catch {}
  return all[empId][y];
}
// Tambah jatah ganti-cuti (comp) dan/atau cuti terpakai (taken) untuk tahun ini.
export function addLeave(empId, year, { comp = 0, taken = 0 } = {}) {
  const cur = getLeave(empId, year);
  return saveLeave(empId, year, { entitled: cur.entitled, taken: cur.taken + (Number(taken) || 0), comp: cur.comp + (Number(comp) || 0) });
}

// ===== Retur penjualan (parsial) =====
const SALE_RET_KEY = 'wynara_sale_returns';
export function getSaleReturns(saleId) {
  try {
    const v = JSON.parse(localStorage.getItem(SALE_RET_KEY) || '[]');
    const list = Array.isArray(v) ? v : [];
    return saleId ? list.filter(r => r.saleId === saleId) : list;
  } catch { return []; }
}
function saveSaleReturns(list) { try { localStorage.setItem(SALE_RET_KEY, JSON.stringify(list)); } catch {} }
export function returnedQtyFor(saleId) {
  const map = {};
  getSaleReturns(saleId).forEach(r => (r.lines || []).forEach(l => { map[l.itemId] = (map[l.itemId] || 0) + (Number(l.qty) || 0); }));
  return map;
}
// items: [{ itemId, qty }] — kembalikan stok + refund kas + balik pendapatan/HPP.
export function returnSale(saleId, items, { date, payment } = {}) {
  requireCap('ledger');
  const sale = getEntryById(saleId);
  if (!sale || !sale.sale || !Array.isArray(sale.sale.lines)) throw new Error('Bukan penjualan barang');
  const returned = returnedQtyFor(saleId);
  // Faktor diskon nota: harga baris belum memperhitungkan diskon nota.
  const sub = sale.sale.lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const invDisc = Math.min(Math.max(Number(sale.sale.discount) || 0, 0), sub);
  const discFactor = sub > 0 ? (sub - invDisc) / sub : 1;
  const lines = [];
  let refund = 0, costBack = 0;
  (Array.isArray(items) ? items : []).forEach(it => {
    const orig = sale.sale.lines.find(l => l.itemId === it.itemId);
    if (!orig) throw new Error('Baris tidak ditemukan di penjualan');
    const q = Math.floor(Number(it.qty) || 0);
    if (q <= 0) return;
    const remaining = (Number(orig.qty) || 0) - (returned[it.itemId] || 0);
    if (q > remaining) throw new Error(`Melebihi jumlah jual (sisa bisa diretur ${Math.max(remaining, 0)})`);
    const price = Math.round((Number(orig.price) || 0) * discFactor);
    const item = getItemById(it.itemId);
    const cost = (orig.avgCost != null) ? Number(orig.avgCost) || 0 : (item ? Number(item.cost) || 0 : 0);
    refund += price * q; costBack += cost * q;
    lines.push({ itemId: it.itemId, qty: q, price, cost });
  });
  if (!lines.length) throw new Error('Tidak ada baris untuk diretur');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const shopId = sale.shop || getActiveShopId();
  const rate = getPpn().rate;
  const dpp = sale.ppn ? Math.round(refund / (1 + rate)) : refund;
  const ppn = sale.ppn ? refund - dpp : 0;
  lines.forEach(l => applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: l.cost, keepCost: true, shop: shopId, ref: saleId, note: 'retur jual', type: 'return' }));
  try {
    const j = buildSaleReturnJournal({
      amount: refund, dpp, ppn, cost: costBack, date: d, payment: payment || sale.payment,
      memo: `Retur ${sale.person || ''}: ${lines.map(l => `${l.qty}× ${(getItemById(l.itemId) || {}).name || ''}`).join(', ')}`,
    });
    if (j) { j.refId = saleId; postJournal(j); }
  } catch {}
  const rec = { id: generateId(), saleId, date: d, payment: payment || sale.payment || 'transfer', lines, refund, dpp, ppn, costBack, createdAt: new Date().toISOString() };
  saveSaleReturns(getSaleReturns().concat(rec));
  logAudit('create', 'sale-return', rec.id, null, { saleId, refund, cost: costBack, lines: lines.length });
  return rec;
}

// ===== Dokumen stok: penyesuaian & transfer antar toko =====
export function adjustStock(itemId, { qty, reason, date, shop } = {}) {
  requireCap('ledger');
  const it = getItemById(itemId);
  if (!it) throw new Error('Barang tidak ditemukan');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  const n = Math.trunc(Number(qty) || 0);
  if (!n) throw new Error('Jumlah penyesuaian tidak boleh 0');
  assertUnlocked(d);
  const shopId = shop || getActiveShopId();
  const unitCost = Math.max(Number(it.cost) || 0, 0);
  if (n > 0) applyStockMove(itemId, { qtyIn: n, unitCost, keepCost: true, shop: shopId, note: reason || 'penyesuaian', type: 'adjust' });
  else applyStockMove(itemId, { qtyOut: -n, shop: shopId, note: reason || 'penyesuaian', type: 'adjust' });
  try {
    const j = buildAdjustJournal({ account: INVENTORY_ACCOUNT, amount: Math.abs(n) * unitCost, date: d, memo: `Penyesuaian ${it.name} (${n > 0 ? '+' : ''}${n})${reason ? ': ' + reason : ''}`, increase: n > 0 });
    if (j) postJournal(j);
  } catch {}
  logAudit('create', 'stock-adjust', itemId, null, { qty: n, reason: reason || '', shop: shopId, date: d });
  return getItemById(itemId);
}

export function transferStock(itemId, { fromShop, toShop, qty, date } = {}) {
  requireCap('ledger');
  const it = getItemById(itemId);
  if (!it) throw new Error('Barang tidak ditemukan');
  const q = Math.floor(Number(qty) || 0);
  if (q <= 0) throw new Error('Jumlah transfer harus > 0');
  const d = String(date || new Date().toISOString().split('T')[0]).slice(0, 10);
  assertUnlocked(d);
  const shops = getShops();
  if (!shops.some(s => s.id === fromShop) || !shops.some(s => s.id === toShop)) throw new Error('Toko tidak valid');
  if (fromShop === toShop) throw new Error('Toko asal dan tujuan harus beda');
  applyStockMove(itemId, { qtyOut: q, shop: fromShop, note: 'transfer keluar', type: 'transfer' });
  try {
    applyStockMove(itemId, { qtyIn: q, unitCost: 0, keepCost: true, shop: toShop, note: 'transfer masuk', type: 'transfer' });
  } catch (e) {
    try { applyStockMove(itemId, { qtyIn: q, unitCost: 0, keepCost: true, shop: fromShop, note: 'transfer batal', type: 'transfer' }); } catch {}
    throw e;
  }
  logAudit('create', 'stock-transfer', itemId, null, { qty: q, from: fromShop, to: toShop });
  return getItemById(itemId);
}

// ===== Aksi massal & laporan restock =====
export function setItemsActive(ids, active) {
  requireCap('ledger');
  const set = new Set(ids || []);
  if (!set.size) return 0;
  const items = getItems().map(i => set.has(i.id) ? { ...i, active: !!active, updatedAt: new Date().toISOString() } : i);
  localStorage.setItem(ITEM_KEY, JSON.stringify(items));
  logAudit('update', 'item-bulk', '', null, { active: !!active, count: set.size });
  return set.size;
}
export function setItemsCategory(ids, category) {
  requireCap('ledger');
  const set = new Set(ids || []);
  if (!set.size) return 0;
  const cat = String(category || '').slice(0, 30);
  const items = getItems().map(i => set.has(i.id) ? { ...i, category: cat, updatedAt: new Date().toISOString() } : i);
  localStorage.setItem(ITEM_KEY, JSON.stringify(items));
  logAudit('update', 'item-bulk', '', null, { category: cat, count: set.size });
  return set.size;
}
export function setItemsUnit(ids, unit) {
  requireCap('ledger');
  const set = new Set(ids || []);
  if (!set.size) return 0;
  const u = String(unit || '').slice(0, 12);
  const items = getItems().map(i => set.has(i.id) ? { ...i, unit: u, updatedAt: new Date().toISOString() } : i);
  localStorage.setItem(ITEM_KEY, JSON.stringify(items));
  logAudit('update', 'item-bulk', '', null, { unit: u, count: set.size });
  return set.size;
}
export function setItemsPricePct(ids, pct) {
  requireCap('ledger');
  const set = new Set(ids || []);
  if (!set.size) return 0;
  const p = Number(pct) || 0;
  const f = 1 + p / 100;
  const items = getItems().map(i => set.has(i.id) ? {
    ...i,
    price: Math.max(Math.round((Number(i.price) || 0) * f), 0),
    cost: Math.max(Math.round((Number(i.cost) || 0) * f), 0),
    updatedAt: new Date().toISOString(),
  } : i);
  localStorage.setItem(ITEM_KEY, JSON.stringify(items));
  logAudit('update', 'item-bulk', '', null, { pricePct: p, count: set.size });
  return set.size;
}
// Hapus massal: lewati barang yang sudah dipakai pembelian/penjualan.
export function deleteItemsBulk(ids) {
  requireCap('ledger');
  const set = new Set(ids || []);
  let deleted = 0, skipped = 0;
  if (!set.size) return { deleted, skipped };
  const purchases = getPurchases();
  const entries = getEntries();
  const kept = [];
  getItems().forEach(it => {
    if (!set.has(it.id)) { kept.push(it); return; }
    const usedByPurchase = purchases.some(p => (p.lines || []).some(l => l && l.itemId === it.id));
    const usedByEntry = entries.some(e => e.itemId === it.id || (e.sale && Array.isArray(e.sale.lines) && e.sale.lines.some(l => l && l.itemId === it.id)));
    if (usedByPurchase || usedByEntry) { skipped++; kept.push(it); }
    else deleted++;
  });
  localStorage.setItem(ITEM_KEY, JSON.stringify(kept));
  logAudit('delete', 'item-bulk', '', null, { deleted, skipped });
  return { deleted, skipped };
}
export function getReorderList(shopId) {
  const sid = shopId || getActiveShopId();
  const out = [];
  getAllItems().forEach(it => {
    if (it.active === false) return;
    const min = Number(it.minStock) || 0;
    if (min <= 0) return;
    const q = shopStockOf(it, sid);
    if (q <= min) out.push({ item: it, stock: q, min, suggest: Math.max(min * 2 - q, 1) });
  });
  return out.sort((a, b) => (a.stock - a.min) - (b.stock - b.min));
}

// ===== Aset tetap & penyusutan =====
const ASSET_KEY = 'wynara_assets';
export function getFixedAssets() {
  try {
    const list = JSON.parse(localStorage.getItem(ASSET_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function saveFixedAssets(list) {
  requireCap('ledger');
  try { localStorage.setItem(ASSET_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch {}
}

export const DEP_ASSET_CODE = '1510';
export const DEP_ACCUM_CODE = '1519';
export const DEP_EXPENSE_CODE = '5129';

// Penyusutan garis lurus per bulan sejak tanggal beli (basis akhir bulan)
export function monthsOwned(buyDate, refDate = new Date()) {
  const s = new Date(buyDate);
  const r = refDate instanceof Date ? refDate : new Date();
  if (!s || isNaN(s) || s > r) return 0;
  let m = (r.getFullYear() - s.getFullYear()) * 12 + (r.getMonth() - s.getMonth());
  if (r.getDate() < s.getDate()) m -= 1;
  return Math.max(0, m + 1); // bulan pembelian ikut disusutkan
}

// ===== Modal awal =====
export function getOpeningEquity() {
  try {
    const v = localStorage.getItem('wynara_equity');
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

export function saveOpeningEquity(amount) {
  const n = Math.max(Math.round(Number(amount) || 0), 0);
  localStorage.setItem('wynara_equity', JSON.stringify({ amount: n, updatedAt: new Date().toISOString() }));
  return n;
}
