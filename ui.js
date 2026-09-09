import { formatCurrency, formatDate, formatMonth, formatCurrencyCompact, getCategoryLabel, getCategoryIcon, CATEGORY_OPTIONS, getPaymentLabel, getPaymentIcon } from './reports.js';
import { calcTenor, paidOf, outstandingOf, nextInstallmentAmount, scheduleData, nextDue, interestRateOf, interestAmount, totalOwed } from './loanmath.js';
import { accountLabel } from './coa.js';
import { computeSlip, thrAmount } from './payroll.js';

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
  entryLoanMode: document.getElementById('entryLoanMode'),
  loanFieldsGroup: document.getElementById('loanFieldsGroup'),
  entryLoanPerson: document.getElementById('entryLoanPerson'),
  entryLoanDue: document.getElementById('entryLoanDue'),
  loanTypeGroup: document.getElementById('loanTypeGroup'),
  installmentGroup: document.getElementById('installmentGroup'),
  entryInstallment: document.getElementById('entryInstallment'),
  entryLoanType: document.getElementById('entryLoanType'),
  entryInstallmentAmount: document.getElementById('entryInstallmentAmount'),
  entryInterestRate: document.getElementById('entryInterestRate'),
  entryPPN: document.getElementById('entryPPN'),
  entryLoanDueDate: document.getElementById('entryLoanDueDate'),
  itemGroupWrap: document.getElementById('itemGroupWrap'),
  itemGroupLabel: document.getElementById('itemGroupLabel'),
  itemGroupHint: document.getElementById('itemGroupHint'),
  entryItemId: document.getElementById('entryItemId'),
  entryItemQty: document.getElementById('entryItemQty'),
  entryItemCost: document.getElementById('entryItemCost'),
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
  repayPayment: document.getElementById('repayPayment'),
  repayPaymentDetail: document.getElementById('repayPaymentDetail'),
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

