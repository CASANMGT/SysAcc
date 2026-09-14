// bankmatch.js — Mesin pencocokan mutasi bank ↔ transaksi tercatat (rekonsiliasi).
// Murni & deterministik supaya bisa diuji tanpa DOM.

export function entryDirection(entry) {
  return entry && entry.type === 'income' ? 'in' : 'out';
}

function withinDays(a, b, days) {
  const da = new Date(a), db = new Date(b);
  if (isNaN(da) || isNaN(db)) return false;
  return Math.abs((da - db) / 86400000) <= days;
}

// Untuk tiap baris mutasi bank, cari kandidat transaksi yang belum terpakai:
// arah sama, nominal sama, tanggal dalam ±days.
export function suggestMatches(statements, entries, { days = 3 } = {}) {
  const list = Array.isArray(statements) ? statements : [];
  const all = Array.isArray(entries) ? entries : [];
  const used = new Set(list.filter(s => s && s.matchedId).map(s => s.matchedId));
  return list.map(s => {
    const item = { stmt: s, match: null, candidates: [] };
    if (!s) return item;
    if (s.matchedId) { item.match = all.find(e => e.id === s.matchedId) || null; return item; }
    if (s.posted || s.ignored) return item;
    item.candidates = all.filter(e =>
      e && !used.has(e.id) &&
      entryDirection(e) === s.direction &&
      Math.round(Number(e.amount) || 0) === Math.round(Number(s.amount) || 0) &&
      withinDays(e.date, s.date, days)
    ).sort((a, b) => Math.abs(new Date(a.date) - new Date(s.date)) - Math.abs(new Date(b.date) - new Date(s.date)));
    return item;
  });
}

// Ringkasan rekonsiliasi.
export function reconSummary(results) {
  let matched = 0, pending = 0, posted = 0, ignored = 0, unmatched = 0;
  (results || []).forEach(r => {
    const s = r.stmt || {};
    if (s.posted) posted++;
    else if (s.ignored) ignored++;
    else if (r.match) matched++;
    else if (r.candidates && r.candidates.length) pending++;
    else unmatched++;
  });
  return { matched, pending, posted, ignored, unmatched, total: (results || []).length };
}

// Saran ATURAN dari mutasi nyata: kelompokkan mutasi yang belum diproses menurut
// kata pertama + arah, usulkan akun yang paling sering dipakai di kelompok tsb.
export function suggestRules(statements) {
  const groups = new Map();
  (statements || []).forEach(s => {
    if (!s || s.posted || s.matchedId || s.ignored) return;
    const tokens = String(s.desc || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(t => t.length >= 3);
    if (!tokens.length) return;
    const key = `${tokens[0]}|${s.direction || ''}`;
    if (!groups.has(key)) groups.set(key, { keyword: tokens[0], direction: s.direction || '', count: 0, total: 0, codes: new Map() });
    const g = groups.get(key);
    g.count++; g.total += Number(s.amount) || 0;
    if (s.counterAccount) g.codes.set(s.counterAccount, (g.codes.get(s.counterAccount) || 0) + 1);
  });
  const out = [];
  groups.forEach(g => {
    const top = [...g.codes.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({ keyword: g.keyword, direction: g.direction, count: g.count, total: g.total, code: top ? top[0] : '' });
  });
  return out.sort((a, b) => b.count - a.count);
}
