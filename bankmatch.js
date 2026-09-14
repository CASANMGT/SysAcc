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