/* Toast dengan tombol Urungkan — untuk hapus yang bisa dibatalkan */
export function showUndoToast(message, onUndo, duration = 6000) {
  const container = elements.toastContainer;
  if (!container) { return; }
  const toast = document.createElement('div');
  toast.className = 'toast warning';
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="toast-icon">🗑️</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-undo">Urungkan</button>
    <button class="toast-close" aria-label="Tutup">&times;</button>
  `;
  let done = false;
  const dismiss = () => { if (!done) { done = true; removeToast(toast); } };
  toast.querySelector('.toast-undo').addEventListener('click', () => {
    if (done) return;
    done = true;
    try { onUndo(); } catch {}
    removeToast(toast);
  });
  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  container.appendChild(toast);
  setTimeout(dismiss, duration);
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
  const selected = window.__selectedIds instanceof Set ? window.__selectedIds : new Set();
  body.innerHTML = entries.map((e) => {
    const isIncome = e.type === 'income';
    const sign = isIncome ? '+' : '-';
    const isLoan = !!e.loanId;
    const amt = Number(e.amount) || 0;
    const checked = selected.has(e.id) ? 'checked' : '';
    const checkDisabled = isLoan ? 'disabled title="Pinjaman dikelola dari menu Pinjaman"' : '';
    const actions = isLoan
      ? '<span class="muted-tag">di Pinjaman</span>'
      : `<div class="table-row-actions">
          <button class="btn btn-ghost edit-btn" data-id="${e.id}" aria-label="Edit" title="Edit">✎</button>
          <button class="btn btn-ghost duplicate-btn" data-id="${e.id}" aria-label="Duplikasi" title="Duplikasi">📋</button>
          <button class="btn btn-ghost receipt-btn" data-id="${e.id}" aria-label="Kwitansi" title="Cetak kwitansi">🧾</button>
          <button class="btn btn-danger delete-btn" data-id="${e.id}" aria-label="Hapus" title="Hapus">🗑</button>
        </div>`;
    // Fix amount: keep Rp, nowrap, no break on comma
    const amtStr = formatCurrency(amt).replace(/\s/g, '');
    // For piutang, show person in description if empty
    const desc = e.description || (isLoan && e.person ? `→ ${e.person}` : '-');
    const rowClass = isLoan ? 'loan-row' : (isIncome ? 'tr-income' : 'tr-expense');
    const payDetail = e.paymentDetail ? `<span class="pay-sub" title="${escapeHtml(e.paymentDetail)}">${escapeHtml(e.paymentDetail)}</span>` : '';
    return `
      <tr data-id="${e.id}" class="${rowClass}">
        <td style="white-space:nowrap;width:34px"><input type="checkbox" class="row-select" data-id="${e.id}" ${checked} ${checkDisabled} aria-label="Pilih transaksi"></td>
        <td style="white-space:nowrap">${formatDate(e.date)}</td>
        <td><span class="category-tag">${getCategoryIcon(e.category)} ${escapeHtml(getCategoryLabel(e.category))}</span></td>
        <td title="${escapeHtml(desc)}" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(desc)}</td>
        <td><span class="payment-tag" title="${escapeHtml(e.paymentDetail || getPaymentLabel(e.payment))}">${getPaymentIcon(e.payment)} ${getPaymentLabel(e.payment)}</span></td>
        <td><span class="type-badge ${isIncome ? 'income' : 'expense'}" style="font-size:11px;padding:3px 10px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${isIncome ? '📥 Masuk' : '📤 Keluar'}</span></td>
        <td class="amount-col ${isIncome ? 'income' : 'expense'}" style="white-space:nowrap;text-align:right;font-weight:700;font-size:13px">${sign} ${amtStr}${payDetail}</td>
        <td class="actions-col">${actions}</td>
      </tr>
    `;
  }).join('');
}

export function trendPill(cur, prev) {
  if (!isFinite(cur) || !isFinite(prev)) return { text: '—', cls: 'neutral' };
  if (prev <= 0 && cur <= 0) return { text: '—', cls: 'neutral' };
  if (prev <= 0 && cur > 0) return { text: '+100%', cls: 'up' };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (Math.abs(pct) < 1) return { text: 'Stabil', cls: 'neutral' };
  return { text: (pct > 0 ? '+' : '') + pct + '%', cls: pct > 0 ? 'up' : 'down' };
}

function setTrend(cardEl, pill) {
  if (!cardEl) return;
  const t = cardEl.querySelector('.metric-trend');
  if (!t) return;
  t.textContent = pill.text;
  t.className = 'metric-trend ' + pill.cls;
}

export function renderSummary({ income, expense, net, incomeCount, expenseCount }, prev) {
  elements.totalIncome.textContent = formatCurrency(income);
  elements.totalExpense.textContent = formatCurrency(expense);
  elements.netBalance.textContent = formatCurrency(net);
  elements.netBalance.className = 'dash-card-value ' + (net >= 0 ? 'income' : 'expense');
  const ic = document.getElementById('totalIncomeCount');
  const ec = document.getElementById('totalExpenseCount');
  if (ic) ic.textContent = (incomeCount || 0) + ' transaksi';
  if (ec) ec.textContent = (expenseCount || 0) + ' transaksi';
  if (prev) {
    setTrend(elements.totalIncome?.closest('.metric-card'), trendPill(income, prev.income));
    // Pengeluaran naik = kabar buruk → warna dibalik (tanda % tetap jujur)
    const ep = trendPill(expense, prev.expense);
    if (ep.cls === 'up') ep.cls = 'down';
    else if (ep.cls === 'down') ep.cls = 'up';
    setTrend(elements.totalExpense?.closest('.metric-card'), ep);
    setTrend(elements.netBalance?.closest('.metric-card'), trendPill(net, prev.net));
  }
}

export function renderLoanTotals(piutang, hutang, piutangCount, hutangCount) {
  if (elements.dashPiutangVal) elements.dashPiutangVal.textContent = formatCurrency(piutang);
  if (elements.dashHutangVal) elements.dashHutangVal.textContent = formatCurrency(hutang);
  const hv2 = document.getElementById('dashHutangVal2');
  if (hv2) hv2.textContent = formatCurrency(hutang);
  const pc = document.getElementById('dashPiutangCount');
  const hc = document.getElementById('dashHutangCount');
  const hc2 = document.getElementById('dashHutangCount2');
  if (pc) pc.textContent = piutangCount + ' aktif';
  if (hc) hc.textContent = hutangCount + ' pinjaman aktif';
  if (hc2) hc2.textContent = hutangCount + ' aktif';
  const netVal = document.getElementById('dashNetLoanVal');
  const netSub = document.getElementById('dashNetLoanSub');
  const net = piutang - hutang;
  if (netVal) {
    netVal.textContent = formatCurrency(Math.abs(net));
    netVal.className = 'dash-card-value ' + (net >= 0 ? 'income' : 'expense');
  }
  if (netSub) netSub.textContent = 'Pinjemin − Ambil Loan';
  const trend = document.getElementById('dashLoanTrend');
  if (trend) {
    const surplus = net >= 0;
    trend.textContent = surplus ? 'Surplus' : 'Defisit';
    trend.className = 'metric-trend ' + (surplus ? 'up' : 'down');
  }
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
          <span class="category-name">${getCategoryIcon(c.category)} ${escapeHtml(getCategoryLabel(c.category))}</span>
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

/* Generic info modal (Bantuan, Changelog, ...) */
export function openInfoModal(title, htmlBody) {
  const modal = document.getElementById('infoModal');
  if (!modal) return;
  document.getElementById('infoModalTitle').textContent = title || 'Info';
  document.getElementById('infoModalBody').innerHTML = htmlBody || '';
  if (!modal.open) { try { modal.showModal(); } catch {} }
  trapFocus(modal);
}
export function closeInfoModal() {
  const modal = document.getElementById('infoModal');
  if (!modal) return;
  releaseFocus(modal);
  if (modal.open) { try { modal.close(); } catch {} }
}
export function bindInfoModal() {
  document.getElementById('infoModalClose')?.addEventListener('click', closeInfoModal);
  document.getElementById('infoModalOk')?.addEventListener('click', closeInfoModal);
  document.getElementById('infoModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'infoModal') closeInfoModal();
  });
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
  const cat = elements.entryCategory.value;
  const mode = (elements.entryLoanMode && elements.entryLoanMode.value) || 'new';
  let loanExtra = '';
  const schedTag = (found) => {
    if (!found || !(found.tenor > 1)) return '';
    const n = Math.min((found.paidCount || 0) + 1, found.tenor);
    return ` • Cicilan ${n}/${found.tenor}`;
  };
  if (cat === 'Hutang' && mode === 'settle') {
    const found = getOutstandingHutang().find(x => x.id === elements.entryLoanId.value);
    if (found) loanExtra = `Balikin → ${escapeHtml(found.person)}${schedTag(found)} • Sisa ${escapeHtml(formatCurrency(found.outstanding))}`;
    else if (elements.entryLoanPerson.value) loanExtra = `Balikin → ${escapeHtml(elements.entryLoanPerson.value)}`;
  } else if (cat === 'Piutang' && mode === 'settle') {
    const found = getOutstandingPiutang().find(x => x.id === elements.entryLoanId.value);
    if (found) loanExtra = `Balikin ← ${escapeHtml(found.person)}${schedTag(found)} • Sisa ${escapeHtml(formatCurrency(found.outstanding))}`;
    else if (elements.entryLoanPerson.value) loanExtra = `Balikin ← ${escapeHtml(elements.entryLoanPerson.value)}`;
  } else if ((cat === 'Piutang' || cat === 'Hutang') && elements.entryLoanPerson.value) {
    const arrow = cat === 'Hutang' ? '←' : '→';
    loanExtra = ` ${arrow} ${escapeHtml(elements.entryLoanPerson.value)} • ${elements.entryLoanType.value}`;
  }
  if ((cat === 'Piutang' || cat === 'Hutang') && mode === 'new' && amt > 0) {
    const rate = readBungaRate();
    if (rate > 0) loanExtra += `${loanExtra ? ' • ' : ''}Total ${escapeHtml(formatCurrency(amt + Math.round(amt * rate / 100)))}`;
  }
  bar.innerHTML = `<span>Nominal: ${escapeHtml(amtStr)}</span><span class="capitalize">${escapeHtml(jenis)}</span><span>${escapeHtml(catLabel)}</span>${loanExtra ? `<span class="tx-meta-blue">${loanExtra}</span>` : ''}`;
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
export function readBungaRate() {
  const el = document.getElementById('entryInterestRate');
  if (!el) return 0;
  const n = Number(String(el.value).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 100) / 100, 100);
}

function updateBungaHint() {
  const hint = document.getElementById('bungaHint');
  if (!hint) return;
  const amt = parseFormattedNumber(elements.entryAmount?.value || '');
  const rate = readBungaRate();
  if (!rate) {
    hint.textContent = 'Tanpa bunga — dibalikin sesuai pokok';
    return;
  }
  const bunga = Math.round(amt * rate / 100);
  const total = amt + bunga;
  hint.innerHTML = amt > 0
    ? `Bunga ${rate}% = ${formatCurrency(bunga)} • Total dibalikin <strong>${formatCurrency(total)}</strong>`
    : `Bunga ${rate}% dari pokok — isi nominal dulu biar kelihatan totalnya`;
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
  const mode = (elements.entryLoanMode && elements.entryLoanMode.value) || 'new';
  if (!loanVisible || !isCicilan || mode !== 'new') { info.classList.remove('show'); info.innerHTML=''; return; }
  if (!amt) {
    info.classList.add('show');
    info.innerHTML = 'Masukkan nominal transaksi di atas untuk menghitung cicilan/tenor';
    return;
  }
  // Cicilan melunasi TOTAL (pokok + bunga), bukan cuma pokok
  const rate = readBungaRate();
  const base = amt + Math.round(amt * rate / 100);
  if ((!cicilan || cicilan <= 0) && (!tenorVal || tenorVal <= 0)) {
    info.classList.add('show');
    info.innerHTML = `Pinjaman <strong>${formatCurrency(amt)}</strong>${rate ? ` + bunga ${formatCurrency(base - amt)}` : ''} • Isi <strong>cicilan/bulan</strong> atau <strong>tenor</strong>, sistem hitung otomatis`;
    return;
  }
  // auto-sync the empty field
  if (!tenorSyncing) {
    tenorSyncing = true;
    if (cicilan && cicilan > 0 && (!tenorVal || tenorVal <= 0 || document.activeElement === cicilanInput)) {
      const tenorCalc = Math.ceil(base / cicilan);
      if (tenorInput && tenorCalc > 0 && tenorCalc <= 360) tenorInput.value = String(tenorCalc);
    } else if (tenorVal && tenorVal > 0 && (!cicilan || cicilan <= 0 || document.activeElement === tenorInput)) {
      const cicilanCalc = Math.ceil(base / tenorVal);
      if (cicilanInput && cicilanCalc > 0) cicilanInput.value = formatIdrInput(cicilanCalc);
    }
    setTimeout(() => { tenorSyncing = false; }, 50);
  }
  const finalCicilan = parseFormattedNumber(cicilanInput?.value || '');
  const finalTenor = tenorInput ? parseInt(String(tenorInput.value).replace(/[^0-9]/g,''), 10) || 0 : 0;
  if (finalCicilan && finalCicilan > 0) {
    const tenor = Math.ceil(base / finalCicilan);
    const last = base - finalCicilan * (tenor - 1);
    info.classList.add('show');
    if (tenor === 1) info.innerHTML = `Tenor <strong>1 bulan</strong> • Lunas ${formatCurrency(base)}`;
    else if (last <= 0 || last === finalCicilan) info.innerHTML = `Tenor <strong>${tenor} bulan</strong> • ${formatCurrency(finalCicilan)} × ${tenor} • Total ${formatCurrency(base)}`;
    else info.innerHTML = `Tenor <strong>${tenor} bulan</strong> • ${formatCurrency(finalCicilan)} × ${tenor-1} + ${formatCurrency(last)} • Total ${formatCurrency(base)}`;
  } else if (finalTenor && finalTenor > 0) {
    const cicilanCalc = Math.ceil(base / finalTenor);
    info.classList.add('show');
    info.innerHTML = `Cicilan <strong>${formatCurrency(cicilanCalc)}/bulan</strong> • Tenor ${finalTenor} bulan • Total ${formatCurrency(base)}`;
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
    elements.entryAmount.addEventListener('input', () => { updateTxAmountVisual(); updateTxMetaBar(); updateBungaHint(); updateTxTenorInfo(); });
    elements.entryAmount.addEventListener('blur', () => { updateTxAmountVisual(); updateBungaHint(); updateTxTenorInfo(); });
  }
  const bungaEl = document.getElementById('entryInterestRate');
  if (bungaEl) {
    bungaEl.addEventListener('input', () => { updateBungaHint(); updateTxMetaBar(); updateTxTenorInfo(); });
  }
  const dueEl = document.getElementById('entryLoanDueDate');
  if (dueEl && elements.entryLoanDue) {
    dueEl.addEventListener('change', () => { elements.entryLoanDue.value = dueEl.value; });
  }
  if (elements.entryDescription) {
    elements.entryDescription.addEventListener('input', () => { updateTxDescCount(); });
  }
  if (elements.entryLoanPerson) {
    elements.entryLoanPerson.addEventListener('input', () => { updateTxContactSelected(); updateTxMetaBar(); });
    elements.entryLoanPerson.addEventListener('focus', () => { const qs = document.getElementById('quickSelectPiutang'); if (qs) qs.classList.remove('hidden'); });
  }
  if (elements.entryItemId) {
    elements.entryItemId.addEventListener('change', () => { updateItemHint(); updateTxMetaBar(); });
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
  const modeGroup = document.getElementById('loanModeGroup');
  if (modeGroup) {
    modeGroup.querySelectorAll('.select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLoanModeUI(btn.dataset.value || 'new');
        const cat = elements.entryCategory.value;
        if (cat === 'Piutang' || cat === 'Hutang') applyLoanMode(cat);
      });
    });
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
    if (hint) hint.innerHTML = entry.type === 'income' ? '<span class="tx-dot tx-dot-income"></span> 💰 Uang masuk ke kamu — saldo nambah' : '<span class="tx-dot tx-dot-expense"></span> 💸 Uang keluar dari kamu — saldo berkurang';
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
    if (elements.entryPPN) elements.entryPPN.checked = !!entry.ppn;
    if (elements.entryItemQty) elements.entryItemQty.value = entry.qty || '';
    if (elements.entryItemCost) elements.entryItemCost.value = entry.unitCost || '';
    if (entry.loanId) {
      elements.loanFieldsGroup.hidden = false;
      elements.entryLoanPerson.value = entry.person || '';
      elements.entryLoanDue.value = entry.loanDue || '';
      if (elements.entryLoanDueDate) elements.entryLoanDueDate.value = entry.loanDue || '';
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
          const rateEdit = Number(entry.interestRate) || 0;
          const totalEdit = Number(entry.amount) + Math.round(Number(entry.amount) * rateEdit / 100);
          const t = Math.ceil(totalEdit / Number(entry.installmentAmount));
          tenorElEdit.value = String(t > 0 && t <= 360 ? t : '');
        } else {
          tenorElEdit.value = '';
        }
      }
      if (elements.entryInterestRate) elements.entryInterestRate.value = entry.interestRate ? String(entry.interestRate) : '';
      // Pastikan field bunga kelihatan saat edit pinjaman (mode lama bisa settle)
      const bungaFieldEdit = document.getElementById('loanBungaField');
      if (bungaFieldEdit) bungaFieldEdit.hidden = false;
      updateBungaHint();
    } else {
      elements.loanFieldsGroup.hidden = true;
      elements.entryLoanPerson.value = '';
      elements.entryLoanDue.value = '';
      if (elements.entryLoanDueDate) elements.entryLoanDueDate.value = '';
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
    elements.entryPayment.value = 'transfer';
    setSelected(elements.typeGroup, 'expense');
    const bg = document.getElementById('txSegmentBg');
    if (bg) bg.className = 'tx-segment-bg tx-segment-expense';
    const hint = document.getElementById('txJenisHint');
    if (hint) hint.innerHTML = '<span class="tx-dot tx-dot-expense"></span> 💸 Uang keluar dari kamu — saldo berkurang';
    renderCategoryButtons('expense');
    setSelected(elements.paymentGroup, 'transfer');
    updatePaymentDetail('transfer');
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
    if (elements.entryLoanDueDate) elements.entryLoanDueDate.value = '';
    if (elements.entryPPN) elements.entryPPN.checked = false;
    if (elements.entryItemQty) elements.entryItemQty.value = '';
    if (elements.entryItemCost) elements.entryItemCost.value = '';
    elements.entryLoanId.value = '';
    elements.entryLoanType.value = 'lunas';
    setSelected(elements.loanTypeGroup, 'lunas');
    elements.installmentGroup.hidden = true;
    elements.entryInstallment.value = '';
    elements.entryInstallmentAmount.value = 0;
    const tenorElNew = document.getElementById('entryTenor');
    if (tenorElNew) tenorElNew.value = '';
    if (elements.entryInterestRate) elements.entryInterestRate.value = '';
    updateBungaHint();
    elements.entryContactType.value = 'person';
    setSelected(elements.contactTypeGroup, 'person');
    if (elements.entryLoanMode) elements.entryLoanMode.value = 'new';
    setLoanModeUI('new');
  }
  syncTxDate();
  updateTxAmountVisual();
  updateTxDescCount();
  if (elements.entryLoanMode) elements.entryLoanMode.value = 'new';
  setLoanModeUI('new');
  updateTxMetaBar();
  updateTxContactSelected();
  updateTxTenorInfo();
  refreshItemSection();
  // Pulihkan pilihan barang saat edit
  if (entry && entry.itemId && elements.entryItemId) {
    refreshItemSection();
    elements.entryItemId.value = entry.itemId;
    updateItemHint();
  }
  if (elements.entryCategory.value === 'Piutang' || elements.entryCategory.value === 'Hutang') applyLoanMode(elements.entryCategory.value);
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
  const subMap = {
    jualan: 'Jual barang',
    'gaji-out': 'Gaji karyawan',
    gaji: 'Gajian kamu',
    freelance: 'Kerja lepas',
    investasi: 'Uang nambah',
    hadiah: 'Dapat hadiah',
    kos: 'Bayar kos/rumah',
    utilitas: 'Listrik, air, wifi',
    makanan: 'Jajan & makan',
    transport: 'Ongkos jalan',
    hiburan: 'Main & nonton',
    kesehatan: 'Dokter & obat',
    belanja: 'Beli barang',
    pendidikan: 'Sekolah & les',
    Piutang: 'Kamu kasih pinjam',
    Hutang: 'Kamu pinjam uang'
  };
  const totalOpts = options.length + 1;
  elements.categoryGroup.innerHTML = options.map(opt => {
    const sub = subMap[opt.value] || 'Pilih';
    return `<button type="button" class="select-btn" data-value="${opt.value}">
      <span class="tx-cat-icon">${opt.icon}</span>
      <span class="tx-cat-label">${opt.label}</span>
      <span class="tx-cat-sub">${sub}</span>
      <span class="tx-cat-check">✓</span>
    </button>`;
  }).join('') + `<button type="button" class="select-btn" data-value="__custom"><span class="tx-cat-icon">➕</span><span class="tx-cat-label">Lainnya</span><span class="tx-cat-sub">Lain-lain</span><span class="tx-cat-check">✓</span></button>`;
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
        hint.innerHTML = '<span class="tx-dot tx-dot-income"></span> 💰 Uang masuk ke kamu — saldo kamu nambah';
        if (dot) { dot.className = 'tx-dot tx-dot-income'; }
      } else {
        hint.innerHTML = '<span class="tx-dot tx-dot-expense"></span> 💸 Uang keluar dari kamu — saldo kamu berkurang';
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
      if (elements.entryLoanMode) elements.entryLoanMode.value = 'new';
      setLoanModeUI('new');
      const paymentWrap = document.getElementById('paymentGroupWrap');
      if (paymentWrap) paymentWrap.hidden = false;
      handler(btn.dataset.value);
      refreshItemSection();
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

function setLoanModeUI(mode) {
  const group = document.getElementById('loanModeGroup');
  if (group) setSelected(group, mode);
  if (elements.entryLoanMode) elements.entryLoanMode.value = mode;
}

// Mode labels always carry money-flow direction: 📤 KELUAR (red) / 📥 MASUK (green)
function flowSub(flow) {
  const isIn = flow === 'MASUK';
  return `<span class="tx-mode-sub ${isIn ? 'in' : 'out'}">${isIn ? '📥 UANG MASUK' : '📤 UANG KELUAR'}</span>`;
}
function setModeLabels(newEl, settleEl, newTxt, newFlow, settleTxt, settleFlow) {
  if (newEl) newEl.innerHTML = `${newTxt}${flowSub(newFlow)}`;
  if (settleEl) settleEl.innerHTML = `${settleTxt}${flowSub(settleFlow)}`;
}

function setPanelBadge(badgeEl, flow) {
  if (!badgeEl) return;
  badgeEl.textContent = flow === 'MASUK' ? 'Masuk' : 'Keluar';
  badgeEl.classList.toggle('in', flow === 'MASUK');
  badgeEl.classList.toggle('out', flow !== 'MASUK');
}

function applyLoanMode(category) {
  const mode = (elements.entryLoanMode && elements.entryLoanMode.value) || 'new';
  const isPiutang = category === 'Piutang';
  const isHutang = category === 'Hutang';
  if (!isPiutang && !isHutang) return;
  const panelTitle = document.getElementById('loanPanelTitle');
  const panelBadge = document.getElementById('loanPanelBadge');
  const panelSub = document.getElementById('loanPanelSub');
  const pickerField = document.getElementById('hutangPickerField');
  const pickerLabel = document.getElementById('hutangPickerLabel');
  const contactTypeField = document.getElementById('loanContactTypeField');
  const personField = document.getElementById('loanPersonField');
  const termsField = document.getElementById('loanTermsField');
  const newLabel = document.getElementById('loanModeNewLabel');
  const settleLabel = document.getElementById('loanModeSettleLabel');
  const qsSection = document.getElementById('quickSelectPiutang');
  const selWrap = document.getElementById('txContactSelected');
  if (isPiutang) {
    setModeLabels(newLabel, settleLabel, '📤 Kasih Pinjam', 'KELUAR', '📥 Dibalikin', 'MASUK');
    if (mode === 'settle') {
      if (panelTitle) panelTitle.textContent = 'Dibalikin';
      setPanelBadge(panelBadge, 'MASUK');
      if (panelSub) panelSub.textContent = 'Uang kembali ke kamu — pilih siapa yang balikin';
      if (pickerField) pickerField.hidden = false;
      if (pickerLabel) pickerLabel.textContent = 'Siapa yang balikin ke kamu?';
      if (contactTypeField) contactTypeField.hidden = true;
      if (personField) personField.hidden = true;
      if (termsField) termsField.hidden = true;
      elements.installmentGroup.hidden = true;
      elements.entryLoanPerson.required = false;
      if (qsSection) qsSection.classList.add('hidden');
      if (selWrap) { selWrap.classList.add('hidden'); selWrap.innerHTML = ''; }
      populateSettlePicker('given');
    } else {
      if (panelTitle) panelTitle.textContent = 'Kasih Pinjam';
      setPanelBadge(panelBadge, 'KELUAR');
      if (panelSub) panelSub.textContent = 'Kasih uang ke temanmu. Mau dibalikin 1x langsung atau dicicil tiap bulan?';
      if (pickerField) pickerField.hidden = true;
      if (contactTypeField) contactTypeField.hidden = false;
      if (personField) personField.hidden = false;
      if (termsField) termsField.hidden = false;
      elements.entryLoanPerson.required = true;
      const lt = elements.entryLoanType.value || 'lunas';
      elements.installmentGroup.hidden = lt !== 'cicilan';
      const label = document.getElementById('loanPersonLabel');
      const hint = document.getElementById('quickSelectHint');
      const qsLabel = document.getElementById('quickSelectLabel');
      if (label) label.textContent = 'Kasih pinjam ke siapa?';
      if (hint) hint.textContent = 'Ketik nama temanmu';
      if (qsLabel) qsLabel.textContent = 'Pilih dari kontak tersimpan:';
      if (qsSection) qsSection.classList.remove('hidden');
      populateQuickSelectPiutang();
      updateTxContactSelected();
    }
  } else {
    setModeLabels(newLabel, settleLabel, '📥 Pinjam Uang', 'MASUK', '📤 Balikin', 'KELUAR');
    if (mode === 'settle') {
      if (panelTitle) panelTitle.textContent = 'Balikin';
      setPanelBadge(panelBadge, 'KELUAR');
      if (panelSub) panelSub.textContent = 'Kamu balikin uang ke teman — pilih loan yang mau dibalikin';
      if (pickerField) pickerField.hidden = false;
      if (pickerLabel) pickerLabel.textContent = 'Loan mana yang kamu balikin?';
      if (contactTypeField) contactTypeField.hidden = true;
      if (personField) personField.hidden = true;
      if (termsField) termsField.hidden = true;
      elements.installmentGroup.hidden = true;
      elements.entryLoanPerson.required = false;
      if (qsSection) qsSection.classList.add('hidden');
      if (selWrap) { selWrap.classList.add('hidden'); selWrap.innerHTML = ''; }
      populateSettlePicker('taken');
    } else {
      if (panelTitle) panelTitle.textContent = 'Pinjam Uang';
      setPanelBadge(panelBadge, 'MASUK');
      if (panelSub) panelSub.textContent = 'Pinjam uang dari teman. Nanti kamu balikin 1x atau dicicil?';
      if (pickerField) pickerField.hidden = true;
      if (contactTypeField) contactTypeField.hidden = false;
      if (personField) personField.hidden = false;
      if (termsField) termsField.hidden = false;
      elements.entryLoanPerson.required = true;
      const lt = elements.entryLoanType.value || 'lunas';
      elements.installmentGroup.hidden = lt !== 'cicilan';
      const label = document.getElementById('loanPersonLabel');
      const hint = document.getElementById('quickSelectHint');
      const qsLabel = document.getElementById('quickSelectLabel');
      if (label) label.textContent = 'Pinjam dari siapa?';
      if (hint) hint.textContent = 'Ketik nama temanmu';
      if (qsLabel) qsLabel.textContent = 'Pilih dari kontak tersimpan:';
      if (qsSection) qsSection.classList.remove('hidden');
      populateQuickSelectPiutang();
      updateTxContactSelected();
    }
  }
  // Bunga + jatuh tempo hanya untuk pinjaman baru (bukan pelunasan)
  const bungaField = document.getElementById('loanBungaField');
  if (bungaField) bungaField.hidden = mode !== 'new';
  const dueField = document.getElementById('loanDueField');
  if (dueField) dueField.hidden = mode !== 'new';
  updateBungaHint();
  updateTxTenorInfo();
  updateTxMetaBar();
}

export function handleCategoryChange(category) {
  const isLoan = category === 'Piutang' || category === 'Hutang';
  elements.loanFieldsGroup.hidden = !isLoan;
  const paymentWrap = document.getElementById('paymentGroupWrap');
  if (paymentWrap) paymentWrap.hidden = false;
  const pickerField = document.getElementById('hutangPickerField');
  const contactTypeField = document.getElementById('loanContactTypeField');
  const personField = document.getElementById('loanPersonField');
  const termsField = document.getElementById('loanTermsField');
  const modeRow = document.getElementById('loanModeRow');
  if (isLoan) {
    if (modeRow) modeRow.hidden = false;
    if (!elements.entryLoanMode || !elements.entryLoanMode.value) {
      if (elements.entryLoanMode) elements.entryLoanMode.value = 'new';
    }
    setLoanModeUI(elements.entryLoanMode.value || 'new');
    applyLoanMode(category);
  } else {
    elements.entryLoanPerson.required = false;
    elements.entryLoanPerson.value = '';
    elements.entryLoanDue.value = '';
    if (elements.entryLoanDueDate) elements.entryLoanDueDate.value = '';
    elements.entryLoanId.value = '';
    elements.installmentGroup.hidden = true;
    if (pickerField) pickerField.hidden = true;
    if (contactTypeField) contactTypeField.hidden = false;
    if (personField) personField.hidden = false;
    if (termsField) termsField.hidden = false;
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
  refreshItemSection();
  updateTxMetaBar();
}

function getItemList() {
  if (typeof window.__getItems === 'function') {
    try { return window.__getItems() || []; } catch { return []; }
  }
  return [];
}

// Seksi barang: jual (income) kurangi stok, beli (belanja) tambah stok
export function refreshItemSection() {
  const wrap = elements.itemGroupWrap;
  if (!wrap) return;
  const type = elements.entryType ? elements.entryType.value : 'expense';
  const cat = elements.entryCategory ? elements.entryCategory.value : '';
  const isSell = type === 'income';
  const isBuy = type === 'expense' && cat === 'belanja';
  if (!isSell && !isBuy) { wrap.hidden = true; return; }
  const items = getItemList();
  if (!items.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  if (elements.itemGroupLabel) elements.itemGroupLabel.textContent = isSell ? 'Jual barang? (kurangi stok)' : 'Beli barang? (tambah stok)';
  const sel = elements.entryItemId;
  const cur = sel ? sel.value : '';
  if (sel) {
    sel.innerHTML = '<option value="">— Tanpa barang —</option>' + items.map(i =>
      `<option value="${i.id}">${escapeHtml(i.name)} (stok ${i.stock})</option>`).join('');
    if (cur && items.some(i => i.id === cur)) sel.value = cur;
  }
  if (elements.entryItemCost) elements.entryItemCost.style.display = isBuy ? '' : 'none';
  updateItemHint();
}

function updateItemHint() {
  const hint = elements.itemGroupHint;
  if (!hint || !elements.itemGroupWrap || elements.itemGroupWrap.hidden) return;
  const items = getItemList();
  const it = items.find(i => i.id === (elements.entryItemId && elements.entryItemId.value));
  if (!it) { hint.textContent = 'Pilih barang untuk kaitkan stok (opsional).'; return; }
  const type = elements.entryType ? elements.entryType.value : 'expense';
  hint.textContent = type === 'income'
    ? `Stok ${it.name}: ${it.stock}. Jual kurangi otomatis + catat HPP.`
    : `Stok ${it.name}: ${it.stock} • modal rata-rata ${formatCurrency(it.cost)}. Isi harga satuan bila beda.`;
}

export function readItemLink() {
  if (!elements.itemGroupWrap || elements.itemGroupWrap.hidden) return {};
  const itemId = elements.entryItemId ? elements.entryItemId.value : '';
  if (!itemId) return {};
  const qty = Math.max(parseInt((elements.entryItemQty && elements.entryItemQty.value) || '0', 10) || 0, 0);
  if (qty <= 0) return {};
  const unitCost = parseFormattedNumber(elements.entryItemCost ? elements.entryItemCost.value : '');
  return { itemId, qty, unitCost: unitCost > 0 ? unitCost : undefined };
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

export function getOutstandingHutang() {
  if (typeof window.__getOutstandingHutang === 'function') {
    try { return window.__getOutstandingHutang() || []; } catch { return []; }
  }
  return [];
}

export function getOutstandingPiutang() {
  if (typeof window.__getOutstandingPiutang === 'function') {
    try { return window.__getOutstandingPiutang() || []; } catch { return []; }
  }
  return [];
}

export function getOutstandingLoans(direction) {
  if (direction === 'given') return getOutstandingPiutang();
  if (direction === 'taken') return getOutstandingHutang();
  return [];
}

function populateSettlePicker(direction) {
  const list = document.getElementById('hutangList');
  const hint = document.getElementById('hutangPickerHint');
  if (!list) return;
  const isPiutang = direction === 'given';
  const items = getOutstandingLoans(direction);
  const emptyTxt = isPiutang ? 'Belum ada teman yang kamu kasih pinjam' : 'Belum ada loan yang kamu ambil';
  if (!items.length) {
    list.innerHTML = `<div class="hutang-empty">${emptyTxt}.<br>Kelola via menu <strong>Pinjaman</strong>.</div>`;
    if (hint) hint.textContent = emptyTxt;
    elements.entryLoanId.value = '';
    elements.entryLoanPerson.value = '';
    updateTxAmountVisual();
    updateTxMetaBar();
    return;
  }
  if (hint && !elements.entryLoanId.value) hint.textContent = `${items.length} ${isPiutang ? 'teman belum balikin' : 'loan belum dibalikin'} — ketuk untuk memilih cicilan berikutnya`;
  const selectedId = elements.entryLoanId.value || '';
  list.innerHTML = items.map(h => {
    const initial = (h.person || '?')[0]?.toUpperCase() || '?';
    const sel = h.id === selectedId ? ' selected' : '';
    const paidCount = h.paidCount || 0;
    const schedTxt = h.tenor > 1
      ? `Cicilan ${Math.min(paidCount + 1, h.tenor)}/${h.tenor} • ${formatCurrency(h.nextAmt)}`
      : 'Lunas 1x';
    return `<button type="button" class="hutang-item${isPiutang ? ' piutang-pick' : ''}${sel}" data-loan-id="${h.id}">
      <span class="hutang-avatar">${escapeHtml(initial)}</span>
      <span style="flex:1;min-width:0">
        <span class="hutang-name">${escapeHtml(h.person)}</span>
        <span class="hutang-sub" style="display:block">${schedTxt} • Sisa ${escapeHtml(formatCurrency(h.outstanding))}</span>
      </span>
      <span class="hutang-amt"><strong>${escapeHtml(formatCurrency(h.nextAmt))}</strong><span>cicilan</span></span>
    </button>`;
  }).join('');
  list.querySelectorAll('.hutang-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.loanId;
      const found = getOutstandingLoans(direction).find(x => x.id === id);
      if (!found) return;
      elements.entryLoanId.value = found.id;
      elements.entryLoanPerson.value = found.person || '';
      elements.entryContactType.value = found.contactType || 'person';
      const ctGroup = elements.contactTypeGroup;
      if (ctGroup) setSelected(ctGroup, found.contactType || 'person');
      // Default = cicilan berikutnya (bukan lunas penuh)
      elements.entryAmount.value = formatIdrInput(found.nextAmt);
      list.querySelectorAll('.hutang-item').forEach(b => b.classList.toggle('selected', b.dataset.loanId === id));
      const paidCount = found.paidCount || 0;
      const schedTxt = found.tenor > 1 ? `Cicilan ${Math.min(paidCount + 1, found.tenor)}/${found.tenor} • ` : '';
      if (hint) hint.innerHTML = `Terpilih: ${escapeHtml(found.person)} • ${schedTxt}${escapeHtml(formatCurrency(found.nextAmt))} <button type="button" id="hutangFillFull" class="hutang-lunasi">Lunasi ${escapeHtml(formatCurrency(found.outstanding))}</button>`;
      const fullBtn = document.getElementById('hutangFillFull');
      if (fullBtn) fullBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        elements.entryAmount.value = formatIdrInput(found.outstanding);
        updateTxAmountVisual();
        updateTxMetaBar();
      });
      updateTxAmountVisual();
      updateTxMetaBar();
    });
  });
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
    category = elements.customCategory.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[<>"'&]/g, '');
    if (!category) category = 'lain-custom';
  }
  const isLoan = category === 'Piutang' || category === 'Hutang';

  const tenorEl = document.getElementById('entryTenor');
  const tenorVal = tenorEl ? parseInt(String(tenorEl.value).replace(/[^0-9]/g,''), 10) || 0 : 0;
  let installmentAmount = parseFormattedNumber(elements.entryInstallment.value);
  const amtForCalc = parseFormattedNumber(elements.entryAmount.value);
  const rateForCalc = readBungaRate();
  const totalForCalc = amtForCalc + Math.round(amtForCalc * rateForCalc / 100);
  if (isLoan && elements.entryLoanType.value === 'cicilan' && (!installmentAmount || installmentAmount <= 0) && tenorVal > 0 && totalForCalc > 0) {
    installmentAmount = Math.ceil(totalForCalc / tenorVal);
  }
  const payment = elements.entryPayment.value || 'transfer';
  const ppn = !!(elements.entryPPN && elements.entryPPN.checked);
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
  const loanMode = (isLoan && elements.entryLoanMode && elements.entryLoanMode.value) || 'new';
  // Catatan: settle/addRepayment mengabaikan interestRate; edit loan butuh nilainya
  const interestRate = isLoan ? readBungaRate() : 0;
  const itemLink = !isLoan ? readItemLink() : {};
  return {
    id: elements.entryId.value || null,
    date: elements.entryDate.value,
    type: elements.entryType.value,
    category,
    loanMode,
    interestRate,
    payment,
    paymentDetail,
    ppn,
    description: elements.entryDescription.value.trim(),
    amount: parseFormattedNumber(elements.entryAmount.value),
    loanId: elements.entryLoanId.value || null,
    person: elements.entryLoanPerson.value.trim(),
    loanDue: elements.entryLoanDue ? elements.entryLoanDue.value : '',
    loanType: elements.entryLoanType.value || 'lunas',
    installmentAmount,
    contactType: elements.entryContactType.value || 'person',
    itemId: itemLink.itemId || null,
    qty: itemLink.qty || null,
    unitCost: itemLink.unitCost
  };
}

export function validateForm(data) {
  if (!data.date) return 'Tanggalnya diisi dulu ya';
  if (typeof window.__isLockedMonth === 'function') {
    try {
      if (window.__isLockedMonth(data.date)) return `Bulan ${String(data.date).slice(0, 7)} sudah dikunci — buka di Pengaturan kalau mau ubah`;
    } catch {}
  }
  if (!data.type) return 'Pilih dulu: masuk atau keluar?';
  if (!data.category) return 'Pilih dulu kategorinya';
  if (data.amount !== undefined && data.amount < 100) return 'Minimal Rp100 ya';
  const mode = data.loanMode || 'new';
  if (data.category === 'Hutang') {
    if (mode === 'settle') {
      if (!data.loanId) return 'Pilih dulu siapa yang mau dibalikin';
      const found = getOutstandingHutang().find(x => x.id === data.loanId);
      if (!found) return 'Sudah lunas atau tidak ditemukan — pilih ulang';
      if (data.amount > found.outstanding + 0.01) return `Kebanyakan! Sisa cuma ${formatCurrency(found.outstanding)}`;
    } else {
      if (!data.person) return 'Ketik dulu nama temanmu';
    }
  }
  if (data.category === 'Piutang') {
    if (mode === 'settle') {
      if (!data.loanId) return 'Pilih dulu siapa yang mau balikin ke kamu';
      const found = getOutstandingPiutang().find(x => x.id === data.loanId);
      if (!found) return 'Sudah lunas atau tidak ditemukan — pilih ulang';
      if (data.amount > found.outstanding + 0.01) return `Kebanyakan! Sisa cuma ${formatCurrency(found.outstanding)}`;
    } else {
      if (!data.person) return 'Ketik dulu nama temanmu';
    }
  }
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

export function bindTableActions(onEdit, onDelete, onDuplicate, onReceipt) {
  elements.entriesBody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    const duplicateBtn = e.target.closest('.duplicate-btn');
    const receiptBtn = e.target.closest('.receipt-btn');
    if (editBtn) onEdit(editBtn.dataset.id);
    if (deleteBtn) onDelete(deleteBtn.dataset.id);
    if (duplicateBtn && onDuplicate) onDuplicate(duplicateBtn.dataset.id);
    if (receiptBtn && onReceipt) onReceipt(receiptBtn.dataset.id);
  });
}

/* ===== Kwitansi ===== */
const TERBILANG = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
export function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'nol';
  const words = (x) => {
    if (x < 12) return TERBILANG[x];
    if (x < 20) return words(x - 10) + ' belas';
    if (x < 100) return words(Math.floor(x / 10)) + ' puluh ' + words(x % 10);
    if (x < 200) return 'seratus ' + words(x - 100);
    if (x < 1000) return words(Math.floor(x / 100)) + ' ratus ' + words(x % 100);
    if (x < 2000) return 'seribu ' + words(x - 1000);
    if (x < 1000000) return words(Math.floor(x / 1000)) + ' ribu ' + words(x % 1000);
    if (x < 1000000000) return words(Math.floor(x / 1000000)) + ' juta ' + words(x % 1000000);
    if (x < 1000000000000) return words(Math.floor(x / 1000000000)) + ' milyar ' + words(x % 1000000000);
    return words(Math.floor(x / 1000000000000)) + ' trilyun ' + words(x % 1000000000000);
  };
  return words(n).replace(/\s+/g, ' ').trim();
}

let receiptEntry = null;
export function openReceipt(entry) {
  receiptEntry = entry ? { ...entry } : null;
  const modal = document.getElementById('receiptModal');
  if (!modal || !receiptEntry) return;
  renderReceiptPreview();
  if (!modal.open) { try { modal.showModal(); } catch {} }
  trapFocus(modal);
}
export function closeReceipt() {
  const modal = document.getElementById('receiptModal');
  if (!modal) return;
  releaseFocus(modal);
  if (modal.open) { try { modal.close(); } catch {} }
}
function renderReceiptPreview() {
  const box = document.getElementById('receiptPreview');
  if (!box || !receiptEntry) return;
  const e = receiptEntry;
  const withPPN = document.getElementById('receiptPPN')?.checked;
  const amt = Math.round(Number(e.amount) || 0);
  const fmt = (v) => 'Rp' + Number(v).toLocaleString('id-ID');
  let dpp = amt, ppn = 0;
  if (withPPN) { dpp = Math.round(amt / 1.11); ppn = amt - dpp; }
  const payLabel = `${getPaymentIcon(e.payment)} ${getPaymentLabel(e.payment)}${e.paymentDetail ? ' • ' + escapeHtml(e.paymentDetail) : ''}`;
  box.innerHTML = `
    <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px">
      <div style="font-size:18px;font-weight:800">🧾 KWITANSI</div>
      <div style="font-size:11px;color:#64748b">No: KW-${String(e.id || '').slice(-6).toUpperCase()} • ${formatDate(e.date)}</div>
    </div>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#64748b;width:110px">Jenis</td><td><b>${e.type === 'income' ? '📥 Uang masuk' : '📤 Uang keluar'}</b></td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Kategori</td><td>${getCategoryIcon(e.category)} ${escapeHtml(getCategoryLabel(e.category))}</td></tr>
      ${e.person ? `<tr><td style="padding:4px 0;color:#64748b">Teman</td><td>${escapeHtml(e.person)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#64748b">Bayar pakai</td><td>${payLabel}</td></tr>
      ${e.description ? `<tr><td style="padding:4px 0;color:#64748b">Catatan</td><td>${escapeHtml(e.description)}</td></tr>` : ''}
      ${withPPN ? `<tr><td style="padding:4px 0;color:#64748b">DPP</td><td>${fmt(dpp)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">PPN 11%</td><td>${fmt(ppn)}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#64748b"><b>Jumlah</b></td><td style="font-size:20px;font-weight:800">${fmt(amt)}</td></tr>
      <tr><td colspan="2" style="padding:6px 0;font-style:italic;background:#f8fafc;border-radius:8px;padding:8px">Terbilang: “${terbilang(amt)} rupiah”</td></tr>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:18px;font-size:12px;color:#64748b">
      <div style="text-align:center">Hormat kami,<br><br><br>( ............. )</div>
    </div>`;
}
export function bindReceipt() {
  document.getElementById('receiptModalClose')?.addEventListener('click', closeReceipt);
  document.getElementById('receiptModalCancel')?.addEventListener('click', closeReceipt);
  document.getElementById('receiptPPN')?.addEventListener('change', renderReceiptPreview);
  document.getElementById('receiptPrintBtn')?.addEventListener('click', () => {
    const box = document.getElementById('receiptPreview');
    if (!box) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Kwitansi</title><style>body{font-family:Arial,sans-serif;max-width:420px;margin:20px auto;padding:16px;border:1px solid #ccc}table{width:100%}</style></head><body>${box.innerHTML}<script>onload=()=>{print();}<\/script></body></html>`);
    w.document.close();
  });
  document.getElementById('receiptModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'receiptModal') closeReceipt();
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
    `<button type="button" class="chip category-chip" data-value="${escapeHtml(c)}">${getCategoryIcon(c)} ${escapeHtml(getCategoryLabel(c))}</button>`
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
    case 'journal':
      elements.reportContent.innerHTML = renderJournalReport(data);
      break;
    case 'ledger':
      elements.reportContent.innerHTML = renderLedgerReport(data);
      break;
    case 'pl':
      elements.reportContent.innerHTML = renderPLReport(data);
      break;
    case 'bs':
      elements.reportContent.innerHTML = renderBSReport(data);
      break;
    case 'tax':
      elements.reportContent.innerHTML = renderTaxReport(data);
      break;
    case 'audit':
      elements.reportContent.innerHTML = renderAuditReport(data);
      break;
    case 'payrollrep':
      window.__payrollRepData = data;
      elements.reportContent.innerHTML = renderPayrollReport(data);
      bindPayrollRepToggle();
      break;
  }
}

