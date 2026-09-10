// @vitest-environment jsdom
// Regression: halaman Laporan harus tampil + semua tab render tanpa error.
// Menangkap kelas bug "halaman putih": section hilang dari DOM / render melempar.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

beforeAll(async () => {
  const path = (await import('node:path')).default;
  const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  document.body.innerHTML = html.split('<body>')[1].split('</body>')[0];
  if (!window.Element.prototype.scrollIntoView) {
    window.Element.prototype.scrollIntoView = function () {};
  }
  localStorage.setItem('wynara_logged_in', 'true');
  await import('../app.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
});

describe('halaman Laporan', () => {
  it('section + header + 16 tab tampil setelah klik sidebar', () => {
    document.getElementById('reportBtnSidebar').click();
    const sec = document.getElementById('viewLaporan');
    expect(sec.classList.contains('hidden')).toBe(false);
    expect(sec.querySelector('h1').textContent).toMatch(/Laporan/);
    expect(document.querySelectorAll('.page-report-tab').length).toBe(16);
    expect(document.getElementById('pageReportContent').innerHTML.trim().length).toBeGreaterThan(0);
  });
  it('semua 16 tab render konten tanpa error', () => {
    const tabs = [...document.querySelectorAll('.page-report-tab')];
    const failed = [];
    tabs.forEach(b => {
      try {
        b.click();
        const html = document.getElementById('pageReportContent').innerHTML.trim();
        if (!html.length) failed.push(b.dataset.report + ':empty');
      } catch (e) { failed.push(b.dataset.report + ':' + e.message); }
    });
    expect(failed).toEqual([]);
  });
  it('panel kesehatan + search input tampil', () => {
    expect(document.getElementById('pageReportHealthWrap')).toBeTruthy();
    expect(document.getElementById('pageReportHealth').innerHTML.trim().length).toBeGreaterThan(0);
  });
  it('link Changelog footer membuka halaman changelog berisi konten', async () => {
    document.getElementById('changelogLink').click();
    const sec = document.getElementById('viewChangelog');
    expect(sec.classList.contains('hidden')).toBe(false);
    await new Promise(r => setTimeout(r, 50));
    expect(document.getElementById('changelogContent').innerHTML.trim().length).toBeGreaterThan(0);
  });
  it('penanda versi sinkron (anti split-brain cache)', () => {
    const htmlVer = document.querySelector('script').textContent.match(/__htmlVersion = '([^']+)'/);
    expect(window.__APP_VERSION).toBeTruthy();
    expect(htmlVer && htmlVer[1]).toBe(window.__APP_VERSION);
  });
});
