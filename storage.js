import { totalOwed } from './loanmath.js';
import { buildEntryJournal, buildLoanJournal, buildRepaymentJournal, buildPurchaseJournal, buildPurchasePayJournal } from './journals.js';

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
  entries.push(newEntry);
  saveEntries(entries);
  // Stok: jual kurangi, beli tambah (gagal → rollback entry)
  if (newEntry.itemId && newEntry.qty > 0 && !newEntry.loanId) {
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
      unitCost: entry.unitCost
    });
  }
  if (entry.type === 'income' && entry.sale && Array.isArray(entry.sale.lines)) {
    entry.sale.lines.forEach(l => {
      if (l && l.itemId && l.qty > 0) moves.push({ itemId: l.itemId, qty: l.qty, dir: 'out' });
    });
  }
  return moves;
}

// Opsi jurnal + gerakan stok untuk sebuah entry (dibaca saat post).
function journalOptsFor(entry) {
  const opts = { ppn: !!entry.ppn };
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
      if (item && l.qty > 0) lines.push({ qty: l.qty, avgCost: item.cost, name: item.name });
    });
    if (lines.length) opts.saleLines = lines;
  }
  return opts;
}

function applyStockMoveForEntry(entry) {
  stockMovesFor(entry).forEach(m => {
    if (m.dir === 'out') applyStockMove(m.itemId, { qtyOut: m.qty });
    else applyStockMove(m.itemId, { qtyIn: m.qty, unitCost: m.unitCost || 0 });
  });
}

function reverseStockMoveForEntry(entry) {
  stockMovesFor(entry).forEach(m => {
    try {
      if (m.dir === 'out') applyStockMove(m.itemId, { qtyIn: m.qty, unitCost: 0, keepCost: true });
      else applyStockMove(m.itemId, { qtyOut: m.qty });
    } catch {}
  });
}

export function updateEntry(id, updates) {
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) return null;
  const before = { ...entries[index] };
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
  saveEntries(entries);
  if (!entries[index].loanId) {
    if (before.itemId || entries[index].itemId) {
      reverseStockMoveForEntry(before);
      try { applyStockMoveForEntry(entries[index]); } catch (err) {
        // Gagal terapkan baru → kembalikan lama (best-effort)
        try { applyStockMoveForEntry(before); } catch {}
        entries[index] = before;
        saveEntries(entries);
        throw err;
      }
    }
    deleteJournalsByRef('entry', id);
    try {
      const j = buildEntryJournal(entries[index], journalOptsFor(entries[index]));
      if (j) { j.refId = id; postJournal(j); }
    } catch {}
    logAudit('update', 'entry', id, { amount: before.amount, category: before.category }, { amount: entries[index].amount, category: entries[index].category });
  }
  return entries[index];
}

export function deleteEntry(id) {
  const entries = getEntries();
  const target = entries.find(e => e.id === id);
  const filtered = entries.filter(e => e.id !== id);
  saveEntries(filtered);
  const removed = filtered.length !== entries.length;
  if (removed && target && !target.loanId) {
    reverseStockMoveForEntry(target);
    deleteJournalsByRef('entry', id);
    logAudit('delete', 'entry', id, { amount: target.amount, category: target.category, date: target.date }, null);
  }
  return removed;
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
      const j = buildRepaymentJournal(loan, rep);
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
    ITEM_KEY, EMP_KEY, 'wynara_equity', 'wynara_lastBackup', COA_KEY, LOCK_KEY, PURCH_KEY, DRAFT_KEY
  ].forEach(k => { try { localStorage.removeItem(k); } catch {} });
  // Mirror IDB ikut kosong saat refresh berikutnya (queueMirror di app.js)
}

export function exportEntries() {
  const entries = getEntries();
  return JSON.stringify(entries, null, 2);
}

