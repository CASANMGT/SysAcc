/* global atob */
// files.js — Lampiran (PI, packing list, BL/AWB, screenshot chat, foto barang).
// Gambar dikompres dulu (maks 1600 px, JPEG 0.75). Disimpan di IndexedDB;
// bila IDB tidak tersedia (atau berkas kecil), fallback ke localStorage dengan batas ukuran.
// Semua fungsi mengembalikan metadata {id, name, type, size, kind, at} — bukan blob — agar
// mudah ditempel di record belanja/koli/muatan/pesanan/pengiriman.
const DB_NAME = 'wynara-files';
const STORE = 'files';
const LS_PREFIX = 'wynara_file_';
// Batas per berkas: IndexedDB sanggup besar, fallback localStorage tidak.
const MAX_IDB_BYTES = 8 * 1024 * 1024;      // 8 MB (dokumen scan multi-halaman)
const MAX_LS_BYTES = 900 * 1024;             // fallback localStorage
const MAX_STORE_BYTES = MAX_IDB_BYTES;       // dipakai pesan & validasi utama
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
  if (dataUrl.length > MAX_STORE_BYTES) throw new Error(`Berkas terlalu besar (maks ${Math.round(MAX_STORE_BYTES / 1048576)} MB per berkas)`);
  try {
    const db = await openDb();
    await idbTx(db, 'readwrite', (s) => s.put({ ...meta, dataUrl }, id));
    try { db.close(); } catch {}
    return meta;
  } catch {
    // Fallback: localStorage — hanya untuk berkas kecil.
    if (dataUrl.length > MAX_LS_BYTES) throw new Error(`Penyimpanan browser penuh untuk berkas ${Math.round(dataUrl.length / 1024)} KB — berkas ini butuh IndexedDB (maks ${Math.round(MAX_LS_BYTES / 1024)} KB di mode fallback)`);
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
    if (v) return v;
  } catch {}
  // Tidak ada di perangkat ini → coba ambil dari server (kalau lampiran pernah disinkronkan).
  const cloud = await cloudGet(id);
  if (cloud) {
    try {
      const db = await openDb();
      await idbTx(db, 'readwrite', (s) => s.put(cloud, id));
      try { db.close(); } catch {}
    } catch {}
    return cloud;
  }
  return null;
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

// ---------- Sinkron lampiran ke Supabase Storage (bucket: wynara-files) ----------
// Butuh bucket privat + policy: authenticated boleh select/insert/update/delete.
// Bila bucket belum ada, fungsi melempar pesan yang menjelaskan cara membuatnya (tidak diam-diam gagal).
import { getCloudConfig, getCloudSession } from './supabase.js';
const BUCKET = 'wynara-files';
const UPLOADED_KEY = 'wynara_files_uploaded';

function uploadedSet() {
  try { const v = JSON.parse(localStorage.getItem(UPLOADED_KEY) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
}
function markUploaded(id) {
  const s = uploadedSet(); s.add(id);
  try { localStorage.setItem(UPLOADED_KEY, JSON.stringify(Array.from(s).slice(-2000))); } catch {}
}
export function cloudFileInfo() {
  const cfg = getCloudConfig();
  const ses = getCloudSession();
  return { configured: !!(cfg && cfg.url), signedIn: !!ses, bucket: BUCKET, uploaded: uploadedSet().size };
}
function dataUrlToBlob(dataUrl, type) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw new Error('Format berkas tidak dikenal');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || m[1] || 'application/octet-stream' });
}
async function cloudPut(rec) {
  const cfg = getCloudConfig();
  const ses = getCloudSession();
  if (!cfg || !ses) throw new Error('Belum masuk akun online — lampiran tidak bisa diunggah');
  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(rec.id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ses.access_token}`, 'Content-Type': rec.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: dataUrlToBlob(rec.dataUrl, rec.type),
  });
  if (res.status === 404 || res.status === 400) {
    const t = await res.text().catch(() => '');
    if (/bucket/i.test(t) || res.status === 404) throw new Error(`Bucket "${BUCKET}" belum ada di Supabase — buat bucket privat dengan nama itu (Storage → New bucket).`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Unggah gagal (${res.status})${t ? ': ' + t.slice(0, 120) : ''}`);
  }
  return true;
}
async function cloudGet(id) {
  const cfg = getCloudConfig();
  const ses = getCloudSession();
  if (!cfg || !ses) return null;
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${ses.access_token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('baca-cloud'));
      r.readAsDataURL(blob);
    });
    return { id, name: id, type: blob.type, kind: /^data:image\//.test(dataUrl) ? 'image' : 'file', size: dataUrl.length, dataUrl, fromCloud: true };
  } catch { return null; }
}
// Unggah semua lampiran lokal yang belum pernah diunggah.
export async function syncFilesToCloud() {
  const all = await exportBlobs();
  const done = uploadedSet();
  let up = 0, fail = 0, firstErr = '';
  for (const rec of all) {
    if (done.has(rec.id)) continue;
    try { await cloudPut(rec); markUploaded(rec.id); up++; }
    catch (e) { fail++; if (!firstErr) firstErr = e && e.message ? e.message : 'gagal'; if (fail > 3) break; }
  }
  return { total: all.length, uploaded: up, failed: fail, error: firstErr, already: done.size };
}

