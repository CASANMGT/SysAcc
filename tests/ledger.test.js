import { describe, it, expect } from 'vitest';
import {
  accountForPayment, expenseAccountFor, getAccounts, setCustomAccounts,
  REVENUE_ACCOUNT, AR_ACCOUNT, AP_ACCOUNT
} from '../coa.js';
import {
  buildEntryJournal, buildLoanJournal, buildRepaymentJournal,
  buildTransferJournal, buildAdjustJournal, balances, findUnbalanced
} from '../journals.js';

// isLiabilityPayment tidak diekspor — cek via akun credit/paylater
import { ACCOUNTS } from '../coa.js';

function totals(j) {
  const d = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  return { d, c };
}

describe('coa maps', () => {
  it('cash → aset, credit/paylater → kewajiban', () => {
    expect(accountForPayment('cash')).toBe('1101');
    expect(accountForPayment('transfer')).toBe('1102');
    expect(accountForPayment('credit')).toBe('2101');
    expect(accountForPayment('paylater')).toBe('2102');
    expect(accountForPayment('ngawur')).toBe('1101');
  });
  it('kategori beban → akun, custom → 5199', () => {
    expect(expenseAccountFor('makanan')).toBe('5103');
    expect(expenseAccountFor('gaji-out')).toBe('5110');
    expect(expenseAccountFor('x-custom')).toBe('5199');
  });
  it('tipe akun benar', () => {
    const m = new Map(ACCOUNTS.map(a => [a.code, a.type]));
    expect(m.get('1201')).toBe('asset');
    expect(m.get('2103')).toBe('liability');
    expect(m.get('3101')).toBe('equity');
    expect(m.get('4101')).toBe('revenue');
    expect(m.get('5109')).toBe('expense');
  });
});

describe('custom COA', () => {
  it('gabung + kategori custom kepakai', () => {
    setCustomAccounts([{ code: '5120', name: 'Beban Iklan', type: 'expense', category: 'iklan' }]);
    expect(getAccounts().some(a => a.code === '5120')).toBe(true);
    expect(expenseAccountFor('iklan')).toBe('5120');
    expect(expenseAccountFor('makanan')).toBe('5103');
    setCustomAccounts([]);
    expect(getAccounts().some(a => a.code === '5120')).toBe(false);
  });
});

describe('buildEntryJournal', () => {
  it('pemasukan: Dr Kas Cr Pendapatan', () => {
    const j = buildEntryJournal({ id: 'e1', date: '2026-09-01', type: 'income', category: 'gaji', payment: 'transfer', amount: 5000000 });
    expect(j).toBeTruthy();
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(j.lines.find(l => l.account === '1102').debit).toBe(5000000);
    expect(j.lines.find(l => l.account === REVENUE_ACCOUNT).credit).toBe(5000000);
  });
  it('pengeluaran: Dr Beban Cr Kas', () => {
    const j = buildEntryJournal({ id: 'e2', date: '2026-09-01', type: 'expense', category: 'makanan', payment: 'cash', amount: 50000 });
    expect(j.lines.find(l => l.account === '5103').debit).toBe(50000);
    expect(j.lines.find(l => l.account === '1101').credit).toBe(50000);
  });
  it('PPN split: DPP + 11%', () => {
    const j = buildEntryJournal({ id: 'e3', date: '2026-09-01', type: 'income', category: 'gaji', payment: 'cash', amount: 111000 }, { ppn: true });
    const rev = j.lines.find(l => l.account === REVENUE_ACCOUNT);
    const ppn = j.lines.find(l => l.account === '2105');
    expect(rev.credit).toBe(100000);
    expect(ppn.credit).toBe(11000);
    const { d, c } = totals(j);
    expect(d).toBe(c);
  });
  it('jual barang: + HPP & kurangi persediaan', () => {
    const j = buildEntryJournal(
      { id: 'e4', date: '2026-09-01', type: 'income', category: 'gaji', payment: 'cash', amount: 100000 },
      { item: { qty: 2, avgCost: 30000, name: 'Kopi' } }
    );
    expect(j.lines.find(l => l.account === '5109').debit).toBe(60000);
    expect(j.lines.find(l => l.account === '1301').credit).toBe(60000);
  });
  it('beli barang: masuk persediaan, sisa ke beban', () => {
    const j = buildEntryJournal(
      { id: 'e5', date: '2026-09-01', type: 'expense', category: 'belanja', payment: 'cash', amount: 550000 },
      { item: { qty: 10, unitCost: 50000, name: 'Gula' } }
    );
    expect(j.lines.find(l => l.account === '1301').debit).toBe(500000);
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(d).toBe(550000);
  });
  it('nominal rusak → null', () => {
    expect(buildEntryJournal({ amount: 0 })).toBeNull();
    expect(buildEntryJournal({ amount: -5 })).toBeNull();
  });
  it('jualan multi-baris: HPP gabungan', () => {
    const j = buildEntryJournal(
      { id: 'e9', date: '2026-09-01', type: 'income', category: 'jualan', payment: 'transfer', amount: 100000 },
      { saleLines: [{ qty: 2, avgCost: 20000, name: 'A' }, { qty: 1, avgCost: 30000, name: 'B' }] }
    );
    expect(j.lines.find(l => l.account === '5109').debit).toBe(70000);
    const { d, c } = totals(j);
    expect(d).toBe(c);
  });
});

