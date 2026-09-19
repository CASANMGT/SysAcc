// @vitest-environment jsdom
/* global __dirname */
// Smoke: preorder pada halaman Penjualan baru (berkas terpisah — app.js di-init sekali per proses).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as Storage from '../storage.js';

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

describe('smoke penjualan preorder', () => {
  it('preorder barang baru + pelanggan → draft tersimpan tanpa jurnal kas', async () => {
    document.documentElement.innerHTML = html.replace(/^[\s\S]*<html[^>]*>/i, '').replace(/<\/html>[\s\S]*$/i, '');
    localStorage.setItem('wynara_logged_in', 'true');
    await import('../app.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    document.getElementById('appRoot')?.classList.remove('hidden');
    document.getElementById('salesBtnSidebar')?.click();
    document.getElementById('salesNewBtn')?.click();
    const q = (sel) => document.getElementById('viewJualBaru').querySelector(sel);
    // pindah ke preorder
    q('[data-set="mode=preorder"]')?.click();
    const nameInp = q('input[data-f="name"]');
    expect(nameInp, 'kolom nama barang baru').toBeTruthy();
    nameInp.value = 'Barang Baru'; nameInp.dispatchEvent(new Event('input'));
    const price = q('input[data-f="price"]'); price.value = '200000'; price.dispatchEvent(new Event('change'));
    const qty = q('input[data-f="qty"]'); qty.value = '1'; qty.dispatchEvent(new Event('change'));
    const cust = document.getElementById('jualCustomer'); cust.value = 'Andi'; cust.dispatchEvent(new Event('input'));
    const j0 = Storage.getAllJournals().length;
    document.getElementById('jualSaveDraft')?.click();
    const pos = Storage.getPreorders();
    expect(pos.length).toBe(1);
    expect(pos[0].status).toBe('draft');
    expect(pos[0].customer).toBe('Andi');
    expect(Storage.getAllJournals().length).toBe(j0); // draft: kas tidak bergerak
  });
});
