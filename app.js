import * as Storage from './storage.js';
import * as Reports from './reports.js';
import * as UI from './ui.js';
import * as IDB from './idb.js';
import { calcTenor, paidOf, outstandingOf, nextDue, totalOwed } from './loanmath.js';
import * as Charts from './charts.js';

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

const APP_VERSION = '1.5.2';
const LOAN_CATEGORIES = ['Piutang', 'Hutang'];

function init() {
  window.__appBooted = true;
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
  return safeSessionGet('wynara_logged_in') === 'true';
}

let loginListenerAdded = false;

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appRoot').classList.add('hidden');
  if (!loginListenerAdded) {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    const eye = document.getElementById('loginEye');
    if (eye) eye.addEventListener('click', () => {
      const pass = document.getElementById('loginPass');
      const isText = pass.type === 'text';
      pass.type = isText ? 'password' : 'text';
      eye.textContent = isText ? '👁️' : '🙈';
    });
    // clear error as soon as user retypes
    ['loginUser', 'loginPass'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        document.getElementById('loginError')?.classList.add('hidden');
      });
    });
    // dead links/buttons on login screen -> info instead of jumping to #
    document.querySelector('.login-forgot')?.addEventListener('click', (e) => {
      e.preventDefault();
      UI.showInfo('Reset password belum tersedia di versi demo — pakai admin / admin');
    });
    document.querySelector('.login-hint-new a')?.addEventListener('click', (e) => {
      e.preventDefault();
      UI.showInfo('Pendaftaran belum dibuka — pakai admin / admin');
    });
    document.querySelector('.login-google')?.addEventListener('click', () => {
      UI.showInfo('Login Google segera hadir — pakai admin / admin');
    });
    loginListenerAdded = true;
  }
  document.getElementById('loginError')?.classList.add('hidden');
  setTimeout(() => document.getElementById('loginUser')?.focus(), 50);
}

function handleLogin(e) {
  e.preventDefault();
  const user = (document.getElementById('loginUser').value || '').trim().toLowerCase();
  const pass = (document.getElementById('loginPass').value || '').trim();
  if (user === 'admin' && pass === 'admin') {
    if (!safeSessionSet('wynara_logged_in', 'true')) return;
    document.getElementById('loginError').classList.add('hidden');
    showApp();
  } else {
    document.getElementById('loginError').classList.remove('hidden');
    document.getElementById('loginPass')?.select();
  }
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');
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
  if (!keyboardBound) {
    document.addEventListener('keydown', handleKeyboardShortcut);
    keyboardBound = true;
  }
}

function loadData() {
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
function queueMirror() {
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    try { IDB.mirrorSnapshot(Storage.snapshotAll()); } catch {}
  }, 2000);
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
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans());
  });
  document.getElementById('onboardReportBtn')?.addEventListener('click', handleReportOpen);
  document.getElementById('settingTheme')?.addEventListener('change', (e) => {
    document.body.classList.toggle('dark-mode', e.target.checked);
    safeLocalSet('theme', e.target.checked ? 'dark' : 'light');
  });

  UI.bindCategoryChange(UI.handleCategoryChange);
  UI.bindTypeButtons(() => {});
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
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans());
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
  UI.bindLoanActions(handleRepayClick, handleLoanDelete, handleRepayDelete);
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
      sidebar.classList.toggle('open');
      overlay.classList.toggle('hidden');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    });
  }
  document.getElementById('reportBtnSidebar')?.addEventListener('click', handleReportOpen);
  document.getElementById('contactsBtnSidebar')?.addEventListener('click', () => UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans()));
  document.getElementById('loanBtnSidebar')?.addEventListener('click', () => UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans()));
  document.getElementById('themeToggleSidebar')?.addEventListener('click', handleThemeToggle);
  function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    const map = { viewRingkasan: '[data-nav="ringkasan"]', viewTransaksi: '#sidebarTransaksi' };
    const sel = map[viewId];
    if (sel) document.querySelector(sel)?.classList.add('active');
    sidebar?.classList.remove('open');
    overlay?.classList.add('hidden');
    if (viewId === 'viewTransaksi') renderFullTransaksi();
  }
  // default view
  showView('viewRingkasan');
  document.querySelector('[data-nav="ringkasan"]')?.addEventListener('click', () => showView('viewRingkasan'));
  document.getElementById('sidebarTransaksi')?.addEventListener('click', () => showView('viewTransaksi'));
  document.getElementById('lihatSemua')?.addEventListener('click', (e) => { e.preventDefault(); showView('viewTransaksi'); });
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
    const alerts = getLoanAlerts();
    if (!alerts.length) { UI.showSuccess('Tidak ada pinjaman jatuh tempo 🎉'); return; }
    const lines = alerts.slice(0, 5).map(a => {
      const name = a.loan.person || 'Tanpa nama';
      const when = a.diffDays < 0 ? `terlambat ${Math.abs(a.diffDays)} hari` : (a.diffDays === 0 ? 'hari ini' : `H-${a.diffDays}`);
      return `• ${name} — ${when}`;
    }).join('\n');
    UI.showWarning(`${alerts.length} pengingat pinjaman:\n${lines}`);
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans());
  });
  document.getElementById('aksiTambahTransaksi')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); });
  document.getElementById('addEntryBtn2')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); });
  document.getElementById('aksiTambahKontak')?.addEventListener('click', () => UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans()));
  document.getElementById('aksiLaporan')?.addEventListener('click', handleReportOpen);
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
  const budgetInputEl = document.getElementById('budgetInput');
  if (budgetInputEl) {
    budgetInputEl.addEventListener('focus', () => { const raw = budgetInputEl.value.replace(/[^0-9]/g,''); budgetInputEl.value = raw; });
    budgetInputEl.addEventListener('blur', () => { const raw = budgetInputEl.value.replace(/[^0-9]/g,''); if (raw) budgetInputEl.value = Number(raw).toLocaleString('id-ID'); });
  }
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

  document.getElementById('changelogLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    fetch('CHANGELOG.md').then(r => {
      if (!r.ok) throw new Error('not-found');
      return r.text();
    }).then(t => {
      const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      UI.openInfoModal('📜 Changelog v' + APP_VERSION, `<pre style="white-space:pre-wrap;font-size:12px;max-height:50vh;overflow:auto">${esc}</pre>`);
    }).catch(() => {
      UI.openInfoModal('📜 Changelog v' + APP_VERSION, '<p>Lihat file CHANGELOG.md di repo untuk detail.</p>');
    });
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
  UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans());
  refresh();
}

