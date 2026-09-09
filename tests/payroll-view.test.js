// @vitest-environment jsdom
// Halaman Karyawan & Gaji: tabel, panel edit, proses.
import { describe, it, expect, beforeAll } from 'vitest';
import { computeSlip, thrAmount } from '../payroll.js';

let UI;

const EMPS = [
  { id: 'e1', name: 'Mamat', role: 'Driver', contract: 'tetap', active: true, baseSalary: 6000000, allowance: 0, gender: 'L', ptkp: 'TK/0', startDate: '2026-01-01', bpjsKes: true, bpjsTk: true },
  { id: 'e2', name: 'Rere', role: 'Admin', contract: 'kontrak', active: true, baseSalary: 7500000, allowance: 500000, gender: 'P', ptkp: 'K/0', startDate: '2026-06-01', bpjsKes: true, bpjsTk: true },
];

beforeAll(async () => {
  document.body.innerHTML = `
    <div id="toastContainer"></div>
    <div class="chip-group" id="payrollTabs">
      <button class="chip selected" data-value="data">Data</button>
      <button class="chip" data-value="process">Proses</button>
      <button class="chip" data-value="report">Laporan</button>
    </div>
    <div id="payrollTabData"></div><div id="payrollTabProcess" hidden></div><div id="payrollTabReport" hidden></div>
    <h3 id="empTableTitle"></h3><table><tbody id="empTableBody"></tbody></table>
    <dialog id="empModal"><div id="empPanel"><h3 id="empPanelTitle"></h3>
      <div id="empSubTabs"><button class="chip selected" data-value="main"></button><button class="chip" data-value="salary"></button><button class="chip" data-value="tax"></button></div>
      <input type="hidden" id="empViewId">
      <input id="empViewName"><input id="empViewRole">
      <select id="empViewContract"><option value="tetap">Tetap</option><option value="kontrak">Kontrak</option><option value="harian">Harian</option></select>
      <input id="empViewStart"><input id="empViewPhone"><input id="empViewEmail">
      <input type="checkbox" id="empViewActive">
      <input id="empViewBase"><input id="empViewAllowance">
      <input id="empViewBank"><input id="empViewBankAcc">
      <select id="empViewGender"><option value=""></option><option value="L">L</option><option value="P">P</option></select>
      <input id="empViewBirth">
      <select id="empViewPtkp"><option value="TK/0">TK/0</option><option value="K/0">K/0</option></select>
      <input id="empViewAddress">
      <input type="checkbox" id="empViewBpjsKes"><input type="checkbox" id="empViewBpjsTk">
      <button id="empViewSave"></button>
      <div id="empSubMain"></div><div id="empSubSalary" hidden></div><div id="empSubTax" hidden></div>
    </div></dialog>
    <div id="payrollCards"></div>
    <div id="payrollSteps"><span class="pstep" data-s="1"><b class="pdot">1</b></span><span class="pstep" data-s="2"><b class="pdot">2</b></span><span class="pstep" data-s="3"><b class="pdot">3</b></span></div>
    <table><tbody id="payrollTableBody"></tbody></table>
    <div id="payrollDetail"></div>
    <span id="payrollFootNote"></span><strong id="payrollFootTotal"></strong>
    <input type="checkbox" id="payrollCheckAll"><button id="payrollFinalBtn"></button>`;
  UI = await import('../ui.js');
});

describe('renderEmpTable', () => {
  it('tampilkan 2 karyawan + cari', () => {
    UI.renderEmpTable(EMPS, '');
    expect(document.getElementById('empTableBody').innerHTML).toMatch(/Mamat/);
    expect(document.getElementById('empTableTitle').textContent).toMatch(/\(2\)/);
    UI.renderEmpTable(EMPS, 'rere');
    expect(document.getElementById('empTableBody').innerHTML).toMatch(/Rere/);
    expect(document.getElementById('empTableBody').innerHTML).not.toMatch(/Mamat/);
  });
});

describe('fillEmpPanel roundtrip', () => {
  it('isi lalu baca kembali sama', () => {
    UI.fillEmpPanel({ ...EMPS[0], email: 'mamat@mail.com', bankName: 'BCA', bankAcc: '123' });
    const d = UI.getEmpPanelData();
    expect(d.name).toBe('Mamat');
    expect(d.baseSalary).toBe(6000000);
    expect(d.email).toBe('mamat@mail.com');
    expect(d.bankAcc).toBe('123');
    expect(d.contract).toBe('tetap');
    UI.fillEmpPanel(null);
    expect(UI.getEmpPanelData().name).toBe('');
  });
});