export function exportJSON() {
  const data = snapshotAll();
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
    'Tipe Kontak': l.contactType === 'perusahaan' ? 'Perusahaan' : 'Orang',
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
    Tipe: p.type === 'perusahaan' ? 'Perusahaan' : 'Orang'
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
      l.contactType === 'perusahaan' ? 'Perusahaan' : 'Orang',
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
  const seen = new Set(existing.map(e => `${e.date}|${e.category}|${e.amount}|${e.description}`));
  const out = [];
  for (const e of incoming) {
    const key = `${e.date}|${e.category}|${e.amount}|${e.description}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
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
            contactType: r['Tipe Kontak'] === 'Perusahaan' ? 'perusahaan' : 'person',
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
            const type = r.Tipe === 'Perusahaan' ? 'perusahaan' : 'person';
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
  return {
    id: String(ent.id || generateId()).slice(0, 60),
    date, type, category, payment,
    paymentDetail: String(ent.paymentDetail || '').slice(0, 60),
    description: String(ent.description || '').slice(0, 120),
    amount,
    person: String(ent.person || '').slice(0, 60),
    loanId: ent.loanId ? String(ent.loanId).slice(0, 60) : null
  };
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
    contactType: l.contactType === 'perusahaan' ? 'perusahaan' : 'person',
    loanType: l.loanType === 'cicilan' ? 'cicilan' : 'lunas',
    installmentAmount: Math.max(Number(l.installmentAmount) || 0, 0),
    interestRate: clampInterestRate(l.interestRate),
    invoiceNo: String(l.invoiceNo || '').slice(0, 30),
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

function importJSONFile(file) {
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
            data.items.forEach(it => {
              try {
                const before = getItems().length;
                saveItem({ ...it, id: undefined });
                if (getItems().length > before) cI++; else skipped++;
              } catch { skipped++; }
            });
          }
          if (Array.isArray(data.employees)) {
            data.employees.forEach(em => {
              try {
                const before = getAllEmployees().length;
                saveEmployee({ ...em, id: undefined });
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
              toAdd.forEach(p => {
                (p.lines || []).forEach(l => {
                  try { applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: l.unitCost }); } catch {}
                });
              });
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
        resolve({ entries: cE, loans: cL, repayments: cR, people: cP, journals: cJ || 0, items: cI || 0, employees: cM || 0, purchases: cB || 0, skipped });
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
          description: cols[4] || '',
          amount: Number(cols[5]),
          person: cols[6] || '',
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

export function createLoan(loan) {
  const loans = getLoans();
  const amount = Number(loan.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Jumlah pinjaman tidak valid');
  if (!loan.person || !String(loan.person).trim()) throw new Error('Nama kontak wajib');
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
  const loan = getLoanById(repayment.loanId);
  if (!loan) throw new Error('Pinjaman tidak ditemukan');
  const amount = Number(repayment.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Jumlah bayar tidak valid');
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
    const j = buildRepaymentJournal(loan, newRep);
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

export function deleteRepayment(id) {
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
    return data ? JSON.parse(data) : [];
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

export function savePerson(name, type, phone) {
  const trimmed = String(name || '').trim();
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
  const people = getPeopleList();
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
    return v ? JSON.parse(v) : [];
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
    exportedAt: new Date().toISOString(),
    version: 3
  };
}

export function snapshotSize(snap) {
  const s = snap || snapshotAll();
  return (s.entries?.length || 0) + (s.loans?.length || 0) + (s.repayments?.length || 0) + (s.people?.length || 0);
}

// Kembalikan snapshot (dari file backup / IDB). Semua baris disanitasi.
// Return { entries, loans, repayments, people } jumlah yang masuk.
export function restoreAll(snap) {
  if (!snap || typeof snap !== 'object') throw new Error('Snapshot tidak valid');
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
    const toAdd = snap.repayments.map(r => sanitizeRepayment(r, knownLoanIds)).filter(Boolean);
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
    snap.items.forEach(it => {
      try {
        const before = getItems().length;
        saveItem({ ...(it && typeof it === 'object' ? it : {}), id: undefined });
        if (getItems().length > before) cI++;
      } catch {}
    });
  }
  if (Array.isArray(snap.employees)) {
    snap.employees.forEach(e => {
      try {
        const before = getAllEmployees().length;
        saveEmployee({ ...(e && typeof e === 'object' ? e : {}), id: undefined });
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
      // Stok ikut dipulihkan (jurnalnya sudah ada di backup, jangan posting ulang)
      toAdd.forEach(p => {
        (p.lines || []).forEach(l => {
          try { applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: l.unitCost, keepCost: false }); } catch {}
        });
      });
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
  const d = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  if (!(Math.abs(d - c) < 0.005 && d > 0)) throw new Error('Jurnal tidak balance');
  const list = getJournals();
  list.push({ ...j, postedAt: new Date().toISOString() });
  saveJournals(list);
  return j;
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
      const j = buildEntryJournal(e, { ppn: !!e.ppn });
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
  getRepayments().forEach(r => {
    if (existing.has(`repayment:${r.id}`)) return;
    const loan = loanById.get(r.loanId);
    if (!loan) return;
    try {
      const j = buildRepaymentJournal(loan, r);
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

export function getItemById(id) {
  return getItems().find(i => i.id === id) || null;
}

export function saveItem(item) {
  const list = getItems();
  const name = String(item.name || '').trim().replace(/[<>"'&]/g, '').slice(0, 60);
  if (!name) throw new Error('Nama barang wajib');
  const stock = Math.max(Math.floor(Number(item.stock) || 0), 0);
  const cost = Math.max(Number(item.cost) || 0, 0);
  const price = Math.max(Number(item.price) || 0, 0);
  const minStock = Math.max(Math.floor(Number(item.minStock) || 0), 0);
  const rec = {
    id: item.id || generateId(),
    name,
    sku: String(item.sku || '').slice(0, 30),
    stock, cost, price, minStock,
    updatedAt: new Date().toISOString()
  };
  const idx = list.findIndex(i => i.id === rec.id);
  if (idx === -1) list.push(rec);
  else list[idx] = { ...list[idx], ...rec };
  localStorage.setItem(ITEM_KEY, JSON.stringify(list));
  return rec;
}

export function deleteItem(id) {
  localStorage.setItem(ITEM_KEY, JSON.stringify(getItems().filter(i => i.id !== id)));
}

// Stok + rata-rata tertimbang. qtyOut untuk jual (cek stok), qtyIn untuk beli.
// keepCost: tambah stok tanpa ubah rata-rata (untuk reversal).
export function applyStockMove(itemId, { qtyIn = 0, qtyOut = 0, unitCost = 0, keepCost = false } = {}) {
  const list = getItems();
  const idx = list.findIndex(i => i.id === itemId);
  if (idx === -1) throw new Error('Barang tidak ditemukan');
  const it = { ...list[idx] };
  const qi = Math.max(Math.floor(Number(qtyIn) || 0), 0);
  const qo = Math.max(Math.floor(Number(qtyOut) || 0), 0);
  if (qo > it.stock) throw new Error(`Stok ${it.name} kurang (sisa ${it.stock})`);
  if (qi > 0) {
    if (!keepCost) {
      const c = Math.max(Number(unitCost) || 0, 0);
      it.cost = it.stock + qi > 0 ? Math.round(((it.stock * it.cost) + (qi * c)) / (it.stock + qi)) : c;
    }
    it.stock += qi;
  }
  if (qo > 0) it.stock -= qo;
  it.updatedAt = new Date().toISOString();
  list[idx] = it;
  localStorage.setItem(ITEM_KEY, JSON.stringify(list));
  return it;
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
    bankName: cleanEmpStr(emp.bankName, 40),
    bankAcc: String(emp.bankAcc || '').replace(/[^0-9]/g, '').slice(0, 30),
    address: cleanEmpStr(emp.address, 120),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(emp.startDate || '') ? emp.startDate : '',
    contract: ['tetap', 'kontrak', 'harian'].includes(emp.contract) ? emp.contract : 'tetap',
    ptkp: String(emp.ptkp || 'TK/0').toUpperCase().slice(0, 5),
    bpjsKes: emp.bpjsKes === undefined ? true : !!emp.bpjsKes,
    bpjsTk: emp.bpjsTk === undefined ? true : !!emp.bpjsTk,
    jkkRate: Number(emp.jkkRate) > 0 ? Math.min(Number(emp.jkkRate), 5) : 0.54,
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
  const code = String(acc.code || '').trim();
  if (!/^\d{4}$/.test(code)) throw new Error('Kode akun harus 4 digit (mis. 5120)');
  const type = COA_TYPES.includes(acc.type) ? acc.type : 'expense';
  const name = String(acc.name || '').replace(/[<>"'&]/g, '').trim().slice(0, 60);
  if (!name) throw new Error('Nama akun wajib');
  const list = getCustomAccounts();
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
      applyStockMove(l.itemId, { qtyIn: l.qty, unitCost: l.unitCost });
      applied.push(l);
    });
  } catch (err) {
    applied.forEach(l => { try { applyStockMove(l.itemId, { qtyOut: l.qty }); } catch {} });
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

export function addPurchasePayment(purchaseId, { amount, date, payment, paymentDetail, note }) {
  const list = getPurchases();
  const idx = list.findIndex(p => p.id === purchaseId);
  if (idx === -1) throw new Error('Pembelian tidak ditemukan');
  const p = list[idx];
  const amt = Math.round(Number(amount) || 0);
  if (!isFinite(amt) || amt <= 0) throw new Error('Nominal harus lebih dari 0');
  if (amt > purchaseOutstanding(p) + 0.01) throw new Error(`Melebihi sisa ${purchaseOutstanding(p).toLocaleString('id-ID')}`);
  if (!isValidDateStr(String(date || '').slice(0, 10))) throw new Error('Tanggal tidak valid');
  p.payments.push({
    id: generateId(),
    amount: amt,
    date: String(date).slice(0, 10),
    payment: payment || 'transfer',
    paymentDetail: String(paymentDetail || '').slice(0, 60),
    note: String(note || '').slice(0, 100),
    createdAt: new Date().toISOString()
  });
  if (purchaseOutstanding(p) <= 0.01) p.status = 'paid';
  savePurchases(list);
  try {
    const j = buildPurchasePayJournal({ amount: amt, date: String(date).slice(0, 10), payment: payment || 'transfer', memo: `Bayar ${p.supplier}` });
    if (j) { j.refId = purchaseId; postJournal(j); }
  } catch {}
  logAudit('create', 'purchase-pay', purchaseId, null, { amount: amt, date: p.payments[p.payments.length - 1].date });
  return p;
}

export function deletePurchase(id) {
  const list = getPurchases();
  const p = list.find(x => x.id === id);
  if (!p) return false;
  if ((p.payments || []).length) throw new Error('Sudah ada pembayaran — hapus pembayaran dulu via riwayat? (belum didukung, hubungi admin data)');
  // Kembalikan stok (gagal bila sudah terjual → tolak hapus)
  p.lines.forEach(l => applyStockMove(l.itemId, { qtyOut: l.qty }));
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

export function lockMonth(mm) {
  if (!/^\d{4}-\d{2}$/.test(mm)) throw new Error('Bulan tidak valid');
  const list = getLockedMonths();
  if (!list.includes(mm)) {
    list.push(mm);
    localStorage.setItem(LOCK_KEY, JSON.stringify(list.sort()));
  }
  return list;
}

export function unlockMonth(mm) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(getLockedMonths().filter(m => m !== mm)));
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
