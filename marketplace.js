// marketplace.js — Import pesanan/daftar produk (Shopee/TikTok/Tokopedia) &
// parser pesanan WhatsApp. Semua fungsi MURNI (tanpa DOM/storage) agar bisa di-test.

// Pisahkan CSV/TSV dengan dukungan tanda kutip. Deteksi delimiter otomatis.
export function parseDelimited(text, delim) {
  const t = String(text || '').replace(/\r\n?/g, '\n');
  const firstLine = t.split('\n')[0] || '';
  const d = delim || (firstLine.includes('\t') ? '\t'
    : firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

// Tebak kolom dari nama header (multi-bahasa, toleran).
export function autoMapColumns(headers) {
  const H = (headers || []).map(h => String(h || '').toLowerCase());
  const find = (res) => H.findIndex(h => res.some(re => re.test(h)));
  return {
    order: find([/no\.?\s*pesan/, /order/, /pesanan/, /invoice/, /no\.?\s*order/]),
    sku: find([/seller.?sku/, /\bsku\b/, /kode barang/, /kode/]),
    name: find([/nama produk/, /nama barang/, /produk/, /barang/, /item/]),
    qty: find([/qty/, /jumlah/, /kuantitas/]),
    price: find([/harga satuan/, /harga produk/, /harga/, /price/, /total harga/]),
    date: find([/tanggal pesanan/, /waktu pesanan/, /tanggal/, /waktu/, /date/, /created/]),
    buyer: find([/pembeli/, /buyer/, /penerima/, /username/]),
    status: find([/status pesanan/, /status/]),
  };
}

// Angka rupiah toleran: "Rp15.000" / "15,000" / "15000" → 15000.
export function parseNum(s) {
  const digits = String(s == null ? '' : s).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

// Normalisasi tanggal ke YYYY-MM-DD. YYYY-MM-DD..., DD/MM/YYYY, DD-MM-YYYY.
export function parseDate(s, fallback) {
  const t = String(s || '').trim();
  let m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return fallback || new Date().toISOString().split('T')[0];
}

// Baris data (tanpa header) + mapping indeks → daftar pesanan per Order ID.
export function buildOrders(dataRows, mapping, fallbackDate) {
  const m = mapping || {};
  const get = (row, idx) => (idx >= 0 && idx != null && row[idx] != null) ? String(row[idx]).trim() : '';
  const orders = new Map();
  (dataRows || []).forEach((row, i) => {
    const orderId = get(row, m.order);
    const sku = get(row, m.sku);
    const name = get(row, m.name);
    const qty = m.qty >= 0 ? parseNum(get(row, m.qty)) : 1;
    const price = m.price >= 0 ? parseNum(get(row, m.price)) : 0;
    const date = parseDate(get(row, m.date), fallbackDate);
    const buyer = get(row, m.buyer);
    const status = get(row, m.status);
    const key = orderId || ('BARIS-' + (i + 1));
    if (!orders.has(key)) orders.set(key, { orderId: key, date, buyer, status, lines: [] });
    if (name || sku) orders.get(key).lines.push({ sku, name, qty: qty > 0 ? qty : 1, price });
  });
  return [...orders.values()];
}

function norm(s) { return String(s || '').trim().toLowerCase(); }

// Cocokkan baris ke item stok: SKU dulu, lalu nama persis, lalu nama mengandung.
export function matchItem(line, items) {
  const list = Array.isArray(items) ? items : [];
  const sku = norm(line && line.sku);
  const name = norm(line && line.name);
  if (sku) { const a = list.find(i => norm(i.sku) === sku); if (a) return a; }
  if (name) {
    const b = list.find(i => norm(i.name) === name);
    if (b) return b;
    const c = list.find(i => norm(i.name) && (norm(i.name).includes(name) || name.includes(norm(i.name))));
    if (c) return c;
  }
  return null;
}

// Tempelkan itemId + harga (pakai harga jual bila kosong). Return pesanan baru.
export function resolveOrders(orders, items) {
  let matched = 0, unmatched = 0;
  const out = (orders || []).map(o => {
    const lines = (o.lines || []).map(l => {
      const it = matchItem(l, items);
      if (it) matched++; else unmatched++;
      return { ...l, itemId: it ? it.id : null, name: it ? it.name : l.name, price: Number(l.price) || (it ? Number(it.price) || 0 : 0) };
    });
    const total = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
    return { ...o, lines, total };
  });
  return { orders: out, matched, unmatched };
}

// Parser pesanan WhatsApp/offline. Baris dipisah newline/; (boleh koma antar item).
// Contoh: "2x Kopi 15000", "1 Teh @8000", "Kopi Susu 3x 20000".
export function parseWaOrder(text, items, opts = {}) {
  const raw = String(text || '').split(/[\n;]+/).map(l => l.trim()).filter(Boolean);
  const out = { orderId: opts.orderId || ('WA-' + Date.now().toString(36)), date: opts.date || new Date().toISOString().split('T')[0], buyer: opts.buyer || '', lines: [], unmatched: [] };
  raw.forEach(line => {
    let s = line;
    let qty = 0;
    let m = s.match(/^(\d+)\s*[x×]\s*(.+)$/i);
    if (m) { qty = Number(m[1]) || 1; s = m[2]; }
    else { m = s.match(/^(.+?)\s+(\d+)\s*[x×]$/i); if (m) { s = m[1]; qty = Number(m[2]) || 1; } }
    if (!qty) { m = s.match(/^(\d+)\s+(.+)$/); if (m) { qty = Number(m[1]) || 1; s = m[2]; } }
    if (!qty) qty = 1;
    let price = 0;
    const p = s.match(/\s*(?:@|rp\.?\s*)?(\d[\d.,]*)\s*(rb|ribu|k|jt|juta)?\s*$/i);
    if (p) {
      price = parseNum(p[1]);
      const unit = (p[2] || '').toLowerCase();
      if (unit === 'rb' || unit === 'ribu' || unit === 'k') price *= 1000;
      else if (unit === 'jt' || unit === 'juta') price *= 1000000;
      s = s.slice(0, p.index).trim();
    }
    const name = s.replace(/[.,;:]+$/, '').trim();
    if (!name) return;
    const it = matchItem({ name }, items);
    if (!it) out.unmatched.push(name);
    out.lines.push({ itemId: it ? it.id : null, name: it ? it.name : name, qty, price: price || (it ? Number(it.price) || 0 : 0) });
  });
  out.total = out.lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  return out;
}

// Baris produk (CSV/Excel) → daftar produk siap impor. Header auto-deteksi.
export function buildProducts(dataRows, mapping, fallbackHeaderMap) {
  const m = mapping || fallbackHeaderMap || {};
  const get = (row, idx) => (idx >= 0 && idx != null && row[idx] != null) ? String(row[idx]).trim() : '';
  const out = [];
  (dataRows || []).forEach(row => {
    const name = get(row, m.name);
    if (!name) return;
    out.push({
      name,
      sku: get(row, m.sku),
      price: m.price >= 0 ? parseNum(get(row, m.price)) : 0,
      cost: m.cost >= 0 ? parseNum(get(row, m.cost)) : 0,
      stock: m.stock >= 0 ? parseNum(get(row, m.stock)) : 0,
      minStock: m.min >= 0 ? parseNum(get(row, m.min)) : 0,
    });
  });
  return out;
}

export function autoMapProductColumns(headers) {
  const H = (headers || []).map(h => String(h || '').toLowerCase());
  const find = (res) => H.findIndex(h => res.some(re => re.test(h)));
  return {
    name: find([/nama produk/, /nama barang/, /nama/, /produk/, /barang/, /item/]),
    sku: find([/sku/, /kode/]),
    price: find([/harga jual/, /harga/, /price/, /jual/]),
    cost: find([/modal/, /hpp/, /harga beli/, /cost/]),
    stock: find([/stok/, /stock/, /qty/, /jumlah/]),
    min: find([/min/, /minimum/]),
  };
}
