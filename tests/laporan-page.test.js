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
    expect(document.querySelectorAll('.page-report-tab').length).toBe(17);
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

describe('form pinjaman disederhanakan (preset chips)', () => {
  it('chip bunga/tenor/jatuh tempo ada + default terpilih', () => {
    expect(document.querySelectorAll('#loanBungaChips .chip').length).toBe(5);
    expect(document.querySelectorAll('#loanTenorChips .chip').length).toBe(5);
    expect(document.querySelectorAll('#loanDueChips .chip').length).toBe(5);
    expect(document.querySelector('#loanBungaChips .chip.selected').textContent).toMatch(/Tanpa bunga/);
    expect(document.querySelector('#loanTenorChips .chip.selected').textContent).toBe('12');
    expect(document.querySelector('#loanDueChips .chip.selected').textContent).toMatch(/1 bulan/);
    expect(document.getElementById('entryInstallment').type).toBe('hidden');
    expect(document.getElementById('bungaCustomWrap').hidden).toBe(true);
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
    ['transaksiSearch', 'empSearch', 'loanSearch', 'stockPageSearch', 'contactSearch',
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
  it('form tambah/edit produk ada di halaman (bukan modal)', () => {
    const form = document.getElementById('stockForm');
    const panel = document.getElementById('stockFormPanel');
    expect(panel.closest('#viewStock')).toBeTruthy();
    expect(form.closest('#stockModal')).toBe(null);
    expect(panel.closest('#stockModal')).toBe(null);
    expect(panel.hidden).toBe(true);
  });
  it('halaman stok: KPI + filter Habis + lembar aksi cepat', () => {
    expect(document.querySelectorAll('#stockPageFilter .chip[data-f="out"]').length).toBe(1);
    expect(document.getElementById('stockPageSummary').classList.contains('stock-kpi')).toBe(true);
    expect(document.getElementById('stockActionSheet')).toBeTruthy();
    ['saAdd', 'saAdjust', 'saTransfer', 'saHistory', 'saJual', 'saEdit', 'saDelete'].forEach(id => expect(document.getElementById(id)).toBeTruthy());
  });
  it('form produk: 2 langkah, toggle Tunggal/Bervarian, tabel harga per-varian', () => {
    expect(document.querySelectorAll('#stockForm .stock-step').length).toBe(2);
    const mode = document.getElementById('stockVariantMode');
    expect(mode.querySelectorAll('.chip').length).toBe(2);
    expect(document.getElementById('singleVariantFields')).toBeTruthy();
    expect(document.getElementById('multiVariantFields')).toBeTruthy();
    // hanya satu input untuk tiap peran (tidak ada duplikat)
    expect(document.querySelectorAll('#stockSizes').length).toBe(1);
    expect(document.querySelectorAll('#stockColors').length).toBe(1);
    expect(document.querySelectorAll('#stockSize').length).toBe(1);
    expect(document.querySelectorAll('#stockColor').length).toBe(1);
    // tabel varian (harga+stok) ada di langkah 2
    expect(document.getElementById('variantTable').closest('.stock-step').dataset.step).toBe('2');
    expect(document.getElementById('stockVariantPriceNote')).toBe(null);
  });
  it('produk punya field foto + berat/dimensi kirim', () => {
    ['stockImage', 'stockWeight', 'stockLength', 'stockWidth', 'stockHeight'].forEach(id => expect(document.getElementById(id)).toBeTruthy());
  });
  it('ada modal barcode + tombol barcode di lembar aksi', () => {
    expect(document.getElementById('barcodeModal')).toBeTruthy();
    expect(document.getElementById('barcodeSvg')).toBeTruthy();
    expect(document.getElementById('saBarcode')).toBeTruthy();
  });
  it('ada tab Laba Kotor + tombol pintas ke halaman Penjualan', () => {
    const gp = document.querySelector('.page-report-tab[data-report="grossprofit"]');
    expect(gp).toBeTruthy();
    expect(gp.textContent).toMatch(/Laba Kotor/);
    expect(document.getElementById('reportJumpSales')).toBeTruthy();
  });
  it('dashboard: widget penjualan harian + produk terlaris', () => {
    expect(document.getElementById('salesDailyChart')).toBeTruthy();
    expect(document.getElementById('topProductsList')).toBeTruthy();
    expect(document.getElementById('salesDailyTotal')).toBeTruthy();
    expect(document.getElementById('topProductsMore')).toBeTruthy();
  });
  it('halaman Penjualan ada di sidebar + gabungan laporan', () => {
    expect(document.getElementById('salesBtnSidebar')).toBeTruthy();
    const v = document.getElementById('viewSales');
    expect(v).toBeTruthy();
    ['salesKpi', 'salesPageChart', 'salesTopList', 'salesProductTable', 'salesPayTable', 'salesRecentList'].forEach(id => {
      expect(v.querySelector('#' + id) || document.getElementById(id)).toBeTruthy();
    });
  });
  it('menu restruktur: Kas & Bank, Pembelian, Biaya (+Aset, Daftar Akun)', () => {
    ['kasBtnSidebar', 'pembelianBtnSidebar', 'biayaBtnSidebar', 'assetBtnSidebar', 'coaBtnSidebar'].forEach(id => expect(document.getElementById(id)).toBeTruthy());
    ['viewKas', 'viewPembelian', 'viewBiaya'].forEach(id => expect(document.getElementById(id)).toBeTruthy());
    ['kasKpi', 'kasWalletList', 'kasRecentList', 'pembelianKpi', 'pembelianList', 'biayaKpi', 'biayaCats', 'biayaList'].forEach(id => expect(document.getElementById(id)).toBeTruthy());
    expect(document.getElementById('kasReconList')).toBeTruthy();
    expect(document.getElementById('kasReconSummary')).toBeTruthy();
    ['kasReconMatchAllBtn', 'kasReconBankSelect', 'kasReconEndBal', 'kasReconDiff', 'bankRuleKeyword', 'bankRuleCode', 'bankRuleAddBtn', 'bankRulesList', 'kasReconRulesBtn', 'bankRulesModal', 'bankRuleDir', 'bankRulePresets', 'bankRuleSearch', 'bankRuleSeedAll', 'bankRulesClearAll', 'bankRuleCount', 'kasReconApplyRulesBtn', 'kasReconRulesCount', 'bankApplySuggestBtn', 'coaSearch', 'coaTypeFilter', 'bankRuleSuggestions', 'saleCredit', 'saleCreditFields', 'saleDepositPct', 'saleTerms', 'saleDueDate', 'creditKpi', 'creditList', 'creditPayModal', 'coaImportText', 'coaImportBtn'].forEach(id => expect(document.getElementById(id)).toBeTruthy());
  });
  it('segmented/chip punya aria-pressed; tab punya aria-selected', () => {
    const seg = document.querySelectorAll('#typeGroup .select-btn');
    expect(seg.length).toBeGreaterThan(0);
    seg.forEach(b => expect(['true', 'false']).toContain(b.getAttribute('aria-pressed')));
    const tabs = document.querySelectorAll('[role="tab"]');
    tabs.forEach(t => expect(['true', 'false']).toContain(t.getAttribute('aria-selected')));
  });
  it('tabel punya scope kolom + caption tersembunyi (bisa dibaca screen reader)', () => {
    const ths = document.querySelectorAll('#entriesTable thead th');
    expect(ths.length).toBeGreaterThan(0);
    ths.forEach(th => expect(th.getAttribute('scope')).toBe('col'));
    expect(document.querySelector('table > caption.sr-only')).toBeTruthy();
  });
  it('grafik punya teks alternatif (role img + aria-label)', () => {
    const arus = document.getElementById('arusKasChart');
    expect(arus.getAttribute('role')).toBe('img');
    expect((arus.getAttribute('aria-label') || '').length).toBeGreaterThan(0);
    const donut = document.querySelector('.donut-svg');
    expect(donut.getAttribute('role')).toBe('img');
    expect((donut.getAttribute('aria-label') || '').length).toBeGreaterThan(0);
  });
  it('hierarki heading dashboard diberi level eksplisit', () => {
    const h = document.querySelector('#viewRingkasan .dash-panel-head h3');
    expect(h.getAttribute('role')).toBe('heading');
    expect(h.getAttribute('aria-level')).toBe('2');
  });
  it('item nav beremoji punya nama bersih (tanpa emoji)', () => {
    const b = document.getElementById('loanBtnSidebar');
    const label = b.getAttribute('aria-label') || '';
    expect(label).toMatch(/Pinjemin/);
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(label)).toBe(false);
  });
  it('nav aktif diberi aria-current + chip import ber-aria-pressed', () => {
    document.getElementById('reportBtnSidebar').click();
    expect(document.getElementById('reportBtnSidebar').getAttribute('aria-current')).toBe('page');
    const imp = document.querySelector('#importIntro .chip');
    expect(['true', 'false']).toContain(imp.getAttribute('aria-pressed'));
  });
});
