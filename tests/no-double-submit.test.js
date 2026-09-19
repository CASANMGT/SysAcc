// @vitest-environment jsdom
/* global __dirname */
// Sprint 2: cegah transaksi ganda. Klik dua kali cepat pada tombol simpan Penjualan
// harus menghasilkan SATU transaksi saja (guardSubmit mengunci tombol saat proses).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as Storage from '../storage.js';

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

describe('anti dobel-submit pada Penjualan baru', () => {
  it('dua klik cepat → satu penjualan saja', async () => {
    document.documentElement.innerHTML = html.replace(/^[\s\S]*<html[^>]*>/i, '').replace(/<\/html>[\s\S]*$/i, '');
    localStorage.setItem('wynara_logged_in', 'true');
    const it = Storage.saveItem({ name: 'Barang Dobel', price: 100000, cost: 60000, stock: 10 });
    await import('../app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('appRoot')?.classList.remove('hidden');
    document.getElementById('salesBtnSidebar')?.click();
    document.getElementById('salesNewBtn')?.click();
    const q = (sel) => document.getElementById('viewJualBaru').querySelector(sel);
    const sel = q('select[data-f="itemId"]');
    sel.value = it.id; sel.dispatchEvent(new Event('change'));
    const price = q('input[data-f="price"]'); price.value = '100000'; price.dispatchEvent(new Event('change'));
    const qty = q('input[data-f="qty"]'); qty.value = '1'; qty.dispatchEvent(new Event('change'));
    const recv = q('#jualReceived'); recv.checked = true; recv.dispatchEvent(new Event('change'));

    const btn = document.getElementById('jualSave');
    btn.click();
    btn.click();          // klik kedua saat tombol terkunci harus diabaikan
    const sales = Storage.getAllEntries().filter((e) => e.category === 'jualan');
    expect(sales.length, 'hanya satu penjualan tercatat').toBe(1);
    expect(Storage.getItemById(it.id).stock, 'stok berkurang sekali').toBe(9);
  });
});
