import * as Storage from './storage.js';
import * as Reports from './reports.js';
import * as UI from './ui.js';
import * as IDB from './idb.js';
import { calcTenor, paidOf, outstandingOf, nextDue, totalOwed } from './loanmath.js';
import * as Charts from './charts.js';
import { EQUITY_ACCOUNT, ACCOUNTS, getAccounts, setCustomAccounts } from './coa.js';
import { buildEntryJournal, buildLoanJournal, buildRepaymentJournal, buildTransferJournal, buildAdjustJournal, buildOpeningJournal, findUnbalanced, balances } from './journals.js';
import { computeSlip, thrAmount, sanitizeRates, RATE_LIMITS, decRecon } from './payroll.js';
import * as Cloud from './supabase.js';

let currentEntries = [];
let currentFilters = { period: 'all', type: 'all', category: 'all', startDate: null, endDate: null };
let customRange = { start: null, end: null };
let loanSearchTerm = '';
let loanDirectionFilter = 'all';
let loanHidePaid = safeLocalGet('wynara_hidePaidLoans') === '1';
let sortColumn = 'date';
let sortDirection = 'desc';
let currentReportType = 'monthly';
let eventsBound = false;
let keyboardBound = false;
let currentPage = 1;
let transaksiPage = 1;
const pageSize = 20;
let searchBound = false;
function safeLocalGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
let arusKasRange = Number(safeLocalGet('wynara_arusRange')) || 6;
if (![3, 6, 12].includes(arusKasRange)) arusKasRange = 6;
let arusKasShow = { income: true, expense: true };
try {
  const saved = JSON.parse(safeLocalGet('wynara_arusShow') || 'null');
  if (saved && typeof saved.income === 'boolean') arusKasShow = saved;
} catch {}
window.__selectedIds = window.__selectedIds instanceof Set ? window.__selectedIds : new Set();

const APP_VERSION = '1.22.3';
// Penanda versi untuk inline skew-check di index.html (deteksi HTML/JS campur aduk).
window.__APP_VERSION = APP_VERSION;
const LOAN_CATEGORIES = ['Piutang', 'Hutang'];

function init() {
  window.__appBooted = true;
  // Self-heal split-brain cache: JS baru + HTML lama (tanpa anchor wajib) →
  // buang service worker + cache, lalu reload SEKALI. Mencegah halaman putih.
  const anchors = ['loginScreen', 'appRoot', 'viewRingkasan', 'viewLaporan', 'pageReportContent', 'reportBtnSidebar'];
  const missing = anchors.filter(id => !document.getElementById(id));
  if (missing.length) {
    try {
      if (!sessionStorage.getItem('wynara_swfix')) {
        sessionStorage.setItem('wynara_swfix', '1');
        const done = () => { try { window.location.reload(); } catch {} };
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => {
            if ('caches' in window) caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(done).catch(done);
            else done();
          }).catch(done);
        } else done();
        const box = document.getElementById('loginError');
        if (box) { box.classList.remove('hidden'); box.textContent = 'Memperbarui aplikasi ke versi terbaru…'; }
        return;
      }
    } catch {}
  }
  if (!isLoggedIn()) {
    showLogin();
    return;
  }
  showApp();
}

function safeSessionGet(k) {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function safeSessionSet(k, v) {
  try { sessionStorage.setItem(k, v); return true; }
  catch { UI.showError('Browser memblokir penyimpanan sesi — login tidak bisa disimpan'); return false; }
}
function safeLocalSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

function isLoggedIn() {
  return safeSessionGet('wynara_logged_in') === 'true' || safeLocalGet('wynara_logged_in') === 'true';
}

let loginListenerAdded = false;

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appRoot').classList.add('hidden');
  // Hint kredensial hanya saat sandi masih default (belum pernah diganti) — hilang setelah diganti
  const hint = document.getElementById('loginHint');
  if (hint) {
    const a = Storage.getAuth();
    const pristine = a.alg === 'plain';
    hint.textContent = pristine
      ? 'Pertama kali? Masuk "admin" / sandi "admin" — ganti segera di Pengaturan → Keamanan'
      : 'Masuk dengan akun yang diberikan pemilik';
    hint.style.display = pristine ? '' : 'none';
  }
  if (!loginListenerAdded) {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    const eye = document.getElementById('loginEye');
    if (eye) eye.addEventListener('click', () => {
      const pass = document.getElementById('loginPass');
      const isText = pass.type === 'text';
      pass.type = isText ? 'password' : 'text';
      eye.textContent = isText ? '👁️' : '🙈';
      try { eye.setAttribute('aria-pressed', String(!isText)); } catch {}
    });
    // clear error as soon as user retypes
    ['loginUser', 'loginPass'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        document.getElementById('loginError')?.classList.add('hidden');
      });
    });
    document.querySelector('.login-forgot')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Lupa kata sandi? Klik OK untuk reset ke default admin / admin.')) {
        Storage.resetAuth();
        UI.showSuccess('Direset. Masuk dengan admin / admin, lalu ganti di Pengaturan → Keamanan.');
        document.getElementById('loginUser').value = 'admin';
        document.getElementById('loginPass').value = 'admin';
      }
    });
    document.getElementById('loginHelp')?.addEventListener('click', (e) => {
      e.preventDefault();
      UI.openInfoModal('❓ Bantuan Wynara',
        `<p><b>Mulai dalam 3 langkah:</b> 1️⃣ Tambah transaksi → 2️⃣ Coba Pinjemin → 3️⃣ Lihat laporan.</p>` +
        `<p><b>Alur uang:</b> 📤 keluar = Kasih pinjam & Balikin. 📥 masuk = Dibalikin & Pinjam uang.</p>` +
        `<p><b>Keyboard:</b> <kbd>Ctrl+N</kbd> tambah · <kbd>/</kbd> cari · <kbd>Esc</kbd> tutup.</p>` +
        `<p><b>Data aman:</b> Pengaturan → JSON Backup tiap bulan. Login default <b>admin / admin</b> — segera ganti di Pengaturan → Keamanan.</p>`);
    });
    loginListenerAdded = true;
  }
  document.getElementById('loginError')?.classList.add('hidden');
  setTimeout(() => document.getElementById('loginUser')?.focus(), 50);
}

async function handleLogin(e) {
  e.preventDefault();
  const user = (document.getElementById('loginUser').value || '').trim();
  const pass = (document.getElementById('loginPass').value || '').trim();
  const btn = document.querySelector('.login-btn-new');
  if (btn) btn.disabled = true;
  try {
    if (user.toLowerCase() === 'kasir') {
      const ok = await Storage.verifyKasirPin(pass);
      if (!ok) {
        document.getElementById('loginError').classList.remove('hidden');
        document.getElementById('loginPass')?.select();
        return;
      }
      document.getElementById('loginError').classList.add('hidden');
      const remember = document.getElementById('loginRemember')?.checked !== false;
      try { localStorage.removeItem('wynara_logged_in'); } catch {}
      try { sessionStorage.removeItem('wynara_logged_in'); } catch {}
      if (remember) safeLocalSet('wynara_logged_in', 'true');
      else if (!safeSessionSet('wynara_logged_in', 'true')) return;
      Storage.setRole('kasir');
      showApp();
      return;
    }
    const ok = await Storage.verifyLogin(user, pass);
    if (!ok) {
      document.getElementById('loginError').classList.remove('hidden');
      document.getElementById('loginPass')?.select();
      return;
    }
    document.getElementById('loginError').classList.add('hidden');
    const remember = document.getElementById('loginRemember')?.checked !== false;
    try { localStorage.removeItem('wynara_logged_in'); } catch {}
    try { sessionStorage.removeItem('wynara_logged_in'); } catch {}
    if (remember) safeLocalSet('wynara_logged_in', 'true');
    else if (!safeSessionSet('wynara_logged_in', 'true')) return;
    Storage.setRole('owner');
    showApp();
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Mode Sederhana — sembunyikan alat akuntan (jurnal, kertas kerja) via CSS body[data-mode]
function applySimpleMode(mode) {
  try { document.body.dataset.mode = mode === 'sederhana' ? 'sederhana' : 'akuntan'; } catch {}
}
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');
  const role = Storage.getRole();
  document.getElementById('appRoot').setAttribute('data-role', role);
  applySimpleMode(safeLocalGet('wynara_mode'));
  try { if (safeLocalGet('wynara_sb') === '1') document.body.classList.add('sb-collapsed'); } catch {}
  updateBackupDot();
  updateCloudDot();
  nudgeBackupExport();
  // Sinkron online awal (bila terhubung) — diam-diam di background
  if (Cloud.isCloudConfigured() && Cloud.getCloudSession()) {
    setTimeout(() => {
      Cloud.syncNow().then(() => { try { updateCloudDot(); } catch {} }).catch(() => { try { updateCloudDot(); } catch {} });
    }, 4000);
  }
  // version display
  const vs = document.getElementById('appVersionSidebar');
  const vf = document.getElementById('appVersionFooter');
  if (vs) vs.textContent = APP_VERSION;
  if (vf) vf.textContent = APP_VERSION;
  // version check
  const stored = safeLocalGet('wynara_version');
  if (stored && stored !== APP_VERSION) {
    UI.showInfo(`Diperbarui ke v${APP_VERSION} (dari v${stored}) — lihat Changelog`);
  }
  safeLocalSet('wynara_version', APP_VERSION);
  try {
    const r = Storage.runRecurringEngine();
    if (r.posted > 0) UI.showSuccess(`Recurring: ${r.posted} transaksi otomatis dibuat`);
  } catch {}
  loadData();
  bootDataSafety();
  try {
    bindEvents();
  } catch (err) {
    console.error(err);
    UI.showError('Gagal menyiapkan aplikasi: ' + (err.message || err));
  }
  try {
    render();
  } catch (err) {
    console.error(err);
    UI.showError('Gagal menampilkan data: ' + (err.message || err));
  }
  UI.initIdrInputs();
  UI.updatePpnLabels();
  if (!keyboardBound) {
    document.addEventListener('keydown', handleKeyboardShortcut);
    keyboardBound = true;
  }
}

function loadData() {
  try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
  currentEntries = Storage.getAllEntries();
  const categories = Storage.getCategories();
  UI.renderCategoryFilterChips(categories);
  if (!searchBound) {
    UI.initSearch(handleSearchChange);
    searchBound = true;
  }
}

// ===== Data safety: IDB mirror + recovery + backup reminder =====
let mirrorTimer = null;
let cloudTimer = null;
function queueMirror() {
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    try { IDB.mirrorSnapshot(Storage.snapshotAll()); } catch {}
    // Cadangan otomatis (IDB) tercatat — pakai kunci kanonis yang sama dengan storage.js
    try { localStorage.setItem('wynara_lastBackup', new Date().toISOString()); } catch {}
    try { updateBackupDot(); } catch {}
  }, 2000);
  // Sinkron online menumpang mirror (throttle 60 dtk, manual selalu boleh)
  if (Cloud.isCloudConfigured()) {
    if (cloudTimer) clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      try { updateCloudDot(); } catch {}
      Cloud.syncNow().then((res) => {
        try {
          updateCloudDot();
          const changed = res && !res.error && ((res.pulled || 0) > 0 || (res.conflicts || 0) > 0);
          if (changed && !document.querySelector('dialog[open]') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') refresh();
        } catch {}
      }).catch(() => { try { updateCloudDot(); } catch {} });
    }, 60000);
  }
}
function updateCloudDot() {
  const dot = document.getElementById('cloudDot');
  if (!dot) return;
  const st = Cloud.getCloudStatus();
  const ses = Cloud.getCloudSession();
  if (!Cloud.isCloudConfigured() || !ses) {
    dot.textContent = '☁️'; dot.style.opacity = '.35';
    dot.title = 'Sinkron online: mati';
    dot.setAttribute('aria-label', 'Sinkron online mati');
    return;
  }
  if (st.state === 'syncing') {
    dot.textContent = '☁️'; dot.style.opacity = '1';
    dot.title = 'Sinkron online: sedang sinkron…';
  } else if (st.state === 'error') {
    dot.textContent = '☁️'; dot.style.opacity = '1';
    dot.title = 'Sinkron online gagal: ' + (st.detail || 'periksa koneksi');
  } else {
    dot.textContent = '☁️'; dot.style.opacity = '.8';
    dot.title = 'Sinkron online aktif' + (st.detail ? ' — ' + st.detail : '');
  }
  dot.setAttribute('aria-label', dot.title);
}
function updateBackupDot() {
  const dot = document.getElementById('backupDot');
  if (!dot) return;
  let last = Storage.getLastBackup();
  if (!last) { dot.textContent = '💾'; dot.title = 'Pengingat: buka Pengaturan → JSON Backup untuk menyimpan cadangan pertama'; dot.style.opacity = '.35'; dot.setAttribute('aria-label', 'Cadangan belum pernah dibuat'); return; }
  const days = Math.floor((Date.now() - last.getTime()) / 86400000);
  const t = last.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  dot.style.opacity = days > 7 ? '1' : '.55';
  dot.textContent = days > 7 ? '🔴' : '💾';
  dot.title = days > 7 ? `Cadangan terakhir ${t} — lebih dari 7 hari, unduh JSON di Pengaturan` : `Cadangan otomatis terakhir: ${t}`;
  dot.setAttribute('aria-label', dot.title);
}
// Nudge cadangan FILE (bukan IDB): >14 hari sejak unduhan terakhir → ingatkan maksimal 1×/bulan
function nudgeBackupExport() {
  let lastExport = 0;
  try { lastExport = Number(localStorage.getItem('wynara_last_export')) || 0; } catch {}
  const days = lastExport ? Math.floor((Date.now() - lastExport) / 86400000) : 999;
  if (days < 14) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  try { if (safeLocalGet('wynara_nudge_export') === monthKey) return; } catch {}
  UI.showWarning('Cadangan FILE belum diunduh lebih dari 14 hari — Pengaturan → ⬇️ JSON Backup. Mirror IndexedDB bisa hilang bila browser dibersihkan.');
  try { safeLocalSet('wynara_nudge_export', monthKey); } catch {}
}

function bootDataSafety() {
  // 1) Recovery: localStorage kosong tapi IDB ada isi → kembalikan
  try {
    const localSize = Storage.snapshotSize();
    if (localSize === 0) {
      IDB.readSnapshot().then((snap) => {
        if (snap && Storage.snapshotSize(snap) > 0) {
          try {
            const r = Storage.restoreAll(snap);
            const n = r.entries + r.loans + r.repayments + r.people;
            if (n > 0) {
              UI.showSuccess(`Data dipulihkan dari cadangan otomatis (${n} baris)`);
              refresh();
              return;
            }
          } catch {}
        }
        // 2) Backup reminder (hanya kalau ada data / pernah ada aktivitas)
        backupReminder();
      }).catch(() => backupReminder());
    } else {
      queueMirror();
      backupReminder();
    }
  } catch { /* safety tidak boleh mematikan boot */ }
  // Jurnal backfill (idempoten — lewati yang sudah ada)
  try {
    const n = Storage.backfillJournals({ buildEntryJournal, buildLoanJournal, buildRepaymentJournal });
    if (n > 0) { queueMirror(); refresh(); }
  } catch { /* safety tidak boleh mematikan boot */ }
}

function postOpeningEquityJournal() {
  try {
    const eq = Storage.getOpeningEquity();
    Storage.deleteJournalsByRef('equity', 'opening');
    if (eq && Number(eq.amount) > 0) {
      Storage.postJournal({
        id: 'EQ-OPENING',
        date: new Date().toISOString().split('T')[0],
        memo: 'Modal awal usaha',
        ref: 'equity',
        refId: 'opening',
        lines: [
          { account: '1101', debit: Math.round(Number(eq.amount)), credit: 0, memo: 'Modal awal usaha' },
          { account: EQUITY_ACCOUNT, debit: 0, credit: Math.round(Number(eq.amount)), memo: 'Modal awal usaha' },
        ]
      });
    }
  } catch {}
}

