// sw.js — Service worker Wynara: app shell offline-first.
// - Local files: cache-first (install saat pertama, update saat versi berubah)
// - CDN fallback (xlsx): network-first, cache kalau sempat
// - Selain itu: network-first, fallback cache
//
// PENTING RILIS: naikkan CACHE di bawah ini SETIAP rilis (samakan dengan VERSION).
// Nama cache yang beku menyebabkan split-brain: index.html lama + app.js baru.

const CACHE = 'wynara-v1-21-0';
const CORE = [
  './',
  './index.html',
  './style.css',
  './features.css',
  './app.js',
  './ui.js',
  './storage.js',
  './reports.js',
  './loanmath.js',
  './charts.js',
  './coa.js',
  './journals.js',
  './payroll.js',
  './idb.js',
  './manifest.json',
  './vendor/xlsx.full.min.js',
  './vendor/inter-400.woff2',
  './vendor/inter-500.woff2',
  './vendor/inter-600.woff2',
  './vendor/inter-700.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './icons/w-logo.svg',
  './icons/w-192.png',
  './icons/w-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // CDN: network dulu, simpan kalau berhasil
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('fonts.g')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // File lokal: cache dulu
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
});
