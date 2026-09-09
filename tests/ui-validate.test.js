// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { validateForm, terbilang, trendPill, parseIdrInput } from '../ui.js';

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

describe('trendPill', () => {
  it('naik / turun / stabil / kosong', () => {
    expect(trendPill(120, 100)).toEqual({ text: '+20%', cls: 'up' });
    expect(trendPill(80, 100)).toEqual({ text: '-20%', cls: 'down' });
    expect(trendPill(100, 100)).toEqual({ text: 'Stabil', cls: 'neutral' });
    expect(trendPill(0, 0)).toEqual({ text: '—', cls: 'neutral' });
    expect(trendPill(50, 0)).toEqual({ text: '+100%', cls: 'up' });
  });
});

describe('parseIdrInput (desimal Indonesia)', () => {
  it('ribuan titik + koma desimal', () => {
    expect(parseIdrInput('1.234.567,89')).toBe('1234567.89');
    expect(parseIdrInput('Rp 2.500')).toBe('2500');
    expect(parseIdrInput('0,5')).toBe('0.5');
  });
  it('titik desimal ala Inggris', () => {
    expect(parseIdrInput('1234.56')).toBe('1234.56');
    expect(parseIdrInput('1.500')).toBe('1500');
  });
  it('kosong / sampah aman', () => {
    expect(parseIdrInput('')).toBe('');
    expect(parseIdrInput('abc')).toBe('');
    expect(Number(parseIdrInput('10.000,5'))).toBe(10000.5);
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
