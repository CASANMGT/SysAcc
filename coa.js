// coa.js — Chart of Accounts (chart "PT Wynara Living Atelier") + pemetaan.
// Setiap pembayaran & kategori dipetakan ke akun. Jurnal selalu balance.

export const ACCOUNTS = [
  // Kas & Bank
  { code: '1101', name: 'Bank BCA', type: 'asset', payment: 'transfer' },
  { code: '1102', name: 'Wallet Shopee', type: 'asset', payment: 'ewallet' },
  { code: '1103', name: 'Wallet Tokopedia', type: 'asset' },
  { code: '1104', name: 'Petty Cash', type: 'asset', payment: 'cash' },
  { code: '1105', name: 'Inventory', type: 'asset' },
  { code: '1106', name: 'QRIS', type: 'asset', payment: 'qris' },
  { code: '1107', name: 'Kartu Debit', type: 'asset', payment: 'debit' },
  { code: '1108', name: 'Bank Mandiri', type: 'asset' },
  { code: '1109', name: 'Bank BRI', type: 'asset' },
  { code: '1110', name: 'Kas Lainnya', type: 'asset', payment: 'other' },
  { code: '1111', name: 'Deposito / Tabungan Berjangka', type: 'asset' },
  { code: '1112', name: 'Bank BNI', type: 'asset' },
  { code: '1113', name: 'GoPay', type: 'asset' },
  { code: '1114', name: 'OVO', type: 'asset' },
  { code: '1115', name: 'DANA', type: 'asset' },
  { code: '1116', name: 'LinkAja', type: 'asset' },
  // Piutang & persediaan
  { code: '1201', name: 'Account Receivable', type: 'asset' },
  { code: '1202', name: 'Employee Loan', type: 'asset' },
  { code: '1203', name: 'Other Receivable', type: 'asset' },
  { code: '1302', name: 'Perlengkapan (Supplies)', type: 'asset' },
  { code: '1401', name: 'PPN Masukan', type: 'asset' },
  // Aset tetap & akumulasi penyusutan (kontra-aset, tampil minus di Neraca)
  { code: '1510', name: 'Aset Tetap', type: 'asset' },
  { code: '1519', name: 'Akumulasi Penyusutan', type: 'asset' },
  { code: '1520', name: 'Peralatan & Mesin', type: 'asset' },
  { code: '1521', name: 'Kendaraan', type: 'asset' },
  { code: '1522', name: 'Bangunan', type: 'asset' },
  // Kewajiban
  { code: '2101', name: 'Customer Deposit', type: 'liability' },
  { code: '2102', name: 'Account Payable', type: 'liability' },
  { code: '2103', name: 'PPh 21 Payable', type: 'liability' },
  { code: '2104', name: 'PPh 23 Payable', type: 'liability' },
  { code: '2105', name: 'PPN Keluaran', type: 'liability' },
  { code: '2106', name: 'PPh Final Terutang', type: 'liability' },
  { code: '2107', name: 'Hutang Gaji', type: 'liability' },
  { code: '2108', name: 'Hutang BPJS', type: 'liability' },
  { code: '2109', name: 'Hutang Kartu Kredit', type: 'liability', payment: 'credit' },
  { code: '2110', name: 'Hutang Paylater', type: 'liability', payment: 'paylater' },
  { code: '2111', name: 'Hutang Pajak Lainnya', type: 'liability' },
  { code: '2112', name: 'Hutang Lain-lain', type: 'liability' },
  // Modal
  { code: '3101', name: 'Owner Capital', type: 'equity' },
  { code: '3102', name: 'Laba Ditahan', type: 'equity' },
  { code: '3103', name: 'Prive / Penarikan Pemilik', type: 'equity' },
  // Pendapatan
  { code: '4101', name: 'Shopee Sales', type: 'revenue' },
  { code: '4102', name: 'Tokopedia Sales', type: 'revenue' },
  { code: '4103', name: 'Offline Sales', type: 'revenue' },
  { code: '4104', name: 'Other Sales', type: 'revenue' },
  { code: '4190', name: 'Pendapatan Bunga', type: 'revenue' },
  { code: '4191', name: 'Pendapatan Jasa', type: 'revenue' },
  { code: '4192', name: 'Pendapatan Lainnya', type: 'revenue' },
  // Harga pokok
  { code: '5109', name: 'Harga Pokok Penjualan', type: 'expense' },
  // Beban operasional
  { code: '5101', name: 'Beban Sewa', type: 'expense', category: 'kos' },
  { code: '5102', name: 'Beban Utilitas', type: 'expense', category: 'utilitas' },
  { code: '5103', name: 'Beban Konsumsi', type: 'expense', category: 'makanan' },
  { code: '5104', name: 'Beban Transportasi', type: 'expense', category: 'transport' },
  { code: '5106', name: 'Beban Kesehatan', type: 'expense', category: 'kesehatan' },
  { code: '5107', name: 'Beban Belanja Barang', type: 'expense', category: 'belanja' },
  { code: '5108', name: 'Beban Pendidikan', type: 'expense', category: 'pendidikan' },
  { code: '5113', name: 'Beban Bunga', type: 'expense' },
  { code: '5117', name: 'Beban Perlengkapan', type: 'expense', category: 'perlengkapan' },
  { code: '5118', name: 'Beban Komunikasi & Internet', type: 'expense', category: 'komunikasi' },
  { code: '5119', name: 'Beban Asuransi', type: 'expense', category: 'asuransi' },
  { code: '5120', name: 'Beban Pemeliharaan', type: 'expense', category: 'pemeliharaan' },
  { code: '5121', name: 'Beban Jasa Profesional', type: 'expense', category: 'jasa' },
  { code: '5122', name: 'Beban Pajak & Retribusi', type: 'expense', category: 'pajak' },
  { code: '5123', name: 'Beban Sumbangan', type: 'expense', category: 'sumbangan' },
  { code: '5129', name: 'Beban Penyusutan', type: 'expense' },
  { code: '5199', name: 'Beban Lainnya', type: 'expense' },
  // Beban perusahaan (62xx)
  { code: '6201', name: 'Salary Expense', type: 'expense', category: 'gaji-out' },
  { code: '6202', name: 'THR Expense', type: 'expense' },
  { code: '6203', name: 'BPJS TK Expense', type: 'expense' },
  { code: '6204', name: 'BPJS Kes Expense', type: 'expense' },
  { code: '6205', name: 'Bank Admin Fee', type: 'expense', category: 'adm_bank' },
  { code: '6206', name: 'Entertainment Expense', type: 'expense', category: 'hiburan' },
  { code: '6207', name: 'Marketing & Ads Expense', type: 'expense', category: 'iklan' },
  { code: '6208', name: 'Shipping & Logistic Expense', type: 'expense', category: 'kirim' },
  { code: '6209', name: 'PPh 21 Expense', type: 'expense' },
];

