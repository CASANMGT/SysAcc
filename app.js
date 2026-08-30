import * as Storage from './storage.js';
import * as Reports from './reports.js';
import * as UI from './ui.js';

let currentEntries = [];
let currentFilters = { period: 'all', type: 'all', category: 'all', startDate: null, endDate: null };
let customRange = { start: null, end: null };
let loanSearchTerm = '';
let sortColumn = 'date';
let sortDirection = 'desc';
let currentReportType = 'monthly';
let eventsBound = false;
let keyboardBound = false;
let currentPage = 1;
let transaksiPage = 1;
const pageSize = 20;
let searchBound = false;

const APP_VERSION = '1.2.0';
const LOAN_CATEGORIES = ['Piutang', 'Hutang'];

function init() {
  if (!isLoggedIn()) {
    showLogin();
    return;
  }
  showApp();
}

function isLoggedIn() {
  return sessionStorage.getItem('wynara_logged_in') === 'true';
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
    loginListenerAdded = true;
  }
}

function handleLogin(e) {
  e.preventDefault();
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  if (user === 'admin' && pass === 'admin') {
    sessionStorage.setItem('wynara_logged_in', 'true');
    document.getElementById('loginError').classList.add('hidden');
    showApp();
  } else {
    document.getElementById('loginError').classList.remove('hidden');
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
  const stored = localStorage.getItem('wynara_version');
  if (stored && stored !== APP_VERSION) {
    UI.showInfo(`Diperbarui ke v${APP_VERSION} (dari v${stored}) — lihat Changelog`);
  }
  localStorage.setItem('wynara_version', APP_VERSION);
  loadData();
  bindEvents();
  render();
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

  UI.bindCategoryChange(UI.handleCategoryChange);
  UI.bindTypeButtons(() => {});
  UI.bindFormSubmit(handleFormSubmit);
  UI.bindModalClose(UI.closeModal);
  UI.bindTableActions(handleEdit, handleDelete, handleDuplicate);
  UI.bindFilters(handleFilterChange);
  window.__onFilterChange = handleFilterChange;
  UI.bindExportImport(handleImport);
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

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
  document.getElementById('themeToggle').addEventListener('click', handleThemeToggle);

  document.getElementById('loanBtn').addEventListener('click', () => {
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary());
  });
  document.getElementById('closeLoansBtn').addEventListener('click', UI.closeLoans);
  document.getElementById('loanSearch').addEventListener('input', (e) => {
    loanSearchTerm = e.target.value;
    UI.renderLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary());
  });
  document.getElementById('addLoanBtn').addEventListener('click', () => {
    UI.closeLoans();
    UI.renderPeopleDatalist(Storage.getAllPeople());
    UI.openLoanEntry();
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
  document.getElementById('loanBtnSidebar')?.addEventListener('click', () => UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary()));
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
  document.getElementById('notifBtn')?.addEventListener('click', () => UI.showInfo('Notifikasi: 3 baru'));
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
  // Sync hidden functional buttons with sidebar
  const syncBtn = (visibleId, hiddenId) => {
    const v = document.getElementById(visibleId);
    const h = document.getElementById(hiddenId);
    if (v && h) v.addEventListener('click', () => h.click());
  };

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

  document.getElementById('changelogLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    UI.showInfo('v' + APP_VERSION + ' — lihat CHANGELOG.md untuk detail');
    const w = window.open('', '_blank');
    if (w) {
      fetch('CHANGELOG.md').then(r => r.text()).then(t => {
        w.document.write('<pre style="font-family:monospace;white-space:pre-wrap;padding:20px">' + t.replace(/</g,'&lt;') + '</pre>');
        w.document.close();
      }).catch(() => {
        w.document.write('<p>Changelog v' + APP_VERSION + '</p><p>Lihat file CHANGELOG.md di repo.</p>');
        w.document.close();
      });
    }
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

  window.__getActivePiutangPeople = () => {
    const loans = Storage.getAllLoans();
    const repayments = Storage.getAllRepayments();
    const allPeople = Storage.getAllPeople();
    const contactMap = new Map();
    allPeople.forEach(p => contactMap.set(p.name, p.type || 'person'));

    const loanSummary = new Map();
    loans.forEach(l => {
      const repaid = repayments.filter(r => r.loanId === l.id).reduce((s, r) => s + r.amount, 0);
      const outstanding = l.amount - repaid;
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
  const all = Storage.getAllLoans();
  return term ? all.filter(l => l.person.toLowerCase().includes(term)) : all;
}

function refreshLoans() {
  UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary());
  refresh();
}

function handleFormSubmit() {
  const data = UI.getFormData();
  const error = UI.validateForm(data);
  if (error) {
    UI.showError(error);
    return;
  }

  const isLoan = LOAN_CATEGORIES.includes(data.category);

  if (isLoan) {
    const direction = data.category === 'Piutang' ? 'given' : 'taken';
    if (!data.person) return UI.showError('Nama orang wajib diisi untuk pinjaman');

    if (data.id) {
      const existing = Storage.getEntryById(data.id);
      if (existing && existing.loanId) {
        Storage.updateLoan(existing.loanId, {
          direction,
          contactType: data.contactType,
          loanType: data.loanType,
          installmentAmount: data.installmentAmount,
          person: data.person,
          amount: data.amount,
          date: data.date,
          dueDate: data.loanDue,
          description: data.description
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
        person: data.person,
        amount: data.amount,
        date: data.date,
        dueDate: data.loanDue,
        description: data.description
      });
      UI.showSuccess('Pinjaman ditambahkan');
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
        UI.showInfo('Recurring diaktifkan: akan diingatkan tiap bulan');
      }
      UI.showSuccess('Transaksi ditambahkan');
    }
  }

  const recCb = document.getElementById('entryRecurring');
  if (recCb) recCb.checked = false;
  UI.closeModal();
  refresh();
}

function handleEdit(id) {
  const entry = Storage.getEntryById(id);
  if (entry) {
    UI.renderPeopleDatalist(Storage.getAllPeople());
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
    if (confirm('Hapus transaksi ini?')) {
      Storage.deleteEntry(id);
      UI.showSuccess('Transaksi dihapus');
      refresh();
    }
  }
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

function handleImport(file) {
  Storage.importExcel(file).then((result) => {
    const parts = [];
    if (result.entries) parts.push(`${result.entries} transaksi`);
    if (result.loans) parts.push(`${result.loans} pinjaman`);
    if (result.repayments) parts.push(`${result.repayments} pembayaran`);
    if (result.people) parts.push(`${result.people} kontak`);
    if (parts.length) UI.showSuccess('Data digabung: ' + parts.join(', '));
    else UI.showInfo('Tidak ada data baru (mungkin duplikat)');
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
  document.getElementById('reportModal').close();
}

function handleReportTabChange(reportType) {
  currentReportType = reportType;
  renderReport();
}

function refresh() {
  loadData();
  render();
  renderReport();
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
  
  // Apply search filter
  const searchTerm = UI.getSearchTerm();
  const searchFiltered = searchTerm 
    ? filtered.filter(e => 
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
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
  container.innerHTML = pills.map(p => `<span class="chip selected" style="font-size:11px;padding:4px 10px">${p}</span>`).join('') + ' <button class="chip" style="font-size:11px" onclick="document.querySelectorAll(\'#periodGroup .chip[data-value=all],#typeGroupFilter .chip[data-value=all],#categoryGroupFilter .chip[data-value=all]\').forEach(b=>b.click());document.getElementById(\'searchInput\').value=\'\';document.getElementById(\'searchInputTop\').value=\'\';">Reset</button>';
}

function syncTopSearch() {
  const top = document.getElementById('searchInputTop');
  const main = document.getElementById('searchInput');
  if (top && main && top.value !== main.value) top.value = main.value;
}

function renderArusKasChart(entries) {
  const svg = document.getElementById('arusKasChart');
  const monthsEl = document.getElementById('chartMonths');
  const totalEl = document.getElementById('chartTotalMasuk');
  const rataEl = document.getElementById('chartRata');
  const growthEl = document.getElementById('chartGrowth');
  if (!svg) return;
  const monthly = Reports.computeCashflow(entries);
  // Build 6-month window ending at current month (or last entry month if data exists)
  const now = new Date();
  // If we have entries, use the latest entry month as end, otherwise now
  let endDate = new Date(now.getFullYear(), now.getMonth(), 1);
  if (monthly.length) {
    const last = monthly[monthly.length - 1].month; // e.g. 2026-08
    const [y, m] = last.split('-').map(Number);
    if (y && m) endDate = new Date(y, m - 1, 1);
  }
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 5);
  const keys = Reports.getMonthsBetween(startDate, endDate);
  const map = new Map(monthly.map(d => [d.month, d]));
  const data = keys.map(k => map.get(k) || { month: k, income: 0, expense: 0 });
  const hasAny = data.some(d => d.income > 0 || d.expense > 0);
  if (!hasAny) {
    svg.innerHTML = '<text x="300" y="90" text-anchor="middle" fill="#94a3b8" font-size="12">Belum ada data</text>';
    if (monthsEl) monthsEl.innerHTML = data.map(d => `<span>${d.month.split('-')[1]}/${d.month.split('-')[0].slice(2)}</span>`).join('');
    if (totalEl) totalEl.textContent = 'Rp 0';
    if (rataEl) rataEl.textContent = 'Rp 0';
    if (growthEl) growthEl.textContent = '—';
    return;
  }
  const W = 600, H = 180, pad = { l: 0, r: 0, t: 10, b: 20 };
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  // Avoid flat line at bottom when max is small
  const yMax = max * 1.15;
  const stepX = (W - pad.l - pad.r) / 5;
  const y = (v) => H - pad.b - (v / yMax) * (H - pad.t - pad.b);
  const x = (i) => pad.l + i * stepX;
  const incomePts = data.map((d, i) => `${x(i)},${y(d.income)}`).join(' L ');
  const expensePts = data.map((d, i) => `${x(i)},${y(d.expense)}`).join(' L ');
  const areaIncome = `M ${incomePts} L ${x(5)},${H-pad.b} L ${x(0)},${H-pad.b} Z`;
  const incomeHasData = data.some(d => d.income > 0);
  const expenseHasData = data.some(d => d.expense > 0);
  svg.innerHTML = `
    ${[0,1,2,3].map(i => `<line x1="0" x2="600" y1="${pad.t + i*((H-pad.t-pad.b)/3)}" y2="${pad.t + i*((H-pad.t-pad.b)/3)}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="4 6"/>`).join('')}
    ${incomeHasData ? `<path d="${areaIncome}" fill="#10b981" fill-opacity="0.12"/>` : ''}
    ${incomeHasData ? `<path d="M ${incomePts}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${expenseHasData ? `<path d="M ${expensePts}" fill="none" stroke="#fb7185" stroke-width="2" stroke-dasharray="6 6" opacity="0.7"/>` : ''}
    ${data.map((d,i) => `<circle cx="${x(i)}" cy="${y(d.income)}" r="${i===5 ? 5 : 3}" fill="${d.income>0 ? '#10b981' : '#cbd5e1'}" stroke="white" stroke-width="2"/>`).join('')}
  `;
  const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  if (monthsEl) monthsEl.innerHTML = data.map(d => {
    const [y, m] = d.month.split('-').map(Number);
    const label = monthNames[m-1] || m;
    return `<span>${label}</span>`;
  }).join('');
  const total = data.reduce((a,b)=>a+b.income,0);
  if (totalEl) totalEl.textContent = new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(total);
  if (rataEl) rataEl.textContent = new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Math.round(total / 6));
  if (growthEl) {
    const last = data[5].income;
    const prev = data[4].income;
    if (prev === 0 && last > 0) { growthEl.textContent = '+100%'; growthEl.style.color = '#047857'; }
    else if (prev === 0 && last === 0) { growthEl.textContent = '—'; growthEl.style.color = '#64748b'; }
    else {
      const pct = Math.round(((last - prev)/ (prev||1))*100);
      growthEl.textContent = (pct>0?'+':'')+pct+'%';
      growthEl.style.color = pct>=0 ? '#047857' : '#be123c';
    }
  }
}

function renderDonut(categories) {
  const totalEl = document.getElementById('donutTotal');
  const legend = document.getElementById('donutLegend');
  const empty = document.getElementById('donutEmpty');
  const arc = document.getElementById('donutArc');
  const expenseCats = categories.filter(c => c.type === 'expense');
  const total = expenseCats.reduce((a,b)=>a+b.total,0);
  if (totalEl) totalEl.textContent = new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:2}).format(total);
  if (!expenseCats.length) {
    if (arc) { arc.setAttribute('stroke-dasharray','2 8'); arc.setAttribute('stroke','#e2e8f0'); }
    if (legend) legend.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';
  // simple donut: first category arc
  const colors = ['#fbbf24','#60a5fa','#a78bfa','#cbd5e1'];
  if (legend) {
    legend.innerHTML = expenseCats.slice(0,4).map((c,i) => {
      const pct = ((c.total/total)*100).toFixed(0);
      return `<div class="donut-legend-item"><span><span class="donut-dot" style="background:${colors[i%colors.length]}"></span> ${Reports.getCategoryLabel(c.category)}</span><span style="color:#64748b">${pct}%</span></div>`;
    }).join('');
  }
  if (arc) {
    const pct = Math.min(100, Math.round((expenseCats[0].total/total)*100));
    const circ = 2*Math.PI*36;
    const dash = (pct/100)*circ;
    arc.setAttribute('stroke', colors[0]);
    arc.setAttribute('stroke-dasharray', `${dash} ${circ-dash}`);
    arc.setAttribute('opacity','1');
  }
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
}

let overdueNotified = false;
function checkOverdue() {
  if (overdueNotified) return;
  const setting = document.getElementById('settingNotif');
  const enabled = setting ? setting.checked : true;
  const stored = localStorage.getItem('wynara_notif');
  const isEnabled = stored ? stored === 'true' : enabled;
  if (!isEnabled) return;
  const loans = Storage.getAllLoans();
  const today = new Date().toISOString().split('T')[0];
  const overdue = loans.filter(l => l.status !== 'paid' && l.dueDate && l.dueDate < today);
  if (overdue.length) {
    overdueNotified = true;
    UI.showWarning(`${overdue.length} pinjaman terlambat! Cek menu Pinjaman.`);
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
      <td style="padding:12px"><span style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:9999px;background:#f1f5f9;font-size:12px">${ikon} ${kategori}</span></td>
      <td style="padding:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.description||'')}">${escapeHtml(e.description||'-')}</td>
      <td style="padding:12px;white-space:nowrap;font-size:13px">${kontak}</td>
      <td style="padding:12px;white-space:nowrap;font-size:12px"><span style="background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:9999px">${cara}</span></td>
      <td style="padding:12px"><span style="background:${isIncome?'#ecfdf5':'#fff1f2'};color:${isIncome?'#047857':'#be123c'};padding:2px 8px;border-radius:9999px;font-size:11px">${isIncome?'↗ Masuk':'↘ Keluar'}</span></td>
      <td style="padding:12px;text-align:right;white-space:nowrap;font-weight:700;color:${isIncome?'#059669':'#dc2626'};font-family:monospace">${sign} ${amt}</td>
      <td style="padding:12px;text-align:right">
        <button class="btn btn-ghost" onclick="document.dispatchEvent(new CustomEvent('wynara:edit',{detail:'${e.id}'}))" style="padding:2px 6px;font-size:12px">✎</button>
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
        (e.person && e.person.toLowerCase().includes(searchTerm))
      )
    : filtered;
  const withBalance = Reports.computeRunningBalance(searchFiltered);
  const sorted = sortEntries(withBalance);
  const totals = Reports.computeTotals(searchFiltered);

  const rows = sorted.map(e => {
    const sign = e.type === 'income' ? '+' : '-';
    return `<tr><td>${e.date}</td><td>${e.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</td><td>${e.category}</td><td>${e.payment || ''}</td><td>${e.description || ''}</td><td style="text-align:right">${sign} Rp${Number(e.amount).toLocaleString('id-ID')}</td><td style="text-align:right">Rp${Number(e.balance).toLocaleString('id-ID')}</td></tr>`;
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
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('themeToggle');
  const btn2 = document.getElementById('themeToggleSidebar');
  if (btn) btn.setAttribute('aria-label', isDark ? 'Light mode' : 'Dark mode');
  if (btn2) btn2.setAttribute('aria-label', isDark ? 'Light mode' : 'Dark mode');
  UI.showInfo(isDark ? 'Mode gelap aktif' : 'Mode terang aktif');
}

function handleRepayClick(loanId) {
  const loan = Storage.getLoanById(loanId);
  if (!loan) return;
  const reps = Storage.getLoanRepayments(loanId);
  const paid = reps.reduce((s, r) => s + r.amount, 0);
  const outstanding = loan.amount - paid;
  UI.openRepayModal(loanId, outstanding);
}

function handleRepaySubmit() {
  const data = UI.getRepayFormData();
  const loan = Storage.getLoanById(data.loanId);
  if (!loan) return UI.showError('Pinjaman tidak ditemukan');
  if (!data.amount || data.amount <= 0) return UI.showError('Jumlah bayar harus > 0');

  const reps = Storage.getLoanRepayments(data.loanId);
  const paid = reps.reduce((s, r) => s + r.amount, 0);
  const outstanding = loan.amount - paid;
  if (data.amount > outstanding + 0.01) {
    return UI.showError(`Jumlah melebihi sisa: ${new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR'}).format(outstanding)}`);
  }

  Storage.addRepayment(data);
  UI.showSuccess('Pembayaran dicatat');
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
  if (confirm('Hapus pembayaran ini?')) {
    Storage.deleteRepayment(repayId);
    UI.showSuccess('Pembayaran dihapus');
    refreshLoans();
  }
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
  const lang = document.getElementById('settingLang');
  if (lang) lang.value = localStorage.getItem('wynara_lang') || 'id';
  const notif = document.getElementById('settingNotif');
  if (notif) notif.checked = localStorage.getItem('wynara_notif') !== 'false';
  const list = document.getElementById('customCategoryList');
  if (list) {
    const cats = Storage.getCategories();
    const predefined = new Set([...Reports.CATEGORY_OPTIONS.income.map(o=>o.value), ...Reports.CATEGORY_OPTIONS.expense.map(o=>o.value)]);
    const customs = cats.filter(c => !predefined.has(c));
    if (!customs.length) list.innerHTML = '<span style="font-size:11px;color:#94a3b8">Tidak ada kategori custom</span>';
    else list.innerHTML = customs.map(c => {
      const cnt = currentEntries.filter(e => e.category === c).length;
      return `<span class="chip" style="font-size:11px">${c} <small>(${cnt})</small> <button data-cat="${c}" class="del-cat" style="margin-left:4px;background:none;border:none;cursor:pointer;color:#ef4444">×</button></span>`;
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
  else localStorage.removeItem('wynara_budget');
  const lang = document.getElementById('settingLang');
  if (lang) localStorage.setItem('wynara_lang', lang.value);
  const notif = document.getElementById('settingNotif');
  if (notif) localStorage.setItem('wynara_notif', String(notif.checked));
  closeSettings();
  UI.showSuccess('Pengaturan disimpan');
  render();
}

document.addEventListener('DOMContentLoaded', init);
