// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { code128Bars, code128Svg } from '../barcode.js';
import { autoSku, saveItem } from '../storage.js';

beforeEach(() => { localStorage.clear(); });

describe('barcode Code128', () => {
  it('menghasilkan bar & lebar untuk teks', () => {
    const r = code128Bars('KOP-001');
    expect(r.width).toBeGreaterThan(0);
    expect(r.bars.length).toBeGreaterThan(0);
    expect(r.bars[0][0]).toBe(0);
  });
  it('svg berisi rect', () => {
    const svg = code128Svg('ABC');
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('<rect');
  });
  it('teks kosong → svg kosong', () => {
    expect(code128Svg('')).toBe('');
  });
  it('karakter di luar ASCII 32-126 diabaikan tanpa error', () => {
    const r = code128Bars('AB\u00e9C');
    expect(r.width).toBeGreaterThan(0);
  });
});

describe('auto SKU & barcode', () => {
  it('autoSku unik & berurut', () => {
    const a = autoSku('Kopi Susu', []);
    expect(a).toMatch(/^KOP-\d{3}$/);
    const b = autoSku('Kopi Susu', [{ sku: a }]);
    expect(b).not.toBe(a);
  });
  it('saveItem mengisi SKU & barcode otomatis bila kosong', () => {
    const it = saveItem({ name: 'Teh Manis', price: 5000, stock: 1 });
    expect(it.sku).toBeTruthy();
    expect(it.barcode).toBe(it.sku);
  });
});