// Akun custom (dari penyimpanan, digabung dengan bawaan). Diisi via setCustomAccounts().
let customAccounts = [];

export function setCustomAccounts(list) {
  customAccounts = Array.isArray(list) ? list.filter(a => a && /^\d{4}$/.test(a.code)) : [];
}

// Alias nama untuk akun bawaan (mis. 1101 → "Bank BCA"). Kode/type tidak berubah.
let coaAliases = {};
export function setCoaAliases(map) { coaAliases = (map && typeof map === 'object') ? map : {}; }
function withAlias(a) {
  const n = coaAliases[a.code];
  return n ? { ...a, name: String(n).slice(0, 60) } : a;
}

export function getAccounts() {
  const seen = new Set();
  const out = [];
  customAccounts.forEach(a => { seen.add(a.code); out.push(a); });
  ACCOUNTS.forEach(a => { if (!seen.has(a.code)) out.push(a); });
  return out.map(withAlias);
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
  return (found || { code: '1104' }).code;
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
export const AP_ACCOUNT = '2102';
export const INVENTORY_ACCOUNT = '1105';
export const COGS_ACCOUNT = '5109';
export const SALARY_EXPENSE = '6201';
export const SALARY_PAYABLE = '2107';
export const PPN_OUT = '2105';
export const PPN_IN = '1401';
export const PPH_PAYABLE = '2106';
export const PPH_EXPENSE = '6209';
export const EQUITY_ACCOUNT = '3101';
export const INTEREST_INCOME = '4190';
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
  { keyword: 'biaya adm', code: '6205' }, { keyword: 'adm bank', code: '6205' }, { keyword: 'biaya admin', code: '6205' },
  { keyword: 'materai', code: '6205' }, { keyword: 'provisi', code: '6205' }, { keyword: 'fee', code: '6205' },
  { keyword: 'bunga', code: '4190', direction: 'in' }, { keyword: 'bunga', code: '5113', direction: 'out' },
  { keyword: 'angsuran', code: '2112' }, { keyword: 'cicilan', code: '2112' }, { keyword: 'kredit', code: '2112' },
  // Utilitas & komunikasi
  { keyword: 'listrik', code: '5102' }, { keyword: 'pln', code: '5102' }, { keyword: 'token', code: '5102' },
  { keyword: 'pdam', code: '5102' }, { keyword: 'indihome', code: '5118' },
  { keyword: 'telkom', code: '5118' }, { keyword: 'internet', code: '5118' }, { keyword: 'wifi', code: '5118' },
  { keyword: 'pulsa', code: '5118' }, { keyword: 'kuota', code: '5118' }, { keyword: 'telkomsel', code: '5118' },
  { keyword: 'indosat', code: '5118' }, { keyword: 'xl', code: '5118' }, { keyword: 'tri', code: '5118' },
  // Sewa & operasional
  { keyword: 'sewa', code: '5101' }, { keyword: 'rent', code: '5101' }, { keyword: 'kontrakan', code: '5101' },
  { keyword: 'gaji', code: '6201' }, { keyword: 'payroll', code: '6201' }, { keyword: 'upah', code: '6201' }, { keyword: 'honor', code: '6201' },
  { keyword: 'bpjs', code: '6203' },
  { keyword: 'iklan', code: '6207' }, { keyword: 'ads', code: '6207' }, { keyword: 'google ads', code: '6207' },
  { keyword: 'facebook', code: '6207' }, { keyword: 'promosi', code: '6207' }, { keyword: 'endorse', code: '6207' },
  { keyword: 'asuransi', code: '5119' }, { keyword: 'insurance', code: '5119' },
  { keyword: 'servis', code: '5120' }, { keyword: 'service', code: '5120' }, { keyword: 'perbaikan', code: '5120' }, { keyword: 'maintenance', code: '5120' },
  { keyword: 'notaris', code: '5121' }, { keyword: 'konsultan', code: '5121' }, { keyword: 'akuntan', code: '5121' }, { keyword: 'pengacara', code: '5121' },
  { keyword: 'percetakan', code: '5117' }, { keyword: 'fotokopi', code: '5117' }, { keyword: 'atk', code: '5117' },
  { keyword: 'kirim', code: '6208' }, { keyword: 'ekspedisi', code: '6208' }, { keyword: 'ongkir', code: '6208' }, { keyword: 'logistik', code: '6208' },
  { keyword: 'sumbangan', code: '5123' }, { keyword: 'donasi', code: '5123' }, { keyword: 'zakat', code: '5123' },
  { keyword: 'pajak', code: '2103' }, { keyword: 'pph', code: '2103' }, { keyword: 'setor ppn', code: '2105' },
  // Penjualan / marketplace (masuk)
  { keyword: 'qris', code: '4101', direction: 'in' }, { keyword: 'settlement', code: '4101', direction: 'in' },
  { keyword: 'penjualan', code: '4101', direction: 'in' }, { keyword: 'omzet', code: '4101', direction: 'in' },
  { keyword: 'shopee', code: '4101', direction: 'in' },
  { keyword: 'tokopedia', code: '4102', direction: 'in' },
  { keyword: 'tiktok', code: '4102', direction: 'in' }, { keyword: 'lazada', code: '4104', direction: 'in' },
  // Belanja stok (keluar)
  { keyword: 'shopee', code: '5107', direction: 'out' }, { keyword: 'tokopedia', code: '5107', direction: 'out' },
  { keyword: 'supplier', code: '5107' }, { keyword: 'belanja', code: '5107' },
  // Kas & prive
  { keyword: 'tarik tunai', code: '1104' }, { keyword: 'setor tunai', code: '1104' }, { keyword: 'atm', code: '1104' },
  { keyword: 'prive', code: '3103' }, { keyword: 'penarikan pemilik', code: '3103' },
];

