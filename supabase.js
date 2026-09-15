// supabase.js — Backend server-authoritative untuk Wynara.
// Server (Supabase) = SUMBER KEBENARAN. localStorage hanya cache cepat.
// - pullAll(): muat semua data dari server saat boot (server menang).
// - pushNow(): tulis-langsung (write-through) tiap ada perubahan.
// Tanpa dependensi (REST murni via fetch) agar aturan no-build terjaga.
const CFG_KEY = 'wynara_cloud_cfg';
const SES_KEY = 'wynara_cloud_session';
const META_KEY = 'wynara_cloud_meta';

// Config bawaan (publishable/anon key aman untuk client) agar app langsung jalan.
const DEFAULT_CLOUD = {
  url: 'https://tqrhgkewildkxivcaujf.supabase.co',
  anonKey: 'sb_publishable_QVJ4jXW9DOrIKyLwp6nOtA_3ztQb3Ij',
};

// key localStorage -> kind remote.
export const RECORD_TABLES = {
  ledger_entries: 'entry',
  ledger_loans: 'loan',
  ledger_repayments: 'repayment',
  ledger_people: 'person',
  wynara_journals: 'journal',
  wynara_items: 'item',
  wynara_employees: 'employee',
  wynara_purchases: 'purchase',
  wynara_assets: 'asset',
  wynara_bank_statement: 'bank_stmt',
  wynara_bank_rules: 'bank_rule',
  wynara_credit_sales: 'credit_sale',
};
// Blob singleton (disimpan utuh per kunci).
export const KV_KEYS = [
  'wynara_locks', 'wynara_budget', 'wynara_equity', 'wynara_recurring',
  'wynara_catBudget', 'wynara_ppn', 'wynara_opening', 'wynara_coa_custom',
  'wynara_counters', 'wynara_leave', 'wynara_ump', 'wynara_shops', 'wynara_sale_returns',
  'wynara_bank_endbal',
  'wynara_coa_alias',
  'wynara_preorders',
];export const DRAFT_KEY = 'wynara_payroll_drafts'; // dipecah per bulan: draft:YYYY-MM
export const TOMB_PREFIX = 'tomb:';
export const TOMB_TTL_MS = 30 * 86400000;

// ---------- config & sesi ----------
export function getCloudConfig() {
  try {
    const o = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (o && o.url && o.anonKey) return { url: String(o.url).replace(/\/$/, ''), anonKey: String(o.anonKey) };
  } catch {}
  return { ...DEFAULT_CLOUD }; // config bawaan → app langsung terhubung
}
export function saveCloudConfig(url, anonKey) {
  url = String(url || '').trim().replace(/\/$/, '');
  anonKey = String(anonKey || '').trim();
  if (!/^https:\/\/.+\.supabase\.co$/.test(url) && !/^https?:\/\/localhost(:\d+)?$/.test(url)) {
    throw new Error('URL Supabase harus https://xxx.supabase.co');
  }
  if (anonKey.length < 20) throw new Error('Anon key tidak valid (terlalu pendek — pakai anon/public key, BUKAN service_role)');
  try { localStorage.setItem(CFG_KEY, JSON.stringify({ url, anonKey })); } catch {}
  return true;
}
export function clearCloudConfig() {
  try { localStorage.removeItem(CFG_KEY); } catch {}
  cloudSignOut();
}
export function isCloudConfigured() { return !!getCloudConfig(); }

function readSession() {
  try { return JSON.parse(localStorage.getItem(SES_KEY) || 'null'); } catch { return null; }
}
function writeSession(s) {
  try { if (s) localStorage.setItem(SES_KEY, JSON.stringify(s)); else localStorage.removeItem(SES_KEY); } catch {}
}
export function getCloudSession() { return readSession(); }
export function cloudSignOut() { writeSession(null); setCloudStatus('ready', 'putus — masuk lagi untuk sinkron'); }