// ---------- Ekspor/impor blob untuk JSON backup ----------
// Semua lampiran (IDB + fallback localStorage) dibundel agar backup benar-benar bisa dipulihkan di perangkat lain.
export async function exportBlobs() {
  const out = [];
  const seen = new Set();
  // fallback localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      try {
        const rec = JSON.parse(localStorage.getItem(k));
        if (rec && rec.id && rec.dataUrl) { out.push(rec); seen.add(rec.id); }
      } catch {}
    }
  } catch {}
  // IndexedDB
  try {
    const db = await openDb();
    const all = await new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(STORE, 'readonly'); } catch (e) { reject(e); return; }
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('idb-getall'));
    });
    (all || []).forEach((r) => { if (r && r.id && !seen.has(r.id)) out.push(r); });
    try { db.close(); } catch {}
  } catch {}
  return out;
}

// Pulihkan lampiran dari backup. Tidak menimpa berkas yang sudah ada (id sama = biarkan).
export async function importBlobs(list) {
  let n = 0;
  for (const rec of Array.isArray(list) ? list : []) {
    if (!rec || !rec.id || !rec.dataUrl) continue;
    if (await getFile(rec.id)) continue;
    try {
      const db = await openDb();
      await idbTx(db, 'readwrite', (s) => s.put(rec, rec.id));
      try { db.close(); } catch {}
      n++;
    } catch {
      try { localStorage.setItem(LS_PREFIX + rec.id, JSON.stringify(rec)); n++; } catch {}
    }
  }
  return n;
}

// ---------- Tautan lampiran ke record ----------
// Segmen array-record: 'belanja' | 'koli' | 'muatan' | 'pesanan' | 'pengiriman' | 'biaya'
const KEY_FOR = {
  belanja: 'wynara_belanja', koli: 'wynara_koli', muatan: 'wynara_muatan',
  pesanan: 'wynara_preorders', pengiriman: 'wynara_shipments', biaya: 'ledger_entries',
};
// Segmen KV (bukan array): 'payroll' → wynara_payroll_attachments[YYYY-MM] = [meta]
const KV_FOR = { payroll: 'wynara_payroll_attachments' };
function readList(k) { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function readKv(k) { try { const v = JSON.parse(localStorage.getItem(k) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } }

export function attachmentsOf(seg, id) {
  if (KV_FOR[seg]) {
    const kv = readKv(KV_FOR[seg]);
    return Array.isArray(kv[id]) ? kv[id] : [];
  }
  const key = KEY_FOR[seg];
  if (!key) return [];
  const rec = readList(key).find((x) => x.id === id);
  return (rec && rec.attachments) || [];
}

export function attachTo(seg, id, meta) {
  if (KV_FOR[seg]) {
    const kv = readKv(KV_FOR[seg]);
    kv[id] = (Array.isArray(kv[id]) ? kv[id] : []).concat(meta);
    try { localStorage.setItem(KV_FOR[seg], JSON.stringify(kv)); } catch { throw new Error('Gagal menyimpan lampiran'); }
    return kv[id];
  }
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
  if (KV_FOR[seg]) {
    const kv = readKv(KV_FOR[seg]);
    kv[id] = (Array.isArray(kv[id]) ? kv[id] : []).filter((a) => a && a.id !== fileId);
    try { localStorage.setItem(KV_FOR[seg], JSON.stringify(kv)); } catch {}
    try { await deleteFile(fileId); } catch {}
    return kv[id];
  }
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
