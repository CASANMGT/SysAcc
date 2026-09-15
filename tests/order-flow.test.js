// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { findUnbalanced } from '../journals.js';
import {
  createCreditSale, getCreditSaleById, creditOutstanding, payCreditSale,
  shipCreditSale, trackCreditOrder,
  createPreorder, getPreorderById, preorderBalance, preorderPaidTotal, preorderCostTotal, preorderProfit,
  payPreorder, addPreorderCost, settlePreorder, trackPreorder,
  getAllJournals, setActor
} from '../storage.js';

beforeEach(() => {
  localStorage.clear();
  setActor({ role: 'owner', user: 't' });
});

describe('alur pesanan — uji fungsi end-to-end', () => {
  it('JUAL alur pesanan: dibuat → DP → dikirim → diterima → invoice → lunas', () => {
    const cs = createCreditSale({
      date: '2026-09-01', dueDate: '2026-10-01', customer: 'PT Maju',
      lines: [{ itemId: '', name: 'iPhone Case', qty: 2, price: 100000, avgCost: 60000 }],
      discount: 20000, deposit: 50000, flow: 'order'
    });
    expect(cs.stage).toBe('dp_paid');
    expect(cs.total).toBe(180000);
    expect(cs.timeline.length).toBeGreaterThanOrEqual(2);
    expect(creditOutstanding(cs)).toBe(130000);

    shipCreditSale(cs.id, { courier: 'JNT', tracking: 'JNT1', date: '2026-09-02' });
    expect(getCreditSaleById(cs.id).stage).toBe('shipped');

    trackCreditOrder(cs.id, { stage: 'invoiced', date: '2026-09-03', note: 'kirim invoice', schedule: '2026-09-10' });
    expect(getCreditSaleById(cs.id).stage).toBe('invoiced');

    payCreditSale(cs.id, { amount: 130000, date: '2026-09-05', payment: 'transfer' });
    const fin = getCreditSaleById(cs.id);
    expect(fin.stage).toBe('done');
    expect(fin.status).toBe('paid');
    expect(creditOutstanding(fin)).toBe(0);
    expect(findUnbalanced(getAllJournals()).length).toBe(0);
  });

  it('TITIP BELI: DP → beli China → China→Indo → gudang → kirim → invoice → settle', () => {
    const po = createPreorder({ date: '2026-09-01', customer: 'Andi', items: [{ name: 'Polytron A', qty: 1, price: 200000 }], deposit: 50000, months: 1, discount: 10000 });
    expect(po.stage).toBe('dp_paid');
    expect(po.sellTotal).toBe(190000);
    expect(po.payments.length).toBe(1);

    trackPreorder(po.id, { stage: 'shipped', tracking: 'CN88', date: '2026-09-05', note: 'beli agent' });
    let cur = getPreorderById(po.id);
    expect(cur.stage).toBe('shipping');
    expect(cur.shipment?.tracking).toBe('CN88');

    trackPreorder(po.id, { stage: 'to_indo', note: 'keluar gudang China', tracking: 'IND77' });
    trackPreorder(po.id, { stage: 'in_wh', note: 'tiba gudang Jkt' });
    trackPreorder(po.id, { stage: 'sent', tracking: 'ID99' });
    trackPreorder(po.id, { stage: 'invoiced', schedule: '2026-10-01' });
    cur = getPreorderById(po.id);
    expect(cur.stage).toBe('invoiced');
    expect(cur.shipment?.tracking).toBe('ID99');

    settlePreorder(po.id, { date: '2026-10-02', payment: 'cash' });
    const fin = getPreorderById(po.id);
    expect(fin.stage).toBe('settled');
    expect(preorderBalance(fin)).toBe(0);
    const paidSum = preorderPaidTotal(fin);
    if (paidSum !== 190000) console.log('PAYMENTS', JSON.stringify(fin.payments));
    expect(paidSum).toBe(190000);
    expect(findUnbalanced(getAllJournals()).length).toBe(0);
  });

  it('tolakan: trackPreorder done langsung; trackCreditOrder done saat belum lunas', () => {
    const po = createPreorder({ date: '2026-09-01', customer: 'X', items: [{ name: 'A', qty: 1, price: 1000 }] });
    expect(() => trackPreorder(po.id, { stage: 'done' })).toThrow();
    const cs = createCreditSale({
      date: '2026-09-01', dueDate: '2026-10-01', customer: 'Y',
      lines: [{ itemId: '', name: 'B', qty: 1, price: 5000, avgCost: 3000 }], deposit: 0, flow: 'order'
    });
    expect(() => trackCreditOrder(cs.id, { stage: 'done' })).toThrow(/lunas|Bayar/i);
  });

  it('payPreorder melebihi sisa ditolak; lolos profit = bayar - biaya', () => {
    const po = createPreorder({ date: '2026-09-01', customer: 'Y', items: [{ name: 'Z', qty: 1, price: 100000 }] });
    expect(() => payPreorder(po.id, { amount: 999999 })).toThrow(/sisa/i);
    addPreorderCost(po.id, { amount: 40000, kind: 'kirim' });
    addPreorderCost(po.id, { amount: 60000, kind: 'barang' });
    settlePreorder(po.id, {}, { payment: 'cash' });
    const fin = getPreorderById(po.id);
    expect(preorderCostTotal(fin)).toBe(100000);
    expect(preorderProfit(fin)).toBe(0);
  });
});
