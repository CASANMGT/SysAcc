// coa.js — Chart of Accounts (SAK EMKM sederhana) + pemetaan.
// Setiap pembayaran & kategori dipetakan ke akun. Jurnal selalu balance.

export const ACCOUNTS = [
  // Kas & setara kas (1:1 dengan cara bayar → cocok dengan panel Dompet)
  { code: '1101', name: 'Kas Tunai', type: 'asset', payment: 'cash' },
  { code: '1102', name: 'Bank Transfer', type: 'asset', payment: 'transfer' },
  { code: '1103', name: 'QRIS', type: 'asset', payment: 'qris' },
  { code: '1104', name: 'E-Wallet', type: 'asset', payment: 'ewallet' },
  { code: '1105', name: 'Kartu Debit', type: 'asset', payment: 'debit' },
  { code: '1106', name: 'Bank BCA', type: 'asset' },
  { code: '1107', name: 'Bank Mandiri', type: 'asset' },
  { code: '1108', name: 'Bank BRI', type: 'asset' },
  { code: '1111', name: 'Bank BNI', type: 'asset' },
  { code: '1112', name: 'ShopeePay', type: 'asset' },
  { code: '1113', name: 'GoPay', type: 'asset' },
  { code: '1114', name: 'OVO', type: 'asset' },
  { code: '1115', name: 'DANA', type: 'asset' },
  { code: '1116', name: 'TikTok / Tokopedia (TokoWallet)', type: 'asset' },
  { code: '1117', name: 'LinkAja', type: 'asset' },
  { code: '1109', name: 'Kas Lainnya', type: 'asset', payment: 'other' },
  { code: '1110', name: 'Deposito / Tabungan Berjangka', type: 'asset' },
  { code: '1120', name: 'Kas Kecil (Petty Cash)', type: 'asset' },
  // Piutang, persediaan & perlengkapan
  { code: '1201', name: 'Piutang Usaha', type: 'asset' },
  { code: '1202', name: 'Piutang Karyawan (Kasbon)', type: 'asset' },
  { code: '1203', name: 'Piutang Lain-lain', type: 'asset' },
  { code: '1301', name: 'Persediaan Barang', type: 'asset' },
  { code: '1302', name: 'Perlengkapan (Supplies)', type: 'asset' },
  { code: '1401', name: 'PPN Masukan', type: 'asset' },
  // Aset tetap & akumulasi penyusutan (kontra-aset, tampil minus di Neraca)
  { code: '1510', name: 'Aset Tetap', type: 'asset' },
  { code: '1519', name: 'Akumulasi Penyusutan', type: 'asset' },
  { code: '1520', name: 'Peralatan & Mesin', type: 'asset' },
  { code: '1521', name: 'Kendaraan', type: 'asset' },
  { code: '1522', name: 'Bangunan', type: 'asset' },
  // Kewajiban
  { code: '2101', name: 'Hutang Kartu Kredit', type: 'liability', payment: 'credit' },
  { code: '2102', name: 'Hutang Paylater', type: 'liability', payment: 'paylater' },
  { code: '2103', name: 'Hutang Usaha', type: 'liability' },
  { code: '2104', name: 'Hutang Gaji', type: 'liability' },
  { code: '2105', name: 'PPN Keluaran', type: 'liability' },
  { code: '2106', name: 'PPh Final Terutang', type: 'liability' },
  { code: '2107', name: 'PPh Dipotong (23 / 4-2)', type: 'liability' },
  { code: '2110', name: 'Hutang BPJS', type: 'liability' },
  { code: '2201', name: 'Hutang Pajak Lainnya', type: 'liability' },
  { code: '2202', name: 'Hutang Lain-lain', type: 'liability' },
  // Modal
  { code: '3101', name: 'Modal Awal', type: 'equity' },
  { code: '3102', name: 'Laba Ditahan', type: 'equity' },
  { code: '3103', name: 'Prive / Penarikan Pemilik', type: 'equity' },
  // Pendapatan
  { code: '4101', name: 'Pendapatan Usaha', type: 'revenue' },
  { code: '4102', name: 'Pendapatan Bunga', type: 'revenue' },
  { code: '4103', name: 'Pendapatan Jasa', type: 'revenue' },
  { code: '4190', name: 'Pendapatan Lainnya', type: 'revenue' },
  // Beban
  { code: '5101', name: 'Beban Sewa', type: 'expense', category: 'kos' },
  { code: '5102', name: 'Beban Utilitas', type: 'expense', category: 'utilitas' },
  { code: '5103', name: 'Beban Konsumsi', type: 'expense', category: 'makanan' },
  { code: '5104', name: 'Beban Transportasi', type: 'expense', category: 'transport' },
  { code: '5105', name: 'Beban Hiburan', type: 'expense', category: 'hiburan' },
  { code: '5106', name: 'Beban Kesehatan', type: 'expense', category: 'kesehatan' },
  { code: '5107', name: 'Beban Belanja Barang', type: 'expense', category: 'belanja' },
  { code: '5108', name: 'Beban Pendidikan', type: 'expense', category: 'pendidikan' },
  { code: '5109', name: 'Harga Pokok Penjualan', type: 'expense' },
  { code: '5110', name: 'Beban Gaji', type: 'expense', category: 'gaji-out' },
  { code: '5111', name: 'Beban Pajak Final', type: 'expense' },
  { code: '5112', name: 'Beban BPJS Perusahaan', type: 'expense' },
  { code: '5113', name: 'Beban Bunga', type: 'expense' },
  { code: '5114', name: 'Beban Administrasi Bank', type: 'expense', category: 'adm_bank' },
  { code: '5115', name: 'Beban Bunga Bank', type: 'expense', category: 'bunga_bank' },
  { code: '5116', name: 'Beban Iklan & Promosi', type: 'expense', category: 'iklan' },
  { code: '5117', name: 'Beban Perlengkapan', type: 'expense', category: 'perlengkapan' },
  { code: '5118', name: 'Beban Komunikasi & Internet', type: 'expense', category: 'komunikasi' },
  { code: '5119', name: 'Beban Asuransi', type: 'expense', category: 'asuransi' },
  { code: '5120', name: 'Beban Pemeliharaan', type: 'expense', category: 'pemeliharaan' },
  { code: '5121', name: 'Beban Jasa Profesional', type: 'expense', category: 'jasa' },
  { code: '5122', name: 'Beban Pajak & Retribusi', type: 'expense', category: 'pajak' },
  { code: '5123', name: 'Beban Sumbangan', type: 'expense', category: 'sumbangan' },
  { code: '5129', name: 'Beban Penyusutan', type: 'expense' },
  { code: '5199', name: 'Beban Lainnya', type: 'expense' },
];

