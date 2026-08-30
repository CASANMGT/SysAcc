import { formatCurrency, formatDate, formatMonth, formatCurrencyCompact, getCategoryLabel, getCategoryIcon, getCategoryType, CATEGORY_OPTIONS, getPaymentLabel, getPaymentIcon } from './reports.js';

const elements = {
  entriesBody: document.getElementById('entriesBody'),
  emptyState: document.getElementById('emptyState'),
  totalIncome: document.getElementById('totalIncome'),
  totalExpense: document.getElementById('totalExpense'),
  netBalance: document.getElementById('netBalance'),
  categoryList: document.getElementById('categoryList'),
  entryModal: document.getElementById('entryModal'),
  entryForm: document.getElementById('entryForm'),
  modalTitle: document.getElementById('modalTitle'),
  entryId: document.getElementById('entryId'),
  entryDate: document.getElementById('entryDate'),
  entryType: document.getElementById('entryType'),
  entryCategory: document.getElementById('entryCategory'),
  customCategory: document.getElementById('customCategory'),
  entryDescription: document.getElementById('entryDescription'),
  entryAmount: document.getElementById('entryAmount'),
  entryLoanId: document.getElementById('entryLoanId'),
  loanFieldsGroup: document.getElementById('loanFieldsGroup'),
  entryLoanPerson: document.getElementById('entryLoanPerson'),
  entryLoanDue: document.getElementById('entryLoanDue'),
  loanTypeGroup: document.getElementById('loanTypeGroup'),
  installmentGroup: document.getElementById('installmentGroup'),
  entryInstallment: document.getElementById('entryInstallment'),
  entryLoanType: document.getElementById('entryLoanType'),
  entryInstallmentAmount: document.getElementById('entryInstallmentAmount'),
  contactTypeGroup: document.getElementById('contactTypeGroup'),
  entryContactType: document.getElementById('entryContactType'),
  reportSection: document.getElementById('reportModal'),
  reportContent: document.getElementById('reportContent'),
  closeReportBtn: document.getElementById('closeReportBtn'),
  reportTabs: document.querySelectorAll('.report-tab'),
  customDateModal: document.getElementById('customDateModal'),
  customStartDate: document.getElementById('customStartDate'),
  customEndDate: document.getElementById('customEndDate'),
  customDateClose: document.getElementById('customDateClose'),
  customDateCancel: document.getElementById('customDateCancel'),
  customDateApply: document.getElementById('customDateApply'),
  typeGroup: document.getElementById('typeGroup'),
  categoryGroup: document.getElementById('categoryGroup'),
  paymentGroup: document.getElementById('paymentGroup'),
  entryPayment: document.getElementById('entryPayment'),
  loansSection: document.getElementById('loansModal'),
  loanList: document.getElementById('loanList'),
  totalPiutang: document.getElementById('totalPiutang'),
  totalHutang: document.getElementById('totalHutang'),
  loanNet: document.getElementById('loanNet'),
  dashPiutangVal: document.getElementById('dashPiutangVal'),
  dashHutangVal: document.getElementById('dashHutangVal'),
  repayModal: document.getElementById('repayModal'),
  repayForm: document.getElementById('repayForm'),
  repayLoanId: document.getElementById('repayLoanId'),
  repayAmount: document.getElementById('repayAmount'),
  repayDate: document.getElementById('repayDate'),
  repayDesc: document.getElementById('repayDesc'),
  searchInput: document.getElementById('searchInput'),
  searchResultsCount: document.getElementById('searchResultsCount'),
  toastContainer: document.getElementById('toastContainer')
};

let searchTerm = '';
let searchTimeout = null;

export function initSearch(onSearch) {
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchTerm = e.target.value.trim().toLowerCase();
        onSearch(searchTerm);
      }, 150);
    });
  }
}

export function getSearchTerm() {
  return searchTerm;
}

export function clearSearch() {
  searchTerm = '';
  if (elements.searchInput) elements.searchInput.value = '';
}

export function updateSearchResultsCount(count, total) {
  if (elements.searchResultsCount) {
    if (searchTerm && count !== total) {
      elements.searchResultsCount.textContent = `Menampilkan ${count} dari ${total} transaksi`;
    } else {
      elements.searchResultsCount.textContent = '';
    }
  }
}

/* Toast notifications */
export function showToast(message, type = 'info', duration = 3000) {
  const container = elements.toastContainer;
  if (!container) return;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Tutup">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => removeToast(toast));

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }

  return toast;
}

function removeToast(toast) {
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => toast.remove());
}

export function showError(message) {
  showToast(message, 'error', 5000);
}

export function showSuccess(message) {
  showToast(message, 'success', 3000);
}

export function showWarning(message) {
  showToast(message, 'warning', 4000);
}

export function showInfo(message) {
  showToast(message, 'info', 3000);
}

export function renderEntries(entries) {
  const body = elements.entriesBody;
  const empty = elements.emptyState;
  if (!body || !empty) return;
  if (entries.length === 0) {
    const term = getSearchTerm();
    body.innerHTML = '';
    empty.classList.remove('hidden');
    const p = empty.querySelector('p');
    if (p) p.textContent = term ? `Tidak ada hasil untuk "${term}"` : 'Belum ada transaksi';
    return;
  }

  empty.classList.add('hidden');
  body.innerHTML = entries.map((e) => {
    const isIncome = e.type === 'income';
    const sign = isIncome ? '+' : '-';
    const isLoan = !!e.loanId;
    const amt = Number(e.amount) || 0;
    const actions = isLoan
      ? '<span class="muted-tag">di Pinjaman</span>'
      : `<div class="table-row-actions">
         <button class="btn btn-ghost edit-btn" data-id="${e.id}" aria-label="Edit" title="Edit">✎</button>
         <button class="btn btn-ghost duplicate-btn" data-id="${e.id}" aria-label="Duplikasi" title="Duplikasi">📋</button>
         <button class="btn btn-danger delete-btn" data-id="${e.id}" aria-label="Hapus" title="Hapus">🗑</button>
        </div>`;
    // Fix amount: keep Rp, nowrap, no break on comma
    const amtStr = formatCurrency(amt).replace(/\s/g, '');
    // For piutang, show person in description if empty
    const desc = e.description || (isLoan && e.person ? `→ ${e.person}` : '-');
    const rowClass = isLoan ? 'loan-row' : (isIncome ? 'tr-income' : 'tr-expense');
    return `
      <tr data-id="${e.id}" class="${rowClass}">
        <td style="white-space:nowrap">${formatDate(e.date)}</td>
        <td><span class="category-tag">${getCategoryIcon(e.category)} ${getCategoryLabel(e.category)}</span></td>
        <td title="${escapeHtml(desc)}" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(desc)}</td>
        <td><span class="payment-tag" title="${escapeHtml(e.paymentDetail || '')}">${getPaymentIcon(e.payment)} ${getPaymentLabel(e.payment)}${e.paymentDetail ? ' • ' + escapeHtml(e.paymentDetail) : ''}</span></td>
        <td><span class="type-badge ${isIncome ? 'income' : 'expense'}" style="font-size:11px;padding:3px 10px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${isIncome ? '↗ Masuk' : '↘ Keluar'}</span></td>
        <td class="amount-col ${isIncome ? 'income' : 'expense'}" style="white-space:nowrap;text-align:right;font-weight:700;font-size:13px">${sign} ${amtStr}</td>
        <td class="actions-col">${actions}</td>
      </tr>
    `;
  }).join('');
}

export function renderSummary({ income, expense, net, incomeCount, expenseCount }) {
  elements.totalIncome.textContent = formatCurrency(income);
  elements.totalExpense.textContent = formatCurrency(expense);
  elements.netBalance.textContent = formatCurrency(net);
  elements.netBalance.className = 'dash-card-value ' + (net >= 0 ? 'income' : 'expense');
  const ic = document.getElementById('totalIncomeCount');
  const ec = document.getElementById('totalExpenseCount');
  if (ic) ic.textContent = (incomeCount || 0) + ' transaksi';
  if (ec) ec.textContent = (expenseCount || 0) + ' transaksi';
}

export function renderLoanTotals(piutang, hutang, piutangCount, hutangCount) {
  if (elements.dashPiutangVal) elements.dashPiutangVal.textContent = formatCurrency(piutang);
  if (elements.dashHutangVal) elements.dashHutangVal.textContent = formatCurrency(hutang);
  const pc = document.getElementById('dashPiutangCount');
  const hc = document.getElementById('dashHutangCount');
  if (pc) pc.textContent = piutangCount + ' pinjaman aktif';
  if (hc) hc.textContent = hutangCount + ' pinjaman aktif';
  const netVal = document.getElementById('dashNetLoanVal');
  const netSub = document.getElementById('dashNetLoanSub');
  if (netVal) {
    const net = piutang - hutang;
    netVal.textContent = formatCurrency(Math.abs(net));
    netVal.className = 'dash-card-value ' + (net >= 0 ? 'income' : 'expense');
  }
  if (netSub) netSub.textContent = 'Piutang − Hutang';
}