function backupReminder() {
  try {
    const size = Storage.snapshotSize();
    if (size === 0) return;
    const last = Storage.getLastBackup();
    if (!last) {
      UI.showWarning('Belum pernah backup — buka Pengaturan → JSON Backup biar data aman');
      return;
    }
    const days = Math.floor((Date.now() - last.getTime()) / 86400000);
    if (days >= 30) UI.showWarning(`Backup terakhir ${days} hari lalu — buka Pengaturan → JSON Backup`);
  } catch {}
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById('addEntryBtn').addEventListener('click', () => {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    UI.openModal();
  });

  document.getElementById('emptyAddBtn').addEventListener('click', () => {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    UI.openModal();
  });

  document.getElementById('onboardAddBtn')?.addEventListener('click', () => {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    UI.openModal();
  });
  document.getElementById('onboardLoanBtn')?.addEventListener('click', () => {
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
  });
  document.getElementById('onboardReportBtn')?.addEventListener('click', handleReportOpen);
  document.getElementById('settingTheme')?.addEventListener('change', (e) => {
    document.body.classList.toggle('dark-mode', e.target.checked);
    safeLocalSet('theme', e.target.checked ? 'dark' : 'light');
  });

  UI.bindCategoryChange(UI.handleCategoryChange);
  UI.bindTypeButtons(() => {});
  window.__getItems = () => Storage.getAllItems();
  window.__isLockedMonth = (d) => Storage.isMonthLocked(d);
  UI.bindFormSubmit(handleFormSubmit);
  UI.bindModalClose(UI.closeModal);
  UI.bindTableActions(handleEdit, handleDelete, handleDuplicate, handleReceipt);
  UI.bindReceipt();
  UI.bindFilters(handleFilterChange);
  window.__onFilterChange = handleFilterChange;
  UI.bindExportImport(handleImport);
  document.getElementById('exportExcelBtn')?.addEventListener('click', handleExportExcel);
  document.getElementById('exportCsvBtn').addEventListener('click', handleExportCsv);
  UI.bindReport(handleReportOpen, handleReportClose, handleReportTabChange, handleCustomDateApply);
  document.getElementById('printReportBtn')?.addEventListener('click', () => UI.printCurrentReport());

  document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
  document.getElementById('printBtn').addEventListener('click', handlePrint);

  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => exportMenu.classList.add('hidden'));

  const savedTheme = safeLocalGet('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
  document.getElementById('themeToggle').addEventListener('click', handleThemeToggle);

  document.getElementById('loanBtn').addEventListener('click', () => {
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
  });
  document.getElementById('closeLoansBtn').addEventListener('click', UI.closeLoans);
  document.getElementById('loanSearch').addEventListener('input', (e) => {
    loanSearchTerm = e.target.value;
    renderLoansView();
  });
  document.querySelectorAll('#loanTabs .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#loanTabs .chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      loanDirectionFilter = btn.dataset.value || 'all';
      renderLoansView();
    });
  });
  const hidePaidBox = document.getElementById('hidePaidLoans');
  if (hidePaidBox) {
    hidePaidBox.checked = loanHidePaid;
    hidePaidBox.addEventListener('change', () => {
      loanHidePaid = hidePaidBox.checked;
      safeLocalSet('wynara_hidePaidLoans', loanHidePaid ? '1' : '0');
      renderLoansView();
    });
  }
  document.getElementById('addLoanBtn').addEventListener('click', () => {
    UI.closeLoans();
    UI.renderPeopleDatalist(Storage.getAllPeople());
    if (loanDirectionFilter === 'taken') UI.openLoanEntryFor('Hutang', 'new');
    else UI.openLoanEntryFor('Piutang', 'new');
  });
  UI.bindLoanActions(handleRepayClick, handleLoanDelete, handleRepayDelete, handleInvoicePrint);
  UI.bindRepayModalClose(UI.closeRepayModal);

  document.getElementById('contactsBtn').addEventListener('click', () => {
    UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans());
  });
  document.getElementById('closeContactsBtn').addEventListener('click', UI.closeContacts);
  document.getElementById('addContactBtn').addEventListener('click', () => {
    UI.openContactForm();
  });
  document.getElementById('contactFormClose').addEventListener('click', UI.closeContactForm);
  document.getElementById('contactFormCancel').addEventListener('click', UI.closeContactForm);
  UI.bindContactFormSubmit(handleContactFormSubmit);
  UI.bindContactFormTypeButtons();
  UI.bindContactsSearch(() => {
    UI.renderContacts(Storage.getAllPeople(), Storage.getAllLoans());
  });
  UI.bindContactsActions(handleContactDelete, handleContactEdit);

  // Sidebar + topbar wiring
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('sidebarToggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        const open = sidebar.classList.toggle('open');
        overlay.classList.toggle('hidden');
        try { toggle.setAttribute('aria-expanded', String(open)); } catch {}
      } else {
        const collapsed = document.body.classList.toggle('sb-collapsed');
        try {
          localStorage.setItem('wynara_sb', collapsed ? '1' : '0');
          toggle.setAttribute('aria-expanded', String(!collapsed));
        } catch {}
      }
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    });
  }
  // Pengaman drawer: T klik item sidebar MANAPUN → drawer selalu tertutup.
  // (showView juga menutup; ini lapis kedua agar tak ada drawer nyangkut.)
  document.getElementById('sidebar')?.addEventListener('click', (ev) => {
    if (!ev.target.closest('.sidebar-item')) return;
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.add('hidden');
  });
  document.getElementById('reportBtnSidebar')?.addEventListener('click', () => showView('viewLaporan'));
  document.getElementById('contactsBtnSidebar')?.addEventListener('click', () => UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans()));
  document.getElementById('loanBtnSidebar')?.addEventListener('click', () => UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople()));
  document.getElementById('stockBtnSidebar')?.addEventListener('click', () => { refreshStock(); UI.openStock(); });
  document.getElementById('saleEntryBtn')?.addEventListener('click', () => UI.openSale());
  document.getElementById('saleEntryBtn2')?.addEventListener('click', () => UI.openSale());
  document.getElementById('payrollBtnSidebar')?.addEventListener('click', () => showView('viewPayroll'));
  document.getElementById('kasOpenBtn')?.addEventListener('click', () => { refreshKas(); UI.openKas(); });
  document.getElementById('bankOpenBtn')?.addEventListener('click', () => { refreshKas(); UI.setBankRows([]); UI.openBank(); });
  UI.bindStock(handleStockSave, handleStockEdit, handleStockDelete);
  document.getElementById('secSaveBtn')?.addEventListener('click', async () => {
    const oldP = document.getElementById('secOld')?.value || '';
    const p1 = document.getElementById('secNew')?.value || '';
    const p2 = document.getElementById('secNew2')?.value || '';
    if (p1 !== p2) return UI.showError('Ulangi kata sandi tidak sama');
    try {
      const a = Storage.getAuth();
      const ok = await Storage.verifyLogin(a.user, oldP);
      if (!ok) return UI.showError('Kata sandi lama salah');
      await Storage.setPassword(p1);
      ['secOld', 'secNew', 'secNew2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      UI.showSuccess('Kata sandi diganti. Keluar lalu masuk dengan yang baru.');
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal ganti kata sandi');
    }
  });
  UI.bindPayrollView({
    onTab: handlePayrollTab,
    onSearch: (v) => { payrollEmpSearch = v; UI.renderEmpTable(Storage.getAllEmployees(), payrollEmpSearch); },
    onAdd: () => UI.openEmpModal(null),
    onEdit: handleEmpViewEdit,
    onSave: handleEmpViewSave,
    onCancel: () => UI.closeEmpModal(),
    onClose: () => UI.closeEmpModal(),
    onImportClick: () => document.getElementById('empImportFile')?.click(),
    onImportFile: (file) => handleEmpImport(file),
    onPeriod: handlePayrollPeriod,
    onCheckAll: handlePayrollCheckAll,
    onCheck: handlePayrollCheck,
    onExpand: handlePayrollExpand,
    onDetailChange: handlePayrollDetailChange,
    onLembur: handlePayrollLembur,
    onRate: handlePayrollRateChange,
    onHadir: handlePayrollHadir,
    onPrintSlip: handlePayrollPrintSlip,
    onSlipWa: handlePayrollSlipWa,
    onDraft: handlePayrollDraft,
    onFinal: handlePayrollFinal,
    onCopy: handlePayrollCopyPrev
  });
  loadPayrollCache();
  UI.bindBuy(handleBuySave);
  UI.bindSupplierList(handleSupplierPay, handleSupplierDelete);
  UI.bindSupplierPay(handleSupplierPaySubmit);
  UI.bindSale(handleSaleSave);
  UI.bindCoa(handleCoaSave, handleCoaRename, handleCoaDelete);
  document.getElementById('assetOpenBtn')?.addEventListener('click', openAssets);
  document.getElementById('openingOpenBtn')?.addEventListener('click', openOpening);
  document.getElementById('openingModalClose')?.addEventListener('click', () => { const m = document.getElementById('openingModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('openingCancel')?.addEventListener('click', () => { const m = document.getElementById('openingModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('openingPostBtn')?.addEventListener('click', handleOpeningPost);
  document.getElementById('openingDate')?.addEventListener('change', () => { try { updateOpeningBalance(); } catch {} });
  document.getElementById('openingRows')?.addEventListener('input', (e) => {
    updateOpeningBalance();
    const draft = { date: document.getElementById('openingDate')?.value || '' };
    const rows = {};
    document.querySelectorAll('#openingRows .opening-deb, #openingRows .opening-cred').forEach(inp => {
      const code = inp.dataset.code;
      const v = openingNumInput(inp);
      if (v <= 0) return;
      rows[code] = rows[code] || { debit: 0, credit: 0 };
      if (inp.classList.contains('opening-deb')) rows[code].debit = v; else rows[code].credit = v;
    });
    draft.rows = rows;
    try { Storage.saveOpeningDraft(draft); } catch {}
  });
  document.getElementById('adjustOpenBtn')?.addEventListener('click', openAdjust);
  document.getElementById('adjustModalClose')?.addEventListener('click', () => { const m = document.getElementById('adjustModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('adjustCancel')?.addEventListener('click', () => { const m = document.getElementById('adjustModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('adjustPostBtn')?.addEventListener('click', handleAdjustPost);
  ['adjustDebitAmt', 'adjustCreditAmt', 'adjustDebitAcc', 'adjustCreditAcc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateAdjustPreview);
    if (el && id !== 'adjustPostBtn') el.addEventListener('change', updateAdjustPreview);
  });
  document.getElementById('assetModalClose')?.addEventListener('click', UI.closeAssetModal);
  document.getElementById('assetModalCancel')?.addEventListener('click', UI.closeAssetModal);
  document.getElementById('assetAddBtn')?.addEventListener('click', handleAssetAdd);
  document.getElementById('assetPostBtn')?.addEventListener('click', handleAssetPost);
  document.getElementById('assetTableBody')?.addEventListener('click', (e) => {
    const d = e.target.closest('.asset-delete');
    if (d) handleAssetDelete(d.dataset.id);
  });
  document.getElementById('coaOpenBtn')?.addEventListener('click', () => { refreshCoa(); UI.openCoa(); });
  UI.bindPayroll(handleEmpSave, handleEmpEdit, handleEmpDelete, handleEmpSlip, handlePayrollRun);
  UI.bindKas(handleTransfer, handleRecon);
  UI.bindBank(handleBankFile, handleBankImport);
  document.addEventListener('wynara:stock-search', refreshStock);
  document.getElementById('themeToggleSidebar')?.addEventListener('click', handleThemeToggle);
  function showView(viewId) {
    // Selalu mulai dari atas: posisi scroll view sebelumnya tidak boleh terbawa.
    try { window.scrollTo(0, 0); } catch {}
    try { document.querySelector('#main-content')?.scrollTo(0, 0); } catch {}
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    // Fallback defensif: bila section target hilang dari DOM (cache basi),
    // jangan pernah biarkan layar putih — tampilkan Ringkasan.
    const target = document.getElementById(viewId) || document.getElementById('viewRingkasan');
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    const map = { viewRingkasan: '[data-nav="ringkasan"]', viewTransaksi: '#sidebarTransaksi', viewPayroll: '#payrollBtnSidebar', viewLaporan: '#reportBtnSidebar', viewChangelog: '#changelogLink' };
    const sel = map[viewId];
    if (sel) document.querySelector(sel)?.classList.add('active');
    const bnView = { viewRingkasan: 'ringkasan', viewTransaksi: 'transaksi', viewPayroll: 'gaji', viewLaporan: 'reports' }[viewId];
    document.querySelectorAll('#bottomNav .bn-item').forEach(b => b.classList.toggle('active', b.dataset.bnav === bnView));
    sidebar?.classList.remove('open');
    overlay?.classList.add('hidden');
    if (viewId === 'viewTransaksi') renderFullTransaksi();
    if (viewId === 'viewPayroll') renderPayrollView();
    if (viewId === 'viewLaporan') { refresh(); renderPageReport(); }
  }
  // default view
  showView('viewRingkasan');
  document.querySelector('[data-nav="ringkasan"]')?.addEventListener('click', () => showView('viewRingkasan'));
  document.getElementById('sidebarTransaksi')?.addEventListener('click', () => showView('viewTransaksi'));
  document.getElementById('lihatSemua')?.addEventListener('click', (e) => { e.preventDefault(); showView('viewTransaksi'); });
  // Bottom nav mobile
  document.getElementById('bottomNav')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-bnav]');
    if (!b) return;
    const t = b.dataset.bnav;
    if (t === 'ringkasan') showView('viewRingkasan');
    else if (t === 'transaksi') showView('viewTransaksi');
    else if (t === 'gaji') showView('viewPayroll');
    else if (t === 'reports') showView('viewLaporan');
    else if (t === 'add') { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); }
    else if (t === 'more') {
      const links = [
        { goto: 'contacts', icon: '👥', label: 'Kontak', aria: 'Kontak' },
        { goto: 'loans', icon: '🤝', label: 'Pinjemin', aria: 'Pinjemin' },
        { goto: 'stock', icon: '📦', label: 'Stok', aria: 'Stok barang' },
        { goto: 'kas', icon: '💳', label: 'Kas', aria: 'Kas dan rekonsiliasi' },
        { goto: 'bank', icon: '🏦', label: 'Mutasi bank', aria: 'Import dan cocokkan mutasi bank' },
        { goto: 'settings', icon: '⚙️', label: 'Pengaturan', aria: 'Pengaturan' },
      ];
      const html = links.map(l => `<button type="button" class="notif-goto" data-goto="${l.goto}" aria-label="${l.aria}" style="display:flex;align-items:center;gap:10px;width:100%;background:none;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:6px;cursor:pointer">${l.icon} ${l.label}</button>`).join('');
      UI.openInfoModal('Menu lainnya', html);
    }
  });
  // keep active toggle for other sidebar items
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    if (btn.id === 'sidebarTransaksi' || btn.dataset.nav === 'ringkasan') return;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sidebar?.classList.remove('open');
      overlay?.classList.add('hidden');
    });
  });
  document.getElementById('notifBtn')?.addEventListener('click', () => {
    const alerts = getAllAlerts();
    if (!alerts.length) { UI.showSuccess('Tidak ada pengingat 🎉'); return; }
    const items = alerts.map(a => `<li style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${a.icon} ${escapeHtml(a.text)}</span><button type="button" class="notif-goto" data-goto="${a.target || ''}" style="white-space:nowrap;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer">Buka →</button></li>`).join('');
    UI.openInfoModal('🔔 Pengingat', `<ul style="padding-left:20px;margin:0;list-style:disc">${items}</ul>`);
  });
  document.getElementById('infoModalBody')?.addEventListener('click', (ev) => {
    const cm = ev.target.closest('.close-month-btn[data-mk]');
    if (cm) {
      UI.closeInfoModal();
      const mk = cm.dataset.mk;
      if (confirm(`Tutup ${payrollMonthLabel(mk)}? Pendapatan & beban periode itu dipindah ke Laba Ditahan.`)) doClosing(mk);
      return;
    }
    const btn = ev.target.closest('.notif-goto[data-goto]');
    if (!btn) return;
    UI.closeInfoModal();
    const target = btn.dataset.goto;
    if (target === 'loans') UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
    else if (target === 'stock') { refreshStock(); UI.openStock(); }
    else if (target === 'contacts') UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans());
    else if (target === 'kas') { refreshKas(); UI.openKas(); }
    else if (target === 'bank') { refreshKas(); UI.setBankRows([]); UI.openBank(); }
    else if (target === 'settings') openSettings();
    else if (target === 'tax') {
      const tab = document.querySelector('.report-tab[data-report="tax"]');
      if (tab) tab.click(); else renderReport();
      UI.openReportModal();
    }
  });
  document.getElementById('aksiTambahTransaksi')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); });
  document.getElementById('addEntryBtn2')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); });
  document.getElementById('aksiTambahKontak')?.addEventListener('click', () => UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans()));
  document.getElementById('aksiLaporan')?.addEventListener('click', () => showView('viewLaporan'));
  document.getElementById('ownerToReports')?.addEventListener('click', (e) => { e.preventDefault(); showView('viewLaporan'); });
  // Tab laporan halaman: delegasi body (tab kini terbagi 3 grup chip)
  if (!document.body.dataset.pagereportWired) {
    document.body.dataset.pagereportWired = '1';
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('.page-report-tab');
      if (!b) return;
      currentReportType = b.dataset.report;
      renderPageReport();
      if (window.innerWidth > 768) {
        const sec = document.getElementById('pageReportContent');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  document.getElementById('pageReportPrint')?.addEventListener('click', () => UI.printPageReport(periodLabelText()));
  document.getElementById('pageReportExcel')?.addEventListener('click', () => UI.exportPageReportExcel());
  const searchInp = document.getElementById('reportSearchInput');
  if (searchInp) searchInp.addEventListener('input', (e) => {
    UI.setReportSearch(e.target.value || '');
    const tab = document.querySelector('.page-report-tab.selected')?.dataset.report;
    if (tab === 'journal' || tab === 'ledger') renderPageReport();
    try { e.target.focus(); } catch {}
  });
  document.getElementById('pageReportPeriod')?.addEventListener('change', (e) => {
    const v = e.target.value;
    pageReportPeriodUi = v;
    let period = v, startDate = null, endDate = null;
    if (v === 'last-quarter') {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3); // 0-based quarter index of running month
      const pq = q === 0 ? { y: now.getFullYear() - 1, q: 3 } : { y: now.getFullYear(), q: q - 1 };
      const s = new Date(pq.y, pq.q * 3, 1);
      const en = new Date(pq.y, pq.q * 3 + 3, 0);
      const iso = (d) => d.toISOString().split('T')[0];
      startDate = iso(s); endDate = iso(en);
      period = 'custom';
    }
    currentFilters = { period, type: 'all', category: 'all', startDate, endDate };
    renderPageReport();
    UI.showSuccess('Periode laporan diubah');
  });
  document.getElementById('aksiKategori')?.addEventListener('click', () => UI.showInfo('Kelola kategori: pilih kategori saat tambah transaksi'));
  // Topbar search mirrors main search
  const topSearch = document.getElementById('searchInputTop');
  if (topSearch) {
    topSearch.addEventListener('input', (e) => {
      const main = document.getElementById('searchInput');
      if (main) { main.value = e.target.value; main.dispatchEvent(new Event('input')); }
    });
  }
  // pagination + budget + settings
  document.getElementById('prevPage')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; render(); } });
  document.getElementById('nextPage')?.addEventListener('click', () => { currentPage++; render(); });
  document.getElementById('loadMoreBtn')?.addEventListener('click', () => { currentPage++; render(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
  document.getElementById('editBudgetBtn')?.addEventListener('click', () => openSettings());
  document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettings);
  document.getElementById('closeSettingsCancel')?.addEventListener('click', closeSettings);
  document.getElementById('settingsModal')?.addEventListener('click', (e) => { if (e.target.id === 'settingsModal') closeSettings(); });
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
  document.getElementById('exportJsonBtn')?.addEventListener('click', () => { Storage.exportJSON(); UI.showSuccess('Backup JSON diunduh'); });
  document.getElementById('backupShareBtn')?.addEventListener('click', handleBackupShare);
  document.getElementById('cloudConnectBtn')?.addEventListener('click', handleCloudConnect);
  document.getElementById('cloudAnonBtn')?.addEventListener('click', handleCloudAnon);
  document.getElementById('cloudSignupBtn')?.addEventListener('click', handleCloudSignup);
  document.getElementById('cloudSyncBtn')?.addEventListener('click', handleCloudSyncNow);
  document.getElementById('cloudOffBtn')?.addEventListener('click', handleCloudOff);
  document.getElementById('closingBtn')?.addEventListener('click', handleClosing);
  const buildTaxCsv = () => {
    const d = buildTaxReport();
    const rows = [['Periode', 'Omzet', 'PPh Final 0,5%']];
    (d.months || []).forEach(m => rows.push([m.month, Math.round(m.omzet), Math.round(m.pph)]));
    rows.push([`TOTAL ${d.year}`, Math.round(d.omzetYear), Math.round(d.pphYear)]);
    rows.push(['PPN Keluaran', Math.round(d.ppnOut), '']);
    rows.push(['PPN Masukan', Math.round(d.ppnIn), '']);
    rows.push(['PPN Kurang Bayar', Math.round(d.ppnNet), '']);
    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `wynara-pajak-${d.year}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.showSuccess(`CSV pajak ${d.year} diunduh — siap untuk DJP/e-Bupot`);
  };
  document.addEventListener('wynara:tax-csv', buildTaxCsv);
  document.addEventListener('wynara:expense-filter', (ev) => {
    const det = ev.detail || {};
    if (det.kind === 'cat') expenseCatFilter = det.value || 'all';
    if (det.kind === 'person') expensePersonFilter = det.value || 'all';
    renderReport();
    renderPageReport();
  });
  document.addEventListener('wynara:ledger-toggle', (ev) => {
    const det = ev.detail || {};
    UI.toggleDrill(det.kind || 'ledger', det.code || '');
    renderReport();
    renderPageReport();
  });
  document.addEventListener('wynara:dec-apply', (ev) => handleDecApply(ev.detail));
  document.addEventListener('wynara:dec-a1', (ev) => handleDecA1(ev.detail));
  document.getElementById('importJsonBtn')?.addEventListener('click', () => document.getElementById('importJsonFile')?.click());
  document.getElementById('importJsonFile')?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleImport(f); e.target.value = ''; });
  // Export mengikuti tampilan terfilter (bukan seluruh DB)
  document.getElementById('exportExcelBtn2')?.addEventListener('click', () => {
    try {
      const rows = getCurrentViewEntries();
      if (!rows.length) { UI.showInfo('Tidak ada data pada tampilan ini'); return; }
      Storage.exportExcelEntries(rows, `wynara-tampilan-${new Date().toISOString().split('T')[0]}.xlsx`);
      UI.showSuccess(`${rows.length} baris diexport ke Excel`);
    } catch (err) { UI.showError(err.message); }
  });
  document.getElementById('exportCsvBtn2')?.addEventListener('click', () => {
    try {
      const rows = getCurrentViewEntries();
      if (!rows.length) { UI.showInfo('Tidak ada data pada tampilan ini'); return; }
      Storage.exportCSVEntries(rows, `wynara-tampilan-${new Date().toISOString().split('T')[0]}.csv`);
      UI.showSuccess(`${rows.length} baris diexport ke CSV`);
    } catch (err) { UI.showError(err.message); }
  });
  document.getElementById('importAnyBtn')?.addEventListener('click', () => document.getElementById('importAnyFile')?.click());
  document.getElementById('importAnyFile')?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleImport(f); e.target.value = ''; });
  document.getElementById('printBtn2')?.addEventListener('click', handlePrint);
  // budgetInput/equityInput diformat otomatis oleh initIdrInputs (desimal-aware)
  // fix themeToggleSidebar to open settings instead of directly toggling
  const themeSidebar = document.getElementById('themeToggleSidebar');
  if (themeSidebar) {
    const newEl = themeSidebar.cloneNode(true);
    themeSidebar.parentNode.replaceChild(newEl, themeSidebar);
    newEl.addEventListener('click', () => openSettings());
    newEl.id = 'themeToggleSidebar';
  }

  // tx income filter
  document.querySelectorAll('#txTypeFilter .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#txTypeFilter .chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const val = btn.dataset.value;
      const hiddenBtn = document.querySelector(`#typeGroupFilter .chip[data-value="${val}"]`);
      if (hiddenBtn) {
        document.querySelectorAll('#typeGroupFilter .chip').forEach(b => b.classList.remove('selected'));
        hiddenBtn.classList.add('selected');
      }
      currentFilters.type = val;
      currentPage = 1;
      render();
    });
  });

  // P1: density + column chooser (persisted)
  const applyDensity = () => {
    const panel = document.querySelector('.dash-panel-table');
    const mode = safeLocalGet('wynara_density') || 'padat';
    if (panel) { panel.classList.remove('density-padat', 'density-nyaman'); panel.classList.add(mode === 'nyaman' ? 'density-nyaman' : 'density-padat'); }
    document.querySelectorAll('#densityGroup .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === mode));
  };
  document.querySelectorAll('#densityGroup .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      safeLocalSet('wynara_density', btn.dataset.value);
      applyDensity();
    });
  });
  const applyPayCol = () => {
    const hide = safeLocalGet('wynara_hidePay') === '1';
    document.querySelector('.dash-panel-table')?.classList.toggle('hide-pay', hide);
    document.getElementById('transaksiTable')?.classList.toggle('hide-pay', hide);
    const t = document.getElementById('togglePayCol');
    if (t) { t.textContent = hide ? 'Cara Bayar: OFF' : 'Cara Bayar: ON'; t.setAttribute('aria-pressed', String(hide)); t.classList.toggle('selected', !hide); }
  };
  document.getElementById('togglePayCol')?.addEventListener('click', () => {
    const hide = safeLocalGet('wynara_hidePay') === '1';
    safeLocalSet('wynara_hidePay', hide ? '0' : '1');
    applyPayCol();
  });
  applyDensity();
  applyPayCol();

  // P2: arus kas range + toggle
  document.querySelectorAll('#arusRange .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      arusKasRange = Number(btn.dataset.value) || 6;
      safeLocalSet('wynara_arusRange', String(arusKasRange));
      renderArusKasChart(getCurrentViewEntriesRaw());
    });
  });
  document.querySelectorAll('#arusToggle .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.value;
      arusKasShow[k] = !arusKasShow[k];
      safeLocalSet('wynara_arusShow', JSON.stringify(arusKasShow));
      renderArusKasChart(getCurrentViewEntriesRaw());
    });
  });

  // P3: bulk select (delegated, survives re-render)
  document.getElementById('entriesBody')?.addEventListener('change', (e) => {
    const cb = e.target.closest('.row-select');
    if (!cb || cb.disabled) return;
    if (cb.checked) window.__selectedIds.add(cb.dataset.id);
    else window.__selectedIds.delete(cb.dataset.id);
    updateBulkBar();
  });
  document.getElementById('selectAllRows')?.addEventListener('change', (e) => {
    document.querySelectorAll('#entriesBody .row-select:not(:disabled)').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) window.__selectedIds.add(cb.dataset.id);
      else window.__selectedIds.delete(cb.dataset.id);
    });
    updateBulkBar();
  });
  document.getElementById('bulkClearBtn')?.addEventListener('click', () => { window.__selectedIds.clear(); render(); updateBulkBar(); });
  document.getElementById('bulkDeleteBtn')?.addEventListener('click', handleBulkDelete);
  document.getElementById('bulkExportBtn')?.addEventListener('click', () => {
    const rows = getCurrentViewEntries().filter(e => window.__selectedIds.has(e.id));
    if (!rows.length) { UI.showInfo('Pilih dulu baris yang mau diexport'); return; }
    Storage.exportExcelEntries(rows, `wynara-terpilih-${new Date().toISOString().split('T')[0]}.xlsx`);
    UI.showSuccess(`${rows.length} baris diexport ke Excel`);
  });
  document.getElementById('exportViewBtn')?.addEventListener('click', () => {
    const rows = getCurrentViewEntries();
    if (!rows.length) { UI.showInfo('Tidak ada data pada tampilan ini'); return; }
    Storage.exportExcelEntries(rows, `wynara-tampilan-${new Date().toISOString().split('T')[0]}.xlsx`);
    UI.showSuccess(`${rows.length} baris (tampilan + filter + pencarian) diexport`);
  });
  updateBulkBar();

  // delegated: filter pills reset (no inline onclick)
  document.getElementById('filterPills')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="reset-filters"]')) resetAllFilters();
  });
  // topbar pills: account info + period opens custom range
  document.getElementById('topbarAccount')?.addEventListener('click', () => {
    const n = Storage.snapshotSize();
    const last = Storage.getLastBackup();
    UI.openInfoModal('👤 Akun utama',
      `<p><b>admin</b> — demo lokal (tanpa server, data tersimpan di browser ini).</p>` +
      `<p>📦 ${n} baris data tersimpan.</p>` +
      `<p>💾 Backup terakhir: ${last ? last.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'belum pernah'}.</p>`);
  });
  document.getElementById('topbarPeriod')?.addEventListener('click', () => {
    UI.openCustomDateModal();
  });
  // sidebar help → panduan beneran
  UI.bindInfoModal();
  document.querySelector('.sidebar-help-btn')?.addEventListener('click', () => {
    UI.openInfoModal('❓ Bantuan Wynara',
      `<p><b>Mulai dalam 3 langkah:</b> 1️⃣ Tambah transaksi → 2️⃣ Coba Pinjemin → 3️⃣ Lihat laporan.</p>` +
      `<p><b>Alur uang:</b> 📤 keluar = Kasih pinjam & Balikin. 📥 masuk = Dibalikin & Pinjam uang.</p>` +
      `<p><b>Keyboard:</b> <kbd>Ctrl+N</kbd> tambah · <kbd>/</kbd> cari · <kbd>Esc</kbd> tutup.</p>` +
      `<p><b>Data aman:</b> Pengaturan → JSON Backup tiap bulan. Cadangan otomatis tersimpan di browser ini.</p>`);
  });