// Akun custom (dari penyimpanan, digabung dengan bawaan). Diisi via setCustomAccounts().
let customAccounts = [];

export function setCustomAccounts(list) {
  customAccounts = Array.isArray(list) ? list.filter(a => a && /^\d{4}$/.test(a.code)) : [];
}

export function getAccounts() {
  const seen = new Set();
  const out = [];
  customAccounts.forEach(a => { seen.add(a.code); out.push(a); });
  ACCOUNTS.forEach(a => { if (!seen.has(a.code)) out.push(a); });
  return out;
}

export function getAccount(code) {
  return getAccounts().find(a => a.code === code) || null;
}

export function accountLabel(code) {
  const a = getAccount(code);
  return a ? `${a.code} ${a.name}` : code;
}

// Cara bayar → akun. credit/paylater = kewajiban (hutang), sisanya aset kas.
export function accountForPayment(payment) {
  const found = getAccounts().find(a => a.payment === payment);
  return (found || { code: '1101' }).code;
}

export function isLiabilityPayment(payment) {
  const a = getAccounts().find(x => x.payment === payment);
  return !!a && a.type === 'liability';
}

// Kategori beban → akun beban. Custom/tak dikenal → 5199.
export function expenseAccountFor(category) {
  const found = getAccounts().find(a => a.type === 'expense' && a.category === category);
  return (found || { code: '5199' }).code;
}