async function authCall(path, body) {
  const cfg = getCloudConfig();
  if (!cfg) throw new Error('Supabase belum dikonfigurasi');
  const r = await fetch(cfg.url + path, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.msg || j.message || j.error_description || ('Auth gagal (' + r.status + ')'));
  return j;
}
export async function cloudSignUp(email, password) {
  const j = await authCall('/auth/v1/signup', { email: String(email || '').trim(), password: String(password || '') });
  if (j.user && !j.access_token) return { needConfirm: true }; // konfirmasi email aktif
  return storeSession(j);
}
export async function cloudSignIn(email, password) {
  const j = await authCall('/auth/v1/token?grant_type=password', { email: String(email || '').trim(), password: String(password || '') });
  return storeSession(j);
}
// Masuk anonim TANPA email/kata sandi — identitas tetap user_id asli sehingga
// RLS + sync tak berubah. Syarat: "Allow anonymous sign-ins" ON di dashboard.
// Catatan jujur: sesi anonim terikat browser ini; tautkan email nanti agar
// akses tak hilang bila data browser dibersihkan.
export async function cloudSignInAnonymously() {
  const cfg = getCloudConfig();
  if (!cfg) throw new Error('Isi URL + anon key Supabase dulu');
  // GoTrue: masuk anonim = signup tanpa email/kata sandi (endpoint /signup).
  const r = await fetch(cfg.url + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
    body: JSON.stringify({ data: { client: 'wynara' } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.msg || j.message || j.error_description || '';
    if (/anonymous|disabled|provider|enabled/i.test(msg)) {
      throw new Error('Nyalakan "Allow anonymous sign-ins" di Supabase → Authentication → Providers, lalu coba lagi');
    }
    throw new Error(msg || ('Masuk anonim gagal (' + r.status + ')'));
  }
  return storeSession(j.session || j, { anon: true });
}
function storeSession(j, meta) {
  if (!j.access_token) throw new Error('Respons auth tanpa token');
  const s = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || '',
    user_id: (j.user && j.user.id) || '',
    anon: !!(meta && meta.anon),
    email: String((j.user && j.user.email) || ''),
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  };
  writeSession(s);
  setCloudStatus('ready', 'terhubung — sinkron aktif');
  return s;
}
// Tautkan sesi anonim ke email + kata sandi (user_id tetap → data & RLS aman).
// Bila konfirmasi email aktif, pengguna perlu klik tautan di email.
export async function cloudLinkEmail(email, password) {
  const cfg = getCloudConfig();
  if (!cfg) throw new Error('Supabase belum dikonfigurasi');
  const s = readSession();
  if (!s || !s.access_token) throw new Error('Masuk dulu (anonim) sebelum menautkan email');
  const mail = String(email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Error('Email tidak valid');
  if (String(password || '').length < 6) throw new Error('Kata sandi minimal 6 karakter');
  const r = await fetch(cfg.url + '/auth/v1/user', {
    method: 'PUT',
    headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: mail, password: String(password) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.msg || j.message || j.error_description || ('Gagal menautkan email (' + r.status + ')'));
  // Simpan email; tandai bukan anonim lagi (sesi tetap sama bila konfirmasi nonaktif).
  const next = { ...readSession(), email: String((j && j.email) || mail), anon: false };
  writeSession(next);
  setCloudStatus('ready', 'terhubung — email tertaut');
  return { email: next.email };
}
export function isAnonymousSession() {
  const s = readSession();
  return !!(s && s.access_token && s.anon && !s.email);
}
// Uji koneksi ringan: pastikan sesi valid + RLS jalan (query 1 baris).
export async function cloudPing() {
  const cfg = getCloudConfig();
  if (!cfg) throw new Error('Supabase belum dikonfigurasi');
  const s = await ensureToken();
  const r = await fetch(cfg.url + '/rest/v1/wynara_kv?select=key&limit=1', {
    headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + s.access_token },
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || ('Koneksi gagal (' + r.status + ')'));
  }
  setCloudStatus('ready', 'koneksi OK');
  return { ok: true };
}
async function ensureToken() {
  let s = readSession();
  if (!s || !s.access_token) throw new Error('Belum login akun online (masuk dulu di Pengaturan)');
  if (s.expires_at - Date.now() > 60000) return s;
  const j = await authCall('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
  s = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || s.refresh_token,
    user_id: (j.user && j.user.id) || s.user_id,
    anon: s.anon,
    email: String((j.user && j.user.email) || s.email || ''),
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  };
  writeSession(s);
  return s;
}

// ---------- status ----------
let cloudStatus = { state: 'off', detail: '', lastSync: 0 };
const cloudListeners = [];
export function getCloudStatus() { return { ...cloudStatus }; }
export function onCloudStatus(fn) {
  if (typeof fn === 'function') cloudListeners.push(fn);
}
function setCloudStatus(state, detail) {
  cloudStatus = { state, detail: String(detail || ''), lastSync: cloudStatus.lastSync || 0 };
  cloudListeners.forEach(fn => { try { fn({ ...cloudStatus }); } catch {} });
}

// ---------- util murni (di-test tanpa network) ----------
export function rowTs(row) {
  const raw = row && (row.updatedAt || row.createdAt);
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}
export function isoTs(ms) {
  return new Date(Number(ms) || 0).toISOString();
}
// Gabung satu tabel: localRows vs remoteRows [{id, data, updated_at}].
// tombstones: {id: atMs}. Return { merged, push:[{id,data,updated_at}], changed }.
export function mergeTable(localRows, remoteRows, tombstones) {
  const tomb = tombstones || {};
  const byId = new Map();
  (localRows || []).forEach(r => { if (r && r.id != null) byId.set(String(r.id), { row: r, ts: rowTs(r), from: 'local' }); });
  let conflicts = 0;
  (remoteRows || []).forEach(rr => {
    if (!rr || rr.id == null) return;
    const id = String(rr.id);
    const rts = Date.parse(rr.updated_at || 0) || 0;
    const tAt = Number(tomb[id]) || 0;
    if (tAt > rts) return; // sudah dihapus lokal setelahnya → abaikan remote
    const cur = byId.get(id);
    if (!cur) { byId.set(id, { row: rr.data || {}, ts: rts, from: 'remote' }); return; }
    if (rts > cur.ts) {
      if (JSON.stringify(cur.row) !== JSON.stringify(rr.data || {})) conflicts++;
      byId.set(id, { row: rr.data || {}, ts: rts, from: 'remote' });
    }
  });
  const merged = [];
  const push = [];
  byId.forEach((v, id) => {
    const tAt = Number(tomb[id]) || 0;
    if (tAt > v.ts) return; // tombstone menang atas keduanya
    merged.push(v.row);
    if (v.from === 'local') push.push({ id, data: v.row, updated_at: isoTs(v.ts || Date.now()) });
  });
  return { merged, push, conflicts, changed: push.length > 0 || conflicts > 0 };
}
// Deteksi hapus lokal: id yang ada di snapshot sync lalu tapi hilang kini.
export function detectDeletions(prevIds, curRows) {
  const cur = new Set((curRows || []).map(r => String(r && r.id)));
  return (prevIds || []).filter(id => !cur.has(String(id)));
}
export function pruneTombstones(tomb, nowMs) {
  const now = Number(nowMs) || Date.now();
  const out = {};
  Object.keys(tomb || {}).forEach(k => {
    if (Number(tomb[k]) > now - TOMB_TTL_MS) out[k] = tomb[k];
  });
  return out;
}

// ---------- baca/tulis lokal generik (tanpa ubah storage.js) ----------
function readJsonKey(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function writeJsonKey(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {
    if (e && e.name === 'QuotaExceededError') throw new Error('Penyimpanan lokal penuh — sinkron dibatalkan, data aman');
    throw e;
  }
}
function readMeta() {
  const m = readJsonKey(META_KEY, null);
  return m && typeof m === 'object' ? m : { lastSync: 0, lastPush: {}, snapshots: {}, tombs: {} };
}
function writeMeta(m) { writeJsonKey(META_KEY, m); }

// ---------- REST tipis ----------
async function rest(method, path, body, prefer) {
  const cfg = getCloudConfig();
  const s = await ensureToken();
  const headers = { apikey: cfg.anonKey, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(cfg.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 204 || r.status === 404 && method === 'DELETE') return null;
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.message || ('Supabase ' + r.status));
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}
async function pullRows(table, sinceIso, extra) {
  let out = [];
  let offset = 0;
  for (;;) {
    let q = `/rest/v1/${table}?select=*&order=updated_at.asc&limit=1000&offset=${offset}`;
    if (sinceIso) q += `&updated_at=gt.${encodeURIComponent(sinceIso)}`;
    if (extra) q += '&' + extra;
    const page = await rest('GET', q);
    if (!Array.isArray(page) || !page.length) break;
    out = out.concat(page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return out;
}

// ---------- sync utama ----------
let syncing = false;
export async function syncNow(opts = {}) {
  if (syncing) return { skipped: true };
  if (!isCloudConfigured()) { setCloudStatus('off', 'belum dikonfigurasi'); return { error: 'Supabase belum dikonfigurasi' }; }
  syncing = true;
  setCloudStatus('syncing', 'sinkronisasi…');
  const summary = { pushed: 0, pulled: 0, conflicts: 0, tombstones: 0 };
  try {
    await ensureToken();
    const meta = readMeta();
    meta.lastPush = meta.lastPush || {};
    meta.snapshots = meta.snapshots || {};
    meta.tombs = pruneTombstones(meta.tombs || {});
    const sinceIso = meta.lastSync ? new Date(meta.lastSync).toISOString() : null;

    // 1) records per kind
    for (const [lsKey, kind] of Object.entries(RECORD_TABLES)) {
      const local = readJsonKey(lsKey, []);
      const arr = Array.isArray(local) ? local : [];
      // hapus lokal → tombstone
      const gone = detectDeletions(meta.snapshots[kind] || [], arr);
      for (const gid of gone) {
        meta.tombs[kind + ':' + gid] = Date.now();
        summary.tombstones++;
        try { await rest('DELETE', `/rest/v1/wynara_records?user_id=eq.${readSession().user_id}&kind=eq.${encodeURIComponent(kind)}&id=eq.${encodeURIComponent(gid)}`); } catch {}
      }
      const tombForKind = {};
      Object.keys(meta.tombs).forEach(k => {
        const m = k.match(/^tomb:([^:]+):(.+)$/);
        if (m && m[1] === kind) tombForKind[m[2]] = meta.tombs[k];
      });
      const remote = await pullRows('wynara_records', sinceIso, `kind=eq.${encodeURIComponent(kind)}`);
      const { merged, push, conflicts } = mergeTable(arr, remote, tombForKind);
      summary.conflicts += conflicts;
      summary.pulled += remote.length;
      // tulis balik yang berubah dari remote
      if (conflicts > 0 || merged.length !== arr.length) writeJsonKey(lsKey, merged);
      // push lokal (baru/diubah sejak push terakhir, atau semua bila tombstone baru)
      const since = meta.lastPush[kind] || 0;
      const toPush = push.filter(p => rowTs(p.data) > since || (meta.tombs && Object.keys(meta.tombs).length > 0 && gone.length > 0));
      const pushAll = !meta.lastPush[kind];
      const finalPush = (pushAll ? push : toPush).map(p => ({ ...p, user_id: undefined }));
      if (finalPush.length) {
        const s = readSession();
        await rest('POST', '/rest/v1/wynara_records', finalPush.map(p => ({
          user_id: s.user_id, kind, id: String(p.id), data: p.data, updated_at: p.updated_at,
        })), 'resolution=merge-duplicates');
        summary.pushed += finalPush.length;
      }
      meta.lastPush[kind] = Date.now();
      meta.snapshots[kind] = merged.map(r => String(r.id));
    }

    // 2) kv blobs
    const remoteKv = await pullRows('wynara_kv', sinceIso);
    const rkv = {};
    remoteKv.forEach(r => { rkv[r.key] = r; });
    // drafts dipecah per bulan
    const drafts = readJsonKey(DRAFT_KEY, {});
    const draftKeys = Object.keys(drafts || {}).map(m => 'draft:' + m);
    const kvPairs = KV_KEYS.map(k => [k, readJsonKey(k, null)]);
    draftKeys.forEach(dk => kvPairs.push([dk, drafts[dk.slice(6)]]));
    for (const [k, localVal] of kvPairs) {
      const r = rkv[k];
      const tombAt = Number((meta.tombs[k] ?? meta.tombs['tomb:kv:' + k]) || 0);
      const localStr = JSON.stringify(localVal ?? null);
      if (r) {
        const rts = Date.parse(r.updated_at || 0) || 0;
        if (tombAt > rts) continue;
        const remoteStr = JSON.stringify(r.value ?? null);
        if (remoteStr !== localStr) {
          if (rts > (meta.lastSync || 0)) {
            // remote lebih baru → pakai remote
            if (k.startsWith('draft:')) { const dd = readJsonKey(DRAFT_KEY, {}); dd[k.slice(6)] = r.value; writeJsonKey(DRAFT_KEY, dd); }
            else writeJsonKey(k, r.value);
            summary.pulled++;
          } else {
            // lokal lebih baru (atau seri) → push
            await rest('POST', '/rest/v1/wynara_kv', [{ user_id: readSession().user_id, key: k, value: localVal, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates');
            summary.pushed++;
          }
        }
      } else if (localVal !== null && localVal !== undefined) {
        await rest('POST', '/rest/v1/wynara_kv', [{ user_id: readSession().user_id, key: k, value: localVal, updated_at: new Date().toISOString() }], 'resolution=merge-duplicates');
        summary.pushed++;
      }
    }

    meta.lastSync = Date.now();
    writeMeta(meta);
    setCloudStatus('ready', `sinkron ${new Date(meta.lastSync).toLocaleTimeString('id-ID')} • ↑${summary.pushed} ↓${summary.pulled}${summary.conflicts ? ` • ${summary.conflicts} konflik` : ''}`);
    cloudStatus.lastSync = meta.lastSync;
    return summary;
  } catch (e) {
    setCloudStatus('error', (e && e.message) || 'sinkron gagal');
    return { error: (e && e.message) || 'sinkron gagal' };
  } finally {
    syncing = false;
  }
}
export function isCloudSyncing() { return syncing; }

// ================= SERVER-AUTHORITATIVE =================
export function isCloudReady() {
  const s = readSession();
  return !!(s && s.access_token);
}

// Muat SEMUA data dari server → ganti cache lokal (server menang). Dipanggil saat boot.
// MIGRASI AMAN: bila server masih kosong tapi lokal ada data, unggah lokal ke server
// (jangan menghapus data yang belum pernah tersimpan di server).
export async function pullAll() {
  if (!isCloudConfigured()) throw new Error('Supabase belum dikonfigurasi');
  await ensureToken();
  setCloudStatus('syncing', 'memuat dari server…');
  const fetched = {};
  let total = 0;
  for (const [lsKey, kind] of Object.entries(RECORD_TABLES)) {
    const rows = await pullRows('wynara_records', null, `kind=eq.${encodeURIComponent(kind)}`);
    fetched[lsKey] = rows.map(r => r.data || {});
    total += fetched[lsKey].length;
  }
  const kv = await pullRows('wynara_kv', null);
  total += kv.length;
  if (total === 0 && localHasData()) {
    setCloudStatus('syncing', 'unggah data lokal ke server (pertama kali)…');
    const res = await pushNow();
    setCloudStatus('ready', 'data lokal tersimpan ke server');
    return { seeded: true, pushed: (res && res.pushed) || 0 };
  }
  const summary = { records: 0, kv: 0 };
  for (const [lsKey, kind] of Object.entries(RECORD_TABLES)) {
    if (fetched[lsKey] === undefined) { const rows = await pullRows('wynara_records', null, `kind=eq.${encodeURIComponent(kind)}`); fetched[lsKey] = rows.map(r => r.data || {}); }
    writeJsonKey(lsKey, fetched[lsKey]);
    summary.records += fetched[lsKey].length;
  }
  const byKey = {};
  kv.forEach(r => { byKey[r.key] = r.value; });
  const drafts = {};
  Object.keys(byKey).forEach(k => { if (k.startsWith('draft:')) drafts[k.slice(6)] = byKey[k]; });
  KV_KEYS.forEach(k => { writeJsonKey(k, Object.prototype.hasOwnProperty.call(byKey, k) ? byKey[k] : null); });
  writeJsonKey(DRAFT_KEY, drafts);
  summary.kv = kv.length;
  const meta = readMeta();
  meta.lastPush = {}; meta.snapshots = {}; meta.lastSync = Date.now(); meta.tombs = {};
  writeMeta(meta);
  setCloudStatus('ready', `dimuat dari server • ${summary.records} baris`);
  cloudStatus.lastSync = meta.lastSync;
  return summary;
}

function localHasData() {
  for (const lsKey of Object.keys(RECORD_TABLES)) {
    const a = readJsonKey(lsKey, []);
    if (Array.isArray(a) && a.length) return true;
  }
  for (const k of KV_KEYS) {
    const v = readJsonKey(k, null);
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    return true;
  }
  return false;
}

// Tulis-langsung: ganti isi server per kind agar server == cache lokal (termasuk hapus).
let pushing = false;
export async function pushNow() {
  if (pushing) return { skipped: true };
  if (!isCloudConfigured() || !isCloudReady()) return { error: 'off' };
  pushing = true;
  setCloudStatus('syncing', 'menyimpan ke server…');
  const summary = { pushed: 0 };
  try {
    const s = await ensureToken();
    for (const [lsKey, kind] of Object.entries(RECORD_TABLES)) {
      const arr = readJsonKey(lsKey, []);
      const list = Array.isArray(arr) ? arr : [];
      try { await rest('DELETE', `/rest/v1/wynara_records?user_id=eq.${encodeURIComponent(s.user_id)}&kind=eq.${encodeURIComponent(kind)}`); } catch {}
      const payload = list
        .map(r => ({ r, id: r && (r.id != null ? String(r.id) : (r.key != null ? String(r.key) : null)) }))
        .filter(x => x.id)
        .map(x => ({ user_id: s.user_id, kind, id: x.id, data: x.r, updated_at: new Date().toISOString() }));
      if (payload.length) {
        await rest('POST', '/rest/v1/wynara_records', payload, 'resolution=merge-duplicates');
        summary.pushed += payload.length;
      }
    }
    const kvPairs = KV_KEYS.map(k => [k, readJsonKey(k, null)]);
    const drafts = readJsonKey(DRAFT_KEY, {});
    Object.keys(drafts || {}).forEach(m => kvPairs.push(['draft:' + m, drafts[m]]));
    const kvPayload = kvPairs.filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => ({ user_id: s.user_id, key: k, value: v, updated_at: new Date().toISOString() }));
    if (kvPayload.length) { await rest('POST', '/rest/v1/wynara_kv', kvPayload, 'resolution=merge-duplicates'); summary.pushed += kvPayload.length; }
    setCloudStatus('ready', `tersimpan ke server • ${new Date().toLocaleTimeString('id-ID')}`);
    return summary;
  } catch (e) {
    setCloudStatus('error', (e && e.message) || 'gagal menyimpan ke server');
    return { error: (e && e.message) || 'gagal menyimpan' };
  } finally {
    pushing = false;
  }
}