function loadChangelogPage() {
  const box = document.getElementById('changelogContent');
  if (!box) return;
  box.innerHTML = '<p style="color:#94a3b8">Memuat…</p>';
  const fallback = `<p>Sedang berjalan <b>v${APP_VERSION}</b>. Riwayat lengkap ada di file <code>CHANGELOG.md</code> pada repo.</p>`;
  fetch('CHANGELOG.md').then(r => {
    if (!r.ok) throw new Error('not-found');
    return r.text();
  }).then(t => {
    box.innerHTML = renderChangelogMd(t);
  }).catch(() => {
    box.innerHTML = fallback;
  });
}
// Markdown minimal (aman XSS: escape dulu, lalu format sebaris)
function renderChangelogMd(t) {
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const inline = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  esc.split('\n').forEach(line => {
    if (/^### /.test(line)) { closeList(); out.push(`<h4 style="margin:14px 0 4px">${inline(line.slice(4))}</h4>`); }
    else if (/^## /.test(line)) { closeList(); out.push(`<h3 style="margin:18px 0 6px">${inline(line.slice(3))}</h3>`); }
    else if (/^# /.test(line)) { closeList(); out.push(`<h2 style="margin:18px 0 6px">${inline(line.slice(2))}</h2>`); }
    else if (/^---+$/.test(line)) { closeList(); out.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">'); }
    else if (/^- /.test(line)) { if (!inList) { out.push('<ul style="padding-left:20px;margin:4px 0">'); inList = true; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (!line.trim()) { closeList(); }
    else { closeList(); out.push(`<p style="margin:4px 0">${inline(line)}</p>`); }
  });
  closeList();
  return out.join('');
}
  document.getElementById('changelogLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    showView('viewChangelog');
    loadChangelogPage();
  });
  // transaksi view filters
  document.getElementById('transaksiSearch')?.addEventListener('input', (e) => {
    const main = document.getElementById('searchInput');
    const top = document.getElementById('searchInputTop');
    if (main) main.value = e.target.value;
    if (top) top.value = e.target.value;
    if (main) main.dispatchEvent(new Event('input'));
    else { currentPage = 1; transaksiPage = 1; render(); renderFullTransaksi(); }
  });
  document.getElementById('transaksiFilterJenis')?.addEventListener('change', (e) => {
    const val = e.target.value === 'Pemasukan' ? 'income' : e.target.value === 'Pengeluaran' ? 'expense' : 'all';
    currentFilters.type = val;
    const hidden = document.querySelector(`#typeGroupFilter .chip[data-value="${val}"]`);
    if (hidden) {
      document.querySelectorAll('#typeGroupFilter .chip').forEach(b => b.classList.remove('selected'));
      hidden.classList.add('selected');
    }
    // sync txTypeFilter
    document.querySelectorAll('#txTypeFilter .chip').forEach(b => {
      b.classList.toggle('selected', b.dataset.value === val);
    });
    currentPage = 1; transaksiPage = 1;
    render(); renderFullTransaksi();
  });
  document.getElementById('transaksiFilterKategori')?.addEventListener('change', (e) => {
    currentFilters.category = e.target.value;
    currentPage = 1; transaksiPage = 1;
    render(); renderFullTransaksi();
  });
  document.getElementById('transaksiPrev')?.addEventListener('click', () => { if (transaksiPage > 1) { transaksiPage--; renderFullTransaksi(); } });
  document.getElementById('transaksiNext')?.addEventListener('click', () => { transaksiPage++; renderFullTransaksi(); });
  document.addEventListener('wynara:edit', (e) => handleEdit(e.detail));
  document.addEventListener('wynara:delete', (e) => handleDelete(e.detail));
  document.addEventListener('wynara:receipt', (e) => handleReceipt(e.detail));

  window.__getActivePiutangPeople = () => {
    const loans = Storage.getAllLoans();
    const repayments = Storage.getAllRepayments();
    const allPeople = Storage.getAllPeople();
    const contactMap = new Map();
    allPeople.forEach(p => contactMap.set(p.name, p.type || 'person'));

    const loanSummary = new Map();
    loans.forEach(l => {
      const outstanding = outstandingOf(l, repayments.filter(r => r.loanId === l.id));
      if (outstanding > 0) {
        const existing = loanSummary.get(l.person) || { given: 0, taken: 0 };
        if (l.direction === 'given') existing.given += outstanding;
        else existing.taken += outstanding;
        loanSummary.set(l.person, existing);
      }
    });

    const result = [];
    allPeople.forEach(p => {
      const ls = loanSummary.get(p.name);
      const outstanding = ls ? (ls.given + ls.taken) : 0;
      result.push({ name: p.name, type: p.type || 'person', outstanding, hasLoan: !!ls });
    });
    result.sort((a, b) => {
      if (a.hasLoan && !b.hasLoan) return -1;
      if (!a.hasLoan && b.hasLoan) return 1;
      return b.outstanding - a.outstanding;
    });
    return result;
  };
  const buildOutstanding = (direction) => {
    const loans = Storage.getAllLoans().filter(l => l.direction === direction && l.status !== 'paid');
    const repayments = Storage.getAllRepayments();
    return loans.map(l => {
      const reps = repayments.filter(r => r.loanId === l.id);
      const paid = paidOf(reps);
      const outstanding = outstandingOf(l, reps);
      const instAmt = Number(l.installmentAmount) || 0;
      const tenor = calcTenor(l);
      return {
        id: l.id,
        person: l.person,
        contactType: l.contactType || 'person',
        amount: totalOwed(l),
        paid,
        paidCount: reps.length,
        instAmt,
        outstanding,
        tenor,
        nextAmt: instAmt > 0 ? Math.min(instAmt, outstanding) : outstanding,
        date: l.date
      };
    }).filter(x => x.outstanding > 0.009)
      .sort((a, b) => b.outstanding - a.outstanding);
  };
  window.__getOutstandingHutang = () => buildOutstanding('taken');
  window.__getOutstandingPiutang = () => buildOutstanding('given');
  UI.bindRepayFormSubmit(handleRepaySubmit);

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.querySelectorAll('.sortable-col').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });
}

function computeLoanSummary() {
  return Reports.computeLoanSummary(Storage.getAllLoans(), Storage.getAllRepayments());
}

function getFilteredLoans() {
  const term = (loanSearchTerm || '').trim().toLowerCase();
  let all = Storage.getAllLoans();
  if (loanDirectionFilter === 'given' || loanDirectionFilter === 'taken') {
    all = all.filter(l => l.direction === loanDirectionFilter);
  }
  if (loanHidePaid) all = all.filter(l => l.status !== 'paid');
  return term ? all.filter(l => (l.person || '').toLowerCase().includes(term)) : all;
}

function renderLoansView() {
  UI.renderLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans());
}

function refreshLoans() {
  UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
  refresh();
}

function handleFormSubmit() {
  const data = UI.getFormData();
  const error = UI.validateForm(data);
  if (error) {
    UI.showError(error);
    return;
  }

  let ok = false;
  try {
    ok = submitFormData(data) !== false;
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan — coba lagi');
    return;
  }
  if (!ok) return; // validasi gagal — biarkan form terbuka biar bisa dibetulkan

  const recCb = document.getElementById('entryRecurring');
  if (recCb) recCb.checked = false;
  UI.closeModal();
  refresh();
}

function submitFormData(data) {
  // Kunci periode: transaksi bulan terkunci tak bisa diubah/dipindah
  if (data.id) {
    const prev = Storage.getEntryById(data.id);
    if (prev && Storage.isMonthLocked(prev.date)) {
      UI.showError(`Transaksi bulan ${String(prev.date).slice(0, 7)} terkunci — buka di Pengaturan kalau mau ubah`);
      return false;
    }
  }
  const isLoan = LOAN_CATEGORIES.includes(data.category);

  if (isLoan) {
    const mode = data.loanMode || 'new';
    // 4 flows: Pinjemin 📤 / Balikin 📥 (terima) vs Ambil Loan 📥 / Balikin 📤 (bayar)
    if (mode === 'settle') {
      if (data.id) {
        UI.showError('Balikin tidak bisa diubah dari sini. Gunakan panel Pinjaman.');
        return false;
      }
      const loanId = data.loanId || null;
      if (!loanId) { UI.showError(data.category === 'Hutang' ? 'Pilih dulu loan yang mau kamu balikin' : 'Pilih dulu siapa yang balikin ke kamu'); return false; }
      const loan = Storage.getLoanById(loanId);
      if (!loan) { UI.showError('Pinjaman terpilih tidak ditemukan — pilih ulang'); return false; }
      const expectedDir = data.category === 'Hutang' ? 'taken' : 'given';
      if (loan.direction !== expectedDir) { UI.showError('Pinjaman terpilih tidak sesuai kategori — pilih ulang'); return false; }
      const reps = Storage.getLoanRepayments(loanId);
      const outstanding = outstandingOf(loan, reps);
      if (data.amount > outstanding + 0.01) {
        UI.showError(`Nominal melebihi sisa ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Math.max(outstanding, 0))}`);
        return false;
      }
      Storage.addRepayment({
        loanId,
        amount: data.amount,
        date: data.date,
        description: data.description || (data.category === 'Hutang' ? `Balikin ke ${loan.person}` : `Dibalikin dari ${loan.person}`),
        payment: data.payment,
        paymentDetail: data.paymentDetail
      });
      const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(v);
      UI.showSuccess(data.category === 'Hutang'
        ? `Oke, kamu balikin ${fmt(data.amount)} ke ${loan.person} 👍`
        : `${loan.person} sudah balikin ${fmt(data.amount)} ke kamu 👍`);
    } else {
      const direction = data.category === 'Piutang' ? 'given' : 'taken';
      if (!data.person) { UI.showError(data.category === 'Hutang' ? 'Tulis dulu dari siapa ambil loan' : 'Tulis dulu ke siapa kasih pinjam'); return false; }

      if (data.id) {
        const existing = Storage.getEntryById(data.id);
        if (existing && existing.loanId) {
          Storage.updateLoan(existing.loanId, {
            direction,
            contactType: data.contactType,
            loanType: data.loanType,
            installmentAmount: data.installmentAmount,
            interestRate: data.interestRate,
            person: data.person,
            amount: data.amount,
            date: data.date,
            dueDate: data.loanDue,
            description: data.description,
            payment: data.payment,
            paymentDetail: data.paymentDetail
          });
        } else {
          Storage.updateEntry(data.id, data);
        }
        UI.showSuccess('Transaksi diperbarui');
      } else {
        Storage.savePerson(data.person, data.contactType);
        if (data.category === 'Piutang' && !data.invoiceNo) data.invoiceNo = Storage.nextInvoiceNo();
        Storage.createLoan({
          direction,
          contactType: data.contactType,
          loanType: data.loanType,
          installmentAmount: data.installmentAmount,
          interestRate: data.interestRate,
          person: data.person,
          amount: data.amount,
          date: data.date,
          dueDate: data.loanDue,
          description: data.description,
          payment: data.payment,
          paymentDetail: data.paymentDetail,
          invoiceNo: data.invoiceNo
        });
        UI.showSuccess(data.category === 'Hutang' ? `Oke, kamu pinjam ${Reports.formatCurrency(data.amount)} dari ${data.person} 💰` : `Kasih pinjam ${Reports.formatCurrency(data.amount)} ke ${data.person} 📤${data.invoiceNo ? ` • ${data.invoiceNo}` : ''}`);
      }
    }
  } else {
    if (data.id) {
      const existing = Storage.getEntryById(data.id);
      if (existing && existing.loanId) {
        UI.showError('Transaksi pinjaman tidak bisa diubah dari sini. Gunakan panel Pinjaman.');
        return false;
      }
      Storage.updateEntry(data.id, data);
      UI.showSuccess('Transaksi diperbarui');
    } else {
      Storage.createEntry(data);
      const rec = document.getElementById('entryRecurring');
      if (rec && rec.checked) {
        const list = Storage.getRecurring();
        list.push({ ...data, recurringId: Date.now().toString(36), createdAt: new Date().toISOString() });
        Storage.saveRecurring(list);
        UI.showInfo('Recurring aktif: otomatis dibuat tiap bulan');
      }
      UI.showSuccess('Transaksi ditambahkan');
    }
  }
  return true;
}

function handleEdit(id) {
  const entry = Storage.getEntryById(id);
  if (entry) {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    if (entry.loanId) {
      const loan = Storage.getLoanById(entry.loanId);
      if (loan && Number(loan.interestRate) > 0) entry.interestRate = Number(loan.interestRate);
    }
    UI.openModal(entry);
  }
}

function handleDelete(id) {
  const entry = Storage.getEntryById(id);
  if (entry && entry.loanId) {
    if (confirm('Hapus transaksi pinjaman ini beserta riwayat pembayaran?')) {
      Storage.deleteLoan(entry.loanId);
      UI.showSuccess('Pinjaman dihapus');
      refresh();
    }
  } else {
    const snapshot = { ...entry };
    Storage.deleteEntry(id);
    refresh();
    UI.showUndoToast('Transaksi dihapus', () => {
      Storage.restoreEntry(snapshot);
      UI.showSuccess('Transaksi dikembalikan');
      refresh();
    });
  }
}

function handleReceipt(id) {
  const entry = Storage.getEntryById(id);
  if (!entry) return;
  UI.openReceipt(entry);
}

function handleDuplicate(id) {
  const entry = Storage.getEntryById(id);
  if (!entry) return;
  if (entry.loanId) {
    UI.showError('Transaksi pinjaman tidak bisa diduplikasi dari sini');
    return;
  }
  UI.renderPeopleDatalist(Storage.getAllPeople());
  UI.openModal({
    ...entry,
    id: null,
    date: new Date().toISOString().split('T')[0]
  });
  UI.showSuccess('Transaksi diduplikasi, silakan edit dan simpan');
}

function handleFilterChange() {
  const values = UI.getFilterValues();
  const isCustom = values.period === 'custom';
  currentFilters = {
    period: values.period,
    type: values.type,
    category: values.category,
    startDate: isCustom ? customRange.start : null,
    endDate: isCustom ? customRange.end : null
  };
  currentPage = 1;
  render();
}

function handleCustomDateApply(startDate, endDate) {
  if (!startDate || !endDate) {
    UI.showError('Pilih kedua tanggal');
    return;
  }
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (s > e) {
    UI.showError('Tanggal mulai tidak boleh setelah tanggal selesai');
    return;
  }
  customRange = { start: startDate, end: endDate };
  const values = UI.getFilterValues();
  currentFilters = {
    period: 'custom',
    type: values.type,
    category: values.category,
    startDate,
    endDate
  };
  UI.selectPeriodChip('custom');
  currentPage = 1;
  render();
  UI.showSuccess(`Filter: ${startDate} → ${endDate}`);
}

function handleSearchChange(term) {
  currentPage = 1;
  render();
}

function handleExportExcel() {
  Storage.exportExcel();
  document.getElementById('exportMenu').classList.add('hidden');
  UI.showSuccess('Data diekspor ke Excel');
}

function handleExportCsv() {
  Storage.exportCSV();
  document.getElementById('exportMenu').classList.add('hidden');
  UI.showSuccess('Data diekspor ke CSV');
}

function getCurrentSearchFiltered() {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  const searchTerm = UI.getSearchTerm();
  return searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm))
      )
    : filtered;
}
function getCurrentViewEntriesRaw() {
  return getCurrentSearchFiltered();
}
function getCurrentViewEntries() {
  return sortEntries(Reports.computeRunningBalance(getCurrentSearchFiltered()));
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  if (!bar || !count) return;
  const n = window.__selectedIds.size;
  bar.classList.toggle('hidden', n === 0);
  count.textContent = `${n} dipilih`;
  const selAll = document.getElementById('selectAllRows');
  if (selAll) {
    const visibleIds = (document.querySelectorAll('#entriesBody .row-select:not(:disabled)'));
    const checked = document.querySelectorAll('#entriesBody .row-select:checked:not(:disabled)');
    selAll.checked = visibleIds.length > 0 && checked.length === visibleIds.length;
    selAll.indeterminate = checked.length > 0 && checked.length < visibleIds.length;
  }
}

function handleBulkDelete() {
  if (!window.__selectedIds.size) return;
  const ids = [...window.__selectedIds];
  const loanLinked = ids.filter(id => { const e = Storage.getEntryById(id); return e && e.loanId; });
  if (loanLinked.length) {
    UI.showError(`${loanLinked.length} baris pinjaman dilewati (hapus via menu Pinjaman)`);
  }
  const deletable = ids.filter(id => { const e = Storage.getEntryById(id); return e && !e.loanId; });
  if (!deletable.length) return;
  const snapshots = deletable.map(id => ({ ...Storage.getEntryById(id) })).filter(e => e && e.id);
  deletable.forEach(id => Storage.deleteEntry(id));
  window.__selectedIds.clear();
  refresh();
  UI.showUndoToast(`${snapshots.length} transaksi dihapus`, () => {
    snapshots.forEach(s => Storage.restoreEntry(s));
    UI.showSuccess(`${snapshots.length} transaksi dikembalikan`);
    refresh();
  });
}

function handleImport(file) {
  Storage.importExcel(file).then((result) => {
    const parts = [];
    if (result.entries) parts.push(`${result.entries} transaksi`);
    if (result.loans) parts.push(`${result.loans} pinjaman`);
    if (result.repayments) parts.push(`${result.repayments} pembayaran`);
    if (result.people) parts.push(`${result.people} kontak`);
    if (result.journals) parts.push(`${result.journals} jurnal`);
    if (result.items) parts.push(`${result.items} barang`);
    if (result.employees) parts.push(`${result.employees} karyawan`);
    if (result.purchases) parts.push(`${result.purchases} pembelian`);
    if (parts.length) UI.showSuccess('Data digabung: ' + parts.join(', ') + (result.skipped ? ` (${result.skipped} baris rusak/duplikat dilewati)` : ''));
    else UI.showInfo(result && result.skipped ? `${result.skipped} baris dilewati (rusak/duplikat)` : 'Tidak ada data baru (mungkin duplikat)');
    refresh();
  }).catch((err) => {
    UI.showError(err.message);
  });
}

function handleReportOpen() {
  currentReportType = 'monthly';
  const tab = document.querySelector('.report-tab[data-report="monthly"]');
  if (tab) tab.click();
  else {
    // fallback: directly render
    currentReportType = 'monthly';
    renderReport();
  }
  UI.openReportModal();
}

function handleReportClose() {
  const m = document.getElementById('reportModal');
  if (m && m.open) { try { m.close(); } catch {} }
}

function handleReportTabChange(reportType) {
  currentReportType = reportType;
  renderReport();
}

function renderOwnerPanel() {
  const body = document.getElementById('ownerPanelBody');
  if (!body) return;
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const stats = {};
  months.forEach(k => { stats[k] = { omzet: 0, hpp: 0, beban: 0 }; });
  let kas = 0;
  try {
    Storage.getAllJournals().forEach(j => {
      const k = String(j.date || '').slice(0, 7);
      (j.lines || []).forEach(l => {
        const code = String(l.account || '');
        const deb = Number(l.debit) || 0, cr = Number(l.credit) || 0;
        if (stats[k] && code === '4101') stats[k].omzet += cr - deb;
        if (stats[k] && code === '5109') stats[k].hpp += deb - cr;
        if (stats[k] && code.startsWith('5') && code !== '5109') stats[k].beban += deb - cr;
        if (['1101', '1102', '1103', '1104', '1105', '1109'].includes(code)) kas += deb - cr;
      });
    });
  } catch {}
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const monthLabel = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('id-ID', { month: 'short' });
  const curKey = months[months.length - 1];
  const cur = stats[curKey];
  const bebanAvg = months.slice(-3).reduce((s, k) => s + stats[k].hpp + stats[k].beban, 0) / 3;
  const runway = bebanAvg > 0 ? Math.floor(kas / bebanAvg) : null;
  const laba3a = months.slice(0, 3).reduce((s, k) => s + stats[k].omzet - stats[k].hpp - stats[k].beban, 0);
  const laba3b = months.slice(3).reduce((s, k) => s + stats[k].omzet - stats[k].hpp - stats[k].beban, 0);
  const naik = laba3b >= laba3a;
  const margin = cur.omzet > 0 ? Math.round(((cur.omzet - cur.hpp) / cur.omzet) * 100) : null;
  const labaBulan = s6 => (s6 < 0 ? '−' : '+') + 'Rp' + Math.abs(Math.round(s6)).toLocaleString('id-ID');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Laba ${monthLabel(curKey)}</div><div style="font-weight:800;font-size:14px;color:${cur.omzet - cur.hpp - cur.beban >= 0 ? '#059669' : '#dc2626'}">${labaBulan(cur.omzet - cur.hpp - cur.beban)}</div></div>
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Margin kotor</div><div style="font-weight:800;font-size:14px">${margin === null ? '—' : margin + '%'}</div></div>
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Kas & rekening</div><div style="font-weight:800;font-size:14px">${fmt(kas)}</div></div>
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Runway kas</div><div style="font-weight:800;font-size:14px">${runway === null ? '—' : runway + ' bulan'}</div></div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:5px;height:48px;margin-bottom:8px">${months.map((k) => {
    const laba = stats[k].omzet - stats[k].hpp - stats[k].beban;
    const max = Math.max(1, ...months.map(x => Math.abs(stats[x].omzet - stats[x].hpp - stats[x].beban)));
    const h = Math.max(3, Math.round((Math.abs(laba) / max) * 42));
    return `<div style="flex:1;text-align:center"><div style="height:${h}px;background:${laba >= 0 ? '#34d399' : '#fb7185'};border-radius:4px 4px 0 0"></div></div>`;
  }).join('')}</div>
    <div style="font-size:11px;color:${naik ? '#059669' : '#dc2626'};font-weight:600">${naik ? '📈' : '📉'} Laba 3 bulan terakhir ${naik ? 'lebih baik' : 'menurun'} dari sebelumnya</div>`;
}

function refresh() {
  loadData();
  render();
  renderOwnerPanel();
  renderReport();
  queueMirror();
}

function handleSort(column) {
  // balance column should not be sorted by balance value (misleading), fallback to date
  if (column === 'balance') {
    UI.showInfo('Saldo dihitung kronologis, tidak diurutkan');
    return;
  }
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = column === 'date' ? 'desc' : 'asc';
  }
  currentPage = 1;
  render();
}

function sortEntries(entries) {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    let va = a[sortColumn];
    let vb = b[sortColumn];
    if (sortColumn === 'amount' || sortColumn === 'balance') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else if (sortColumn === 'date') {
      va = va || '';
      vb = vb || '';
    } else {
      va = String(va || '').toLowerCase();
      vb = String(vb || '').toLowerCase();
    }
    if (va < vb) return sortDirection === 'asc' ? -1 : 1;
    if (va > vb) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

function render() {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  
  // Apply search filter (includes paymentDetail)
  const searchTerm = UI.getSearchTerm();
  const searchFiltered = searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm))
      )
    : filtered;

  const withBalance = Reports.computeRunningBalance(searchFiltered);
  const sorted = sortEntries(withBalance);
  const totals = Reports.computeTotals(searchFiltered);
  const categories = Reports.computeCategoryBreakdown(searchFiltered);

  // pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  UI.renderEntries(paginated);
  updateBulkBar();
  const ob = document.getElementById('onboardingCard');
  if (ob) ob.classList.toggle('hidden', currentEntries.length > 0);
  // pagination UI
  const pagerNum = document.getElementById('pagerNum');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const loadMoreInfo = document.getElementById('loadMoreInfo');
  if (pagerNum) pagerNum.textContent = String(currentPage);
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  if (loadMoreWrap) {
    if (sorted.length > pageSize && currentPage < totalPages) {
      loadMoreWrap.classList.remove('hidden');
      if (loadMoreInfo) loadMoreInfo.textContent = `Menampilkan ${paginated.length} dari ${sorted.length}`;
    } else loadMoreWrap.classList.add('hidden');
  }

  UI.renderSummary(totals, prevPeriodTotals());
  UI.renderCategoryBreakdown(categories);
  UI.updateSortArrows(sortColumn, sortDirection);
  UI.updateSearchResultsCount(searchFiltered.length, filtered.length);

  const loanSummary = computeLoanSummary();
  UI.renderLoanTotals(
    loanSummary.piutangOutstanding,
    loanSummary.hutangOutstanding,
    loanSummary.piutangCount,
    loanSummary.hutangCount
  );

  renderFilterPills();
  syncTopbarPeriod();
  renderArusKasChart(searchFiltered);
  renderDonut(categories);
  updateTableCount(paginated.length, filtered.length, sorted.length);
  syncTopSearch();
  renderBudget(searchFiltered);
  renderWallets();
  checkOverdue();
  // also update full transaksi view if exists
  if (document.getElementById('viewTransaksi')) {
    // keep transaksi view in sync, but don't reset page unless needed
    renderFullTransaksi();
  }
}

// Label periode jujur di topbar (dulu statis "Agustus 2026" selamanya)
function periodLabelText() {
  const f = currentFilters;
  const monthName = (d) => d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const now = new Date();
  let label = 'Semua waktu';
  if (f.period === 'this-month') label = monthName(now);
  else if (f.period === 'last-month') label = monthName(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  else if (f.period === 'this-year') label = `Tahun ${now.getFullYear()}`;
  else if (f.period === 'custom' && (f.startDate || f.endDate)) {
    const fmt = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };
    label = `${f.startDate ? fmt(f.startDate) : '…'} – ${f.endDate ? fmt(f.endDate) : '…'}`;
  }
  return label;
}
function syncTopbarPeriod() {
  const el = document.getElementById('topbarPeriod');
  if (!el) return;
  el.textContent = periodLabelText() + ' ▾';
}

// Total periode SEBELUM rentang filter aktif (panjang sama) — untuk tren kartu.
// Jujur: tren selalu vs periode sebelumnya, bukan angka statis.
function prevPeriodTotals() {
  const f = currentFilters;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let s, e;
  if (f.period === 'this-month') { s = new Date(now.getFullYear(), now.getMonth(), 1); e = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  else if (f.period === 'last-month') { s = new Date(now.getFullYear(), now.getMonth() - 1, 1); e = new Date(now.getFullYear(), now.getMonth(), 0); }
  else if (f.period === 'this-year') { s = new Date(now.getFullYear(), 0, 1); e = new Date(now.getFullYear(), 11, 31); }
  else if (f.period === 'custom' && (f.startDate || f.endDate)) {
    s = f.startDate ? new Date(f.startDate) : new Date(-8640000000000000);
    e = f.endDate ? new Date(f.endDate) : now;
  } else { e = now; s = new Date(now); s.setDate(s.getDate() - 29); }
  const span = Math.max(Math.round((e - s) / 86400000) + 1, 1);
  const ps = new Date(s); ps.setDate(ps.getDate() - span);
  const pe = new Date(s); pe.setDate(pe.getDate() - 1);
  let income = 0, expense = 0;
  currentEntries.forEach(en => {
    if (f.type !== 'all' && en.type !== f.type) return;
    if (f.category !== 'all' && en.category !== f.category) return;
    const d = new Date(en.date);
    if (isNaN(d) || d < ps || d > pe) return;
    const a = Number(en.amount) || 0;
    if (en.type === 'income') income += a; else expense += a;
  });
  return { income, expense, net: income - expense };
}

function renderFilterPills() {
  const container = document.getElementById('filterPills');
  if (!container) return;
  const vals = UI.getFilterValues();
  const pills = [];
  if (vals.period !== 'all') pills.push(`Periode: ${vals.period}`);
  if (vals.type !== 'all') pills.push(`Jenis: ${vals.type}`);
  if (vals.category !== 'all') pills.push(`Kategori: ${vals.category}`);
  const term = UI.getSearchTerm();
  if (term) pills.push(`Cari: "${term}"`);
  if (!pills.length) {
    container.innerHTML = '<span style="font-size:12px;color:#94a3b8">Semua transaksi</span>';
    return;
  }
  container.innerHTML = pills.map(p => `<span class="chip selected" style="font-size:11px;padding:4px 10px">${p}</span>`).join('') + ' <button class="chip" style="font-size:11px" data-action="reset-filters">Reset</button>';
}

function resetAllFilters() {
  ['periodGroup', 'typeGroupFilter', 'categoryGroupFilter'].forEach(g => {
    const all = document.querySelector(`#${g} .chip[data-value="all"]`);
    if (all) {
      document.querySelectorAll(`#${g} .chip`).forEach(b => b.classList.remove('selected'));
      all.classList.add('selected');
    }
  });
  document.querySelectorAll('#txTypeFilter .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === 'all'));
  const s1 = document.getElementById('searchInput');
  const s2 = document.getElementById('searchInputTop');
  const s3 = document.getElementById('transaksiSearch');
  if (s1) s1.value = '';
  if (s2) s2.value = '';
  if (s3) s3.value = '';
  currentFilters = { period: 'all', type: 'all', category: 'all', startDate: null, endDate: null };
  customRange = { start: null, end: null };
  currentPage = 1;
  transaksiPage = 1;
  render();
}

function syncTopSearch() {
  const top = document.getElementById('searchInputTop');
  const main = document.getElementById('searchInput');
  if (top && main && top.value !== main.value) top.value = main.value;
}

// Grafik pindah ke charts.js — wrapper tipis supaya call-site tidak berubah
function renderArusKasChart(entries) {
  Charts.renderArusKasChart(entries, { range: arusKasRange, show: arusKasShow });
}

function renderDonut(categories) {
  Charts.renderDonut(categories);
}

function updateTableCount(filtered, total, shown) {
  const el = document.getElementById('tableCount');
  if (el) el.textContent = `Menampilkan ${shown} dari ${total} transaksi`;
}

function renderBudget(entries) {
  const card = document.getElementById('budgetCard');
  if (!card) return;
  const budget = Storage.getBudget();
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const limit = budget ? Number(budget.amount) || 0 : 0;
  const fill = document.getElementById('budgetFill');
  const spentEl = document.getElementById('budgetSpent');
  const limitEl = document.getElementById('budgetLimit');
  const hint = document.getElementById('budgetHint');
  if (!limit) {
    if (fill) fill.style.width = '0%';
    if (spentEl) spentEl.textContent = `Rp${expense.toLocaleString('id-ID')} terpakai`;
    if (limitEl) limitEl.textContent = 'Belum diatur';
    if (hint) hint.textContent = 'Atur anggaran di Pengaturan untuk melihat progress.';
    return;
  }
  const pct = Math.min(100, Math.round((expense / limit) * 100));
  if (fill) {
    fill.style.width = pct + '%';
    fill.classList.toggle('over', pct >= 90);
  }
  if (spentEl) spentEl.textContent = `Rp${expense.toLocaleString('id-ID')} terpakai`;
  if (limitEl) limitEl.textContent = `Limit: Rp${limit.toLocaleString('id-ID')} • ${pct}%`;
  if (hint) hint.textContent = pct >= 100 ? '⚠️ Melebihi anggaran!' : pct >= 80 ? 'Hampir mencapai limit' : 'Kelola pengeluaran dengan bijak';
  renderCategoryBudgets(entries);
}