// Peta renumber COA (kode lama → kode baru) — migrasi satu kali.
export const COA_RENUMBER = {
  '1101': '1104', '1102': '1101', '1103': '1106', '1104': '1102', '1105': '1107',
  '1106': '1101', '1107': '1108', '1108': '1109', '1109': '1110', '1110': '1111',
  '1111': '1112', '1112': '1102', '1113': '1113', '1114': '1114', '1115': '1115',
  '1116': '1103', '1117': '1116', '1120': '1104',
  '1301': '1105',
  '1201': '1201', '1202': '1202', '1203': '1203', '1302': '1302', '1401': '1401',
  '1510': '1510', '1519': '1519', '1520': '1520', '1521': '1521', '1522': '1522',
  '2101': '2109', '2102': '2110', '2103': '2102', '2104': '2107', '2105': '2105',
  '2106': '2106', '2107': '2104', '2110': '2108', '2201': '2103', '2202': '2101',
  '3101': '3101', '3102': '3102', '3103': '3103',
  '4101': '4101', '4102': '4190', '4103': '4191', '4190': '4192',
  '5101': '5101', '5102': '5102', '5103': '5103', '5104': '5104', '5105': '6206',
  '5106': '5106', '5107': '5107', '5108': '5108', '5109': '5109', '5110': '6201',
  '5111': '6209', '5112': '6203', '5113': '5113', '5114': '6205', '5115': '5113',
  '5116': '6207', '5117': '5117', '5118': '5118', '5119': '5119', '5120': '5120',
  '5121': '5121', '5122': '5122', '5123': '5123', '5129': '5129', '5199': '5199',
};

