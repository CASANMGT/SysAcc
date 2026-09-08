// idb.js — Salinan pengaman (mirror) IndexedDB, fire-and-forget.
// localStorage tetap sumber utama (sinkron). IDB hanya cadangan darurat:
// - mirrorSnapshot() dipanggil berkala setelah ada perubahan data
// - readSnapshot() dipakai saat boot kalau localStorage kosong tapi IDB ada isi
// Semua fungsi TIDAK PERNAH throw — gagal diam-diam supaya app tidak mati.

const DB_NAME = 'wynara-mirror';
const STORE = 'snapshots';
const KEY = 'latest';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore(STORE); } catch {}
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open'));
  });
}

function txPromise(db, mode, fn) {
  return new Promise((resolve, reject) => {
    let t;
    try {
      t = db.transaction(STORE, mode);
    } catch (e) { reject(e); return; }
    const store = t.objectStore(STORE);
    let req;
    try {
      req = fn(store);
    } catch (e) { reject(e); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-tx'));
  });
}

export async function mirrorSnapshot(snap) {
  try {
    const db = await openDb();
    await txPromise(db, 'readwrite', (s) => s.put({ ...snap, mirroredAt: new Date().toISOString() }, KEY));
    try { db.close(); } catch {}
    return true;
  } catch {
    return false;
  }
}

export async function readSnapshot() {
  try {
    const db = await openDb();
    const val = await txPromise(db, 'readonly', (s) => s.get(KEY));
    try { db.close(); } catch {}
    return val || null;
  } catch {
    return null;
  }
}

export async function clearSnapshot() {
  try {
    const db = await openDb();
    await txPromise(db, 'readwrite', (s) => s.delete(KEY));
    try { db.close(); } catch {}
    return true;
  } catch {
    return false;
  }
}
