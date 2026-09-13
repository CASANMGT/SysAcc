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
  it('drawer tertutup saat klik item sidebar (tidak menutupi konten HP)', () => {
    const sb = document.getElementById('sidebar');
    sb.classList.add('open');
    document.getElementById('sidebarOverlay').classList.remove('hidden');
    document.getElementById('reportBtnSidebar').click();
    expect(sb.classList.contains('open')).toBe(false);
    expect(document.getElementById('sidebarOverlay').classList.contains('hidden')).toBe(true);
  });
  it('hamburger menciutkan sidebar di desktop (drawer toggle)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    const toggle = document.getElementById('sidebarToggle');
    expect(document.body.classList.contains('sb-collapsed')).toBe(false);
    toggle.click();
    expect(document.body.classList.contains('sb-collapsed')).toBe(true);
    expect(localStorage.getItem('wynara_sb')).toBe('1');
    toggle.click();
    expect(document.body.classList.contains('sb-collapsed')).toBe(false);
  });
  it('struktur DOM: semua view + tab gaji bersarang benar (anti jurang layout)', () => {
    const main = document.getElementById('main-content');
    ['viewRingkasan', 'viewTransaksi', 'viewPayroll', 'viewLaporan', 'viewChangelog'].forEach(id => {
      const el = document.getElementById(id);
      expect(el.closest('#main-content')).toBe(main);
    });
    expect(document.getElementById('payrollTabProcess').closest('#viewPayroll')).toBeTruthy();
    expect(document.getElementById('payrollTabData').closest('#viewPayroll')).toBeTruthy();
    expect(document.getElementById('pageReportContent').closest('#viewLaporan')).toBeTruthy();
  });
});

describe('aksesibilitas F9 (boot enhancements)', () => {
  const named = (el) => !!(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
    || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label'));
  it('field nominal punya nama aksesibel (aria-labelledby)', () => {
    const el = document.getElementById('entryAmount');
    expect(el.getAttribute('aria-labelledby')).toBe('txAmountLabel');
    expect(document.getElementById('txAmountLabel')).toBeTruthy();
  });
  it('input pencarian & filter tanpa label markup diberi nama otomatis', () => {
    ['transaksiSearch', 'empSearch', 'loanSearch', 'stockSearch', 'contactSearch',
      'transaksiFilterJenis', 'transaksiFilterKategori'].forEach(id => {
      const el = document.getElementById(id);
      expect(named(el)).toBe(true);
    });
  });
  it('semua dialog punya nama (aria-labelledby/aria-label)', () => {
    const bad = [...document.querySelectorAll('dialog')]
      .filter(d => !d.getAttribute('aria-labelledby') && !d.getAttribute('aria-label'))
      .map(d => d.id);
    expect(bad).toEqual([]);
  });
  it('logo kasir & login error aman untuk screen reader', () => {
    expect(document.getElementById('loginError').getAttribute('role')).toBe('alert');
    expect(document.querySelector('#appRoot[role="main"]')).toBe(null);
  });
  it('segmented/chip punya aria-pressed; tab punya aria-selected', () => {
    const seg = document.querySelectorAll('#typeGroup .select-btn');
    expect(seg.length).toBeGreaterThan(0);
    seg.forEach(b => expect(['true', 'false']).toContain(b.getAttribute('aria-pressed')));
    const tabs = document.querySelectorAll('[role="tab"]');
    tabs.forEach(t => expect(['true', 'false']).toContain(t.getAttribute('aria-selected')));
  });
});
