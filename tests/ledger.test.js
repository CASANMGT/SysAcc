import { describe, it, expect } from 'vitest';
import {
  accountForPayment, expenseAccountFor, getAccounts, setCustomAccounts,
  REVENUE_ACCOUNT, AR_ACCOUNT, AP_ACCOUNT, pphFinalForYear, PPH_THRESHOLD, suggestBankAccount, suggestBankAccountFull, BANK_RULE_PRESETS, parseCoaCsv
} from '../coa.js';
import {
  buildEntryJournal, buildLoanJournal, buildRepaymentJournal,
  buildTransferJournal, buildAdjustJournal, buildPayrollKasbonJournal, balances, findUnbalanced
} from '../journals.js';

// isLiabilityPayment tidak diekspor â€” cek via akun credit/paylater
import { ACCOUNTS } from '../coa.js';

function totals(j) {
  const d = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const c = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  return { d, c };
}

describe('coa maps', () => {
  it('cash â†’ aset, credit/paylater â†’ kewajiban', () => {
    expect(accountForPayment('cash')).toBe('1104');
    expect(accountForPayment('transfer')).toBe('1101');
    expect(accountForPayment('credit')).toBe('2109');
    expect(accountForPayment('paylater')).toBe('2110');
    expect(accountForPayment('ngawur')).toBe('1104');
  });
  it('kategori beban â†’ akun, custom â†’ 5199', () => {
    expect(expenseAccountFor('makanan')).toBe('5103');
    expect(expenseAccountFor('gaji-out')).toBe('6201');
    expect(expenseAccountFor('x-custom')).toBe('5199');
  });
  it('tipe akun benar', () => {
    const m = new Map(ACCOUNTS.map(a => [a.code, a.type]));
    expect(m.get('1201')).toBe('asset');
    expect(m.get('2102')).toBe('liability');
    expect(m.get('3101')).toBe('equity');
    expect(m.get('4101')).toBe('revenue');
    expect(m.get('5109')).toBe('expense');
  });
});

describe('saran akun COA untuk mutasi bank', () => {
  it('memetakan keterangan ke akun yang masuk akal', () => {
    expect(suggestBankAccount('TRANSFER GOJEK', 'out')).toBe('5104');
    expect(suggestBankAccount('SHOPEEFOOD', 'out')).toBe('5103');
    expect(suggestBankAccount('BIAYA ADM BANK', 'out')).toBe('6205');
    expect(suggestBankAccount('TARIK TUNAI ATM', 'out')).toBe('1104');
    expect(suggestBankAccount('PEMBAYARAN QRIS SETTLEMENT', 'in')).toBe('4101');
    expect(suggestBankAccount('BUNGA', 'in')).toBe('4190');
    expect(suggestBankAccount('BUNGA', 'out')).toBe('5113');
    expect(suggestBankAccount('SESUATU TAK DIKENAL', 'out')).toBe('5199');
    expect(suggestBankAccount('SESUATU TAK DIKENAL', 'in')).toBe('4192');
  });
  it('mesin saran: kata kunci terpanjang & batas kata menang', () => {
    expect(suggestBankAccountFull('GRABFOOD', 'out')).toMatchObject({ code: '5103', source: 'preset' });
    expect(suggestBankAccountFull('TRANSFER GRAB CAR', 'out').code).toBe('5104');
    expect(suggestBankAccountFull('SESUATU TAK DIKENAL', 'out')).toMatchObject({ code: '5199', source: 'default' });
  });
});

describe('parseCoaCsv', () => {
  it('parse kode;nama;kategori + deteksi bentrok bawaan', () => {
    const r = parseCoaCsv('1106; Bank Lainnya; Asset\n6201; Beban Iklan; Expense\n1101; Bentrok; Asset\nrusak', ['1101']);
    expect(r.accounts.map(a => a.code)).toEqual(['1106', '6201']);
    expect(r.accounts[0].type).toBe('asset');
    expect(r.accounts[1].type).toBe('expense');
    expect(r.collide.length).toBe(1);
    expect(r.skipped.length).toBe(1);
  });
  it('menerima pemisah koma & kategori Indonesia', () => {
    const r = parseCoaCsv('6202,Beban Promosi,Beban', []);
    expect(r.accounts[0]).toMatchObject({ code: '6202', name: 'Beban Promosi', type: 'expense' });
  });
});

