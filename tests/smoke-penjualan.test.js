// @vitest-environment jsdom
/* global __dirname */
// Smoke: halaman Penjualan ready setelah modal penjualan lama dihapus.
// Satu alur per berkas karena app.js memanggil init() sekali (module di-cache antar test).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as Storage from '../storage.js';

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

function mountDom() {
  document.documentElement.innerHTML = html
    .replace(/^[\s\S]*<html[^>]*>/i, '')
    .replace(/<\/html>[\s\S]*$/i, '');
  localStorage.setItem('wynara_logged_in', 'true');
}

describe('smoke penjualan', () => {
  it('index.html tidak lagi memuat modal penjualan lama', () => {
    expect(html.includes('id="saleModal"')).toBe(false);
    expect(html.includes('id="saleRows"')).toBe(false);
    expect(html.includes('id="saleSave"')).toBe(false);
  });

  it('Penjualan ready: simpan → transaksi tercatat & stok berkurang', async () => {
    mountDom();
    const it = Storage.saveItem({ name: 'Lampu Uji', price: 150000, cost: 90000, stock: 5 });
    await import('../app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('appRoot')?.classList.remove('hidden');
    document.getElementById('salesBtnSidebar')?.click();
    document.getElementById('salesNewBtn')?.click();
    const q = (sel) => document.getElementById('viewJualBaru').querySelector(sel);
    expect(q('.beli-table'), 'tabel barang ter-render').toBeTruthy();
    const sel = q('select[data-f="itemId"]');
    sel.value = it.id; sel.dispatchEvent(new Event('change'));
    const price = q('input[data-f="price"]'); price.value = '150000'; price.dispatchEvent(new Event('change'));
    const qty = q('input[data-f="qty"]'); qty.value = '2'; qty.dispatchEvent(new Event('change'));
    const recv = q('#jualReceived'); recv.checked = true; recv.dispatchEvent(new Event('change'));
    document.getElementById('jualSave')?.click();
    const sales = Storage.getAllEntries().filter((e) => e.category === 'jualan');
    expect(sales.length).toBe(1);
    expect(sales[0].amount).toBe(300000);
    expect(Storage.getItemById(it.id).stock).toBe(3);
  });
});