function handleFormSubmit() {
  const data = UI.getFormData();
  const error = UI.validateForm(data);
  if (error) {
    UI.showError(error);
    return;
  }

  try {
    submitFormData(data);
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan — coba lagi');
    return;
  }

  const recCb = document.getElementById('entryRecurring');
  if (recCb) recCb.checked = false;
  UI.closeModal();
  refresh();
}

function submitFormData(data) {
  const isLoan = LOAN_CATEGORIES.includes(data.category);

  if (isLoan) {
    const mode = data.loanMode || 'new';
    // 4 flows: Pinjemin 📤 / Balikin 📥 (terima) vs Ambil Loan 📥 / Balikin 📤 (bayar)
    if (mode === 'settle') {
      if (data.id) {
        UI.showError('Balikin tidak bisa diubah dari sini. Gunakan panel Pinjaman.');
        return;
      }
      const loanId = data.loanId || null;
      if (!loanId) return UI.showError(data.category === 'Hutang' ? 'Pilih dulu loan yang mau kamu balikin' : 'Pilih dulu siapa yang balikin ke kamu');
      const loan = Storage.getLoanById(loanId);
      if (!loan) return UI.showError('Pinjaman terpilih tidak ditemukan — pilih ulang');
      const expectedDir = data.category === 'Hutang' ? 'taken' : 'given';
      if (loan.direction !== expectedDir) return UI.showError('Pinjaman terpilih tidak sesuai kategori — pilih ulang');
      const reps = Storage.getLoanRepayments(loanId);
      const outstanding = outstandingOf(loan, reps);
      if (data.amount > outstanding + 0.01) {
        return UI.showError(`Nominal melebihi sisa ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Math.max(outstanding, 0))}`);
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
      if (!data.person) return UI.showError(data.category === 'Hutang' ? 'Tulis dulu dari siapa ambil loan' : 'Tulis dulu ke siapa kasih pinjam');

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
          paymentDetail: data.paymentDetail
        });
        UI.showSuccess(data.category === 'Hutang' ? `Oke, kamu pinjam ${Reports.formatCurrency(data.amount)} dari ${data.person} 💰` : `Kasih pinjam ${Reports.formatCurrency(data.amount)} ke ${data.person} 📤`);
      }
    }
  } else {
    if (data.id) {
      const existing = Storage.getEntryById(data.id);
      if (existing && existing.loanId) {
        UI.showError('Transaksi pinjaman tidak bisa diubah dari sini. Gunakan panel Pinjaman.');
        return;
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

function refresh() {
  loadData();
  render();
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

  UI.renderSummary(totals);
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
  renderArusKasChart(searchFiltered);
  renderDonut(categories);
  updateTableCount(paginated.length, filtered.length, sorted.length);
  syncTopSearch();
  renderBudget(searchFiltered);
  renderWallets(searchFiltered);
  checkOverdue();
  // also update full transaksi view if exists
  if (document.getElementById('viewTransaksi')) {
    // keep transaksi view in sync, but don't reset page unless needed
    renderFullTransaksi();
  }
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

function renderWallets(entries) {
  const box = document.getElementById('walletList');
  if (!box) return;
  const map = {};
  entries.forEach(e => {
    const p = e.payment || 'cash';
    if (!map[p]) map[p] = { income: 0, expense: 0 };
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') map[p].income += amt;
    else map[p].expense += amt;
  });
  const keys = Object.keys(map);
  if (!keys.length) {
    box.innerHTML = '<span style="font-size:11px;color:#94a3b8">Belum ada transaksi</span>';
    return;
  }
  const fmt = (v) => (v < 0 ? '−Rp' : 'Rp') + Math.abs(Math.round(v)).toLocaleString('id-ID');
  keys.sort((a, b) => (map[b].income - map[b].expense) - (map[a].income - map[a].expense));
  box.innerHTML = keys.map(p => {
    const net = map[p].income - map[p].expense;
    let icon = '📦', label = p;
    try { icon = Reports.getPaymentIcon(p); label = Reports.getPaymentLabel(p); } catch {}
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px">
      <span>${icon}</span>
      <span style="flex:1">${label}</span>
      <span style="font-weight:700;color:${net < 0 ? '#ef4444' : '#0f172a'}">${fmt(net)}</span>
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
function updateNotifBadge() {
  const badge = document.querySelector('#notifBtn .notif-badge');
  if (!badge) return;
  const alerts = getLoanAlerts();
  badge.textContent = String(alerts.length);
  badge.style.display = alerts.length ? 'flex' : 'none';
  const btn = document.getElementById('notifBtn');
  if (btn) btn.setAttribute('aria-label', alerts.length ? `${alerts.length} pengingat pinjaman` : 'Tidak ada pengingat');
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

function renderReport() {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);

  let reportData;
  switch (currentReportType) {
    case 'monthly':
      reportData = Reports.computeMonthlySummary(filtered);
      break;
    case 'category':
      reportData = Reports.computeCategoryBreakdown(filtered);
      break;
    case 'cashflow':
      reportData = Reports.computeCashflow(filtered);
      break;
    case 'top-expenses':
      reportData = Reports.computeTopExpenses(filtered);
      break;
  }

  UI.renderReport(currentReportType, reportData);
}

function handleClearAll() {
  if (confirm('Hapus semua transaksi? Tindakan ini tidak dapat dibatalkan.')) {
    Storage.clearAllEntries();
    Storage.clearAllLoans();
    UI.showSuccess('Semua transaksi dihapus');
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
    return `<tr><td>${e.date}</td><td>${e.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</td><td>${e.category}</td><td>${pay}</td><td>${e.description || ''}</td><td style="text-align:right">${sign} Rp${Number(e.amount).toLocaleString('id-ID')}</td><td style="text-align:right">Rp${Number(e.balance).toLocaleString('id-ID')}</td></tr>`;
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

function handleContactEdit(contactId, contactName, contactType) {
  UI.openContactForm(contactId, contactName, contactType);
}

function handleContactFormSubmit() {
  const data = UI.getContactFormData();
  if (!data.name) return UI.showError('Nama kontak wajib diisi');

  if (data.id) {
    Storage.updatePerson(data.id, data.name, data.type);
    UI.showSuccess('Kontak diperbarui');
  } else {
    Storage.savePerson(data.name, data.type);
    UI.showSuccess('Kontak ditambahkan');
  }
  UI.closeContactForm();
  UI.renderContacts(Storage.getAllPeople(), Storage.getAllLoans());
}

function handleLogout() {
  sessionStorage.removeItem('wynara_logged_in');
  document.getElementById('appRoot').classList.add('hidden');
  showLogin();
}

function openSettings() {
  const modal = document.getElementById('settingsModal');
  const budget = Storage.getBudget();
  const input = document.getElementById('budgetInput');
  if (input) input.value = budget && budget.amount ? Number(budget.amount).toLocaleString('id-ID') : '';
  const notif = document.getElementById('settingNotif');
  if (notif) notif.checked = safeLocalGet('wynara_notif') !== 'false';
  const themeBox = document.getElementById('settingTheme');
  if (themeBox) themeBox.checked = document.body.classList.contains('dark-mode');
  const lastBackupEl = document.getElementById('lastBackupLabel');
  if (lastBackupEl) {
    const last = Storage.getLastBackup();
    lastBackupEl.textContent = last
      ? `Backup terakhir: ${last.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} — cadangan otomatis aktif di browser ini`
      : 'Belum pernah backup — unduh JSON Backup biar data aman';
  }
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
      const raw = catAmt ? catAmt.value.replace(/[^0-9]/g, '') : '';
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
  const raw = input ? input.value.replace(/[^0-9]/g,'') : '';
  const amount = raw ? Number(raw) : 0;
  if (amount) Storage.saveBudget({ amount, updatedAt: new Date().toISOString() });
  else { try { localStorage.removeItem('wynara_budget'); } catch {} }
  const notif = document.getElementById('settingNotif');
  if (notif) safeLocalSet('wynara_notif', String(notif.checked));
  closeSettings();
  UI.showSuccess('Pengaturan disimpan');
  render();
}

document.addEventListener('DOMContentLoaded', init);
