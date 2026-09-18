// @vitest-environment jsdom
/* global File */
import { describe, it, expect, beforeEach } from 'vitest';
import { saveFile, getFile, deleteFile, attachTo, detachFrom, fileToDataUrl, compressImage, exportBlobs, importBlobs, attachmentsOf } from '../files.js';
import { createBelanja, getBelanjas } from '../lcl.js';
import { createEntry, getEntryById } from '../storage.js';
import { createShipment, getShipments } from '../storage.js';

beforeEach(() => localStorage.clear());

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF/7g0AAAAASUVORK5CYII=';

describe('lampiran: simpan, ambil, hapus', () => {
  it('menyimpan berkas kecil (fallback storage) dan membacanya kembali', async () => {
    const meta = await saveFile({ name: 'PI-001.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,AAA' }, { compress: false });
    expect(meta.id).toMatch(/^F/);
    expect(meta.kind).toBe('file');
    const back = await getFile(meta.id);
    expect(back.name).toBe('PI-001.pdf');
    await deleteFile(meta.id);
    expect(await getFile(meta.id)).toBeNull();
  });

  it('menolak berkas kelewat besar (di atas batas 8 MB)', async () => {
    const big = 'data:text/plain;base64,' + 'A'.repeat(Math.ceil(8.4 * 1024 * 1024));
    await expect(saveFile({ name: 'gede.pdf', type: 'text/plain', dataUrl: big }, { compress: false })).rejects.toThrow(/besar/);
  });

  it('fallback tanpa IndexedDB menolak berkas > 900 KB dengan pesan jelas', async () => {
    const mid = 'data:text/plain;base64,' + 'A'.repeat(950 * 1024);
    await expect(saveFile({ name: 'sedang.pdf', type: 'text/plain', dataUrl: mid }, { compress: false })).rejects.toThrow(/IndexedDB/);
  });

  it('compressImage aman saat canvas tak tersedia (mengembalikan apa adanya)', async () => {
    const out = await compressImage(TINY_PNG);
    expect(typeof out).toBe('string');
    expect(out.startsWith('data:image/')).toBe(true);
  });

  it('fileToDataUrl membaca Blob/File', async () => {
    const f = new File([new Uint8Array([1, 2, 3])], 'x.bin', { type: 'application/octet-stream' });
    const url = await fileToDataUrl(f);
    expect(url.startsWith('data:')).toBe(true);
  });
});

describe('lampiran ikut JSON backup', () => {
  it('exportBlobs → importBlobs memulihkan berkas di perangkat baru', async () => {
    const meta = await saveFile({ name: 'surat-jalan.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,QQ==' }, { compress: false });
    const dumped = await exportBlobs();
    expect(dumped.some((f) => f.id === meta.id)).toBe(true);
    await deleteFile(meta.id);
    expect(await getFile(meta.id)).toBeNull();
    const n = await importBlobs(dumped);
    expect(n).toBeGreaterThan(0);
    const back = await getFile(meta.id);
    expect(back && back.name).toBe('surat-jalan.pdf');
  });
});

describe('lampiran biaya & payroll', () => {
  it('menempel ke transaksi biaya (ledger_entries) dan ke bulan payroll (KV)', async () => {
    const e = createEntry({ date: '2026-09-17', type: 'expense', category: 'transport', payment: 'cash', description: 'Bensin', amount: 100000 });
    const m1 = await saveFile({ name: 'nota-bensin.jpg', type: 'image/jpeg', dataUrl: 'data:image/png;base64,AAA' }, { compress: false });
    attachTo('biaya', e.id, m1);
    expect(getEntryById(e.id).attachments.length).toBe(1);
    expect(attachmentsOf('biaya', e.id).length).toBe(1);
    await detachFrom('biaya', e.id, m1.id);
    expect(getEntryById(e.id).attachments.length).toBe(0);

    const m2 = await saveFile({ name: 'daftar-hadir.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,QQ==' }, { compress: false });
    attachTo('payroll', '2026-09', m2);
    expect(attachmentsOf('payroll', '2026-09').length).toBe(1);
    expect(attachmentsOf('payroll', '2026-08').length).toBe(0);
    await detachFrom('payroll', '2026-09', m2.id);
    expect(attachmentsOf('payroll', '2026-09').length).toBe(0);
  });
});

describe('lampiran menempel ke record', () => {
  it('belanja & pengiriman: tempel lalu hapus', async () => {
    const b = createBelanja({ lines: [{ name: 'X', qty: 1, cnyUnit: 10 }], kursAgen: 2000, draft: true });
    const meta = await saveFile({ name: 'packing.jpg', type: 'image/jpeg', dataUrl: 'data:image/png;base64,AAA' }, { compress: false });
    const list = attachTo('belanja', b.id, meta);
    expect(list.length).toBe(1);
    expect(getBelanjas().find((x) => x.id === b.id).attachments.length).toBe(1);
    await detachFrom('belanja', b.id, meta.id);
    expect(getBelanjas().find((x) => x.id === b.id).attachments.length).toBe(0);
    expect(await getFile(meta.id)).toBeNull(); // berkas ikut dibuang

    const s = createShipment({ kind: 'customer', recipient: 'Andi', lines: [{ name: 'X', qty: 1 }] });
    const m2 = await saveFile({ name: 'resi.txt', type: 'text/plain', dataUrl: 'data:text/plain;base64,QQ==' }, { compress: false });
    attachTo('pengiriman', s.id, m2);
    expect(getShipments().find((x) => x.id === s.id).attachments.length).toBe(1);
  });

  it('menolak jenis lampiran tak dikenal', async () => {
    const meta = await saveFile({ name: 'a.txt', type: 'text/plain', dataUrl: 'data:text/plain;base64,QQ==' }, { compress: false });
    expect(() => attachTo('entah', 'x', meta)).toThrow(/tidak dikenal/);
  });
});