describe('COA kas/bank & preset aturan', () => {
  it('punya akun e-wallet & bank', () => {
    const codes = getAccounts().map(a => a.code);
    ['1111', '1112', '1113', '1114', '1115', '1116'].forEach(c => expect(codes).toContain(c));
  });
  it('semua preset aturan menunjuk akun COA yang ada', () => {
    const codes = new Set(getAccounts().map(a => a.code));
    BANK_RULE_PRESETS.forEach(p => expect(codes.has(p.code)).toBe(true));
  });
});

describe('custom COA', () => {
  it('gabung + kategori custom kepakai', () => {
    setCustomAccounts([{ code: '5180', name: 'Beban Iklan', type: 'expense', category: 'iklan_adv' }]);
    expect(getAccounts().some(a => a.code === '5180')).toBe(true);
    expect(expenseAccountFor('iklan_adv')).toBe('5180');
    expect(expenseAccountFor('makanan')).toBe('5103');
    setCustomAccounts([]);
    expect(getAccounts().some(a => a.code === '5180')).toBe(false);
  });
});

describe('buildEntryJournal', () => {
  it('pemasukan: Dr Kas Cr Pendapatan', () => {
    const j = buildEntryJournal({ id: 'e1', date: '2026-09-01', type: 'income', category: 'gaji', payment: 'transfer', amount: 5000000 });
    expect(j).toBeTruthy();
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(j.lines.find(l => l.account === '1101').debit).toBe(5000000);
    expect(j.lines.find(l => l.account === REVENUE_ACCOUNT).credit).toBe(5000000);
  });
  it('pengeluaran: Dr Beban Cr Kas', () => {
    const j = buildEntryJournal({ id: 'e2', date: '2026-09-01', type: 'expense', category: 'makanan', payment: 'cash', amount: 50000 });
    expect(j.lines.find(l => l.account === '5103').debit).toBe(50000);
    expect(j.lines.find(l => l.account === '1104').credit).toBe(50000);
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
    expect(j.lines.find(l => l.account === '1105').credit).toBe(60000);
  });
  it('beli barang: masuk persediaan, sisa ke beban', () => {
    const j = buildEntryJournal(
      { id: 'e5', date: '2026-09-01', type: 'expense', category: 'belanja', payment: 'cash', amount: 550000 },
      { item: { qty: 10, unitCost: 50000, name: 'Gula' } }
    );
    expect(j.lines.find(l => l.account === '1105').debit).toBe(500000);
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(d).toBe(550000);
  });
  it('nominal rusak â†’ null', () => {
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
    expect(j.lines.find(l => l.account === '1101').debit).toBe(500000);
  });
  it('dibalikin: Dr Kas Cr Piutang', () => {
    const j = buildRepaymentJournal(
      { id: 'l1', direction: 'given', person: 'Budi' },
      { id: 'r1', amount: 200000, date: '2026-09-05', payment: 'cash' }
    );
    expect(j.lines.find(l => l.account === AR_ACCOUNT).credit).toBe(200000);
  });
  it('pelunasan berbunga given â†’ bunga masuk Pendapatan Bunga 4102 (B7)', () => {
    const j = buildRepaymentJournal(
      { id: 'l1', direction: 'given', person: 'Budi', amount: 1000000, interestRate: 10 },
      { id: 'r1', amount: 550000, date: '2026-09-05', payment: 'cash' }
    );
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(j.lines.find(l => l.account === AR_ACCOUNT).credit).toBe(500000);
    expect(j.lines.find(l => l.account === '4190').credit).toBe(50000);
  });
  it('pelunasan berbunga taken â†’ bunga masuk Beban Bunga 5113 (B7)', () => {
    const j = buildRepaymentJournal(
      { id: 'l2', direction: 'taken', person: 'Ani', amount: 1000000, interestRate: 10 },
      { id: 'r2', amount: 1100000, date: '2026-09-05', payment: 'transfer' }
    );
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(j.lines.find(l => l.account === AP_ACCOUNT).debit).toBe(1000000);
    expect(j.lines.find(l => l.account === '5113').debit).toBe(100000);
  });
});

