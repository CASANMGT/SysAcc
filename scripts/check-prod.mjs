// scripts/check-prod.mjs — SHIP GATE loop v2: produksi harus serve versi repo.
// Bandingkan VERSION lokal vs string versi + nama SW cache di production.
// Keluar 0 bila cocok, 1 bila tidak (gagalkan pipeline/rilis).
//
// Pakai: node scripts/check-prod.mjs [baseUrl]
//   default: https://sysacc-three.vercel.app/  (atau env WYNARA_PROD_URL)
const base = (process.argv[2] || process.env.WYNARA_PROD_URL || 'https://sysacc-three.vercel.app/').replace(/\/$/, '');
const bust = Date.now();

const { readFileSync } = await import('node:fs');
const { resolve, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localVersion = readFileSync(resolve(ROOT, 'VERSION'), 'utf8').trim();
const expectedCache = 'wynara-v' + localVersion.replace(/\./g, '-');

let failed = false;
async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + bust, {
      signal: ctrl.signal, headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

try {
  const html = await getText(base + '/');
  const m = html.match(/appVersionSidebar">([0-9.]+)</);
  const live = m ? m[1] : '(tidak ketemu)';
  const okHtml = live === localVersion;
  console.log(`${okHtml ? 'PASS' : 'FAIL'}  index.html version: live=${live} local=${localVersion}`);
  if (!okHtml) failed = true;
} catch (e) {
  console.log(`FAIL  index.html tidak terjangkau: ${e.message}`);
  failed = true;
}

try {
  const sw = await getText(base + '/sw.js');
  const m = sw.match(/const CACHE = '([^']+)'/);
  const liveCache = m ? m[1] : '(tidak ketemu)';
  const okCache = liveCache === expectedCache;
  console.log(`${okCache ? 'PASS' : 'FAIL'}  sw.js CACHE: live=${liveCache} expected=${expectedCache}`);
  if (!okCache) failed = true;
} catch (e) {
  console.log(`FAIL  sw.js tidak terjangkau: ${e.message}`);
  failed = true;
}

process.exit(failed ? 1 : 0);