describe('renderPayrollProcess', () => {
  const rows = EMPS.map(emp => {
    const slip = computeSlip(emp, { overtime: 0, thr: 0, pph: true, refDate: new Date('2026-09-30') });
    return { emp, slip, checked: true, paid: false, overtime: 0, withThr: false, withPph: true, thrNote: '' };
  });
  it('kartu + total + status', () => {
    UI.renderPayrollProcess(rows, 'September 2026', 'draft');
    const cards = document.getElementById('payrollCards').textContent;
    expect(cards).toMatch(/2 orang/);
    expect(cards).toMatch(/Draft/);
    const total = rows.reduce((s, r) => s + r.slip.takeHome, 0);
    expect(document.getElementById('payrollFootTotal').textContent).toMatch(/Rp/);
    expect(document.getElementById('payrollTableBody').innerHTML).toMatch(/Mamat/);
    expect(total).toBeGreaterThan(0);
  });
  it('mode tab beralih', () => {
    UI.setPayrollTab('process');
    expect(document.getElementById('payrollTabProcess').hidden).toBe(false);
    expect(document.getElementById('payrollTabData').hidden).toBe(true);
    UI.setPayrollTab('data');
  });
});

describe('thrAmount dipakai di proses', () => {
  it('Mamat (8 bln) dapat proporsional 8/12', () => {
    expect(thrAmount(EMPS[0], new Date('2026-09-30'))).toBe(4000000);
  });
});

describe('openEmpModal / closeEmpModal', () => {
  it('buka isi form + tutup tanpa error', () => {
    UI.openEmpModal({ ...EMPS[0], email: 'mamat@mail.com' });
    expect(document.getElementById('empPanelTitle').textContent).toBe('Edit karyawan');
    expect(document.getElementById('empViewName').value).toBe('Mamat');
    UI.closeEmpModal();
    UI.openEmpModal(null);
    expect(document.getElementById('empPanelTitle').textContent).toBe('Tambah karyawan');
    expect(document.getElementById('empViewName').value).toBe('');
    UI.closeEmpModal();
  });
});

describe('paySlipDetailHTML', () => {
  it('tampilkan angka BPJS + THR dua bahasa', () => {
    const emp = EMPS[0];
    const slip = computeSlip(emp, { overtime: 100000, thr: 4000000, pph: true, refDate: new Date('2026-09-30') });
    const html = UI.paySlipDetailHTML({ emp, slip, overtime: 100000, withThr: true, withPph: true, paid: false });
    expect(html).toMatch(/Masuk kantong karyawan/);
    expect(html).toMatch(/Dibayar perusahaan/);
    expect(html).toMatch(/BPJS Kesehatan pekerja 1%/);
    expect(html).toMatch(/JHT pekerja 2%/);
    expect(html).toMatch(/JP pekerja 1%/);
    expect(html).toMatch(/PPh 21 TER/);
    expect(html).toMatch(/BPJS Kesehatan perusahaan 4%/);
    expect(html).toMatch(/JHT perusahaan 3,7%/);
    expect(html).toMatch(/THR Keagamaan/);
    expect(html).toMatch(/Bonus bulan ini/);
    expect(html).toMatch(/Denda\/absensi/);
  });
  it('tampilkan plafon bila gaji di atas batas', () => {
    const emp = { ...EMPS[0], baseSalary: 15000000, allowance: 0 };
    const slip = computeSlip(emp, { overtime: 0, thr: 0, pph: false, refDate: new Date('2026-09-30') });
    const html = UI.paySlipDetailHTML({ emp, slip, overtime: 0, withThr: false, withPph: false, paid: false });
    expect(html).toMatch(/plafon/);
  });
  it('tanpa potongan bila BPJS off', () => {
    const emp = { ...EMPS[0], bpjsKes: false, bpjsTk: false };
    const slip = computeSlip(emp, { overtime: 0, thr: 0, pph: false, refDate: new Date('2026-09-30') });
    const html = UI.paySlipDetailHTML({ emp, slip, overtime: 0, withThr: false, withPph: false, paid: false });
    expect(html).not.toMatch(/BPJS Kesehatan pekerja/);
    expect(html).toMatch(/BPJS nonaktif/);
  });
});