describe('buildLoanJournal / buildRepaymentJournal', () => {
  it('kasih pinjam: Dr Piutang Cr Kas', () => {
    const j = buildLoanJournal({ id: 'l1', direction: 'given', person: 'Budi', amount: 1000000, date: '2026-09-01', payment: 'cash' });
    expect(j.lines.find(l => l.account === AR_ACCOUNT).debit).toBe(1000000);
  });
  it('pinjam uang: Dr Kas Cr Hutang', () => {
    const j = buildLoanJournal({ id: 'l2', direction: 'taken', person: 'Ani', amount: 500000, date: '2026-09-01', payment: 'transfer' });
    expect(j.lines.find(l => l.account === AP_ACCOUNT).credit).toBe(500000);
    expect(j.lines.find(l => l.account === '1102').debit).toBe(500000);
  });
  it('dibalikin: Dr Kas Cr Piutang', () => {
    const j = buildRepaymentJournal(
      { id: 'l1', direction: 'given', person: 'Budi' },
      { id: 'r1', amount: 200000, date: '2026-09-05', payment: 'cash' }
    );
    expect(j.lines.find(l => l.account === AR_ACCOUNT).credit).toBe(200000);
  });
});

describe('purchase journals', () => {
  it('beli: Dr Persediaan Cr Hutang Usaha', async () => {
    const { buildPurchaseJournal, buildPurchasePayJournal } = await import('../journals.js');
    const j = buildPurchaseJournal({ amount: 500000, date: '2026-09-01', memo: 'Beli' });
    expect(j.lines.find(l => l.account === '1301').debit).toBe(500000);
    expect(j.lines.find(l => l.account === '2103').credit).toBe(500000);
    const p = buildPurchasePayJournal({ amount: 200000, date: '2026-09-02', payment: 'transfer', memo: 'Bayar' });
    expect(p.lines.find(l => l.account === '2103').debit).toBe(200000);
    expect(p.lines.find(l => l.account === '1102').credit).toBe(200000);
  });
});

describe('transfer & adjust', () => {
  it('transfer antar kas', () => {
    const j = buildTransferJournal({ fromPayment: 'cash', toPayment: 'transfer', amount: 1000000, date: '2026-09-01' });
    expect(j.lines.find(l => l.account === '1102').debit).toBe(1000000);
    expect(j.lines.find(l => l.account === '1101').credit).toBe(1000000);
  });
  it('kas sama → null', () => {
    expect(buildTransferJournal({ fromPayment: 'cash', toPayment: 'cash', amount: 1, date: '2026-09-01' })).toBeNull();
  });
  it('opname tambah persediaan', () => {
    const j = buildAdjustJournal({ account: '1301', amount: 50000, date: '2026-09-01', memo: 'Opname', increase: true });
    expect(j.lines.find(l => l.account === '1301').debit).toBe(50000);
    expect(j.lines.find(l => l.account === '5199').credit).toBe(50000);
  });
});

describe('balances & findUnbalanced', () => {
  const js = [
    buildEntryJournal({ id: 'e1', date: '2026-09-01', type: 'income', category: 'gaji', payment: 'cash', amount: 1000000 }),
    buildEntryJournal({ id: 'e2', date: '2026-09-02', type: 'expense', category: 'makanan', payment: 'cash', amount: 200000 }),
  ];
  it('saldo akun benar', () => {
    const b = balances(js);
    expect(b['1101'].debit - b['1101'].credit).toBe(800000);
    expect(b[REVENUE_ACCOUNT].credit).toBe(1000000);
  });
  it('filter rentang tanggal', () => {
    const b = balances(js, { start: '2026-09-02', end: '2026-09-02' });
    expect(b['1101']?.debit || 0).toBe(0);
    expect(b['5103']?.debit || 0).toBe(200000);
  });
  it('deteksi jurnal pincang', () => {
    expect(findUnbalanced(js)).toEqual([]);
    expect(findUnbalanced([{ id: 'x', lines: [{ account: '1101', debit: 1, credit: 0 }] }])).toEqual(['x']);
  });
});
