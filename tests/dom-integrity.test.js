// @vitest-environment jsdom
/* global process */
// Penjaga integritas DOM: setiap getElementById() di app.js/ui.js harus menunjuk ke
// elemen yang BENAR-BENAR ada di index.html atau dibuat secara dinamis oleh template JS.
// Menangkap kelas bug "tombol mati": listener/handler yang dipasang ke elemen yang tak pernah ada.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'ui.js'), 'utf8');

// Semua id yang ada di markup statis.
const staticIds = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));

// Semua id yang dibuat secara dinamis oleh template string (id="..." atau id='...' di JS).
const dynamicIds = new Set();
for (const src of [app, ui]) {
  for (const m of src.matchAll(/\bid=\\?["']([A-Za-z0-9_-]+)\\?["']/g)) dynamicIds.add(m[1]);
  // id yang dirakit dari variabel, mis. id="${...}" → tidak bisa dilacak, diabaikan.
}

function refsOf(src) {
  return [...new Set([...src.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)].map((m) => m[1]))];
}

const known = (id) => staticIds.has(id) || dynamicIds.has(id);

describe('integritas referensi DOM', () => {
  it('index.html punya cukup banyak id untuk dipercaya sebagai acuan', () => {
    expect(staticIds.size).toBeGreaterThan(400);
  });

  it('setiap getElementById() di app.js menunjuk elemen yang ada', () => {
    const missing = refsOf(app).filter((id) => !known(id));
    expect(missing, 'getElementById tanpa elemen:\n  ' + missing.join('\n  ')).toEqual([]);
  });

  it('setiap getElementById() di ui.js menunjuk elemen yang ada', () => {
    const missing = refsOf(ui).filter((id) => !known(id));
    expect(missing, 'getElementById tanpa elemen:\n  ' + missing.join('\n  ')).toEqual([]);
  });

  it('tidak ada listener yang dipasang ke elemen yang tak pernah ada', () => {
    const wired = [...new Set([...app.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)\s*\??\.\s*addEventListener/g)].map((m) => m[1]))];
    const dead = wired.filter((id) => !known(id));
    expect(dead, 'listener ke elemen tak ada:\n  ' + dead.join('\n  ')).toEqual([]);
  });
});
