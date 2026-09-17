// @vitest-environment jsdom
/* global File */
import { describe, it, expect, beforeEach } from 'vitest';
import { saveFile, getFile, deleteFile, attachTo, detachFrom, fileToDataUrl, compressImage } from '../files.js';
import { createBelanja, getBelanjas } from '../lcl.js';
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

  it('menolak berkas kelewat besar', async () => {
    const big = 'data:text/plain;base64,' + 'A'.repeat(950 * 1024);
    await expect(saveFile({ name: 'gede.pdf', type: 'text/plain', dataUrl: big }, { compress: false })).rejects.toThrow(/besar/);
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
