// supabase.js — Sinkronisasi online (Supabase) untuk Wynara. LOCAL-FIRST:
// localStorage tetap sumber utama; modul ini hanya cermin + gabung.
// Tanpa dependensi (REST murni via fetch) agar aturan no-build terjaga.
// Semantik gabung: last-write-wins per baris berdasar updated_at; seri → lokal
// menang (deterministik). Hapus dilacak via tombstone agar tak hidup lagi.
const CFG_KEY = 'wynara_cloud_cfg';
const SES_KEY = 'wynara_cloud_session';
const META_KEY = 'wynara_cloud_meta';

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
};
// Blob singleton (disimpan utuh per kunci).
export const KV_KEYS = [
  'wynara_locks', 'wynara_budget', 'wynara_equity', 'wynara_recurring',
  'wynara_catBudget', 'wynara_ppn', 'wynara_opening', 'wynara_coa_custom',
  'wynara_counters',
];
export const DRAFT_KEY = 'wynara_payroll_drafts'; // dipecah per bulan: draft:YYYY-MM
export const TOMB_PREFIX = 'tomb:';
export const TOMB_TTL_MS = 30 * 86400000;

// ---------- config & sesi ----------
export function getCloudConfig() {
  try {
    const o = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (o && o.url && o.anonKey) return { url: String(o.url).replace(/\/$/, ''), anonKey: String(o.anonKey) };
  } catch {}
  return null;
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
function storeSession(j) {
  if (!j.access_token) throw new Error('Respons auth tanpa token');
  const s = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || '',
    user_id: (j.user && j.user.id) || '',
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  };
  writeSession(s);
  setCloudStatus('ready', 'terhubung — sinkron aktif');
  return s;
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
    setCloudStatus('ready', `sinkron ${new Date(meta.lastSync).toLocaleTimeString('id-ID')} • ↑${summary.pushed} ↓${summary.pulled}`);
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
