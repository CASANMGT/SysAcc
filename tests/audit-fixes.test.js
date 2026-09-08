// @vitest-environment jsdom
// Regression tests untuk temuan audit: XSS kategori, summary guard,
// preset nominal repay, submit tanpa crash.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { sanitizeCategory } from '../storage.js';
import { computeLoanSummary } from '../reports.js';

describe('sanitizeCategory', () => {
  it('buang karakter HTML', () => {
    expect(sanitizeCategory('"><img src=x onerror=alert(1)>')).toBe('img src=x onerror=alert(1)');
    expect(sanitizeCategory('makanan & minuman')).toBe('makanan  minuman');
    expect(sanitizeCategory('  kos  ')).toBe('kos');
    expect(sanitizeCategory(null)).toBe('');
  });
});

describe('computeLoanSummary guard', () => {
  it('input rusak → objek nol (bukan array)', () => {
    const s = computeLoanSummary(null, null);
    expect(s.piutangOutstanding).toBe(0);
    expect(s.net).toBe(0);
  });
});

describe('repay preset di input number', () => {
  let UI;
  beforeAll(async () => {
    document.body.innerHTML = `
      <div id="repayModalTitle"></div>
      <form id="repayForm"><input type="hidden" id="repayLoanId">
      <input type="number" id="repayAmount">
      <select id="repayPayment"><option value="cash">Tunai</option></select>
      <input type="text" id="repayPaymentDetail">
      <input type="date" id="repayDate">
      <input type="text" id="repayDesc"></form>
      <div id="repayModal"></div>
      <div id="repaySummary"></div>
      <div id="repayCicilanWrap"><div id="repayCicilanChips"></div><div id="repayCicilanHint"></div></div>
      <div id="toastContainer"></div>`;
    // anggap modal sudah terbuka → lewati showModal jsdom
    document.getElementById('repayModal').open = true;
    UI = await import('../ui.js');
  });
  beforeEach(() => { localStorage.clear(); });
  it('preset 250000 tampil (tidak diblank browser)', () => {
    UI.openRepayModal('l1', 750000, 250000, 'Bayar', {
      total: 1000000, paid: 250000, paidCount: 1, tenor: 4, instAmt: 250000, direction: 'taken'
    });
    expect(document.getElementById('repayAmount').value).toBe('250000');
  });
});
