// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { validateForm, terbilang } from '../ui.js';

beforeEach(() => {
  window.__getOutstandingHutang = () => [];
  window.__getOutstandingPiutang = () => [];
});

const base = (over = {}) => ({
  date: '2026-08-15', type: 'expense', category: 'makanan', amount: 50000,
  loanMode: 'new', ...over
});

describe('validateForm', () => {
  it('transaksi biasa valid → null', () => {
    expect(validateForm(base())).toBeNull();
  });
  it('wajib tanggal, jenis, kategori', () => {
    expect(validateForm(base({ date: '' }))).toMatch(/tanggal/i);
    expect(validateForm(base({ type: '' }))).toMatch(/masuk atau keluar/);
    expect(validateForm(base({ category: '' }))).toMatch(/kategori/i);
  });
  it('minimal Rp100', () => {
    expect(validateForm(base({ amount: 50 }))).toMatch(/100/);
  });
  it('pinjaman baru wajib nama teman', () => {
    expect(validateForm(base({ category: 'Piutang', person: '' }))).toMatch(/nama teman/i);
    expect(validateForm(base({ category: 'Hutang', person: '' }))).toMatch(/nama teman/i);
    expect(validateForm(base({ category: 'Piutang', person: 'Budi' }))).toBeNull();
  });
  it('pelunasan wajib pilih pinjaman', () => {
    expect(validateForm(base({ category: 'Hutang', loanMode: 'settle', loanId: '' }))).toMatch(/dipilih|pilih/i);
  });
  it('nominal melebihi sisa ditolak', () => {
    window.__getOutstandingHutang = () => [{ id: 'h1', outstanding: 100000 }];
    expect(validateForm(base({ category: 'Hutang', loanMode: 'settle', loanId: 'h1', amount: 200000 }))).toMatch(/sisa/i);
    expect(validateForm(base({ category: 'Hutang', loanMode: 'settle', loanId: 'h1', amount: 50000 }))).toBeNull();
  });
  it('pinjaman lunas/tak dikenal → suruh pilih ulang', () => {
    window.__getOutstandingPiutang = () => [];
    expect(validateForm(base({ category: 'Piutang', loanMode: 'settle', loanId: 'x', amount: 1000 }))).toMatch(/pilih ulang/i);
  });
});

describe('terbilang', () => {
  it('dasar', () => {
    expect(terbilang(0)).toBe('nol');
    expect(terbilang(5)).toBe('lima');
    expect(terbilang(11)).toBe('sebelas');
    expect(terbilang(15)).toBe('lima belas');
    expect(terbilang(21)).toBe('dua puluh satu');
    expect(terbilang(100)).toBe('seratus');
    expect(terbilang(1000)).toBe('seribu');
  });
  it('nominal besar', () => {
    expect(terbilang(1500000)).toBe('satu juta lima ratus ribu');
    expect(terbilang(250000)).toBe('dua ratus lima puluh ribu');
  });
});
