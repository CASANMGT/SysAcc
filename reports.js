import { totalOwed } from './loanmath.js';

const CURRENCY = 'IDR';
const LOCALE = 'id-ID';

export function filterEntries(entries, { period, type, category, startDate, endDate }) {
  if (!Array.isArray(entries)) return [];
  let filtered = [...entries];

  if (period && period !== 'all') {
    const now = new Date();
    let start = null;
    let end = null;

    if (period === 'this-month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
    } else if (period === 'last-month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setMonth(end.getMonth() + 1);
    } else if (period === 'this-year') {
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear() + 1, 0, 1);
    } else if (period === 'custom') {
      if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
      if (start && end && start > end) {
        const tmp = start; start = end; end = tmp;
        end.setHours(23, 59, 59, 999);
      }
    }

    // Open-ended didukung: cuma start (dari tanggal itu maju) atau cuma end (sampai tanggal itu)
    const s = start && !isNaN(start) ? start : null;
    const en = end && !isNaN(end) ? end : null;
    if (s || en) {
      const from = s || new Date(-8640000000000000);
      const to = en || new Date(8640000000000000);
      filtered = filtered.filter(e => {
        const d = new Date(e.date);
        if (isNaN(d)) return false;
        return d >= from && d <= to;
      });
    }
  }

  if (type && type !== 'all') {
    filtered = filtered.filter(e => e.type === type);
  }

  if (category && category !== 'all') {
    filtered = filtered.filter(e => e.category === category);
  }

  return filtered.sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    const ta = isNaN(da) ? 0 : da.getTime();
    const tb = isNaN(db) ? 0 : db.getTime();
    return tb - ta;
  });
}

export function computeTotals(entries) {
  if (!Array.isArray(entries)) return { income: 0, expense: 0, net: 0, incomeCount: 0, expenseCount: 0 };
  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  entries.forEach(e => {
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') { income += amt; incomeCount++; }
    else { expense += amt; expenseCount++; }
  });
  return { income, expense, net: income - expense, incomeCount, expenseCount };
}

export function computeRunningBalance(entries) {
  if (!Array.isArray(entries) || !entries.length) return [];
  // sort chronologically ascending for correct running balance
  const sortedAsc = [...entries].sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
    const ta = isNaN(da) ? 0 : da.getTime();
    const tb = isNaN(db) ? 0 : db.getTime();
    return ta - tb;
  });
  let balance = 0;
  const withBalAsc = sortedAsc.map(e => {
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') balance += amt;
    else balance -= amt;
    return { ...e, balance };
  });
  // return in descending order (newest first) to match filterEntries order
  return withBalAsc.reverse();
}

export function computeCategoryBreakdown(entries) {
  if (!Array.isArray(entries)) return [];
  const map = new Map();
  entries.forEach(e => {
    if (!e.category) return;
    const key = `${e.type}:${String(e.category).toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, { type: e.type, category: e.category, total: 0, count: 0 });
    }
    const item = map.get(key);
    item.total += Number(e.amount) || 0;
    item.count += 1;
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function computeMonthlySummary(entries) {
  if (!Array.isArray(entries)) return [];
  const map = new Map();
  entries.forEach(e => {
    const date = new Date(e.date);
    if (isNaN(date)) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { month: key, income: 0, expense: 0, count: 0 });
    }
    const m = map.get(key);
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') m.income += amt;
    else m.expense += amt;
    m.count += 1;
  });
  return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
}

export function computeCashflow(entries) {
  if (!Array.isArray(entries)) return [];
  const map = new Map();
  entries.forEach(e => {
    const date = new Date(e.date);
    if (isNaN(date)) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { month: key, income: 0, expense: 0 });
    }
    const m = map.get(key);
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') m.income += amt;
    else m.expense += amt;
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export function computeTopExpenses(entries, limit = 10) {
  if (!Array.isArray(entries)) return [];
  const expenseEntries = entries.filter(e => e.type === 'expense');
  const map = new Map();
  expenseEntries.forEach(e => {
    const desc = String(e.description || '').trim();
    const key = `${e.category}:${desc || '__no_desc__'}`;
    if (!map.has(key)) {
      map.set(key, { category: e.category, description: e.description, total: 0, count: 0 });
    }
    const item = map.get(key);
    item.total += Number(e.amount) || 0;
    item.count += 1;
  });
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function computeDailySummary(entries) {
  if (!Array.isArray(entries)) return [];
  const map = new Map();
  entries.forEach(e => {
    const key = e.date;
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { date: key, income: 0, expense: 0, count: 0 });
    }
    const m = map.get(key);
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') m.income += amt;
    else m.expense += amt;
    m.count += 1;
  });
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

export function formatCurrency(amount) {
  const n = Number(amount);
  const safe = isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: CURRENCY,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(safe);
  } catch {
    return `Rp${safe.toLocaleString('id-ID')}`;
  }
}

export function formatCurrencyCompact(amount) {
  const n = Number(amount);
  if (!isFinite(n)) return formatCurrency(0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp${(abs / 1_000_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp${(abs / 1_000_000).toFixed(1)}jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp${(abs / 1_000).toFixed(1)}rb`;
  }
  return formatCurrency(n);
}

export function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date)) return String(dateStr || '-');
    return date.toLocaleDateString(LOCALE, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return String(dateStr || '-');
  }
}

