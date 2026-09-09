// journals.js — Jurnal double-entry murni (tanpa DOM/storage).
// Setiap builder return objek jurnal { id, date, memo, ref, refId, lines[] }
// dengan total debit == total kredit. Storage menyimpan & memposting.

import {
  accountForPayment, expenseAccountFor, REVENUE_ACCOUNT,
  AR_ACCOUNT, AP_ACCOUNT, INVENTORY_ACCOUNT, COGS_ACCOUNT,
  PPN_OUT, PPN_IN, PPN_RATE
} from './coa.js';

let seq = 0;
function jid(prefix) {
  seq += 1;
  return `${prefix || 'J'}-${Date.now().toString(36)}-${seq}`;
}

function balanced(lines) {
  const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  return Math.abs(d - c) < 0.005 && d > 0;
}

function splitPPN(gross) {
  const dpp = Math.round(gross / (1 + PPN_RATE));
  return { dpp, ppn: gross - dpp };
}

// Entry biasa (non-loan). Opsi: ppn(true/false), item(counter akun persediaan/HPP).
// item: { itemId, qty, avgCost } untuk jual (HPP) atau beli (persediaan).
export function buildEntryJournal(entry, opts = {}) {
  const amt = Math.round(Number(entry.amount) || 0);
  if (!isFinite(amt) || amt <= 0) return null;
  const cash = accountForPayment(entry.payment || 'cash');
  const memo = entry.description || entry.category || 'Transaksi';
  const lines = [];
  if (entry.type === 'income') {
    if (opts.ppn) {
      const { dpp, ppn } = splitPPN(amt);
      lines.push({ account: cash, debit: amt, credit: 0, memo });
      lines.push({ account: REVENUE_ACCOUNT, debit: 0, credit: dpp, memo });
      lines.push({ account: PPN_OUT, debit: 0, credit: ppn, memo });
    } else {
      lines.push({ account: cash, debit: amt, credit: 0, memo });
      lines.push({ account: REVENUE_ACCOUNT, debit: 0, credit: amt, memo });
    }
    const cogsLines = [];
    if (opts.item && opts.item.qty > 0 && opts.item.avgCost > 0) {
      cogsLines.push({ qty: opts.item.qty, avgCost: opts.item.avgCost, name: opts.item.name });
    }
    (opts.saleLines || []).forEach(sl => {
      if (sl && sl.qty > 0 && sl.avgCost > 0) cogsLines.push(sl);
    });
    const cogs = cogsLines.reduce((s, sl) => s + Math.round(sl.qty * sl.avgCost), 0);
    if (cogs > 0) {
      lines.push({ account: COGS_ACCOUNT, debit: cogs, credit: 0, memo: 'HPP penjualan' });
      lines.push({ account: INVENTORY_ACCOUNT, debit: 0, credit: cogs, memo: 'HPP penjualan' });
    }
  } else {
    const exp = expenseAccountFor(entry.category);
    if (opts.ppn) {
      const { dpp, ppn } = splitPPN(amt);
      lines.push({ account: exp, debit: dpp, credit: 0, memo });
      lines.push({ account: PPN_IN, debit: ppn, credit: 0, memo });
      lines.push({ account: cash, debit: 0, credit: amt, memo });
    } else if (opts.item && opts.item.qty > 0 && opts.item.unitCost > 0) {
      // Beli barang → persediaan (bukan beban)
      const cost = Math.round(opts.item.qty * opts.item.unitCost);
      lines.push({ account: INVENTORY_ACCOUNT, debit: cost, credit: 0, memo: `Beli ${opts.item.name || ''}`.trim() });
      lines.push({ account: cash, debit: 0, credit: cost, memo });
      const rest = amt - cost;
      if (rest > 0) {
        lines.push({ account: exp, debit: rest, credit: 0, memo });
        lines.push({ account: cash, debit: 0, credit: rest, memo });
      }
    } else {
      lines.push({ account: exp, debit: amt, credit: 0, memo });
      lines.push({ account: cash, debit: 0, credit: amt, memo });
    }
  }
  const j = { id: jid('J'), date: entry.date, memo, ref: 'entry', refId: entry.id || null, lines };
  return balanced(lines) ? j : null;
}

