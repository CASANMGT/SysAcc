// @vitest-environment jsdom
/* global process */
// Penjaga konsistensi desain: setiap halaman (.view-section) harus memakai header
// halaman yang sama (.view-header dengan <h1> dan subjudul), dan judul halaman
// tidak memakai emoji sebagai label utama. Tujuan: drift seperti v2.29.0 tidak kembali diam-diam.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

// Rentang emoji yang umum dipakai di UI ini (simbol + pictograph).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

function viewIds() {
  return [...html.matchAll(/<div id="(view[A-Za-z]+)" class="view-section/g)].map((m) => m[1]);
}
// Ambil potongan HTML untuk satu view (sampai penutup pertama sebelum view berikutnya).
function sliceView(id) {
  const start = html.indexOf(`id="${id}"`);
  const nextIdx = viewIds()
    .map((v) => html.indexOf(`id="${v}"`))
    .filter((i) => i > start)
    .sort((a, b) => a - b)[0];
  return html.slice(start, nextIdx > 0 ? nextIdx : undefined);
}

describe('konsistensi desain halaman', () => {
  it('ada minimal 10 halaman (.view-section)', () => {
    expect(viewIds().length).toBeGreaterThanOrEqual(10);
  });

  it('setiap halaman memakai .view-header dengan satu <h1>', () => {
    const missing = [];
    for (const id of viewIds()) {
      const seg = sliceView(id);
      // Halaman container kosong (diisi JS) tetap harus punya header saat dirender;
      // yang diuji di sini adalah halaman statis di index.html.
      if (/class="view-section hidden"><\/div>/.test(seg)) continue;
      if (!seg.includes('view-header')) missing.push(`${id}: tanpa .view-header`);
      else if (!/<h1>/.test(seg)) missing.push(`${id}: tanpa <h1>`);
    }
    expect(missing, missing.join(' | ')).toEqual([]);
  });

  it('judul halaman (<h1>) tidak memakai emoji sebagai label', () => {
    const bad = [];
    for (const m of html.matchAll(/<h1>([^<]*)<\/h1>/g)) {
      if (EMOJI.test(m[1])) bad.push(m[1].trim());
    }
    expect(bad, 'h1 dengan emoji: ' + bad.join(' | ')).toEqual([]);
  });

  it('halaman statis punya subjudul ber-id …Subtitle', () => {
    const missing = [];
    for (const id of viewIds()) {
      const seg = sliceView(id);
      if (/class="view-section hidden"><\/div>/.test(seg)) continue;
      if (!/id="[A-Za-z]+(Subtitle|subtitle)"/.test(seg)) missing.push(id);
    }
    expect(missing, 'tanpa subjudul: ' + missing.join(', ')).toEqual([]);
  });
});