// Saran akun lawan untuk mutasi bank dari keterangan (dipakai bila tak ada aturan tersimpan).
// Mesin: kata kunci terpanjang + kecocokan batas-kata menang (lebih spesifik lebih baik).
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function keywordScore(keyword, s) {
  if (!s.includes(keyword)) return 0;
  const word = new RegExp('(^|[^a-z0-9])' + escapeRegex(keyword) + '([^a-z0-9]|$)');
  return word.test(s) ? 100 + keyword.length : 10 + keyword.length;
}
export function suggestBankAccountFull(desc, direction) {
  const s = String(desc || '').toLowerCase();
  const dir = direction === 'in' ? 'in' : (direction === 'out' ? 'out' : '');
  let best = null;
  BANK_RULE_PRESETS.forEach(p => {
    if (!(!p.direction || !dir || p.direction === dir)) return;
    const sc = keywordScore(p.keyword, s);
    if (sc > 0 && (!best || sc > best.score)) best = { code: p.code, keyword: p.keyword, score: sc };
  });
  if (best) return { code: best.code, source: 'preset', keyword: best.keyword };
  return { code: dir === 'in' ? '4192' : '5199', source: 'default', keyword: '' };
}
export function suggestBankAccount(desc, direction) {
  return suggestBankAccountFull(desc, direction).code;
}

// Parse COA dari tempelan Excel/CSV: "Kode; Nama Akun; Kategori" (pemisah ; TAB ,).
export function parseCoaCsv(text, existingCodes) {
  const TYPE_MAP = {
    asset: 'asset', aset: 'asset', 'aset lancar': 'asset', 'aset tetap': 'asset',
    liability: 'liability', kewajiban: 'liability', hutang: 'liability', utang: 'liability',
    equity: 'equity', modal: 'equity', ekuitas: 'equity',
    revenue: 'revenue', pendapatan: 'revenue', income: 'revenue', penjualan: 'revenue',
    expense: 'expense', beban: 'expense', biaya: 'expense', 'harga pokok': 'expense',
  };
  const have = new Set((existingCodes || []).map(String));
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const accounts = [], skipped = [], collide = [];
  lines.forEach(line => {
    let cols = line.split(/[;\t]/).map(s => s.trim()).filter(s => s !== '');
    if (cols.length < 2) cols = line.split(',').map(s => s.trim()).filter(s => s !== '');
    const code = (String(cols[0] || '').match(/\d{4}/) || [])[0];
    const name = String(cols[1] || '').replace(/[<>"'&]/g, '').trim().slice(0, 60);
    const type = TYPE_MAP[String(cols[2] || '').toLowerCase().trim()] || 'expense';
    if (!code || !name) { skipped.push(line); return; }
    if (have.has(code)) { collide.push(line); return; }
    accounts.push({ code, name, type });
  });
  return { accounts, skipped, collide };
}

// PPh Final UMKM (PP 23/2018): 0,5% dari omzet bruto bila omzet setahun ≤ Rp4,8 M.
export function pphFinalForYear(omzet) {
  const o = Math.max(Number(omzet) || 0, 0);
  const eligible = o <= PPH_THRESHOLD;
  return { eligible, rate: PPH_FINAL_RATE, pph: eligible ? Math.round(o * PPH_FINAL_RATE) : 0 };
}
