// coa.js — Chart of Accounts (SAK EMKM sederhana) + pemetaan.
// Setiap pembayaran & kategori dipetakan ke akun. Jurnal selalu balance.

export const ACCOUNTS = [
  // Kas & setara kas (1:1 dengan cara bayar → cocok dengan panel Dompet)
  { code: '1101', name: 'Kas Tunai', type: 'asset', payment: 'cash' },
  { code: '1102', name: 'Bank Transfer', type: 'asset', payment: 'transfer' },
  { code: '1103', name: 'QRIS', type: 'asset', payment: 'qris' },
  { code: '1104', name: 'E-Wallet', type: 'asset', payment: 'ewallet' },
  { code: '1105', name: 'Kartu Debit', type: 'asset', payment: 'debit' },
  { code: '1109', name: 'Kas Lainnya', type: 'asset', payment: 'other' },
  // Piutang & persediaan
  { code: '1201', name: 'Piutang Usaha', type: 'asset' },
  { code: '1301', name: 'Persediaan Barang', type: 'asset' },
  { code: '1401', name: 'PPN Masukan', type: 'asset' },
  // Aset tetap & akumulasi penyusutan (kontra-aset, tampil minus di Neraca)
  { code: '1510', name: 'Aset Tetap', type: 'asset' },
  { code: '1519', name: 'Akumulasi Penyusutan', type: 'asset' },
  // Kewajiban
  { code: '2101', name: 'Hutang Kartu Kredit', type: 'liability', payment: 'credit' },
  { code: '2102', name: 'Hutang Paylater', type: 'liability', payment: 'paylater' },
  { code: '2103', name: 'Hutang Usaha', type: 'liability' },
  { code: '2104', name: 'Hutang Gaji', type: 'liability' },
  { code: '2105', name: 'PPN Keluaran', type: 'liability' },
  { code: '2106', name: 'PPh Final Terutang', type: 'liability' },
  { code: '2110', name: 'Hutang BPJS', type: 'liability' },
  // Modal
  { code: '3101', name: 'Modal Awal', type: 'equity' },
  { code: '3102', name: 'Laba Ditahan', type: 'equity' },
  // Pendapatan
  { code: '4101', name: 'Pendapatan Usaha', type: 'revenue' },
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
export const PPN_RATE = 0.11;
export const PPH_FINAL_RATE = 0.005;
export const PPH_THRESHOLD = 4800000000;