export function renderCategoryBreakdown(categories) {
  if (!categories.length) {
    elements.categoryList.innerHTML = '<p style="color:var(--text-muted);padding:12px 16px;">Belum ada data kategori untuk filter ini.</p>';
    return;
  }
  const maxTotal = Math.max(...categories.map(c => c.total), 1);
  elements.categoryList.innerHTML = categories.map(c => {
    const pct = (c.total / maxTotal) * 100;
    const typeClass = c.type === 'income' ? 'income' : 'expense';
    return `
      <div class="category-row">
        <div class="category-info">
          <span class="category-name">${getCategoryIcon(c.category)} ${getCategoryLabel(c.category)}</span>
          <span class="category-amount ${typeClass}">${formatCurrency(c.total)}</span>
        </div>
        <div class="category-bar">
          <div class="category-bar-fill ${typeClass}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

let txBound = false;
export function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  modal.addEventListener('keydown', handler);
  modal._trapHandler = handler;
  setTimeout(() => first.focus(), 50);
}
export function releaseFocus(modal) {
  if (modal && modal._trapHandler) {
    modal.removeEventListener('keydown', modal._trapHandler);
    delete modal._trapHandler;
  }
}
function syncTxDate() {
  const d = elements.entryDate.value || new Date().toISOString().split('T')[0];
  const label = document.getElementById('txDateLabel');
  const hiddenInput = document.getElementById('txDateInput');
  if (label) {
    try {
      const dt = new Date(d);
      label.textContent = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { label.textContent = d; }
  }
  if (hiddenInput) hiddenInput.value = d;
}
function updateTxAmountVisual() {
  const input = elements.entryAmount;
  const bar = document.getElementById('txAmountBar');
  const hint = document.getElementById('txAmountHint');
  const prefix = document.getElementById('txAmountPrefix');
  const submit = document.getElementById('txSubmitBtn');
  const raw = parseFormattedNumber(input ? input.value : '');
  const has = raw > 0;
  if (bar) bar.classList.toggle('has-value', has);
  if (prefix) prefix.classList.toggle('has-value', has);
  if (hint) {
    if (!has) {
      hint.textContent = 'Ketuk untuk memasukkan nominal • Otomatis format Rupiah';
      hint.classList.remove('has-value');
    } else {
      const compact = raw >= 1000 ? new Intl.NumberFormat('en-US', { notation: 'compact' }).format(raw) + ' rupiah' : 'Nominal valid';
      const jenis = elements.entryType.value === 'income' ? 'Akan menambah saldo' : 'Akan mengurangi saldo';
      hint.textContent = `≈ ${compact} • ${jenis}`;
      hint.classList.add('has-value');
    }
  }
  if (submit) submit.disabled = !has;
}
function updateTxDescCount() {
  const ta = elements.entryDescription;
  const cnt = document.getElementById('txDescCount');
  if (ta && cnt) cnt.textContent = `${ta.value.length}/100`;
}
function updateTxMetaBar() {
  const bar = document.getElementById('txMetaBar');
  if (!bar) return;
  const amt = parseFormattedNumber(elements.entryAmount.value || '');
  const amtStr = amt > 0 ? formatCurrency(amt) : '—';
  const jenis = elements.entryType.value === 'income' ? 'pemasukan' : 'pengeluaran';
  const catSel = document.querySelector('#categoryGroup .select-btn.selected');
  const catLabel = catSel ? catSel.querySelector('.tx-cat-label')?.textContent || catSel.textContent.trim() : '—';
  const isLoan = elements.entryCategory.value === 'Piutang' || elements.entryCategory.value === 'Hutang';
  const loanExtra = isLoan && elements.entryLoanPerson.value ? ` → ${escapeHtml(elements.entryLoanPerson.value)} • ${elements.entryLoanType.value}` : '';
  bar.innerHTML = `<span>Amount: ${escapeHtml(amtStr)}</span><span class="capitalize">${escapeHtml(jenis)}</span><span>${escapeHtml(catLabel)}</span>${loanExtra ? `<span class="tx-meta-blue">${loanExtra}</span>` : ''}`;
}
function updateTxContactSelected() {
  const wrap = document.getElementById('txContactSelected');
  const input = elements.entryLoanPerson;
  if (!wrap || !input) return;
  const name = input.value.trim();
  if (!name) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  const people = window.__getActivePiutangPeople ? window.__getActivePiutangPeople() : [];
  const found = people.find(p => p.name.toLowerCase() === name.toLowerCase());
  const sisa = found ? found.outstanding : 0;
  const initial = name[0]?.toUpperCase() || '?';
  wrap.classList.remove('hidden');
  wrap.innerHTML = `<div class="tx-avatar">${escapeHtml(initial)}</div><div style="flex:1;min-width:0"><div class="tx-contact-name">${escapeHtml(name)}</div>${sisa > 0 ? `<div class="tx-contact-sisa">Sisa piutang ${escapeHtml(formatCurrency(sisa))}</div>` : ''}</div><button type="button" id="txContactChangeBtn" class="tx-contact-change">Ganti</button>`;
  const btn = document.getElementById('txContactChangeBtn');
  if (btn) btn.addEventListener('click', () => { input.value = ''; input.focus(); updateTxContactSelected(); document.getElementById('quickSelectPiutang')?.classList.remove('hidden'); });
}
let tenorSyncing = false;
function updateTxTenorInfo() {
  const info = document.getElementById('txTenorInfo');
  if (!info) return;
  const amt = parseFormattedNumber(elements.entryAmount?.value || '');
  const cicilanInput = elements.entryInstallment;
  const tenorInput = document.getElementById('entryTenor');
  const cicilan = parseFormattedNumber(cicilanInput?.value || '');
  const tenorVal = tenorInput ? parseInt(String(tenorInput.value).replace(/[^0-9]/g,''), 10) || 0 : 0;
  const isCicilan = elements.entryLoanType?.value === 'cicilan';
  const loanVisible = elements.loanFieldsGroup && !elements.loanFieldsGroup.hidden;
  if (!loanVisible || !isCicilan) { info.classList.remove('show'); info.innerHTML=''; return; }
  if (!amt) {
    info.classList.add('show');
    info.innerHTML = 'Masukkan nominal transaksi di atas untuk menghitung cicilan/tenor';
    return;
  }
  if ((!cicilan || cicilan <= 0) && (!tenorVal || tenorVal <= 0)) {
    info.classList.add('show');
    info.innerHTML = `Pinjaman <strong>${formatCurrency(amt)}</strong> • Isi <strong>cicilan/bulan</strong> atau <strong>tenor</strong>, sistem hitung otomatis`;
    return;
  }
  // auto-sync the empty field
  if (!tenorSyncing) {
    tenorSyncing = true;
    if (cicilan && cicilan > 0 && (!tenorVal || tenorVal <= 0 || document.activeElement === cicilanInput)) {
      const tenorCalc = Math.ceil(amt / cicilan);
      if (tenorInput && tenorCalc > 0 && tenorCalc <= 360) tenorInput.value = String(tenorCalc);
    } else if (tenorVal && tenorVal > 0 && (!cicilan || cicilan <= 0 || document.activeElement === tenorInput)) {
      const cicilanCalc = Math.ceil(amt / tenorVal);
      if (cicilanInput && cicilanCalc > 0) cicilanInput.value = formatIdrInput(cicilanCalc);
    }
    setTimeout(() => { tenorSyncing = false; }, 50);
  }
  const finalCicilan = parseFormattedNumber(cicilanInput?.value || '');
  const finalTenor = tenorInput ? parseInt(String(tenorInput.value).replace(/[^0-9]/g,''), 10) || 0 : 0;
  if (finalCicilan && finalCicilan > 0) {
    const tenor = Math.ceil(amt / finalCicilan);
    const last = amt - finalCicilan * (tenor - 1);
    info.classList.add('show');
    if (tenor === 1) info.innerHTML = `Tenor <strong>1 bulan</strong> • Lunas ${formatCurrency(amt)}`;
    else if (last <= 0 || last === finalCicilan) info.innerHTML = `Tenor <strong>${tenor} bulan</strong> • ${formatCurrency(finalCicilan)} × ${tenor} • Total ${formatCurrency(amt)}`;
    else info.innerHTML = `Tenor <strong>${tenor} bulan</strong> • ${formatCurrency(finalCicilan)} × ${tenor-1} + ${formatCurrency(last)} • Total ${formatCurrency(amt)}`;
  } else if (finalTenor && finalTenor > 0) {
    const cicilanCalc = Math.ceil(amt / finalTenor);
    info.classList.add('show');
    info.innerHTML = `Cicilan <strong>${formatCurrency(cicilanCalc)}/bulan</strong> • Tenor ${finalTenor} bulan • Total ${formatCurrency(amt)}`;
  }
}

function bindTxOnce() {
  if (txBound) return;
  txBound = true;
  const pill = document.getElementById('txDatePill');
  const dateInput = document.getElementById('txDateInput');
  const hiddenDate = elements.entryDate;
  if (pill && dateInput && hiddenDate) {
    pill.addEventListener('click', () => { try { dateInput.showPicker && dateInput.showPicker(); } catch {}; dateInput.focus(); dateInput.click(); });
    dateInput.addEventListener('change', () => { hiddenDate.value = dateInput.value; syncTxDate(); });
    hiddenDate.addEventListener('change', syncTxDate);
  }
  if (elements.entryAmount) {
    elements.entryAmount.addEventListener('input', () => { updateTxAmountVisual(); updateTxMetaBar(); updateTxTenorInfo(); });
    elements.entryAmount.addEventListener('blur', () => { updateTxAmountVisual(); updateTxTenorInfo(); });
  }
  if (elements.entryDescription) {
    elements.entryDescription.addEventListener('input', () => { updateTxDescCount(); });
  }
  if (elements.entryLoanPerson) {
    elements.entryLoanPerson.addEventListener('input', () => { updateTxContactSelected(); updateTxMetaBar(); });
    elements.entryLoanPerson.addEventListener('focus', () => { const qs = document.getElementById('quickSelectPiutang'); if (qs) qs.classList.remove('hidden'); });
  }
  const contactToggle = document.getElementById('txContactToggle');
  if (contactToggle) {
    contactToggle.addEventListener('click', () => {
      const qs = document.getElementById('quickSelectPiutang');
      const dd = document.getElementById('txContactDropdown');
      if (qs) qs.classList.toggle('hidden');
      if (dd) dd.classList.toggle('hidden');
      populateTxContactDropdown();
    });
  }
  if (elements.entryInstallment) {
    elements.entryInstallment.addEventListener('input', () => { updateTxMetaBar(); updateTxTenorInfo(); });
  }
  const entryTenorEl = document.getElementById('entryTenor');
  if (entryTenorEl) {
    entryTenorEl.addEventListener('input', () => { updateTxMetaBar(); updateTxTenorInfo(); });
  }
  if (elements.entryAmount) {
    const loanToggles = elements.loanTypeGroup?.querySelectorAll('.select-btn');
    loanToggles?.forEach(btn => btn.addEventListener('click', () => setTimeout(updateTxTenorInfo, 50)));
  }
}

function populateTxContactDropdown() {
  const dd = document.getElementById('txContactDropdown');
  if (!dd) return;
  if (!window.__getActivePiutangPeople) { dd.innerHTML = '<div class="tx-dd-header">Memuat...</div>'; return; }
  const people = window.__getActivePiutangPeople();
  if (people.length === 0) {
    dd.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;font-size:13px">Belum ada kontak. Tambah di menu Kontak.</div>';
    return;
  }
  dd.innerHTML = `<div class="tx-dd-header">Kontak tersimpan • ${people.length}</div><div style="max-height:240px;overflow:auto;padding:8px">` + people.map(p => {
    const icon = p.type === 'perusahaan' ? '🏢' : '👤';
    const sisa = p.hasLoan ? ` · ${formatCurrency(p.outstanding)}` : '';
    const initial = p.name[0]?.toUpperCase() || '?';
    return `<button type="button" class="tx-dd-item" data-name="${escapeHtml(p.name)}" data-type="${p.type}"><span class="tx-dd-avatar">${escapeHtml(initial)}</span><span style="flex:1;text-align:left"><span style="font-weight:600;color:#0f172a">${escapeHtml(p.name)}</span><span style="font-size:11.5px;color:#64748b;display:block">${icon} ${p.type}${sisa}</span></span></button>`;
  }).join('') + `</div>`;
  dd.querySelectorAll('.tx-dd-item').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.entryLoanPerson.value = btn.dataset.name;
      elements.entryContactType.value = btn.dataset.type;
      setSelected(elements.contactTypeGroup, btn.dataset.type);
      dd.classList.add('hidden');
      document.getElementById('quickSelectPiutang')?.classList.add('hidden');
      updateTxContactSelected();
      updateTxMetaBar();
    });
  });
}

export function openModal(entry = null) {
  if (entry) {
    elements.modalTitle.textContent = 'Edit Transaksi';
    elements.entryId.value = entry.id;
    elements.entryDate.value = entry.date;
    elements.entryType.value = entry.type;
    setSelected(elements.typeGroup, entry.type);
    const bg = document.getElementById('txSegmentBg');
    if (bg) bg.className = 'tx-segment-bg ' + (entry.type === 'income' ? 'tx-segment-income' : 'tx-segment-expense');
    const hint = document.getElementById('txJenisHint');
    if (hint) hint.innerHTML = entry.type === 'income' ? '<span class="tx-dot tx-dot-income"></span> Uang masuk • Saldo bertambah, kategori pemasukan' : '<span class="tx-dot tx-dot-expense"></span> Uang keluar • Saldo berkurang, kategori pengeluaran & piutang';
    renderCategoryButtons(entry.type);
    selectCategory(entry.category);
    elements.entryPayment.value = entry.payment || 'cash';
    setSelected(elements.paymentGroup, entry.payment || 'cash');
    updatePaymentDetail(entry.payment || 'cash');
    // restore paymentDetail fields
    if (entry.paymentDetail) {
      const pd = entry.paymentDetail;
      if (entry.payment === 'credit') {
        const parts = pd.split('•').map(s=>s.trim());
        const bankEl = document.getElementById('paymentCCBank');
        const lastEl = document.getElementById('paymentCCLast4');
        if (bankEl) bankEl.value = parts[0] || '';
        if (lastEl) lastEl.value = parts[1] || '';
      } else if (entry.payment === 'debit') {
        const parts = pd.split('•').map(s=>s.trim());
        const bankEl = document.getElementById('paymentDebitBank');
        const lastEl = document.getElementById('paymentDebitLast4');
        if (bankEl) bankEl.value = parts[0] || '';
        if (lastEl) lastEl.value = parts[1] || '';
      } else if (entry.payment === 'qris') {
        const el = document.getElementById('paymentQRISProvider');
        if (el) el.value = pd;
      } else if (entry.payment === 'ewallet') {
        const el = document.getElementById('paymentEWalletProvider');
        if (el) el.value = pd;
      } else if (entry.payment === 'paylater') {
        const el = document.getElementById('paymentPaylaterProvider');
        if (el) el.value = pd;
      } else if (entry.payment === 'transfer') {
        const el = document.getElementById('paymentTransferBank');
        if (el) el.value = pd;
      }
    } else {
      ['paymentCCBank','paymentCCLast4','paymentQRISProvider','paymentEWalletProvider','paymentPaylaterProvider','paymentTransferBank','paymentDebitBank','paymentDebitLast4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    }
    elements.entryDescription.value = entry.description;
    elements.entryAmount.value = formatIdrInput(entry.amount);
    elements.entryLoanId.value = entry.loanId || '';
    if (entry.loanId) {
      elements.loanFieldsGroup.hidden = false;
      elements.entryLoanPerson.value = entry.person || '';
      elements.entryLoanDue.value = entry.loanDue || '';
      const lt = entry.loanType || 'lunas';
      elements.entryLoanType.value = lt;
      setSelected(elements.loanTypeGroup, lt);
      elements.installmentGroup.hidden = lt !== 'cicilan';
      elements.entryInstallment.value = entry.installmentAmount ? formatIdrInput(entry.installmentAmount) : '';
      elements.entryInstallmentAmount.value = entry.installmentAmount || 0;
      const ct = entry.contactType || 'person';
      elements.entryContactType.value = ct;
      setSelected(elements.contactTypeGroup, ct);
      const tenorElEdit = document.getElementById('entryTenor');
      if (tenorElEdit) {
        if (entry.installmentAmount && entry.amount) {
          const t = Math.ceil(Number(entry.amount) / Number(entry.installmentAmount));
          tenorElEdit.value = String(t > 0 && t <= 360 ? t : '');
        } else {
          tenorElEdit.value = '';
        }
      }
    } else {
      elements.loanFieldsGroup.hidden = true;
      elements.entryLoanPerson.value = '';
      elements.entryLoanDue.value = '';
      elements.entryLoanType.value = 'lunas';
      setSelected(elements.loanTypeGroup, 'lunas');
      elements.installmentGroup.hidden = true;
      elements.entryInstallment.value = '';
      elements.entryInstallmentAmount.value = 0;
      elements.entryContactType.value = 'person';
      setSelected(elements.contactTypeGroup, 'person');
      elements.entryLoanId.value = '';
    }
  } else {
    elements.modalTitle.textContent = 'Tambah Transaksi';
    elements.entryForm.reset();
    elements.entryId.value = '';
    elements.entryDate.value = new Date().toISOString().split('T')[0];
    elements.entryType.value = 'expense';
    elements.entryPayment.value = 'cash';
    setSelected(elements.typeGroup, 'expense');
    const bg = document.getElementById('txSegmentBg');
    if (bg) bg.className = 'tx-segment-bg tx-segment-expense';
    const hint = document.getElementById('txJenisHint');
    if (hint) hint.innerHTML = '<span class="tx-dot tx-dot-expense"></span> Uang keluar • Saldo berkurang, kategori pengeluaran & piutang';
    renderCategoryButtons('expense');
    setSelected(elements.paymentGroup, 'cash');
    updatePaymentDetail('cash');
    ['paymentCCBank','paymentCCLast4','paymentQRISProvider','paymentEWalletProvider','paymentPaylaterProvider','paymentTransferBank','paymentDebitBank','paymentDebitLast4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const paymentWrap = document.getElementById('paymentGroupWrap');
    if (paymentWrap) paymentWrap.hidden = false;
    elements.customCategory.hidden = true;
    elements.loanFieldsGroup.hidden = true;
    elements.entryLoanPerson.value = '';
    elements.entryLoanDue.value = '';
    elements.entryLoanId.value = '';
    elements.entryLoanType.value = 'lunas';
    setSelected(elements.loanTypeGroup, 'lunas');
    elements.installmentGroup.hidden = true;
    elements.entryInstallment.value = '';
    elements.entryInstallmentAmount.value = 0;
    const tenorElNew = document.getElementById('entryTenor');
    if (tenorElNew) tenorElNew.value = '';
    elements.entryContactType.value = 'person';
    setSelected(elements.contactTypeGroup, 'person');
  }
  syncTxDate();
  updateTxAmountVisual();
  updateTxDescCount();
  updateTxMetaBar();
  updateTxContactSelected();
  updateTxTenorInfo();
  bindTxOnce();
  if (!elements.entryModal.open) {
    elements.entryModal.showModal();
    trapFocus(elements.entryModal);
  } else {
    trapFocus(elements.entryModal);
  }
}

export function closeModal() {
  releaseFocus(elements.entryModal);
  if (elements.entryModal && elements.entryModal.open) {
    try { elements.entryModal.close(); } catch {}
  }
  if (elements.entryForm) elements.entryForm.reset();
  document.getElementById('txContactDropdown')?.classList.add('hidden');
  document.getElementById('quickSelectPiutang')?.classList.add('hidden');
}

function setSelected(group, value) {
  group.querySelectorAll('.select-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.value === value);
  });
}

function renderCategoryButtons(type) {
  const options = type === 'income' ? CATEGORY_OPTIONS.income : CATEGORY_OPTIONS.expense;
  const totalOpts = options.length + 1;
  elements.categoryGroup.innerHTML = options.map(opt => {
    const isLoanCat = opt.value === 'Piutang' || opt.value === 'Hutang';
    const sub = isLoanCat ? 'Pinjaman' : 'Pilih';
    return `<button type="button" class="select-btn" data-value="${opt.value}">
      <span class="tx-cat-icon">${opt.icon}</span>
      <span class="tx-cat-label">${opt.label}</span>
      <span class="tx-cat-sub">${sub}</span>
      <span class="tx-cat-check">✓</span>
    </button>`;
  }).join('') + `<button type="button" class="select-btn" data-value="__custom"><span class="tx-cat-icon">➕</span><span class="tx-cat-label">Lainnya</span><span class="tx-cat-sub">Custom</span><span class="tx-cat-check">✓</span></button>`;
  const countEl = document.getElementById('txCategoryCount');
  if (countEl) countEl.textContent = `${totalOpts} pilihan • 1 terpilih`;
  elements.categoryGroup.querySelectorAll('.select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelected(elements.categoryGroup, btn.dataset.value);
      elements.entryCategory.value = btn.dataset.value;
      if (btn.dataset.value === '__custom') {
        elements.customCategory.hidden = false;
        elements.customCategory.focus();
      } else {
        elements.customCategory.hidden = true;
      }
      handleCategoryChange(btn.dataset.value);
      updateTxMetaBar();
    });
  });
  elements.entryCategory.value = '';
  elements.customCategory.hidden = true;
}

function updateTxCategoryCount(selected) {
  const el = document.getElementById('txCategoryCount');
  if (!el) return;
  const total = elements.categoryGroup ? elements.categoryGroup.querySelectorAll('.select-btn').length : 0;
  el.textContent = `${total} pilihan • 1 terpilih`;
}

function selectCategory(category) {
  const isPredefined = [...CATEGORY_OPTIONS.income, ...CATEGORY_OPTIONS.expense].some(o => o.value === category);
  if (isPredefined) {
    setSelected(elements.categoryGroup, category);
  } else {
    setSelected(elements.categoryGroup, '__custom');
  }
  elements.entryCategory.value = category;
  if (!isPredefined) {
    elements.customCategory.hidden = false;
    elements.customCategory.value = category === '__custom' ? '' : category;
  }
  handleCategoryChange(category);
}

export function bindTypeButtons(handler) {
  const updateSegment = (val) => {
    const bg = document.getElementById('txSegmentBg');
    const hint = document.getElementById('txJenisHint');
    const dot = hint ? hint.querySelector('.tx-dot') : null;
    if (bg) {
      bg.className = 'tx-segment-bg ' + (val === 'income' ? 'tx-segment-income' : 'tx-segment-expense');
    }
    if (hint) {
      if (val === 'income') {
        hint.innerHTML = '<span class="tx-dot tx-dot-income"></span> Uang masuk • Saldo bertambah, kategori pemasukan';
        if (dot) { dot.className = 'tx-dot tx-dot-income'; }
      } else {
        hint.innerHTML = '<span class="tx-dot tx-dot-expense"></span> Uang keluar • Saldo berkurang, kategori pengeluaran & piutang';
        if (dot) { dot.className = 'tx-dot tx-dot-expense'; }
      }
    }
  };
  elements.typeGroup.querySelectorAll('.select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelected(elements.typeGroup, btn.dataset.value);
      elements.entryType.value = btn.dataset.value;
      updateSegment(btn.dataset.value);
      renderCategoryButtons(btn.dataset.value);
      elements.loanFieldsGroup.hidden = true;
      const paymentWrap = document.getElementById('paymentGroupWrap');
      if (paymentWrap) paymentWrap.hidden = false;
      handler(btn.dataset.value);
      updateTxMetaBar();
    });
  });
  // init segment position
  updateSegment(elements.entryType.value || 'expense');
  elements.paymentGroup.querySelectorAll('.select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelected(elements.paymentGroup, btn.dataset.value);
      elements.entryPayment.value = btn.dataset.value;
      updatePaymentDetail(btn.dataset.value);
      updateTxMetaBar();
    });
  });
  // init payment detail visibility
  updatePaymentDetail(elements.entryPayment.value || 'cash');
  if (elements.loanTypeGroup) {
    elements.loanTypeGroup.querySelectorAll('.select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setSelected(elements.loanTypeGroup, btn.dataset.value);
        elements.entryLoanType.value = btn.dataset.value;
        const isCicilan = btn.dataset.value === 'cicilan';
        elements.installmentGroup.hidden = !isCicilan;
        if (!isCicilan) {
          elements.entryInstallment.value = '';
          elements.entryInstallmentAmount.value = 0;
        }
        updateTxTenorInfo();
        updateTxMetaBar();
      });
    });
  }
  if (elements.contactTypeGroup) {
    elements.contactTypeGroup.querySelectorAll('.select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setSelected(elements.contactTypeGroup, btn.dataset.value);
        elements.entryContactType.value = btn.dataset.value;
      });
    });
  }
}

export function handleCategoryChange(category) {
  const isLoan = category === 'Piutang' || category === 'Hutang';
  elements.loanFieldsGroup.hidden = !isLoan;
  const paymentWrap = document.getElementById('paymentGroupWrap');
  if (paymentWrap) paymentWrap.hidden = false;
  if (isLoan) {
    elements.entryLoanPerson.required = true;
    const lt = elements.entryLoanType.value || 'lunas';
    elements.installmentGroup.hidden = lt !== 'cicilan';
    const label = document.getElementById('loanPersonLabel');
    const hint = document.getElementById('quickSelectHint');
    const qsSection = document.getElementById('quickSelectPiutang');
    const qsLabel = document.getElementById('quickSelectLabel');
    if (category === 'Hutang') {
      if (label) label.textContent = 'Dari siapa?';
      if (hint) hint.textContent = 'Pilih atau ketik nama pemberi pinjaman';
      if (qsLabel) qsLabel.textContent = 'Pilih dari kontak tersimpan:';
    } else {
      if (label) label.textContent = 'Ke siapa?';
      if (hint) hint.textContent = 'Pilih atau ketik nama penerima pinjaman';
      if (qsLabel) qsLabel.textContent = 'Pilih dari kontak tersimpan:';
    }
    if (qsSection) qsSection.classList.remove('hidden');
    populateQuickSelectPiutang();
    updateTxContactSelected();
  } else {
    elements.entryLoanPerson.required = false;
    elements.entryLoanPerson.value = '';
    elements.entryLoanDue.value = '';
    elements.installmentGroup.hidden = true;
    const qsSection = document.getElementById('quickSelectPiutang');
    if (qsSection) qsSection.classList.add('hidden');
    const selWrap = document.getElementById('txContactSelected');
    if (selWrap) { selWrap.classList.add('hidden'); selWrap.innerHTML = ''; }
  }
  const isCustomCategory = category === '__custom' || ![...CATEGORY_OPTIONS.income, ...CATEGORY_OPTIONS.expense].some(o => o.value === category);
  if (isCustomCategory) {
    elements.customCategory.hidden = false;
    elements.customCategory.required = true;
  } else {
    elements.customCategory.hidden = true;
    elements.customCategory.required = false;
  }
  updateTxCategoryCount(category);
  updateTxMetaBar();
}

export function updatePaymentDetail(payment) {
  const group = document.getElementById('paymentDetailGroup');
  if (!group) return;
  const map = {
    credit: 'paymentDetailCC',
    debit: 'paymentDetailDebit',
    qris: 'paymentDetailQRIS',
    ewallet: 'paymentDetailEWallet',
    paylater: 'paymentDetailPaylater',
    transfer: 'paymentDetailTransfer'
  };
  const targetId = map[payment];
  if (targetId) {
    group.hidden = false;
    group.querySelectorAll('.payment-detail').forEach(d => d.hidden = true);
    const target = document.getElementById(targetId);
    if (target) target.hidden = false;
  } else {
    group.hidden = true;
    group.querySelectorAll('.payment-detail').forEach(d => d.hidden = true);
  }
}

function populateQuickSelectPiutang() {
  const chipsContainer = document.getElementById('quickSelectChips');
  if (!chipsContainer) return;
  if (window.__getActivePiutangPeople) {
    const people = window.__getActivePiutangPeople();
    if (people.length === 0) {
      chipsContainer.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">Belum ada kontak. Tambah di menu Kontak.</span>';
      return;
    }
    chipsContainer.innerHTML = people.map(p => {
      const icon = p.type === 'perusahaan' ? '🏢' : '👤';
      const loanTag = p.hasLoan ? ` · ${formatCurrency(p.outstanding)}` : '';
      return `<button type="button" class="quick-select-chip" data-name="${escapeHtml(p.name)}" data-type="${p.type}">${icon} ${escapeHtml(p.name)}${loanTag}</button>`;
    }).join('');
    chipsContainer.querySelectorAll('.quick-select-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        elements.entryLoanPerson.value = chip.dataset.name;
        elements.entryContactType.value = chip.dataset.type;
        setSelected(elements.contactTypeGroup, chip.dataset.type);
        updateTxContactSelected();
        updateTxMetaBar();
      });
    });
  } else {
    chipsContainer.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted);">Memuat...</span>';
  }
  populateTxContactDropdown();
}

export function getFormData() {
  let category = elements.entryCategory.value;
  if (!category) {
    const sel = elements.categoryGroup.querySelector('.select-btn.selected');
    category = sel ? sel.dataset.value : '';
  }
  if (category === '__custom' || !category) {
    category = elements.customCategory.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!category) category = 'lain-custom';
  }
  const isLoan = category === 'Piutang' || category === 'Hutang';

  const tenorEl = document.getElementById('entryTenor');
  const tenorVal = tenorEl ? parseInt(String(tenorEl.value).replace(/[^0-9]/g,''), 10) || 0 : 0;
  let installmentAmount = parseFormattedNumber(elements.entryInstallment.value);
  const amtForCalc = parseFormattedNumber(elements.entryAmount.value);
  if (isLoan && elements.entryLoanType.value === 'cicilan' && (!installmentAmount || installmentAmount <= 0) && tenorVal > 0 && amtForCalc > 0) {
    installmentAmount = Math.ceil(amtForCalc / tenorVal);
  }
  const payment = elements.entryPayment.value || 'cash';
  let paymentDetail = '';
  if (payment === 'credit') {
    const bank = document.getElementById('paymentCCBank')?.value || '';
    const last4 = document.getElementById('paymentCCLast4')?.value || '';
    if (bank || last4) paymentDetail = `${bank}${last4 ? ' • ' + last4 : ''}`.trim();
  } else if (payment === 'debit') {
    const bank = document.getElementById('paymentDebitBank')?.value || '';
    const last4 = document.getElementById('paymentDebitLast4')?.value || '';
    if (bank || last4) paymentDetail = `${bank}${last4 ? ' • ' + last4 : ''}`.trim();
  } else if (payment === 'qris') {
    paymentDetail = document.getElementById('paymentQRISProvider')?.value || '';
  } else if (payment === 'ewallet') {
    paymentDetail = document.getElementById('paymentEWalletProvider')?.value || '';
  } else if (payment === 'paylater') {
    paymentDetail = document.getElementById('paymentPaylaterProvider')?.value || '';
  } else if (payment === 'transfer') {
    paymentDetail = document.getElementById('paymentTransferBank')?.value || '';
  }
  return {
    id: elements.entryId.value || null,
    date: elements.entryDate.value,
    type: elements.entryType.value,
    category,
    payment,
    paymentDetail,
    description: elements.entryDescription.value.trim(),
    amount: parseFormattedNumber(elements.entryAmount.value),
    loanId: elements.entryLoanId.value || null,
    person: elements.entryLoanPerson.value.trim(),
    loanDue: elements.entryLoanDue ? elements.entryLoanDue.value : '',
    loanType: elements.entryLoanType.value || 'lunas',
    installmentAmount,
    contactType: elements.entryContactType.value || 'person'
  };
}

export function validateForm(data) {
  if (!data.date) return 'Tanggal wajib diisi';
  if (!data.type) return 'Jenis wajib dipilih';
  if (!data.category) return 'Kategori wajib dipilih';
  if (data.amount !== undefined && data.amount < 100) return 'Jumlah minimal Rp100';
  return null;
}

export function bindCategoryChange(handler) {
  elements.entryCategory.addEventListener('change', (e) => handler(e.target.value));
}

export function bindFormSubmit(handler) {
  elements.entryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handler();
  });
}

export function bindModalClose(handler) {
  document.getElementById('modalClose').addEventListener('click', handler);
  document.getElementById('modalCancel').addEventListener('click', handler);
  elements.entryModal.addEventListener('click', (e) => {
    if (e.target === elements.entryModal) handler();
  });
}

export function bindTableActions(onEdit, onDelete, onDuplicate) {
  elements.entriesBody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    const duplicateBtn = e.target.closest('.duplicate-btn');
    if (editBtn) onEdit(editBtn.dataset.id);
    if (deleteBtn) onDelete(deleteBtn.dataset.id);
    if (duplicateBtn && onDuplicate) onDuplicate(duplicateBtn.dataset.id);
  });
}

export function bindFilters(onFilterChange) {
  bindChipGroup('periodGroup', (value) => {
    if (value === 'custom') {
      openCustomDateModal();
      setChipSelected('periodGroup', 'all');
    } else {
      onFilterChange();
    }
  });
  bindChipGroup('typeGroupFilter', () => onFilterChange());
  bindChipGroup('categoryGroupFilter', () => onFilterChange());
}

export function getFilterValues() {
  return {
    period: getSelectedValue('periodGroup'),
    type: getSelectedValue('typeGroupFilter'),
    category: getSelectedValue('categoryGroupFilter')
  };
}

function getSelectedValue(groupId) {
  const group = document.getElementById(groupId);
  const sel = group.querySelector('.chip.selected');
  return sel ? sel.dataset.value : 'all';
}

function bindChipGroup(groupId, handler) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      setChipSelected(groupId, btn.dataset.value);
      handler(btn.dataset.value);
    });
  });
}

function setChipSelected(groupId, value) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('.chip').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.value === value);
  });
}

export function renderCategoryFilterChips(categories) {
  const group = document.getElementById('categoryGroupFilter');
  const prev = group.querySelector('.chip.selected');
  const prevValue = prev ? prev.dataset.value : 'all';
  const base = '<button type="button" class="chip category-chip" data-value="all">Semua</button>';
  const chips = categories.map(c =>
    `<button type="button" class="chip category-chip" data-value="${c}">${getCategoryIcon(c)} ${getCategoryLabel(c)}</button>`
  ).join('');
  group.innerHTML = base + chips;
  const keep = categories.includes(prevValue) ? prevValue : 'all';
  setChipSelected('categoryGroupFilter', keep);
  bindChipGroup('categoryGroupFilter', () => {
    if (window.__onFilterChange) window.__onFilterChange();
  });
}

export function bindExportImport(onImport) {
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) onImport(file);
    e.target.value = '';
  });
}

export function bindReport(onReportOpen, onReportClose, onReportTabChange, onCustomDateApply) {
  document.getElementById('reportBtn').addEventListener('click', onReportOpen);
  elements.closeReportBtn.addEventListener('click', onReportClose);
  
  elements.reportTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.reportTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      onReportTabChange(tab.dataset.report);
    });
  });

  elements.customDateClose.addEventListener('click', () => elements.customDateModal.close());
  elements.customDateCancel.addEventListener('click', () => elements.customDateModal.close());
  elements.customDateApply.addEventListener('click', () => {
    const start = elements.customStartDate.value;
    const end = elements.customEndDate.value;
    if (start && end) {
      onCustomDateApply(start, end);
      elements.customDateModal.close();
    }
  });
  elements.customDateModal.addEventListener('click', (e) => {
    if (e.target === elements.customDateModal) elements.customDateModal.close();
  });
}

export function openCustomDateModal() {
  const today = new Date().toISOString().split('T')[0];
  const firstDay = new Date();
  firstDay.setDate(1);
  elements.customStartDate.value = firstDay.toISOString().split('T')[0];
  elements.customEndDate.value = today;
  if (!elements.customDateModal.open) elements.customDateModal.showModal();
}

export function renderReport(type, data) {
  const body = elements.reportSection.querySelector('.modal-body');
  if (body) body.scrollTop = 0;

  switch (type) {
    case 'monthly':
      elements.reportContent.innerHTML = renderMonthlyReport(data);
      break;
    case 'category':
      elements.reportContent.innerHTML = renderCategoryReport(data);
      break;
    case 'cashflow':
      elements.reportContent.innerHTML = renderCashflowReport(data);
      break;
    case 'top-expenses':
      elements.reportContent.innerHTML = renderTopExpensesReport(data);
      break;
  }
}

export function openReportModal() {
  if (!elements.reportSection.open) elements.reportSection.showModal();
}

export function updateSortArrows(column, direction) {
  document.querySelectorAll('.sortable-col').forEach(th => {
    const isCurrent = th.dataset.sort === column;
    th.classList.toggle('sorted', isCurrent);
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) {
      arrow.textContent = isCurrent ? (direction === 'asc' ? '▲' : '▼') : '⇅';
    }
  });
}

function renderMonthlyReport(monthlyData) {
  if (!monthlyData.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada data untuk periode ini</p>';
  }

  return `
    <div class="report-summary">
      <div class="report-summary-item">
        <span class="label">Total Bulan</span>
        <span class="value">${monthlyData.length} bulan</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Total Pemasukan</span>
        <span class="value income">${formatCurrency(monthlyData.reduce((a, b) => a + b.income, 0))}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Total Pengeluaran</span>
        <span class="value expense">${formatCurrency(monthlyData.reduce((a, b) => a + b.expense, 0))}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Rata-rata Bulanan</span>
        <span class="value">${formatCurrency((monthlyData.reduce((a, b) => a + b.income - b.expense, 0)) / monthlyData.length || 0)}</span>
      </div>
    </div>
    <table class="report-table">
      <thead>
        <tr>
          <th>Bulan</th>
          <th class="amount-col">Pemasukan</th>
          <th class="amount-col">Pengeluaran</th>
          <th class="amount-col">Saldo</th>
          <th>Transaksi</th>
        </tr>
      </thead>
      <tbody>
        ${monthlyData.map(m => {
          const net = m.income - m.expense;
          const netClass = net >= 0 ? 'income' : 'expense';
          return `
            <tr>
              <td>${formatMonth(m.month)}</td>
              <td class="amount-col income">${formatCurrency(m.income)}</td>
              <td class="amount-col expense">${formatCurrency(m.expense)}</td>
              <td class="amount-col ${netClass}">${formatCurrency(net)}</td>
              <td>${m.count} transaksi</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderCategoryReport(categoryData) {
  if (!categoryData.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada data kategori</p>';
  }

  const incomeCats = categoryData.filter(c => c.type === 'income');
  const expenseCats = categoryData.filter(c => c.type === 'expense');
  const totalIncome = incomeCats.reduce((a, b) => a + b.total, 0);
  const totalExpense = expenseCats.reduce((a, b) => a + b.total, 0);

  return `
    <div class="report-summary">
      <div class="report-summary-item">
        <span class="label">Total Kategori</span>
        <span class="value">${categoryData.length}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Pemasukan</span>
        <span class="value income">${formatCurrency(totalIncome)}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Pengeluaran</span>
        <span class="value expense">${formatCurrency(totalExpense)}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Selisih</span>
        <span class="value ${totalIncome >= totalExpense ? 'net-positive' : 'net-negative'}">${formatCurrency(totalIncome - totalExpense)}</span>
      </div>
    </div>
    
    <div style="margin-bottom: 24px;">
      <h4 style="margin-bottom: 12px;color:var(--success);">📈 Pemasukan per Kategori</h4>
      ${renderCategoryTable(incomeCats, totalIncome, 'income')}
    </div>
    
    <div>
      <h4 style="margin-bottom: 12px;color:var(--danger);">📉 Pengeluaran per Kategori</h4>
      ${renderCategoryTable(expenseCats, totalExpense, 'expense')}
    </div>
  `;
}

function renderCategoryTable(categories, total, type) {
  if (!categories.length) {
    return '<p style="color:var(--text-muted);padding:20px;">Tidak ada data</p>';
  }
  
  return `
    <table class="report-table">
      <thead>
        <tr>
          <th>Kategori</th>
          <th class="amount-col">Jumlah</th>
          <th>Persentase</th>
          <th>Transaksi</th>
        </tr>
      </thead>
      <tbody>
        ${categories.map(c => {
          const pct = total > 0 ? ((c.total / total) * 100).toFixed(1) : 0;
          return `
            <tr>
              <td>${getCategoryIcon(c.category)} ${getCategoryLabel(c.category)}</td>
              <td class="amount-col ${type}">${formatCurrency(c.total)}</td>
              <td>
                <div class="category-bar" style="max-width: 150px;">
                  <div class="category-bar-fill ${type}" style="width: ${pct}%"></div>
                </div>
                ${pct}%
              </td>
              <td>${c.count} transaksi</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderCashflowReport(cashflowData) {
  if (!cashflowData.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada data arus kas</p>';
  }

  const maxValue = Math.max(...cashflowData.flatMap(m => [m.income, m.expense]), 1);

  return `
    <div class="report-summary">
      <div class="report-summary-item">
        <span class="label">Periode</span>
        <span class="value">${cashflowData.length} bulan</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Total Pemasukan</span>
        <span class="value income">${formatCurrency(cashflowData.reduce((a, b) => a + b.income, 0))}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Total Pengeluaran</span>
        <span class="value expense">${formatCurrency(cashflowData.reduce((a, b) => a + b.expense, 0))}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Saldo Akhir</span>
        <span class="value ${cashflowData.reduce((a, b) => a + b.income - b.expense, 0) >= 0 ? 'net-positive' : 'net-negative'}">
          ${formatCurrency(cashflowData.reduce((a, b) => a + b.income - b.expense, 0))}
        </span>
      </div>
    </div>

    <div class="cashflow-chart">
      ${cashflowData.map(m => {
        const incomePct = (m.income / maxValue) * 100;
        const expensePct = (m.expense / maxValue) * 100;
        const net = m.income - m.expense;
        return `
          <div class="cashflow-bar">
            <span class="cashflow-bar-label">${formatMonth(m.month)}</span>
            <div class="cashflow-bar-track">
              ${m.income > 0 ? `<div class="cashflow-bar-fill income" style="width: ${incomePct}%">${incomePct >= 15 ? formatCurrencyCompact(m.income) : ''}</div>` : ''}
              ${m.expense > 0 ? `<div class="cashflow-bar-fill expense" style="width: ${expensePct}%; margin-left: ${incomePct}%">${expensePct >= 15 ? formatCurrencyCompact(m.expense) : ''}</div>` : ''}
            </div>
            <span class="cashflow-bar-value ${net >= 0 ? 'income' : 'expense'}">${formatCurrency(net)}</span>
          </div>
        `;
      }).join('')}
    </div>

    <table class="report-table" style="margin-top: 24px;">
      <thead>
        <tr>
          <th>Bulan</th>
          <th class="amount-col">Pemasukan</th>
          <th class="amount-col">Pengeluaran</th>
          <th class="amount-col">Saldo Bersih</th>
          <th>Kumulatif</th>
        </tr>
      </thead>
      <tbody>
        ${(() => {
          let cumulative = 0;
          return cashflowData.map(m => {
            cumulative += m.income - m.expense;
            const cumClass = cumulative >= 0 ? 'income' : 'expense';
            return `
              <tr>
                <td>${formatMonth(m.month)}</td>
                <td class="amount-col income">${formatCurrency(m.income)}</td>
                <td class="amount-col expense">${formatCurrency(m.expense)}</td>
                <td class="amount-col ${m.income >= m.expense ? 'income' : 'expense'}">${formatCurrency(m.income - m.expense)}</td>
                <td class="amount-col ${cumClass}">${formatCurrency(cumulative)}</td>
              </tr>
            `;
          }).join('');
        })()}
      </tbody>
    </table>
  `;
}

function renderTopExpensesReport(topExpenses) {
  if (!topExpenses.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada data pengeluaran</p>';
  }

  const total = topExpenses.reduce((a, b) => a + b.total, 0);

  return `
    <div class="report-summary">
      <div class="report-summary-item">
        <span class="label">Total Top ${topExpenses.length}</span>
        <span class="value expense">${formatCurrency(total)}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Rata-rata</span>
        <span class="value">${formatCurrency(total / topExpenses.length)}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Tertinggi</span>
        <span class="value expense">${formatCurrency(topExpenses[0]?.total || 0)}</span>
      </div>
      <div class="report-summary-item">
        <span class="label">Persentase dari Total</span>
        <span class="value warning">${((total / (total || 1)) * 100).toFixed(1)}%</span>
      </div>
    </div>

    <div class="top-expenses-list">
      ${topExpenses.map((item, index) => `
        <div class="top-expense-item">
          <div class="top-expense-rank">${index + 1}</div>
          <div class="top-expense-info">
            <div class="top-expense-name">${getCategoryIcon(item.category)} ${item.description || getCategoryLabel(item.category)}</div>
            <div class="top-expense-category">${getCategoryLabel(item.category)} • ${item.count}x transaksi</div>
          </div>
          <div class="top-expense-amount">${formatCurrency(item.total)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== Loans UI =====
export function openLoans(loans, repayments, summary) {
  if (!elements.loansSection.open) elements.loansSection.showModal();
  renderLoans(loans, repayments, summary);
}

export function closeLoans() {
  if (elements.loansSection && elements.loansSection.open) {
    try { elements.loansSection.close(); } catch {}
  }
}

export function renderLoans(loans, repayments, summary) {
  elements.totalPiutang.textContent = formatCurrency(summary.piutangOutstanding);
  elements.totalHutang.textContent = formatCurrency(summary.hutangOutstanding);
  elements.loanNet.textContent = formatCurrency(summary.net);
  elements.loanNet.className = 'value ' + (summary.net >= 0 ? 'income' : 'expense');

  if (!loans.length) {
    elements.loanList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:30px;">Belum ada pinjaman. Klik "+ Tambah Pinjaman".</p>';
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  elements.loanList.innerHTML = loans.map(l => {
    const reps = repayments.filter(r => r.loanId === l.id);
    const paid = reps.reduce((s, r) => s + r.amount, 0);
    const outstanding = l.amount - paid;
    const pct = l.amount > 0 ? (paid / l.amount) * 100 : 0;
    const dirLabel = l.direction === 'given' ? 'Piutang' : 'Hutang';
    const dirClass = l.direction === 'given' ? 'given' : 'taken';
    const isCicilan = l.loanType === 'cicilan';
    const instAmt = l.installmentAmount || 0;
    const monthsLeft = isCicilan && instAmt > 0 ? Math.ceil(outstanding / instAmt) : 0;
    const isOverdue = l.status !== 'paid' && l.dueDate && l.dueDate < today;
    const cardClass = `loan-card ${l.status === 'paid' ? 'paid' : ''} ${isOverdue ? 'overdue' : ''}`;

    return `
      <div class="${cardClass}" data-id="${l.id}">
        <div class="loan-top">
          <div>
            <div class="loan-person">${l.contactType === 'perusahaan' ? '🏢' : '👤'} ${escapeHtml(l.person)}</div>
            <span class="loan-direction ${dirClass}">${dirLabel}</span>
            <span class="loan-type-badge">${isCicilan ? '📅 Cicilan' : '💵 Lunas (1x)'}</span>
        ${isOverdue ? '<span class="loan-overdue-badge">⚠️ Terlambat</span>' : ''}
          </div>
          <div class="loan-amount ${dirClass}">${formatCurrency(l.amount)}</div>
        </div>
        <div class="loan-meta">
          <span>📅 ${formatDate(l.date)}</span>
          ${isCicilan && instAmt > 0 ? `<span>💳 ${formatCurrency(instAmt)}/bulan</span>` : ''}
          ${isCicilan && instAmt > 0 ? `<span>📊 Tenor ${Math.ceil(l.amount / instAmt)} bulan</span>` : ''}
          ${isCicilan && monthsLeft > 0 ? `<span>⏳ Sisa ${monthsLeft} bulan • ${reps.length}/${Math.ceil(l.amount / instAmt)} cicilan</span>` : ''}
          ${isCicilan && instAmt > 0 ? `<span>💰 Cicilan ${reps.length + 1}/${Math.ceil(l.amount / instAmt)}</span>` : ''}
          ${l.description ? `<span>📝 ${escapeHtml(l.description)}</span>` : ''}
        </div>
        <div class="loan-meta">
          <span class="loan-outstanding">Sisa: ${formatCurrency(Math.max(outstanding, 0))}</span>
          <span>Dibayar: ${formatCurrency(paid)}</span>
          <span>Status: ${l.status === 'paid' ? '✅ Lunas' : '⏳ Aktif'}</span>
        </div>
        <div class="loan-progress">
          <div class="loan-progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="loan-actions">
          ${l.status !== 'paid' ? `<button class="btn repay-btn repay-loan-btn" data-id="${l.id}">💰 Bayar</button>` : ''}
          <button class="btn btn-danger delete-loan-btn" data-id="${l.id}">🗑 Hapus</button>
        </div>
        ${reps.length ? `
          <div class="loan-repayments">
            ${reps.slice().reverse().map(r => `
              <div class="loan-repayment-item">
                <span>${formatDate(r.date)} ${r.description ? '· ' + escapeHtml(r.description) : ''}</span>
                <span class="repay-amount-group">${formatCurrency(r.amount)} <button class="btn btn-danger delete-repay-btn" data-repay-id="${r.id}" title="Hapus pembayaran">✕</button></span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

export function openRepayModal(loanId, outstanding) {
  elements.repayLoanId.value = loanId;
  elements.repayForm.reset();
  elements.repayAmount.value = outstanding > 0 ? formatIdrInput(outstanding) : '';
  elements.repayDate.value = new Date().toISOString().split('T')[0];
  if (!elements.repayModal.open) elements.repayModal.showModal();
  elements.repayAmount.focus();
}

export function closeRepayModal() {
  if (elements.repayModal && elements.repayModal.open) {
    try { elements.repayModal.close(); } catch {}
  }
  if (elements.repayForm) elements.repayForm.reset();
}

export function getRepayFormData() {
  return {
    loanId: elements.repayLoanId.value,
    amount: parseFormattedNumber(elements.repayAmount.value),
    date: elements.repayDate.value,
    description: elements.repayDesc.value.trim()
  };
}

export function bindLoanActions(onRepay, onDelete, onDeleteRepayment) {
  elements.loanList.addEventListener('click', (e) => {
    const repayBtn = e.target.closest('.repay-loan-btn');
    const deleteBtn = e.target.closest('.delete-loan-btn');
    const deleteRepayBtn = e.target.closest('.delete-repay-btn');
    if (repayBtn) onRepay(repayBtn.dataset.id);
    if (deleteBtn) onDelete(deleteBtn.dataset.id);
    if (deleteRepayBtn) onDeleteRepayment(deleteRepayBtn.dataset.repayId);
  });
}

export function bindRepayModalClose(handler) {
  document.getElementById('repayModalClose').addEventListener('click', handler);
  document.getElementById('repayModalCancel').addEventListener('click', handler);
  elements.repayModal.addEventListener('click', (e) => {
    if (e.target === elements.repayModal) handler();
  });
}

export function bindRepayFormSubmit(handler) {
  elements.repayForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handler();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatIdrInput(value) {
  if (value === '' || value === null || value === undefined) return '';
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('id-ID');
}

function parseIdrInput(formatted) {
  return formatted.replace(/[^0-9]/g, '');
}

function parseFormattedNumber(val) {
  return Number(parseIdrInput(val)) || 0;
}

function applyIdrFormat(input) {
  if (input.dataset.idrBound === '1') return;
  input.dataset.idrBound = '1';
  input.addEventListener('focus', () => {
    const raw = parseIdrInput(input.value);
    input.value = raw;
    try { input.select(); } catch {}
  });
  input.addEventListener('blur', () => {
    const raw = parseIdrInput(input.value);
    if (raw) {
      input.value = formatIdrInput(raw);
    }
    if (input.id === 'entryAmount') updateTxAmountVisual();
  });
  input.addEventListener('input', () => {
    const pos = input.selectionStart || 0;
    const raw = parseIdrInput(input.value);
    const formatted = formatIdrInput(raw);
    input.value = formatted;
    try {
      const diff = formatted.length - raw.length;
      const newPos = Math.max(0, pos + diff);
      input.setSelectionRange(newPos, newPos);
    } catch {}
    if (input.id === 'entryAmount') { updateTxAmountVisual(); updateTxMetaBar(); }
  });
}

let idrInitDone = false;
export function initIdrInputs() {
  if (idrInitDone) return;
  idrInitDone = true;
  const ids = ['entryAmount', 'repayAmount', 'entryInstallment'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.type = 'text';
      el.inputMode = 'decimal';
      el.autocomplete = 'off';
      applyIdrFormat(el);
    }
  });
  // global outside click for dropdowns
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('txContactDropdown');
    const toggle = document.getElementById('txContactToggle');
    const qs = document.getElementById('quickSelectPiutang');
    const searchWrap = document.querySelector('.tx-search-wrap');
    if (dd && !dd.classList.contains('hidden')) {
      if (!dd.contains(e.target) && e.target !== toggle && !(searchWrap && searchWrap.contains(e.target))) {
        dd.classList.add('hidden');
      }
    }
    if (qs && !qs.classList.contains('hidden')) {
      const contactInput = document.getElementById('entryLoanPerson');
      if (contactInput && !contactInput.contains(e.target) && !qs.contains(e.target) && e.target !== toggle) {
        // keep open if typing, but allow outside click to close
        if (!e.target.closest('#loanFieldsGroup')) qs.classList.add('hidden');
      }
    }
  });
}

export function renderPeopleDatalist(people) {
  const datalist = document.getElementById('peopleList');
  if (!datalist) return;
  datalist.innerHTML = people.map(p => `<option value="${escapeHtml(p.name)}">`).join('');
}

export function selectPeriodChip(value) {
  setChipSelected('periodGroup', value);
}

export function selectCategoryPublic(category) {
  selectCategory(category);
}

// ===== Contacts UI =====
let contactSearchTerm = '';

export function openContacts(people, loans) {
  const modal = document.getElementById('contactsModal');
  if (!modal.open) modal.showModal();
  contactSearchTerm = '';
  const searchInput = document.getElementById('contactSearch');
  if (searchInput) searchInput.value = '';
  renderContacts(people, loans);
}

export function closeContacts() {
  const m = document.getElementById('contactsModal');
  if (m && m.open) { try { m.close(); } catch {} }
}

export function renderContacts(people, loans) {
  const list = document.getElementById('contactsList');
  if (!list) return;
  const term = contactSearchTerm.trim().toLowerCase();
  const filtered = term ? people.filter(p => p.name.toLowerCase().includes(term)) : people;

  if (!filtered.length) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:30px;">' +
      (people.length ? 'Tidak ada kontak ditemukan.' : 'Belum ada kontak tersimpan.') + '</p>';
    return;
  }

  list.innerHTML = filtered.map(p => {
    const personLoans = loans.filter(l => l.person === p.name);
    const activeCount = personLoans.filter(l => l.status !== 'paid').length;
    const totalCount = personLoans.length;
    const totalAmount = personLoans.reduce((s, l) => s + l.amount, 0);
    const typeLabel = p.type === 'perusahaan' ? '🏢 Perusahaan' : '👤 Orang';

    return `
      <div class="contact-card">
        <div class="contact-info">
          <div class="contact-name">${p.type === 'perusahaan' ? '🏢' : '👤'} ${escapeHtml(p.name)} <span class="contact-type-badge">${typeLabel}</span></div>
          <div class="contact-meta">
            ${totalCount} pinjaman${activeCount > 0 ? ` (${activeCount} aktif)` : ''}
            ${totalAmount > 0 ? ` · Total: ${formatCurrency(totalAmount)}` : ''}
          </div>
        </div>
        <div class="contact-actions">
          <button class="btn btn-ghost edit-contact-btn" data-contact-id="${p.id}" data-contact-name="${escapeHtml(p.name)}" data-contact-type="${p.type || 'person'}" title="Edit">✎</button>
          <button class="btn btn-danger delete-contact-btn" data-contact-id="${p.id}" data-contact-name="${escapeHtml(p.name)}">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

export function bindContactsSearch(handler) {
  const searchInput = document.getElementById('contactSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      contactSearchTerm = e.target.value;
      handler();
    });
  }
}

export function bindContactsActions(onDelete, onEdit) {
  document.getElementById('contactsList').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-contact-btn');
    const editBtn = e.target.closest('.edit-contact-btn');
    if (deleteBtn) onDelete(deleteBtn.dataset.contactId, deleteBtn.dataset.contactName);
    if (editBtn) onEdit(editBtn.dataset.contactId, editBtn.dataset.contactName, editBtn.dataset.contactType);
  });
}

export function openContactForm(contactId, name, type) {
  const modal = document.getElementById('contactFormModal');
  document.getElementById('contactFormTitle').textContent = contactId ? 'Edit Kontak' : 'Tambah Kontak';
  document.getElementById('contactFormId').value = contactId || '';
  document.getElementById('contactFormName').value = name || '';
  document.getElementById('contactFormType').value = type || 'person';
  setSelected(document.getElementById('contactTypeFormGroup'), type || 'person');
  if (!modal.open) modal.showModal();
  document.getElementById('contactFormName').focus();
}

export function closeContactForm() {
  const m = document.getElementById('contactFormModal');
  if (m && m.open) { try { m.close(); } catch {} }
  document.getElementById('contactForm')?.reset();
  const idEl = document.getElementById('contactFormId');
  const typeEl = document.getElementById('contactFormType');
  if (idEl) idEl.value = '';
  if (typeEl) typeEl.value = 'person';
}

export function getContactFormData() {
  return {
    id: document.getElementById('contactFormId').value || null,
    name: document.getElementById('contactFormName').value.trim(),
    type: document.getElementById('contactFormType').value || 'person'
  };
}

export function bindContactFormSubmit(handler) {
  document.getElementById('contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    handler();
  });
}

export function bindContactFormTypeButtons() {
  const group = document.getElementById('contactTypeFormGroup');
  if (!group) return;
  group.querySelectorAll('.select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSelected(group, btn.dataset.value);
      document.getElementById('contactFormType').value = btn.dataset.value;
    });
  });
}

export function openLoanEntry() {
  openModal();
  elements.entryType.value = 'expense';
  setSelected(elements.typeGroup, 'expense');
  renderCategoryButtons('expense');
  selectCategory('Piutang');
  elements.entryDate.focus();
}