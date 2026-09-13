import { formatCurrency, formatDate, formatMonth, formatCurrencyCompact, getCategoryLabel, getCategoryIcon, CATEGORY_OPTIONS, getPaymentLabel, getPaymentIcon } from './reports.js';
import { calcTenor, paidOf, outstandingOf, nextInstallmentAmount, scheduleData, nextDue, interestRateOf, interestAmount, totalOwed } from './loanmath.js';
import { accountLabel } from './coa.js';
import { computeSlip, thrAmount, DEFAULT_RATES, RATE_LIMITS } from './payroll.js';
import { getPpn } from './storage.js';

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

// Preset chips (bunga / tenor / jatuh tempo) — bikin input gampang, tanpa ngetik bebas.
function chipGroupById(id) { return document.getElementById(id); }
function setChipActive(group, active) {
  if (!group) return;
  group.querySelectorAll('.chip').forEach(b => {
    const on = b === active;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function revealCustom(wrap, on) { if (wrap) wrap.hidden = !on; }
function addDaysStr(baseStr, days) {
  const d = new Date(baseStr || new Date().toISOString().split('T')[0]);
  if (isNaN(d)) return new Date().toISOString().split('T')[0];
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().split('T')[0];
}
function selectBungaPreset(value) {
  const group = chipGroupById('loanBungaChips');
  const el = document.getElementById('entryInterestRate');
  if (!group || !el) return;
  const known = [...group.querySelectorAll('.chip[data-rate]')].find(b => Number(b.dataset.rate) === Number(value));
  if (known) {
    setChipActive(group, known);
    revealCustom(document.getElementById('bungaCustomWrap'), false);
    el.value = Number(value) > 0 ? String(value) : '';
  } else {
    setChipActive(group, group.querySelector('.chip[data-custom]'));
    revealCustom(document.getElementById('bungaCustomWrap'), true);
  }
  updateBungaHint(); updateTxTenorInfo(); updateTxMetaBar();
}
function selectTenorPreset(value) {
  const group = chipGroupById('loanTenorChips');
  const el = document.getElementById('entryTenor');
  if (!group || !el) return;
  const known = [...group.querySelectorAll('.chip[data-tenor]')].find(b => Number(b.dataset.tenor) === Number(value));
  if (known) {
    setChipActive(group, known);
    revealCustom(document.getElementById('tenorCustomWrap'), false);
    el.value = String(value);
  } else {
    setChipActive(group, group.querySelector('.chip[data-custom]'));
    revealCustom(document.getElementById('tenorCustomWrap'), true);
    try { el.focus(); } catch {}
  }
  updateTxTenorInfo(); updateTxMetaBar();
}
function selectDuePreset(days) {
  const group = chipGroupById('loanDueChips');
  const el = document.getElementById('entryLoanDueDate');
  const hidden = document.getElementById('entryLoanDue');
  if (!group) return;
  const known = [...group.querySelectorAll('.chip[data-days]')].find(b => Number(b.dataset.days) === Number(days));
  const hint = document.getElementById('loanDueHint');
  if (known) {
    setChipActive(group, known);
    if (el) el.hidden = true;
    const base = (elements.entryDate && elements.entryDate.value) || new Date().toISOString().split('T')[0];
    const due = addDaysStr(base, days);
    if (el) el.value = due;
    if (hidden) hidden.value = due;
    if (hint) hint.textContent = `Dibalikin sekitar ${new Date(due + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}.`;
  } else {
    setChipActive(group, group.querySelector('.chip[data-custom]'));
    if (el) { el.hidden = false; try { el.showPicker && el.showPicker(); } catch {} try { el.focus(); } catch {} }
    if (hint) hint.textContent = 'Pilih tanggalnya sendiri.';
  }
}
function updateLoanDueLabel(type) {
  const label = document.getElementById('loanDueLabel');
  if (!label) return;
  label.innerHTML = (type === 'cicilan' ? 'Mulai bayar kapan?' : 'Kapan dibalikin?') + ' <span class="tx-opsional">Opsional</span>';
}
function syncLoanPresets() {
  const rate = Number(document.getElementById('entryInterestRate')?.value) || 0;
  const bgroup = chipGroupById('loanBungaChips');
  if (bgroup) {
    const known = [0, 2, 5, 10].includes(rate);
    setChipActive(bgroup, bgroup.querySelector(known ? `.chip[data-rate="${rate}"]` : '.chip[data-custom]'));
    revealCustom(document.getElementById('bungaCustomWrap'), !known);
  }
  const tenor = parseInt(document.getElementById('entryTenor')?.value, 10) || 0;
  const tgroup = chipGroupById('loanTenorChips');
  if (tgroup) {
    if ([3, 6, 12, 24].includes(tenor)) {
      setChipActive(tgroup, tgroup.querySelector(`.chip[data-tenor="${tenor}"]`));
      revealCustom(document.getElementById('tenorCustomWrap'), false);
    } else if (tenor > 0) {
      setChipActive(tgroup, tgroup.querySelector('.chip[data-custom]'));
      revealCustom(document.getElementById('tenorCustomWrap'), true);
    }
  }
  const due = document.getElementById('entryLoanDue')?.value;
  const del = document.getElementById('entryLoanDueDate');
  const dgroup = chipGroupById('loanDueChips');
  if (del && due) del.value = due;
  if (dgroup && due) { setChipActive(dgroup, dgroup.querySelector('.chip[data-custom]')); if (del) del.hidden = false; }
}

// SATU penggerak saja: "dibayar berapa bulan". Cicilan/bulan dihitung otomatis
// dan cuma ditampilkan (read-only) — tak ada lagi dua field yang saling menimpa.
function updateTxTenorInfo() {
  const info = document.getElementById('txTenorInfo');
  if (!info) return;
  const amt = parseFormattedNumber(elements.entryAmount?.value || '');
  const tenorInput = document.getElementById('entryTenor');
  const tenorVal = tenorInput ? parseInt(String(tenorInput.value).replace(/[^0-9]/g, ''), 10) || 0 : 0;
  const isCicilan = elements.entryLoanType?.value === 'cicilan';
  const loanVisible = elements.loanFieldsGroup && !elements.loanFieldsGroup.hidden;
  const mode = (elements.entryLoanMode && elements.entryLoanMode.value) || 'new';
  if (!loanVisible || !isCicilan || mode !== 'new') {
    info.classList.remove('show');
    info.innerHTML = '';
    if (elements.entryInstallment && !isCicilan) elements.entryInstallment.value = '';
    return;
  }
  const rate = readBungaRate();
  const base = amt + Math.round(amt * rate / 100);
  if (!amt) {
    info.classList.add('show');
    info.innerHTML = 'Isi nominalnya dulu di atas ya';
    if (elements.entryInstallment) elements.entryInstallment.value = '';
    return;
  }
  if (!tenorVal || tenorVal <= 0) {
    info.classList.add('show');
    info.innerHTML = `Total pinjaman <strong>${formatCurrency(base)}</strong> • pilih dibayar berapa bulan`;
    if (elements.entryInstallment) elements.entryInstallment.value = '';
    return;
  }
  const monthly = Math.ceil(base / tenorVal);
  const last = base - monthly * (tenorVal - 1);
  if (elements.entryInstallment) elements.entryInstallment.value = formatIdrInput(monthly);
  info.classList.add('show');
  if (tenorVal === 1) info.innerHTML = `Dibayar <strong>1 bulan</strong> • ${formatCurrency(base)}`;
  else if (last <= 0 || last === monthly) info.innerHTML = `≈ <strong>${formatCurrency(monthly)}/bulan</strong> × ${tenorVal} bulan • Total ${formatCurrency(base)}`;
  else info.innerHTML = `≈ <strong>${formatCurrency(monthly)}/bulan</strong> (bulan terakhir ${formatCurrency(last)}) • ${tenorVal} bulan • Total ${formatCurrency(base)}`;
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
    dueEl.addEventListener('change', () => {
      elements.entryLoanDue.value = dueEl.value;
      const hint = document.getElementById('loanDueHint');
      if (hint && dueEl.value) hint.textContent = `Dibalikin sekitar ${new Date(dueEl.value + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}.`;
    });
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
  const entryTenorEl = document.getElementById('entryTenor');
  if (entryTenorEl) {
    entryTenorEl.addEventListener('input', () => { updateTxMetaBar(); updateTxTenorInfo(); });
  }
  const bungaChips = document.getElementById('loanBungaChips');
  if (bungaChips) bungaChips.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
    selectBungaPreset(btn.dataset.custom ? NaN : Number(btn.dataset.rate));
  }));
  const tenorChips = document.getElementById('loanTenorChips');
  if (tenorChips) tenorChips.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
    selectTenorPreset(btn.dataset.custom ? NaN : Number(btn.dataset.tenor));
  }));
  const dueChips = document.getElementById('loanDueChips');
  if (dueChips) dueChips.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
    selectDuePreset(btn.dataset.custom ? NaN : Number(btn.dataset.days));
  }));
  const loanToggles = elements.loanTypeGroup?.querySelectorAll('.select-btn');
  loanToggles?.forEach(btn => btn.addEventListener('click', () => {
    const t = btn.dataset.value;
    updateLoanDueLabel(t);
    if (t === 'cicilan') {
      const tv = parseInt(document.getElementById('entryTenor')?.value, 10) || 0;
      if (!tv) selectTenorPreset(12);
    }
    setTimeout(updateTxTenorInfo, 20);
  }));
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
      syncLoanPresets();
      updateLoanDueLabel(lt);
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
    syncLoanPresets();
    updateLoanDueLabel('lunas');
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
  const ltNow = elements.entryLoanType.value || 'lunas';
  updateLoanDueLabel(ltNow);
  if (mode === 'new') {
    if (ltNow === 'cicilan' && !(parseInt(document.getElementById('entryTenor')?.value, 10) || 0)) selectTenorPreset(12);
    if (!elements.entryId.value && !elements.entryLoanDue.value) selectDuePreset(30);
  }
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
  const more = document.getElementById('txMoreDetails');
  if (more && !more.open) more.open = true;
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
  if (data.category === 'Piutang' || data.category === 'Hutang') {
    if (mode === 'new' && data.loanType === 'cicilan' && (!data.installmentAmount || data.installmentAmount <= 0)) {
      return 'Pilih dulu dibayar berapa bulan';
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
  const PN_RATE = getPpn().rate;
  if (withPPN) { dpp = Math.round(amt / (1 + PN_RATE)); ppn = amt - dpp; }
  const payLabel = `${getPaymentIcon(e.payment)} ${getPaymentLabel(e.payment)}${e.paymentDetail ? ' • ' + escapeHtml(e.paymentDetail) : ''}`;
  box.innerHTML = `
    <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px">
      <div style="font-size:18px;font-weight:800">🧾 KWITANSI</div>
      <div style="font-size:11px;color:#64748b">No: KW-${String(e.id || '').slice(-6).toUpperCase()} • ${formatDate(e.date)}</div>
    </div>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#64748b;width:110px">Jenis</td><td><b>${e.type === 'income' ? '📥 Uang masuk' : '📤 Uang keluar'}</b></td></tr>
      <tr><td style="padding:4px 0;color:#64748b">Kategori</td><td>${getCategoryIcon(e.category)} ${escapeHtml(getCategoryLabel(e.category))}</td></tr>
      ${e.person ? `<tr><td style="padding:4px 0;color:#64748b">Kontak</td><td>${escapeHtml(e.person)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#64748b">Bayar pakai</td><td>${payLabel}</td></tr>
      ${e.description ? `<tr><td style="padding:4px 0;color:#64748b">Catatan</td><td>${escapeHtml(e.description)}</td></tr>` : ''}
      ${withPPN ? `<tr><td style="padding:4px 0;color:#64748b">DPP</td><td>${fmt(dpp)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b">PPN ${(PN_RATE * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%</td><td>${fmt(ppn)}</td></tr>` : ''}
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

export function reportHTMLFor(type, data) {
  switch (type) {
    case 'monthly':
      return renderMonthlyReport(data);
    case 'category':
      return renderCategoryReport(data);
    case 'cashflow':
      return renderCashflowReport(data);
    case 'top-expenses':
      return renderTopExpensesReport(data);
    case 'journal':
      return renderJournalReport(data);
    case 'ledger':
      return renderLedgerReport(data);
    case 'pl':
      return renderPLReport(data);
    case 'bs':
      return renderBSReport(data);
    case 'tax':
      return renderTaxReport(data);
    case 'audit':
      return renderAuditReport(data);
    case 'payrollrep':
      window.__payrollRepData = data;
      return renderPayrollReport(data);
    case 'products':
      return renderProductsReport(data);
    case 'pengeluaran':
      return renderExpenseReport(data);
    case 'trial':
      return renderTrialReport(data);
    case 'ppn':
      return renderPPNReport(data);
    case 'pph21':
      return renderPPh21Report(data);
    default:
      return renderMonthlyReport(data);
  }
}

export function renderReport(type, data) {
  const body = elements.reportSection.querySelector('.modal-body');
  if (body) body.scrollTop = 0;
  elements.reportContent.innerHTML = reportHTMLFor(type, data);
  if (type === 'payrollrep') bindPayrollRepToggle();
}

export function renderReportPage(type, data) {
  const content = document.getElementById('pageReportContent');
  if (!content) return;
  content.innerHTML = reportHTMLFor(type, data);
  document.querySelectorAll('.page-report-tab').forEach(b => b.classList.toggle('selected', b.dataset.report === type));
  if (type === 'payrollrep') bindPayrollRepToggle();
}

export function openReportModal() {
  if (!elements.reportSection.open) elements.reportSection.showModal();
}

export function printReportHTML(title, innerHTML, periodLabel) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<html lang="id"><head><title>Wynara — ${escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;max-width:720px;margin:20px auto;padding:0 16px;color:#111}
    table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f3f4f6}
    .amount-col{text-align:right;font-variant-numeric:tabular-nums}
    h4{margin:14px 0 6px}
    .report-filters{display:none !important}
    .report-summary{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
    .report-summary-item{border:1px solid #ddd;border-radius:8px;padding:8px 12px;font-size:11px}
    .report-summary-item .label{display:block;color:#666}
    .report-summary-item .value{font-weight:700;font-size:14px}
    .income{color:#047857}.expense{color:#be123c}
  </style></head><body>
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
      <div style="font-size:18px;font-weight:800">WYNARA — ${escapeHtml(title).toUpperCase()}</div>
      ${periodLabel ? `<div style="font-size:12px;margin-top:2px"><b>Periode:</b> ${escapeHtml(periodLabel)}</div>` : ''}
      <div style="font-size:11px;color:#555">Dicetak ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
    ${innerHTML}
    <script>onload=()=>{print();}<\/script></body></html>`);
  w.document.close();
  return true;
}

export function printCurrentReport() {
  const box = document.getElementById('reportContent');
  const tab = document.querySelector('.report-tab.active');
  if (!box) return;
  const title = tab ? tab.textContent.trim() : 'Laporan';
  if (!printReportHTML(title, box.innerHTML)) alert('Popup diblokir browser — izinkan popup lalu coba lagi');
}

export function printPageReport(periodLabel) {
  const box = document.getElementById('pageReportContent');
  if (!box) return;
  const tab = document.querySelector('.page-report-tab.selected');
  const title = tab ? tab.textContent.trim() : 'Laporan';
  if (!printReportHTML(title, box.innerHTML, periodLabel)) alert('Popup diblokir browser — izinkan popup lalu coba lagi');
}

export function exportPageReportExcel() {
  try {
    if (typeof window.XLSX === 'undefined') { alert('Library Excel belum termuat — coba muat ulang halaman'); return; }
    const box = document.getElementById('pageReportContent');
    if (!box) return;
    const tab = document.querySelector('.page-report-tab.selected');
    const title = (tab ? tab.textContent.trim() : 'Laporan') + ' — Wynara';
    const tables = [...box.children].filter(el => el.tagName === 'TABLE');
    if (!tables.length) { showInfo('Tidak ada tabel pada laporan ini untuk diunduh'); return; }
    const wb = XLSX.utils.book_new();
    let sheetIdx = 0;
    tables.forEach(table => {
      const ws = XLSX.utils.table_to_sheet(table);
      sheetIdx++;
      const name = sheetIdx === 1 ? 'Laporan' : 'Laporan ' + sheetIdx;
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    });
    XLSX.writeFile(wb, title.replace(/[^\w\s-]/g, '').trim() + '.xlsx');
    showSuccess('Data laporan diunduh ke Excel');
  } catch (err) {
    showError('Gagal export Excel — mungkin tabel terlalu besar');
  }
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
    return reportEmpty('Belum ada data untuk periode ini', 'Mulai dengan satu transaksi — bulan ini langsung terlihat.');
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
    return reportEmpty('Belum ada data kategori', 'Catat transaksinya dulu — tombol ＋ di dashboard atau bottom-bar.');
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
    return reportEmpty('Belum ada data arus kas', 'Catat pemasukan & pengeluaran selama 2–3 bulan — grafiknya muncul di sini.');
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
    return reportEmpty('Belum ada pengeluaran', 'Daftar pengeluaran terbesar muncul begitu ada angka.');
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
// Empty-state dengan langkah berikutnya (bukan dead-end)
function reportEmpty(msg, cta) {
  return `<div style="text-align:center;padding:40px 16px;color:var(--text-muted)">
    <div style="font-size:32px;margin-bottom:8px">🗂️</div>
    <div style="font-weight:600;color:var(--text);margin-bottom:4px">${msg}</div>
    ${cta ? `<div style="font-size:12px">${cta}</div>` : ''}
  </div>`;
}
function renderJournalReport(journals) {
  if (!journals || !journals.length) {
    return reportEmpty('Belum ada jurnal pada periode ini', 'Tiap transaksi otomatis membentuk jurnal — catat dulu lewat tombol ＋.');
  }
  const data = journals.filter(j => matchSearch(j.memo, j.id, (j.lines || []).map(l => accountLabel(l.account)).join(' ')));
  if (!data.length) {
    return reportEmpty(`Jurnal tidak cocok: "${reportSearch}"`, 'Coba kata lain (memo transaksi / nama akun).');
  }
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Jurnal${reportSearch ? ` (filter "${reportSearch}" — ${data.length} cocok)` : ''}</span><span class="value">${journals.length}</span></div>
      <div class="report-summary-item"><span class="label">Total Debit = Kredit</span><span class="value income">✓ Balance</span></div>
    </div>
    <table class="report-table">
      <thead><tr><th>Tanggal</th><th>Memo</th><th>Akun</th><th class="amount-col">Debit</th><th class="amount-col">Kredit</th></tr></thead>
      <tbody>
        ${data.map(j => (j.lines || []).map((l, i) => `
          <tr>
            <td style="white-space:nowrap">${i === 0 ? formatDate(j.date) : ''}</td>
            <td class="memo-col" title="${i === 0 ? escapeHtml(j.memo || '') : ''}">${i === 0 ? escapeHtml(j.memo || '') : ''}</td>
            <td style="padding-left:${i === 0 ? 8 : 24}px;white-space:nowrap">${escapeHtml(accountLabel(l.account))}</td>
            <td class="amount-col">${l.debit ? formatCurrency(l.debit) : ''}</td>
            <td class="amount-col">${l.credit ? formatCurrency(l.credit) : ''}</td>
          </tr>`).join('')).join('')}
      </tbody>
    </table>`;
}

// State drill-down per laporan (klik akun → lihat transaksinya)
const drillState = { ledger: '', trial: '' };
// Filter pencarian laporan (dipakai tab Jurnal & Buku Besar)
let reportSearch = '';
export function setReportSearch(v) { reportSearch = String(v || '').trim().toLowerCase(); }
export function getReportSearch() { return reportSearch; }
function matchSearch(...parts) {
  if (!reportSearch) return true;
  return parts.some(p => String(p || '').toLowerCase().includes(reportSearch));
}
export function toggleDrill(kind, code) {
  if (drillState[kind] === code) drillState[kind] = '';
  else drillState[kind] = code;
}
function drillAttrs(kind, code) {
  const c = String(code).replace(/'/g, '');
  const js = `document.dispatchEvent(new CustomEvent('wynara:ledger-toggle',{detail:{kind:'${kind}',code:'${c}'}}))`;
  return `tabindex="0" role="button" style="cursor:pointer" title="Lihat transaksi akun ini (Enter)" onclick="${js}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${js}}"`;
}
function drillLinesHTML(lines, kind, code) {
  if (!drillState[kind] || drillState[kind] !== code) return '';
  if (!lines || !lines.length) return `<tr style="background:#f8fafc"><td colspan="4" style="padding:8px 14px;color:#94a3b8;font-size:11px">Tidak ada transaksi untuk akun ini.</td></tr>`;
  const deb = lines.reduce((s, l) => s + l.debit, 0);
  const cred = lines.reduce((s, l) => s + l.credit, 0);
  return `<tr style="background:#f8fafc"><td colspan="4" style="padding:6px 14px">
    <table class="report-table" style="margin:0">
      <thead><tr><th style="font-size:10px">Tanggal</th><th style="font-size:10px">Keterangan jurnal</th><th class="amount-col" style="font-size:10px">Debit</th><th class="amount-col" style="font-size:10px">Kredit</th></tr></thead>
      <tbody>${lines.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(l => `<tr>
        <td style="white-space:nowrap;font-size:11px;color:#64748b">${formatDate(l.date)}</td>
        <td class="memo-col" style="font-size:12px" title="${escapeHtml(l.memo || '')}">${escapeHtml(l.memo || '')}</td>
        <td class="amount-col" style="font-size:12px">${l.debit ? formatCurrency(l.debit) : ''}</td>
        <td class="amount-col" style="font-size:12px">${l.credit ? formatCurrency(l.credit) : ''}</td>
      </tr>`).join('')}
      <tr style="border-top:1px solid #cbd5e1"><td colspan="2" style="font-weight:700;font-size:11px">Subtotal ${drillState[kind] === code ? escapeHtml(code) : ''}</td><td class="amount-col" style="font-weight:700">${formatCurrency(deb)}</td><td class="amount-col" style="font-weight:700">${formatCurrency(cred)}</td></tr>
      </tbody></table></td></tr>`;
}

function renderLedgerReport(d) {
  // backward-compatible: object {bal, journals, lines} atau plain balances map
  const bal = d && d.bal ? d.bal : (d || {});
  const linesMap = (d && d.lines) || null;
  const allCodes = Object.keys(bal || {}).sort();
  const codes = allCodes.filter(c => matchSearch(c, accountLabel(c)));
  if (!codes.length) {
    return reportEmpty(allCodes.length ? `Akun tidak cocok: "${reportSearch}"` : 'Belum ada gerakan akun pada periode ini', allCodes.length ? 'Coba nama akun lain (mis. Kas, Beban).' : 'Saldo muncul setelah ada transaksi atau saldo awal.');
  }
  return `
    <p style="font-size:11px;color:#64748b">Klik salah satu akun untuk melihat pagar debit/kredit transaksinya.</p>
    <table class="report-table">
      <thead><tr><th>Akun</th><th class="amount-col">Debit</th><th class="amount-col">Kredit</th><th class="amount-col">Saldo</th></tr></thead>
      <tbody>
        ${codes.map(c => {
          const b = bal[c];
          const net = b.debit - b.credit;
          return `<tr ${drillAttrs('ledger', c)}>
            <td>${drillState.ledger === c ? '▾' : '▸'} ${escapeHtml(accountLabel(c))}</td>
            <td class="amount-col">${formatCurrency(b.debit)}</td>
            <td class="amount-col">${formatCurrency(b.credit)}</td>
            <td class="amount-col" style="font-weight:700">${net >= 0 ? '' : '−'}${formatCurrency(Math.abs(net))} ${net >= 0 ? 'Db' : 'Kr'}</td></tr>
          ${drillLinesHTML(linesMap ? linesMap[c] : null, 'ledger', c)}`;
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

function renderProductsReport(d) {
  if (!d || !d.rows.length) {
    return '<p style="text-align:center;color:var(--text-muted);padding:40px;">Belum ada penjualan barang — catat lewat 🧾 Jual di dashboard</p>';
  }
  const fmt = (v) => formatCurrency(Math.round(v));
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Total penjualan barang</span><span class="value">${fmt(d.total)}</span></div>
      <div class="report-summary-item"><span class="label">Jenis produk terjual</span><span class="value">${d.rows.length}</span></div>
      <div class="report-summary-item"><span class="label">Utung (perkiraan, modal rata-rata sekarang)</span><span class="value income">${fmt(d.rows.reduce((s, x) => s + x.margin, 0))}</span></div>
    </div>
    <p style="font-size:11px;color:#64748b">Margin memakai modal rata-rata stok saat ini — kalau harga beli sering naik-turun, angka hanyalah perkiraan.</p>
    <table class="report-table">
      <thead><tr><th>Produk</th><th class="amount-col">Qty</th><th class="amount-col">Omzet</th><th class="amount-col">Bagian</th><th class="amount-col">Utung (perkiraan)</th></tr></thead>
      <tbody>
        ${d.rows.map(r => `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td class="amount-col">${r.qty}</td>
          <td class="amount-col income">${fmt(r.omzet)}</td>
          <td class="amount-col">${r.share.toFixed(1)}%</td>
          <td class="amount-col ${r.margin >= 0 ? 'income' : 'expense'}">${fmt(r.margin)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

// Neraca Saldo — per akun debit/kredit + cek seimbang + deteksi jurnal pincang
function renderTrialReport(d) {
  if (!d) return '';
  const fmt = (v) => formatCurrency(Math.round(Number(v) || 0));
  const TYPE_LABEL = { asset: 'Aset', liability: 'Kewajiban', equity: 'Modal', revenue: 'Pendapatan', expense: 'Beban' };
  const groups = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  const rowsHTML = groups.map(t => {
    const rows = d.rows.filter(x => x.type === t);
    if (!rows.length) return '';
    const tDeb = rows.reduce((s, x) => s + x.b.debit, 0);
    const tCred = rows.reduce((s, x) => s + x.b.credit, 0);
    const getItems = rows.map(x => `<tr style="cursor:default">
      <td style="text-align:left;color:#64748b;font-size:11px">${x.code}</td>
      <td style="text-align:left">${x.b.debit || x.b.credit ? `<span ${drillAttrs('trial', x.code)}>${drillState.trial === x.code ? '▾' : '▸'} ${escapeHtml(x.name)}</span>` : escapeHtml(x.name)}</td>
      <td class="amount-col" style="${x.b.debit || x.b.credit ? '' : 'color:#cbd5e1'}">${x.b.debit ? fmt(x.b.debit) : ''}</td>
      <td class="amount-col" style="${x.b.debit || x.b.credit ? '' : 'color:#cbd5e1'}">${x.b.credit ? fmt(x.b.credit) : ''}</td>
    </tr>${x.b.debit || x.b.credit ? drillLinesHTML(d.lines && d.lines[x.code], 'trial', x.code) : ''}`).join('');
    return `<tr style="background:#f1f5f9"><td colspan="2" style="font-weight:700">${TYPE_LABEL[t]}</td><td class="amount-col" style="font-weight:700">${tDeb ? fmt(tDeb) : ''}</td><td class="amount-col" style="font-weight:700">${tCred ? fmt(tCred) : ''}</td></tr>${getItems}`;
  }).join('');
  const badge = d.balanced
    ? '<span style="background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;border-radius:9999px;padding:3px 10px;font-weight:700">✓ Seimbang</span>'
    : `<span style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:9999px;padding:3px 10px;font-weight:700">⚠ Selisih ${fmt(Math.abs(d.diff))}</span>`;
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Total Debit</span><span class="value">${fmt(d.debit)}</span></div>
      <div class="report-summary-item"><span class="label">Total Kredit</span><span class="value">${fmt(d.credit)}</span></div>
      <div class="report-summary-item"><span class="label">Status</span><span class="value">${badge}</span></div>
      <div class="report-summary-item"><span class="label">Bulan</span><span class="value">${d.rangeLabel}</span></div>
    </div>
    <p style="font-size:11px;color:#64748b;margin:6px 0">Klik akun berlabel ▸ untuk melihat transaksinya.</p>
    ${d.unbalanced.length ? `<p style="font-size:11px;color:#b91c1c;margin:6px 0">⚠ Terdeteksi <b>${d.unbalanced.length}</b> jurnal pincang (id: ${escapeHtml(d.unbalanced.slice(0, 5).join(', '))}${d.unbalanced.length > 5 ? '…' : ''}). Periksa di tab Jurnal.</p>` : `<p style="font-size:11px;color:#64748b;margin:6px 0">Semua jurnal seimbang. ${d.locked.length ? `Periode terkunci: ${d.locked.join(', ')}.` : 'Tidak ada periode terkunci.'}</p>`}
    <table class="report-table">
      <thead><tr><th>Kode</th><th>Akun</th><th class="amount-col">Debit</th><th class="amount-col">Kredit</th></tr></thead>
      <tbody>${rowsHTML}
        <tr style="border-top:2px solid #0f172a"><td colspan="2" style="font-weight:800">TOTAL</td><td class="amount-col" style="font-weight:800">${fmt(d.debit)}</td><td class="amount-col" style="font-weight:800">${fmt(d.credit)}</td></tr>
      </tbody>
    </table>`;
}

// Laporan PPN bulanan (gaya 1111): PPN Keluaran vs Masukan
function renderPPNReport(d) {
  if (!d) return '';
  const fmt = (v) => formatCurrency(Math.round(Number(v) || 0));
  const netGood = d.net >= 0;
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">PPN Keluaran (total)</span><span class="value expense">${fmt(d.totalKeluar)}</span></div>
      <div class="report-summary-item"><span class="label">PPN Masukan (total)</span><span class="value income">${fmt(d.totalMasuk)}</span></div>
      <div class="report-summary-item"><span class="label">Kurang / (Lebih) Bayar</span><span class="value ${netGood ? 'expense' : 'income'}">${netGood ? 'Kurang bayar' : 'Lebih bayar'} ${fmt(Math.abs(d.net))}</span></div>
      <div class="report-summary-item"><span class="label">Tahun</span><span class="value">${d.year}</span></div>
    </div>
    <p style="font-size:11px;color:#64748b">PPN dihitung dari akun: <b>2105 PPN Keluaran</b> (penjualan) dan <b>1401 PPN Masukan</b> (pembelian). DPP perkiraan (PPN ÷ ${(getPpn().rate * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%). Ubah tarif di Pengaturan bila tarif resmi berubah. Lampirkan ke SPT Masa PPN (1111); pastikan sudah terdaftar sebagai Pengusaha Kena Pajak (PKP) bila omzet &gt; Rp4,8M.</p>
    <table class="report-table">
      <thead><tr><th>Bulan</th><th class="amount-col">Penjualan (DPP)</th><th class="amount-col">PPN Keluar</th><th class="amount-col">Pembelian (DPP)</th><th class="amount-col">PPN Masuk</th><th class="amount-col">Kurang/(Lebih)</th></tr></thead>
      <tbody>${d.months.length ? d.months.map(m => `<tr><td>${m.month}</td><td class="amount-col">${fmt(m.keluarDPP)}</td><td class="amount-col expense">${fmt(m.keluarPPN)}</td><td class="amount-col">${fmt(m.masukDPP)}</td><td class="amount-col income">${fmt(m.masukPPN)}</td><td class="amount-col ${m.net >= 0 ? 'expense' : 'income'}">${fmt(m.net)}</td></tr>`).join('') : '<tr><td colspan="6">Belum ada transaksi PPN</td></tr>'}</tbody>
    </table>`;
}

// Rekap PPh 21 per bulan (e-SPT 21)
function renderPPh21Report(d) {
  if (!d) return '';
  const fmt = (v) => formatCurrency(Math.round(Number(v) || 0));
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Total PPh 21 terpotong</span><span class="value expense">${fmt(d.totalPph)}</span></div>
      <div class="report-summary-item"><span class="label">Total gaji bersih (THP)</span><span class="value">${fmt(d.totalThp)}</span></div>
      <div class="report-summary-item"><span class="label">Priode</span><span class="value">${d.rows[0] ? `${d.rows[d.rows.length - 1].month} — ${d.rows[0].month}` : '—'}</span></div>
      <div class="report-summary-item"><span class="label">Karyawan dibayar</span><span class="value">${d.rows.reduce((s, x) => s + x.count, 0)} kali</span></div>
    </div>
    <p style="font-size:11px;color:#64748b">Rekap untuk <b>SPT Masa PPh 21 / e-SPT</b>: jumlah PPh 21 yang dipotong dari gaji tiap bulan. Data diambil dari payroll yang sudah difinalisasi.</p>
    <table class="report-table">
      <thead><tr><th>Bulan</th><th class="amount-col">Gaji bersih (THP)</th><th class="amount-col">PPh 21 terpotong</th><th class="amount-col">Karyawan</th></tr></thead>
      <tbody>${d.rows.length ? d.rows.map(m => `<tr><td>${m.month}</td><td class="amount-col">${fmt(m.thp)}</td><td class="amount-col expense">${fmt(m.pph)}</td><td class="amount-col">${m.count}</td></tr>`).join('') : '<tr><td colspan="4">Belum ada data gaji</td></tr>'}</tbody>
    </table>`;
}

// Pengeluaran vs Anggaran — kartu, filter, tabel per kategori, komposisi, terbaru
function renderExpenseReport(d) {
  if (!d) return '';
  const fmt = (v) => formatCurrency(Math.round(Number(v) || 0));
  const compact = (v) => formatCurrencyCompact(Math.round(Number(v) || 0));
  if (!d.rows.length && !d.recent.length) {
    return reportEmpty('Belum ada pengeluaran pada periode ini', 'Catat pengeluaran dulu — tombol ＋, atau atur anggaran di Pengaturan.');
  }
  const opt = (val, label, selected) => `<option value="${escapeHtml(val)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const catOpts = opt('all', 'Semua kategori', d.fCat === 'all') + d.cats.map(c => {
    let label = c;
    try { label = getCategoryLabel(c) || c; } catch {}
    return opt(c, label, d.fCat === c);
  }).join('');
  const perOpts = opt('all', 'Semua pembayar', d.fPer === 'all') + d.persons.map(p => opt(p, p || '—', d.fPer === p)).join('');
  const sisaCls = d.remaining >= 0 ? 'income' : 'expense';
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Anggaran bulan ini</span><span class="value">${fmt(d.budgetTotal)}</span></div>
      <div class="report-summary-item"><span class="label">Biaya tercatat</span><span class="value expense">${fmt(d.spentTotal)}</span></div>
      <div class="report-summary-item"><span class="label">Sisa anggaran</span><span class="value ${sisaCls}">${fmt(d.remaining)}</span></div>
      <div class="report-summary-item"><span class="label">Transaksi</span><span class="value">${d.recent.length ? d.recent.length + '+' : 0} terbaru</span></div>
    </div>
    ${!d.budgetTotal ? '<p style="font-size:11px;color:#b45309;margin:6px 0">💡 Belum ada anggaran — atur di Pengaturan → Anggaran Bulanan & per Kategori agar tabel Selisih terisi.</p>' : ''}
    <div class="report-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">
      <label style="font-size:11px;color:#64748b">Kategori<br><select onchange="document.dispatchEvent(new CustomEvent('wynara:expense-filter',{detail:{kind:'cat',value:this.value}}))" style="height:36px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:12px;max-width:200px">${catOpts}</select></label>
      <label style="font-size:11px;color:#64748b">Pembayar<br><select onchange="document.dispatchEvent(new CustomEvent('wynara:expense-filter',{detail:{kind:'person',value:this.value}}))" style="height:36px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:12px;max-width:200px">${perOpts}</select></label>
    </div>
    <h4 style="margin:12px 0 6px">Anggaran per kategori</h4>
    <table class="report-table">
      <thead><tr><th>Kategori</th><th class="amount-col">Anggaran</th><th class="amount-col">Biaya tercatat</th><th class="amount-col">Selisih</th></tr></thead>
      <tbody>
        ${d.rows.map(r => `<tr><td>${r.icon} ${escapeHtml(r.label)}</td>
          <td class="amount-col">${r.budget ? fmt(r.budget) : '<span style="color:#cbd5e1">—</span>'}</td>
          <td class="amount-col">${fmt(r.spent)}</td>
          <td class="amount-col ${r.diff >= 0 ? 'income' : 'expense'}">${r.budget ? fmt(r.diff) : '<span style="color:#cbd5e1">—</span>'}</td></tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:11px;color:#64748b">Selisih = anggaran − tercatat (hijau = masih ada sisa). Atur limit di Pengaturan → Anggaran per Kategori.</p>
    <h4 style="margin:12px 0 6px">Komposisi biaya</h4>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
      ${d.rows.slice(0, 8).map(r => `<div style="display:flex;align-items:center;gap:8px;font-size:12px">
        <span style="flex:0 0 130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.label)}</span>
        <span style="flex:1;background:#f1f5f9;border-radius:9999px;height:14px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2, Math.round((r.spent / d.compMax) * 100))}%;background:#3b82f6;border-radius:9999px"></span></span>
        <b style="flex:0 0 70px;text-align:right">${compact(r.spent)}</b>
      </div>`).join('')}
    </div>
    <h4 style="margin:12px 0 6px">Pengeluaran terbaru</h4>
    <table class="report-table">
      <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Pembayar</th><th class="amount-col">Jumlah</th><th>Bayar pakai</th></tr></thead>
      <tbody>
        ${d.recent.map(x => `<tr><td style="white-space:nowrap;font-size:11px">${formatDate(x.date)}</td>
          <td>${escapeHtml(x.description)}</td>
          <td>${x.icon} ${escapeHtml(x.label)}</td>
          <td>${escapeHtml(x.person || '—')}</td>
          <td class="amount-col expense">${fmt(x.amount)}</td>
          <td style="font-size:11px">${escapeHtml(getPaymentLabel(x.payment) || '')}</td></tr>`).join('') || '<tr><td colspan="6">Tidak ada data</td></tr>'}
      </tbody>
    </table>`;
}

function renderTaxReport(d) {
  if (!d) return '';
  // UMKM PP 23/2018: PPh Final 0.5% atas omzet bruto per periode 6 bulan
  const curMonths = (d.months || []).filter(m => String(m.month).startsWith(String(d.year)));
  const sem1 = curMonths.filter(m => Number(m.month.slice(5, 7)) <= 6).reduce((s, m) => s + m.omzet, 0);
  const sem2 = curMonths.filter(m => Number(m.month.slice(5, 7)) >= 7).reduce((s, m) => s + m.omzet, 0);
  const today = new Date();
  const mgmt = (label, omzet, due) => {
    const pph = Math.round(omzet * 0.005);
    const d1 = new Date(due + 'T00:00:00');
    const done = today > d1;
    const stat = omzet <= 0 ? '<span style="color:#94a3b8">Tidak ada omzet</span>'
      : done ? `<span style="color:#94a3b8">Jatuh tempo lewat (${new Date(d1).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })})</span>`
      : `<span style="color:#b45309">Bayar sebelum ${new Date(d1).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>`;
    return `<div style="flex:1;min-width:200px;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
      <div style="font-size:11px;color:#64748b">${label}</div>
      <div style="font-weight:800;font-size:14px">${formatCurrency(pph)}</div>
      <div style="font-size:10px;color:#64748b;margin:2px 0 4px">omzet ${formatCurrency(omzet)} × 0,5%</div>${stat}</div>`;
  };
  return `
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Omzet ${d.year}</span><span class="value">${formatCurrency(d.omzetYear)}</span></div>
      <div class="report-summary-item"><span class="label">PPh Final 0.5%</span><span class="value expense">${formatCurrency(d.pphYear)}</span></div>
      <div class="report-summary-item"><span class="label">Sisa plafon 4.8M</span><span class="value ${4800000000 - d.omzetYear >= 0 ? 'income' : 'expense'}">${formatCurrency(Math.max(4800000000 - d.omzetYear, 0))}</span></div>
      <div class="report-summary-item"><span class="label">PPN Kurang Bayar</span><span class="value ${d.ppnNet >= 0 ? 'expense' : 'income'}">${formatCurrency(d.ppnNet)}</span></div>
    </div>
    <p style="font-size:11px;color:#64748b;margin-bottom:8px"><b>Laporan pajak UMKM (PP 23/2018)</b> — UMKM dengan omzet ≤ Rp4,8 M/tahun: PPh Final 0,5% dari omzet bruto, dibayar per <b>periode 6 bulan</b> (Jan–Jun dan Jul–Des maksimal tgl 15 bulan berikutnya). Daftar ini siap dibawa ke e-Bupot/kantor pajak. <button type="button" onclick="document.dispatchEvent(new CustomEvent('wynara:tax-csv'))" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer">⬇️ Unduh CSV untuk DJP</button></p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      ${mgmt(`Semester 1 (${d.year}: Jan–Jun)`, sem1, `${d.year}-07-15`)}
      ${mgmt(`Semester 2 (${d.year}: Jul–Des)`, sem2, `${Number(d.year) + 1}-01-15`)}
    </div>
    <p style="font-size:11px;color:#64748b">Bulanan (PP 55/2022): bayar tiap bulan paling lambat tgl 15 bulan berikutnya. PPN = Keluaran − Masukan.</p>
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
  const actorLabel = (a) => {
    const ac = a && a.actor;
    if (!ac || (!ac.role && !ac.user)) return '—';
    const role = ac.role === 'kasir' ? 'Kasir' : 'Pemilik';
    return ac.user && ac.user !== ac.role ? `${role} (${ac.user})` : role;
  };
  return `
    <table class="report-table">
      <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Data</th></tr></thead>
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
            <td style="font-size:11px">${escapeHtml(actorLabel(a))}</td>
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
  if (document.body.dataset.payrepbound) return;
  document.body.dataset.payrepbound = '1';
  document.addEventListener('click', (e) => {
    const mode = e.target.closest('[data-paymode]');
    if (mode) {
      payrollRepMode = mode.dataset.paymode;
      // render ulang di container terdekat (modal laporan / halaman gaji)
      const host = mode.closest('#reportContent, #payrollViewReport') || document.getElementById('reportContent');
      const tb = host ? host.querySelector('#payrollRepBody') : document.getElementById('payrollRepBody');
      if (tb && window.__payrollRepData) tb.innerHTML = payrollRepRows(window.__payrollRepData);
      if (host) host.querySelectorAll('[data-paymode]').forEach(b => b.classList.toggle('selected', b === mode));
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

// Bukti Potong 1721-A1 (tahunan per karyawan) — cetak dari hasil rekonsiliasi Des.
// Data: { year, name, npwp, ptkp, monthly[{month,gross,thr,pph}], annualGross,
// annualDue, paidJanNov, pkp, ptkpAmt, decAdjust }. Tarif: UU 36/2008 jo. UU HPP 7/2021.
export function printDecA1(d) {
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const w = window.open('', '_blank');
  if (!w) return;
  const ms = (d.monthly || []).slice().sort((a, b) => String(a.month) < String(b.month) ? -1 : 1);
  w.document.write(`<html lang="id"><head><title>1721-A1 ${escapeHtml(d.year)} — ${escapeHtml(d.name)}</title><style>
    body{font-family:Arial,sans-serif;max-width:720px;margin:20px auto;padding:0 16px;color:#111}
    table{width:100%;border-collapse:collapse;margin:10px 0;font-size:12px}
    th,td{border:1px solid #999;padding:5px 8px;text-align:left}
    th{background:#f3f4f6}.r{text-align:right;white-space:nowrap}
    h2{font-size:15px;margin:14px 0 4px}h3{font-size:13px;margin:12px 0 4px}
    .muted{color:#555;font-size:11px}
  </style></head><body>
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
      <div style="font-size:18px;font-weight:800">BUKTI POTONG PPh 21 — FORMULIR 1721-A1</div>
      <div style="font-size:12px">Tahun pajak ${escapeHtml(d.year)} • Karyawan tetap</div>
    </div>
    <h2>A. Identitas penerima penghasilan</h2>
    <table>
      <tr><td>Nama</td><td><b>${escapeHtml(d.name)}</b></td></tr>
      <tr><td>NPWP ${d.npwp ? '' : '(tidak ada → tarif +20%)'}</td><td>${escapeHtml(d.npwp || '—')}</td></tr>
      <tr><td>Status PTKP</td><td>${escapeHtml(d.ptkp || '')} (PTKP setahun ${fmt(d.ptkpAmt)})</td></tr>
    </table>
    <h2>B. Penghasilan bruto + PPh dipotong per bulan</h2>
    <table>
      <thead><tr><th>Bulan</th><th class="r">Bruto+THR</th><th class="r">PPh 21 dipotong</th></tr></thead>
      <tbody>${ms.map(m => `<tr><td>${escapeHtml(m.month)}</td><td class="r">${fmt((Number(m.gross) || 0) + (Number(m.thr) || 0))}</td><td class="r">${fmt(m.pphPaid)}</td></tr>`).join('')}</tbody>
    </table>
    <h2>C. Penghitungan tahunan</h2>
    <table>
      <tr><td>Penghasilan bruto setahun</td><td class="r">${fmt(d.annualGross)}</td></tr>
      <tr><td>Penghasilan Kena Pajak (PKP)</td><td class="r">${fmt(d.pkp)}</td></tr>
      <tr><td>PPh 21 terutang setahun (progresif 5/15/25/30/35%)</td><td class="r"><b>${fmt(d.annualDue)}</b></td></tr>
      <tr><td>Sudah dipotong Jan–Nov (TER bulanan)</td><td class="r">(${fmt(d.paidJanNov)})</td></tr>
      <tr><td><b>Kurang bayar — dipotong di Desember</b></td><td class="r"><b>${fmt(d.decAdjust)}</b></td></tr>
    </table>
    <p class="muted">Dihitung TER bulanan PMK 168/2023 + tarif progresif UU PPh 36/2008 jo. UU HPP 7/2021. Minta konsultan pajak konfirmasi sebelum filing.</p>
    <div style="display:flex;justify-content:space-between;margin-top:26px;font-size:12px"><span>Pemotong,<br><br><br>( ............. )</span><span style="text-align:right">Tanggal cetak: ${new Date().toLocaleDateString('id-ID')}<br><br><br>&nbsp;</span></div>
  </body></html>`);
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

// Sinkron label "PPN 11%" statis ke tarif tersimpan (patch text-node, listener aman)
export function updatePpnLabels() {
  const rate = (getPpn().rate * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  document.querySelectorAll('#entryPPN, #receiptPPN, #salePPN').forEach(cb => {
    const p = cb.parentElement;
    if (!p) return;
    p.childNodes.forEach(node => {
      if (node.nodeType === 3 && /PPN [\d.,]+%/.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(/PPN [\d.,]+%/, `PPN ${rate}%`);
      }
    });
  });
}

let idrInitDone = false;
export function initIdrInputs() {
  if (idrInitDone) return;
  idrInitDone = true;
  const ids = ['entryAmount', 'repayAmount', 'stockPrice', 'stockCost', 'entryItemCost', 'empBase', 'empAllowance', 'transferAmount', 'reconActual', 'catBudgetAmount', 'budgetInput', 'equityInput', 'assetCost', 'adjustDebitAmt', 'adjustCreditAmt'];
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
          <button class="btn btn-ghost edit-contact-btn" data-contact-id="${p.id}" data-contact-name="${escapeHtml(p.name)}" data-contact-type="${p.type || 'person'}" data-contact-phone="${escapeHtml(p.phone || '')}" aria-label="Edit ${escapeHtml(p.name)}" title="Edit">✎</button>
          <button class="btn btn-danger delete-contact-btn" data-contact-id="${p.id}" data-contact-name="${escapeHtml(p.name)}" aria-label="Hapus ${escapeHtml(p.name)}" title="Hapus">🗑</button>
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
  updateStockProfit();
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
      <button class="btn btn-ghost stock-edit" data-id="${i.id}" aria-label="Edit ${escapeHtml(i.name)}" title="Edit" style="font-size:11px;padding:2px 8px">✎</button>
      <button class="btn btn-ghost stock-del" data-id="${i.id}" aria-label="Hapus ${escapeHtml(i.name)}" title="Hapus" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
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
  updateStockProfit();
}
export function updateStockProfit() {
  const box = document.getElementById('stockProfit');
  if (!box) return;
  const price = Number(parseIdrInput(document.getElementById('stockPrice')?.value || '')) || 0;
  const cost = Number(parseIdrInput(document.getElementById('stockCost')?.value || '')) || 0;
  if (price <= 0 && cost <= 0) { box.innerHTML = ''; return; }
  const profit = price - cost;
  const margin = price > 0 ? Math.round((profit / price) * 100) : 0;
  const good = profit >= 0;
  box.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;background:${good ? '#f0fdf4' : '#fef2f2'};border:1px solid ${good ? '#bbf7d0' : '#fecaca'};border-radius:10px;padding:8px 12px;color:${good ? '#15803d' : '#b91c1c'}">
    <span>${good ? '📈' : '📉'} Untung per pcs</span><b style="font-size:14px">Rp${profit.toLocaleString('id-ID')}</b>
    <span style="opacity:.8">(margin ${margin}%)</span>
    ${good ? '' : '<span style="font-weight:700">— harga jual di bawah modal!</span>'}
  </div>`;
}
export function resetStockForm() {
  document.getElementById('stockForm')?.reset();
  document.getElementById('stockFormId').value = '';
  updateStockProfit();
}
export function bindStock(onSave, onEdit, onDelete) {
  document.getElementById('closeStockBtn')?.addEventListener('click', closeStock);
  document.getElementById('stockModal')?.addEventListener('click', (e) => { if (e.target.id === 'stockModal') closeStock(); });
  document.getElementById('stockForm')?.addEventListener('submit', (e) => { e.preventDefault(); onSave(); });
  document.getElementById('stockFormReset')?.addEventListener('click', resetStockForm);
  ['stockPrice', 'stockCost'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateStockProfit);
  });
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
      <button class="btn btn-ghost emp-slip" data-id="${e.id}" aria-label="Slip gaji ${escapeHtml(e.name)}" title="Slip gaji" style="font-size:11px;padding:2px 8px">🧾</button>
      <button class="btn btn-ghost emp-edit" data-id="${e.id}" aria-label="Edit ${escapeHtml(e.name)}" title="Edit" style="font-size:11px;padding:2px 8px">✎</button>
      <button class="btn btn-ghost emp-del" data-id="${e.id}" aria-label="Hapus ${escapeHtml(e.name)}" title="Hapus" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
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
  const maybeAutoAdd = () => {
    // Multi-baris lancar: baris baru muncul otomatis saat baris terakhir terisi lengkap
    if (sel.value && Number(qty.value) > 0 && box.querySelectorAll('.sale-row').length < 8 && row === box.lastElementChild) addSaleRow();
  };
  sel.addEventListener('change', () => { price.dataset.touched = ''; syncPrice(); maybeAutoAdd(); });
  price.addEventListener('input', () => { price.dataset.touched = '1'; });
  price.addEventListener('focus', () => { price.value = parseIdrInput(price.value); try { price.select(); } catch {} });
  price.addEventListener('blur', () => { const v = parseIdrInput(price.value); price.value = v ? formatIdrInput(v) : ''; recalcSale(); });
  [qty, price].forEach(el => el.addEventListener('input', () => { recalcSale(); maybeAutoAdd(); }));
  row.querySelector('.sale-del').addEventListener('click', () => { row.remove(); recalcSale(); });
  box.appendChild(row);
  bindRupiah(price);
  syncPrice();
}
export function recalcSale() {
  const data = readSaleRows();
  const el = document.getElementById('saleTotal');
  if (el) el.textContent = 'Total ' + formatCurrency(data.total) + ` (${data.lines.length} barang)`;
  document.querySelectorAll('#saleRows .sale-row').forEach((row, i) => {
    const sub = row.querySelector('.sale-sub');
    if (sub) sub.textContent = data.lines[i] ? formatCurrency(data.lines[i].qty * data.lines[i].price) : '';
  });
  // Ringkasan live: uang masuk kas, PPN, estimasi untung
  const sum = document.getElementById('saleSummary');
  if (!sum) return;
  const ppn = !!document.getElementById('salePPN')?.checked;
  const P_RATE = getPpn().rate;
  const dpp = ppn ? data.total / (1 + P_RATE) : data.total;
  const ppnAmt = ppn ? data.total - dpp : 0;
  const items = getItemList();
  const untung = data.lines.reduce((s, l) => { const it = items.find(x => x.id === l.itemId); const c = it ? Number(it.cost) || 0 : 0; return s + l.qty * (l.price - c); }, 0);
  const good = untung >= 0;
  if (data.total <= 0) { sum.innerHTML = '<span style="color:#94a3b8">Pilih barang, isi qty & harga.</span>'; return; }
  sum.innerHTML = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>Masuk kas</span><b style="font-size:14px">${formatCurrency(data.total)}</b>
    ${ppn ? `<span style="opacity:.7">(DPP ${formatCurrency(Math.round(dpp))} + PPN ${(P_RATE * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}% ${formatCurrency(Math.round(ppnAmt))})</span>` : ''}</div>
    <div style="font-size:11px;color:${good ? '#059669' : '#dc2626'};font-weight:600;margin-top:2px">${good ? '📈' : '📉'} Estimasi untung ${formatCurrency(Math.round(untung))}</div>
  </div>`;
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
  document.getElementById('salePPN')?.addEventListener('change', recalcSale);
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
  const qtyBuy = row.querySelector('.buy-qty');
  const maybeAutoAddBuy = () => {
    // Baris baru otomatis saat baris terakhir terisi lengkap
    if (sel.value && Number(qtyBuy.value) > 0 && box.querySelectorAll('.buy-row').length < 8 && row === box.lastElementChild) addBuyRow();
  };
  sel.addEventListener('change', () => {
    const it = items.find(x => x.id === sel.value);
    if (it && !cost.dataset.touched) cost.value = it.cost ? String(it.cost) : '';
    recalcBuy();
    maybeAutoAddBuy();
  });
  cost.addEventListener('input', () => { cost.dataset.touched = '1'; });
  cost.addEventListener('blur', () => { const v = parseIdrInput(cost.value); cost.value = v ? formatIdrInput(v) : ''; recalcBuy(); maybeAutoAddBuy(); });
  qtyBuy.addEventListener('input', () => {
    recalcBuy();
    maybeAutoAddBuy();
  });
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
  const sum = document.getElementById('buySummary');
  if (!sum) return;
  const qty = data.lines.reduce((s, l) => s + l.qty, 0);
  if (data.total <= 0) { sum.innerHTML = '<span style="color:#94a3b8">Pilih barang, isi qty & modal.</span>'; return; }
  sum.innerHTML = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span>Stok bertambah</span><b style="font-size:14px">${qty} pcs</b><span style="opacity:.7">• nilai persediaan ${formatCurrency(data.total)}</span></div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">Total ini jadi <b>hutang usaha</b>; bayar nanti di tab Stok.</div>
  </div>`;
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
  // Aging hutang per keterlambatan/atfile (bkap query akuntan)
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
  purchases.forEach(p => {
    const paid = (p.payments || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const out = Math.max((Number(p.totalCost) || 0) - paid, 0);
    if (p.status === 'paid' || out <= 0.01) return;
    const base = p.dueDate ? new Date(p.dueDate + 'T00:00:00') : new Date(p.date + 'T00:00:00');
    const over = Math.max(Math.floor((today - base) / 86400000), 0);
    if (!p.dueDate) buckets.current += out;
    else if (over <= 30) buckets.current += out;
    else if (over <= 60) buckets.d30 += out;
    else if (over <= 90) buckets.d60 += out;
    else if (over <= 120) buckets.d90 += out;
    else buckets.over90 += out;
  });
  const agingRows = [];
  const addRow = (label, v, color) => { if (v > 0.01) agingRows.push(`<span style="background:${'white'};border:1px solid ${color}33;border-radius:9999px;padding:3px 10px;font-weight:600">${label}: <b style="color:${color}">${fmt(Math.round(v))}</b></span>`); };
  addRow('Belum jatuh tempo', buckets.current, '#2563eb');
  addRow('1–30 hari', buckets.d30, '#d97706');
  addRow('31–60 hari', buckets.d60, '#dc2626');
  addRow('61–90 hari', buckets.d90, '#991b1b');
  addRow('90+ hari', buckets.over90, '#7f1d1d');
  const agingHTML = agingRows.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px;font-size:11px;align-items:center"><span style="color:#64748b;font-weight:700">Umur hutang:</span>${agingRows.join('')}</div>` : '';
  box.innerHTML = agingHTML + purchases.map(p => {
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
      ${!isPaid ? `<button class="btn btn-ghost sup-pay" data-id="${p.id}" aria-label="Bayar ${escapeHtml(p.supplier)}" title="Bayar" style="font-size:11px;padding:4px 10px">💰 Bayar</button>` : ''}
      ${(p.payments || []).length === 0 ? `<button class="btn btn-ghost sup-del" data-id="${p.id}" aria-label="Hapus pembelian ${escapeHtml(p.supplier)}" title="Hapus" style="font-size:11px;padding:4px 8px;color:#ef4444">✕</button>` : ''}
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
  const wh = document.getElementById('supplierPayWithhold');
  if (wh) {
    wh.value = '';
    const whInfo = document.getElementById('supplierPayWithholdInfo');
    if (whInfo) whInfo.textContent = 'Potongan kamu setor ke negara; vendor terima bukti potong 23/4(2) dari kamu.';
  }
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
    date: document.getElementById('supplierPayDate')?.value || '',
    withhold: document.getElementById('supplierPayWithhold')?.value || ''
  };
}
export function bindSupplierPay(onSubmit) {
  document.getElementById('supplierPayClose')?.addEventListener('click', closeSupplierPay);
  document.getElementById('supplierPayCancel')?.addEventListener('click', closeSupplierPay);
  document.getElementById('supplierPayModal')?.addEventListener('click', (e) => { if (e.target.id === 'supplierPayModal') closeSupplierPay(); });
  document.getElementById('supplierPayForm')?.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(); });
  const whSel = document.getElementById('supplierPayWithhold');
  const whInfo = document.getElementById('supplierPayWithholdInfo');
  const updWh = () => {
    if (!whSel || !whInfo) return;
    const amt = Number(document.getElementById('supplierPayAmount')?.value || 0) || 0;
    if (!whSel.value) { whInfo.textContent = 'Potongan kamu setor ke negara; vendor terima bukti potong 23/4(2) dari kamu.'; return; }
    const rate = whSel.value === '23' ? 0.02 : 0.10;
    const pph = Math.round(amt * rate);
    whInfo.innerHTML = pph > 0 && pph < amt
      ? `<span style="color:#b45309">PPh dipotong <b>${fmtNum(pph)}</b> — kas keluar <b>${fmtNum(amt - pph)}</b> • hutang berkurang ${fmtNum(amt)}</span>`
      : '<span style="color:#b91c1c">Nominal terlalu kecil untuk dipotong</span>';
  };
  function fmtNum(v) { return 'Rp' + Math.round(v).toLocaleString('id-ID'); }
  whSel?.addEventListener('change', updWh);
  document.getElementById('supplierPayAmount')?.addEventListener('input', updWh);
}

/* ===== Halaman Karyawan & Gaji ===== */
let payrollTab = 'data';
let payrollExpanded = null;
export function getPayrollTab() { return payrollTab; }
export function setPayrollTab(tab) {
  payrollTab = tab;
  document.querySelectorAll('#payrollTabs .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === tab));
  document.getElementById('payrollTabData').hidden = tab !== 'data';
  document.getElementById('payrollTabProcess').hidden = tab !== 'process';
  document.getElementById('payrollTabReport').hidden = tab !== 'report';
}
function empIncomplete(e) {
  const missing = [];
  if (!e.startDate) missing.push('tanggal bergabung (THR tidak bisa dihitung)');
  if (!e.phone) missing.push('nomor HP');
  return missing.length ? 'Belum lengkap: ' + missing.join(', ') : '';
}
function pctFmt(part, base) {
  if (!(base > 0) || !(part > 0)) return '';
  return (part / base * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
}
export function paySlipDetailHTML(r) {
  const e = r.emp, s = r.slip;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const B = s.bases || { gross: s.gross, kesWage: s.gross, jpWage: s.gross };
  const R = s.rates || DEFAULT_RATES;
  const pct = (v) => ((Number(v) || 0) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
  const dis = r.paid ? 'disabled' : '';
  const row = (kid, hr, amt, sign) => {
    if (!(amt > 0)) return '';
    return `<div style="display:flex;gap:8px;font-size:12px;padding:5px 0;border-bottom:1px dashed #e2e8f0"><span style="flex:1">${kid}<br><small style="color:#64748b">${hr}</small></span><b style="white-space:nowrap">${sign}${fmt(amt)}</b></div>`;
  };
  const cap = (used, full) => (used < full ? ` (plafon ${fmt(used)})` : '');
  const tenureTxt = s.tenureMonths >= 12 ? 'penuh (12+ bulan)' : `${s.tenureMonths} bulan → proporsional`;
  const received = [
    row('Gaji tetap tiap bulan', 'Gaji pokok', s.base, '+'),
    row('Uang tambahan tetap', 'Tunjangan tetap', s.allow, '+'),
    row('Uang lembur bulan ini', 'Lembur', s.overtime, '+'),
    row('Bonus bulan ini', 'Bonus/insentif', s.bonus, '+'),
    row(`Bonus hari raya — kerja ${tenureTxt}`, 'THR Keagamaan (Permenaker 6/2016)', s.thr, '+'),
    row(`Iuran berobat — gajimu dipotong ${pctFmt(s.ded.kesSelf, B.kesWage)}`, `BPJS Kesehatan pekerja ${pct(R.kesSelf)} × ${fmt(B.kesWage)}${cap(B.kesWage, B.gross)}`, s.ded.kesSelf, '−'),
    row(`Tabungan hari tua — gajimu dipotong ${pctFmt(s.ded.jhtSelf, B.gross)}`, `JHT pekerja ${pct(R.jhtSelf)} × ${fmt(B.gross)}`, s.ded.jhtSelf, '−'),
    row(`Tabungan pensiun — gajimu dipotong ${pctFmt(s.ded.jpSelf, B.jpWage)}`, `JP pekerja ${pct(R.jpSelf)} × ${fmt(B.jpWage)}${cap(B.jpWage, B.gross)}`, s.ded.jpSelf, '−'),
    row('Pajak gaji — dipotong otomatis', s.pphOverridden ? `PPh 21 hasil <b>rekonsiliasi Desember</b> (menggantikan TER)` : `PPh 21 TER ${escapeHtml(e.ptkp || 'TK/0')} × netto ${fmt(s.pphNetto)}${e.npwp ? '' : ' (tanpa NPWP +20%)'}`, s.ded.pph21, '−'),
    row('Denda/absensi bulan ini', `Potongan langsung${r.hadir > 0 ? ` • hadir ${r.hadir} hari` : ' (tidak mengurangi dasar BPJS/PPh)'}`, s.deduct, '−'),
    row('Potong kasbon dari gaji', `Pelunasan pinjaman karyawan${r.kasbonSkip ? ' • <b>dijeda bulan ini</b>' : ''}`, s.kasbon, '−'),
  ].join('');
  const company = [
    row('Iuran berobat — perusahaan yang bayar', `BPJS Kesehatan perusahaan ${pct(R.kesComp)} × ${fmt(B.kesWage)}${cap(B.kesWage, B.gross)}`, s.comp.kesComp, '+'),
    row('Tabungan hari tua — perusahaan yang bayar', `JHT perusahaan ${pct(R.jhtComp)} × ${fmt(B.gross)}`, s.comp.jhtComp, '+'),
    row('Tabungan pensiun — perusahaan yang bayar', `JP perusahaan ${pct(R.jpComp)} × ${fmt(B.jpWage)}${cap(B.jpWage, B.gross)}`, s.comp.jpComp, '+'),
    row('Asuransi kecelakaan kerja — perusahaan yang bayar', `JKK ${pct(R.jkk)} × ${fmt(B.gross)}`, s.comp.jkk, '+'),
    row('Santunan kematian — perusahaan yang bayar', `JKM ${pct(R.jkm)} × ${fmt(B.gross)}`, s.comp.jkm, '+'),
  ].join('');
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:8px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:11px;color:#64748b">Lembur bulan ini</div>
        <input type="text" class="pay-lembur" data-id="${e.id}" value="${r.overtime > 0 ? r.overtime : ''}" placeholder="Rp" inputmode="decimal" ${dis} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;margin-top:4px">
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:11px;color:#64748b">Bonus bulan ini</div>
        <input type="text" class="pay-bonus" data-id="${e.id}" value="${(r.slip.bonus || 0) > 0 ? r.slip.bonus : ''}" placeholder="Rp" inputmode="decimal" ${dis} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;margin-top:4px">
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:11px;color:#64748b">Denda/absensi</div>
        <input type="text" class="pay-denda" data-id="${e.id}" value="${(r.slip.deduct || 0) > 0 ? r.slip.deduct : ''}" placeholder="Rp" inputmode="decimal" ${dis} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;margin-top:4px">
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:11px;color:#64748b">Hadir (hari)</div>
        <input type="number" class="pay-hadir" data-id="${e.id}" min="0" max="31" value="${r.hadir > 0 ? r.hadir : ''}" placeholder="mis. 22" ${dis} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;margin-top:4px">
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">standar 22 • <22 → sarankan denda</div>
      </div>
      ${(r.kasbonDetail && r.kasbonDetail.length) ? `<div style="background:#fff;border:1px solid #fcd34d;border-radius:8px;padding:8px">
        <div style="font-size:11px;color:#64748b">Potong kasbon bulan ini${(r.kasbonDetail.length > 1) ? ` (${r.kasbonDetail.length} pinjaman)` : ''}</div>
        <input type="text" class="pay-kasbon" data-id="${e.id}" value="${r.kasbonAmount != null ? r.kasbonAmount : (r.kasbon > 0 ? r.kasbon : '')}" placeholder="Rp (otomatis)" inputmode="decimal" ${dis} style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;margin-top:4px">
        <label class="login-check" style="font-size:11px;display:block;margin-top:4px"><input type="checkbox" class="pay-kasbon-skip" data-id="${e.id}" ${r.kasbonSkip ? 'checked' : ''} ${dis}> Jeda potong bulan ini</label>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">Otomatis dari cicilan pinjaman. Kosongkan untuk otomatis.</div>
      </div>` : ''}
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:11px;color:#64748b">THR: <b>${fmt(s.thr)}</b></div>
        <label class="login-check" style="font-size:11px;display:block;margin-top:4px"><input type="checkbox" class="pay-thr" data-id="${e.id}" ${r.withThr ? 'checked' : ''} ${dis}> Sertakan THR</label>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:11px;color:#64748b">PPh 21: <b>${fmt(s.ded.pph21)}</b></div>
        <label class="login-check" style="font-size:11px;display:block;margin-top:4px"><input type="checkbox" class="pay-pph" data-id="${e.id}" ${r.withPph ? 'checked' : ''} ${dis}> Hitung PPh</label>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:12px;font-weight:700;margin-bottom:4px">Masuk kantong karyawan = <b>${fmt(s.takeHome)}</b></div>
        ${received || '<div style="font-size:12px;color:#94a3b8">—</div>'}
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px">
        <div style="font-size:12px;font-weight:700;margin-bottom:4px">Dibayar perusahaan = <b>${fmt(s.employerCost)}</b></div>
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">Gaji + THR ${fmt(s.gross + s.thr)} + iuran ${fmt(s.totalComp)}</div>
        ${company || '<div style="font-size:12px;color:#94a3b8">BPJS nonaktif untuk karyawan ini.</div>'}
      </div>
    </div>`;
}
export function renderEmpTable(emps, term) {
  const body = document.getElementById('empTableBody');
  if (!body) return;
  const t = (term || '').trim().toLowerCase();
  const rows = t ? emps.filter(e => `${e.name || ''} ${e.role || ''} ${e.contract || ''} ${e.active === false ? 'nonaktif' : 'aktif'}`.toLowerCase().includes(t)) : emps;
  const title = document.getElementById('empTableTitle');
  if (title) title.textContent = `Daftar karyawan (${emps.length})`;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const colors = ['#dbeafe', '#ede9fe', '#dcfce7', '#fef3c7', '#fce7f3'];
  body.innerHTML = rows.length ? rows.map(e => {
    const initial = (e.name || '?')[0]?.toUpperCase() || '?';
    const color = colors[(e.name || '').length % colors.length];
    const gross = Math.round(Number(e.baseSalary ?? e.salary) || 0);
    return `<tr style="border-bottom:1px solid #f8fafc">
      <td style="padding:10px"><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:32px;height:32px;border-radius:50%;background:${color};display:inline-flex;align-items:center;justify-content:center;font-weight:700">${escapeHtml(initial)}</span><b>${escapeHtml(e.name)}</b></span></td>
      <td style="padding:10px">${escapeHtml(e.role || '—')}</td>
      <td style="padding:10px">${escapeHtml(e.contract === 'harian' ? 'Harian' : e.contract === 'kontrak' ? 'Kontrak' : 'Tetap')}</td>
      <td style="padding:10px">${e.active === false ? '😴 Nonaktif' : '🟢 Aktif'}</td>
      <td style="padding:10px;text-align:right">${fmt(gross)}</td>
      <td style="padding:10px;text-align:right"><button class="btn btn-ghost emp-view-edit" data-id="${e.id}" aria-label="Edit ${escapeHtml(e.name)}" title="Edit" style="font-size:12px">✎ Edit</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8">Belum ada karyawan yang cocok.</td></tr>';
}
export function openAssetModal() {
  const m = document.getElementById('assetModal');
  if (!m) return;
  if (!m.open) { try { m.showModal(); } catch {} }
  if (m && !m.dataset.bound) {
    m.dataset.bound = '1';
    m.addEventListener('click', (e) => { if (e.target === m) { e.preventDefault(); } });
    m.addEventListener('cancel', (e) => e.preventDefault());
  }
}
export function closeAssetModal() {
  const m = document.getElementById('assetModal');
  if (m && m.open) { try { m.close(); } catch {} }
}

export function openEmpModal(emp) {  fillEmpPanel(emp);
  const m = document.getElementById('empModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
  if (m) trapFocus(m);
}
export function closeEmpModal() {
  const m = document.getElementById('empModal');
  if (!m) return;
  releaseFocus(m);
  if (m.open) { try { m.close(); } catch {} }
}
export function fillEmpPanel(emp) {
  bindEmpEnterFlow();
  const isNew = !emp;
  document.getElementById('empPanelTitle').textContent = isNew ? 'Tambah karyawan' : 'Edit karyawan';
  document.getElementById('empViewSave').textContent = isNew ? 'Tambah karyawan' : 'Simpan perubahan';
  const v = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  v('empViewId', emp?.id || '');
  v('empViewName', emp?.name || '');
  v('empViewRole', emp?.role || '');
  v('empViewContract', emp?.contract || 'tetap');
  v('empViewStart', emp?.startDate || '');
  v('empViewPhone', emp?.phone || '');
  v('empViewEmail', emp?.email || '');
  const act = document.getElementById('empViewActive');
  if (act) act.checked = emp ? emp.active !== false : true;
  v('empViewBase', emp ? (emp.baseSalary ?? emp.salary ?? '') : '');
  v('empViewAllowance', emp?.allowance ?? '');
  v('empViewBank', emp?.bankName || '');
  v('empViewBankAcc', emp?.bankAcc || '');
  v('empViewGender', emp?.gender || '');
  v('empViewBirth', emp?.birthDate || '');
  v('empViewPtkp', emp?.ptkp || 'TK/0');
  v('empViewNpwp', emp?.npwp || '');
  v('empViewAddress', emp?.address || '');
  const bk = document.getElementById('empViewBpjsKes');
  if (bk) bk.checked = emp ? emp.bpjsKes !== false : true;
  const bt = document.getElementById('empViewBpjsTk');
  if (bt) bt.checked = emp ? emp.bpjsTk !== false : true;
  setEmpSubTab('main');
}
export function setEmpSubTab(sub) {
  document.querySelectorAll('#empSubTabs .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === sub));
  document.getElementById('empSubMain').hidden = sub !== 'main';
  document.getElementById('empSubSalary').hidden = sub !== 'salary';
  document.getElementById('empSubTax').hidden = sub !== 'tax';
}
// Enter di Nama/Jabatan → lompat ke tab Gaji (kurangi jalur ketuk T3)
function bindEmpEnterFlow() {
  ['empViewName', 'empViewRole'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.dataset.enterflow) return;
    el.dataset.enterflow = '1';
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      setEmpSubTab('salary');
      const base = document.getElementById('empViewBase');
      if (base && !base.dataset.idrBound) bindRupiah(base);
      try { base?.focus(); } catch {}
    });
  });
}
export function getEmpPanelData() {
  return {
    id: document.getElementById('empViewId')?.value || null,
    name: document.getElementById('empViewName')?.value.trim() || '',
    role: document.getElementById('empViewRole')?.value.trim() || '',
    contract: document.getElementById('empViewContract')?.value || 'tetap',
    startDate: document.getElementById('empViewStart')?.value || '',
    phone: (document.getElementById('empViewPhone')?.value || '').trim(),
    email: (document.getElementById('empViewEmail')?.value || '').trim(),
    active: document.getElementById('empViewActive')?.checked !== false,
    baseSalary: Number(parseIdrInput(document.getElementById('empViewBase')?.value || '')) || 0,
    allowance: Number(parseIdrInput(document.getElementById('empViewAllowance')?.value || '')) || 0,
    bankName: document.getElementById('empViewBank')?.value.trim() || '',
    bankAcc: (document.getElementById('empViewBankAcc')?.value || '').trim(),
    gender: document.getElementById('empViewGender')?.value || '',
    birthDate: document.getElementById('empViewBirth')?.value || '',
    ptkp: document.getElementById('empViewPtkp')?.value || 'TK/0',
    npwp: (document.getElementById('empViewNpwp')?.value || '').replace(/[^0-9]/g, ''),
    address: document.getElementById('empViewAddress')?.value.trim() || '',
    bpjsKes: document.getElementById('empViewBpjsKes')?.checked !== false,
    bpjsTk: document.getElementById('empViewBpjsTk')?.checked !== false
  };
}
/* Proses gaji (halaman): rows = [{emp, slip, checked, paid, overtime, withThr, withPph}] */
export function renderPayrollProcess(rows, monthLabel, status) {
  const body = document.getElementById('payrollTableBody');
  if (!body) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const sel = rows.filter(r => r.checked && !r.paid);
  const sumPokok = sel.reduce((s, r) => s + r.slip.base + r.slip.allow, 0);
  const sumNet = sel.reduce((s, r) => s + r.slip.takeHome, 0);
  const cards = document.getElementById('payrollCards');
  if (cards) {
    const statTxt = status === 'final' ? 'Final' : status === 'draft' ? 'Draft' : 'Baru';
    cards.innerHTML = `
      <div class="dash-panel" style="padding:14px"><div style="font-size:11px;color:#64748b">Karyawan dipilih</div><div style="font-size:20px;font-weight:800">${sel.length} orang</div></div>
      <div class="dash-panel" style="padding:14px"><div style="font-size:11px;color:#64748b">Gaji pokok + tunjangan</div><div style="font-size:20px;font-weight:800">${fmt(sumPokok)}</div></div>
      <div class="dash-panel" style="padding:14px"><div style="font-size:11px;color:#64748b">Status ${escapeHtml(monthLabel)}</div><div style="font-size:14px;font-weight:800"><span class="chip" style="font-size:12px">${statTxt}</span></div></div>`;
  }
  document.querySelectorAll('#payrollSteps .pstep').forEach(el => {
    const s = Number(el.dataset.s);
    const on = s === 1 || (s === 2 && sel.length > 0) || (s === 3 && status === 'final');
    el.querySelector('.pdot').style.cssText = `width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;background:${on ? '#2563eb' : '#e2e8f0'};color:${on ? '#fff' : '#64748b'}`;
    el.style.fontWeight = on ? '700' : '400';
    el.style.color = on ? '#1d4ed8' : '#64748b';
  });
  const allChecked = rows.length > 0 && rows.every(r => r.checked || r.paid);
  const ca = document.getElementById('payrollCheckAll');
  if (ca) ca.checked = allChecked;
  const panel = document.getElementById('payrollRatesPanel');
  if (panel) {
    const R = rows[0]?.slip?.rates || DEFAULT_RATES;
    const dis = status === 'final' ? 'disabled' : '';
    const cell = (key, label, hint) => `<div><div style="font-size:11px;color:#64748b">${label}</div><input type="text" inputmode="decimal" class="pay-rate" data-rate="${key}" aria-label="Tarif ${label} (%)" value="${(Number(R[key]) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}" ${dis} style="width:100%;height:32px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;margin-top:4px"><div class="rate-hint" data-std="${hint}" style="font-size:10px;color:#94a3b8">${hint} • =Rp${Math.round(Number(R[key]) * 10000).toLocaleString('id-ID')} per Rp1jt</div></div>`;
    panel.innerHTML = rows.length ? `<details style="margin:0 16px 8px">
      <summary style="cursor:pointer;font-size:12px;font-weight:600;color:#475569;user-select:none">⚙️ Tarif iuran BPJS &amp; pajak <span style="font-weight:400;color:#94a3b8">(klik untuk lihat/ubah)</span></summary>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-top:8px">
        <div style="font-size:11px;color:#64748b;margin-bottom:8px">Tarif standar BPJS terisi otomatis — ubah hanya kalau ada SK khusus. Berlaku untuk semua karyawan bulan ini. JKK mengikuti kelas risiko usaha (0,24%–1,74%), JKM &amp; JKK dibayar perusahaan.</div>
        <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:4px">Dibayar perusahaan</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:10px">
          ${cell('kesComp', 'BPJS Kesehatan', 'standar 4')}
          ${cell('jhtComp', 'JHT', 'standar 3,7')}
          ${cell('jpComp', 'JP', 'standar 2')}
          ${cell('jkk', 'JKK kecelakaan kerja', 'standar 0,54 • kecil 0,24')}
          ${cell('jkm', 'JKM kematian', 'standar 0,3')}
        </div>
        <div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:4px">Dipotong dari gaji karyawan</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">
          ${cell('kesSelf', 'BPJS Kesehatan', 'standar 1')}
          ${cell('jhtSelf', 'JHT', 'standar 2')}
          ${cell('jpSelf', 'JP', 'standar 1')}
        </div>
        <div style="font-size:10px;color:#94a3b8;margin-top:8px">Isi angka persen, mis. <b>0,24</b> = 0,24%. PPh 21 tetap ikut tarif TER resmi (tidak bisa diubah) — bisa dimatikan per karyawan.</div>
      </div>
    </details>` : '';
  }
  body.innerHTML = rows.length ? rows.map(r => {
    const e = r.emp;
    const initial = (e.name || '?')[0]?.toUpperCase() || '?';
    const tambahan = r.slip.allow + r.slip.overtime + (r.slip.bonus || 0) + r.slip.thr;
    const potongan = r.slip.totalDed + (r.slip.deduct || 0) + (r.slip.kasbon || 0);
    const stTxt = r.paid ? 'Sudah' : status === 'final' ? 'Final' : 'Draft';
    const open = payrollExpanded === e.id;
    return `<tr style="border-bottom:1px solid #f8fafc;${r.paid ? 'opacity:0.6' : ''}">
      <td style="padding:10px"><input type="checkbox" class="pay-check" data-id="${e.id}" ${r.checked ? 'checked' : ''} ${r.paid ? 'disabled' : ''} aria-label="Pilih ${escapeHtml(e.name)}"></td>
      <td style="padding:10px"><button type="button" class="pay-expand" data-id="${e.id}" aria-expanded="${open ? 'true' : 'false'}" aria-label="Rincian ${escapeHtml(e.name)}" title="Klik untuk lihat rincian THR, BPJS & PPh" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;text-align:left">
        <span style="width:32px;height:32px;border-radius:50%;background:#dbeafe;display:inline-flex;align-items:center;justify-content:center;font-weight:700">${escapeHtml(initial)}</span>
        <span><b>${escapeHtml(e.name)}</b><br><small style="color:#64748b">${escapeHtml(e.role || '')}</small>${empIncomplete(e) ? `<br><small style="color:#b45309" title="${escapeHtml(empIncomplete(e))}">Belum lengkap</small>` : ''}</span>
        <span style="color:#94a3b8">${open ? '▴' : '▾'}</span></button></td>
      <td style="padding:10px;text-align:right">${fmt(r.slip.base)}</td>
      <td style="padding:10px;text-align:right">${fmt(tambahan)}</td>
      <td style="padding:10px;text-align:right">${fmt(potongan)}</td>
      <td style="padding:10px;text-align:right"><b>${fmt(r.slip.takeHome)}</b></td>
      <td style="padding:10px"><span class="chip" style="font-size:11px">${stTxt}</span></td>
    </tr>
    ${open ? `<tr><td></td><td colspan="6" style="padding:0 10px 12px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <div style="font-size:12px;font-weight:700">Rincian komponen gaji</div>
          <button type="button" class="pay-print" data-id="${e.id}" aria-label="Cetak slip gaji ${escapeHtml(e.name)}" title="Cetak slip gaji (UU 13/2003 Ps. 93)" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer">🖨️ Cetak slip</button>
          <button type="button" class="pay-wa" data-id="${e.id}" aria-label="Kirim slip WH di WhatsApp ${escapeHtml(e.name)}" title="Kirim ringkasan slip via WhatsApp" style="background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer">📤 WA</button>
        </div>
        ${paySlipDetailHTML(r)}
        ${r.thrNote ? `<div style="font-size:11px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:8px">ⓘ ${escapeHtml(r.thrNote)}</div>` : ''}
      </div>
    </td></tr>` : ''}`;
  }).join('') : '<tr><td colspan="7" style="padding:24px;text-align:center;color:#94a3b8">Belum ada karyawan aktif. Tambah di tab Data Karyawan.</td></tr>';
  const foot = document.getElementById('payrollFootTotal');
  if (foot) foot.textContent = fmt(sumNet);
  const note = document.getElementById('payrollFootNote');
  if (note) {
    const issues = [];
    sel.forEach(r => {
      if (r.withThr && r.slip.thr <= 0) issues.push(`${r.emp.name}: THR dicentang tapi masa kerja < 1 bulan`);
      if (r.withPph && !r.emp.ptkp) issues.push(`${r.emp.name}: PTKP kosong (pakai TK/0)`);
    });
    note.innerHTML = issues.length
      ? `<span style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:6px 10px;display:inline-block">⚠️ ${escapeHtml(issues[0])}${issues.length > 1 ? ` +${issues.length - 1} lagi` : ''}</span>`
      : (sel.length ? '<span style="color:#059669">✓ BPJS + PPh dihitung otomatis, siap difinalisasi.</span>' : 'Centang karyawan untuk diproses.');
  }
  const fin = document.getElementById('payrollFinalBtn');
  if (fin) fin.disabled = sel.length === 0;
}
// Panel rekonsiliasi PPh 21 Desember — murni (data masuk, HTML keluar).
// rows: [{ empId, name, ptkp, hasNpwp, months, annualGross, annualDue,
// paidJanNov, pkp, ptkpAmt, decTer, decAdjust, applied, decFinalized }].
// Tarif tahunan: UU 36/2008 jo. UU HPP 7/2021 — konfirmasi konsultan sebelum filing.
export function renderDecRecon(rows, year, locked) {
  const box = document.getElementById('payrollDecPanel');
  if (!box) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  if (!rows || !rows.length) {
    box.innerHTML = `<details style="margin:0 16px 8px">
      <summary style="cursor:pointer;font-size:12px;font-weight:600;color:#475569">🔄 Rekonsiliasi PPh 21 Desember ${escapeHtml(year)}</summary>
      <div style="font-size:12px;color:#94a3b8;padding:8px 2px">Belum ada gaji final Jan–Nov ${escapeHtml(year)} untuk direkonsiliasi. Finalisasi bulan-bulan sebelumnya dulu.</div>
    </details>`;
    return;
  }
  box.innerHTML = `<details style="margin:0 16px 8px" open>
    <summary style="cursor:pointer;font-size:12px;font-weight:600;color:#475569">🔄 Rekonsiliasi PPh 21 Desember ${escapeHtml(year)} <span style="font-weight:400;color:#94a3b8">(TER = estimasi; Des = hitung tahunan − Jan–Nov)</span></summary>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-top:8px">
      <div style="font-size:11px;color:#64748b;margin-bottom:8px">PMK 168/2023: potongan Jan–Nov memakai TER; Desember memakai tarif progresif tahunan (UU 36/2008 jo. UU HPP 7/2021). Selisihnya dipotongkan di slip Desember. Minta konsultan konfirmasi sebelum filing.</div>
      <div style="overflow-x:auto"><table style="width:100%;min-width:680px;border-collapse:collapse;font-size:12px">
        <thead><tr style="font-size:11px;color:#94a3b8;border-bottom:1px solid #e2e8f0">
          <th style="padding:8px;text-align:left">Karyawan</th>
          <th style="padding:8px;text-align:right">Bruto setahun</th>
          <th style="padding:8px;text-align:right">Dipotong Jan–Nov</th>
          <th style="padding:8px;text-align:right">Terutang setahun</th>
          <th style="padding:8px;text-align:right">TER Des (draf)</th>
          <th style="padding:8px;text-align:right">Des rekonsiliasi</th>
          <th style="padding:8px;text-align:left">Aksi</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px"><b>${escapeHtml(r.name)}</b><br><small style="color:#64748b">${escapeHtml(r.ptkp)}${r.hasNpwp ? '' : ' • tanpa NPWP'}</small>${r.applied != null ? '<br><small style="color:#059669">✓ diterapkan</small>' : ''}</td>
          <td style="padding:8px;text-align:right">${fmt(r.annualGross)}</td>
          <td style="padding:8px;text-align:right">${fmt(r.paidJanNov)}</td>
          <td style="padding:8px;text-align:right"><b>${fmt(r.annualDue)}</b></td>
          <td style="padding:8px;text-align:right">${fmt(r.decTer)}</td>
          <td style="padding:8px;text-align:right"><b style="color:#b45309">${fmt(r.decAdjust)}</b></td>
          <td style="padding:8px;white-space:nowrap">
            <button type="button" onclick="document.dispatchEvent(new CustomEvent('wynara:dec-a1',{detail:'${r.empId}'}))" title="Cetak Bukti Potong 1721-A1" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer">🧾 A1</button>
            ${r.decFinalized || locked ? '' : `<button type="button" onclick="document.dispatchEvent(new CustomEvent('wynara:dec-apply',{detail:'${r.empId}'}))" title="Pakai angka rekonsiliasi untuk slip Desember" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer">Terapkan</button>`}
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  </details>`;
}
export function setPayrollExpanded(id) {
  payrollExpanded = payrollExpanded === id ? null : id;
}
export function bindPayrollView(handlers) {
  const once = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el && !el.dataset.bound) { el.dataset.bound = '1'; el.addEventListener(ev, fn); }
  };
  once('empAddBtn', 'click', handlers.onAdd);
  once('empPanelClose', 'click', handlers.onClose);
  once('empViewCancel', 'click', handlers.onCancel);
  once('empImportBtn', 'click', handlers.onImportClick);
  const empImportFile = document.getElementById('empImportFile');
  if (empImportFile && !empImportFile.dataset.bound) {
    empImportFile.dataset.bound = '1';
    empImportFile.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f && handlers.onImportFile) handlers.onImportFile(f);
      e.target.value = '';
    });
  }
  const empModal = document.getElementById('empModal');
  if (empModal && !empModal.dataset.bound) {
    empModal.dataset.bound = '1';
    empModal.addEventListener('click', (e) => { if (e.target === empModal) handlers.onClose(); });
    empModal.addEventListener('cancel', (e) => { e.preventDefault(); handlers.onClose(); });
  }
  document.getElementById('empViewForm')?.addEventListener('submit', (e) => { e.preventDefault(); handlers.onSave(); });
  if (!document.body.dataset.payview) {
    document.body.dataset.payview = '1';
    document.getElementById('payrollTabs')?.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (b) handlers.onTab(b.dataset.value);
    });
    document.getElementById('empSubTabs')?.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (b) setEmpSubTab(b.dataset.value);
    });
    document.getElementById('empSearch')?.addEventListener('input', (e) => handlers.onSearch(e.target.value));
    document.getElementById('empTableBody')?.addEventListener('click', (e) => {
      const b = e.target.closest('.emp-view-edit');
      if (b) handlers.onEdit(b.dataset.id);
    });
    document.getElementById('payrollPeriod')?.addEventListener('change', (e) => handlers.onPeriod(e.target.value));
    document.getElementById('payrollCheckAll')?.addEventListener('change', (e) => handlers.onCheckAll(e.target.checked));
    document.getElementById('payrollTableBody')?.addEventListener('click', (e) => {
      const ex = e.target.closest('.pay-expand');
      if (ex) { handlers.onExpand(ex.dataset.id); return; }
      const ch = e.target.closest('.pay-check');
      if (ch) { handlers.onCheck(ch.dataset.id, ch.checked); return; }
      const pr = e.target.closest('.pay-print');
      if (pr && handlers.onPrintSlip) { handlers.onPrintSlip(pr.dataset.id); return; }
      const wa = e.target.closest('.pay-wa');
      if (wa && handlers.onSlipWa) { handlers.onSlipWa(wa.dataset.id); return; }
    });
    document.getElementById('payrollTableBody')?.addEventListener('change', (e) => {
      if (e.target.closest('.pay-thr') || e.target.closest('.pay-pph') || e.target.closest('.pay-kasbon-skip')) handlers.onDetailChange();
      const hd = e.target.closest('.pay-hadir');
      if (hd && handlers.onHadir) handlers.onHadir(hd);
    });
    document.getElementById('payrollRatesPanel')?.addEventListener('change', (e) => {
      const el = e.target.closest('.pay-rate');
      if (el) handlers.onRate(el);
    });
    document.getElementById('payrollRatesPanel')?.addEventListener('input', (e) => {
      const el = e.target.closest('.pay-rate');
      if (!el) return;
      const hint = el.parentElement?.querySelector('.rate-hint');
      if (!hint) return;
      const raw = String(el.value || '').replace(',', '.').trim();
      const v = Number(raw);
      const key = el.dataset.rate;
      const limit = ((RATE_LIMITS[key] ?? 1) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 });
      if (!Number.isFinite(v)) { hint.style.color = '#94a3b8'; hint.textContent = `${hint.dataset.std || ''} • ketik angka, mis. 0,54`; return; }
      const perJuta = Math.round(v * 10000);
      const over = v > ((RATE_LIMITS[key] ?? 1) * 100);
      hint.style.color = over ? '#b91c1c' : '#94a3b8';
      hint.textContent = `${hint.dataset.std || ''} • =Rp${perJuta.toLocaleString('id-ID')} per Rp1jt${over ? ` ⚠ maks ${limit}%` : ''}`;
    });
    document.getElementById('payrollTableBody')?.addEventListener('input', (e) => {
      if (e.target.closest('.pay-lembur')) handlers.onLembur(e.target.closest('.pay-lembur'));
      else if (e.target.closest('.pay-bonus') || e.target.closest('.pay-denda') || e.target.closest('.pay-kasbon')) handlers.onLembur(e.target);
    });
    document.getElementById('payrollDraftBtn')?.addEventListener('click', handlers.onDraft);
    document.getElementById('payrollCopyBtn')?.addEventListener('click', handlers.onCopy);
    document.getElementById('payrollFinalBtn')?.addEventListener('click', handlers.onFinal);
  }
  ['empViewBase', 'empViewAllowance', 'empViewNpwp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) bindRupiah(el);
  });
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