function renderCategoryBudgets(entries) {
  const box = document.getElementById('budgetCats');
  if (!box) return;
  const limits = Storage.getCategoryBudgets();
  const cats = Object.keys(limits);
  if (!cats.length) { box.innerHTML = ''; return; }
  const fmt = (v) => 'Rp' + Number(v).toLocaleString('id-ID');
  box.innerHTML = cats.map(c => {
    const spent = entries.filter(e => e.type === 'expense' && e.category === c).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const lim = limits[c];
    const pct = lim > 0 ? Math.min(100, Math.round((spent / lim) * 100)) : 0;
    const over = spent > lim;
    let label = c;
    try { label = Reports.getCategoryLabel(c) || c; } catch {}
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:3px">
        <span>${escapeHtml(label)}</span>
        <span style="font-weight:600;color:${over ? '#ef4444' : '#0f172a'}">${fmt(spent)} / ${fmt(lim)}${over ? ' ⚠️' : ''}</span>
      </div>
      <div class="budget-bar" style="height:6px"><div class="budget-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderWallets() {
  const box = document.getElementById('walletList');
  if (!box) return;
  // Berbasis jurnal (bukan entry) supaya transfer antar kas ikut kehitung
  const r = journalDateRange();
  const bal = balances(Storage.getAllJournals(), r);
  const cashAccts = ACCOUNTS.filter(a => a.payment && a.type === 'asset');
  const rows = cashAccts
    .map(a => ({ code: a.code, net: (bal[a.code]?.debit || 0) - (bal[a.code]?.credit || 0) }))
    .filter(x => x.net !== 0);
  if (!rows.length) {
    box.innerHTML = '<span style="font-size:11px;color:#94a3b8">Belum ada transaksi</span>';
    return;
  }
  const fmt = (v) => (v < 0 ? '−Rp' : 'Rp') + Math.abs(Math.round(v)).toLocaleString('id-ID');
  rows.sort((a, b) => b.net - a.net);
  box.innerHTML = rows.map(x => {
    const acct = cashAccts.find(a => a.code === x.code) || {};
    const icon = (Reports.PAYMENT_OPTIONS || []).find(p => p.value === acct.payment)?.icon || '📦';
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px">
      <span>${icon}</span>
      <span style="flex:1">${acct.name || x.code}</span>
      <span style="font-weight:700;color:${x.net < 0 ? '#ef4444' : '#0f172a'}">${fmt(x.net)}</span>
    </div>`;
  }).join('');
}

function nextDueForLoan(l, paidCount) {
  return nextDue(l, paidCount);
}
function getLoanAlerts() {
  const loans = Storage.getAllLoans();
  const reps = Storage.getAllRepayments();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  loans.forEach(l => {
    if (l.status === 'paid') return;
    const paidCount = reps.filter(r => r.loanId === l.id).length;
    const due = nextDueForLoan(l, paidCount);
    if (!due || isNaN(due)) return;
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due - today) / 86400000);
    if (diffDays < 0) out.push({ loan: l, kind: 'overdue', diffDays, due, paidCount });
    else if (diffDays <= 3) out.push({ loan: l, kind: 'soon', diffDays, due, paidCount });
  });
  out.sort((a, b) => a.diffDays - b.diffDays);
  return out;
}
// Semua pengingat dalam satu tempat: pinjaman, stok, supplier, PPh
function pphPendingInfo() {
  if (new Date().getDate() > 15) return null;
  const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1);
  const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  let omzet = 0;
  try {
    Storage.getAllJournals().forEach(j => {
      if (String(j.date || '').slice(0, 7) !== key) return;
      (j.lines || []).forEach(l => {
        if (l.account === '4101') omzet += (Number(l.credit) || 0) - (Number(l.debit) || 0);
      });
    });
  } catch {}
  return omzet > 0 ? { key, pph: Math.round(omzet * 0.005) } : null;
}
function getAllAlerts() {
  const out = [];
  getLoanAlerts().forEach(a => out.push({
    type: 'loan', target: 'loans', icon: a.kind === 'overdue' ? '🔴' : '🟡',
    text: `Pinjaman ${a.loan.person || '—'} ${a.diffDays < 0 ? `terlambat ${Math.abs(a.diffDays)} hari` : (a.diffDays === 0 ? 'jatuh tempo hari ini' : `jatuh tempo H-${a.diffDays}`)}`
  }));
  let low = [];
  try { low = Storage.getAllItems().filter(i => (i.minStock || 0) > 0 && i.stock <= i.minStock); } catch {}
  if (low.length) out.push({
    type: 'stock', target: 'stock', icon: '📦',
    text: `Stok menipis: ${low.slice(0, 3).map(i => i.name).join(', ')}${low.length > 3 ? ` +${low.length - 3} lagi` : ''}`
  });
  let sup = [];
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    sup = Storage.getAllPurchases().filter(p => p.status !== 'paid' && p.dueDate && Storage.purchaseOutstanding(p) > 0.01 && new Date(p.dueDate + 'T00:00:00') < today);
  } catch {}
  if (sup.length) out.push({ type: 'supplier', target: 'stock', icon: '📥', text: `${sup.length} pembelian supplier lewat jatuh tempo — cek Stok → Hutang ke Supplier` });
  const pph = pphPendingInfo();
  if (pph) out.push({ type: 'pph', target: 'tax', icon: '🧾', text: `PPh Final ${pph.key}: Rp${pph.pph.toLocaleString('id-ID')} — bayar sebelum tgl 15 (Laporan → Pajak)` });
  return out;
}
function updateNotifBadge() {
  const badge = document.querySelector('#notifBtn .notif-badge');
  if (!badge) return;
  const alerts = getAllAlerts();
  badge.textContent = String(alerts.length);
  badge.style.display = alerts.length ? 'flex' : 'none';
  const btn = document.getElementById('notifBtn');
  if (btn) btn.setAttribute('aria-label', alerts.length ? `${alerts.length} pengingat` : 'Tidak ada pengingat');
}
let overdueNotified = false;
function checkOverdue() {
  updateNotifBadge();
  if (overdueNotified) return;
  const setting = document.getElementById('settingNotif');
  const enabled = setting ? setting.checked : true;
  const stored = safeLocalGet('wynara_notif');
  const isEnabled = stored ? stored === 'true' : enabled;
  if (!isEnabled) return;
  const alerts = getLoanAlerts();
  if (alerts.length) {
    overdueNotified = true;
    const over = alerts.filter(a => a.kind === 'overdue').length;
    const soon = alerts.length - over;
    UI.showWarning(over ? `${over} pinjaman terlambat${soon ? `, ${soon} jatuh tempo ≤3 hari` : ''}! Cek menu Pinjaman.` : `${soon} pinjaman jatuh tempo ≤3 hari. Cek menu Pinjaman.`);
  }
  checkPPhReminder();
  checkStockAlert();
}

let stockNotified = false;
function checkStockAlert() {
  if (stockNotified) return;
  let low = [];
  try {
    low = Storage.getAllItems().filter(i => (i.minStock || 0) > 0 && i.stock <= i.minStock);
  } catch {}
  if (low.length) {
    stockNotified = true;
    const names = low.slice(0, 3).map(i => i.name).join(', ');
    UI.showWarning(`Stok menipis: ${names}${low.length > 3 ? ` +${low.length - 3} lagi` : ''}. Cek menu Stok.`);
  }
}

let pphNotified = false;
function checkPPhReminder() {
  if (pphNotified) return;
  const now = new Date();
  if (now.getDate() > 15) return; // lewat tenggat bulan ini
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  let omzet = 0;
  try {
    Storage.getAllJournals().forEach(j => {
      if (String(j.date || '').slice(0, 7) !== key) return;
      (j.lines || []).forEach(l => {
        if (l.account === '4101') omzet += (Number(l.credit) || 0) - (Number(l.debit) || 0);
      });
    });
  } catch {}
  if (omzet > 0) {
    pphNotified = true;
    const pph = Math.round(omzet * 0.005);
    UI.showWarning(`PPh Final bulan lalu Rp${pph.toLocaleString('id-ID')} — bayar sebelum tgl 15. Lihat Laporan → Pajak.`);
  }
}

function renderFullTransaksi() {
  const tbody = document.getElementById('transaksiBody');
  const empty = document.getElementById('transaksiEmpty');
  const countEl = document.getElementById('transaksiCount');
  const saldoEl = document.getElementById('transaksiSaldo');
  const pagerNum = document.getElementById('transaksiPagerNum');
  const prevBtn = document.getElementById('transaksiPrev');
  const nextBtn = document.getElementById('transaksiNext');
  const subtitle = document.getElementById('transaksiSubtitle');
  const kategoriSel = document.getElementById('transaksiFilterKategori');
  if (!tbody) return;
  if (kategoriSel && kategoriSel.options.length <= 1) {
    const cats = Storage.getCategories();
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = Reports.getCategoryLabel(c);
      kategoriSel.appendChild(opt);
    });
  }
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  const searchTerm = (document.getElementById('transaksiSearch')?.value || UI.getSearchTerm() || '').trim().toLowerCase();
  const searchFiltered = searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm))
      )
    : filtered;
  const withBalance = Reports.computeRunningBalance(searchFiltered);
  const sorted = sortEntries(withBalance);
  const totals = Reports.computeTotals(searchFiltered);
  if (subtitle) subtitle.textContent = `${searchFiltered.length} transaksi • Total ${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(totals.net)} saldo`;
  if (saldoEl) saldoEl.textContent = `Total saldo: ${Reports.formatCurrency(totals.net)}`;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  if (transaksiPage > totalPages) transaksiPage = totalPages;
  if (transaksiPage < 1) transaksiPage = 1;
  const pageData = sorted.slice((transaksiPage - 1) * pageSize, transaksiPage * pageSize);
  if (!pageData.length) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (countEl) countEl.textContent = `Menampilkan 0 dari ${sorted.length} transaksi`;
    if (pagerNum) pagerNum.textContent = '1';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }
  if (empty) empty.classList.add('hidden');
  tbody.innerHTML = pageData.map(e => {
    const isIncome = e.type === 'income';
    const sign = isIncome ? '+' : '-';
    const amt = Reports.formatCurrency(Number(e.amount)||0).replace(/\s/g,'');
    const kategori = Reports.getCategoryLabel(e.category);
    const ikon = Reports.getCategoryIcon(e.category);
    const kontak = e.person ? escapeHtml(e.person) : '—';
    const cara = `${Reports.getPaymentIcon(e.payment)} ${Reports.getPaymentLabel(e.payment)}${e.paymentDetail ? ' • ' + escapeHtml(e.paymentDetail) : ''}`;
    return `<tr style="border-bottom:1px solid #f8fafc">
      <td style="padding:12px;white-space:nowrap;font-size:13px">${Reports.formatDate(e.date)}</td>
      <td style="padding:12px"><span style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:9999px;background:#f1f5f9;font-size:12px">${ikon} ${escapeHtml(kategori)}</span></td>
      <td style="padding:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.description||'')}">${escapeHtml(e.description||'-')}</td>
      <td style="padding:12px;white-space:nowrap;font-size:13px">${kontak}</td>
      <td style="padding:12px;white-space:nowrap;font-size:12px"><span style="background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:9999px">${cara}</span></td>
      <td style="padding:12px"><span style="background:${isIncome?'#ecfdf5':'#fff1f2'};color:${isIncome?'#047857':'#be123c'};padding:2px 8px;border-radius:9999px;font-size:11px">${isIncome?'📥 Masuk':'📤 Keluar'}</span></td>
      <td style="padding:12px;text-align:right;white-space:nowrap;font-weight:700;color:${isIncome?'#059669':'#dc2626'};font-family:monospace">${sign} ${amt}</td>
      <td style="padding:12px;text-align:right;white-space:nowrap">
        <button class="btn btn-ghost" onclick="document.dispatchEvent(new CustomEvent('wynara:edit',{detail:'${e.id}'}))" style="padding:2px 6px;font-size:12px">✎</button>
        <button class="btn btn-ghost" onclick="document.dispatchEvent(new CustomEvent('wynara:receipt',{detail:'${e.id}'}))" style="padding:2px 6px;font-size:12px" title="Kwitansi">🧾</button>
        <button class="btn btn-danger" onclick="document.dispatchEvent(new CustomEvent('wynara:delete',{detail:'${e.id}'}))" style="padding:2px 6px;font-size:12px">🗑</button>
      </td>
    </tr>`;
  }).join('');
  if (countEl) countEl.textContent = `Menampilkan ${pageData.length} dari ${sorted.length} transaksi`;
  if (pagerNum) pagerNum.textContent = String(transaksiPage);
  if (prevBtn) prevBtn.disabled = transaksiPage <= 1;
  if (nextBtn) nextBtn.disabled = transaksiPage >= totalPages;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function computeReportData(type) {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  switch (type) {
    case 'category':
      return Reports.computeCategoryBreakdown(filtered);
    case 'cashflow':
      return Reports.computeCashflow(filtered);
    case 'top-expenses':
      return Reports.computeTopExpenses(filtered);
    case 'journal':
      return journalInRange();
    case 'ledger':
      return ledgerDrillData();
    case 'pl':
      return buildProfitLoss();
    case 'bs':
      return buildBalanceSheet();
    case 'tax':
      return buildTaxReport();
    case 'audit':
      return Storage.getAudit().slice(0, 100);
    case 'payrollrep':
      return buildPayrollReport();
    case 'products':
      return buildProductsReport();
    case 'pengeluaran':
      return buildExpenseReport();
    case 'trial':
      return buildTrialBalance();
    case 'ppn':
      return buildPPNReport();
    case 'pph21':
      return buildPPh21Report();
    default:
      return Reports.computeMonthlySummary(filtered);
  }
}

// Neraca Saldo — alat kerja utama akuntan (saldo debit/kredit per akun, cek seimbang)
function buildTrialBalance() {
  const journals = Storage.getAllJournals();
  const drill = journalDateRange();
  const inRange = (r) => (!drill.start || String(r.date) >= drill.start) && (!drill.end || String(r.date) <= drill.end);
  const lines = {};
  try {
    journals.filter(inRange).forEach(j => {
      (j.lines || []).forEach(l => {
        if (!l || !l.account) return;
        if (!lines[l.account]) lines[l.account] = [];
        lines[l.account].push({ date: j.date, memo: j.memo || j.description || 'Jurnal', debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 });
      });
    });
  } catch {}
  const rangeJournals = journals.filter(inRange);
  const bal = balances(rangeJournals.length ? rangeJournals : journals, drill.start || drill.end ? drill : {});
  const accounts = getAccounts().map(a => ({ code: a.code, name: a.name, type: a.type, b: bal[a.code] || { debit: 0, credit: 0 } }));
  const totDeb = accounts.reduce((s, x) => s + x.b.debit, 0);
  const totCred = accounts.reduce((s, x) => s + x.b.credit, 0);
  let unbalanced = [];
  try { unbalanced = findUnbalanced(journals); } catch {}
  let locked = [];
  try { locked = Storage.getLockedMonths(); } catch {}
  return { rows: accounts, debit: totDeb, credit: totCred, diff: totDeb - totCred, balanced: Math.abs(totDeb - totCred) < 0.005, unbalanced, locked, lines, rangeLabel: drill.start && drill.end ? `${drill.start} — ${drill.end}` : 'Semua akun' };
}

// Laporan PPN bulanan (gaya 1111): PPN Keluaran (2105) vs Masukan (1401)
function buildPPNReport() {
  const by = {};
  const KEY = { '2105': 'keluaran', '1401': 'masukan' };
  let totK = 0, totM = 0;
  Storage.getAllJournals().forEach(j => {
    const m = String(j.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!by[m]) by[m] = { month: m, keluarPPN: 0, keluarDPP: 0, masukPPN: 0, masukDPP: 0 };
    (j.lines || []).forEach(l => {
      const t = KEY[l.account];
      const deb = Number(l.debit) || 0, cr = Number(l.credit) || 0;
      const RATE = Storage.getPpn().rate;
      if (t === 'keluaran' && cr > 0) { by[m].keluarPPN += cr - deb; by[m].keluarDPP += (cr - deb) / RATE; }
      if (t === 'masukan' && deb > 0) { by[m].masukPPN += deb - cr; by[m].masukDPP += (deb - cr) / RATE; }
    });
  });
  const months = Object.values(by).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({
    ...x, keluarPPN: Math.round(x.keluarPPN), keluarDPP: Math.round(x.keluarDPP), masukPPN: Math.round(x.masukPPN), masukDPP: Math.round(x.masukDPP),
    net: Math.round(x.keluarPPN - x.masukPPN)
  }));
  totK = months.reduce((s, x) => s + x.keluarPPN, 0);
  totM = months.reduce((s, x) => s + x.masukPPN, 0);
  return { months, totalKeluar: totK, totalMasuk: totM, net: totK - totM, year: new Date().getFullYear() };
}

// Rekap PPh 21 per bulan (untuk e-SPT 21) — dari data gaji yang difinalisasi
function buildPPh21Report() {
  const by = {};
  Storage.getAllEntries().forEach(e => {
    if (e.category !== 'gaji-out') return;
    const m = String(e.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!by[m]) by[m] = { month: m, thp: 0, pph: 0, count: 0 };
    const p = e.payroll || {};
    by[m].thp += Math.round(Number(e.amount) || 0);
    by[m].pph += Math.round(Number(p.ded && p.ded.pph21) || 0);
    by[m].count += 1;
  });
  const rows = Object.values(by).sort((a, b) => b.month.localeCompare(a.month));
  const totalPph = rows.reduce((s, x) => s + x.pph, 0);
  const totalThp = rows.reduce((s, x) => s + x.thp, 0);
  return { rows, totalPph, totalThp, year: new Date().getFullYear() };
}

// Laporan produk terlaris — dari entri penjualan (sale.lines)
let expenseCatFilter = 'all';
let expensePersonFilter = 'all';
// Laporan Pengeluaran vs Anggaran — dari budget + entri pengeluaran periode aktif
function buildExpenseReport() {
  const all = Reports.filterEntries(Storage.getAllEntries(), currentFilters).filter(e => e.type === 'expense');
  const budget = Storage.getBudget();
  const catLimits = Storage.getCategoryBudgets() || {};
  const budgetTotal = budget ? Number(budget.amount) || 0 : 0;
  const byCat = {};
  all.forEach(e => {
    const c = e.category || 'lainnya';
    if (!byCat[c]) byCat[c] = 0;
    byCat[c] += Number(e.amount) || 0;
  });
  const persons = [...new Set(all.map(e => (e.person || '').trim()).filter(Boolean))].sort();
  const cats = [...new Set([...Object.keys(byCat), ...Object.keys(catLimits)])];
  const rows = cats.map(c => {
    let label = c, icon = '';
    try { label = Reports.getCategoryLabel(c) || c; icon = Reports.getCategoryIcon(c) || ''; } catch {}
    const spent = Math.round(byCat[c] || 0);
    const limit = Math.round(Number(catLimits[c]) || 0);
    return { category: c, label, icon, budget: limit, spent, diff: limit - spent };
  }).sort((a, b) => b.spent - a.spent);
  const fCat = expenseCatFilter, fPer = expensePersonFilter;
  const fRows = rows.filter(r => (fCat === 'all' || r.category === fCat));
  const fAll = all.filter(e => (fCat === 'all' || (e.category || 'lainnya') === fCat) && (fPer === 'all' || (e.person || '').trim() === fPer));
  const spentTotal = Math.round(fAll.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const recent = fAll.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 5).map(e => {
    let label = e.category || 'lainnya', icon = '';
    try { label = Reports.getCategoryLabel(e.category) || label; icon = Reports.getCategoryIcon(e.category) || ''; } catch {}
    return { date: e.date, description: e.description || '-', category: e.category, label, icon, person: (e.person || '').trim(), payment: e.payment || '', amount: Math.round(Number(e.amount) || 0) };
  });
  const compMax = Math.max(1, ...fRows.map(r => r.spent));
  return { budgetTotal: Math.round(budgetTotal), spentTotal, remaining: Math.round(budgetTotal - spentTotal), rows: fRows, compMax, recent, persons, cats, fCat, fPer };
}
function buildProductsReport() {
  const byItem = {};
  try {
    Reports.filterEntries(Storage.getAllEntries(), currentFilters).forEach(e => {
      if (e.category !== 'jualan' || !e.sale || !Array.isArray(e.sale.lines)) return;
      e.sale.lines.forEach(l => {
        if (!byItem[l.itemId]) byItem[l.itemId] = { name: l.name || '', qty: 0, omzet: 0 };
        byItem[l.itemId].qty += Number(l.qty) || 0;
        byItem[l.itemId].omzet += (Number(l.price) || 0) * (Number(l.qty) || 0);
      });
    });
  } catch {}
  const items = Storage.getAllItems();
  const total = Object.values(byItem).reduce((s, x) => s + x.omzet, 0);
  const rows = Object.keys(byItem).map(id => {
    const it = items.find(x => x.id === id) || {};
    const x = byItem[id];
    const cost = Number(it.cost) || 0;
    const hpp = cost * x.qty;
    return { name: x.name || it.name || '(barang terhapus)', qty: x.qty, omzet: x.omzet, hpp, margin: x.omzet - hpp, share: total > 0 ? (x.omzet / total) * 100 : 0 };
  }).sort((a, b) => b.omzet - a.omzet);
  return { rows, total };
}

function renderReport() {
  UI.renderReport(currentReportType, computeReportData(currentReportType));
}

let pageReportPeriodUi = 'all';
function renderPageReport() {
  if (!document.getElementById('pageReportContent')) return;
  const tab = document.querySelector('.page-report-tab.selected')?.dataset.report || currentReportType;
  // Select periode mengikuti filter aktif (dashboard atau dropdown halaman)
  if (['all', 'this-month', 'last-month', 'this-year'].includes(currentFilters.period)) pageReportPeriodUi = currentFilters.period;
  const periodSel = document.getElementById('pageReportPeriod');
  if (periodSel && [...periodSel.options].some(o => o.value === pageReportPeriodUi)) periodSel.value = pageReportPeriodUi;
  // Search hanya relevan di Jurnal & Buku Besar — reset saat pindah tab lain
  const searchInp = document.getElementById('reportSearchInput');
  if (searchInp) {
    searchInp.hidden = !(tab === 'journal' || tab === 'ledger');
    if (searchInp.hidden && UI.getReportSearch()) { UI.setReportSearch(''); searchInp.value = ''; }
  }
  UI.renderReportPage(currentReportType, computeReportData(currentReportType));
  renderPageHealth();
}
// Kertas kerja ringkas: sekilas keadaan (jurnal pincang, penutupan terakhir, kunci)
function renderPageHealth() {
  const box = document.getElementById('pageReportHealth');
  if (!box) return;
  const t = buildTrialBalance();
  const lastCloseDate = (Storage.getAllJournals().filter(j => (j.ref || '') === 'closing').map(j => j.date).sort().pop()) || '';
  let closeText = 'belum ada penutupan (opsional)';
  let closeColor = '#94a3b8';
  if (lastCloseDate) {
    const [y, m] = String(lastCloseDate).split('-').map(Number);
    closeText = `🔒 penutupan terakhir ${new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
    closeColor = '#2563eb';
  }
  const chips = [
    t.unbalanced.length === 0 ? '<span style="color:#059669;font-weight:600">✓ jurnal lengkap</span>' : `<span style="color:#b91c1c;font-weight:600">⚠ ${t.unbalanced.length} jurnal pincang</span>`,
    t.balanced ? '<span style="color:#059669;font-weight:600">✓ neraca saldo seimbang</span>' : `<span style="color:#b91c1c;font-weight:600">⚠ selisih Rp${Math.abs(Math.round(t.diff)).toLocaleString('id-ID')}</span>`,
    `<span style="color:${closeColor};font-weight:600">${closeText}</span>`,
    t.locked.length ? `<span style="color:#64748b">🔒 ${t.locked.length} bulan terkunci</span>` : '<span style="color:#94a3b8">tidak ada periode terkunci</span>'
  ];
  box.innerHTML = chips.map(c => `<span class="chip" style="font-size:11px;margin:0 6px 6px 0">${c}</span>`).join('');
}

// Rentang tanggal dari filter periode aktif (untuk jurnal & buku besar)
function journalDateRange() {
  const p = currentFilters.period;
  const now = new Date();
  const iso = (d) => d.toISOString().split('T')[0];
  if (p === 'this-month') return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(now) };
  if (p === 'last-month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: iso(s), end: iso(e) };
  }
  if (p === 'this-year') return { start: `${now.getFullYear()}-01-01`, end: iso(now) };
  if (p === 'custom' && (currentFilters.startDate || currentFilters.endDate)) {
    return { start: currentFilters.startDate || '0000-01-01', end: currentFilters.endDate || '9999-12-31' };
  }
  return {};
}

function journalInRange() {
  const r = journalDateRange();
  return Storage.getAllJournals().filter(j => {
    if (r.start && String(j.date || '') < r.start) return false;
    if (r.end && String(j.date || '') > r.end) return false;
    return true;
  });
}

// Drill-down: balances + jurnal mentah periode yang sama (untuk ekspansi per akun)
function ledgerDrillData() {
  const journals = journalInRange();
  const lines = {};
  journals.forEach(j => {
    (j.lines || []).forEach(l => {
      if (!l || !l.account) return;
      if (!lines[l.account]) lines[l.account] = [];
      lines[l.account].push({ date: j.date, memo: j.memo || journalMemoOf(j), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 });
    });
  });
  return { bal: balances(journals), journals, lines };
}
function journalMemoOf(j) { return j.description || j.note || j.memo || 'Jurnal'; }

function addDaysStr(ymd, n) {
  const d = new Date(ymd + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plNumbers(bal) {
  const sum = (codes) => codes.reduce((s, c) => s + ((bal[c]?.credit || 0) - (bal[c]?.debit || 0)), 0);
  const exp = (codes) => codes.reduce((s, c) => s + ((bal[c]?.debit || 0) - (bal[c]?.credit || 0)), 0);
  const revCodes = ACCOUNTS.filter(a => a.type === 'revenue').map(a => a.code);
  const expCodes = ACCOUNTS.filter(a => a.type === 'expense').map(a => a.code);
  const revenue = sum(revCodes);
  const expenses = expCodes.map(c => ({ code: c, total: exp([c]) })).filter(x => x.total !== 0);
  const totalExp = expenses.reduce((s, x) => s + x.total, 0);
  return { revenue, expenses, totalExp, net: revenue - totalExp };
}

function buildProfitLoss() {
  const range = journalDateRange();
  const cur = plNumbers(balances(journalInRange()));
  // Periode sebelumnya sepanjang yang sama (kolom banding investor)
  let prev = null;
  if (range.start && range.end) {
    const s = range.start <= range.end ? range.start : range.end;
    const e = range.start <= range.end ? range.end : range.start;
    const span = Math.max(Math.round((new Date(e) - new Date(s)) / 86400000) + 1, 1);
    prev = plNumbers(balances(Storage.getAllJournals(), { start: addDaysStr(s, -span), end: addDaysStr(s, -1) }));
  }
  // Anggaran vs realisasi (bulan berjalan)
  const now = new Date();
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExp = currentEntries.filter(x => x.type === 'expense' && String(x.date || '').slice(0, 7) === mk);
  const spent = monthExp.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const budget = Storage.getBudget();
  const catLimits = Storage.getCategoryBudgets();
  const cats = Object.keys(catLimits).map(c => {
    const cs = monthExp.filter(x => x.category === c).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    let label = c;
    try { label = Reports.getCategoryLabel(c) || c; } catch {}
    return { label, limit: catLimits[c], spent: cs };
  });
  return { ...cur, prev, range, budget: { limit: budget ? Number(budget.amount) || 0 : 0, spent, cats } };
}

function bsSnapshot(bal) {
  const all = getAccounts();
  const assetCodes = all.filter(a => a.type === 'asset').map(a => a.code);
  const liabCodes = all.filter(a => a.type === 'liability').map(a => a.code);
  const netOf = (codes, normal) => codes.map(c => {
    const b = bal[c] || { debit: 0, credit: 0 };
    const net = normal === 'debit' ? b.debit - b.credit : b.credit - b.debit;
    return { code: c, total: net };
  }).filter(x => x.total !== 0);
  const assets = netOf(assetCodes, 'debit');
  const liabs = netOf(liabCodes, 'credit');
  const totalA = assets.reduce((s, x) => s + x.total, 0);
  const totalL = liabs.reduce((s, x) => s + x.total, 0);
  const eq = Storage.getOpeningEquity();
  const modal = eq ? Number(eq.amount) || 0 : 0;
  // Laba ditahan = total pendapatan − total beban (kumulatif s/d tanggal neraca)
  const revCodes = ACCOUNTS.filter(a => a.type === 'revenue').map(a => a.code);
  const rev = revCodes.reduce((s, c) => s + ((bal[c]?.credit || 0) - (bal[c]?.debit || 0)), 0);
  const expCodes = ACCOUNTS.filter(a => a.type === 'expense').map(a => a.code);
  const exp = expCodes.reduce((s, c) => s + ((bal[c]?.debit || 0) - (bal[c]?.credit || 0)), 0);
  const laba = rev - exp;
  return { assets, liabs, totalA, totalL, modal, laba, equity: modal + laba, balanced: totalA - (totalL + modal + laba) };
}

function buildBalanceSheet() {
  const range = journalDateRange();
  const journals = Storage.getAllJournals();
  const cur = bsSnapshot(balances(journals, range.end ? { end: range.end } : {}));
  // Pembanding = posisi sehari sebelum periode berjalan (saldo awal)
  let prev = null;
  let prevLabel = '';
  if (range.start) {
    const s = range.start <= (range.end || range.start) ? range.start : (range.end || range.start);
    const before = addDaysStr(s, -1);
    prev = bsSnapshot(balances(journals, { end: before }));
    prevLabel = `per ${before.slice(8, 10)}/${before.slice(5, 7)}/${before.slice(0, 4)}`;
  }
  return { ...cur, prev, prevLabel, range };
}

function buildTaxReport() {
  const journals = Storage.getAllJournals();
  const byMonth = {};
  journals.forEach(j => {
    const m = String(j.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!byMonth[m]) byMonth[m] = { month: m, omzet: 0 };
    (j.lines || []).forEach(l => {
      if (l.account === '4101') byMonth[m].omzet += (Number(l.credit) || 0) - (Number(l.debit) || 0);
    });
  });
  const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({
    ...x,
    omzet: Math.max(Math.round(x.omzet), 0),
    pph: Math.round(Math.max(x.omzet, 0) * 0.005)
  }));
  const year = new Date().getFullYear();
  const omzetYear = months.filter(m => m.month.startsWith(String(year))).reduce((s, m) => s + m.omzet, 0);
  const bal = balances(journals);
  const ppnOut = (bal['2105']?.credit || 0) - (bal['2105']?.debit || 0);
  const ppnIn = (bal['1401']?.debit || 0) - (bal['1401']?.credit || 0);
  return { months: months.slice(-12), omzetYear, pphYear: Math.round(omzetYear * 0.005), ppnOut, ppnIn, ppnNet: ppnOut - ppnIn, year };
}

function buildPayrollReport() {
  const months = {};
  Storage.getAllEntries().forEach(e => {
    if (e.category !== 'gaji-out') return;
    const m = String(e.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!months[m]) months[m] = { month: m, thp: 0, gross: 0, thr: 0, dedEmp: 0, comp: 0, pph: 0, count: 0 };
    const p = e.payroll || {};
    const d = p.ded || {};
    months[m].thp += Math.round(Number(e.amount) || 0);
    months[m].gross += Math.round(Number(p.base || 0) + Number(p.allow || 0) + Number(p.overtime || 0));
    months[m].thr += Math.round(Number(p.thr) || 0);
    months[m].dedEmp += Math.round((Number(d.kesSelf) || 0) + (Number(d.jhtSelf) || 0) + (Number(d.jpSelf) || 0));
    const c = p.comp || {};
    months[m].comp += Math.round((Number(c.kesComp) || 0) + (Number(c.jhtComp) || 0) + (Number(c.jpComp) || 0) + (Number(c.jkk) || 0) + (Number(c.jkm) || 0));
    months[m].pph += Math.round(Number(d.pph21) || 0);
    months[m].count += 1;
  });
  const ms = Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
  const years = {};
  ms.forEach(m => {
    const y = m.month.slice(0, 4);
    if (!years[y]) years[y] = { year: y, thp: 0, gross: 0, thr: 0, dedEmp: 0, comp: 0, pph: 0, count: 0 };
    Object.keys(years[y]).forEach(k => { if (k !== 'year' && typeof years[y][k] === 'number') years[y][k] += m[k]; });
  });
  const bal = balances(Storage.getAllJournals());
  const bpjsDebt = (bal['2110']?.credit || 0) - (bal['2110']?.debit || 0);
  return { months: ms.slice(0, 24), years: Object.values(years).sort((a, b) => b.year.localeCompare(a.year)), bpjsDebt };
}

function handleClearAll() {
  if (confirm('Hapus SEMUA data (transaksi, pinjaman, jurnal, stok, gaji)? Kontak dipertahankan. Tindakan ini tidak dapat dibatalkan.')) {
    Storage.clearAllData();
    UI.showSuccess('Semua data dihapus');
    refresh();
  }
}

function handleKeyboardShortcut(e) {
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
    if (isInput) return;
    e.preventDefault();
    document.getElementById('addEntryBtn').click();
  }
  if (e.key === 'Escape') {
    const modals = ['entryModal','loansModal','repayModal','contactsModal','contactFormModal','reportModal','customDateModal'];
    for (const id of modals) {
      const m = document.getElementById(id);
      if (m && m.open) {
        try { m.close(); } catch {}
        return;
      }
    }
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      overlay?.classList.add('hidden');
    }
  }
  if (e.key === '/' && !isInput) {
    e.preventDefault();
    document.getElementById('searchInput')?.focus();
    document.getElementById('searchInputTop')?.focus();
  }
  if (e.key === '?' && !isInput) {
    UI.showInfo('Shortcuts: Ctrl+N tambah, / cari, Esc tutup');
  }
}

function handlePrint() {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  const searchTerm = UI.getSearchTerm();
  const searchFiltered = searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm))
      )
    : filtered;
  const withBalance = Reports.computeRunningBalance(searchFiltered);
  const sorted = sortEntries(withBalance);
  const totals = Reports.computeTotals(searchFiltered);

  const rows = sorted.map(e => {
    const sign = e.type === 'income' ? '+' : '-';
    const pay = e.paymentDetail ? `${e.payment} (${e.paymentDetail})` : (e.payment || '');
    return `<tr><td>${escapeHtml(e.date)}</td><td>${e.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</td><td>${escapeHtml(Reports.getCategoryLabel(e.category))}</td><td>${escapeHtml(pay)}</td><td>${escapeHtml(e.description || '')}</td><td style="text-align:right">${sign} Rp${Number(e.amount).toLocaleString('id-ID')}</td><td style="text-align:right">Rp${Number(e.balance).toLocaleString('id-ID')}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><title>Wynara - ${new Date().toLocaleDateString('id-ID')}</title>
<style>
  body{font-family:system-ui;margin:20px;color:#222}
  h2{margin:0 0 4px}p{margin:0 0 16px;color:#666;font-size:0.85rem}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:7px 10px;border:1px solid #ddd;text-align:left;font-size:0.82rem}
  th{background:#f5f5f5;font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em}
  .sum{display:flex;gap:24px;margin:16px 0}.sum-item{text-align:center}
  .sum-item .l{font-size:0.7rem;color:#888;text-transform:uppercase}.sum-item .v{font-size:1.1rem;font-weight:600}
  .inc{color:#16a34a}.exp{color:#dc2626}
  @media print{@page{size:A4;margin:15mm}}
</style></head><body>
<h2>Wynara Accounting System</h2>
<p>Dicetak: ${new Date().toLocaleString('id-ID')}</p>
<div class="sum">
  <div class="sum-item"><div class="l">Pemasukan</div><div class="v inc">Rp${totals.income.toLocaleString('id-ID')}</div></div>
  <div class="sum-item"><div class="l">Pengeluaran</div><div class="v exp">Rp${totals.expense.toLocaleString('id-ID')}</div></div>
  <div class="sum-item"><div class="l">Saldo</div><div class="v ${totals.net >= 0 ? 'inc' : 'exp'}">Rp${totals.net.toLocaleString('id-ID')}</div></div>
</div>
<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Bayar</th><th>Deskripsi</th><th style="text-align:right">Jumlah</th><th style="text-align:right">Saldo</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function handleThemeToggle() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  safeLocalSet('theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('themeToggle');
  const btn2 = document.getElementById('themeToggleSidebar');
  if (btn) btn.setAttribute('aria-label', isDark ? 'Light mode' : 'Dark mode');
  if (btn2) btn2.setAttribute('aria-label', isDark ? 'Light mode' : 'Dark mode');
  UI.showInfo(isDark ? 'Mode gelap aktif' : 'Mode terang aktif');
}

function handleRepayClick(loanId, presetAmount) {
  const loan = Storage.getLoanById(loanId);
  if (!loan) return;
  const reps = Storage.getLoanRepayments(loanId);
  const paid = paidOf(reps);
  const outstanding = outstandingOf(loan, reps);
  const instAmt = Number(loan.installmentAmount) || 0;
  const tenor = calcTenor(loan);
  const isTaken = loan.direction !== 'given';
  const verb = isTaken ? 'Bayar' : 'Terima';
  const label = loan.loanType === 'cicilan' && tenor > 1 ? `${verb} Cicilan ${Math.min(reps.length + 1, tenor)}/${tenor} — ${loan.person}` : `${verb} — ${loan.person}`;
  UI.openRepayModal(loanId, outstanding, presetAmount, label, {
    total: totalOwed(loan),
    paid,
    paidCount: reps.length,
    tenor,
    instAmt,
    direction: loan.direction
  });
}

function handleRepaySubmit() {
  const data = UI.getRepayFormData();
  const loan = Storage.getLoanById(data.loanId);
  if (!loan) return UI.showError('Pinjaman tidak ditemukan');
  if (!data.amount || data.amount <= 0) return UI.showError('Jumlah bayar harus > 0');
  if (data.date && Storage.isMonthLocked(data.date)) return UI.showError(`Bulan ${String(data.date).slice(0, 7)} terkunci — buka di Pengaturan`);

  const reps = Storage.getLoanRepayments(data.loanId);
  const paid = paidOf(reps);
  const outstanding = outstandingOf(loan, reps);
  if (data.amount > outstanding + 0.01) {
    return UI.showError(`Jumlah melebihi sisa: ${new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR'}).format(outstanding)}`);
  }

  try {
    Storage.addRepayment(data);
  } catch (err) {
    return UI.showError(err && err.message ? err.message : 'Gagal menyimpan pembayaran');
  }
  const afterPaid = paid + data.amount;
  const left = Math.max(totalOwed(loan) - afterPaid, 0);
  const tenor = calcTenor(loan);
  const doneCount = Storage.getLoanRepayments(data.loanId).length;
  const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(v);
  const verbDone = loan.direction !== 'given' ? 'Dibayar' : 'Diterima';
  UI.showSuccess(left <= 0.01
    ? `Lunas! ${loan.person} — total ${fmt(totalOwed(loan))}`
    : (tenor > 1
      ? `Cicilan ${doneCount}/${tenor} ${verbDone.toLowerCase()} ${fmt(data.amount)} — sisa ${fmt(left)}`
      : `${verbDone} ${fmt(data.amount)} — sisa ${fmt(left)}`));
  UI.closeRepayModal();
  refreshLoans();
}

function handleInvoicePrint(loanId) {
  const loan = Storage.getLoanById(loanId);
  if (!loan) return;
  const reps = Storage.getLoanRepayments(loanId);
  const paid = paidOf(reps);
  const out = outstandingOf(loan, reps);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  const sched = loan.loanType === 'cicilan' && Number(loan.installmentAmount) > 0
    ? `${fmt(loan.installmentAmount)}/bulan × ${calcTenor(loan)}`
    : 'Sekali bayar';
  const rows = reps.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) =>
    `<tr><td style="padding:6px 8px;border:1px solid #ddd">${i + 1}</td><td style="padding:6px 8px;border:1px solid #ddd">${esc(r.date)}</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${fmt(r.amount)}</td></tr>`
  ).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:12px">
      <div style="font-size:20px;font-weight:800">INVOICE / TAGIHAN</div>
      <div style="font-size:12px">${esc(loan.invoiceNo || `PINJAMAN-${String(loan.id).slice(-6).toUpperCase()}`)}</div>
    </div>
    <table style="width:100%;font-size:13px;margin-bottom:10px">
      <tr><td style="color:#555">Tagihan untuk</td><td><b>${esc(loan.person)}</b></td></tr>
      <tr><td style="color:#555">Tanggal</td><td>${esc(loan.date)}</td></tr>
      ${loan.dueDate ? `<tr><td style="color:#555">Jatuh tempo</td><td>${esc(loan.dueDate)}</td></tr>` : ''}
      <tr><td style="color:#555">Skema</td><td>${esc(sched)}${Number(loan.interestRate) > 0 ? ` • Bunga ${esc(String(loan.interestRate))}%` : ''}</td></tr>
      ${loan.description ? `<tr><td style="color:#555">Keterangan</td><td>${esc(loan.description)}</td></tr>` : ''}
    </table>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:10px">
      <tr><td style="padding:6px 8px">Total tagihan</td><td style="padding:6px 8px;text-align:right"><b>${fmt(totalOwed(loan))}</b></td></tr>
      <tr><td style="padding:6px 8px">Sudah dibayar</td><td style="padding:6px 8px;text-align:right">${fmt(paid)}</td></tr>
      <tr><td style="padding:6px 8px"><b>Sisa</b></td><td style="padding:6px 8px;text-align:right"><b>${fmt(out)}</b></td></tr>
    </table>
    ${rows ? `<div style="font-size:13px;font-weight:700;margin-bottom:4px">Riwayat pembayaran</div>
    <table style="width:100%;font-size:12px;border-collapse:collapse"><tr><th style="padding:6px 8px;border:1px solid #ddd">#</th><th style="padding:6px 8px;border:1px solid #ddd">Tanggal</th><th style="padding:6px 8px;border:1px solid #ddd">Jumlah</th></tr>${rows}</table>` : ''}
  </div>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>${esc(loan.invoiceNo || 'Invoice')}</title></head><body>${html}<script>onload=()=>{print();}<\/script></body></html>`);
  w.document.close();
}

function handleLoanDelete(loanId) {
  if (confirm('Hapus pinjaman ini beserta riwayat pembayaran?')) {
    Storage.deleteLoan(loanId);
    UI.showSuccess('Pinjaman dihapus');
    refreshLoans();
  }
}

function handleRepayDelete(repayId) {
  const rep = Storage.getRepaymentById(repayId);
  const repSnap = rep ? { ...rep } : null;
  const entrySnap = rep && rep.entryId ? { ...Storage.getEntryById(rep.entryId) } : null;
  Storage.deleteRepayment(repayId);
  refreshLoans();
  if (!repSnap) return;
  UI.showUndoToast('Pembayaran dihapus', () => {
    if (entrySnap && entrySnap.id) Storage.restoreEntry(entrySnap);
    Storage.restoreRepayment(repSnap);
    const loan = Storage.getLoanById(repSnap.loanId);
    if (loan) {
      const total = Storage.getLoanRepayments(repSnap.loanId).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      Storage.updateLoan(loan.id, { status: total >= totalOwed(loan) ? 'paid' : 'active' });
    }
    UI.showSuccess('Pembayaran dikembalikan');
    refreshLoans();
  });
}

function handleContactDelete(contactId, contactName) {
  if (confirm(`Hapus kontak "${contactName}" dari daftar? Pinjaman terkait tidak dihapus.`)) {
    Storage.deletePerson(contactId);
    UI.showSuccess('Kontak dihapus');
    UI.renderContacts(Storage.getAllPeople(), Storage.getAllLoans());
  }
}

function handleContactEdit(contactId, contactName, contactType, contactPhone) {
  UI.openContactForm(contactId, contactName, contactType, contactPhone);
}

function handleContactFormSubmit() {
  const data = UI.getContactFormData();
  if (!data.name) return UI.showError('Nama kontak wajib diisi');

  if (data.id) {
    Storage.updatePerson(data.id, data.name, data.type, data.phone);
    UI.showSuccess('Kontak diperbarui');
  } else {
    Storage.savePerson(data.name, data.type, data.phone);
    UI.showSuccess('Kontak ditambahkan');
  }
  UI.closeContactForm();
  UI.renderContacts(Storage.getAllPeople(), Storage.getAllLoans());
}

/* ===== COA ===== */
function refreshCoa() {
  try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
  UI.renderCoa(getAccounts(), balances(Storage.getAllJournals()));
}
function handleCoaSave() {
  const d = UI.getCoaFormData();
  try {
    const saved = Storage.saveCustomAccount(d);
    try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
    Storage.logAudit('create', 'account', saved.code, null, { name: saved.name });
    UI.showSuccess(`Akun ${saved.code} ${saved.name} ditambahkan`);
    UI.resetCoaForm();
    refreshCoa();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menambah akun');
  }
}
function handleCoaRename(code, name) {
  try {
    Storage.renameCustomAccount(code, name);
    UI.showSuccess('Nama akun diperbarui');
    refreshCoa();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal mengganti nama');
  }
}
function handleCoaDelete(code) {
  if (!confirm(`Hapus akun ${code}?`)) return;
  try {
    Storage.deleteCustomAccount(code, balances(Storage.getAllJournals()));
    try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
    Storage.logAudit('delete', 'account', code, null, null);
    UI.showSuccess('Akun dihapus');
    refreshCoa();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menghapus akun');
  }
}

/* ===== Stok ===== */
function refreshStock() {
  UI.renderStock(Storage.getAllItems());
  refreshSuppliers();
}
function handleStockSave() {
  const d = UI.getStockFormData();
  if (!d.name) return UI.showError('Nama barang wajib diisi');
  try {
    const prev = d.id ? Storage.getItemById(d.id) : null;
    const saved = Storage.saveItem(d);
    if (prev && saved.stock !== prev.stock) {
      const diff = saved.stock - prev.stock;
      const j = buildAdjustJournal({
        account: '1301', amount: Math.abs(diff) * Math.max(saved.cost, 0),
        date: new Date().toISOString().split('T')[0],
        memo: `Opname ${saved.name}: ${prev.stock} → ${saved.stock}`,
        increase: diff > 0
      });
      if (j) Storage.postJournal(j);
    }
    Storage.logAudit(d.id ? 'update' : 'create', 'item', saved.id, prev ? { stock: prev.stock } : null, { stock: saved.stock });
    UI.showSuccess(`Barang “${saved.name}” disimpan`);
    UI.resetStockForm();
    refreshStock();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan barang');
  }
}
function handleStockEdit(id) {
  const it = Storage.getItemById(id);
  if (it) UI.fillStockForm(it);
}
function handleStockDelete(id) {
  const it = Storage.getItemById(id);
  if (!it) return;
  if (!confirm(`Hapus barang “${it.name}”? (transaksi lama tidak ikut terhapus)`)) return;
  Storage.deleteItem(id);
  Storage.logAudit('delete', 'item', id, { name: it.name }, null);
  UI.showSuccess('Barang dihapus');
  refreshStock();
  queueMirror();
}

/* ===== Beli supplier ===== */
function refreshSuppliers() {
  UI.renderSuppliers(Storage.getAllPurchases());
}
function handleBuySave() {
  const d = UI.getBuyData();
  if (!d.supplier) return UI.showError('Tulis dulu nama supplier');
  if (!d.lines.length) return UI.showError('Pilih dulu barang + isi qty dan harga modal');
  if (Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  try {
    const p = Storage.createPurchase(d);
    const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
    UI.closeBuy();
    UI.showSuccess(`Beli ke ${p.supplier} ${fmt(p.totalCost)} — jadi hutang, stok masuk`);
    refreshStock();
    refreshSuppliers();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan pembelian');
  }
}
function handleSupplierPay(id) {
  const p = Storage.getPurchaseById(id);
  if (p) UI.openSupplierPay(p);
}
function handleSupplierPaySubmit() {
  const d = UI.getSupplierPayData();
  if (!d.id) return;
  if (Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  try {
    const p = Storage.addPurchasePayment(d.id, d);
    const out = Storage.purchaseOutstanding(p);
    UI.closeSupplierPay();
    UI.showSuccess(out <= 0.01 ? `Lunas! ${p.supplier}` : `Bayar tercatat — sisa Rp${Math.round(out).toLocaleString('id-ID')}`);
    refreshSuppliers();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan pembayaran');
  }
}
function handleSupplierDelete(id) {
  const p = Storage.getPurchaseById(id);
  if (!p) return;
  if (!confirm(`Hapus pembelian ke ${p.supplier}? Stok akan dikembalikan.`)) return;
  try {
    Storage.deletePurchase(id);
    UI.showSuccess('Pembelian dihapus, stok dikembalikan');
    refreshStock();
    refreshSuppliers();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menghapus (stok sudah terjual?)');
  }
}

/* ===== Gaji ===== */
function payrollMonthKey(d) {
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
function payrollPaidMap(monthKey) {
  const map = {};
  currentEntries.forEach(e => {
    if (e.category === 'gaji-out' && String(e.date || '').slice(0, 7) === monthKey && e.person) map[e.person] = true;
  });
  // cocokkan nama (case-insensitive) ke id karyawan
  const out = {};
  Storage.getAllEmployees().forEach(emp => {
    if (Object.keys(map).some(n => n.toLowerCase() === emp.name.toLowerCase())) out[emp.id] = true;
  });
  return out;
}
function refreshPayroll() {
  const emps = Storage.getAllEmployees();
  const now = new Date();
  const key = payrollMonthKey(now);
  const monthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const active = emps.filter(e => e.active !== false && Storage.empGross(e) > 0);
  const total = active.reduce((s, e) => s + Storage.empGross(e), 0);
  UI.renderPayrollSummary(total, active.length, monthLabel);
  UI.renderEmployees(emps, payrollPaidMap(key));
  UI.renderPayrollRun(emps, payrollPaidMap(key), key);
}
function handleEmpSave() {
  const d = UI.getEmpFormData();
  if (!d.name) return UI.showError('Nama karyawan wajib diisi');
  if (!(d.baseSalary > 0)) return UI.showError('Gaji pokok harus lebih dari 0');
  try {
    const saved = Storage.saveEmployee(d);
    Storage.logAudit(d.id ? 'update' : 'create', 'employee', saved.id, null, { name: saved.name });
    UI.showSuccess(`Karyawan “${saved.name}” disimpan`);
    UI.resetEmpForm();
    refreshPayroll();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan karyawan');
  }
}
function handleEmpEdit(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (e) UI.fillEmpForm(e);
}
function handleEmpDelete(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (!e) return;
  if (!confirm(`Hapus karyawan “${e.name}”? (gaji yang sudah dibuat tidak ikut terhapus)`)) return;
  Storage.deleteEmployee(id);
  Storage.logAudit('delete', 'employee', id, { name: e.name }, null);
  UI.showSuccess('Karyawan dihapus');
  refreshPayroll();
  queueMirror();
}
function handlePayrollRun() {
  const emps = Storage.getAllEmployees();
  if (!emps.length) return UI.showError('Belum ada karyawan');
  const now = new Date();
  const key = payrollMonthKey(now);
  const monthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const sel = UI.getPayrollRun();
  if (!sel.length) return UI.showInfo('Centang dulu karyawan yang mau diproses');
  const payment = document.getElementById('payrollPayment')?.value || 'transfer';
  const date = now.toISOString().split('T')[0];
  if (Storage.isMonthLocked(date)) return UI.showError(`Bulan ${key} terkunci — buka di Pengaturan`);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  let ok = 0, compTotal = 0;
  sel.forEach(s => {
    const e = emps.find(x => x.id === s.id);
    if (!e) return;
    try {
      const slip = computeSlip(e, { overtime: s.overtime, thr: s.withThr ? thrAmount(e, now) : 0, pph: s.withPph, refDate: now });
      const bits = [`pokok ${fmt(slip.base)}`];
      if (slip.allow > 0) bits.push(`tunj ${fmt(slip.allow)}`);
      if (slip.overtime > 0) bits.push(`lembur ${fmt(slip.overtime)}`);
      if (slip.thr > 0) bits.push(`THR ${fmt(slip.thr)}`);
      const deds = [];
      if (slip.ded.kesSelf > 0) deds.push(`BPJS Kes ${fmt(slip.ded.kesSelf)}`);
      if (slip.ded.jhtSelf > 0) deds.push(`JHT ${fmt(slip.ded.jhtSelf)}`);
      if (slip.ded.jpSelf > 0) deds.push(`JP ${fmt(slip.ded.jpSelf)}`);
      if (slip.ded.pph21 > 0) deds.push(`PPh ${fmt(slip.ded.pph21)}`);
      Storage.createEntry({
        date, type: 'expense', category: 'gaji-out', payment,
        description: `Gaji ${monthLabel} — ${e.name} (${bits.join(' + ')}${deds.length ? ` − ${deds.join(' + ')}` : ''})`,
        amount: slip.takeHome, person: e.name,
        payroll: { base: slip.base, allow: slip.allow, overtime: slip.overtime, thr: slip.thr, ded: slip.ded, comp: slip.comp, takeHome: slip.takeHome, employerCost: slip.employerCost }
      });
      compTotal += slip.totalComp;
      ok++;
    } catch {}
  });
  // Iuran perusahaan (BPJS) jadi beban + hutang BPJS
  if (compTotal > 0) {
    try {
      Storage.postJournal({
        id: `BPJS-${key}-${Date.now().toString(36)}`,
        date, memo: `Iuran BPJS perusahaan ${monthLabel}`, ref: 'payroll-bpjs', refId: key,
        lines: [
          { account: '5112', debit: Math.round(compTotal), credit: 0, memo: `BPJS ${monthLabel}` },
          { account: '2110', debit: 0, credit: Math.round(compTotal), memo: `BPJS ${monthLabel}` },
        ]
      });
    } catch {}
  }
  Storage.logAudit('create', 'payroll-run', key, null, { count: ok, month: monthLabel });
  UI.showSuccess(ok ? `Gaji ${monthLabel}: ${ok} karyawan diproses (THP)` : 'Tidak ada yang diproses');
  refreshPayroll();
  refresh();
}
function handleEmpSlip(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (!e) return;
  const now = new Date();
  const key = payrollMonthKey(now);
  const monthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const rows = currentEntries.filter(x => x.category === 'gaji-out' && String(x.date || '').slice(0, 7) === key && (x.person || '').toLowerCase() === e.name.toLowerCase());
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  const total = rows.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const who = [e.gender === 'P' ? 'Perempuan' : e.gender === 'L' ? 'Laki-laki' : '', e.role || '', e.contract || ''].filter(Boolean).join(' • ');
  const det = rows.map(x => {
    const p = x.payroll || {};
    const d = p.ded || {};
    const lines = [
      ['Gaji pokok', p.base], ['Tunjangan', p.allow], ['Lembur', p.overtime], ['THR', p.thr],
      ['BPJS Kes (1%)', d.kesSelf ? -d.kesSelf : 0], ['JHT (2%)', d.jhtSelf ? -d.jhtSelf : 0],
      ['JP (1%)', d.jpSelf ? -d.jpSelf : 0], ['PPh 21', d.pph21 ? -d.pph21 : 0],
    ].filter(([, v]) => Number(v) !== 0);
    return { date: x.date, desc: x.description, lines, thp: x.amount };
  });
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>Slip Gaji ${esc(e.name)}</title></head><body>
    <div style="font-family:Arial,sans-serif;max-width:440px;margin:0 auto">
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
        <div style="font-size:18px;font-weight:800">SLIP GAJI</div>
        <div style="font-size:12px">${esc(monthLabel)}</div>
      </div>
      <table style="width:100%;font-size:13px;margin-bottom:10px">
        <tr><td style="color:#555">Nama</td><td><b>${esc(e.name)}</b></td></tr>
        ${who ? `<tr><td style="color:#555">Detail</td><td>${esc(who)}</td></tr>` : ''}
        ${e.phone ? `<tr><td style="color:#555">HP</td><td>${esc(e.phone)}</td></tr>` : ''}
      </table>
      ${det.length ? det.map(g => `
        <div style="font-size:12px;color:#555;margin:6px 0">${esc(g.date)} — ${esc(g.desc || '')}</div>
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:8px">
          ${g.lines.map(([k, v]) => `<tr><td style="padding:4px 6px;border:1px solid #ddd">${esc(k)}</td><td style="padding:4px 6px;border:1px solid #ddd;text-align:right">${v < 0 ? '−' : ''}${fmt(Math.abs(v))}</td></tr>`).join('')}
          <tr><td style="padding:4px 6px;border:1px solid #ddd"><b>THP diterima</b></td><td style="padding:4px 6px;border:1px solid #ddd;text-align:right"><b>${fmt(g.thp)}</b></td></tr>
        </table>`).join('') : '<p style="font-size:13px">Belum ada pembayaran bulan ini.</p>'}
      <div style="font-size:13px"><b>Total diterima: ${fmt(total)}</b></div>
    </div><script>onload=()=>{print();}<\/script></body></html>`);
  w.document.close();
}

