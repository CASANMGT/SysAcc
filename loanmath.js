// loanmath.js — Matematika pinjaman murni (tanpa DOM), bisa di-test.
// Satu-satunya sumber kebenaran untuk tenor, outstanding, dan jadwal cicilan.

export function calcTenor(loan) {
  const instAmt = Number(loan && loan.installmentAmount) || 0;
  const amount = Number(loan && loan.amount) || 0;
  if (loan && loan.loanType === 'cicilan' && instAmt > 0 && amount > 0) {
    return Math.ceil(amount / instAmt);
  }
  return 1;
}

export function paidOf(repayments) {
  if (!Array.isArray(repayments)) return 0;
  return repayments.reduce((s, r) => s + (Number(r && r.amount) || 0), 0);
}

export function outstandingOf(loan, repayments) {
  const amount = Number(loan && loan.amount) || 0;
  return Math.max(amount - paidOf(repayments), 0);
}

export function nextInstallmentAmount(loan, repayments) {
  const instAmt = Number(loan && loan.installmentAmount) || 0;
  const out = outstandingOf(loan, repayments);
  if (instAmt > 0) return Math.min(instAmt, out);
  return out;
}

export function monthLabelId(date, withYear = true) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '';
  try {
    return d.toLocaleDateString('id-ID', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });
  } catch {
    return '';
  }
}

// Data jadwal cicilan 1..tenor: [{ n, monthLabel, amount, paid, isNext }]
export function scheduleData(loan, repayments) {
  const tenor = calcTenor(loan);
  const reps = Array.isArray(repayments) ? repayments : [];
  const paidCount = reps.length;
  const isPaid = loan && loan.status === 'paid';
  const instAmt = Number(loan && loan.installmentAmount) || 0;
  const base = new Date(loan && loan.date);
  const rows = [];
  let remaining = Number(loan && loan.amount) || 0;
  for (let i = 1; i <= tenor; i++) {
    const amt = i < tenor ? instAmt : Math.max(remaining, 0);
    const d = isNaN(base) ? new Date() : new Date(base);
    d.setMonth(d.getMonth() + (i - 1));
    rows.push({
      n: i,
      tenor,
      monthLabel: monthLabelId(d),
      amount: amt,
      paid: i <= paidCount,
      isNext: i === paidCount + 1 && !isPaid
    });
    remaining -= amt;
  }
  return rows;
}

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  d.setMonth(d.getMonth() + n);
  return d;
}

// Jatuh tempo berikutnya (turunan): cicilan → tanggal mulai + jumlah terbayar.
export function nextDue(loan, paidCount) {
  if (!loan || loan.status === 'paid') return null;
  if (loan.dueDate) {
    const base = new Date(loan.dueDate);
    if (isNaN(base)) return null;
    const d = new Date(base);
    if (loan.loanType === 'cicilan') d.setMonth(d.getMonth() + (paidCount || 0));
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (loan.loanType === 'cicilan') return addMonths(loan.date, paidCount || 0);
  const d = new Date(loan.date);
  return isNaN(d) ? null : d;
}
