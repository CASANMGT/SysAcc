// @vitest-environment jsdom
// Smoke test render: pastikan refactor modul tidak merusak output DOM.
import { describe, it, expect, beforeAll } from 'vitest';

const IDS = [
  'entriesBody', 'emptyState', 'totalIncome', 'totalExpense', 'netBalance',
  'categoryList', 'entryModal', 'entryForm', 'modalTitle', 'entryId', 'entryDate',
  'entryType', 'entryCategory', 'customCategory', 'entryDescription', 'entryAmount',
  'entryLoanId', 'entryLoanMode', 'loanFieldsGroup', 'entryLoanPerson', 'entryLoanDue',
  'loanTypeGroup', 'installmentGroup', 'entryInstallment', 'entryLoanType',
  'entryInstallmentAmount', 'contactTypeGroup', 'entryContactType', 'reportModal',
  'reportContent', 'closeReportBtn', 'customDateModal', 'customStartDate', 'customEndDate',
  'customDateClose', 'customDateCancel', 'customDateApply', 'typeGroup', 'categoryGroup',
  'paymentGroup', 'entryPayment', 'loansModal', 'loanList', 'totalPiutang', 'totalHutang',
  'loanNet', 'dashPiutangVal', 'dashHutangVal', 'repayModal', 'repayForm', 'repayLoanId',
  'repayAmount', 'repayPayment', 'repayPaymentDetail', 'repayDate', 'repayDesc',
  'searchInput', 'searchResultsCount', 'toastContainer', 'arusKasChart', 'chartMonths',
  'chartTotalMasuk', 'chartRata', 'chartGrowth', 'donutTotal', 'donutLegend',
  'donutEmpty', 'donutArc', 'arusRange', 'arusToggle'
];

let UI, Charts;

beforeAll(async () => {
  document.body.innerHTML = IDS.map(id =>
    id === 'arusKasChart'
      ? `<svg id="${id}"></svg>`
      : `<div id="${id}"></div>`
  ).join('') + '<button class="report-tab" data-report="monthly"></button>';
  UI = await import('../ui.js');
  Charts = await import('../charts.js');
});

const entry = (over = {}) => ({
  id: 'e1', date: '2026-08-10', type: 'expense', category: 'makanan',
  payment: 'cash', paymentDetail: '', description: 'Bakso', amount: 25000,
  person: '', loanId: null, ...over
});

describe('renderEntries', () => {
  it('tampilkan baris + nominal', () => {
    UI.renderEntries([entry(), entry({ id: 'e2', type: 'income', category: 'gaji', amount: 5000000, description: 'Gaji' })]);
    const html = document.getElementById('entriesBody').innerHTML;
    expect(html).toMatch(/Bakso/);
    expect(html).toMatch(/25/);
    expect(html).toMatch(/receipt-btn/);
  });
  it('kosong → empty state', () => {
    UI.renderEntries([]);
    expect(document.getElementById('emptyState').classList.contains('hidden')).toBe(false);
  });
});

describe('renderLoans', () => {
  const loan = {
    id: 'l1', direction: 'given', contactType: 'person', loanType: 'cicilan',
    installmentAmount: 275000, person: 'Budi', amount: 3000000,
    date: '2026-01-15', dueDate: '', description: '', status: 'active',
    interestRate: 10
  };
  const summary = { piutangOutstanding: 2750000, hutangOutstanding: 0, net: 2750000, piutangCount: 1, hutangCount: 0 };
  it('kartu + jadwal cicilan', () => {
    UI.renderLoans([loan], [{ id: 'r1', loanId: 'l1', amount: 250000, date: '2026-02-15' }], summary, [loan]);
    const html = document.getElementById('loanList').innerHTML;
    expect(html).toMatch(/Budi/);
    expect(html).toMatch(/Ke-1\/12/);
    expect(html).toMatch(/Sudah/);
    expect(html).toMatch(/Sekarang/);
    expect(html).toMatch(/Sisa:/);
    expect(html).toMatch(/Bunga 10%/);
  });
  it('lewat jadwal → hitungan dijepit (2/2, bukan 3/2)', () => {
    const l = {
      id: 'l3', direction: 'taken', contactType: 'person', loanType: 'cicilan',
      installmentAmount: 500000, person: 'Ani', amount: 1000000,
      date: '2026-01-15', dueDate: '', description: '', status: 'active', interestRate: 0
    };
    const few = [
      { id: 'a', loanId: 'l3', amount: 100000, date: '2026-02-15' },
      { id: 'b', loanId: 'l3', amount: 100000, date: '2026-03-15' },
      { id: 'c', loanId: 'l3', amount: 100000, date: '2026-04-15' },
    ];
    UI.renderLoans([l], few, { piutangOutstanding: 0, hutangOutstanding: 700000, net: -700000, piutangCount: 0, hutangCount: 1 }, [l]);
    const html = document.getElementById('loanList').innerHTML;
    expect(html).toMatch(/2\/2 kali/);
    expect(html).not.toMatch(/3\/2/);
    expect(html).not.toMatch(/ke-4\/2/);
  });
  it('lunas → badge Lunas, tanpa tombol bayar', () => {
    const paid = { ...loan, id: 'l2', status: 'paid' };
    UI.renderLoans([paid], [], { ...summary, piutangOutstanding: 0 }, [paid]);
    const html = document.getElementById('loanList').innerHTML;
    expect(html).toMatch(/Lunas/);
    expect(html).not.toMatch(/pay-next-btn/);
  });
});

describe('charts', () => {
  const data = [
    { date: '2026-06-05', type: 'income', category: 'gaji', amount: 5000000 },
    { date: '2026-07-05', type: 'income', category: 'gaji', amount: 6000000 },
    { date: '2026-07-10', type: 'expense', category: 'makanan', amount: 500000 },
  ];
  it('arus kas render SVG', () => {
    Charts.renderArusKasChart(data, { range: 6, show: { income: true, expense: true } });
    const svg = document.getElementById('arusKasChart').innerHTML;
    expect(svg).toMatch(/path|circle/);
    expect(document.getElementById('chartGrowth').textContent).toMatch(/%/);
    expect(svg).toMatch(/var\(--chart-income/);
    expect(svg).toMatch(/var\(--chart-grid/);
  });
  it('arus kas kosong → pesan', () => {
    Charts.renderArusKasChart([], { range: 6, show: { income: true, expense: true } });
    expect(document.getElementById('arusKasChart').innerHTML).toMatch(/Belum ada data/);
  });
  it('donut render legenda', () => {
    Charts.renderDonut([{ type: 'expense', category: 'makanan', total: 500000, count: 1 }]);
    expect(document.getElementById('donutLegend').innerHTML).toMatch(/makanan/i);
  });
});

describe('toast', () => {
  it('undo toast ada tombol Urungkan', () => {
    let undone = false;
    UI.showUndoToast('x dihapus', () => { undone = true; });
    const btn = document.querySelector('.toast-undo');
    expect(btn).toBeTruthy();
    btn.click();
    expect(undone).toBe(true);
  });
});
