// scripts/sync-version.mjs — SATU-SATUNYA sumber versi adalah file VERSION.
// Script ini mencapnya ke: app.js (APP_VERSION), index.html (sidebar,
// footer, __htmlVersion), package.json (version), sw.js (CACHE).
// Gagal LOUD (throw) bila sebuah marker tidak ditemukan tepat satu kali —
// diam-diam desync adalah bug yang dilarang constraint loop v2.
//
// Pakai: node scripts/sync-version.mjs [--bump patch|minor|major]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function bumpVersion(v, part) {
  const m = String(v || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Versi tidak valid: ${v}`);
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (part === 'major') { major += 1; minor = 0; patch = 0; }
  else if (part === 'minor') { minor += 1; patch = 0; }
  else if (part === 'patch') { patch += 1; }
  else throw new Error(`Part tidak dikenal: ${part} (patch|minor|major)`);
  return `${major}.${minor}.${patch}`;
}

export function readVersion() {
  return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
}

function stamp(file, pattern, replacement, label) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const matches = src.match(new RegExp(pattern, 'g')) || [];
  if (matches.length !== 1) {
    throw new Error(`${label}: marker ditemukan ${matches.length}x di ${file} (harus tepat 1x) — sinkronisasi DITOLAK`);
  }
  const next = src.replace(new RegExp(pattern), replacement);
  if (next !== src) {
    fs.writeFileSync(p, next);
    return 'updated';
  }
  return 'ok';
}

export function syncFiles(version) {
  const v = String(version).trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`Versi tidak valid: ${v}`);
  const cache = 'wynara-v' + v.replace(/\./g, '-');
  const out = [];
  out.push(['app.js', stamp('app.js', "const APP_VERSION = '[^']+'", `const APP_VERSION = '${v}'`, 'APP_VERSION')]);
  out.push(['index.html#sidebar', stamp('index.html', '<span id="appVersionSidebar">[0-9.]+</span>', `<span id="appVersionSidebar">${v}</span>`, 'sidebar')]);
  out.push(['index.html#footer', stamp('index.html', '<span id="appVersionFooter">[0-9.]+</span>', `<span id="appVersionFooter">${v}</span>`, 'footer')]);
  out.push(['index.html#__htmlVersion', stamp('index.html', "window\\.__htmlVersion = '[^']+'", `window.__htmlVersion = '${v}'`, '__htmlVersion')]);
  out.push(['package.json', stamp('package.json', '"version": "[0-9.]+"', `"version": "${v}"`, 'package.json')]);
  out.push(['sw.js', stamp('sw.js', "const CACHE = '[^']+'", `const CACHE = '${cache}'`, 'sw CACHE')]);
  return out;
}

const arg = process.argv[2];
const bumpArg = process.argv[3];
let version = readVersion();
if (arg === '--bump') {
  version = bumpVersion(version, bumpArg);
  fs.writeFileSync(path.join(ROOT, 'VERSION'), version);
  console.log('VERSION ->', version);
}
for (const [where, status] of syncFiles(version)) {
  console.log(`${status === 'ok' ? 'OK      ' : 'UPDATED '} ${where} (${version})`);
}