/* ===== Kas & transfer ===== */
function kasRows() {
  const bal = balances(Storage.getAllJournals());
  return ACCOUNTS.filter(a => a.payment && a.type === 'asset').map(a => ({
    code: a.code, label: a.name, icon: cashIcon(a.payment), payment: a.payment,
    balance: (bal[a.code]?.debit || 0) - (bal[a.code]?.credit || 0)
  }));
}
function cashIcon(payment) {
  return { cash: '💵', transfer: '🏦', qris: '📱', ewallet: '📲', debit: '💳', other: '📦' }[payment] || '💰';
}
function refreshKas() {
  UI.renderKas(kasRows());
}
function handleTransfer() {
  const d = UI.getTransferFormData();
  if (!d.amount || d.amount <= 0) return UI.showError('Nominal transfer harus lebih dari 0');
  if (d.from === d.to) return UI.showError('Kas asal dan tujuan harus beda');
  if (d.date && Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  try {
    const j = buildTransferJournal({ fromPayment: d.from, toPayment: d.to, amount: d.amount, date: d.date, memo: 'Transfer antar kas' });
    if (!j) throw new Error('Transfer tidak valid');
    Storage.postJournal(j);
    Storage.logAudit('create', 'transfer', j.id, null, { from: d.from, to: d.to, amount: d.amount });
    UI.showSuccess('Transfer tercatat');
    document.getElementById('transferForm')?.reset();
    const td = document.getElementById('transferDate');
    if (td) td.value = new Date().toISOString().split('T')[0];
    refreshKas();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal transfer');
  }
}
function handleRecon() {
  const d = UI.getReconFormData();
  const rows = kasRows();
  const row = rows.find(r => r.payment === d.payment);
  if (!row) return UI.showError('Kas tidak ditemukan');
  const diff = Math.round(d.actual) - Math.round(row.balance);
  const box = document.getElementById('reconResult');
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  if (diff === 0) {
    if (box) box.innerHTML = `✅ <b>Cocok!</b> Catatan ${fmt(row.balance)} = fisik ${fmt(d.actual)}.`;
    return;
  }
  try {
    const j = buildAdjustJournal({
      account: row.code, amount: Math.abs(diff),
      date: new Date().toISOString().split('T')[0],
      memo: `Selisih kas ${row.label}: catat ${fmt(row.balance)}, fisik ${fmt(d.actual)}`,
      increase: diff > 0
    });
    if (j) Storage.postJournal(j);
    Storage.logAudit('create', 'recon', j ? j.id : '', null, { account: row.code, diff });
    if (box) box.innerHTML = `⚠️ Selisih <b>${fmt(diff)}</b> dicatat sebagai penyesuaian. Saldo kini ${fmt(d.actual)}.`;
    UI.showSuccess('Selisih dicatat');
    document.getElementById('reconForm')?.reset();
    refreshKas();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal rekonsiliasi');
  }
}

/* ===== Import mutasi bank ===== */
function parseIDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}
function parseIAmount(s) {
  s = String(s || '').trim();
  if (!s) return 0;
  // "1.234.567,89" → 1234567.89 ; "1,234.56" → 1234.56 ; "1.234" → 1234
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let norm = s.replace(/[^0-9,.-]/g, '');
  if (lastComma > lastDot) norm = norm.replace(/\./g, '').replace(',', '.');
  else norm = norm.replace(/,/g, '');
  const n = Number(norm);
  return isFinite(n) ? Math.round(n) : 0;
}
function handleBankFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = String(e.target.result || '').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('File kosong');
      const head0 = lines.find(l => /tanggal|date/i.test(l)) || lines[0];
      const delim = ((head0.match(/;/g) || []).length > (head0.match(/,/g) || []).length) ? ';' : ',';
      const split = (l) => Storage.parseCsvRow(l, delim);
      // cari baris header
      let hi = 0;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const low = lines[i].toLowerCase();
        if (/tanggal|date/.test(low) && /keterangan|description|uraian|mutasi|debit|kredit|credit|jumlah|amount/.test(low)) { hi = i; break; }
      }
      const head = split(lines[hi]).map(h => h.toLowerCase());
      const col = (names) => head.findIndex(h => names.some(n => h.includes(n)));
      const iDate = col(['tanggal', 'date']);
      const iDesc = col(['keterangan', 'description', 'uraian', 'narasi']);
      let iDebit = col(['debit', 'keluar', 'out', 'pengeluaran']);
      let iCredit = col(['kredit', 'credit', 'masuk', 'pemasukan', 'in ']);
      let iMut = col(['mutasi', 'amount', 'jumlah', 'nominal']);
      if (iDate < 0) throw new Error('Kolom tanggal tidak ketemu');
      const rows = [];
      for (let i = hi + 1; i < lines.length; i++) {
        if (/^===/.test(lines[i])) break;
        const c = split(lines[i]);
        const date = parseIDate(c[iDate]);
        if (!date) continue;
        const desc = iDesc >= 0 ? (c[iDesc] || '') : '';
        let masuk = 0, keluar = 0;
        if (iDebit >= 0 || iCredit >= 0) {
          keluar = iDebit >= 0 ? parseIAmount(c[iDebit]) : 0;
          masuk = iCredit >= 0 ? parseIAmount(c[iCredit]) : 0;
        } else if (iMut >= 0) {
          const v = parseIAmount(c[iMut]);
          if (v >= 0) masuk = v; else keluar = -v;
        } else continue;
        if (masuk <= 0 && keluar <= 0) continue;
        rows.push({ key: `${date}|${desc}|${masuk}|${keluar}|${i}`, date, desc: desc.slice(0, 100), in: masuk, out: keluar, selected: true, matched: false });
      }
      if (!rows.length) throw new Error('Tidak ada baris mutasi terbaca');
      // cocokkan dengan transaksi ada (nominal sama + tanggal ±3 hari + arah sama)
      const existing = currentEntries;
      rows.forEach(r => {
        const amt = r.in > 0 ? r.in : r.out;
        const type = r.in > 0 ? 'income' : 'expense';
        const d = new Date(r.date);
        r.matched = existing.some(e => {
          if (e.type !== type) return false;
          if (Math.round(Number(e.amount) || 0) !== amt) return false;
          const ed = new Date(e.date);
          if (isNaN(ed)) return false;
          return Math.abs((ed - d) / 86400000) <= 3;
        });
        if (r.matched) r.selected = false;
      });
      UI.setBankRows(rows);
      const fresh = rows.filter(r => !r.matched).length;
      UI.showInfo(`${rows.length} baris terbaca, ${fresh} baru`);
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal membaca CSV');
    }
  };
  reader.onerror = () => UI.showError('Gagal membaca file');
  reader.readAsText(file);
}
function handleBankImport() {
  const rows = UI.getBankSelected();
  if (!rows.length) return UI.showInfo('Tidak ada baris terpilih');
  const payment = document.getElementById('bankAccount')?.value || 'transfer';
  let ok = 0, locked = 0;
  rows.forEach(r => {
    if (Storage.isMonthLocked(r.date)) { locked++; return; }
    try {
      Storage.createEntry({
        date: r.date, type: r.in > 0 ? 'income' : 'expense',
        category: 'lainnya', payment, description: r.desc || 'Mutasi bank',
        amount: r.in > 0 ? r.in : r.out
      });
      ok++;
    } catch {}
  });
  UI.showSuccess(`${ok} mutasi diimport${locked ? ` (${locked} bulan terkunci dilewati)` : ''}`);
  UI.setBankRows([]);
  refresh();
}

