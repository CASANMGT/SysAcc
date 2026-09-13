// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  parseDelimited, autoMapColumns, autoMapProductColumns, parseNum, parseDate,
  buildOrders, buildProducts, resolveOrders, parseWaOrder,
} from '../marketplace.js';

const items = [
  { id: 'i1', name: 'Kopi Susu', sku: 'KOPI-1', price: 20000, cost: 12000, stock: 10 },
  { id: 'i2', name: 'Teh Manis', sku: 'TEH-1', price: 8000, cost: 4000, stock: 10 },
];

describe('parseDelimited', () => {
  it('koma + tanda kutip + newline', () => {
    const rows = parseDelimited('a,b\n"x,1",2\n');
    expect(rows).toEqual([['a', 'b'], ['x,1', '2']]);
  });
  it('deteksi titik-koma & tab', () => {
    expect(parseDelimited('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseNum / parseDate', () => {
  it('rupiah', () => {
    expect(parseNum('Rp15.000')).toBe(15000);
    expect(parseNum('15,000')).toBe(15000);
    expect(parseNum('')).toBe(0);
  });
  it('tanggal', () => {
    expect(parseDate('2024-05-01 13:00')).toBe('2024-05-01');
    expect(parseDate('01/05/2024')).toBe('2024-05-01');
    expect(parseDate('')).toBeTruthy();
  });
});

describe('autoMapColumns (Shopee-style)', () => {
  it('menebak kolom penting', () => {
    const h = ['No. Pesanan', 'Seller SKU', 'Nama Produk', 'Jumlah', 'Harga Satuan', 'Waktu Pesanan', 'Username (Pembeli)', 'Status Pesanan'];
    const m = autoMapColumns(h);
    expect(m.order).toBe(0);
    expect(m.sku).toBe(1);
    expect(m.name).toBe(2);
    expect(m.qty).toBe(3);
    expect(m.price).toBe(4);
    expect(m.date).toBe(5);
    expect(m.buyer).toBe(6);
    expect(m.status).toBe(7);
  });
});

describe('buildOrders + resolveOrders', () => {
  const headers = ['No. Pesanan', 'SKU', 'Nama Produk', 'Qty', 'Harga', 'Tanggal', 'Pembeli'];
  const rows = [
    ['ORD1', 'KOPI-1', 'Kopi Susu', '2', '20000', '2026-08-10', 'Budi'],
    ['ORD1', 'TEH-1', 'Teh Manis', '1', '8000', '2026-08-10', 'Budi'],
    ['ORD2', 'ZZZ', 'Barang Tak Ada', '1', '5000', '2026-08-11', 'Ani'],
  ];
  it('kelompokkan per pesanan + cocokkan item', () => {
    const orders = buildOrders(rows, autoMapColumns(headers));
    expect(orders.length).toBe(2);
    const res = resolveOrders(orders, items);
    expect(res.matched).toBe(2);
    expect(res.unmatched).toBe(1);
    const o1 = res.orders.find(o => o.orderId === 'ORD1');
    expect(o1.lines.every(l => l.itemId)).toBe(true);
    expect(o1.total).toBe(2 * 20000 + 1 * 8000);
    const o2 = res.orders.find(o => o.orderId === 'ORD2');
    expect(o2.lines[0].itemId).toBe(null);
  });
});

describe('parseWaOrder', () => {
  it('parse qty, harga, dan cocokkan item', () => {
    const o = parseWaOrder('2x Kopi Susu 20000\n1 Teh Manis @8000', items);
    expect(o.lines.length).toBe(2);
    expect(o.lines[0].qty).toBe(2);
    expect(o.lines[0].itemId).toBe('i1');
    expect(o.lines[1].qty).toBe(1);
    expect(o.lines[1].price).toBe(8000);
  });
  it('harga kosong → pakai harga jual item', () => {
    const o = parseWaOrder('3 Teh Manis', items);
    expect(o.lines[0].qty).toBe(3);
    expect(o.lines[0].price).toBe(8000);
  });
  it('singkatan rb', () => {
    const o = parseWaOrder('1x Kopi Susu 20rb', items);
    expect(o.lines[0].price).toBe(20000);
  });
});

describe('buildProducts', () => {
  it('map produk dari header', () => {
    const headers = ['Nama Produk', 'SKU', 'Harga', 'Modal', 'Stok', 'Min'];
    const rows = [['Kopi Susu', 'KOPI-1', '20.000', '12.000', '5', '2']];
    const p = buildProducts(rows, autoMapProductColumns(headers));
    expect(p.length).toBe(1);
    expect(p[0]).toMatchObject({ name: 'Kopi Susu', sku: 'KOPI-1', price: 20000, cost: 12000, stock: 5, minStock: 2 });
  });
  it('map ukuran, warna, diskon', () => {
    const headers = ['Nama', 'SKU', 'Ukuran', 'Warna', 'Harga', 'Diskon'];
    const rows = [['Kaos', 'K-1', 'L', 'Hitam', '100000', '20']];
    const p = buildProducts(rows, autoMapProductColumns(headers));
    expect(p[0]).toMatchObject({ name: 'Kaos', sku: 'K-1', size: 'L', color: 'Hitam', discountPct: 20, price: 100000 });
  });
});
