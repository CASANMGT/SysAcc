// files.js — Lampiran (PI, packing list, BL/AWB, screenshot chat, foto barang).
// Gambar dikompres dulu (maks 1600 px, JPEG 0.75). Disimpan di IndexedDB;
// bila IDB tidak tersedia (atau berkas kecil), fallback ke localStorage dengan batas ukuran.
// Semua fungsi mengembalikan metadata {id, name, type, size, kind, at} — bukan blob — agar
// mudah ditempel di record belanja/koli/muatan/pesanan/pengiriman.
const DB_NAME = 'wynara-files';
const STORE = 'files';
const LS_PREFIX = 'wynara_file_';
const MAX_STORE_BYTES = 900 * 1024;   // batas per berkas setelah kompresi (fallback localStorage)
const MAX_W = 1600;

function uid() { return 'F' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch {} };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open'));
  });
}
function idbTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(STORE, mode); } catch (e) { reject(e); return; }
    let req;
    try { req = fn(t.objectStore(STORE)); } catch (e) { reject(e); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-tx'));
  });
}

// Kompres gambar via canvas; kembalikan dataURL. Jika bukan gambar / canvas tak ada, kembalikan apa adanya.
export async function compressImage(dataUrl, { maxW = MAX_W, quality = 0.75 } = {}) {
  if (!/^data:image\//.test(dataUrl || '')) return dataUrl;
  if (/^data:image\/(gif|webp)/.test(dataUrl)) return dataUrl;
  try {
    const img = await new Promise((res, rej) => {
      const i = document.createElement('img');
      const t = setTimeout(() => rej(new Error('timeout')), 4000); // jangan menggantung bila gambar tak pernah load
      i.onload = () => { clearTimeout(t); res(i); };
      i.onerror = () => { clearTimeout(t); rej(new Error('img')); };
      i.src = dataUrl;
    });
    const scale = Math.min(1, maxW / Math.max(img.width || maxW, 1));
    const w = Math.max(Math.round((img.width || maxW) * scale), 1);
    const h = Math.max(Math.round((img.height || maxW) * scale), 1);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('baca-berkas'));
    r.readAsDataURL(file);
  });
}

// Simpan berkas. Terima File atau {name, type, dataUrl}.
export async function saveFile(input, { compress = true } = {}) {
  let name = '', type = '', dataUrl = '';
  if (input instanceof Blob) {
    name = String(input.name || 'lampiran');
    type = String(input.type || '');
    dataUrl = await fileToDataUrl(input);
  } else {
    name = String((input && input.name) || 'lampiran');
    type = String((input && input.type) || '');
    dataUrl = String((input && input.dataUrl) || '');
  }
  if (!dataUrl) throw new Error('Berkas kosong');
  if (compress) dataUrl = await compressImage(dataUrl);
  const id = uid();
  const meta = {
    id, name: name.slice(0, 80), type: type || (dataUrl.slice(0, 20).includes('image') ? 'image' : 'file'),
    size: dataUrl.length, kind: /^data:image\//.test(dataUrl) ? 'image' : 'file',
    at: new Date().toISOString(),
  };
  if (dataUrl.length > MAX_STORE_BYTES) throw new Error('Berkas terlalu besar (maks ±900 KB setelah kompresi)');
  try {
    const db = await openDb();
    await idbTx(db, 'readwrite', (s) => s.put({ ...meta, dataUrl }, id));
    try { db.close(); } catch {}
    return meta;
  } catch {
    // Fallback: localStorage (hanya untuk berkas kecil).
    try { localStorage.setItem(LS_PREFIX + id, JSON.stringify({ ...meta, dataUrl })); } catch { throw new Error('Penyimpanan lampiran penuh'); }
    return meta;
  }
}

export async function getFile(id) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    if (raw) return JSON.parse(raw);
  } catch {}
  try {
    const db = await openDb();
    const v = await idbTx(db, 'readonly', (s) => s.get(id));
    try { db.close(); } catch {}
    return v || null;
  } catch { return null; }
}

export async function deleteFile(id) {
  try { localStorage.removeItem(LS_PREFIX + id); } catch {}
  try {
    const db = await openDb();
    await idbTx(db, 'readwrite', (s) => s.delete(id));
    try { db.close(); } catch {}
  } catch {}
  return true;
}

// ---------- Tautan lampiran ke record ----------
// Segmen: 'belanja' | 'koli' | 'muatan' | 'pesanan' | 'pengiriman'
const KEY_FOR = { belanja: 'wynara_belanja', koli: 'wynara_koli', muatan: 'wynara_muatan', pesanan: 'wynara_preorders', pengiriman: 'wynara_shipments' };
function readList(k) { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }

export function attachTo(seg, id, meta) {
  const key = KEY_FOR[seg];
  if (!key) throw new Error('Jenis lampiran tidak dikenal');
  const list = readList(key);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Data tidak ditemukan');
  list[i].attachments = (list[i].attachments || []).concat(meta);
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { throw new Error('Gagal menyimpan lampiran'); }
  return list[i].attachments;
}

export async function detachFrom(seg, id, fileId) {
  const key = KEY_FOR[seg];
  if (!key) throw new Error('Jenis lampiran tidak dikenal');
  const list = readList(key);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error('Data tidak ditemukan');
  list[i].attachments = (list[i].attachments || []).filter((a) => a && a.id !== fileId);
  try { localStorage.setItem(key, JSON.stringify(list)); } catch {}
  try { await deleteFile(fileId); } catch {}
  return list[i].attachments;
}