/* ===== Penjualan ===== */
function handleSaleSave() {
  const d = UI.getSaleData();
  if (!d.lines.length) return UI.showError('Pilih dulu barang + isi qty dan harga');
  if (!d.date) return UI.showError('Tanggal wajib diisi');
  if (Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  // Cek stok dulu biar pesan jelas sekaligus
  const items = Storage.getAllItems();
  for (const l of d.lines) {
    const it = items.find(x => x.id === l.itemId);
    if (!it) return UI.showError('Ada barang yang tidak dikenal — pilih ulang');
    if (l.qty > it.stock) return UI.showError(`Stok ${it.name} kurang (sisa ${it.stock}, mau ${l.qty})`);
  }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const desc = d.note || `Jual: ${d.lines.map(l => `${l.qty}× ${l.name}`).join(', ')}`;
  try {
    const entry = Storage.createEntry({
      date: d.date, type: 'income', category: 'jualan', payment: d.payment,
      description: desc.slice(0, 120), amount: d.total,
      person: d.customer, ppn: d.ppn,
      sale: { lines: d.lines.map(l => ({ itemId: l.itemId, qty: l.qty, price: l.price })), total: d.total }
    });
    Storage.logAudit('create', 'sale', entry.id, null, { total: d.total, lines: d.lines.length });
    UI.closeSale();
    UI.showSuccess(`Penjualan ${fmt(d.total)} tersimpan — stok berkurang`);
    UI.openReceipt(entry);
    refresh();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan penjualan');
  }
}

/* ===== Halaman Karyawan & Gaji ===== */
let payrollViewMonth = '';
let payrollEmpSearch = '';
let payrollCache = {}; // empId -> {overtime, withThr, withPph, checked}
let payrollRates = {}; // tarif iuran bulan ini ({kesComp,...} pecahan) — default BPJS bila kosong

function payrollMonthEnd(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) { const n = new Date(); return n; }
  return new Date(y, m, 0);
}
function payrollMonthLabel(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}
function ensurePayrollMonth() {
  if (!/^\d{4}-\d{2}$/.test(payrollViewMonth)) {
    const n = new Date();
    payrollViewMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }
  const per = document.getElementById('payrollPeriod');
  if (per && !per.value) per.value = payrollViewMonth;
  if (per && per.value !== payrollViewMonth && document.activeElement !== per) per.value = payrollViewMonth;
}
function loadPayrollCache() {
  ensurePayrollMonth();
  const draft = Storage.getPayrollDraft(payrollViewMonth) || {};
  const saved = draft.items || {};
  payrollRates = sanitizeRates(draft.rates && Object.keys(draft.rates).length ? draft.rates : {});
  payrollCache = {};
  Storage.getAllEmployees().forEach(e => {
    const s = saved[e.id] || {};
    payrollCache[e.id] = {
      overtime: Math.max(Number(s.overtime) || 0, 0),
      bonus: Math.max(Number(s.bonus) || 0, 0),
      deduct: Math.max(Number(s.deduct) || 0, 0),
      hadir: Number(s.hadir) > 0 ? Number(s.hadir) : 0,
      withThr: !!s.withThr,
      withPph: s.withPph === undefined ? true : !!s.withPph,
      checked: s.checked === undefined ? true : !!s.checked,
      pphOverride: Number.isFinite(Number(s.pphOverride)) && Number(s.pphOverride) >= 0 ? Math.round(Number(s.pphOverride)) : null
    };
  });
}
function payRowsForView() {
  ensurePayrollMonth();
  const ref = payrollMonthEnd(payrollViewMonth);
  const paid = payrollPaidMap(payrollViewMonth);
  return Storage.getAllEmployees()
    .filter(e => e.active !== false && Storage.empGross(e) > 0)
    .map(emp => {
      const c = payrollCache[emp.id] || { overtime: 0, bonus: 0, deduct: 0, withThr: false, withPph: true, checked: true };
      const slip = computeSlip(emp, { overtime: c.overtime, bonus: c.bonus, deduct: c.deduct, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
      const thrNote = c.withThr && slip.thr <= 0 ? 'Masa kerja belum 1 bulan — THR Rp0. Jangan centang bila belum waktunya.' : '';
      return { emp, slip, checked: !!c.checked, paid: !!paid[emp.id], overtime: c.overtime, hadir: c.hadir || 0, withThr: !!c.withThr, withPph: !!c.withPph, thrNote };
    });
}
function renderPayrollView() {
  ensurePayrollMonth();
  const tab = UI.getPayrollTab();
  if (tab === 'data') {
    UI.renderEmpTable(Storage.getAllEmployees(), payrollEmpSearch);
  } else if (tab === 'process') {
    const draft = Storage.getPayrollDraft(payrollViewMonth);
    UI.renderPayrollProcess(payRowsForView(), payrollMonthLabel(payrollViewMonth), draft ? draft.status : 'new');
    renderDecPanel(draft ? draft.status : 'new');
  } else {
    const box = document.getElementById('payrollViewReport');
    if (box) {
      const d = buildPayrollReport();
      box.innerHTML = payrollReportHTML(d);
      window.__payrollRepData = d;
    }
  }
}
function payrollReportHTML(d) {
  // Render ulang via fungsi laporan (simpan sementara ke container laporan)
  const host = document.getElementById('reportContent');
  const prev = host ? host.innerHTML : '';
  const prevData = window.__payrollRepData;
  window.__payrollRepData = d;
  UI.renderReport('payrollrep', d);
  const html = host ? host.innerHTML : '';
  if (host) host.innerHTML = prev;
  window.__payrollRepData = prevData;
  return html;
}

/* ===== Handler halaman gaji ===== */function handlePayrollTab(tab) {
  UI.setPayrollTab(tab);
  renderPayrollView();
}
function handleEmpViewSave() {
  const d = UI.getEmpPanelData();
  if (!d.name) return UI.showError('Nama karyawan wajib diisi');
  if (!(d.baseSalary > 0)) return UI.showError('Gaji pokok harus lebih dari 0');
  try {
    const saved = d.id
      ? Storage.saveEmployee({ ...d, id: d.id })
      : Storage.saveEmployee(d);
    Storage.logAudit(d.id ? 'update' : 'create', 'employee', saved.id, null, { name: saved.name });
    UI.showSuccess(d.id ? 'Perubahan karyawan disimpan' : `Karyawan "${saved.name}" ditambahkan`);
    UI.closeEmpModal();
    loadPayrollCache();
    renderPayrollView();
    refresh();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan karyawan');
  }
}
function handleEmpViewEdit(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (e) UI.openEmpModal(e);
}
function handleEmpImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = String(e.target.result || '').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('File kosong');
      const head0 = lines.find(l => /nama|name/i.test(l)) || lines[0];
      const delim = ((head0.match(/;/g) || []).length > (head0.match(/,/g) || []).length) ? ';' : ',';
      const split = (l) => Storage.parseCsvRow(l, delim);
      let hi = 0;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (/nama|name/i.test(lines[i])) { hi = i; break; }
      }
      const head = split(lines[hi]).map(h => h.toLowerCase());
      const col = (names) => head.findIndex(h => names.some(n => h.includes(n)));
      const iName = col(['nama', 'name']);
      if (iName < 0) throw new Error('Kolom nama tidak ketemu');
      const iRole = col(['jabatan', 'role', 'posisi', 'position']);
      const iContract = col(['status_kerja', 'status kerja', 'contract', 'status']);
      const iBase = col(['gaji_pokok', 'gaji pokok', 'gaji', 'base', 'pokok']);
      const iAllow = col(['tunjangan', 'allowance', 'tunj']);
      const iPhone = col(['hp', 'telepon', 'phone', 'no']);
      const iEmail = col(['email', 'mail']);
      const iStart = col(['bergabung', 'mulai', 'start', 'join', 'masuk']);
      const iPtkp = col(['ptkp']);
      const iNpwp = col(['npwp']);
      const iGender = col(['kelamin', 'gender', 'jk']);
      const iAddr = col(['alamat', 'address']);
      const iBank = col(['bank']);
      const iAcc = col(['rekening', 'norek', 'account']);
      const num = (v) => Math.round(Number(String(v || '').replace(/[^0-9]/g, '')) || 0);
      const existing = new Set(Storage.getAllEmployees().map(x => x.name.toLowerCase()));
      let ok = 0, skipped = 0;
      for (let i = hi + 1; i < lines.length; i++) {
        if (/^===/.test(lines[i])) break;
        const c = split(lines[i]);
        const name = (c[iName] || '').trim();
        if (!name) { skipped++; continue; }
        if (existing.has(name.toLowerCase())) { skipped++; continue; }
        const contractRaw = (iContract >= 0 ? c[iContract] : '').toLowerCase();
        const contract = contractRaw.includes('harian') ? 'harian' : contractRaw.includes('kontrak') ? 'kontrak' : 'tetap';
        const genderRaw = (iGender >= 0 ? c[iGender] : '').toUpperCase();
        const gender = genderRaw.startsWith('P') ? 'P' : genderRaw.startsWith('L') ? 'L' : '';
        const startRaw = (iStart >= 0 ? c[iStart] : '').trim();
        const start = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : '';
        try {
          Storage.saveEmployee({
            name,
            role: iRole >= 0 ? c[iRole] : '',
            contract,
            baseSalary: iBase >= 0 ? num(c[iBase]) : 0,
            allowance: iAllow >= 0 ? num(c[iAllow]) : 0,
            phone: iPhone >= 0 ? c[iPhone] : '',
            email: iEmail >= 0 ? c[iEmail] : '',
            startDate: start,
            ptkp: iPtkp >= 0 ? c[iPtkp] : 'TK/0',
            npwp: iNpwp >= 0 ? String(c[iNpwp] || '').replace(/[^0-9]/g, '') : '',
            gender,
            address: iAddr >= 0 ? c[iAddr] : '',
            bankName: iBank >= 0 ? c[iBank] : '',
            bankAcc: iAcc >= 0 ? c[iAcc] : ''
          });
          existing.add(name.toLowerCase());
          ok++;
        } catch { skipped++; }
      }
      UI.showSuccess(`Impor selesai: ${ok} ditambahkan${skipped ? `, ${skipped} dilewati` : ''}`);
      loadPayrollCache();
      renderPayrollView();
      refresh();
      queueMirror();
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal membaca file');
    }
  };
  reader.onerror = () => UI.showError('Gagal membaca file');
  reader.readAsText(file);
}
function handlePayrollPeriod(val) {
  if (/^\d{4}-\d{2}$/.test(val || '')) {
    payrollViewMonth = val;
    loadPayrollCache();
    renderPayrollView();
  }
}
function handlePayrollCheck(id, checked) {
  if (payrollCache[id]) payrollCache[id].checked = !!checked;
  renderPayrollView();
}
function handlePayrollCheckAll(checked) {
  Object.keys(payrollCache).forEach(k => { payrollCache[k].checked = !!checked; });
  renderPayrollView();
}
function handlePayrollExpand(id) {
  UI.setPayrollExpanded(id);
  renderPayrollView();
}
function handlePayrollDetailChange() {
  // baca status checkbox THR/PPh dari DOM ke cache lalu render ulang
  document.querySelectorAll('#payrollTableBody .pay-thr').forEach(el => {
    const id = el.dataset.id;
    if (payrollCache[id]) payrollCache[id].withThr = el.checked;
  });
  document.querySelectorAll('#payrollTableBody .pay-pph').forEach(el => {
    const id = el.dataset.id;
    if (payrollCache[id]) payrollCache[id].withPph = el.checked;
  });
  renderPayrollView();
}
function handlePayrollLembur(input) {
  const empId = input.dataset.id;
  if (empId && payrollCache[empId]) {
    const v = Math.max(Number(UI.parseIdrInput(input.value)) || 0, 0);
    if (input.classList.contains('pay-bonus')) payrollCache[empId].bonus = v;
    else if (input.classList.contains('pay-denda')) payrollCache[empId].deduct = v;
    else payrollCache[empId].overtime = v;
  }
  // Patch sel tanpa render ulang (jaga fokus ketik)
  patchPayrollRow(empId);
}
function handlePayrollHadir(input) {
  const empId = input.dataset.id;
  if (!empId || !payrollCache[empId]) return;
  const n = Math.max(0, Math.min(Number(input.value) || 0, 31));
  payrollCache[empId].hadir = n;
  const std = 22;
  if (n > 0 && n < std && !(payrollCache[empId].deduct > 0)) {
    const suggest = (std - n) * 100000;
    payrollCache[empId].deduct = suggest;
    const dendaInput = document.querySelector(`#payrollTableBody .pay-denda[data-id="${empId}"]`);
    if (dendaInput) dendaInput.value = String(suggest);
    UI.showInfo(`Hadir ${n} hari — denda disarankan Rp${suggest.toLocaleString('id-ID')} (${std - n} × Rp100rb). Ubah bebas di kolom Denda.`);
  }
  patchPayrollRow(empId);
}
function patchPayrollRow(empId) {
  const c = payrollCache[empId];
  const emp = Storage.getAllEmployees().find(x => x.id === empId);
  if (!c || !emp) return;
  const ref = payrollMonthEnd(payrollViewMonth);
  const s = computeSlip(emp, { overtime: c.overtime, bonus: c.bonus, deduct: c.deduct, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  document.querySelectorAll('#payrollTableBody tr').forEach(tr => {
    const chk = tr.querySelector('.pay-check');
    if (chk && chk.dataset.id === empId) {
      const tds = tr.querySelectorAll('td');
      if (tds[3]) tds[3].textContent = fmt(s.allow + s.overtime + s.bonus + s.thr);
      if (tds[4]) tds[4].textContent = fmt(s.totalDed + s.deduct);
      if (tds[5]) tds[5].innerHTML = `<b>${fmt(s.takeHome)}</b>`;
    }
  });
  // total footer
  let total = 0;
  Object.keys(payrollCache).forEach(k => {
    const cc = payrollCache[k];
    const em = Storage.getAllEmployees().find(x => x.id === k);
    if (!em || !cc.checked) return;
    const ss = computeSlip(em, { overtime: cc.overtime, bonus: cc.bonus, deduct: cc.deduct, thr: cc.withThr ? thrAmount(em, ref) : 0, pph: cc.withPph, refDate: ref, rates: payrollRates, pphOverride: cc.pphOverride ?? null });
    total += ss.takeHome;
  });
  const foot = document.getElementById('payrollFootTotal');
  if (foot) foot.textContent = fmt(total);
}
function prevMonthKey(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function handlePayrollRateChange(input) {
  const key = input.dataset.rate;
  if (!key) return;
  const draft = Storage.getPayrollDraft(payrollViewMonth);
  if (draft && draft.status === 'final') { renderPayrollView(); return; }
  const raw = String(input.value || '').replace(',', '.').trim();
  let v = Number(raw);
  if (!Number.isFinite(v) || v < 0) v = 0;
  if (v > 100) v = 100;
  const limit = (RATE_LIMITS[key] ?? 1) * 100;
  if (v > limit) {
    UI.showError(`Tarif ${input.getAttribute('aria-label') || key} maksimal ${limit.toLocaleString('id-ID')}% — ketik angka persen seperti 0,54 (bukan 54)`);
    renderPayrollView();
    return;
  }
  payrollRates = { ...payrollRates, [key]: v / 100 };
  const items = {};
  Object.keys(payrollCache).forEach(k => { items[k] = { ...payrollCache[k] }; });
  syncPayrollInputsFromDOM(items);
  try { Storage.savePayrollDraft(payrollViewMonth, { items, rates: payrollRates, status: draft ? draft.status : 'draft' }); } catch {}
  renderPayrollView();
  queueMirror();
}
function handlePayrollPrintSlip(empId) {
  const emp = Storage.getAllEmployees().find(x => x.id === empId);
  const c = payrollCache[empId];
  if (!emp || !c) return;
  const ref = payrollMonthEnd(payrollViewMonth);
  const slip = computeSlip(emp, { overtime: c.overtime, bonus: c.bonus, deduct: c.deduct, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates });
  const label = payrollMonthLabel(payrollViewMonth);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
  const R = slip.rates || {};
  const pct = (v) => ((Number(v) || 0) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
  const trow = (label_, amt, cls) => (amt > 0 ? `<tr><td>${label_}</td><td class="r ${cls || ''}">${fmt(amt)}</td></tr>` : '');
  const win = window.open('', '_blank', 'width=760,height=900');
  if (!win) return UI.showError('Popup diblokir browser — izinkan popup lalu coba lagi');
  win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Slip Gaji ${escapeHtml(emp.name)} — ${escapeHtml(label)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#0f172a;font-size:13px}
    h1{font-size:17px;margin:0} .sub{color:#64748b;font-size:11px;margin:2px 0 16px}
    .box{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px}
    .kv{display:grid;grid-template-columns:120px 1fr;gap:4px 12px;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:12px} td{padding:5px 0;border-bottom:1px dashed #e2e8f0}
    td.r{text-align:right;white-space:nowrap;font-weight:700} td.neg{color:#b91c1c} tr.sum td{border-top:2px solid #0f172a;border-bottom:none;font-weight:800}
    .big{font-size:20px;font-weight:800;color:#059669} .foot{margin-top:20px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
    .muted{color:#64748b;font-size:10px} h2{font-size:12px;margin:0 0 6px;color:#334155}
    @media print{ body{margin:12px} }
  </style></head><body>
    <h1>Slip Gaji — ${escapeHtml(label)}</h1>
    <div class="sub">Cetakan di-${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="box"><div class="kv">
      <b>Karyawan</b><span>${escapeHtml(emp.name)}${emp.role ? ' — ' + escapeHtml(emp.role) : ''}</span>
      <b>Status PTKP</b><span>${escapeHtml(emp.ptkp || 'TK/0')}${emp.npwp ? ` • NPWP ${escapeHtml(emp.npwp)}` : ' • tanpa NPWP (+20%)'}</span>
      <b>Masa kerja</b><span>${slip.tenureMonths} bulan</span>
    </div></div>
    <div class="box"><h2>Pendapatan</h2><table>
      ${trow('Gaji pokok', slip.base)}${trow('Tunjangan tetap', slip.allow)}${trow('Lembur', slip.overtime)}
      ${trow('Bonus/insentif', slip.bonus)}${trow('THR Keagamaan', slip.thr)}
      <tr class="sum"><td>Bruto</td><td class="r">${fmt(slip.gross + slip.thr)}</td></tr>
    </table></div>
    <div class="box"><h2>Potongan</h2><table>
      ${trow(`BPJS Kesehatan pekerja (${pct(R.kesSelf)})`, slip.ded.kesSelf, 'neg')}
      ${trow(`JHT pekerja (${pct(R.jhtSelf)})`, slip.ded.jhtSelf, 'neg')}
      ${trow(`JP pekerja (${pct(R.jpSelf)})`, slip.ded.jpSelf, 'neg')}
      ${trow(`PPh 21 TER × netto ${fmt(slip.pphNetto)}`, slip.ded.pph21, 'neg')}
      ${trow('Denda/absensi', slip.deduct, 'neg')}
      <tr class="sum"><td>Total potongan</td><td class="r neg">${fmt(slip.totalDed + slip.deduct)}</td></tr>
    </table></div>
    <div class="box" style="text-align:center">Diterima karyawan (take-home pay)<br><span class="big">${fmt(slip.takeHome)}</span></div>
    <div class="box"><h2>Ditanggung perusahaan (tidak dikurangkan)</h2><div class="muted" style="margin-bottom:6px">Total ${fmt(slip.totalComp)}</div><table>
      ${trow(`BPJS Kesehatan (${pct(R.kesComp)})`, slip.comp.kesComp)}
      ${trow(`JHT (${pct(R.jhtComp)})`, slip.comp.jhtComp)}
      ${trow(`JP (${pct(R.jpComp)})`, slip.comp.jpComp)}
      ${trow(`JKK kecelakaan kerja (${pct(R.jkk)})`, slip.comp.jkk)}
      ${trow(`JKM kematian (${pct(R.jkm)})`, slip.comp.jkm)}
    </table></div>
    <div class="foot"><span>Slip ini dibuat otomatis oleh Wynara Accounting</span><span>Tanda tangan pemberi kerja: ______________</span></div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 400);
}
function handlePayrollSlipWa(empId) {
  const emp = Storage.getAllEmployees().find(x => x.id === empId);
  const c = payrollCache[empId];
  if (!emp || !c) return;
  let phone = String(emp.phone || '').replace(/[^0-9]/g, '');
  if (!phone || phone.length < 8) return UI.showError(`No. HP ${emp.name} kosong/tidak valid — isi di Data Karyawan agar slip bisa dikirim`);
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  const ref = payrollMonthEnd(payrollViewMonth);
  const slip = computeSlip(emp, { overtime: c.overtime, bonus: c.bonus, deduct: c.deduct, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates });
  const label = payrollMonthLabel(payrollViewMonth);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const lines = [
    `*Slip Gaji ${label}*`,
    `${emp.name}${emp.role ? ' — ' + emp.role : ''}`,
    '',
    `Bruto: ${fmt(slip.gross + slip.thr)}${slip.thr > 0 ? ` (termasuk THR ${fmt(slip.thr)})` : ''}`,
    slip.ded.kesSelf > 0 ? `BPJS Anda: −${fmt(slip.ded.kesSelf + slip.ded.jhtSelf + slip.ded.jpSelf)}` : '',
    slip.ded.pph21 > 0 ? `PPh 21: −${fmt(slip.ded.pph21)}` : '',
    slip.deduct > 0 ? `Denda: −${fmt(slip.deduct)}` : '',
    '',
    `*Diterima: ${fmt(slip.takeHome)}*`,
    '',
    'Dibayar perusahaan (BTW): BPJS Kes, JHT/JP, JKK & JKM.'
  ].filter(l => l !== '').join('\n');
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`;
  window.open(url, '_blank');
  UI.showSuccess('WhatsApp terbuka — teks slip sudah terisi, tinggal tekan kirim');
}
function handlePayrollCopyPrev() {
  ensurePayrollMonth();
  const prev = Storage.getPayrollDraft(prevMonthKey(payrollViewMonth));
  const items = (prev && prev.items) || {};
  if (!Object.keys(items).length) {
    UI.showInfo(`Belum ada draft ${payrollMonthLabel(prevMonthKey(payrollViewMonth))} untuk disalin`);
    return;
  }
  Storage.getAllEmployees().forEach(e => {
    const s = items[e.id] || {};
    payrollCache[e.id] = {
      overtime: Math.max(Number(s.overtime) || 0, 0),
      bonus: Math.max(Number(s.bonus) || 0, 0),
      deduct: Math.max(Number(s.deduct) || 0, 0),
      hadir: Number(s.hadir) > 0 ? Number(s.hadir) : 0,
      withThr: !!s.withThr,
      withPph: s.withPph === undefined ? true : !!s.withPph,
      checked: s.checked === undefined ? true : !!s.checked,
      pphOverride: Number.isFinite(Number(s.pphOverride)) && Number(s.pphOverride) >= 0 ? Math.round(Number(s.pphOverride)) : null
    };
  });
  try { Storage.savePayrollDraft(payrollViewMonth, { items: JSON.parse(JSON.stringify(payrollCache)), rates: payrollRates, status: 'draft' }); } catch {}
  UI.showSuccess('Disalin dari bulan lalu — cukup ubah lembur/bonus/potongan bila beda');
  renderPayrollView();
  queueMirror();
}
function syncPayrollInputsFromDOM(target) {
  // Sinkron lembur/bonus/denda/hadir dari DOM (bila sedang diketik)
  const store = target || payrollCache;
  document.querySelectorAll('#payrollTableBody .pay-lembur, #payrollTableBody .pay-bonus, #payrollTableBody .pay-denda, #payrollTableBody .pay-hadir').forEach(el => {
    const id = el.dataset.id;
    if (!store[id]) return;
    if (el.classList.contains('pay-bonus')) store[id].bonus = Math.max(Number(UI.parseIdrInput(el.value)) || 0, 0);
    else if (el.classList.contains('pay-denda')) store[id].deduct = Math.max(Number(UI.parseIdrInput(el.value)) || 0, 0);
    else if (el.classList.contains('pay-hadir')) store[id].hadir = Math.max(0, Math.min(Number(el.value) || 0, 31));
    else store[id].overtime = Math.max(Number(UI.parseIdrInput(el.value)) || 0, 0);
  });
}
function handlePayrollDraft() {
  ensurePayrollMonth();
  const items = {};
  Object.keys(payrollCache).forEach(k => { items[k] = { ...payrollCache[k] }; });
  syncPayrollInputsFromDOM(items);
  try {
    Storage.savePayrollDraft(payrollViewMonth, { items, rates: payrollRates, status: 'draft' });
    loadPayrollCache();
    UI.showSuccess(`Draft ${payrollMonthLabel(payrollViewMonth)} disimpan`);
    renderPayrollView();
    queueMirror();
  } catch (err) {
    UI.showError('Gagal menyimpan draft');
  }
}
function handlePayrollFinal() {
  ensurePayrollMonth();
  if (Storage.isMonthLocked(payrollViewMonth + '-01')) return UI.showError(`Bulan ${payrollViewMonth} terkunci — buka di Pengaturan`);
  syncPayrollInputsFromDOM();
  const emps = Storage.getAllEmployees();
  const paid = payrollPaidMap(payrollViewMonth);
  const ref = payrollMonthEnd(payrollViewMonth);
  const [y, m] = payrollViewMonth.split('-').map(Number);
  const date = `${payrollViewMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const payment = document.getElementById('payrollViewPayment')?.value || 'transfer';
  const monthLabel = payrollMonthLabel(payrollViewMonth);
  const todo = Object.keys(payrollCache).filter(k => payrollCache[k].checked && !paid[k]);
  if (!todo.length) return UI.showInfo('Tidak ada yang perlu diproses (sudah dibayar / belum dicentang)');
  if (!confirm(`Finalisasi gaji ${monthLabel} untuk ${todo.length} karyawan? Transaksi dicatat dan bulan ditandai final.`)) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  let ok = 0, compTotal = 0;
  todo.forEach(k => {
    const e = emps.find(x => x.id === k);
    if (!e) return;
    const c = payrollCache[k];
    try {
      const slip = computeSlip(e, { overtime: c.overtime, bonus: c.bonus, deduct: c.deduct, thr: c.withThr ? thrAmount(e, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
      const bits = [`pokok ${fmt(slip.base)}`];
      if (slip.allow > 0) bits.push(`tunj ${fmt(slip.allow)}`);
      if (slip.overtime > 0) bits.push(`lembur ${fmt(slip.overtime)}`);
      if (slip.bonus > 0) bits.push(`bonus ${fmt(slip.bonus)}`);
      if (slip.thr > 0) bits.push(`THR ${fmt(slip.thr)}`);
      const deds = [];
      if (slip.ded.kesSelf > 0) deds.push(`BPJS Kes ${fmt(slip.ded.kesSelf)}`);
      if (slip.ded.jhtSelf > 0) deds.push(`JHT ${fmt(slip.ded.jhtSelf)}`);
      if (slip.ded.jpSelf > 0) deds.push(`JP ${fmt(slip.ded.jpSelf)}`);
      if (slip.ded.pph21 > 0) deds.push(`PPh ${fmt(slip.ded.pph21)}`);
      if (slip.deduct > 0) deds.push(`denda ${fmt(slip.deduct)}`);
      Storage.createEntry({
        date, type: 'expense', category: 'gaji-out', payment,
        description: `Gaji ${monthLabel} — ${e.name} (${bits.join(' + ')}${deds.length ? ` − ${deds.join(' + ')}` : ''})${slip.pphOverridden ? ' (PPh rekonsiliasi Des)' : ''}`,
        amount: slip.takeHome, person: e.name,
        payroll: { base: slip.base, allow: slip.allow, overtime: slip.overtime, bonus: slip.bonus, deduct: slip.deduct, hadir: c.hadir || null, thr: slip.thr, ded: slip.ded, comp: slip.comp, takeHome: slip.takeHome, employerCost: slip.employerCost, pphNetto: slip.pphNetto, npwp: !!e.npwp, recon: slip.pphOverridden === true }
      });
      compTotal += slip.totalComp;
      ok++;
    } catch {}
  });
  if (compTotal > 0) {
    try {
      Storage.postJournal({
        id: `BPJS-${payrollViewMonth}-${Date.now().toString(36)}`,
        date, memo: `Iuran BPJS perusahaan ${monthLabel}`, ref: 'payroll-bpjs', refId: payrollViewMonth,
        lines: [
          { account: '5112', debit: Math.round(compTotal), credit: 0, memo: `BPJS ${monthLabel}` },
          { account: '2110', debit: 0, credit: Math.round(compTotal), memo: `BPJS ${monthLabel}` },
        ]
      });
    } catch {}
  }
  Storage.logAudit('create', 'payroll-run', payrollViewMonth, null, { count: ok, month: monthLabel });
  try { Storage.markPayrollFinal(payrollViewMonth); } catch {}
  UI.showSuccess(ok ? `Gaji ${monthLabel} final: ${ok} karyawan` : 'Tidak ada yang diproses');
  loadPayrollCache();
  renderPayrollView();
  refresh();
}

/* ===== Rekonsiliasi PPh 21 Desember (PMK 168/2023: TER = estimasi bulanan,
   Desember = hitung tahunan − potongan Jan–Nov). Tarif tahunan: UU 36/2008
   jo. UU HPP 7/2021 — minta konsultan konfirmasi sebelum filing. ===== */
function buildDecRecon() {
  const [y, m] = String(payrollViewMonth || '').split('-').map(Number);
  if (!y || m !== 12) return null;
  const year = String(y);
  const byPerson = {};
  try {
    Storage.getAllEntries().forEach(e => {
      if (e.category !== 'gaji-out' || !String(e.date || '').startsWith(year + '-')) return;
      const key = String(e.person || '').trim().toLowerCase();
      if (!key) return;
      const p = e.payroll || {};
      const d = p.ded || {};
      (byPerson[key] = byPerson[key] || []).push({
        month: String(e.date).slice(0, 7),
        gross: (Number(p.base) || 0) + (Number(p.allow) || 0) + (Number(p.overtime) || 0) + (Number(p.bonus) || 0),
        thr: Number(p.thr) || 0,
        jhtSelf: Number(d.jhtSelf) || 0,
        jpSelf: Number(d.jpSelf) || 0,
        pphPaid: Number(d.pph21) || 0
      });
    });
  } catch { return null; }
  const ref = payrollMonthEnd(payrollViewMonth);
  const paidMap = payrollPaidMap(payrollViewMonth);
  return Storage.getAllEmployees()
    .filter(e => e.active !== false)
    .map(emp => {
      const key = String(emp.name || '').trim().toLowerCase();
      const all = (byPerson[key] || []).slice().sort((a, b) => a.month < b.month ? -1 : 1);
      const jn = all.filter(x => x.month < `${year}-12`);
      if (!jn.length) return null;
      const c = payrollCache[emp.id] || {};
      const ter = computeSlip(emp, { overtime: c.overtime || 0, bonus: c.bonus || 0, deduct: c.deduct || 0, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph !== false, refDate: ref, rates: payrollRates });
      const r = decRecon(emp, jn, { gross: ter.gross, thr: ter.thr, jhtSelf: ter.ded.jhtSelf, jpSelf: ter.ded.jpSelf });
      return {
        empId: emp.id, name: emp.name, ptkp: emp.ptkp || 'TK/0', hasNpwp: !!emp.npwp,
        months: r.months, annualGross: r.annualGross, annualDue: r.annualDue,
        paidJanNov: r.paidJanNov, pkp: r.pkp, ptkpAmt: r.ptkp,
        decTer: c.withPph !== false ? ter.ded.pph21 : 0,
        decAdjust: r.decAdjust,
        applied: c.pphOverride != null ? c.pphOverride : null,
        decFinalized: !!paidMap[emp.id],
        monthly: all
      };
    }).filter(Boolean);
}
function renderDecPanel(status) {
  const box = document.getElementById('payrollDecPanel');
  if (!box) return;
  const [y, m] = String(payrollViewMonth || '').split('-').map(Number);
  if (m !== 12 || !y) { box.innerHTML = ''; return; }
  UI.renderDecRecon(buildDecRecon() || [], String(y), status === 'final');
}
function handleDecApply(empId) {
  const m = Number(String(payrollViewMonth || '').split('-')[1]);
  if (m !== 12) return;
  const draft = Storage.getPayrollDraft(payrollViewMonth);
  if (draft && draft.status === 'final') return UI.showError('Bulan sudah final — rekonsiliasi tidak bisa diubah');
  const rows = buildDecRecon() || [];
  const row = rows.find(r => r.empId === empId);
  if (!row) return UI.showError('Data setahun karyawan ini belum cukup');
  if (row.decFinalized) return UI.showInfo('Gaji Desember karyawan ini sudah difinalisasi');
  if (!payrollCache[empId]) return;
  if (!confirm(`Terapkan PPh 21 Desember ${row.name} = ${'Rp' + row.decAdjust.toLocaleString('id-ID')} (hasil rekonsiliasi, menggantikan TER ${'Rp' + row.decTer.toLocaleString('id-ID')})?`)) return;
  payrollCache[empId].pphOverride = row.decAdjust;
  const items = {};
  Object.keys(payrollCache).forEach(k => { items[k] = { ...payrollCache[k] }; });
  syncPayrollInputsFromDOM(items);
  items[empId].pphOverride = row.decAdjust;
  try { Storage.savePayrollDraft(payrollViewMonth, { items, rates: payrollRates, status: draft ? draft.status : 'draft' }); } catch {}
  loadPayrollCache();
  renderPayrollView();
  queueMirror();
  UI.showSuccess(`PPh Desember ${row.name} disetel ke hasil rekonsiliasi`);
}
function handleDecA1(empId) {
  const [y] = String(payrollViewMonth || '').split('-').map(Number);
  const rows = buildDecRecon() || [];
  const row = rows.find(r => r.empId === empId);
  if (!row) return UI.showError('Data setahun karyawan ini belum cukup');
  const emp = Storage.getAllEmployees().find(x => x.id === empId) || {};
  UI.printDecA1({
    year: String(y || new Date().getFullYear()),
    name: row.name, npwp: emp.npwp || '', ptkp: row.ptkp,
    monthly: row.monthly, annualGross: row.annualGross,
    annualDue: row.annualDue, paidJanNov: row.paidJanNov,
    pkp: row.pkp, ptkpAmt: row.ptkpAmt, decAdjust: row.decAdjust
  });
}

function handleLogout() {
  try { sessionStorage.removeItem('wynara_logged_in'); } catch {}
  try { localStorage.removeItem('wynara_logged_in'); } catch {}
  document.getElementById('appRoot').classList.add('hidden');
  showLogin();
}

/* ===== Jurnal penutupan (closing entries) ===== */
function buildClosingLines(mk) {
  const rev = {}, exp = {};
  try {
    Storage.getAllJournals().forEach(j => {
      if (String(j.date || '').slice(0, 7) !== mk) return;
      (j.lines || []).forEach(l => {
        const code = String(l.account || '');
        const deb = Number(l.debit) || 0, cr = Number(l.credit) || 0;
        if (/^4/.test(code)) rev[code] = (rev[code] || 0) + cr - deb;
        if (/^5/.test(code)) exp[code] = (exp[code] || 0) + deb - cr;
      });
    });
  } catch { return null; }
  const lines = [];
  Object.keys(rev).forEach(c => { if (rev[c] > 0.01) lines.push({ account: c, debit: Math.round(rev[c]), credit: 0, memo: 'Tutup pendapatan' }); });
  Object.keys(exp).forEach(c => { if (exp[c] > 0.01) lines.push({ account: c, debit: 0, credit: Math.round(exp[c]), memo: 'Tutup beban' }); });
  if (!lines.length) return null;
  const deb = lines.filter(l => l.debit > 0).reduce((s, l) => s + l.debit, 0);
  const cr = lines.filter(l => l.credit > 0).reduce((s, l) => s + l.credit, 0);
  const laba = deb - cr;
  if (laba > 0) lines.push({ account: '3102', debit: 0, credit: laba, memo: 'Laba periodenya masuk Laba Ditahan' });
  else if (laba < 0) lines.push({ account: '3102', debit: Math.abs(laba), credit: 0, memo: 'Rugi periode dikurangi dari Laba Ditahan' });
  return lines;
}
function buildClosingJournalData(mk) {
  const lines = buildClosingLines(mk);
  if (!lines) return null;
  const [y, m] = String(mk).split('-').map(Number);
  const date = `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const total = lines.reduce((s, l) => s + l.debit, 0);
  return { id: `CLOSE-${mk}`, date, memo: `Jurnal penutupan ${label}`, ref: 'closing', refId: mk, lines, total, label };
}
function handleClosing() {
  const now = new Date();
  const months = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const items = months.map((mk) => {
    const label = payrollMonthLabel(mk);
    const done = Storage.getAllJournals().some(j => j.id === `CLOSE-${mk}`);
    return `<button type="button" class="close-month-btn" data-mk="${mk}" style="display:flex;align-items:center;justify-content:space-between;width:100%;border:1px solid ${done ? '#e2e8f0' : '#bfdbfe'};background:${done ? '#f8fafc' : '#eff6ff'};color:${done ? '#64748b' : '#1d4ed8'};border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:6px;cursor:pointer"><span>📅 ${label}</span><span style="font-size:11px">${done ? '✓ sudah ditutup' : 'Tutup →'}</span></button>`;
  }).join('');
  UI.openInfoModal('🔒 Penutupan bulan', `<p style="font-size:12px;color:#64748b;margin:0 0 10px">Pilih bulan yang sudah selesai — pendapatan & beban ditutup ke Laba Ditahan (idempoten; menerkat tetap aman).</p>${items.join('')}`);
}
function doClosing(mk) {
  const data = buildClosingJournalData(mk);
  if (!data) return UI.showInfo(`Tidak ada pendapatan/beban di ${mk}`);
  const deb = data.lines.reduce((s, l) => s + l.debit, 0);
  const cr = data.lines.reduce((s, l) => s + l.credit, 0);
  if (deb !== cr) return UI.showError('Jurnal penutupan pincang — kontak cara bayar bermasalah');
  try {
    if (Storage.getAllJournals().some(j => j.id === data.id)) { UI.showInfo(`Penutupan ${mk} sudah pernah diposting`); return; }
    if (Storage.isMonthLocked(data.date)) return UI.showError(`Bulan ${mk} terkunci — jurnal penutupan tidak bisa diposting`);
    Storage.postJournal(data);
    Storage.logAudit('create', 'closing', data.id, null, { month: mk, total: Math.round(deb) });
    UI.showSuccess(`Jurnal penutupan ${data.label}: Rp${Math.round(data.total).toLocaleString('id-ID')} → Laba Ditahan`);
    refresh();
    renderPageReport();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting penutupan');
  }
}

/* ===== Kirim backup via WhatsApp/Email ===== */
async function handleBackupShare() {
  try {
    const json = Storage.backupJSONString();
    const name = `wynara-backup-${new Date().toISOString().split('T')[0]}.json`;
    const canShareFile = typeof navigator !== 'undefined' && navigator.canShare && typeof window.File === 'function';
    if (canShareFile) {
      const file = new window.File([json], name, { type: 'application/json' });
      await navigator.share({ title: 'Wynara Backup', text: `Backup Wynara ${new Date().toLocaleDateString('id-ID')}`, files: [file] });
      UI.showSuccess('Backup dibagikan — lampirkan/ubah destinasi WhatsApp/Email pilihanmu');
      stampShares();
      return;
    }
    Storage.exportJSON();
    UI.showInfo('Browser ini tidak bisa share langsung — file backup sudah diunduh. Kirim lewat WhatsApp/Email (lampirkan file).');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    UI.showError('Gagal membagikan backup');
  }
}
function stampShares() {
  try { localStorage.setItem('wynara_lastBackup', new Date().toISOString()); } catch {}
}

/* ===== Sinkron online (Supabase) — local-first, opsional ===== */
function refreshCloudLabel() {
  const label = document.getElementById('cloudStatusLabel');
  if (!label) return;
  const st = Cloud.getCloudStatus();
  const ses = Cloud.getCloudSession();
  if (!Cloud.isCloudConfigured()) {
    label.textContent = 'Belum terhubung — data hanya di HP ini. Pakai anon/public key, JANGAN service_role key.';
    return;
  }
  if (!ses) {
    label.textContent = 'Server tersimpan, belum masuk — isi email + kata sandi lalu Hubungkan.';
    return;
  }
  label.textContent = 'Terhubung sebagai ' + (ses.user_id || '').slice(0, 8) + '… — ' + (st.detail || st.state);
}
async function handleCloudConnect() {
  const url = document.getElementById('cloudUrl')?.value || '';
  const key = document.getElementById('cloudKey')?.value || '';
  const email = document.getElementById('cloudEmail')?.value || '';
  const pass = document.getElementById('cloudPass')?.value || '';
  try {
    if (url || key) Cloud.saveCloudConfig(url, key);
    if (!Cloud.isCloudConfigured()) return UI.showError('Isi URL + anon key Supabase dulu');
    if (!email || !pass) return UI.showError('Isi email + kata sandi akun online');
    await Cloud.cloudSignIn(email, pass);
    const passEl = document.getElementById('cloudPass');
    if (passEl) passEl.value = '';
    UI.showSuccess('Terhubung — sinkronisasi pertama mengunggah data HP ini');
    refreshCloudLabel();
    updateCloudDot();
    const res = await Cloud.syncNow();
    if (res && res.error) UI.showError(res.error);
    else UI.showSuccess(`Sinkron awal selesai (↑${res.pushed || 0} ↓${res.pulled || 0})`);
    refreshCloudLabel();
    updateCloudDot();
    refresh();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal terhubung');
    refreshCloudLabel();
    updateCloudDot();
  }
}
async function handleCloudAnon() {
  const url = document.getElementById('cloudUrl')?.value || '';
  const key = document.getElementById('cloudKey')?.value || '';
  try {
    if (url || key) Cloud.saveCloudConfig(url, key);
    if (!Cloud.isCloudConfigured()) return UI.showError('Isi URL + anon key Supabase dulu');
    await Cloud.cloudSignInAnonymously();
    UI.showSuccess('Masuk anonim — sinkronisasi pertama mengunggah data HP ini');
    refreshCloudLabel();
    updateCloudDot();
    const res = await Cloud.syncNow();
    if (res && res.error) UI.showError(res.error);
    else UI.showSuccess(`Sinkron awal selesai (↑${res.pushed || 0} ↓${res.pulled || 0})`);
    refreshCloudLabel();
    updateCloudDot();
    refresh();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal masuk anonim');
    refreshCloudLabel();
    updateCloudDot();
  }
}
async function handleCloudSignup() {  const url = document.getElementById('cloudUrl')?.value || '';
  const key = document.getElementById('cloudKey')?.value || '';
  const email = document.getElementById('cloudEmail')?.value || '';
  const pass = document.getElementById('cloudPass')?.value || '';
  try {
    if (url || key) Cloud.saveCloudConfig(url, key);
    if (!Cloud.isCloudConfigured()) return UI.showError('Isi URL + anon key Supabase dulu');
    if (!email || !pass) return UI.showError('Isi email + kata sandi untuk akun baru');
    const res = await Cloud.cloudSignUp(email, pass);
    const passEl = document.getElementById('cloudPass');
    if (passEl) passEl.value = '';
    if (res && res.needConfirm) {
      UI.showInfo('Akun dibuat — cek email untuk konfirmasi, lalu tekan Hubungkan & Masuk');
    } else {
      UI.showSuccess('Akun dibuat & masuk — sinkronisasi pertama mengunggah data HP ini');
      const r = await Cloud.syncNow();
      if (r && r.error) UI.showError(r.error);
      refresh();
    }
    refreshCloudLabel();
    updateCloudDot();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal mendaftar');
    refreshCloudLabel();
    updateCloudDot();
  }
}
async function handleCloudSyncNow() {  if (!Cloud.isCloudConfigured()) return UI.showError('Hubungkan Supabase dulu (isi URL + key + login)');
  updateCloudDot();
  const res = await Cloud.syncNow();
  if (res && res.error) UI.showError(res.error);
  else {
    UI.showSuccess(`Sinkron selesai (↑${res.pushed || 0} ↓${res.pulled || 0}${res.conflicts ? ` • ${res.conflicts} beda versi, ikut terbaru` : ''})`);
    refresh();
  }
  refreshCloudLabel();
  updateCloudDot();
}
function handleCloudOff() {
  Cloud.clearCloudConfig();
  const passEl = document.getElementById('cloudPass');
  if (passEl) passEl.value = '';
  UI.showInfo('Sinkron online dimatikan — data lokal tetap utuh');
  refreshCloudLabel();
  updateCloudDot();
}

/* ===== Saldo awal per akun ===== */
function openOpening() {
  const m = document.getElementById('openingModal');
  if (!m) return;
  const drafts = Storage.getOpeningDraft();
  const dateEl = document.getElementById('openingDate');
  if (dateEl) dateEl.value = drafts.date || `${new Date().getFullYear()}-01-01`;
  const rows = getAccounts().filter(a => a.type !== 'equity');
  const body = document.getElementById('openingRows');
  if (body) {
    body.innerHTML = rows.map(a => {
      const v = drafts.rows || {};
      return `<tr style="border-bottom:1px solid #f8fafc">
        <td style="padding:6px 8px"><b style="font-size:11px">${a.code}</b> ${escapeHtml(a.name)}</td>
        <td style="padding:4px 6px"><input type="text" class="opening-deb" data-code="${a.code}" bind="rupiah" placeholder="Rp" inputmode="decimal" value="${v[a.code] && Number(v[a.code].debit) ? String(Number(v[a.code].debit)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}" style="width:100%;height:32px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;text-align:right" aria-label="Debit ${escapeHtml(a.name)}"></td>
        <td style="padding:4px 6px"><input type="text" class="opening-cred" data-code="${a.code}" bind="rupiah" placeholder="Rp" inputmode="decimal" value="${v[a.code] && Number(v[a.code].credit) ? String(Number(v[a.code].credit)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}" style="width:100%;height:32px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;text-align:right" aria-label="Kredit ${escapeHtml(a.name)}"></td>
      </tr>`;
    }).join('');
  }
  updateOpeningBalance();
  if (!m.open) { try { m.showModal(); } catch {} }
}
function openingNumInput(sel) {
  return Math.round(Number(String(sel.value || '').replace(/[^0-9]/g, '')) || 0) || 0;
}
function updateOpeningBalance() {
  const info = document.getElementById('openingBalanceInfo');
  if (!info) return;
  let deb = 0, cred = 0;
  document.querySelectorAll('#openingRows .opening-deb, #openingRows .opening-cred').forEach(inp => {
    const v = openingNumInput(inp);
    if (inp.classList.contains('opening-deb')) deb += v; else cred += v;
  });
  const diff = deb - cred;
  if (diff === 0) info.innerHTML = deb > 0 ? '<span style="color:#059669">✓ Seimbang</span>' : '<span style="color:#94a3b8">Isi debit/kredit per akun, atau tempel dari Excel</span>';
  else info.innerHTML = `<span style="color:#b91c1c">Selisih ${'Rp' + Math.abs(diff).toLocaleString('id-ID')} — dipasang otomatis ke 3101 Modal</span>`;
}
function handleOpeningPost() {
  const date = document.getElementById('openingDate')?.value || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return UI.showError('Tanggal mulai pembukuan belum benar');
  const rows = {};
  const lines = [];
  document.querySelectorAll('#openingRows .opening-deb, #openingRows .opening-cred').forEach(inp => {
    const code = inp.dataset.code;
    const v = openingNumInput(inp);
    if (v <= 0) return;
    rows[code] = rows[code] || { debit: 0, credit: 0 };
    if (inp.classList.contains('opening-deb')) { rows[code].debit = v; lines.push({ account: code, debit: v, credit: 0 }); }
    else { rows[code].credit = v; lines.push({ account: code, credit: 0, debit: 0 }); }
  });
  if (!lines.length) return UI.showInfo('Belum ada nilai yang diisi');
  const deb = lines.reduce((s, l) => s + l.debit, 0);
  const cred = lines.reduce((s, l) => s + l.credit, 0);
  let diff = deb - cred;
  if (diff !== 0) {
    // Modal/Rugi periode sebelumnya otomatis ke 3101 Modal Awal
    lines.push(diff > 0 ? { account: '3101', debit: 0, credit: diff } : { account: '3101', debit: Math.abs(diff), credit: 0 });
  }
  const m = document.getElementById('openingModal');
  try {
    Storage.deleteJournalsByRef('opening');
    const j = buildOpeningJournal({ date, memo: `Saldo awal pembukuan per ${date}` }, lines);
    if (!j) throw new Error('Jurnal tidak seimbang');
    Storage.postJournal(j);
    Storage.saveOpeningDraft({ date, rows });
    Storage.logAudit('create', 'opening-balance', j.id, null, { date, total: deb + (diff !== 0 ? Math.abs(diff) : 0) });
    if (m && m.open) { try { m.close(); } catch {} }
    UI.showSuccess(`Saldo awal diposting: ${lines.length} akun (seimbang dengan Modal)`);
    refresh();
    renderPageReport();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting saldo awal');
  }
}

/* ===== Jurnal penyesuaian manual ===== */
function accountOptionsHTML(selected) {
  return getAccounts().map(a => `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${a.code} — ${escapeHtml(a.name)}</option>`).join('');
}
function openAdjust() {
  const m = document.getElementById('adjustModal');
  if (!m) return;
  ['adjustDate', 'adjustMemo', 'adjustDebitAmt', 'adjustCreditAmt'].forEach(id => { const el = document.getElementById(id); if (el && id === 'adjustDate') { el.value = new Date().toISOString().split('T')[0]; } else if (el && id !== 'adjustDate') el.value = ''; });
  const dAcc = document.getElementById('adjustDebitAcc');
  const cAcc = document.getElementById('adjustCreditAcc');
  const selectedA = (dAcc && dAcc.value) || '1102';
  const selectedB = (cAcc && cAcc.value) || '4101';
  if (dAcc) dAcc.innerHTML = accountOptionsHTML(selectedA);
  if (cAcc) cAcc.innerHTML = accountOptionsHTML(selectedB);
  updateAdjustPreview();
  if (!m.open) { try { m.showModal(); } catch {} }
}
function adjustAmount(sel) { return Math.round(Number(String(sel.value || '').replace(/[^0-9]/g, '')) || 0); }
function updateAdjustPreview() {
  const box = document.getElementById('adjustPreview');
  if (!box) return;
  const d = adjustAmount(document.getElementById('adjustDebitAmt'));
  const c = adjustAmount(document.getElementById('adjustCreditAmt'));
  const dAcc = document.getElementById('adjustDebitAcc')?.value;
  const cAcc = document.getElementById('adjustCreditAcc')?.value;
  const label = (code) => { const a = getAccounts().find(x => x.code === code); return a ? `${a.code} ${a.name}` : code; };
  if (d <= 0 && c <= 0) { box.innerHTML = '<span style="color:#94a3b8">Isi nominal debit & kredit.</span>'; return; }
  if (d !== c) {
    box.innerHTML = `<span style="color:#dc2626">⚠ Pincang: debit ${'Rp' + d.toLocaleString('id-ID')} ≠ kredit ${'Rp' + c.toLocaleString('id-ID')} — selisih ${'Rp' + Math.abs(d - c).toLocaleString('id-ID')}</span>`;
    return;
  }
  box.innerHTML = `✓ Balance: <b>${label(dAcc)}</b> ⇄ <b>${label(cAcc)}</b> — ${'Rp' + d.toLocaleString('id-ID')}`;
}
function handleAdjustPost() {
  const date = document.getElementById('adjustDate')?.value || '';
  const memo = (document.getElementById('adjustMemo')?.value || '').trim();
  const dAcc = document.getElementById('adjustDebitAcc')?.value;
  const cAcc = document.getElementById('adjustCreditAcc')?.value;
  const d = adjustAmount(document.getElementById('adjustDebitAmt'));
  const c = adjustAmount(document.getElementById('adjustCreditAmt'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return UI.showError('Tanggal belum benar');
  if (!memo) return UI.showError('Keterangan wajib diisi');
  if (!(d > 0)) return UI.showError('Nominal debit harus lebih dari 0');
  if (d !== c) return UI.showError('Jurnal pincang — debit dan kredit harus sama');
  if (dAcc === cAcc) return UI.showError('Akun debit dan kredit tidak boleh sama');
  try {
    const id = `ADJ-${date.replace(/-/g, '')}-${Date.now().toString(36)}`;
    Storage.postJournal({
      id, date, memo, ref: 'adjustment', refId: id,
      lines: [
        { account: dAcc, debit: d, credit: 0, memo },
        { account: cAcc, debit: 0, credit: c, memo },
      ]
    });
    Storage.logAudit('create', 'journal-manual', id, null, { debit: `${dAcc} ${d}`, credit: `${cAcc} ${c}` });
    const m = document.getElementById('adjustModal');
    if (m && m.open) { try { m.close(); } catch {} }
    UI.showSuccess(`Jurnal penyesuaian ${'Rp' + d.toLocaleString('id-ID')} diposting`);
    renderReport();
    renderPageReport();
    refresh();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting jurnal');
  }
}
/* ===== Aset tetap & penyusutan ===== */
function refreshAssets() {
  const body = document.getElementById('assetTableBody');
  if (!body) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const assets = Storage.getFixedAssets();
  let bulanIni = 0;
  body.innerHTML = assets.length ? assets.map(a => {
    const cost = Number(a.cost) || 0;
    const life = Math.max(1, Number(a.lifeMonths) || 1);
    const owned = Storage.monthsOwned(a.buyDate);
    const monthly = cost / life;
    const accum = Math.min(cost, monthly * Math.min(owned, life));
    const buku = cost - accum;
    bulanIni += owned > 0 && accum < cost ? monthly : 0;
    return `<tr style="border-bottom:1px solid #f8fafc">
      <td style="padding:8px"><b>${escapeHtml(a.name)}</b><br><small style="color:#94a3b8">${owned}/${life} bln</small></td>
      <td style="padding:8px;text-align:right">${fmt(cost)}</td>
      <td style="padding:8px;text-align:right">${fmt(monthly)}</td>
      <td style="padding:8px;text-align:right">${fmt(accum)}</td>
      <td style="padding:8px;text-align:right"><b>${fmt(buku)}</b></td>
      <td style="padding:8px;text-align:right"><button class="btn btn-danger asset-delete" data-id="${a.id}" aria-label="Hapus ${escapeHtml(a.name)}" style="padding:2px 8px;font-size:12px">×</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8">Belum ada aset. Isi form di atas lalu tekan Tambah.</td></tr>';
  const sum = document.getElementById('assetSummary');
  if (sum) sum.innerHTML = assets.length
    ? `<span class="chip" style="font-size:12px">Penyusutan bulan ini: <b>Rp${Math.round(bulanIni).toLocaleString('id-ID')}</b></span>`
    : '';
}

function handleAssetAdd() {
  const name = (document.getElementById('assetName')?.value || '').trim();
  const cost = Number(String(document.getElementById('assetCost')?.value || '').replace(/[^0-9]/g, '')) || 0;
  const buyDate = document.getElementById('assetBuyDate')?.value || '';
  const life = Number(document.getElementById('assetLife')?.value) || 0;
  if (!name || cost <= 0 || !buyDate || life <= 0) return UI.showError('Lengkapi nama, harga, tanggal beli, dan umur pakai');
  const list = Storage.getFixedAssets();
  list.push({ id: `AS-${Date.now().toString(36)}`, name, cost, buyDate, lifeMonths: life });
  Storage.saveFixedAssets(list);
  Storage.logAudit('create', 'fixed-asset', name, null, { cost, lifeMonths: life });
  ['assetName', 'assetCost', 'assetBuyDate', 'assetLife'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  UI.showSuccess(`Aset "${name}" ditambahkan`);
  refreshAssets();
  queueMirror();
}

function handleAssetDelete(id) {
  const list = Storage.getFixedAssets();
  const a = list.find(x => x.id === id);
  if (!a) return;
  if (!confirm(`Hapus aset "${a.name}"?`)) return;
  Storage.saveFixedAssets(list.filter(x => x.id !== id));
  Storage.logAudit('delete', 'fixed-asset', a.name, { cost: a.cost }, null);
  UI.showSuccess('Aset dihapus');
  refreshAssets();
  queueMirror();
}

function handleAssetPost() {
  const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const id = `DEP-${mk}`;
  if (Storage.getAllJournals().some(j => j.id === id)) return UI.showInfo(`Penyusutan ${mk} sudah pernah diposting`);
  const total = Storage.getFixedAssets().reduce((s, a) => {
    const cost = Number(a.cost) || 0;
    const life = Math.max(1, Number(a.lifeMonths) || 1);
    const owned = Storage.monthsOwned(a.buyDate);
    const monthly = cost / life;
    const accum = Math.min(cost, monthly * Math.min(owned, life));
    if (owned <= 0 || accum >= cost) return s;
    const sisa = Math.min(monthly, cost - accum);
    return s + sisa;
  }, 0);
  if (total <= 0.01) return UI.showInfo('Tidak ada penyusutan untuk bulan ini');
  try {
    Storage.postJournal({
      id, date: `${mk}-01`, memo: `Penyusutan aset ${mk}`, ref: 'fixed-asset-dep', refId: mk,
      lines: [
        { account: '5129', debit: Math.round(total), credit: 0, memo: `Penyusutan ${mk}` },
        { account: '1519', debit: 0, credit: Math.round(total), memo: `Akumulasi penyusutan ${mk}` },
      ]
    });
    Storage.logAudit('create', 'fixed-asset-dep', id, null, { total: Math.round(total) });
    UI.showSuccess(`Jurnal penyusutan ${mk}: Rp${Math.round(total).toLocaleString('id-ID')}`);
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting jurnal');
  }
}
function openAssets() {
  refreshAssets();
  UI.openAssetModal();
}

function openSettings() {
  const modal = document.getElementById('settingsModal');
  const budget = Storage.getBudget();
  const input = document.getElementById('budgetInput');
  if (input) input.value = budget && budget.amount ? Number(budget.amount).toLocaleString('id-ID') : '';
  const eqInput = document.getElementById('equityInput');
  if (eqInput) {
    const eq = Storage.getOpeningEquity();
    eqInput.value = eq && eq.amount ? Number(eq.amount).toLocaleString('id-ID') : '';
  }
  const notif = document.getElementById('settingNotif');
  if (notif) notif.checked = safeLocalGet('wynara_notif') !== 'false';
  const themeBox = document.getElementById('settingTheme');
  if (themeBox) themeBox.checked = document.body.classList.contains('dark-mode');
  const ppnInput = document.getElementById('ppnRateInput');
  if (ppnInput) ppnInput.value = (Storage.getPpn().rate * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const modeBox = document.getElementById('settingModeSederhana');
  if (modeBox) modeBox.checked = safeLocalGet('wynara_mode') === 'sederhana';
  const cloudCfg = Cloud.getCloudConfig();
  const cloudUrl = document.getElementById('cloudUrl');
  if (cloudUrl && !cloudUrl.value) cloudUrl.value = cloudCfg ? cloudCfg.url : '';
  const cloudKey = document.getElementById('cloudKey');
  if (cloudKey && !cloudKey.value) cloudKey.value = cloudCfg ? cloudCfg.anonKey : '';
  refreshCloudLabel();
  const lastBackupEl = document.getElementById('lastBackupLabel');
  if (lastBackupEl) {
    const last = Storage.getLastBackup();
    lastBackupEl.textContent = last
      ? `Backup terakhir: ${last.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} — cadangan otomatis aktif di browser ini`
      : 'Belum pernah backup — unduh JSON Backup biar data aman';
  }
  // Kunci periode
  const renderLocks = () => {
    const box = document.getElementById('lockList');
    if (!box) return;
    const locks = Storage.getLockedMonths();
    box.innerHTML = locks.length
      ? locks.map(m => `<span class="chip" style="font-size:11px">🔒 ${m} <button data-unlock="${m}" style="margin-left:4px;background:none;border:none;cursor:pointer;color:#ef4444" title="Buka kunci">×</button></span>`).join('')
      : '<span style="font-size:11px;color:#94a3b8">Belum ada bulan terkunci</span>';
    box.querySelectorAll('[data-unlock]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`Buka kunci ${btn.dataset.unlock}? Bulan ini bisa diubah lagi.`)) return;
        Storage.unlockMonth(btn.dataset.unlock);
        Storage.logAudit('update', 'lock', btn.dataset.unlock, { locked: true }, { locked: false });
        renderLocks();
        queueMirror();
      });
    });
  };
  renderLocks();
  const lockOne = (d) => {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    try {
      Storage.lockMonth(key);
      Storage.logAudit('update', 'lock', key, { locked: false }, { locked: true });
      UI.showSuccess(`Bulan ${key} dikunci`);
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal mengunci');
    }
    renderLocks();
    queueMirror();
  };
  document.getElementById('lockPrevBtn').onclick = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); lockOne(d); };
  document.getElementById('lockCurBtn').onclick = () => lockOne(new Date());
  // Mode kasir
  const kasirHint = document.getElementById('kasirPinHint');
  const kasirInput = document.getElementById('kasirPinInput');
  const renderKasirHint = () => {
    if (kasirHint) kasirHint.textContent = Storage.kasirEnabled()
      ? 'Aktif — login pakai username "kasir" + PIN. Kasir: cuma catat transaksi (tanpa laporan/gaji/hapus). PIN default awal: 1234.'
      : 'Belum aktif — simpan PIN (default pertama: 1234) untuk memberi akses terbatas ke kasir.';
  };
  renderKasirHint();
  document.getElementById('kasirPinSave').onclick = async () => {
    const v = (kasirInput && kasirInput.value || '').trim();
    if (!v) return UI.showError('Isi PIN dulu (4–8 angka)');
    try {
      await Storage.setKasirPin(v, true);
      if (kasirInput) kasirInput.value = '';
      renderKasirHint();
      UI.showSuccess('PIN kasir disimpan — login "kasir" + PIN');
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal menyimpan PIN');
    }
  };
  document.getElementById('kasirPinOff').onclick = () => {
    if (!Storage.kasirEnabled()) return UI.showInfo('Mode kasir memang belum aktif');
    if (!confirm('Matikan mode kasir? Login "kasir" jadi tidak bisa dipakai.')) return;
    try { Storage.setKasirPin('', false); renderKasirHint(); UI.showSuccess('Mode kasir dimatikan'); } catch {}
  };
  // Anggaran per kategori
  const catSel = document.getElementById('catBudgetSelect');
  const catAmt = document.getElementById('catBudgetAmount');
  const catAdd = document.getElementById('catBudgetAdd');
  const catList = document.getElementById('catBudgetList');
  const renderCatBudgets = () => {
    if (!catList) return;
    const all = Storage.getCategoryBudgets();
    const keys = Object.keys(all);
    const fmt = (v) => 'Rp' + Number(v).toLocaleString('id-ID');
    catList.innerHTML = keys.length
      ? keys.map(c => {
        let label = c;
        try { label = Reports.getCategoryLabel(c) || c; } catch {}
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:6px 10px">
          <span style="flex:1">${escapeHtml(label)} • <b>${fmt(all[c])}</b></span>
          <button data-catdel="${escapeHtml(c)}" class="btn btn-ghost" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
        </div>`;
      }).join('')
      : '<span style="font-size:11px;color:#94a3b8">Belum ada — tambah mis. Makanan Rp500rb</span>';
    catList.querySelectorAll('[data-catdel]').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.setCategoryBudget(btn.dataset.catdel, 0);
        renderCatBudgets();
        renderBudget(currentEntries);
        queueMirror();
      });
    });
  };
  if (catSel) {
    const predefined = Reports.CATEGORY_OPTIONS.expense.map(o => o.value);
    const customs = [...new Set(currentEntries.filter(e => e.type === 'expense').map(e => e.category))].filter(c => !predefined.includes(c));
    const labelOf = (c) => { try { return Reports.getCategoryLabel(c) || c; } catch { return c; } };
    catSel.innerHTML = '';
    predefined.concat(customs).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = labelOf(c);
      catSel.appendChild(opt);
    });
  }
  if (catAdd && !catAdd.dataset.bound) {
    catAdd.dataset.bound = '1';
    catAdd.addEventListener('click', () => {
      const c = catSel ? catSel.value : '';
      const raw = catAmt ? UI.parseIdrInput(catAmt.value) : '';
      if (!c || !raw) { UI.showError('Pilih kategori + isi nominal'); return; }
      Storage.setCategoryBudget(c, Number(raw));
      if (catAmt) catAmt.value = '';
      UI.showSuccess('Anggaran kategori disimpan');
      renderCatBudgets();
      renderBudget(currentEntries);
      queueMirror();
    });
  }
  renderCatBudgets();
  const recList = document.getElementById('recurringList');
  if (recList) {
    const templates = Storage.getRecurring();
    if (!templates.length) {
      recList.innerHTML = '<span style="font-size:11px;color:#94a3b8">Tidak ada transaksi rutin</span>';
    } else {
      const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
      recList.innerHTML = templates.map(t => `
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px">
          <span>${t.type === 'income' ? '📥' : '📤'}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.category || 'Lainnya')} • ${fmt(Number(t.amount) || 0)}/bln${t.paused ? ' <small style="color:#94a3b8">(jeda)</small>' : ''}</span>
          <button data-rec="${t.recurringId}" data-act="pause" class="btn btn-ghost" style="font-size:11px;padding:2px 8px">${t.paused ? '▶️' : '⏸️'}</button>
          <button data-rec="${t.recurringId}" data-act="del" class="btn btn-ghost" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
        </div>`).join('');
      recList.querySelectorAll('button[data-rec]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.rec;
          if (btn.dataset.act === 'del') {
            if (!confirm('Hapus transaksi rutin ini? (yang sudah dibuat tidak ikut terhapus)')) return;
            Storage.deleteRecurring(id);
            UI.showSuccess('Transaksi rutin dihapus');
          } else {
            const t = Storage.getRecurring().find(x => x && x.recurringId === id);
            Storage.pauseRecurring(id, !(t && t.paused));
            UI.showInfo(t && t.paused ? 'Transaksi rutin dilanjutkan' : 'Transaksi rutin dijeda');
          }
          openSettings();
          queueMirror();
        });
      });
    }
  }
  const list = document.getElementById('customCategoryList');
  if (list) {
    const cats = Storage.getCategories();
    const predefined = new Set([...Reports.CATEGORY_OPTIONS.income.map(o=>o.value), ...Reports.CATEGORY_OPTIONS.expense.map(o=>o.value)]);
    const customs = cats.filter(c => !predefined.has(c));
    if (!customs.length) list.innerHTML = '<span style="font-size:11px;color:#94a3b8">Tidak ada kategori custom</span>';
    else list.innerHTML = customs.map(c => {
      const cnt = currentEntries.filter(e => e.category === c).length;
      return `<span class="chip" style="font-size:11px">${escapeHtml(c)} <small>(${cnt})</small> <button data-cat="${escapeHtml(c)}" class="del-cat" style="margin-left:4px;background:none;border:none;cursor:pointer;color:#ef4444">×</button></span>`;
    }).join('');
    list.querySelectorAll('.del-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const cnt = currentEntries.filter(e => e.category === cat).length;
        if (cnt > 0) { UI.showError(`Kategori "${cat}" masih dipakai ${cnt} transaksi`); return; }
        if (confirm(`Hapus kategori "${cat}"?`)) {
          UI.showSuccess(`Kategori "${cat}" akan hilang setelah tidak ada transaksi`);
          list.innerHTML = '<span style="font-size:11px;color:#94a3b8">Kategori akan hilang otomatis</span>';
        }
      });
    });
  }
  if (modal && !modal.open) { modal.showModal(); UI.trapFocus(modal); }
  else if (modal) UI.trapFocus(modal);
}
function closeSettings() {
  const modal = document.getElementById('settingsModal');
  UI.releaseFocus(modal);
  if (modal && modal.open) try { modal.close(); } catch {}
}
function saveSettings() {
  const input = document.getElementById('budgetInput');
  const raw = input ? UI.parseIdrInput(input.value) : '';
  const amount = raw ? Number(raw) : 0;
  if (amount) Storage.saveBudget({ amount, updatedAt: new Date().toISOString() });
  else { try { localStorage.removeItem('wynara_budget'); } catch {} }
  const eqInput = document.getElementById('equityInput');
  const eqRaw = eqInput ? UI.parseIdrInput(eqInput.value) : '';
  Storage.saveOpeningEquity(eqRaw ? Number(eqRaw) : 0);
  postOpeningEquityJournal();
  queueMirror();
  const notif = document.getElementById('settingNotif');
  if (notif) safeLocalSet('wynara_notif', String(notif.checked));
  // Mode Sederhana (masking alat akuntan)
  const modeBox = document.getElementById('settingModeSederhana');
  if (modeBox) {
    const mode = modeBox.checked ? 'sederhana' : 'akuntan';
    safeLocalSet('wynara_mode', mode);
    applySimpleMode(mode);
    if (mode === 'sederhana' && ['journal', 'ledger', 'trial', 'audit', 'ppn', 'pph21'].includes(currentReportType)) {
      currentReportType = 'monthly';
      renderPageReport();
      const tab = document.querySelector('.report-tab[data-report="monthly"]');
      if (tab) tab.click();
    }
  }
  // Tarif PPN configurable
  const ppnInput = document.getElementById('ppnRateInput');
  if (ppnInput && String(ppnInput.value || '').trim() !== '') {
    try {
      const r = Storage.savePpn(ppnInput.value);
      Storage.logAudit('update', 'ppn-rate', 'settings', { rate: Storage.getPpn().rate }, { rate: r });
      UI.updatePpnLabels();
      UI.showInfo(`Tarif PPN kini ${(r * 100).toLocaleString('id-ID')}%`);
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Tarif PPN tidak valid');
    }
  }
  closeSettings();
  UI.showSuccess('Pengaturan disimpan');
  render();
}

document.addEventListener('DOMContentLoaded', init);