export const REVENUE_ACCOUNT = '4101';
export const AR_ACCOUNT = '1201';
export const AP_ACCOUNT = '2103';
export const INVENTORY_ACCOUNT = '1301';
export const COGS_ACCOUNT = '5109';
export const SALARY_EXPENSE = '5110';
export const SALARY_PAYABLE = '2104';
export const PPN_OUT = '2105';
export const PPN_IN = '1401';
export const PPH_PAYABLE = '2106';
export const PPH_EXPENSE = '5111';
export const EQUITY_ACCOUNT = '3101';
export const INTEREST_INCOME = '4102';
export const INTEREST_EXPENSE = '5113';
export const PPN_RATE = 0.11;
export const PPH_FINAL_RATE = 0.005;
export const PPH_THRESHOLD = 4800000000;

// ===== Contoh aturan bank (keyword → akun COA) untuk auto-isi & preset UI =====
// `direction` opsional: 'in' (masuk) / 'out' (keluar); kosong = dua arah.
export const BANK_RULE_PRESETS = [
  // Transportasi
  { keyword: 'gojek', code: '5104' }, { keyword: 'grab', code: '5104' }, { keyword: 'maxim', code: '5104' },
  { keyword: 'pertamina', code: '5104' }, { keyword: 'spbu', code: '5104' }, { keyword: 'bensin', code: '5104' },
  { keyword: 'solar', code: '5104' }, { keyword: 'pertalite', code: '5104' },
  { keyword: 'tol', code: '5104' }, { keyword: 'jasa marga', code: '5104' }, { keyword: 'parkir', code: '5104' },
  { keyword: 'tiket', code: '5104' }, { keyword: 'travel', code: '5104' },
  // Konsumsi
  { keyword: 'gofood', code: '5103' }, { keyword: 'grabfood', code: '5103' }, { keyword: 'shopeefood', code: '5103' },
  { keyword: 'resto', code: '5103' }, { keyword: 'restoran', code: '5103' }, { keyword: 'warteg', code: '5103' },
  { keyword: 'kfc', code: '5103' }, { keyword: 'mcd', code: '5103' }, { keyword: 'starbucks', code: '5103' },
  { keyword: 'kopi', code: '5103' }, { keyword: 'cafe', code: '5103' }, { keyword: 'katering', code: '5103' },
  // Admin bank & keuangan
  { keyword: 'biaya adm', code: '5114' }, { keyword: 'adm bank', code: '5114' }, { keyword: 'biaya admin', code: '5114' },
  { keyword: 'materai', code: '5114' }, { keyword: 'provisi', code: '5114' }, { keyword: 'fee', code: '5114' },
  { keyword: 'bunga', code: '4102', direction: 'in' }, { keyword: 'bunga', code: '5115', direction: 'out' },
  { keyword: 'angsuran', code: '2202' }, { keyword: 'cicilan', code: '2202' }, { keyword: 'kredit', code: '2202' },
  // Utilitas & komunikasi
  { keyword: 'listrik', code: '5118' }, { keyword: 'pln', code: '5118' }, { keyword: 'token', code: '5118' },
  { keyword: 'pdam', code: '5118' }, { keyword: 'air', code: '5118' }, { keyword: 'indihome', code: '5118' },
  { keyword: 'telkom', code: '5118' }, { keyword: 'internet', code: '5118' }, { keyword: 'wifi', code: '5118' },
  { keyword: 'pulsa', code: '5118' }, { keyword: 'kuota', code: '5118' }, { keyword: 'telkomsel', code: '5118' },
  { keyword: 'indosat', code: '5118' }, { keyword: 'xl', code: '5118' }, { keyword: 'tri', code: '5118' },
  // Sewa & operasional
  { keyword: 'sewa', code: '5101' }, { keyword: 'rent', code: '5101' }, { keyword: 'kontrakan', code: '5101' },
  { keyword: 'gaji', code: '5110' }, { keyword: 'payroll', code: '5110' }, { keyword: 'upah', code: '5110' }, { keyword: 'honor', code: '5110' },
  { keyword: 'bpjs', code: '5112' },
  { keyword: 'iklan', code: '5116' }, { keyword: 'ads', code: '5116' }, { keyword: 'google ads', code: '5116' },
  { keyword: 'facebook', code: '5116' }, { keyword: 'promosi', code: '5116' }, { keyword: 'endorse', code: '5116' },
  { keyword: 'asuransi', code: '5119' }, { keyword: 'insurance', code: '5119' },
  { keyword: 'servis', code: '5120' }, { keyword: 'service', code: '5120' }, { keyword: 'perbaikan', code: '5120' }, { keyword: 'maintenance', code: '5120' },
  { keyword: 'notaris', code: '5121' }, { keyword: 'konsultan', code: '5121' }, { keyword: 'akuntan', code: '5121' }, { keyword: 'pengacara', code: '5121' },
  { keyword: 'percetakan', code: '5117' }, { keyword: 'fotokopi', code: '5117' }, { keyword: 'atk', code: '5117' },
  { keyword: 'sumbangan', code: '5123' }, { keyword: 'donasi', code: '5123' }, { keyword: 'zakat', code: '5123' },
  { keyword: 'pajak', code: '2201' }, { keyword: 'pph', code: '2201' }, { keyword: 'setor ppn', code: '2201' },
  // Penjualan / marketplace (masuk)
  { keyword: 'qris', code: '4101', direction: 'in' }, { keyword: 'settlement', code: '4101', direction: 'in' },
  { keyword: 'penjualan', code: '4101', direction: 'in' }, { keyword: 'omzet', code: '4101', direction: 'in' },
  { keyword: 'shopee', code: '4101', direction: 'in' }, { keyword: 'tokopedia', code: '4101', direction: 'in' },
  { keyword: 'tiktok', code: '4101', direction: 'in' }, { keyword: 'lazada', code: '4101', direction: 'in' },
  // Belanja stok (keluar)
  { keyword: 'shopee', code: '5107', direction: 'out' }, { keyword: 'tokopedia', code: '5107', direction: 'out' },
  { keyword: 'supplier', code: '5107' }, { keyword: 'belanja', code: '5107' },
  // Kas & prive
  { keyword: 'tarik tunai', code: '1101' }, { keyword: 'setor tunai', code: '1101' }, { keyword: 'atm', code: '1101' },
  { keyword: 'prive', code: '3103' }, { keyword: 'penarikan pemilik', code: '3103' },
];

// Saran akun lawan untuk mutasi bank dari keterangan (dipakai bila tak ada aturan tersimpan).
export function suggestBankAccount(desc, direction) {
  const s = String(desc || '').toLowerCase();
  const dir = direction === 'in' ? 'in' : (direction === 'out' ? 'out' : '');
  const hit = BANK_RULE_PRESETS.find(r =>
    s.includes(r.keyword) && (!r.direction || !dir || r.direction === dir));
  if (hit) return hit.code;
  return dir === 'in' ? '4190' : '5199';
}

// PPh Final UMKM (PP 23/2018): 0,5% dari omzet bruto bila omzet setahun ≤ Rp4,8 M.
// Di atas plafon → tidak berhak; wajib tarif umum (konsultasi konsultan pajak).
export function pphFinalForYear(omzet) {
  const o = Math.max(Number(omzet) || 0, 0);
  const eligible = o <= PPH_THRESHOLD;
  return { eligible, rate: PPH_FINAL_RATE, pph: eligible ? Math.round(o * PPH_FINAL_RATE) : 0 };
}