export function formatMonth(monthStr) {
  try {
    const [year, month] = String(monthStr).split('-').map(Number);
    if (!year || !month) return monthStr;
    const date = new Date(year, month - 1);
    if (isNaN(date)) return monthStr;
    return date.toLocaleDateString(LOCALE, {
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return String(monthStr);
  }
}

export function getCategoryLabel(category) {
  const labels = {
    jualan: 'Jualan',
    gaji: 'Gaji',
    freelance: 'Freelance',
    investasi: 'Investasi',
    hadiah: 'Hadiah',
    'lain-income': 'Lainnya',
    'gaji-out': 'Gaji Karyawan',
    kos: 'Kos/Sewa',
    utilitas: 'Listrik/Air/Internet',
    makanan: 'Makanan',
    transport: 'Transportasi',
    hiburan: 'Hiburan',
    kesehatan: 'Kesehatan',
    belanja: 'Belanja',
    pendidikan: 'Pendidikan',
    'lain-expense': 'Lainnya',
    Piutang: 'Kasih Pinjam',
    Hutang: 'Pinjam Uang'
  };
  return labels[category] || String(category || '-');
}

export function getCategoryIcon(category) {
  const icons = {
    gaji: '💰',
    freelance: '💻',
    investasi: '📈',
    hadiah: '🎁',
    'lain-income': '📦',
    kos: '🏠',
    utilitas: '💡',
    makanan: '🍚',
    transport: '🚌',
    hiburan: '🎮',
    kesehatan: '🏥',
    belanja: '🛍️',
    pendidikan: '📚',
    'lain-expense': '📦',
    Piutang: '🟢',
    Hutang: '🔴'
  };
  return icons[category] || '📦';
}

export function getCategoryType(category) {
  const incomeCategories = ['jualan', 'gaji', 'freelance', 'investasi', 'hadiah', 'lain-income', 'Hutang', 'hutang'];
  return incomeCategories.includes(String(category)) ? 'income' : 'expense';
}

export function getMonthsBetween(startDate, endDate) {
  const months = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end) || start > end) return months;
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= end) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    months.push(key);
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

export const CATEGORY_OPTIONS = {
  income: [
    { value: 'jualan', label: 'Jualan', icon: '🧾' },
    { value: 'gaji', label: 'Gaji', icon: '💰' },
    { value: 'freelance', label: 'Freelance', icon: '💻' },
    { value: 'investasi', label: 'Investasi', icon: '📈' },
    { value: 'hadiah', label: 'Hadiah', icon: '🎁' },
    { value: 'Hutang', label: 'Pinjam Uang', icon: '🔴' }
  ],
  expense: [
    { value: 'gaji-out', label: 'Gaji Karyawan', icon: '💼' },
    { value: 'kos', label: 'Kos/Sewa', icon: '🏠' },
    { value: 'utilitas', label: 'Utilitas', icon: '💡' },
    { value: 'makanan', label: 'Makanan', icon: '🍚' },
    { value: 'transport', label: 'Transport', icon: '🚌' },
    { value: 'hiburan', label: 'Hiburan', icon: '🎮' },
    { value: 'kesehatan', label: 'Kesehatan', icon: '🏥' },
    { value: 'belanja', label: 'Belanja', icon: '🛍️' },
    { value: 'pendidikan', label: 'Pendidikan', icon: '📚' },
    { value: 'Piutang', label: 'Kasih Pinjam', icon: '🟢' }
  ]
};

export const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Tunai', icon: '💵' },
  { value: 'credit', label: 'Kartu Kredit', icon: '💳' },
  { value: 'qris', label: 'QRIS', icon: '📱' },
  { value: 'transfer', label: 'Transfer', icon: '🏦' },
  { value: 'debit', label: 'Debit', icon: '💳' },
  { value: 'ewallet', label: 'E-Wallet', icon: '📲' },
  { value: 'paylater', label: 'Paylater Shopee', icon: '🛒' },
  { value: 'other', label: 'Lainnya', icon: '📦' }
];

export function getPaymentLabel(payment) {
  const found = PAYMENT_OPTIONS.find(p => p.value === payment);
  return found ? found.label : 'Lainnya';
}

export function getPaymentIcon(payment) {
  const found = PAYMENT_OPTIONS.find(p => p.value === payment);
  return found ? found.icon : '📦';
}

export function computeLoanSummary(loans, repayments) {
  if (!Array.isArray(loans)) loans = [];
  if (!Array.isArray(repayments)) repayments = [];
  let piutangTotal = 0;
  let hutangTotal = 0;
  let piutangPaid = 0;
  let hutangPaid = 0;
  let piutangCount = 0;
  let hutangCount = 0;

  loans.forEach(l => {
    const repaid = repayments
      .filter(r => r.loanId === l.id)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const amt = totalOwed(l);
    if (l.direction === 'given') {
      piutangTotal += amt;
      piutangPaid += repaid;
      if (l.status !== 'paid') piutangCount++;
    } else {
      hutangTotal += amt;
      hutangPaid += repaid;
      if (l.status !== 'paid') hutangCount++;
    }
  });

  const piutangOutstanding = Math.max(0, piutangTotal - piutangPaid);
  const hutangOutstanding = Math.max(0, hutangTotal - hutangPaid);

  return {
    piutangTotal,
    hutangTotal,
    piutangOutstanding,
    hutangOutstanding,
    piutangPaid,
    hutangPaid,
    piutangCount,
    hutangCount,
    net: piutangOutstanding - hutangOutstanding
  };
}