// Pinjaman baru: given → Dr Piutang Cr Kas; taken → Dr Kas Cr Hutang.
export function buildLoanJournal(loan) {
  const amt = Math.round(Number(loan.amount) || 0);
  if (!isFinite(amt) || amt <= 0) return null;
  const cash = accountForPayment(loan.payment || 'cash');
  const memo = `Pinjaman ${loan.person || ''}`.trim();
  const lines = loan.direction === 'given'
    ? [
      { account: AR_ACCOUNT, debit: amt, credit: 0, memo },
      { account: cash, debit: 0, credit: amt, memo },
    ]
    : [
      { account: cash, debit: amt, credit: 0, memo },
      { account: AP_ACCOUNT, debit: 0, credit: amt, memo },
    ];
  const j = { id: jid('J'), date: loan.date, memo, ref: 'loan', refId: loan.id || null, lines };
  return balanced(lines) ? j : null;
}

// Pelunasan: given (diterima) → Dr Kas Cr Piutang; taken (dibayar) → Dr Hutang Cr Kas.
// Bunga ikut tertagih: porsi bunga = proporsional dari total.
export function buildRepaymentJournal(loan, repayment) {
  const amt = Math.round(Number(repayment.amount) || 0);
  if (!isFinite(amt) || amt <= 0) return null;
  const cash = accountForPayment(repayment.payment || loan.payment || 'cash');
  const memo = `Bayar ${loan.person || ''}`.trim();
  const lines = loan.direction === 'given'
    ? [
      { account: cash, debit: amt, credit: 0, memo },
      { account: AR_ACCOUNT, debit: 0, credit: amt, memo },
    ]
    : [
      { account: AP_ACCOUNT, debit: amt, credit: 0, memo },
      { account: cash, debit: 0, credit: amt, memo },
    ];
  const j = { id: jid('J'), date: repayment.date, memo, ref: 'repayment', refId: repayment.id || null, lines };
  return balanced(lines) ? j : null;
}

// Transfer antar kas: Dr Kas-Tujuan Cr Kas-Asal.
export function buildTransferJournal({ fromPayment, toPayment, amount, date, memo }) {
  const amt = Math.round(Number(amount) || 0);
  if (!isFinite(amt) || amt <= 0) return null;
  const from = accountForPayment(fromPayment);
  const to = accountForPayment(toPayment);
  if (from === to) return null;
  const m = memo || 'Transfer kas';
  const lines = [
    { account: to, debit: amt, credit: 0, memo: m },
    { account: from, debit: 0, credit: amt, memo: m },
  ];
  const j = { id: jid('J'), date, memo: m, ref: 'transfer', refId: null, lines };
  return balanced(lines) ? j : null;
}

// Penyesuaian stok/opname & selisih kas: Dr/Cr Persediaan atau Kas vs Beban Lainnya.
export function buildAdjustJournal({ account, amount, date, memo, increase }) {
  const amt = Math.round(Number(amount) || 0);
  if (!isFinite(amt) || amt <= 0) return null;
  const m = memo || 'Penyesuaian';
  const lines = increase
    ? [
      { account, debit: amt, credit: 0, memo: m },
      { account: '5199', debit: 0, credit: amt, memo: m },
    ]
    : [
      { account: '5199', debit: amt, credit: 0, memo: m },
      { account, debit: 0, credit: amt, memo: m },
    ];
  const j = { id: jid('J'), date, memo: m, ref: 'adjust', refId: null, lines };
  return balanced(lines) ? j : null;
}

// Saldo per akun (opt: {start, end} filter tanggal). Return { code: {debit, credit} }.
export function balances(journals, range = {}) {
  const out = {};
  (journals || []).forEach(j => {
    if (!j || !Array.isArray(j.lines)) return;
    if (range.start && String(j.date || '') < String(range.start)) return;
    if (range.end && String(j.date || '') > String(range.end)) return;
    j.lines.forEach(l => {
      if (!l || !l.account) return;
      if (!out[l.account]) out[l.account] = { debit: 0, credit: 0 };
      out[l.account].debit += Number(l.debit) || 0;
      out[l.account].credit += Number(l.credit) || 0;
    });
  });
  return out;
}

// Cek semua jurnal balance. Return array id bermasalah.
export function findUnbalanced(journals) {
  const bad = [];
  (journals || []).forEach(j => {
    const d = (j.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const c = (j.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
    if (!(Math.abs(d - c) < 0.005 && d > 0)) bad.push(j.id);
  });
  return bad;
}