describe('purchase journals', () => {
  it('beli: Dr Persediaan Cr Hutang Usaha', async () => {
    const { buildPurchaseJournal, buildPurchasePayJournal } = await import('../journals.js');
    const j = buildPurchaseJournal({ amount: 500000, date: '2026-09-01', memo: 'Beli' });
    expect(j.lines.find(l => l.account === '1105').debit).toBe(500000);
    expect(j.lines.find(l => l.account === '2102').credit).toBe(500000);
    const p = buildPurchasePayJournal({ amount: 200000, date: '2026-09-02', payment: 'transfer', memo: 'Bayar' });
    expect(p.lines.find(l => l.account === '2102').debit).toBe(200000);
    expect(p.lines.find(l => l.account === '1101').credit).toBe(200000);
  });
  it('bayar jasa: PPh 23 dipotong (Dr Hutang penuh, Cr Kas net, Cr 2107)', async () => {
    const { buildPurchasePayJournal } = await import('../journals.js');
    const j = buildPurchasePayJournal({
      amount: 200000, date: '2026-09-03', payment: 'transfer', memo: 'Bayar jasa',
      withhold: { type: '23', amount: 4000 }
    });
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(j.lines.find(l => l.account === '2102').debit).toBe(200000);
    expect(j.lines.find(l => l.account === '1101').credit).toBe(196000);
    expect(j.lines.find(l => l.account === '2104').credit).toBe(4000);
  });
  it('pemotongan >= nominal â†’ fallthrough penuh (tanpa 2107)', async () => {
    const { buildPurchasePayJournal } = await import('../journals.js');
    const j = buildPurchasePayJournal({
      amount: 3000, date: '2026-09-03', payment: 'cash', memo: 'X',
      withhold: { type: '23', amount: 3000 }
    });
    expect(j.lines.find(l => l.account === '2104')).toBeUndefined();
    expect(j.lines.find(l => l.account === '1104').credit).toBe(3000);
  });
});

describe('opening balance', () => {
  it('pincang â†’ null; seimbang â†’ jurnal ref opening', async () => {
    const { buildOpeningJournal } = await import('../journals.js');
    expect(buildOpeningJournal({ date: '2026-01-01' }, [{ account: '1101', debit: 1000000, credit: 0 }])).toBeNull();
    const j = buildOpeningJournal({ date: '2026-01-01' }, [
      { account: '1101', debit: 1000000, credit: 0 },
      { account: '1510', debit: 5000000, credit: 0 },
      { account: '3101', debit: 0, credit: 6000000 },
    ]);
    const { d, c } = totals(j);
    expect(d).toBe(6000000);
    expect(c).toBe(6000000);
    expect(j.ref).toBe('opening');
    expect(j.lines.every(l => l.memo === 'Saldo awal')).toBe(true);
  });
});

describe('transfer & adjust', () => {  it('transfer antar kas', () => {
    const j = buildTransferJournal({ fromPayment: 'cash', toPayment: 'transfer', amount: 1000000, date: '2026-09-01' });
    expect(j.lines.find(l => l.account === '1101').debit).toBe(1000000);
    expect(j.lines.find(l => l.account === '1104').credit).toBe(1000000);
  });
  it('kas sama â†’ null', () => {
    expect(buildTransferJournal({ fromPayment: 'cash', toPayment: 'cash', amount: 1, date: '2026-09-01' })).toBeNull();
  });
  it('opname tambah persediaan', () => {
    const j = buildAdjustJournal({ account: '1105', amount: 50000, date: '2026-09-01', memo: 'Opname', increase: true });
    expect(j.lines.find(l => l.account === '1105').debit).toBe(50000);
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
    expect(b['1104'].debit - b['1104'].credit).toBe(800000);
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

describe('pphFinalForYear (PP 23/2018)', () => {
  it('omzet â‰¤ Rp4,8 M â†’ berhak, 0,5%', () => {
    const r = pphFinalForYear(1000000000);
    expect(r.eligible).toBe(true);
    expect(r.pph).toBe(5000000);
  });
  it('omzet > Rp4,8 M â†’ tidak berhak, PPh 0', () => {
    const r = pphFinalForYear(PPH_THRESHOLD + 1);
    expect(r.eligible).toBe(false);
    expect(r.pph).toBe(0);
  });
});

describe('buildPayrollKasbonJournal (kasbon potong gaji)', () => {
  it('Dr Beban Gaji 5110 / Cr Piutang 1201 (bukan kas masuk)', () => {
    const j = buildPayrollKasbonJournal({ person: 'Budi' }, 500000, '2026-08-31', 'Kasbon Budi');
    const { d, c } = totals(j);
    expect(d).toBe(c);
    expect(j.lines.find(l => l.account === '6201').debit).toBe(500000);
    expect(j.lines.find(l => l.account === AR_ACCOUNT).credit).toBe(500000);
    expect(j.lines.some(l => l.account === '1101' || l.account === '1101')).toBe(false);
  });
  it('nominal 0 â†’ null', () => {
    expect(buildPayrollKasbonJournal({ person: 'Budi' }, 0, '2026-08-31')).toBe(null);
  });
});


