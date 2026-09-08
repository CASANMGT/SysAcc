import { totalOwed } from './loanmath.js';

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
    createdAt: new Date().toISOString()
  };
  if (entry.loanDue) newEntry.loanDue = entry.loanDue;
  if (entry.loanType) newEntry.loanType = entry.loanType;
  if (entry.installmentAmount) newEntry.installmentAmount = Number(entry.installmentAmount) || 0;
  if (entry.contactType) newEntry.contactType = entry.contactType;
  entries.push(newEntry);
  saveEntries(entries);
  return newEntry;
}

export function updateEntry(id, updates) {
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) return null;
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
  return entries[index];
}

export function deleteEntry(id) {
  const entries = getEntries();
  const filtered = entries.filter(e => e.id !== id);
  saveEntries(filtered);
  return filtered.length !== entries.length;
}

// Masukkan kembali entry persis (untuk Urungkan hapus). Return true jika masuk.
export function restoreEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id) return false;
  const entries = getEntries();
  if (entries.some(e => e.id === entry.id)) return false;
  entries.push({ ...entry });
  saveEntries(entries);
  return true;
}

// Masukkan kembali repayment persis (untuk Urungkan hapus). Return true jika masuk.
export function restoreRepayment(rep) {
  if (!rep || typeof rep !== 'object' || !rep.id) return false;
  const reps = getRepayments();
  if (reps.some(r => r.id === rep.id)) return false;
  reps.push({ ...rep });
  saveRepayments(reps);
  return true;
}

export function clearAllEntries() {
  localStorage.removeItem(STORAGE_KEY);
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

export function exportCSVEntries(list, filename) {
  const esc = (v) => {
    if (v === 0) return '"0"';
    if (v === null || v === undefined || v === '') return '""';
    return '"' + String(v).replace(/"/g, '""') + '"';
  };
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

  const esc = (v) => {
    if (v === 0) return '"0"';
    if (v === null || v === undefined || v === '') return '""';
    return '"' + String(v).replace(/"/g, '""') + '"';
  };
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
const VALID_TYPES = ['income', 'expense'];
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
        let cE = 0, cL = 0, cR = 0, cP = 0, skipped = 0;
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
              savePerson(name, p.type === 'perusahaan' ? 'perusahaan' : 'person');
              if (getPeopleList().length > before) added++; else skipped++;
            });
            cP = added;
          }
        }
        resolve({ entries: cE, loans: cL, repayments: cR, people: cP, skipped });
      } catch (err) {
        reject(new Error('Gagal membaca JSON: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsText(file);
  });
}

function importCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('==='));
        // simple CSV parse: assume first non-empty after header is data
        // Try to detect if Transaksi section
        const rows = [];
        let inTransaksi = false;
        for (const line of lines) {
          if (line.includes('Tanggal') && line.includes('Jenis')) { inTransaksi = line.includes('Transaksi') || true; continue; }
          if (line.includes('=== PINJAMAN') || line.includes('=== PEMBAYARAN')) break;
          const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
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
  try { savePerson(newLoan.person, newLoan.contactType); } catch {}
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
  saveLoans(loans);
  return loan;
}

export function deleteLoan(id) {
  const loan = getLoanById(id);
  if (loan && loan.entryId) try { deleteEntry(loan.entryId); } catch {}
  const reps = getRepayments().filter(r => r.loanId === id);
  reps.forEach(r => { if (r.entryId) try { deleteEntry(r.entryId); } catch {} });
  saveLoans(getLoans().filter(l => l.id !== id));
  saveRepayments(getRepayments().filter(r => r.loanId !== id));
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
    const entries = getEntries().filter(e => !loanEntryIds.has(e.id) && !e.loanId);
    // keep non-loan entries, but also filter by loanId
    const filtered = getEntries().filter(e => !e.loanId || !loans.some(l => l.id === e.loanId));
    // Simpler: remove all entries with loanId
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

export function savePerson(name, type) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return;
  if (trimmed.length > 60) throw new Error('Nama terlalu panjang');
  const people = getPeopleList();
  if (!people.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
    people.push({ id: generateId(), name: trimmed, type: type || 'person' });
    savePeopleList(people);
  } else {
    // update type if different
    const idx = people.findIndex(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (idx !== -1 && people[idx].type !== (type || 'person')) {
      people[idx].type = type || 'person';
      savePeopleList(people);
    }
  }
}

export function updatePerson(id, name, type) {
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
  people[index] = { ...people[index], name: trimmed, type: type || 'person' };
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
  const person = getPeopleList().find(p => p.id === id);
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
          person: ''
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
    exportedAt: new Date().toISOString(),
    version: 2
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
      try { savePerson(name, p.type === 'perusahaan' ? 'perusahaan' : 'person'); } catch {}
      if (getPeopleList().length > before) cP++;
    });
  }
  if (snap.budget && typeof snap.budget === 'object' && Number(snap.budget.amount) > 0) {
    try { saveBudget({ amount: Number(snap.budget.amount), updatedAt: snap.budget.updatedAt || new Date().toISOString() }); } catch {}
  }
  if (Array.isArray(snap.recurring)) {
    try { saveRecurring(snap.recurring.filter(r => r && typeof r === 'object')); } catch {}
  }
  return { entries: cE, loans: cL, repayments: cR, people: cP };
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