export function openReportModal() {
  if (!elements.reportSection.open) elements.reportSection.showModal();
}

export function printCurrentReport() {
  const box = document.getElementById('reportContent');
  const tab = document.querySelector('.report-tab.active');
  if (!box) return;
  const title = tab ? tab.textContent.trim() : 'Laporan';
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>Wynara — ${escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;max-width:720px;margin:20px auto;padding:0 16px;color:#111}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f3f4f6}
    .amount-col{text-align:right;font-variant-numeric:tabular-nums}
    h4{margin:14px 0 6px}
  </style></head><body>
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
      <div style="font-size:18px;font-weight:800">WYNARA — ${escapeHtml(title).toUpperCase()}</div>
      <div style="font-size:11px;color:#555">Dicetak ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
    ${box.innerHTML}
    <script>onload=()=>{print();}<\/script></body></html>`);
  w.document.close();
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
              <td>${getCategoryIcon(c.category)} ${escapeHtml(getCategoryLabel(c.category))}</td>
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
            <div class="top-expense-name">${getCategoryIcon(item.category)} ${escapeHtml(item.description || getCategoryLabel(item.category))}</div>
            <div class="top-expense-category">${escapeHtml(getCategoryLabel(item.category))} • ${item.count}x transaksi</div>
          </div>
          <div class="top-expense-amount">${formatCurrency(item.total)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== Laporan akuntansi (jurnal, buku besar, L/R, neraca, pajak, audit) =====
function renderJournalReport(journals) {
  if (!journals || !journals.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada jurnal pada periode ini</p>';
  }
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Jurnal</span><span class="value">${journals.length}</span></div>
      <div class="report-summary-item"><span class="label">Total Debit = Kredit</span><span class="value income">✓ Balance</span></div>
    </div>
    <table class="report-table">
      <thead><tr><th>Tanggal</th><th>Memo</th><th>Akun</th><th class="amount-col">Debit</th><th class="amount-col">Kredit</th></tr></thead>
      <tbody>
        ${journals.map(j => (j.lines || []).map((l, i) => `
          <tr>
            <td>${i === 0 ? formatDate(j.date) : ''}</td>
            <td>${i === 0 ? escapeHtml(j.memo || '') : ''}</td>
            <td style="padding-left:${i === 0 ? 8 : 24}px">${escapeHtml(accountLabel(l.account))}</td>
            <td class="amount-col">${l.debit ? formatCurrency(l.debit) : ''}</td>
            <td class="amount-col">${l.credit ? formatCurrency(l.credit) : ''}</td>
          </tr>`).join('')).join('')}
      </tbody>
    </table>`;
}

function renderLedgerReport(bal) {
  const codes = Object.keys(bal || {}).sort();
  if (!codes.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada gerakan akun pada periode ini</p>';
  }
  return `
    <table class="report-table">
      <thead><tr><th>Akun</th><th class="amount-col">Debit</th><th class="amount-col">Kredit</th><th class="amount-col">Saldo</th></tr></thead>
      <tbody>
        ${codes.map(c => {
          const b = bal[c];
          const net = b.debit - b.credit;
          return `<tr><td>${escapeHtml(accountLabel(c))}</td>
            <td class="amount-col">${formatCurrency(b.debit)}</td>
            <td class="amount-col">${formatCurrency(b.credit)}</td>
            <td class="amount-col" style="font-weight:700">${net >= 0 ? '' : '−'}${formatCurrency(Math.abs(net))} ${net >= 0 ? 'Db' : 'Kr'}</td></tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderPLReport(d) {
  if (!d) return '';
  const netClass = d.net >= 0 ? 'income' : 'expense';
  const hasPrev = !!d.prev;
  const delta = (cur, prv) => {
    if (!hasPrev) return '';
    const v = cur - prv;
    const cls = v > 0 ? 'income' : v < 0 ? 'expense' : '';
    return `<td class="amount-col ${cls}">${v > 0 ? '+' : ''}${formatCurrency(v)}</td>`;
  };
  const prevCell = (v) => hasPrev ? `<td class="amount-col" style="color:#64748b">${formatCurrency(v)}</td>` : '';
  const prevHead = hasPrev ? '<th class="amount-col">Lalu</th><th class="amount-col">±</th>' : '';
  const b = d.budget || { limit: 0, spent: 0, cats: [] };
  const bPct = b.limit > 0 ? Math.min(100, Math.round((b.spent / b.limit) * 100)) : 0;
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Pendapatan</span><span class="value income">${formatCurrency(d.revenue)}</span></div>
      <div class="report-summary-item"><span class="label">Total Beban</span><span class="value expense">${formatCurrency(d.totalExp)}</span></div>
      <div class="report-summary-item"><span class="label">Laba Bersih</span><span class="value ${netClass}">${formatCurrency(d.net)}</span></div>
      ${hasPrev ? `<div class="report-summary-item"><span class="label">vs Periode Lalu</span><span class="value ${d.net - d.prev.net >= 0 ? 'income' : 'expense'}">${(d.net - d.prev.net >= 0 ? '+' : '') + formatCurrency(d.net - d.prev.net)}</span></div>` : ''}
    </div>
    <h4 style="margin:12px 0;color:var(--success);">📈 Pendapatan</h4>
    <table class="report-table"><thead><tr><th>Akun</th><th class="amount-col">Kini</th>${prevHead}</tr></thead><tbody>
      <tr><td>Pendapatan Usaha (4101)</td><td class="amount-col income">${formatCurrency(d.revenue)}</td>${prevCell(hasPrev ? d.prev.revenue : 0)}${hasPrev ? delta(d.revenue, d.prev.revenue) : ''}</tr>
    </tbody></table>
    <h4 style="margin:12px 0;color:var(--danger);">📉 Beban</h4>
    <table class="report-table"><thead><tr><th>Akun</th><th class="amount-col">Kini</th>${prevHead}</tr></thead><tbody>
      ${d.expenses.length ? d.expenses.map(x => {
        const p = hasPrev ? (d.prev.expenses.find(y => y.code === x.code)?.total || 0) : 0;
        return `<tr><td>${escapeHtml(accountLabel(x.code))}</td><td class="amount-col expense">${formatCurrency(x.total)}</td>${prevCell(p)}${hasPrev ? delta(x.total, p) : ''}</tr>`;
      }).join('') : `<tr><td colspan="${hasPrev ? 4 : 2}">Tidak ada beban</td></tr>`}
      <tr><td><b>Total Beban</b></td><td class="amount-col expense"><b>${formatCurrency(d.totalExp)}</b></td>${prevCell(hasPrev ? d.prev.totalExp : 0)}${hasPrev ? delta(d.totalExp, d.prev.totalExp) : ''}</tr>
      <tr><td><b>Laba Bersih</b></td><td class="amount-col ${netClass}"><b>${formatCurrency(d.net)}</b></td>${prevCell(hasPrev ? d.prev.net : 0)}${hasPrev ? delta(d.net, d.prev.net) : ''}</tr>
    </tbody></table>
    ${(b.limit > 0 || b.cats.length) ? `
    <h4 style="margin:12px 0;">🎯 Anggaran vs Realisasi (bulan berjalan)</h4>
    <table class="report-table"><thead><tr><th>Anggaran</th><th class="amount-col">Limit</th><th class="amount-col">Pakai</th><th class="amount-col">Sisa</th></tr></thead><tbody>
      ${b.limit > 0 ? `<tr><td><b>Bulanan</b> (${bPct}%)</td><td class="amount-col">${formatCurrency(b.limit)}</td><td class="amount-col ${b.spent > b.limit ? 'expense' : ''}">${formatCurrency(b.spent)}</td><td class="amount-col ${b.limit - b.spent >= 0 ? 'income' : 'expense'}">${formatCurrency(b.limit - b.spent)}</td></tr>` : ''}
      ${b.cats.map(c => `<tr><td>${escapeHtml(c.label)}</td><td class="amount-col">${formatCurrency(c.limit)}</td><td class="amount-col ${c.spent > c.limit ? 'expense' : ''}">${formatCurrency(c.spent)}</td><td class="amount-col ${c.limit - c.spent >= 0 ? 'income' : 'expense'}">${formatCurrency(c.limit - c.spent)}</td></tr>`).join('')}
    </tbody></table>` : ''}`;
}

function renderBSReport(d) {
  if (!d) return '';
  const hasPrev = !!d.prev;
  const prevOf = (list, code) => (list || []).find(x => x.code === code)?.total || 0;
  const delta = (cur, prv) => {
    if (!hasPrev) return '';
    const v = cur - prv;
    const cls = v > 0 ? 'income' : v < 0 ? 'expense' : '';
    return `<td class="amount-col ${cls}">${v > 0 ? '+' : ''}${formatCurrency(v)}</td>`;
  };
  const prevCell = (v) => hasPrev ? `<td class="amount-col" style="color:#64748b">${formatCurrency(v)}</td>` : '';
  const prevHead = hasPrev ? '<th class="amount-col">Awal</th><th class="amount-col">±</th>' : '';
  const row = (x, prevList) => {
    const p = prevOf(prevList, x.code);
    return `<tr><td>${escapeHtml(accountLabel(x.code))}</td><td class="amount-col">${formatCurrency(x.total)}</td>${prevCell(p)}${delta(x.total, p)}</tr>`;
  };
  const colspan = hasPrev ? 4 : 2;
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Total Aset</span><span class="value">${formatCurrency(d.totalA)}</span></div>
      <div class="report-summary-item"><span class="label">Kewajiban + Modal</span><span class="value">${formatCurrency(d.totalL + d.equity)}</span></div>
      <div class="report-summary-item"><span class="label">Selisih</span><span class="value ${Math.abs(d.balanced) < 1 ? 'income' : 'expense'}">${Math.abs(d.balanced) < 1 ? '✓ Balance' : formatCurrency(d.balanced)}</span></div>
      ${hasPrev ? `<div class="report-summary-item"><span class="label">Δ Aset vs awal</span><span class="value ${d.totalA - d.prev.totalA >= 0 ? 'income' : 'expense'}">${(d.totalA - d.prev.totalA >= 0 ? '+' : '') + formatCurrency(d.totalA - d.prev.totalA)}</span></div>` : ''}
    </div>
    ${hasPrev ? `<p style="font-size:11px;color:#64748b">Banding vs saldo awal ${escapeHtml(d.prevLabel || '')}.</p>` : ''}
    <h4 style="margin:12px 0;">💰 Aset</h4>
    <table class="report-table"><thead><tr><th>Akun</th><th class="amount-col">Kini</th>${prevHead}</tr></thead><tbody>
      ${d.assets.length ? d.assets.map(x => row(x, hasPrev ? d.prev.assets : [])).join('') : `<tr><td colspan="${colspan}">Tidak ada aset</td></tr>`}
      <tr><td><b>Total Aset</b></td><td class="amount-col"><b>${formatCurrency(d.totalA)}</b></td>${prevCell(hasPrev ? d.prev.totalA : 0)}${hasPrev ? delta(d.totalA, d.prev.totalA) : ''}</tr>
    </tbody></table>
    <h4 style="margin:12px 0;">📋 Kewajiban</h4>
    <table class="report-table"><thead><tr><th>Akun</th><th class="amount-col">Kini</th>${prevHead}</tr></thead><tbody>
      ${d.liabs.length ? d.liabs.map(x => row(x, hasPrev ? d.prev.liabs : [])).join('') : `<tr><td colspan="${colspan}">Tidak ada kewajiban</td></tr>`}
      <tr><td><b>Total Kewajiban</b></td><td class="amount-col"><b>${formatCurrency(d.totalL)}</b></td>${prevCell(hasPrev ? d.prev.totalL : 0)}${hasPrev ? delta(d.totalL, d.prev.totalL) : ''}</tr>
    </tbody></table>
    <h4 style="margin:12px 0;">🏦 Modal</h4>
    <table class="report-table"><thead><tr><th>Akun</th><th class="amount-col">Kini</th>${prevHead}</tr></thead><tbody>
      <tr><td>Modal Awal (3101)</td><td class="amount-col">${formatCurrency(d.modal)}</td>${prevCell(hasPrev ? d.prev.modal : 0)}${hasPrev ? delta(d.modal, hasPrev ? d.prev.modal : 0) : ''}</tr>
      <tr><td>Laba Ditahan (berjalan)</td><td class="amount-col">${formatCurrency(d.laba)}</td>${prevCell(hasPrev ? d.prev.laba : 0)}${hasPrev ? delta(d.laba, hasPrev ? d.prev.laba : 0) : ''}</tr>
      <tr><td><b>Total Modal</b></td><td class="amount-col"><b>${formatCurrency(d.equity)}</b></td>${prevCell(hasPrev ? d.prev.equity : 0)}${hasPrev ? delta(d.equity, hasPrev ? d.prev.equity : 0) : ''}</tr>
    </tbody></table>`;
}

function renderTaxReport(d) {
  if (!d) return '';
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Omzet ${d.year}</span><span class="value">${formatCurrency(d.omzetYear)}</span></div>
      <div class="report-summary-item"><span class="label">PPh Final 0.5%</span><span class="value expense">${formatCurrency(d.pphYear)}</span></div>
      <div class="report-summary-item"><span class="label">Sisa plafon 4.8M</span><span class="value ${4800000000 - d.omzetYear >= 0 ? 'income' : 'expense'}">${formatCurrency(Math.max(4800000000 - d.omzetYear, 0))}</span></div>
      <div class="report-summary-item"><span class="label">PPN Kurang Bayar</span><span class="value ${d.ppnNet >= 0 ? 'expense' : 'income'}">${formatCurrency(d.ppnNet)}</span></div>
    </div>
    <p style="font-size:11px;color:#64748b">PPh Final dibayar tiap bulan paling lambat tgl 15 bulan berikutnya (PP 55/2022). PPN = Keluaran − Masukan.</p>
    <table class="report-table">
      <thead><tr><th>Bulan</th><th class="amount-col">Omzet</th><th class="amount-col">PPh 0.5%</th></tr></thead>
      <tbody>
        ${d.months.length ? d.months.map(m => `<tr><td>${m.month}</td><td class="amount-col">${formatCurrency(m.omzet)}</td><td class="amount-col">${formatCurrency(m.pph)}</td></tr>`).join('') : '<tr><td colspan="3">Belum ada omzet</td></tr>'}
      </tbody>
    </table>`;
}

function renderAuditReport(rows) {
  if (!rows || !rows.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada aktivitas tercatat</p>';
  }
  const icon = { create: '➕', update: '✎', delete: '🗑️' };
  return `
    <table class="report-table">
      <thead><tr><th>Waktu</th><th>Aksi</th><th>Data</th></tr></thead>
      <tbody>
        ${rows.map(a => {
          let detail = '';
          try {
            const af = a.after || {};
            const bf = a.before || {};
            const amt = af.amount ?? bf.amount;
            detail = `${escapeHtml(a.entity || '')} ${amt !== undefined ? '• ' + formatCurrency(amt) : ''}`;
          } catch { detail = escapeHtml(a.entity || ''); }
          return `<tr><td style="white-space:nowrap;font-size:11px">${escapeHtml(String(a.ts || '').slice(0, 16).replace('T', ' '))}</td>
            <td>${icon[a.action] || '•'} ${escapeHtml(a.action || '')}</td><td>${detail}</td></tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

let payrollRepMode = 'month';
function payrollRepRows(d) {
  const fmt = (v) => formatCurrency(v);
  if (payrollRepMode === 'year') {
    if (!d.years.length) return '<tr><td colspan="7">Belum ada data gaji</td></tr>';
    return d.years.map(y => `<tr><td><b>${y.year}</b></td><td class="amount-col">${fmt(y.gross)}</td><td class="amount-col">${fmt(y.thr)}</td><td class="amount-col">${fmt(y.dedEmp)}</td><td class="amount-col">${fmt(y.pph)}</td><td class="amount-col">${fmt(y.comp)}</td><td class="amount-col"><b>${fmt(y.thp)}</b></td></tr>`).join('');
  }
  if (!d.months.length) return '<tr><td colspan="7">Belum ada data gaji</td></tr>';
  return d.months.map(m => `<tr><td><b>${m.month}</b> <small style="color:#94a3b8">(${m.count}x)</small></td><td class="amount-col">${fmt(m.gross)}</td><td class="amount-col">${fmt(m.thr)}</td><td class="amount-col">${fmt(m.dedEmp)}</td><td class="amount-col">${fmt(m.pph)}</td><td class="amount-col">${fmt(m.comp)}</td><td class="amount-col"><b>${fmt(m.thp)}</b></td></tr>`).join('');
}
function renderPayrollReport(d) {
  if (!d) return '';
  const tot = (d.months || []).reduce((s, m) => ({ thp: s.thp + m.thp, comp: s.comp + m.comp, pph: s.pph + m.pph, thr: s.thr + m.thr }), { thp: 0, comp: 0, pph: 0, thr: 0 });
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Total THP</span><span class="value income">${formatCurrency(tot.thp)}</span></div>
      <div class="report-summary-item"><span class="label">Iuran perusahaan</span><span class="value expense">${formatCurrency(tot.comp)}</span></div>
      <div class="report-summary-item"><span class="label">PPh dipotong</span><span class="value">${formatCurrency(tot.pph)}</span></div>
      <div class="report-summary-item"><span class="label">Hutang BPJS</span><span class="value ${d.bpjsDebt > 0 ? 'expense' : ''}">${formatCurrency(d.bpjsDebt)}</span></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin:12px 0">
      <div class="chip-group">
        <button type="button" class="chip${payrollRepMode === 'month' ? ' selected' : ''}" data-paymode="month">Bulanan</button>
        <button type="button" class="chip${payrollRepMode === 'year' ? ' selected' : ''}" data-paymode="year">Tahunan</button>
      </div>
      <button type="button" class="btn btn-ghost" id="payrollPrintBtn" style="font-size:11px;padding:4px 10px">🖨️ Cetak</button>
    </div>
    <table class="report-table">
      <thead><tr><th>Periode</th><th class="amount-col">Bruto</th><th class="amount-col">THR</th><th class="amount-col">Potongan kary.</th><th class="amount-col">PPh 21</th><th class="amount-col">Iuran prsh.</th><th class="amount-col">THP</th></tr></thead>
      <tbody id="payrollRepBody">${payrollRepRows(d)}</tbody>
    </table>
    <p style="font-size:11px;color:#64748b">Potongan kary. = BPJS Kes 1% + JHT 2% + JP 1%. Iuran prsh. = Kes 4% + JHT 3.7% + JP 2% + JKK + JKM 0.3%.</p>`;
}
function bindPayrollRepToggle() {
  const body = document.getElementById('reportContent');
  if (!body || body.dataset.paybound) return;
  body.dataset.paybound = '1';
  body.addEventListener('click', (e) => {
    const mode = e.target.closest('[data-paymode]');
    if (mode) {
      payrollRepMode = mode.dataset.paymode;
      const tb = document.getElementById('payrollRepBody');
      if (tb && window.__payrollRepData) tb.innerHTML = payrollRepRows(window.__payrollRepData);
      document.querySelectorAll('[data-paymode]').forEach(b => b.classList.toggle('selected', b === mode));
      return;
    }
    if (e.target.closest('#payrollPrintBtn') && window.__payrollRepData) {
      printPayrollReport(window.__payrollRepData);
    }
  });
}
function printPayrollReport(d) {
  const rows = (payrollRepMode === 'year' ? d.years.map(y => [`Tahun ${y.year}`, y.gross, y.thr, y.dedEmp, y.pph, y.comp, y.thp]) : d.months.map(m => [m.month, m.gross, m.thr, m.dedEmp, m.pph, m.comp, m.thp]));
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>Laporan Gaji</title></head><body>
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
        <div style="font-size:18px;font-weight:800">LAPORAN GAJI & IURAN (${payrollRepMode === 'year' ? 'TAHUNAN' : 'BULANAN'})</div>
      </div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr><th style="border:1px solid #ddd;padding:6px">Periode</th><th style="border:1px solid #ddd;padding:6px">Bruto</th><th style="border:1px solid #ddd;padding:6px">THR</th><th style="border:1px solid #ddd;padding:6px">Potongan</th><th style="border:1px solid #ddd;padding:6px">PPh 21</th><th style="border:1px solid #ddd;padding:6px">Iuran prsh.</th><th style="border:1px solid #ddd;padding:6px">THP</th></tr>
        ${rows.map(r => `<tr>${r.map((c, i) => `<td style="border:1px solid #ddd;padding:6px;${i ? 'text-align:right' : ''}">${i ? fmt(c) : r[0]}</td>`).join('')}</tr>`).join('')}
      </table>
      <p style="font-size:12px">Hutang BPJS: ${fmt(d.bpjsDebt)}</p>
    </div><script>onload=()=>{print();}<\/script></body></html>`);
  w.document.close();
}

// ===== Loans UI =====
export function openLoans(loans, repayments, summary, allLoans, people) {
  if (!elements.loansSection.open) elements.loansSection.showModal();
  renderLoans(loans, repayments, summary, allLoans, people);
}

function waNumber(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (!p) return '';
  if (p.startsWith('0')) p = '62' + p.slice(1);
  return p;
}

export function waRemindLink(person, outstanding, dueLabel, phone) {
  const num = waNumber(phone);
  const msg = `Halo ${person}, pengingat ramah: sisa pinjaman ${formatCurrency(outstanding)}${dueLabel ? ` (jatuh tempo ${dueLabel})` : ''}. Terima kasih 🙏`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

function agingBucket(diffDays) {
  if (diffDays === null || diffDays >= 0) return 'lancar';
  const late = Math.abs(diffDays);
  if (late <= 30) return 'telat30';
  if (late <= 60) return 'telat60';
  return 'macet';
}

export function closeLoans() {
  if (elements.loansSection && elements.loansSection.open) {
    try { elements.loansSection.close(); } catch {}
  }
}

function buildScheduleRows(loan, reps) {
  const verb = loan.direction !== 'given' ? 'Bayar' : 'Terima';
  return scheduleData(loan, reps).map(row => {
    const badge = row.paid
      ? '<span class="sched-badge done">✅ Sudah</span>'
      : (row.isNext ? '<span class="sched-badge next">👉 Sekarang</span>' : '<span class="sched-badge todo">⏳ Belum</span>');
    const btn = (!row.paid && row.isNext)
      ? `<button class="btn repay-btn pay-next-btn" data-id="${loan.id}" data-amount="${row.amount}" style="font-size:11px;padding:4px 10px">${verb} ${formatCurrency(row.amount)}</button>`
      : '';
    return `<div class="loan-schedule-row"><span style="min-width:0"><strong>Ke-${row.n}/${row.tenor}</strong> • ${row.monthLabel}<br><span style="color:var(--text-muted)">${formatCurrency(row.amount)}</span></span><span style="display:flex;align-items:center;gap:6px">${badge}${btn}</span></div>`;
  }).join('');
}

function nextDueUi(loan, paidCount) {
  return nextDue(loan, paidCount);
}

export function renderLoans(loans, repayments, summary, allLoans, people) {
  const peopleList = Array.isArray(people) ? people : [];
  const phoneOf = (name) => {
    const p = peopleList.find(x => x && x.name === name);
    return p ? (p.phone || '') : '';
  };
  elements.totalPiutang.textContent = formatCurrency(summary.piutangOutstanding);
  elements.totalHutang.textContent = formatCurrency(summary.hutangOutstanding);
  elements.loanNet.textContent = formatCurrency(summary.net);
  elements.loanNet.className = 'value ' + (summary.net >= 0 ? 'income' : 'expense');

  // tab counts from unfiltered list
  const source = Array.isArray(allLoans) ? allLoans : loans;
  const counts = { all: source.length, given: 0, taken: 0 };
  source.forEach(l => { if (l.direction === 'taken') counts.taken++; else counts.given++; });
  document.querySelectorAll('#loanTabs .chip').forEach(b => {
    const v = b.dataset.value;
    const n = v === 'all' ? counts.all : (counts[v] || 0);
    const base = v === 'all' ? 'Semua' : (v === 'given' ? '🟢 Pinjemin' : '🔴 Ambil Loan');
    b.textContent = `${base} (${n})`;
  });

  if (!loans.length) {
    elements.loanList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:30px;">Belum ada pinjaman di filter ini. Klik "＋ Tambah" atau ubah filter.</p>';
    return;
  }

  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);

  // Ringkasan aging piutang (uang yang harus kembali ke kamu)
  const age = { lancar: 0, telat30: 0, telat60: 0, macet: 0 };
  source.forEach(l => {
    if (l.direction !== 'given' || l.status === 'paid') return;
    const reps = (repayments || []).filter(r => r.loanId === l.id);
    const due = nextDueUi(l, reps.length);
    const dd = due ? Math.ceil((due - todayMid) / 86400000) : null;
    const out = outstandingOf(l, reps);
    if (out > 0) age[agingBucket(dd)] += out;
  });
  const ageTotal = age.lancar + age.telat30 + age.telat60 + age.macet;
  const ageStrip = ageTotal > 0 ? `<div class="loan-aging" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;font-size:11px">
    <span class="chip" style="font-size:11px">✅ Lancar: ${formatCurrencyCompact(age.lancar)}</span>
    <span class="chip" style="font-size:11px">⏳ Telat ≤30h: ${formatCurrencyCompact(age.telat30)}</span>
    <span class="chip" style="font-size:11px">⚠️ 31–60h: ${formatCurrencyCompact(age.telat60)}</span>
    <span class="chip" style="font-size:11px">🔴 Macet &gt;60h: ${formatCurrencyCompact(age.macet)}</span>
  </div>` : '';

  elements.loanList.innerHTML = ageStrip + loans.map(l => {
    const reps = repayments.filter(r => r.loanId === l.id).sort((a, b) => new Date(a.date) - new Date(b.date));
    const paid = paidOf(reps);
    const outstanding = outstandingOf(l, reps);
    const owed = totalOwed(l);
    const pct = owed > 0 ? Math.min(100, (paid / owed) * 100) : 0;
    const isTaken = l.direction !== 'given';
    const dirLabel = isTaken ? 'Ambil Loan' : 'Pinjemin';
    const dirClass = isTaken ? 'taken' : 'given';
    const isCicilan = l.loanType === 'cicilan';
    const instAmt = l.installmentAmount || 0;
    const tenor = isCicilan ? (instAmt > 0 ? calcTenor(l) : 0) : 1;
    const monthsLeft = isCicilan && instAmt > 0 ? Math.ceil(Math.max(outstanding, 0) / instAmt) : 0;
    // Jumlah bayar bisa melebihi tenor (cicilan kecil-kecil) — jepit tampilan
    const doneShown = tenor > 0 ? Math.min(reps.length, tenor) : reps.length;
    const pastSchedule = tenor > 0 && reps.length >= tenor;
    const overpaid = Math.max(paid - owed, 0);
    // derived overdue (works even when dueDate empty — schedule from start date)
    const nextDue = nextDueUi(l, reps.length);
    const diffDays = nextDue ? Math.ceil((nextDue - todayMid) / 86400000) : null;
    const isOverdue = l.status !== 'paid' && diffDays !== null && diffDays < 0;
    const dueLabel = nextDue ? nextDue.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    const cardClass = `loan-card ${l.status === 'paid' ? 'paid' : ''} ${isOverdue ? 'overdue' : ''}`;
    const nextNum = reps.length + 1;
    const nextAmt = isCicilan && instAmt > 0 ? nextInstallmentAmount(l, reps) : Math.max(outstanding, 0);

    return `
      <div class="${cardClass}" data-id="${l.id}">
        <div class="loan-top">
          <div>
            <div class="loan-person">${l.contactType === 'perusahaan' ? '🏢' : '👤'} ${escapeHtml(l.person)}</div>
            <span class="loan-direction ${dirClass}">${dirLabel}</span>
            <span class="loan-type-badge">${isCicilan ? `📅 Cicilan${tenor ? ` ${tenor} bln` : ''}` : '💵 Lunas (1x)'}</span>
        ${isOverdue ? '<span class="loan-overdue-badge">⚠️ Terlambat</span>' : ''}
          </div>
          <div class="loan-amount ${dirClass}" title="${interestRateOf(l) > 0 ? `Pokok ${formatCurrency(l.amount)} + bunga ${formatCurrency(interestAmount(l))}` : ''}">${formatCurrency(totalOwed(l))}</div>
        </div>
        <div class="loan-meta">
          <span>📅 ${formatDate(l.date)}</span>
          ${isCicilan && instAmt > 0 ? `<span>💳 ${formatCurrency(instAmt)}/bulan</span>` : ''}
          ${isCicilan && tenor ? `<span>📊 Lama: ${tenor} bulan</span>` : ''}
          ${interestRateOf(l) > 0 ? `<span>🌸 Bunga ${interestRateOf(l)}% (+${formatCurrency(interestAmount(l))}) • Total ${formatCurrency(totalOwed(l))}</span>` : ''}
          ${l.invoiceNo ? `<span>🧾 ${escapeHtml(l.invoiceNo)}</span>` : ''}
          ${isCicilan && monthsLeft > 0 && l.status !== 'paid' ? `<span>⏳ Sisa ${monthsLeft} bulan • ${doneShown}/${tenor} kali</span>` : ''}
          ${isCicilan && instAmt > 0 && l.status !== 'paid' ? (pastSchedule ? `<span>💰 Bayar • Sisa ${formatCurrency(nextAmt)}</span>` : `<span>💰 Bayar ke-${nextNum}/${tenor}: ${formatCurrency(nextAmt)}</span>`) : ''}
          ${l.status !== 'paid' && dueLabel ? `<span class="${isOverdue ? 'overdue-date' : ''}">⏰ ${isCicilan ? 'Bayaran berikutnya' : 'Harus dibayar'}: ${dueLabel}${isOverdue ? ` • Telat ${Math.abs(diffDays)} hari` : ''}</span>` : ''}
          ${l.description ? `<span>📝 ${escapeHtml(l.description)}</span>` : ''}
        </div>
        <div class="loan-meta">
          <span class="loan-outstanding">Sisa: ${formatCurrency(Math.max(outstanding, 0))}</span>
          <span>Sudah: ${formatCurrency(paid)}${overpaid > 0 ? ` <small style="color:#b45309">(kelebihan ${formatCurrency(overpaid)})</small>` : ''}</span>
          <span>${l.status === 'paid' ? '✅ Lunas' : '⏳ Belum lunas'}</span>
        </div>
        <div class="loan-progress">
          <div class="loan-progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="loan-actions">
          ${l.status !== 'paid' && isCicilan && nextAmt > 0 ? `<button class="btn repay-btn pay-next-btn" data-id="${l.id}" data-amount="${nextAmt}" title="${isTaken ? `Bayar loan ${pastSchedule ? '' : `cicilan ke-${nextNum} `}sebesar ${formatCurrency(nextAmt)}` : `Terima ${pastSchedule ? '' : `cicilan ke-${nextNum} `}sebesar ${formatCurrency(nextAmt)}`}">${isTaken ? `💰 Bayar ${pastSchedule ? '' : `${nextNum}/${tenor} • `}${formatCurrencyCompact(nextAmt)}` : `💰 Terima ${pastSchedule ? '' : `${nextNum}/${tenor} • `}${formatCurrencyCompact(nextAmt)}`}</button>` : ''}
          ${l.status !== 'paid' && !isCicilan ? `<button class="btn repay-btn repay-loan-btn" data-id="${l.id}">${isTaken ? '💰 Bayar' : '💰 Terima'}</button>` : ''}
          ${l.status !== 'paid' && isCicilan ? `<button class="btn btn-secondary repay-loan-btn" data-id="${l.id}" title="Bayar nominal lain (sebagian / pelunasan)">Nominal lain</button>` : ''}
          ${isCicilan && tenor ? `<button class="btn btn-ghost schedule-toggle-btn" data-id="${l.id}" aria-expanded="false">Lihat jadwal ▾</button>` : ''}
          ${isOverdue && !isTaken ? `<a class="btn btn-ghost" href="${waRemindLink(l.person, outstanding, dueLabel, phoneOf(l.person))}" target="_blank" rel="noopener" title="Ingatkan via WhatsApp" style="text-decoration:none">💬 WA</a>` : ''}
          ${!isTaken ? `<button class="btn btn-ghost invoice-btn" data-id="${l.id}" title="Cetak invoice">🧾 Invoice</button>` : ''}
          <button class="btn btn-danger delete-loan-btn" data-id="${l.id}">🗑 Hapus</button>
        </div>
        ${isCicilan && tenor ? `
          <div class="loan-schedule hidden" id="sched-${l.id}">
            ${buildScheduleRows(l, reps)}
          </div>
        ` : ''}
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

export function openRepayModal(loanId, outstanding, presetAmount, presetLabel, detail) {
  elements.repayLoanId.value = loanId;
  elements.repayForm.reset();
  const d = detail || {};
  const total = Number(d.total) || 0;
  const paid = Number(d.paid) || 0;
  const paidCount = Number(d.paidCount) || 0;
  const tenor = Number(d.tenor) || 1;
  const instAmt = Number(d.instAmt) || 0;
  const out = Math.max(Number(outstanding) || 0, 0);
  const isTakenRepay = d.direction !== 'given';
  const amt = (presetAmount && presetAmount > 0) ? Math.min(presetAmount, out) : out;
  // NOTE: repayAmount adalah <input type=number> — isi angka mentah (tanpa titik ribuan) supaya tidak diblank browser
  elements.repayAmount.value = amt > 0 ? String(Math.round(amt)) : '';
  elements.repayDate.value = new Date().toISOString().split('T')[0];
  const title = document.getElementById('repayModalTitle');
  if (title) title.textContent = presetLabel || 'Catat Pembayaran';
  // summary: total / sudah dibayar / sisa (+ cicilan info)
  const sumBox = document.getElementById('repaySummary');
  if (sumBox) {
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    const schedLine = tenor > 1
      ? `<div class="repay-row"><span>Tiap bulan</span><strong>${formatCurrency(instAmt)} • ${Math.min(paidCount, tenor)}/${tenor} sudah dibayar</strong></div>`
      : '';
    sumBox.innerHTML = `
      <div class="repay-row"><span>Total uang</span><strong>${formatCurrency(total)}</strong></div>
      <div class="repay-row"><span>Sudah dibayar</span><strong class="green">${formatCurrency(paid)}</strong></div>
      <div class="repay-row"><span>Sisa</span><strong class="red">${formatCurrency(out)}</strong></div>
      ${schedLine}
      <div class="repay-progress"><div class="repay-progress-fill" style="width:${pct}%"></div></div>`;
  }
  // cicilan-count picker (only when meaningful)
  const wrap = document.getElementById('repayCicilanWrap');
  const chipsBox = document.getElementById('repayCicilanChips');
  const hint = document.getElementById('repayCicilanHint');
  if (wrap && chipsBox) {
    const remaining = tenor > 1 ? Math.max(tenor - paidCount, 0) : 0;
    if (remaining > 1) {
      wrap.hidden = false;
      const show = Math.min(remaining, 12);
      let html = '';
      for (let n = 1; n <= show; n++) {
        const a = Math.min(n * instAmt, out);
        html += `<button type="button" class="repay-chip${n === 1 ? ' selected' : ''}" data-n="${n}" data-amount="${a}" title="${n} cicilan = ${formatCurrency(a)}">${n}x • ${formatCurrencyCompact(a)}</button>`;
      }
      if (remaining > show) html += `<span style="font-size:11px;color:#64748b;align-self:center">…${remaining} lagi</span>`;
      html += `<button type="button" class="repay-chip lunasi" data-n="full" data-amount="${out}" title="Bayar semua ${formatCurrency(out)} — lunas">Bayar semua ${formatCurrencyCompact(out)}</button>`;
      chipsBox.innerHTML = html;
      const markSelected = (btn) => {
        chipsBox.querySelectorAll('.repay-chip').forEach(b => b.classList.toggle('selected', b === btn));
      };
      const updateHint = (n, a) => {
        if (hint) {
          if (n === 'full') hint.textContent = `Bayar semua ${formatCurrency(a)} — lunas!`;
          else hint.textContent = `${isTakenRepay ? 'Bayar' : 'Terima'} ${n}x (ke-${paidCount + 1} s/d ${paidCount + Number(n)} dari ${tenor}) = ${formatCurrency(a)}`;
        }
      };
      chipsBox.querySelectorAll('.repay-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const a = Number(btn.dataset.amount) || 0;
          elements.repayAmount.value = a > 0 ? String(Math.round(a)) : '';
          markSelected(btn);
          updateHint(btn.dataset.n, a);
        });
      });
      // default select first chip
      const first = chipsBox.querySelector('.repay-chip');
      if (first) updateHint(first.dataset.n, Number(first.dataset.amount) || 0);
      // typing custom amount clears chip selection
      elements.repayAmount.oninput = () => {
        chipsBox.querySelectorAll('.repay-chip').forEach(b => b.classList.remove('selected'));
        if (hint) {
          const v = parseFormattedNumber(elements.repayAmount.value);
          hint.textContent = v > 0 ? `Nominal manual ${formatCurrency(v)}${v >= out - 0.01 ? ' — akan lunas' : ` — sisa ${formatCurrency(Math.max(out - v, 0))}`}` : '';
        }
      };
    } else {
      wrap.hidden = true;
      chipsBox.innerHTML = '';
      if (hint) hint.textContent = '';
      elements.repayAmount.oninput = null;
    }
  }
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
    description: elements.repayDesc.value.trim(),
    payment: (elements.repayPayment && elements.repayPayment.value) || 'transfer',
    paymentDetail: (elements.repayPaymentDetail && elements.repayPaymentDetail.value.trim()) || ''
  };
}

export function bindLoanActions(onRepay, onDelete, onDeleteRepayment, onInvoice) {
  elements.loanList.addEventListener('click', (e) => {
    const schedBtn = e.target.closest('.schedule-toggle-btn');
    if (schedBtn) {
      const panel = document.getElementById(`sched-${schedBtn.dataset.id}`);
      if (panel) {
        const open = panel.classList.toggle('hidden');
        schedBtn.setAttribute('aria-expanded', String(!open));
        schedBtn.textContent = open ? 'Lihat jadwal ▾' : 'Tutup ▴';
      }
      return;
    }
    const payNext = e.target.closest('.pay-next-btn');
    if (payNext) {
      onRepay(payNext.dataset.id, Number(payNext.dataset.amount) || undefined);
      return;
    }
    const repayBtn = e.target.closest('.repay-loan-btn');
    const deleteBtn = e.target.closest('.delete-loan-btn');
    const deleteRepayBtn = e.target.closest('.delete-repay-btn');
    const invoiceBtn = e.target.closest('.invoice-btn');
    if (repayBtn) onRepay(repayBtn.dataset.id);
    if (deleteBtn) onDelete(deleteBtn.dataset.id);
    if (deleteRepayBtn) onDeleteRepayment(deleteRepayBtn.dataset.repayId);
    if (invoiceBtn && onInvoice) onInvoice(invoiceBtn.dataset.id);
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
  const num = Number(parseIdrInput(value));
  if (!isFinite(num)) return '';
  return num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

// Rupiah Indonesia: titik = ribuan, koma = desimal ("1.234.567,89").
// Juga terima "1234.56". Koma/titik diikuti 1–2 digit di akhir = desimal.
export function parseIdrInput(formatted) {
  let s = String(formatted == null ? '' : formatted).trim();
  if (!s) return '';
  const neg = s.startsWith('-') ? '-' : '';
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return '';
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let int = s, dec = '';
  if (lastComma > lastDot) {
    int = s.slice(0, lastComma);
    dec = s.slice(lastComma + 1);
  } else if (lastDot !== -1) {
    const after = s.slice(lastDot + 1);
    if (/^\d{1,2}$/.test(after)) {
      int = s.slice(0, lastDot);
      dec = after;
    }
  }
  int = int.replace(/[.,]/g, '');
  dec = dec.replace(/[^0-9]/g, '').slice(0, 2);
  if (!int) int = '0';
  return neg + (dec ? int + '.' + dec : int);
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
    const typed = input.value;
    // Sedang ketik desimal ("1.000,5")? Format bagian bulat saja, ekor koma dijaga.
    const dm = typed.match(/^(.*)[,.](\d{0,2})$/);
    let formatted;
    if (dm && /[0-9]/.test(dm[1])) {
      const intFmt = formatIdrInput(parseIdrInput(dm[1]));
      formatted = (intFmt === '' ? '0' : intFmt) + ',' + dm[2];
    } else {
      formatted = formatIdrInput(parseIdrInput(typed));
    }
    input.value = formatted;
    try {
      const diff = formatted.length - typed.length;
      const newPos = Math.max(0, pos + diff);
      input.setSelectionRange(newPos, newPos);
    } catch {}
    if (input.id === 'entryAmount') { updateTxAmountVisual(); updateTxMetaBar(); }
  });
}

export function bindRupiah(el) {
  if (el) applyIdrFormat(el);
}

let idrInitDone = false;
export function initIdrInputs() {
  if (idrInitDone) return;
  idrInitDone = true;
  const ids = ['entryAmount', 'repayAmount', 'entryInstallment', 'stockPrice', 'stockCost', 'entryItemCost', 'empBase', 'empAllowance', 'transferAmount', 'reconActual', 'catBudgetAmount', 'budgetInput', 'equityInput'];
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
          ${p.phone ? `<div class="contact-meta">📱 ${escapeHtml(p.phone)}</div>` : ''}
          <div class="contact-meta">
            ${totalCount} pinjaman${activeCount > 0 ? ` (${activeCount} aktif)` : ''}
            ${totalAmount > 0 ? ` · Total: ${formatCurrency(totalAmount)}` : ''}
          </div>
        </div>
        <div class="contact-actions">
          <button class="btn btn-ghost edit-contact-btn" data-contact-id="${p.id}" data-contact-name="${escapeHtml(p.name)}" data-contact-type="${p.type || 'person'}" data-contact-phone="${escapeHtml(p.phone || '')}" title="Edit">✎</button>
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

/* ===== Stok ===== */
let stockSearchTerm = '';
export function openStock() {
  const m = document.getElementById('stockModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
  if (m) trapFocus(m);
}
export function closeStock() {
  const m = document.getElementById('stockModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function renderStock(items) {
  const list = document.getElementById('stockList');
  if (!list) return;
  const term = stockSearchTerm.trim().toLowerCase();
  const rows = term ? items.filter(i => (i.name || '').toLowerCase().includes(term) || (i.sku || '').toLowerCase().includes(term)) : items;
  const low = items.filter(i => i.stock <= (i.minStock || 0) && (i.minStock || 0) > 0);
  const alertBox = document.getElementById('stockAlert');
  if (alertBox) alertBox.innerHTML = low.length ? `<div style="font-size:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:8px 10px;margin-bottom:10px">⚠️ Stok menipis: ${low.map(i => escapeHtml(i.name)).join(', ')}</div>` : '';
  if (!rows.length) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px;">Belum ada barang. Tambah di form atas.</p>';
    return;
  }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  list.innerHTML = rows.map(i => {
    const isLow = (i.minStock || 0) > 0 && i.stock <= i.minStock;
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:6px">
      <span style="font-size:18px">${isLow ? '⚠️' : '📦'}</span>
      <span style="flex:1;min-width:0"><b>${escapeHtml(i.name)}</b>${i.sku ? ` <small style="color:#94a3b8">${escapeHtml(i.sku)}</small>` : ''}<br>
      <small style="color:#64748b">Stok ${i.stock} • Jual ${fmt(i.price)} • Modal ${fmt(i.cost)} • Nilai ${fmt(i.stock * i.cost)}</small></span>
      <button class="btn btn-ghost stock-edit" data-id="${i.id}" style="font-size:11px;padding:2px 8px">✎</button>
      <button class="btn btn-ghost stock-del" data-id="${i.id}" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
    </div>`;
  }).join('');
}
export function getStockFormData() {
  const num = (id) => parseIdrInput(document.getElementById(id)?.value || '');
  return {
    id: document.getElementById('stockFormId')?.value || null,
    name: document.getElementById('stockName')?.value.trim() || '',
    sku: document.getElementById('stockSku')?.value.trim() || '',
    price: Number(num('stockPrice')) || 0,
    cost: Number(num('stockCost')) || 0,
    stock: Math.max(parseInt(document.getElementById('stockQty')?.value || '0', 10) || 0, 0),
    minStock: Math.max(parseInt(document.getElementById('stockMin')?.value || '0', 10) || 0, 0)
  };
}
export function fillStockForm(item) {
  document.getElementById('stockFormId').value = item?.id || '';
  document.getElementById('stockName').value = item?.name || '';
  document.getElementById('stockSku').value = item?.sku || '';
  document.getElementById('stockPrice').value = item?.price || '';
  document.getElementById('stockCost').value = item?.cost || '';
  document.getElementById('stockQty').value = item?.stock ?? '';
  document.getElementById('stockMin').value = item?.minStock ?? '';
  document.getElementById('stockName')?.focus();
}
export function resetStockForm() {
  document.getElementById('stockForm')?.reset();
  document.getElementById('stockFormId').value = '';
}
export function bindStock(onSave, onEdit, onDelete) {
  document.getElementById('closeStockBtn')?.addEventListener('click', closeStock);
  document.getElementById('stockModal')?.addEventListener('click', (e) => { if (e.target.id === 'stockModal') closeStock(); });
  document.getElementById('stockForm')?.addEventListener('submit', (e) => { e.preventDefault(); onSave(); });
  document.getElementById('stockFormReset')?.addEventListener('click', resetStockForm);
  document.getElementById('stockSearch')?.addEventListener('input', (e) => {
    stockSearchTerm = e.target.value;
    document.dispatchEvent(new CustomEvent('wynara:stock-search'));
  });
  document.getElementById('stockList')?.addEventListener('click', (e) => {
    const ed = e.target.closest('.stock-edit');
    const del = e.target.closest('.stock-del');
    if (ed) onEdit(ed.dataset.id);
    if (del) onDelete(del.dataset.id);
  });
}

/* ===== Gaji ===== */
export function openPayroll() {
  const m = document.getElementById('payrollModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
  if (m) trapFocus(m);
}
export function closePayroll() {
  const m = document.getElementById('payrollModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function renderEmployees(emps, paidMap) {
  const list = document.getElementById('employeeList');
  if (!list) return;
  if (!emps.length) {
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px;">Belum ada karyawan.</p>';
    return;
  }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const grossOf = (e) => Math.round(Number(e.baseSalary ?? e.salary) || 0) + Math.round(Number(e.allowance) || 0);
  list.innerHTML = emps.map(e => {
    const paid = paidMap && paidMap[e.id];
    const gross = grossOf(e);
    const who = e.gender === 'P' ? '👩' : e.gender === 'L' ? '👨' : (e.active === false ? '😴' : '👤');
    const extra = [e.role, e.contract !== 'tetap' ? e.contract : '', e.startDate ? `sejak ${e.startDate.slice(0, 7)}` : '', e.phone].filter(Boolean).map(escapeHtml).join(' • ');
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:6px">
      <span style="font-size:18px">${who}</span>
      <span style="flex:1"><b>${escapeHtml(e.name)}</b>${extra ? `<br><small style="color:#64748b">${extra}</small>` : ''}<br>
      <small style="color:#64748b">${fmt(gross)}/bln (pokok ${fmt(e.baseSalary ?? e.salary)}${Number(e.allowance) > 0 ? ` + tunj ${fmt(e.allowance)}` : ''}) ${paid ? '• ✅ bulan ini sudah' : ''}${e.bpjsKes === false || e.bpjsTk === false ? ' • BPJS off' : ''}</small></span>
      <button class="btn btn-ghost emp-slip" data-id="${e.id}" style="font-size:11px;padding:2px 8px" title="Slip gaji">🧾</button>
      <button class="btn btn-ghost emp-edit" data-id="${e.id}" style="font-size:11px;padding:2px 8px">✎</button>
      <button class="btn btn-ghost emp-del" data-id="${e.id}" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
    </div>`;
  }).join('');
}
export function renderPayrollSummary(total, count, monthLabel) {
  const box = document.getElementById('payrollSummary');
  if (!box) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  box.innerHTML = `<div style="font-size:13px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px">
    💼 <b>${count} karyawan aktif</b> • Total gaji <b>${fmt(total)}/bln</b> • Periode <b>${monthLabel}</b><br>
    <small style="color:#64748b">Tombol “Proses” membuat 1 transaksi gaji per karyawan (lunas, masuk laporan).</small></div>`;
}
/* Tabel proses gaji: centang + lembur + THR + PPh per baris, THP live */
export function renderPayrollRun(emps, paidMap, monthKey) {
  const box = document.getElementById('payrollRun');
  if (!box) return;
  const active = (emps || []).filter(e => e.active !== false && (Number(e.baseSalary ?? e.salary) || 0) > 0);
  if (!active.length) { box.innerHTML = ''; return; }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  box.innerHTML = `<div style="font-size:12px;font-weight:700;margin-bottom:6px">Proses gaji — centang, isi lembur bila ada:</div>` + active.map(e => {
    const done = paidMap && paidMap[e.id];
    const thrAuto = thrAmount(e, new Date());
    return `<div class="run-row" data-id="${e.id}" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px;margin-bottom:6px;${done ? 'opacity:0.6' : ''}">
      <input type="checkbox" class="run-check" ${done ? '' : 'checked'} ${done ? 'disabled' : ''} aria-label="Proses ${escapeHtml(e.name)}">
      <span style="flex:1;min-width:100px"><b>${escapeHtml(e.name)}</b><br><small style="color:#64748b">Pokok ${fmt(e.baseSalary ?? e.salary)}${Number(e.allowance) > 0 ? ` + tunj ${fmt(e.allowance)}` : ''}</small></span>
      <label style="font-size:11px">Lembur<br><input type="text" class="run-lembur" placeholder="Rp" inputmode="decimal" ${done ? 'disabled' : ''} style="width:90px;height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px"></label>
      <label class="login-check" style="font-size:11px" title="${thrAuto > 0 ? `Otomatis ${fmt(thrAuto)} sesuai masa kerja` : 'Masa kerja < 1 bulan — belum dapat THR'}"><input type="checkbox" class="run-thr" ${done ? 'disabled' : ''}> THR${thrAuto > 0 ? ` ${fmt(thrAuto)}` : ''}</label>
      <label class="login-check" style="font-size:11px" title="PPh 21 TER bulanan"><input type="checkbox" class="run-pph" checked ${done ? 'disabled' : ''}> PPh</label>
      <span class="run-thp" style="font-weight:700;min-width:90px;text-align:right">${done ? '✅ sudah' : ''}</span>
    </div>`;
  }).join('');
  const recalc = () => {
    box.querySelectorAll('.run-row').forEach(row => {
      const emp = active.find(x => x.id === row.dataset.id);
      if (!emp) return;
      const out = row.querySelector('.run-thp');
      if (row.querySelector('.run-check')?.disabled) return;
      const lembur = Number(parseIdrInput(row.querySelector('.run-lembur')?.value || '')) || 0;
      const thr = row.querySelector('.run-thr')?.checked ? thrAmount(emp, new Date()) : 0;
      const pph = !!row.querySelector('.run-pph')?.checked;
      const s = computeSlip(emp, { overtime: lembur, thr, pph });
      if (out) out.textContent = 'THP ' + fmt(s.takeHome);
      const li = row.querySelector('.run-lembur');
      if (li && document.activeElement !== li) { /* jangan ganggu saat ketik */ }
    });
  };
  box.querySelectorAll('.run-lembur').forEach(el => {
    el.addEventListener('input', recalc);
    bindRupiah(el);
  });
  box.querySelectorAll('.run-thr,.run-pph,.run-check').forEach(el => el.addEventListener('change', recalc));
  recalc();
}

export function getPayrollRun() {
  const box = document.getElementById('payrollRun');
  if (!box) return [];
  const out = [];
  box.querySelectorAll('.run-row').forEach(row => {
    const check = row.querySelector('.run-check');
    if (!check || !check.checked || check.disabled) return;
    out.push({
      id: row.dataset.id,
      overtime: Number(parseIdrInput(row.querySelector('.run-lembur')?.value || '')) || 0,
      withThr: !!row.querySelector('.run-thr')?.checked,
      withPph: !!row.querySelector('.run-pph')?.checked
    });
  });
  return out;
}

export function getEmpFormData() {
  return {
    id: document.getElementById('empFormId')?.value || null,
    name: document.getElementById('empName')?.value.trim() || '',
    role: document.getElementById('empRole')?.value.trim() || '',
    baseSalary: Number(parseIdrInput(document.getElementById('empBase')?.value || '')) || 0,
    allowance: Number(parseIdrInput(document.getElementById('empAllowance')?.value || '')) || 0,
    gender: document.getElementById('empGender')?.value || '',
    birthDate: document.getElementById('empBirth')?.value || '',
    phone: (document.getElementById('empPhone')?.value || '').trim(),
    address: document.getElementById('empAddress')?.value.trim() || '',
    startDate: document.getElementById('empStart')?.value || '',
    contract: document.getElementById('empContract')?.value || 'tetap',
    ptkp: document.getElementById('empPtkp')?.value || 'TK/0',
    bpjsKes: document.getElementById('empBpjsKes')?.checked !== false,
    bpjsTk: document.getElementById('empBpjsTk')?.checked !== false
  };
}
export function fillEmpForm(e) {
  document.getElementById('empFormId').value = e?.id || '';
  document.getElementById('empName').value = e?.name || '';
  document.getElementById('empRole').value = e?.role || '';
  document.getElementById('empBase').value = e?.baseSalary ?? e?.salary ?? '';
  document.getElementById('empAllowance').value = e?.allowance ?? '';
  document.getElementById('empGender').value = e?.gender || '';
  document.getElementById('empBirth').value = e?.birthDate || '';
  document.getElementById('empPhone').value = e?.phone || '';
  document.getElementById('empAddress').value = e?.address || '';
  document.getElementById('empStart').value = e?.startDate || '';
  document.getElementById('empContract').value = e?.contract || 'tetap';
  document.getElementById('empPtkp').value = e?.ptkp || 'TK/0';
  document.getElementById('empBpjsKes').checked = e?.bpjsKes !== false;
  document.getElementById('empBpjsTk').checked = e?.bpjsTk !== false;
}
export function resetEmpForm() {
  document.getElementById('employeeForm')?.reset();
  document.getElementById('empFormId').value = '';
}
export function bindPayroll(onSave, onEdit, onDelete, onSlip, onRun) {
  document.getElementById('closePayrollBtn')?.addEventListener('click', closePayroll);
  document.getElementById('payrollModal')?.addEventListener('click', (e) => { if (e.target.id === 'payrollModal') closePayroll(); });
  document.getElementById('employeeForm')?.addEventListener('submit', (e) => { e.preventDefault(); onSave(); });
  document.getElementById('empFormReset')?.addEventListener('click', resetEmpForm);
  document.getElementById('payrollRunBtn')?.addEventListener('click', onRun);
  document.getElementById('employeeList')?.addEventListener('click', (e) => {
    const ed = e.target.closest('.emp-edit');
    const del = e.target.closest('.emp-del');
    const slip = e.target.closest('.emp-slip');
    if (ed) onEdit(ed.dataset.id);
    if (del) onDelete(del.dataset.id);
    if (slip) onSlip(slip.dataset.id);
  });
}

/* ===== Kas & transfer ===== */
export function openKas() {
  const m = document.getElementById('kasModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
  if (m) trapFocus(m);
}
export function closeKas() {
  const m = document.getElementById('kasModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function renderKas(rows) {
  const box = document.getElementById('kasList');
  if (!box) return;
  const fmt = (v) => (v < 0 ? '−Rp' : 'Rp') + Math.abs(Math.round(v)).toLocaleString('id-ID');
  const fill = (sel, opts, label) => {
    const el = document.getElementById(sel);
    if (!el) return;
    el.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  };
  box.innerHTML = rows.map(r => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
    <span style="font-size:18px">${r.icon}</span>
    <span style="flex:1"><b>${r.label}</b><br><small style="color:#64748b">${r.code}</small></span>
    <span style="font-weight:800">${fmt(r.balance)}</span>
  </div>`).join('') || '<p style="color:#94a3b8;font-size:12px">Belum ada saldo.</p>';
  const opts = rows.map(r => ({ value: r.payment, label: `${r.icon} ${r.label} (${fmt(r.balance)})` }))
    .sort((a, b) => (a.value === 'transfer' ? -1 : 0) - (b.value === 'transfer' ? -1 : 0));
  fill('transferFrom', opts);
  fill('transferTo', opts);
  fill('reconAccount', opts);
  fill('bankAccount', opts);
  const toEl = document.getElementById('transferTo');
  if (toEl && toEl.options.length > 1 && toEl.selectedIndex === 0) toEl.selectedIndex = 1;
}
export function getTransferFormData() {
  return {
    from: document.getElementById('transferFrom')?.value || 'cash',
    to: document.getElementById('transferTo')?.value || 'transfer',
    amount: Number(parseIdrInput(document.getElementById('transferAmount')?.value || '')) || 0,
    date: document.getElementById('transferDate')?.value || new Date().toISOString().split('T')[0]
  };
}
export function getReconFormData() {
  return {
    payment: document.getElementById('reconAccount')?.value || 'cash',
    actual: Number(parseIdrInput(document.getElementById('reconActual')?.value || '')) || 0
  };
}
export function bindKas(onTransfer, onRecon) {
  document.getElementById('closeKasBtn')?.addEventListener('click', closeKas);
  document.getElementById('kasModal')?.addEventListener('click', (e) => { if (e.target.id === 'kasModal') closeKas(); });
  document.getElementById('transferForm')?.addEventListener('submit', (e) => { e.preventDefault(); onTransfer(); });
  document.getElementById('reconForm')?.addEventListener('submit', (e) => { e.preventDefault(); onRecon(); });
  const td = document.getElementById('transferDate');
  if (td && !td.value) td.value = new Date().toISOString().split('T')[0];
}

/* ===== Import mutasi bank ===== */
let bankRows = [];
export function openBank() {
  const m = document.getElementById('bankModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
  if (m) trapFocus(m);
}
export function closeBank() {
  const m = document.getElementById('bankModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function setBankRows(rows) {
  bankRows = Array.isArray(rows) ? rows : [];
  renderBankPreview();
}
export function getBankSelected() {
  return bankRows.filter(r => r.selected && !r.matched);
}
export function bindBank(onFile, onImport) {
  document.getElementById('closeBankBtn')?.addEventListener('click', closeBank);
  document.getElementById('bankModal')?.addEventListener('click', (e) => { if (e.target.id === 'bankModal') closeBank(); });
  document.getElementById('bankPickBtn')?.addEventListener('click', () => document.getElementById('bankFile')?.click());
  document.getElementById('bankFile')?.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) onFile(f);
    e.target.value = '';
  });
  document.getElementById('bankImportBtn')?.addEventListener('click', onImport);
  document.getElementById('bankPreview')?.addEventListener('click', (e) => {
    const cb = e.target.closest('.bank-pick');
    if (!cb) return;
    const row = bankRows.find(r => r.key === cb.dataset.key);
    if (row && !row.matched) {
      row.selected = !row.selected;
      renderBankPreview();
    }
  });
}
function renderBankPreview() {
  const box = document.getElementById('bankPreview');
  const btn = document.getElementById('bankImportBtn');
  const cnt = document.getElementById('bankCount');
  if (!box) return;
  const sel = bankRows.filter(r => r.selected && !r.matched).length;
  if (btn) btn.disabled = sel === 0;
  if (cnt) cnt.textContent = String(sel);
  if (!bankRows.length) {
    box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Belum ada file. Pilih CSV mutasi dari bank.</p>';
    return;
  }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  box.innerHTML = `<table class="report-table"><thead><tr><th></th><th>Tanggal</th><th>Keterangan</th><th class="amount-col">Masuk</th><th class="amount-col">Keluar</th><th>Status</th></tr></thead><tbody>` +
    bankRows.map(r => `<tr style="${r.matched ? 'opacity:0.55' : ''}">
      <td>${r.matched ? '' : `<input type="checkbox" class="bank-pick" data-key="${r.key}" ${r.selected ? 'checked' : ''}>`}</td>
      <td style="white-space:nowrap;font-size:12px">${escapeHtml(r.date)}</td>
      <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.desc)}">${escapeHtml(r.desc)}</td>
      <td class="amount-col" style="color:#059669">${r.in > 0 ? fmt(r.in) : ''}</td>
      <td class="amount-col" style="color:#dc2626">${r.out > 0 ? fmt(r.out) : ''}</td>
      <td style="font-size:11px">${r.matched ? '✅ cocok' : 'baru'}</td>
    </tr>`).join('') + `</tbody></table>`;
}

/* ===== COA ===== */
export function openCoa() {
  const m = document.getElementById('coaModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
  if (m) trapFocus(m);
}
export function closeCoa() {
  const m = document.getElementById('coaModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function renderCoa(accounts, bal) {
  const list = document.getElementById('coaList');
  if (!list) return;
  const fmt = (v) => (v < 0 ? '−Rp' : 'Rp') + Math.abs(Math.round(v)).toLocaleString('id-ID');
  const typeName = { asset: 'Aset', liability: 'Kewajiban', equity: 'Modal', revenue: 'Pendapatan', expense: 'Beban' };
  let lastType = '';
  list.innerHTML = accounts.map(a => {
    const b = (bal && bal[a.code]) || { debit: 0, credit: 0 };
    const net = a.type === 'asset' || a.type === 'expense' ? b.debit - b.credit : b.credit - b.debit;
    const head = a.type !== lastType ? `<div style="font-size:11px;font-weight:800;color:#64748b;margin:10px 0 4px">${typeName[a.type] || a.type}</div>` : '';
    lastType = a.type;
    const used = net !== 0;
    return `${head}<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:6px">
      <span style="font-family:monospace;color:#64748b">${escapeHtml(a.code)}</span>
      <span style="flex:1"><b>${escapeHtml(a.name)}</b>${a.category ? ` <small style="color:#64748b">↔ ${escapeHtml(a.category)}</small>` : ''}<br>
      <small style="color:#64748b">Saldo ${fmt(net)}</small></span>
      ${a.custom
        ? `<button class="btn btn-ghost coa-rename" data-code="${escapeHtml(a.code)}" style="font-size:11px;padding:2px 8px">✎</button>
           <button class="btn btn-ghost coa-del" data-code="${escapeHtml(a.code)}" ${used ? 'disabled title="Sudah ada mutasi"' : ''} style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>`
        : `<small style="color:#94a3b8">bawaan</small>`}
    </div>`;
  }).join('');
}
export function getCoaFormData() {
  return {
    code: document.getElementById('coaCode')?.value.trim() || '',
    name: document.getElementById('coaName')?.value.trim() || '',
    type: document.getElementById('coaType')?.value || 'expense',
    category: document.getElementById('coaCategory')?.value.trim() || ''
  };
}
export function resetCoaForm() {
  document.getElementById('coaForm')?.reset();
}
export function bindCoa(onSave, onRename, onDelete) {
  document.getElementById('closeCoaBtn')?.addEventListener('click', closeCoa);
  document.getElementById('coaModal')?.addEventListener('click', (e) => { if (e.target.id === 'coaModal') closeCoa(); });
  document.getElementById('coaForm')?.addEventListener('submit', (e) => { e.preventDefault(); onSave(); });
  document.getElementById('coaList')?.addEventListener('click', (e) => {
    const rn = e.target.closest('.coa-rename');
    const del = e.target.closest('.coa-del');
    if (rn && !rn.disabled) {
      const cur = rn.closest('div').querySelector('b')?.textContent || '';
      const name = prompt('Nama baru:', cur);
      if (name !== null) onRename(rn.dataset.code, name);
    }
    if (del && !del.disabled) onDelete(del.dataset.code);
  });
}

/* ===== Penjualan dari stok ===== */
export function openSale() {
  const m = document.getElementById('saleModal');
  if (!m) return;
  document.getElementById('saleCustomer').value = '';
  document.getElementById('saleDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('saleNote').value = '';
  document.getElementById('salePPN').checked = false;
  document.getElementById('saleRows').innerHTML = '';
  addSaleRow();
  addSaleRow();
  recalcSale();
  if (!m.open) { try { m.showModal(); } catch {} }
  trapFocus(m);
}
export function closeSale() {
  const m = document.getElementById('saleModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function addSaleRow() {
  const box = document.getElementById('saleRows');
  if (!box) return;
  const items = getItemList();
  const row = document.createElement('div');
  row.className = 'sale-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
  row.innerHTML = `
    <select class="sale-item" style="flex:2;min-width:130px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
      <option value="">— Pilih barang —</option>
      ${items.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (stok ${i.stock})</option>`).join('')}
    </select>
    <input type="number" class="sale-qty" min="1" step="1" value="1" title="Berapa pcs?" style="flex:0 0 64px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
    <input type="text" class="sale-price" placeholder="Rp/pcs" inputmode="decimal" title="Harga per pcs (boleh ubah)" style="flex:1;min-width:100px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
    <span class="sale-sub" style="flex:1;min-width:80px;font-size:12px;font-weight:700;text-align:right"></span>
    <button type="button" class="btn btn-ghost sale-del" style="font-size:12px;padding:4px 8px;color:#ef4444">✕</button>`;
  const sel = row.querySelector('.sale-item');
  const qty = row.querySelector('.sale-qty');
  const price = row.querySelector('.sale-price');
  const syncPrice = () => {
    const it = items.find(x => x.id === sel.value);
    if (it && !price.dataset.touched) price.value = it.price ? String(it.price) : '';
    recalcSale();
  };
  sel.addEventListener('change', () => { price.dataset.touched = ''; syncPrice(); });
  price.addEventListener('input', () => { price.dataset.touched = '1'; });
  price.addEventListener('focus', () => { price.value = parseIdrInput(price.value); try { price.select(); } catch {} });
  price.addEventListener('blur', () => { const v = parseIdrInput(price.value); price.value = v ? formatIdrInput(v) : ''; recalcSale(); });
  [qty, price].forEach(el => el.addEventListener('input', recalcSale));
  row.querySelector('.sale-del').addEventListener('click', () => { row.remove(); recalcSale(); });
  box.appendChild(row);
  bindRupiah(price);
  syncPrice();
}
export function recalcSale() {
  const data = readSaleRows();
  const el = document.getElementById('saleTotal');
  if (el) el.textContent = 'Total ' + formatCurrency(data.total);
  document.querySelectorAll('#saleRows .sale-row').forEach((row, i) => {
    const sub = row.querySelector('.sale-sub');
    if (sub) sub.textContent = data.lines[i] ? formatCurrency(data.lines[i].qty * data.lines[i].price) : '';
  });
}
function readSaleRows() {
  const lines = [];
  document.querySelectorAll('#saleRows .sale-row').forEach(row => {
    const itemId = row.querySelector('.sale-item')?.value || '';
    const qty = Math.max(parseInt(row.querySelector('.sale-qty')?.value || '0', 10) || 0, 0);
    const price = Math.round(Number(parseIdrInput(row.querySelector('.sale-price')?.value || '')) || 0);
    if (itemId && qty > 0 && price > 0) {
      const it = getItemList().find(x => x.id === itemId);
      lines.push({ itemId, qty, price, name: it ? it.name : '' });
    }
  });
  return { lines, total: lines.reduce((s, l) => s + l.qty * l.price, 0) };
}
export function getSaleData() {
  const { lines, total } = readSaleRows();
  return {
    customer: document.getElementById('saleCustomer')?.value.trim() || '',
    date: document.getElementById('saleDate')?.value || new Date().toISOString().split('T')[0],
    payment: document.getElementById('salePayment')?.value || 'transfer',
    note: document.getElementById('saleNote')?.value.trim() || '',
    ppn: !!document.getElementById('salePPN')?.checked,
    lines, total
  };
}
export function bindSale(onSave) {
  document.getElementById('closeSaleBtn')?.addEventListener('click', closeSale);
  document.getElementById('saleCancel')?.addEventListener('click', closeSale);
  document.getElementById('saleModal')?.addEventListener('click', (e) => { if (e.target.id === 'saleModal') closeSale(); });
  document.getElementById('saleAddRow')?.addEventListener('click', () => { addSaleRow(); });
  document.getElementById('saleSave')?.addEventListener('click', onSave);
}

/* ===== Beli ke supplier ===== */
export function openBuy() {
  const m = document.getElementById('buyModal');
  if (!m) return;
  document.getElementById('buySupplier').value = '';
  document.getElementById('buyDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('buyDue').value = '';
  document.getElementById('buyNote').value = '';
  document.getElementById('buyRows').innerHTML = '';
  addBuyRow();
  addBuyRow();
  recalcBuy();
  if (!m.open) { try { m.showModal(); } catch {} }
  trapFocus(m);
}
export function closeBuy() {
  const m = document.getElementById('buyModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function addBuyRow() {
  const box = document.getElementById('buyRows');
  if (!box) return;
  const items = getItemList();
  const row = document.createElement('div');
  row.className = 'buy-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap';
  row.innerHTML = `
    <select class="buy-item" style="flex:2;min-width:130px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
      <option value="">— Pilih barang —</option>
      ${items.map(i => `<option value="${i.id}">${escapeHtml(i.name)} (modal ${formatCurrency(i.cost)})</option>`).join('')}
    </select>
    <input type="number" class="buy-qty" min="1" step="1" value="1" title="Berapa pcs?" style="flex:0 0 64px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
    <input type="text" class="buy-cost" placeholder="Rp modal/pcs" inputmode="decimal" title="Harga modal per pcs" style="flex:1;min-width:110px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
    <span class="buy-sub" style="flex:1;min-width:80px;font-size:12px;font-weight:700;text-align:right"></span>
    <button type="button" class="btn btn-ghost buy-del" style="font-size:12px;padding:4px 8px;color:#ef4444">✕</button>`;
  const sel = row.querySelector('.buy-item');
  const cost = row.querySelector('.buy-cost');
  sel.addEventListener('change', () => {
    const it = items.find(x => x.id === sel.value);
    if (it && !cost.dataset.touched) cost.value = it.cost ? String(it.cost) : '';
    recalcBuy();
  });
  cost.addEventListener('input', () => { cost.dataset.touched = '1'; });
  cost.addEventListener('blur', () => { const v = parseIdrInput(cost.value); cost.value = v ? formatIdrInput(v) : ''; recalcBuy(); });
  row.querySelector('.buy-qty').addEventListener('input', recalcBuy);
  row.querySelector('.buy-del').addEventListener('click', () => { row.remove(); recalcBuy(); });
  box.appendChild(row);
  bindRupiah(cost);
  recalcBuy();
}
export function recalcBuy() {
  const data = readBuyRows();
  const el = document.getElementById('buyTotal');
  if (el) el.textContent = 'Total ' + formatCurrency(data.total) + ' • jadi hutang usaha';
  document.querySelectorAll('#buyRows .buy-row').forEach((row, i) => {
    const sub = row.querySelector('.buy-sub');
    if (sub) sub.textContent = data.lines[i] ? formatCurrency(data.lines[i].qty * data.lines[i].unitCost) : '';
  });
}
function readBuyRows() {
  const lines = [];
  document.querySelectorAll('#buyRows .buy-row').forEach(row => {
    const itemId = row.querySelector('.buy-item')?.value || '';
    const qty = Math.max(parseInt(row.querySelector('.buy-qty')?.value || '0', 10) || 0, 0);
    const unitCost = Math.round(Number(parseIdrInput(row.querySelector('.buy-cost')?.value || '')) || 0);
    if (itemId && qty > 0 && unitCost > 0) {
      const it = getItemList().find(x => x.id === itemId);
      lines.push({ itemId, qty, unitCost, name: it ? it.name : '' });
    }
  });
  return { lines, total: lines.reduce((s, l) => s + l.qty * l.unitCost, 0) };
}
export function getBuyData() {
  const { lines, total } = readBuyRows();
  return {
    supplier: document.getElementById('buySupplier')?.value.trim() || '',
    date: document.getElementById('buyDate')?.value || new Date().toISOString().split('T')[0],
    dueDate: document.getElementById('buyDue')?.value || '',
    note: document.getElementById('buyNote')?.value.trim() || '',
    lines, total
  };
}
export function bindBuy(onSave) {
  document.getElementById('closeBuyBtn')?.addEventListener('click', closeBuy);
  document.getElementById('buyCancel')?.addEventListener('click', closeBuy);
  document.getElementById('buyModal')?.addEventListener('click', (e) => { if (e.target.id === 'buyModal') closeBuy(); });
  document.getElementById('buyAddRow')?.addEventListener('click', () => { addBuyRow(); });
  document.getElementById('buySave')?.addEventListener('click', onSave);
  document.getElementById('buyOpenBtn')?.addEventListener('click', openBuy);
}
export function renderSuppliers(purchases) {
  const box = document.getElementById('supplierList');
  if (!box) return;
  if (!purchases.length) {
    box.innerHTML = '<p style="color:#94a3b8;font-size:12px">Belum ada hutang supplier. Klik ＋ Beli.</p>';
    return;
  }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  box.innerHTML = purchases.map(p => {
    const paid = (p.payments || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const out = Math.max((Number(p.totalCost) || 0) - paid, 0);
    const isPaid = p.status === 'paid' || out <= 0.01;
    let dueTxt = '';
    if (!isPaid && p.dueDate) {
      const dd = Math.ceil((new Date(p.dueDate + 'T00:00:00') - today) / 86400000);
      dueTxt = dd < 0 ? ` • <b style="color:#dc2626">Telat ${Math.abs(dd)} hari</b>` : ` • jatuh tempo ${p.dueDate.slice(8, 10)}/${p.dueDate.slice(5, 7)}`;
    }
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:6px;${isPaid ? 'opacity:0.65' : ''}">
      <span style="font-size:18px">${isPaid ? '✅' : '📥'}</span>
      <span style="flex:1"><b>${escapeHtml(p.supplier)}</b> <small style="color:#94a3b8">${escapeHtml(p.date || '')}</small><br>
      <small style="color:#64748b">${(p.lines || []).map(l => `${l.qty}× ${escapeHtml(l.name || '')}`).join(', ')} • Total ${fmt(p.totalCost)} • Sudah ${fmt(paid)} • <b>Sisa ${fmt(out)}</b>${dueTxt}</small></span>
      ${!isPaid ? `<button class="btn btn-ghost sup-pay" data-id="${p.id}" style="font-size:11px;padding:4px 10px">💰 Bayar</button>` : ''}
      ${(p.payments || []).length === 0 ? `<button class="btn btn-ghost sup-del" data-id="${p.id}" style="font-size:11px;padding:4px 8px;color:#ef4444">✕</button>` : ''}
    </div>`;
  }).join('');
}
export function bindSupplierList(onPay, onDelete) {
  document.getElementById('supplierList')?.addEventListener('click', (e) => {
    const pay = e.target.closest('.sup-pay');
    const del = e.target.closest('.sup-del');
    if (pay) onPay(pay.dataset.id);
    if (del) onDelete(del.dataset.id);
  });
}
/* Bayar supplier */
let supplierPayId = null;
export function openSupplierPay(purchase) {
  supplierPayId = purchase ? purchase.id : null;
  const m = document.getElementById('supplierPayModal');
  if (!m || !purchase) return;
  const paid = (purchase.payments || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const out = Math.max((Number(purchase.totalCost) || 0) - paid, 0);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  document.getElementById('supplierPayTitle').textContent = `Bayar — ${purchase.supplier}`;
  document.getElementById('supplierPaySummary').innerHTML = `Total ${fmt(purchase.totalCost)} • Sudah ${fmt(paid)} • <b>Sisa ${fmt(out)}</b>`;
  document.getElementById('supplierPayAmount').value = out > 0 ? String(Math.round(out)) : '';
  document.getElementById('supplierPayDate').value = new Date().toISOString().split('T')[0];
  if (!m.open) { try { m.showModal(); } catch {} }
  trapFocus(m);
}
export function closeSupplierPay() {
  const m = document.getElementById('supplierPayModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function getSupplierPayData() {
  return {
    id: supplierPayId,
    amount: Number(document.getElementById('supplierPayAmount')?.value || 0) || 0,
    payment: document.getElementById('supplierPayPayment')?.value || 'transfer',
    date: document.getElementById('supplierPayDate')?.value || ''
  };
}
export function bindSupplierPay(onSubmit) {
  document.getElementById('supplierPayClose')?.addEventListener('click', closeSupplierPay);
  document.getElementById('supplierPayCancel')?.addEventListener('click', closeSupplierPay);
  document.getElementById('supplierPayModal')?.addEventListener('click', (e) => { if (e.target.id === 'supplierPayModal') closeSupplierPay(); });
  document.getElementById('supplierPayForm')?.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(); });
}

export function bindContactsActions(onDelete, onEdit) {
  document.getElementById('contactsList').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-contact-btn');
    const editBtn = e.target.closest('.edit-contact-btn');
    if (deleteBtn) onDelete(deleteBtn.dataset.contactId, deleteBtn.dataset.contactName);
    if (editBtn) onEdit(editBtn.dataset.contactId, editBtn.dataset.contactName, editBtn.dataset.contactType, editBtn.dataset.contactPhone);
  });
}

export function openContactForm(contactId, name, type, phone) {
  const modal = document.getElementById('contactFormModal');
  document.getElementById('contactFormTitle').textContent = contactId ? 'Edit Kontak' : 'Tambah Kontak';
  document.getElementById('contactFormId').value = contactId || '';
  document.getElementById('contactFormName').value = name || '';
  document.getElementById('contactFormPhone').value = phone || '';
  document.getElementById('contactFormType').value = type || 'person';
  setSelected(document.getElementById('contactTypeFormGroup'), type || 'person');
  if (!modal.open) modal.showModal();
  document.getElementById('contactFormName').focus();
}

export function closeContactForm() {
  const m = document.getElementById('contactFormModal');
  if (m && m.open) { try { m.close(); } catch {} }
  document.getElementById('contactForm')?.reset();
  document.getElementById('contactFormPhone').value = '';
  const idEl = document.getElementById('contactFormId');
  const typeEl = document.getElementById('contactFormType');
  if (idEl) idEl.value = '';
  if (typeEl) typeEl.value = 'person';
}

export function getContactFormData() {
  return {
    id: document.getElementById('contactFormId').value || null,
    name: document.getElementById('contactFormName').value.trim(),
    phone: document.getElementById('contactFormPhone').value.trim(),
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
  openLoanEntryFor('Piutang', 'new');
}

export function openLoanEntryFor(category, mode) {
  openModal();
  const isHutang = category === 'Hutang';
  const type = isHutang ? 'income' : 'expense';
  elements.entryType.value = type;
  setSelected(elements.typeGroup, type);
  const bg = document.getElementById('txSegmentBg');
  if (bg) bg.className = 'tx-segment-bg ' + (type === 'income' ? 'tx-segment-income' : 'tx-segment-expense');
  renderCategoryButtons(type);
  if (elements.entryLoanMode) elements.entryLoanMode.value = mode || 'new';
  setLoanModeUI(mode || 'new');
  selectCategory(category);
  updateTxMetaBar();
  elements.entryDate.focus();
}