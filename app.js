import * as Storage from './storage.js';
import * as Reports from './reports.js';
import * as UI from './ui.js';
import * as IDB from './idb.js';
import { calcTenor, paidOf, outstandingOf, nextDue, totalOwed } from './loanmath.js';
import * as Charts from './charts.js';
import { EQUITY_ACCOUNT, ACCOUNTS, getAccounts, setCustomAccounts, pphFinalForYear, suggestBankAccountFull, BANK_RULE_PRESETS, expenseAccountFor, REVENUE_ACCOUNT, parseCoaCsv, setCoaAliases, COA_RENUMBER } from './coa.js';
import { buildEntryJournal, buildLoanJournal, buildRepaymentJournal, buildTransferJournal, buildAdjustJournal, buildOpeningJournal, findUnbalanced, balances } from './journals.js';
import { computeSlip, thrAmount, sanitizeRates, RATE_LIMITS, decRecon, overtimePay, gantiCutiDays, leaveBalance, umpCheck, tenureMonths, severancePay } from './payroll.js';
import * as Cloud from './supabase.js';
import { parseDelimited, autoMapColumns, autoMapProductColumns, buildOrders, buildProducts, resolveOrders, parseWaOrder } from './marketplace.js';
import { code128Svg } from './barcode.js';
import { suggestMatches, reconSummary, suggestRules } from './bankmatch.js';
import { getBelanjas, getKolis, getMuatans, getMuatanById, createBelanja, refundBelanja, checkInKoli, assignBelanjaToKoli, createMuatan, loadKoli, unloadKoli, departMuatan, receiveMuatan, allocateBatch, MARKETPLACES, preorderRealisedMargin, preorderLclCost, MIN_CBM } from './lcl.js';

let currentEntries = [];
let currentFilters = { period: 'all', type: 'all', category: 'all', startDate: null, endDate: null };
let customRange = { start: null, end: null };
let loanSearchTerm = '';
let loanDirectionFilter = 'all';
let loanHidePaid = safeLocalGet('wynara_hidePaidLoans') === '1';
let sortColumn = 'date';
let sortDirection = 'desc';
let currentReportType = 'monthly';
let eventsBound = false;
let keyboardBound = false;
let currentPage = 1;
let transaksiPage = 1;
const pageSize = 20;
let searchBound = false;
function safeLocalGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
let arusKasRange = Number(safeLocalGet('wynara_arusRange')) || 6;
if (![3, 6, 12].includes(arusKasRange)) arusKasRange = 6;
let arusKasShow = { income: true, expense: true };
try {
  const saved = JSON.parse(safeLocalGet('wynara_arusShow') || 'null');
  if (saved && typeof saved.income === 'boolean') arusKasShow = saved;
} catch {}
window.__selectedIds = window.__selectedIds instanceof Set ? window.__selectedIds : new Set();

const APP_VERSION = '2.9.0';
// Penanda versi untuk inline skew-check di index.html (deteksi HTML/JS campur aduk).
window.__APP_VERSION = APP_VERSION;
const LOAN_CATEGORIES = ['Piutang', 'Hutang'];

function init() {
  window.__appBooted = true;
  setupA11y();
  // Self-heal split-brain cache: JS baru + HTML lama (tanpa anchor wajib) →
  // buang service worker + cache, lalu reload SEKALI. Mencegah halaman putih.
  const anchors = ['loginScreen', 'appRoot', 'viewRingkasan', 'viewLaporan', 'pageReportContent', 'reportBtnSidebar'];
  const missing = anchors.filter(id => !document.getElementById(id));
  if (missing.length) {
    try {
      if (!sessionStorage.getItem('wynara_swfix')) {
        sessionStorage.setItem('wynara_swfix', '1');
        const done = () => { try { window.location.reload(); } catch {} };
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => {
            if ('caches' in window) caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).then(done).catch(done);
            else done();
          }).catch(done);
        } else done();
        const box = document.getElementById('loginError');
        if (box) { box.classList.remove('hidden'); box.textContent = 'Memperbarui aplikasi ke versi terbaru…'; }
        return;
      }
    } catch {}
  }
  if (!isLoggedIn()) {
    showLogin();
    return;
  }
  // Server-authoritative: tarik data terbaru dulu, baru tampilkan app.
  if (Cloud.isCloudConfigured() && Cloud.isCloudReady()) bootFromServer().finally(() => showApp());
  else showApp();
}

async function bootFromServer() {
  try {
    if (Cloud.isCloudConfigured() && Cloud.isCloudReady()) {
      await Cloud.pullAll();
    }
  } catch { /* offline → pakai cache lokal */ }
}

/* ===== F9 accessibility enhancements (boot + dinamis) ===== */
function dialogTitle(modal) {
  if (!modal || modal.hasAttribute('aria-labelledby') || modal.hasAttribute('aria-label')) return;
  const h = modal.querySelector('h1, h2, h3, h4');
  if (!h) return;
  if (!h.id) h.id = 'dlg-title-' + Math.random().toString(36).slice(2, 8);
  modal.setAttribute('aria-labelledby', h.id);
  modal.setAttribute('aria-modal', 'true');
}
function labelField(el) {
  if (!el || el.type === 'hidden') return;
  if (el.getAttribute('aria-hidden') === 'true') return;
  if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return;
  if (el.closest && el.closest('label')) return;
  if (el.id) {
    try {
      const esc = (window.CSS && window.CSS.escape) ? window.CSS.escape(el.id) : el.id;
      if (document.querySelector('label[for="' + esc + '"]')) return;
    } catch {}
  }
  const title = (el.getAttribute('title') || '').trim();
  if (title) { el.setAttribute('aria-label', title); return; }
  let prev = el.previousElementSibling, hops = 0;
  while (prev && hops < 4) {
    const tag = prev.tagName;
    const cls = String(prev.className || '');
    if (tag === 'LABEL' || /label|hint|caption|filter/.test(cls)) {
      const t = (prev.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 60) { el.setAttribute('aria-label', t); return; }
    }
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(tag)) break;
    prev = prev.previousElementSibling; hops++;
  }
  const ph = (el.getAttribute('placeholder') || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (ph) { el.setAttribute('aria-label', ph); return; }
  if (el.tagName === 'SELECT') el.setAttribute('aria-label', 'Pilih opsi');
}
function syncChipStates(root) {
  (root || document).querySelectorAll('.chip-group, .chart-range, .chart-toggle, .tx-segmented, .filter-pills, .select-group').forEach(group => {
    if (!group.hasAttribute('role')) group.setAttribute('role', 'group');
    group.querySelectorAll('button, .select-btn').forEach(b => {
      b.setAttribute('aria-pressed', b.classList.contains('selected') ? 'true' : 'false');
    });
  });
}
function syncTabStates(root) {
  (root || document).querySelectorAll('[role="tab"]').forEach(t => {
    const on = t.classList.contains('selected') || t.classList.contains('active') || t.getAttribute('aria-selected') === 'true';
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
// Tabel: beri caption (tersembunyi) + scope kolom agar bisa dibaca screen reader.
function enhanceTables(root) {
  (root || document).querySelectorAll('table').forEach(t => {
    if (t.dataset.a11y) return;
    t.dataset.a11y = '1';
    const head = t.querySelector('thead');
    if (head) head.querySelectorAll('th').forEach(th => { if (!th.getAttribute('scope')) th.setAttribute('scope', 'col'); });
    if (!t.querySelector('caption')) {
      let label = (t.getAttribute('aria-label') || '').trim();
      if (!label) {
        const host = t.closest('dialog, section, .dash-panel, .report-section');
        const h = host && host.querySelector('h1, h2, h3, h4');
        if (h) label = (h.textContent || '').replace(/\s+/g, ' ').trim();
      }
      if (label) {
        const cap = document.createElement('caption');
        cap.className = 'sr-only';
        cap.textContent = label.slice(0, 80);
        t.insertBefore(cap, t.firstChild);
      }
    }
  });
}
// Hierarki heading: h3/h4 panel Ringkasan diberi level eksplisit (h1 → h2 → h3).
function enhanceHeadings(root) {
  (root || document).querySelectorAll('#viewRingkasan .dash-panel-head h3, #viewRingkasan .budget-head h4, #viewRingkasan .dash-panel-head h4').forEach(h => {
    if (h.getAttribute('role') === 'heading') return;
    h.setAttribute('role', 'heading');
    h.setAttribute('aria-level', h.tagName === 'H4' ? '3' : '2');
  });
}
function setupA11y() {
  document.querySelectorAll('dialog').forEach(dialogTitle);
  document.querySelectorAll('input, select, textarea').forEach(labelField);
  syncChipStates(document);
  syncTabStates(document);
  enhanceHeadings();
  enhanceTables(document);
  // Nama bersih untuk item nav beremoji (screen reader tak membaca emoji).
  document.querySelectorAll('.sidebar-item, .bn-item').forEach(b => {
    if (b.getAttribute('aria-label')) return;
    const t = (b.textContent || '').replace(/[\u{1F000}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (t) b.setAttribute('aria-label', t);
  });

  // Kembalikan fokus ke pemicu + lepas trap saat dialog tertutup (semua jalur)
  let lastOutside = null;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.nodeType === 1 && !t.closest('dialog')) lastOutside = t;
  }, true);
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('close', () => {
      try { UI.releaseFocus(d); } catch {}
      if (lastOutside && document.contains(lastOutside) && typeof lastOutside.focus === 'function') {
        try { lastOutside.focus(); } catch {}
      }
    });
  });

  // Sinkron status terpilih (aria-pressed / aria-selected) setelah interaksi
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const chip = t.closest('.chip, .select-btn, .tx-seg-btn');
    if (chip) {
      const group = chip.closest('.chip-group, .chart-range, .chart-toggle, .tx-segmented, .filter-pills, .select-group');
      if (group) setTimeout(() => syncChipStates(group), 0);
    }
    const tab = t.closest('[role="tab"]');
    if (tab && tab.parentElement) setTimeout(() => syncTabStates(tab.parentElement), 0);
  }, true);

  // Field yang dirender dinamis → beri label & state saat muncul
  try {
    const obs = new window.MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) labelField(n);
          if (n.querySelectorAll) {
            n.querySelectorAll('input, select, textarea').forEach(labelField);
            if (n.querySelectorAll('.chip-group, .tx-segmented, .filter-pills').length) syncChipStates(n);
            if (n.querySelectorAll('[role="tab"]').length) syncTabStates(n);
            if (n.querySelectorAll('table').length) enhanceTables(n);
            enhanceHeadings(n);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch {}
}

function safeSessionGet(k) {
  try { return sessionStorage.getItem(k); } catch { return null; }
}
function safeSessionSet(k, v) {
  try { sessionStorage.setItem(k, v); return true; }
  catch { UI.showError('Browser memblokir penyimpanan sesi — login tidak bisa disimpan'); return false; }
}
function safeLocalSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

function isLoggedIn() {
  const local = safeSessionGet('wynara_logged_in') === 'true' || safeLocalGet('wynara_logged_in') === 'true';
  // Server-authoritative: sesi online wajib ada (tetap boleh lihat cache bila offline).
  return local;
}

let loginListenerAdded = false;

async function handleSignup() {
  const user = (document.getElementById('loginUser').value || '').trim();
  const pass = (document.getElementById('loginPass').value || '').trim();
  const err = document.getElementById('loginError');
  const showErr = (m) => { if (err) { err.textContent = m; err.classList.remove('hidden'); } };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) return showErr('Isi email yang valid dulu');
  if (pass.length < 6) return showErr('Kata sandi minimal 6 karakter');
  const btn = document.querySelector('.login-btn-new');
  if (btn) btn.disabled = true;
  try {
    const r = await Cloud.cloudSignUp(user, pass);
    if (r && r.needConfirm) { showErr('Cek email untuk konfirmasi, lalu masuk kembali.'); return; }
    try { await Cloud.pullAll(); } catch { /* offline */ }
    document.getElementById('loginError')?.classList.add('hidden');
    safeLocalSet('wynara_logged_in', 'true');
    Storage.setRolePersisted('owner');
    Storage.setActor({ role: 'owner', user });
    showApp();
  } catch (e) {
    showErr(e && e.message ? e.message : 'Gagal mendaftar');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 1.1 Satu pernyataan jujur: di mana data buku tersimpan saat ini
function updateStorageState() {
  const el = document.getElementById('storageState');
  if (!el) return;
  let online = false;
  try { online = !!Cloud.getCloudSession(); } catch { online = false; }
  const lastBackup = (() => { try { return localStorage.getItem('wynara_last_backup') || ''; } catch { return ''; } })();
  if (online) {
    el.textContent = '☁️ Tersimpan di server';
    el.className = 'topbar-storage ok';
    el.title = 'Data buku tersinkron ke server (Supabase) — bisa dibuka dari perangkat lain.';
  } else {
    el.textContent = '📱 Hanya di perangkat ini';
    el.className = 'topbar-storage warn';
    el.title = lastBackup
      ? `Data buku hanya ada di browser ini. Backup terakhir: ${lastBackup}. Nyalakan Sinkron Online atau unduh JSON Backup.`
      : 'Data buku hanya ada di browser ini dan BELUM pernah di-backup. Bila data browser dibersihkan, pembukuan hilang. Buka Pengaturan → JSON Backup / Sinkron Online.';
  }
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appRoot').classList.add('hidden');
  // Hint kredensial hanya saat sandi masih default (belum pernah diganti) — hilang setelah diganti
  const hint = document.getElementById('loginHint');
  if (hint) {
    const a = Storage.getAuth();
    const pristine = a.alg === 'plain';
    hint.textContent = pristine
      ? 'Pertama kali? Masuk "admin" / sandi "admin" — ganti segera di Pengaturan → Keamanan'
      : 'Masuk dengan akun yang diberikan pemilik';
    hint.style.display = pristine ? '' : 'none';
  }
  // Server-authoritative: masuk pakai akun online (email + kata sandi).
  if (hint) { hint.innerHTML = 'Masuk dengan <b>email &amp; kata sandi</b>. Data buku disimpan <b>di perangkat ini</b> sampai Anda menyalakan Sinkron Online di Pengaturan — unduh JSON Backup berkala.'; hint.style.display = ''; }
  updateStorageState();
  if (!loginListenerAdded) {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('loginSignup')?.addEventListener('click', (e) => { e.preventDefault(); handleSignup(); });    const eye = document.getElementById('loginEye');
    if (eye) eye.addEventListener('click', () => {
      const pass = document.getElementById('loginPass');
      const isText = pass.type === 'text';
      pass.type = isText ? 'password' : 'text';
      eye.textContent = isText ? '👁️' : '🙈';
      try { eye.setAttribute('aria-pressed', String(!isText)); } catch {}
    });
    // clear error as soon as user retypes
    ['loginUser', 'loginPass'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        document.getElementById('loginError')?.classList.add('hidden');
      });
    });
    // 1.2 Lupa sandi: login memakai akun online (Supabase) — reset dilakukan di sisi akun, bukan lokal.
    document.querySelector('.login-forgot-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const a = Storage.getAuth();
      const legacyLocal = a && a.alg === 'plain' && String(a.user || '') === 'admin';
      if (legacyLocal) {
        if (confirm('Akun lama admin/admin masih dipakai. Reset kata sandi lokal ke admin/admin?')) {
          Storage.resetAuth();
          UI.showSuccess('Direset. Masuk admin / admin, lalu ganti di Pengaturan → Keamanan.');
          document.getElementById('loginUser').value = 'admin';
          document.getElementById('loginPass').value = 'admin';
        }
        return;
      }
      UI.openInfoModal('🔑 Lupa kata sandi',
        '<p>Kata sandi login adalah kata sandi <b>akun online</b> (email Anda). Cara pulih:</p>' +
        '<ul style="padding-left:20px;margin:6px 0">' +
        '<li>Minta <b>reset kata sandi</b> ke pemilik akun (yang memegang email terdaftar) di dashboard Supabase → Authentication → Users → Reset password.</li>' +
        '<li>Setelah kata sandi baru dibuat, masuk lagi dengan email &amp; kata sandi itu di layar ini.</li>' +
        '<li>Data buku di perangkat ini tidak terhapus — log in hanya membuka akses.</li>' +
        '</ul>' +
        '<p style="font-size:12px;color:#64748b">Bila ini instalasi tanpa akun online, gunakan akun lama <b>admin / admin</b> yang diatur pemilik.</p>');
    });
    document.getElementById('loginHelp')?.addEventListener('click', (e) => {
      e.preventDefault();
      UI.openInfoModal('❓ Bantuan Wynara',
        '<p><b>Alur harian:</b> Ringkasan → catat penjualan/biaya → pesanan preorder dipantau di <b>Pesanan Berjalan</b> (Penjualan).</p>' +
        '<p><b>Pesanan preorder China:</b> DP masuk → 🛍 Beli di marketplace → 🧾 tempel daftar koli dari forwarder → muat &amp; berangkat di <b>Papan Muatan</b> → tiba (biaya mendarat otomatis masuk harga modal) → kirim ke pelanggan.</p>' +
        '<p><b>Keyboard:</b> <kbd>Ctrl+N</kbd> tambah transaksi · <kbd>/</kbd> cari · <kbd>Esc</kbd> tutup.</p>' +
        '<p><b>Data aman:</b> Pengaturan → JSON Backup tiap bulan, atau nyalakan Sinkron Online. Status penyimpanan selalu tampak di kanan atas.</p>');
    });
    loginListenerAdded = true;
  }
  document.getElementById('loginError')?.classList.add('hidden');
  setTimeout(() => document.getElementById('loginUser')?.focus(), 50);
}

async function handleLogin(e) {
  e.preventDefault();
  const user = (document.getElementById('loginUser').value || '').trim();
  const pass = (document.getElementById('loginPass').value || '').trim();
  const btn = document.querySelector('.login-btn-new');
  if (btn) btn.disabled = true;
  try {
    const roleUser = ['kasir', 'akuntan', 'hrd'].includes(user.toLowerCase()) ? user.toLowerCase() : '';
    if (roleUser) {
      const ok = await Storage.verifyRolePin(roleUser, pass);
      if (!ok) {
        document.getElementById('loginError').classList.remove('hidden');
        document.getElementById('loginPass')?.select();
        return;
      }
      document.getElementById('loginError').classList.add('hidden');
      const remember = document.getElementById('loginRemember')?.checked !== false;
      try { localStorage.removeItem('wynara_logged_in'); } catch {}
      try { sessionStorage.removeItem('wynara_logged_in'); } catch {}
      if (remember) { safeLocalSet('wynara_logged_in', 'true'); Storage.setRolePersisted(roleUser); }
      else { if (!safeSessionSet('wynara_logged_in', 'true')) return; Storage.setRole(roleUser); Storage.clearPersistedRole(); }
      Storage.setActor({ role: roleUser, user: roleUser });
      showApp();
      return;
    }
    // PEMILIK = akun online (server-authoritative): wajib email + kata sandi.
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user);
    if (!isEmail) {
      // Akun lokal lama (mis. "admin") — tetap didukung sebagai fallback admin.
      const ok = await Storage.verifyLogin(user, pass);
      if (!ok) {
        document.getElementById('loginError').classList.remove('hidden');
        document.getElementById('loginPass')?.select();
        return;
      }
    } else {
      try {
        await Cloud.cloudSignIn(user, pass);
      } catch (e2) {
        const err = document.getElementById('loginError');
        if (err) { err.textContent = (e2 && e2.message) ? e2.message : 'Email atau kata sandi salah'; err.classList.remove('hidden'); }
        return;
      }
      try { await Cloud.pullAll(); } catch (e3) { /* offline → pakai cache */ }
    }
    document.getElementById('loginError').classList.add('hidden');
    const remember = document.getElementById('loginRemember')?.checked !== false;
    try { localStorage.removeItem('wynara_logged_in'); } catch {}
    try { sessionStorage.removeItem('wynara_logged_in'); } catch {}
    if (remember) { safeLocalSet('wynara_logged_in', 'true'); Storage.setRolePersisted('owner'); }
    else { if (!safeSessionSet('wynara_logged_in', 'true')) return; Storage.setRole('owner'); Storage.clearPersistedRole(); }
    Storage.setActor({ role: 'owner', user: user });
    showApp();
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Mode Sederhana — sembunyikan alat akuntan (jurnal, kertas kerja) via CSS body[data-mode]
function applySimpleMode(mode) {
  try { document.body.dataset.mode = mode === 'sederhana' ? 'sederhana' : 'akuntan'; } catch {}
}
function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');
  const role = Storage.getRole();
  document.getElementById('appRoot').setAttribute('data-role', role);
  if (!Storage.getActor().user) Storage.setActor({ role, user: role === 'kasir' ? 'kasir' : 'admin' });
  applySimpleMode(safeLocalGet('wynara_mode'));
  try { if (safeLocalGet('wynara_sb') === '1') document.body.classList.add('sb-collapsed'); } catch {}
  updateBackupDot();
  updateCloudDot();
  updateStorageState();
  document.getElementById('storageState')?.addEventListener('click', () => openSettings());
  nudgeBackupExport();
  // Sinkron online awal (bila terhubung) — diam-diam di background
  if (Cloud.isCloudConfigured() && Cloud.getCloudSession()) {
    setTimeout(() => {
      Cloud.syncNow().then(() => { try { updateCloudDot(); updateStorageState(); } catch {} }).catch(() => { try { updateCloudDot(); updateStorageState(); } catch {} });
    }, 4000);
  }
  // version display
  const vs = document.getElementById('appVersionSidebar');
  const vf = document.getElementById('appVersionFooter');
  if (vs) vs.textContent = APP_VERSION;
  if (vf) vf.textContent = APP_VERSION;
  // version check
  const stored = safeLocalGet('wynara_version');
  if (stored && stored !== APP_VERSION) {
    UI.showInfo(`Diperbarui ke v${APP_VERSION} (dari v${stored}) — lihat Changelog`);
  }
  safeLocalSet('wynara_version', APP_VERSION);
  try {
    const r = Storage.runRecurringEngine();
    if (r.posted > 0) UI.showSuccess(`Recurring: ${r.posted} transaksi otomatis dibuat`);
  } catch {}
  loadData();
  bootDataSafety();
  try {
    bindEvents();
  } catch (err) {
    console.error(err);
    UI.showError('Gagal menyiapkan aplikasi: ' + (err.message || err));
  }
  try {
    render();
  } catch (err) {
    console.error(err);
    UI.showError('Gagal menampilkan data: ' + (err.message || err));
  }
  UI.initIdrInputs();
  UI.updatePpnLabels();
  if (!keyboardBound) {
    document.addEventListener('keydown', handleKeyboardShortcut);
    keyboardBound = true;
  }
}

function loadData() {
  let coaMigrated = null;
  try { coaMigrated = Storage.migrateCoaRenumber(); } catch {}
  // Renumber COA lokal ? dorong ke server (write-through) agar Supabase ikut ter-renumber.
  if (coaMigrated && coaMigrated.done) { try { queueMirror(); } catch {} }
  try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
  try { setCoaAliases(Storage.getCoaAliases()); } catch {}
  currentEntries = Storage.getAllEntries();
  const categories = Storage.getCategories();
  UI.renderCategoryFilterChips(categories);
  if (!searchBound) {
    UI.initSearch(handleSearchChange);
    searchBound = true;
  }
}

// ===== Data safety: IDB mirror + recovery + backup reminder =====
let mirrorTimer = null;
let cloudTimer = null;
function queueMirror() {
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    try { IDB.mirrorSnapshot(Storage.snapshotAll()); } catch {}
    // Cadangan otomatis (IDB) tercatat — pakai kunci kanonis yang sama dengan storage.js
    try { localStorage.setItem('wynara_lastBackup', new Date().toISOString()); } catch {}
    try { updateBackupDot(); } catch {}
  }, 2000);
  // Write-through: setiap perubahan disimpan ke server (server = sumber kebenaran).
  if (Cloud.isCloudConfigured() && Cloud.isCloudReady()) {
    if (cloudTimer) clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      Cloud.pushNow().then(() => { try { updateCloudDot(); } catch {} }).catch(() => { try { updateCloudDot(); } catch {} });
    }, 1200);
  }
}
function updateCloudDot() {
  const dot = document.getElementById('cloudDot');
  if (!dot) return;
  const st = Cloud.getCloudStatus();
  const ses = Cloud.getCloudSession();
  if (!Cloud.isCloudConfigured() || !ses) {
    dot.textContent = '☁️'; dot.style.opacity = '.35';
    dot.title = 'Sinkron online: mati';
    dot.setAttribute('aria-label', 'Sinkron online mati');
    return;
  }
  if (st.state === 'syncing') {
    dot.textContent = '☁️'; dot.style.opacity = '1';
    dot.title = 'Sinkron online: sedang sinkron…';
  } else if (st.state === 'error') {
    dot.textContent = '☁️'; dot.style.opacity = '1';
    dot.title = 'Sinkron online gagal: ' + (st.detail || 'periksa koneksi');
  } else {
    dot.textContent = '☁️'; dot.style.opacity = '.8';
    dot.title = 'Sinkron online aktif' + (st.detail ? ' — ' + st.detail : '');
  }
  dot.setAttribute('aria-label', dot.title);
}
function updateBackupDot() {
  const dot = document.getElementById('backupDot');
  if (!dot) return;
  let last = Storage.getLastBackup();
  if (!last) { dot.textContent = '💾'; dot.title = 'Pengingat: buka Pengaturan → JSON Backup untuk menyimpan cadangan pertama'; dot.style.opacity = '.35'; dot.setAttribute('aria-label', 'Cadangan belum pernah dibuat'); return; }
  const days = Math.floor((Date.now() - last.getTime()) / 86400000);
  const t = last.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  dot.style.opacity = days > 7 ? '1' : '.55';
  dot.textContent = days > 7 ? '🔴' : '💾';
  dot.title = days > 7 ? `Cadangan terakhir ${t} — lebih dari 7 hari, unduh JSON di Pengaturan` : `Cadangan otomatis terakhir: ${t}`;
  dot.setAttribute('aria-label', dot.title);
}
// Nudge cadangan FILE (bukan IDB): >14 hari sejak unduhan terakhir → ingatkan maksimal 1×/bulan
function nudgeBackupExport() {
  let lastExport = 0;
  try { lastExport = Number(localStorage.getItem('wynara_last_export')) || 0; } catch {}
  const days = lastExport ? Math.floor((Date.now() - lastExport) / 86400000) : 999;
  if (days < 14) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  try { if (safeLocalGet('wynara_nudge_export') === monthKey) return; } catch {}
  UI.showWarning('Cadangan FILE belum diunduh lebih dari 14 hari — Pengaturan → ⬇️ JSON Backup. Mirror IndexedDB bisa hilang bila browser dibersihkan.');
  try { safeLocalSet('wynara_nudge_export', monthKey); } catch {}
}

function bootDataSafety() {
  // 1) Recovery: localStorage kosong tapi IDB ada isi → kembalikan
  try {
    const localSize = Storage.snapshotSize();
    if (localSize === 0) {
      IDB.readSnapshot().then((snap) => {
        if (snap && Storage.snapshotSize(snap) > 0) {
          try {
            const r = Storage.restoreAll(snap);
            const n = r.entries + r.loans + r.repayments + r.people;
            if (n > 0) {
              UI.showSuccess(`Data dipulihkan dari cadangan otomatis (${n} baris)`);
              refresh();
              return;
            }
          } catch {}
        }
        // 2) Backup reminder (hanya kalau ada data / pernah ada aktivitas)
        backupReminder();
      }).catch(() => backupReminder());
    } else {
      queueMirror();
      backupReminder();
    }
  } catch { /* safety tidak boleh mematikan boot */ }
  // Jurnal backfill (idempoten — lewati yang sudah ada)
  try {
    const n = Storage.backfillJournals({ buildEntryJournal, buildLoanJournal, buildRepaymentJournal });
    if (n > 0) { queueMirror(); refresh(); }
  } catch { /* safety tidak boleh mematikan boot */ }
}

function postOpeningEquityJournal() {
  try {
    const eq = Storage.getOpeningEquity();
    Storage.deleteJournalsByRef('equity', 'opening');
    if (eq && Number(eq.amount) > 0) {
      Storage.postJournal({
        id: 'EQ-OPENING',
        date: new Date().toISOString().split('T')[0],
        memo: 'Modal awal usaha',
        ref: 'equity',
        refId: 'opening',
        lines: [
          { account: '1104', debit: Math.round(Number(eq.amount)), credit: 0, memo: 'Modal awal usaha' },
          { account: EQUITY_ACCOUNT, debit: 0, credit: Math.round(Number(eq.amount)), memo: 'Modal awal usaha' },
        ]
      });
    }
  } catch {}
}

function backupReminder() {
  try {
    const size = Storage.snapshotSize();
    if (size === 0) return;
    const last = Storage.getLastBackup();
    if (!last) {
      UI.showWarning('Belum pernah backup — buka Pengaturan → JSON Backup biar data aman');
      return;
    }
    const days = Math.floor((Date.now() - last.getTime()) / 86400000);
    if (days >= 30) UI.showWarning(`Backup terakhir ${days} hari lalu — buka Pengaturan → JSON Backup`);
  } catch {}
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById('addEntryBtn').addEventListener('click', () => {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    UI.openModal();
  });

  document.getElementById('emptyAddBtn').addEventListener('click', () => {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    UI.openModal();
  });

  document.getElementById('onboardAddBtn')?.addEventListener('click', () => {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    UI.openModal();
  });
  document.getElementById('onboardLoanBtn')?.addEventListener('click', () => {
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
  });
  document.getElementById('onboardReportBtn')?.addEventListener('click', handleReportOpen);
  document.getElementById('settingTheme')?.addEventListener('change', (e) => {
    document.body.classList.toggle('dark-mode', e.target.checked);
    safeLocalSet('theme', e.target.checked ? 'dark' : 'light');
  });

  UI.bindCategoryChange(UI.handleCategoryChange);
  UI.bindTypeButtons(() => {});
  window.__getItems = () => Storage.getAllItems();
  window.__isLockedMonth = (d) => Storage.isMonthLocked(d);
  UI.bindFormSubmit(handleFormSubmit);
  UI.bindModalClose(UI.closeModal);
  UI.bindTableActions(handleEdit, handleDelete, handleDuplicate, handleReceipt, handleReturnOpen);
  UI.bindReceipt();
  UI.bindFilters(handleFilterChange);
  window.__onFilterChange = handleFilterChange;
  UI.bindExportImport(handleImport);
  document.getElementById('exportExcelBtn')?.addEventListener('click', handleExportExcel);
  document.getElementById('exportCsvBtn').addEventListener('click', handleExportCsv);
  UI.bindReport(handleReportOpen, handleReportClose, handleReportTabChange, handleCustomDateApply);
  document.getElementById('printReportBtn')?.addEventListener('click', () => UI.printCurrentReport());

  document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
  document.getElementById('printBtn').addEventListener('click', handlePrint);

  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => exportMenu.classList.add('hidden'));

  const savedTheme = safeLocalGet('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }
  document.getElementById('themeToggle').addEventListener('click', handleThemeToggle);

  document.getElementById('loanBtn').addEventListener('click', () => {
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
  });
  document.getElementById('closeLoansBtn').addEventListener('click', UI.closeLoans);
  document.getElementById('loanSearch').addEventListener('input', (e) => {
    loanSearchTerm = e.target.value;
    renderLoansView();
  });
  document.querySelectorAll('#loanTabs .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#loanTabs .chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      loanDirectionFilter = btn.dataset.value || 'all';
      renderLoansView();
    });
  });
  const hidePaidBox = document.getElementById('hidePaidLoans');
  if (hidePaidBox) {
    hidePaidBox.checked = loanHidePaid;
    hidePaidBox.addEventListener('change', () => {
      loanHidePaid = hidePaidBox.checked;
      safeLocalSet('wynara_hidePaidLoans', loanHidePaid ? '1' : '0');
      renderLoansView();
    });
  }
  document.getElementById('addLoanBtn').addEventListener('click', () => {
    UI.closeLoans();
    UI.renderPeopleDatalist(Storage.getAllPeople());
    if (loanDirectionFilter === 'taken') UI.openLoanEntryFor('Hutang', 'new');
    else UI.openLoanEntryFor('Piutang', 'new');
  });
  UI.bindLoanActions(handleRepayClick, handleLoanDelete, handleRepayDelete, handleInvoicePrint);
  UI.bindRepayModalClose(UI.closeRepayModal);

  document.getElementById('contactsBtn').addEventListener('click', () => {
    UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans());
  });
  document.getElementById('closeContactsBtn').addEventListener('click', UI.closeContacts);
  document.getElementById('addContactBtn').addEventListener('click', () => {
    UI.openContactForm();
  });
  document.getElementById('contactFormClose').addEventListener('click', UI.closeContactForm);
  document.getElementById('contactFormCancel').addEventListener('click', UI.closeContactForm);
  UI.bindContactFormSubmit(handleContactFormSubmit);
  UI.bindContactFormTypeButtons();
  UI.bindContactsSearch(() => {
    UI.renderContacts(Storage.getAllPeople(), Storage.getAllLoans());
  });
  UI.bindContactsActions(handleContactDelete, handleContactEdit);

  // Sidebar + topbar wiring
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggle = document.getElementById('sidebarToggle');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        const open = sidebar.classList.toggle('open');
        overlay.classList.toggle('hidden');
        try { toggle.setAttribute('aria-expanded', String(open)); } catch {}
      } else {
        const collapsed = document.body.classList.toggle('sb-collapsed');
        try {
          localStorage.setItem('wynara_sb', collapsed ? '1' : '0');
          toggle.setAttribute('aria-expanded', String(!collapsed));
        } catch {}
      }
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.add('hidden');
    });
  }
  // Pengaman drawer: T klik item sidebar MANAPUN → drawer selalu tertutup.
  // (showView juga menutup; ini lapis kedua agar tak ada drawer nyangkut.)
  document.getElementById('sidebar')?.addEventListener('click', (ev) => {
    if (!ev.target.closest('.sidebar-item')) return;
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.add('hidden');
  });
  document.getElementById('reportBtnSidebar')?.addEventListener('click', () => showView('viewLaporan'));
  document.getElementById('contactsBtnSidebar')?.addEventListener('click', () => UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans()));
  document.getElementById('loanBtnSidebar')?.addEventListener('click', () => UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople()));
  document.getElementById('stockBtnSidebar')?.addEventListener('click', () => showView('viewStock'));
  document.getElementById('saleEntryBtn')?.addEventListener('click', () => UI.openSale());
  document.getElementById('saleEntryBtn2')?.addEventListener('click', () => UI.openSale());
  document.getElementById('payrollBtnSidebar')?.addEventListener('click', () => showView('viewPayroll'));
  document.getElementById('kasOpenBtn')?.addEventListener('click', () => { refreshKas(); UI.openKas(); });
  document.getElementById('bankOpenBtn')?.addEventListener('click', () => { refreshKas(); UI.setBankRows([]); UI.openBank(); });
  UI.bindStock(handleStockSave, handleStockEdit, handleStockDelete, handleStockHistory);
  document.getElementById('secSaveBtn')?.addEventListener('click', async () => {
    const oldP = document.getElementById('secOld')?.value || '';
    const p1 = document.getElementById('secNew')?.value || '';
    const p2 = document.getElementById('secNew2')?.value || '';
    if (p1 !== p2) return UI.showError('Ulangi kata sandi tidak sama');
    try {
      const a = Storage.getAuth();
      const ok = await Storage.verifyLogin(a.user, oldP);
      if (!ok) return UI.showError('Kata sandi lama salah');
      await Storage.setPassword(p1);
      ['secOld', 'secNew', 'secNew2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      UI.showSuccess('Kata sandi diganti. Keluar lalu masuk dengan yang baru.');
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal ganti kata sandi');
    }
  });
  UI.bindPayrollView({
    onTab: handlePayrollTab,
    onSearch: (v) => { payrollEmpSearch = v; UI.renderEmpTable(Storage.getAllEmployees(), payrollEmpSearch); },
    onAdd: () => UI.openEmpModal(null),
    onEdit: handleEmpViewEdit,
    onSave: handleEmpViewSave,
    onCancel: () => UI.closeEmpModal(),
    onClose: () => UI.closeEmpModal(),
    onImportClick: () => document.getElementById('empImportFile')?.click(),
    onImportFile: (file) => handleEmpImport(file),
    onPeriod: handlePayrollPeriod,
    onCheckAll: handlePayrollCheckAll,
    onCheck: handlePayrollCheck,
    onExpand: handlePayrollExpand,
    onDetailChange: handlePayrollDetailChange,
    onLembur: handlePayrollLembur,
    onRate: handlePayrollRateChange,
    onHadir: handlePayrollHadir,
    onPrintSlip: handlePayrollPrintSlip,
    onSlipWa: handlePayrollSlipWa,
    onDraft: handlePayrollDraft,
    onFinal: handlePayrollFinal,
    onCopy: handlePayrollCopyPrev
  });
  loadPayrollCache();
  UI.bindBuy(handleBuySave);
  UI.bindSupplierList(handleSupplierPay, handleSupplierDelete);
  UI.bindSupplierPay(handleSupplierPaySubmit);
  UI.bindSale(handleSaleSave);
  // Status Pesanan (jual + titip beli): delegasi klik untuk aksi per tahap
  document.getElementById('orderStatusList')?.addEventListener('click', (e) => {
    const ship = e.target.closest('.order-ship');
    const recv = e.target.closest('.order-recv');
    const setStatus = e.target.closest('.order-status');
    const pay = e.target.closest('.open-order-pay');
    const fee = e.target.closest('.preorder-cost');
    const delJ = e.target.closest('.credit-del');
    let delP = e.target.closest('.preorder-del');
    const settleBtn = e.target.closest('.preorder-settle');
    if (ship) openOrderShip('jual', ship.dataset.id);
    else if (settleBtn) preorderSettlePrompt(settleBtn.dataset.id);
    else if (recv) handleOrderReceive(recv.dataset.id);
    else if (e.target.closest('.preorder-ship')) { const b = e.target.closest('.preorder-ship'); openBelanjaModalFor(b.dataset.id); }
    else if (e.target.closest('.order-koli-paste')) openKoliPasteModal(e.target.closest('.order-koli-paste').dataset.id);
    else if (e.target.closest('.order-goto-muatan')) showView('viewMuatan');
    else if (e.target.closest('.preorder-arrive')) orderArrivePrompt(e.target.closest('.preorder-arrive').dataset.id);
    else if (setStatus) openOrderStatus(setStatus.dataset.kind, setStatus.dataset.id, setStatus.dataset.st || '');
    else if (pay) (pay.dataset.kind === 'po') ? openPoPay(pay.dataset.id) : openCreditPay(pay.dataset.id);
    else if (fee) openPoCost(fee.dataset.id);
    else if (delJ) deleteCreditSalePrompt(delJ.dataset.id);
    else if (delP) orderDeletePrompt(delP.dataset.id);
  });
  document.getElementById('shipClose')?.addEventListener('click', closeOrderShip);
  document.getElementById('shipCancel')?.addEventListener('click', closeOrderShip);
  document.getElementById('shipSave')?.addEventListener('click', handleOrderShipSubmit);
  // hint CBM: kirim × rate
  ['shipCbm', 'shipCbmRate'].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
    const c = Math.max(Number(document.getElementById('shipCbm')?.value) || 0, 0);
    const r = Math.max(Number(document.getElementById('shipCbmRate')?.value) || 0, 0);
    const h = document.getElementById('shipCbmHint');
    if (h) h.textContent = (c * r) > 0 ? `= Rp${Math.round(c * Math.max(Number(document.getElementById('shipCbmRate')?.value) || 0, 0)).toLocaleString('id-ID')}` : '';
  }));
  document.getElementById('orderStatusClose')?.addEventListener('click', closeOrderStatus);
  document.getElementById('orderStatusCancel')?.addEventListener('click', closeOrderStatus);
  document.getElementById('orderStatusSave')?.addEventListener('click', handleOrderStatusSubmit);
  // Titip beli (preorder)
  bindPreorderUI();
  // Kurs online untuk preorder: saat mode 🌏 dipilih → sinkronkan kurs (bulat ke atas 1.000)
  document.querySelectorAll('input[name="saleMode"]').forEach(r => r.addEventListener('change', () => {
    if (r.checked && r.value === 'preorder') kursCnyOnline().then(applyKursToSaleForm);
  }));
  UI.bindCoa(handleCoaSave, handleCoaRename, handleCoaDelete);
  document.getElementById('assetOpenBtn')?.addEventListener('click', openAssets);
  document.getElementById('openingOpenBtn')?.addEventListener('click', openOpening);
  document.getElementById('openingModalClose')?.addEventListener('click', () => { const m = document.getElementById('openingModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('openingCancel')?.addEventListener('click', () => { const m = document.getElementById('openingModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('openingPostBtn')?.addEventListener('click', handleOpeningPost);
  document.getElementById('openingDate')?.addEventListener('change', () => { try { updateOpeningBalance(); } catch {} });
  document.getElementById('openingRows')?.addEventListener('input', (e) => {
    updateOpeningBalance();
    const draft = { date: document.getElementById('openingDate')?.value || '' };
    const rows = {};
    document.querySelectorAll('#openingRows .opening-deb, #openingRows .opening-cred').forEach(inp => {
      const code = inp.dataset.code;
      const v = openingNumInput(inp);
      if (v <= 0) return;
      rows[code] = rows[code] || { debit: 0, credit: 0 };
      if (inp.classList.contains('opening-deb')) rows[code].debit = v; else rows[code].credit = v;
    });
    draft.rows = rows;
    try { Storage.saveOpeningDraft(draft); } catch {}
  });
  document.getElementById('adjustOpenBtn')?.addEventListener('click', openAdjust);
  document.getElementById('adjustModalClose')?.addEventListener('click', () => { const m = document.getElementById('adjustModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('adjustCancel')?.addEventListener('click', () => { const m = document.getElementById('adjustModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('adjustPostBtn')?.addEventListener('click', handleAdjustPost);
  ['adjustDebitAmt', 'adjustCreditAmt', 'adjustDebitAcc', 'adjustCreditAcc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateAdjustPreview);
    if (el && id !== 'adjustPostBtn') el.addEventListener('change', updateAdjustPreview);
  });
  document.getElementById('assetModalClose')?.addEventListener('click', UI.closeAssetModal);
  document.getElementById('assetModalCancel')?.addEventListener('click', UI.closeAssetModal);
  document.getElementById('assetAddBtn')?.addEventListener('click', handleAssetAdd);
  document.getElementById('assetPostBtn')?.addEventListener('click', handleAssetPost);
  document.getElementById('assetTableBody')?.addEventListener('click', (e) => {
    const d = e.target.closest('.asset-delete');
    if (d) handleAssetDelete(d.dataset.id);
  });
  document.getElementById('coaOpenBtn')?.addEventListener('click', openCoaModal);
  document.getElementById('coaSearch')?.addEventListener('input', refreshCoa);
  document.getElementById('coaImportBtn')?.addEventListener('click', handleCoaImport);
  document.getElementById('coaRenumberBtn')?.addEventListener('click', handleCoaRenumberPreview);
  document.getElementById('coaTypeFilter')?.addEventListener('change', refreshCoa);
  document.getElementById('coaType')?.addEventListener('change', (e) => {
    const codeEl = document.getElementById('coaCode');
    if (codeEl) codeEl.value = suggestCoaCode(e.target.value);
  });
  UI.bindPayroll(handleEmpSave, handleEmpEdit, handleEmpDelete, handleEmpSlip, handlePayrollRun);
  UI.bindKas(handleTransfer, handleRecon);
  UI.bindBank(handleBankFile, handleBankImport);
  document.getElementById('bankApplySuggestBtn')?.addEventListener('click', bankApplySuggest);
  document.addEventListener('wynara:stock-search', refreshStock);
  document.getElementById('themeToggleSidebar')?.addEventListener('click', handleThemeToggle);
  function showView(viewId) {
    // Selalu mulai dari atas: posisi scroll view sebelumnya tidak boleh terbawa.
    try { window.scrollTo(0, 0); } catch {}
    try { document.querySelector('#main-content')?.scrollTo(0, 0); } catch {}
    document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
    // Fallback defensif: bila section target hilang dari DOM (cache basi),
    // jangan pernah biarkan layar putih — tampilkan Ringkasan.
    const target = document.getElementById(viewId) || document.getElementById('viewRingkasan');
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    const map = { viewRingkasan: '[data-nav="ringkasan"]', viewTransaksi: '#sidebarTransaksi', viewSales: '#salesBtnSidebar', viewKas: '#kasBtnSidebar', viewPembelian: '#pembelianBtnSidebar', viewMuatan: '#muatanBtnSidebar', viewBiaya: '#biayaBtnSidebar', viewPayroll: '#payrollBtnSidebar', viewStock: '#stockBtnSidebar', viewLaporan: '#reportBtnSidebar', viewChangelog: '#changelogLink' };
    const sel = map[viewId];
    if (sel) document.querySelector(sel)?.classList.add('active');
    document.querySelectorAll('.sidebar-item').forEach(b => b.removeAttribute('aria-current'));
    if (sel) document.querySelector(sel)?.setAttribute('aria-current', 'page');
    const bnView = { viewRingkasan: 'ringkasan', viewMuatan: 'muatan', viewSales: 'sales', viewTransaksi: 'transaksi', viewPayroll: 'gaji', viewStock: 'stock', viewLaporan: 'reports' }[viewId];
    document.querySelectorAll('#bottomNav .bn-item').forEach(b => {
      const on = b.dataset.bnav === bnView;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    sidebar?.classList.remove('open');
    overlay?.classList.add('hidden');
    // 4.7: placeholder pencarian mengikuti halaman (bukan selalu "transaksi")
    const scope = {
      viewTransaksi: 'Cari transaksi…', viewRingkasan: 'Cari transaksi…',
      viewStock: 'Cari produk / SKU…', viewPembelian: 'Cari pembelian / supplier…',
      viewMuatan: 'Cari belanja / koli / muatan…', viewBiaya: 'Cari biaya…',
      viewSales: 'Cari struk / pelanggan…', viewPayroll: 'Cari karyawan…',
    }[viewId] || 'Cari di halaman ini…';
    const sTop = document.getElementById('searchInputTop');
    if (sTop) { sTop.placeholder = scope; sTop.setAttribute('aria-label', scope.replace('…', '')); }
    if (viewId === 'viewTransaksi') renderFullTransaksi();
    if (viewId === 'viewSales') renderSalesPage();

    if (viewId === 'viewKas') renderKasPage();
    if (viewId === 'viewPembelian') renderPembelianPage();
    if (viewId === 'viewMuatan') renderMuatanPage();
    if (viewId === 'viewBiaya') renderBiayaPage();
    if (viewId === 'viewPayroll') renderPayrollView();
    if (viewId === 'viewStock') refreshStockPage();
    if (viewId === 'viewLaporan') { refresh(); renderPageReport(); }
  }
  // default view
  showView('viewRingkasan');
  document.querySelector('[data-nav="ringkasan"]')?.addEventListener('click', () => showView('viewRingkasan'));
  document.getElementById('sidebarTransaksi')?.addEventListener('click', () => showView('viewTransaksi'));
  document.getElementById('salesBtnSidebar')?.addEventListener('click', () => showView('viewSales'));
  document.getElementById('kasBtnSidebar')?.addEventListener('click', () => showView('viewKas'));
  document.getElementById('pembelianBtnSidebar')?.addEventListener('click', () => showView('viewPembelian'));
  document.getElementById('muatanBtnSidebar')?.addEventListener('click', () => showView('viewMuatan'));
  document.getElementById('biayaBtnSidebar')?.addEventListener('click', () => showView('viewBiaya'));
  document.getElementById('assetBtnSidebar')?.addEventListener('click', () => openAssets());
  document.getElementById('coaBtnSidebar')?.addEventListener('click', openCoaModal);
  document.getElementById('kasPageAddBtn')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); });
  document.getElementById('kasPageKasBtn')?.addEventListener('click', () => { refreshKas(); UI.openKas(); });
  document.getElementById('kasPageBankBtn')?.addEventListener('click', () => { refreshKas(); UI.setBankRows([]); UI.openBank(); });
  document.getElementById('kasReconImportBtn')?.addEventListener('click', () => { refreshKas(); UI.openBank(); });
  document.getElementById('kasReconList')?.addEventListener('click', (e) => {
    const m = e.target.closest('.recon-match');
    const p = e.target.closest('.recon-post');
    const ig = e.target.closest('.recon-ignore');
    const ui = e.target.closest('.recon-unignore');
    const rl = e.target.closest('.recon-rule');
    if (m) bankReconMatch(m.dataset.key, m.dataset.entry);
    else if (p) bankReconPost(p.dataset.key);
    else if (ig) bankReconIgnore(ig.dataset.key);
    else if (ui) bankReconUnignore(ui.dataset.key);
    else if (rl) {
      const st = Storage.getBankStatement().find(s => s.key === rl.dataset.key);
      if (st) openBankRules(String(st.desc || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).join(' '), st.counterAccount);
    }
  });
  document.getElementById('kasReconMatchAllBtn')?.addEventListener('click', bankReconMatchAll);
  document.getElementById('kasReconRulesBtn')?.addEventListener('click', () => openBankRules());
  document.getElementById('kasReconApplyRulesBtn')?.addEventListener('click', bankReconApplyRules);
  document.getElementById('bankRulesClose')?.addEventListener('click', closeBankRules);
  document.getElementById('bankRuleAddBtn')?.addEventListener('click', () => bankRuleAdd());
  document.getElementById('bankRuleSeedAll')?.addEventListener('click', bankRuleSeedAll);
  document.getElementById('bankRulesClearAll')?.addEventListener('click', bankRulesClearAll);
  document.getElementById('bankRuleSearch')?.addEventListener('input', renderBankRules);
  document.getElementById('bankRuleKeyword')?.addEventListener('input', updateBankRuleSuggestion);
  document.getElementById('bankRuleDir')?.addEventListener('change', updateBankRuleSuggestion);
  document.getElementById('bankRuleSuggestion')?.addEventListener('click', (e) => {
    const b = e.target.closest('.bank-rule-use');
    if (b) { const sel = document.getElementById('bankRuleCode'); if (sel) sel.value = b.dataset.code; updateBankRuleSuggestion(); }
  });
  document.getElementById('bankRulePresets')?.addEventListener('click', (e) => {
    const b = e.target.closest('.bank-rule-preset');
    if (b) bankRuleAdd(b.dataset.kw, b.dataset.code, b.dataset.dir);
  });
  document.getElementById('bankRuleSuggestions')?.addEventListener('click', (e) => {
    const b = e.target.closest('.bank-sgst-add');
    if (b) bankRuleAddSuggestion(Number(b.dataset.i));
  });
  document.getElementById('kasReconBankSelect')?.addEventListener('change', renderKasReconDiff);
  document.getElementById('kasReconEndBal')?.addEventListener('change', () => {
    const code = document.getElementById('kasReconBankSelect')?.value || '1101';
    const val = Math.round(Number(UI.parseIdrInput(document.getElementById('kasReconEndBal')?.value || '')) || 0);
    Storage.setBankEndBalance(code, val);
    renderKasReconDiff();
  });
  document.getElementById('bankRuleAddBtn')?.addEventListener('click', bankRuleAdd);
  document.getElementById('bankRulesList')?.addEventListener('click', (e) => {
    const d = e.target.closest('.bank-rule-del');
    if (d) bankRuleDelete(d.dataset.id);
  });
  document.getElementById('bankRulesList')?.addEventListener('change', (e) => {
    const c = e.target.closest('.bank-rule-code');
    const dr = e.target.closest('.bank-rule-dir');
    if (c) Storage.updateBankRule(c.dataset.id, { code: c.value });
    else if (dr) Storage.updateBankRule(dr.dataset.id, { direction: dr.value });
    if (c || dr) { UI.showSuccess('Aturan diperbarui'); renderBankRules(); }
  });
  document.getElementById('pembelianBuyBtn')?.addEventListener('click', () => UI.openBuy());
  document.getElementById('pembelianStockBtn')?.addEventListener('click', () => UI.openSale('stock'));
  document.getElementById('pembelianSupplierBtn')?.addEventListener('click', () => UI.openSupplier());
  document.getElementById('pembelianPoList')?.addEventListener('click', (e) => {
    const recv = e.target.closest('.stock-receive');
    const st = e.target.closest('.po-status');
    if (recv) handleStockReceive(recv.dataset.id);
    else if (st) openOrderStatus('po', st.dataset.id, '');
  });
  document.getElementById('pembelianPoList')?.addEventListener('change', (e) => {
    const sel = e.target.closest('.stock-receive');
    if (sel) handleStockReceive(sel.value);
  });
  document.getElementById('biayaAddBtn')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); setTimeout(() => { const b = document.querySelector('#typeGroup .select-btn[data-value="expense"], #typeGroup .chip[data-value="expense"]'); if (b) b.click(); }, 30); });
  document.getElementById('salesNewBtn')?.addEventListener('click', () => UI.openSale());
  document.getElementById('salesExcel')?.addEventListener('click', exportSalesExcel);
  document.getElementById('salesPrint')?.addEventListener('click', printSalesPage);
  document.getElementById('creditPayClose')?.addEventListener('click', closeCreditPay);
  document.getElementById('creditPayCancel')?.addEventListener('click', closeCreditPay);
  document.getElementById('creditPaySave')?.addEventListener('click', handleCreditPaySubmit);
  document.getElementById('creditList')?.addEventListener('click', (e) => {
    const p = e.target.closest('.credit-pay');
    const d = e.target.closest('.credit-del');
    if (p) openCreditPay(p.dataset.id);
    else if (d) deleteCreditSalePrompt(d.dataset.id);
  });
  document.getElementById('lihatSemua')?.addEventListener('click', (e) => { e.preventDefault(); showView('viewTransaksi'); });
  // Bottom nav mobile
  document.getElementById('bottomNav')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-bnav]');
    if (!b) return;
    const t = b.dataset.bnav;
    if (t === 'ringkasan') showView('viewRingkasan');
    else if (t === 'muatan') showView('viewMuatan');
    else if (t === 'sales') showView('viewSales');
    else if (t === 'transaksi') showView('viewTransaksi');
    else if (t === 'gaji') showView('viewPayroll');
    else if (t === 'reports') showView('viewLaporan');
    else if (t === 'add') { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); }
    else if (t === 'more') {
      const links = [
        { goto: 'contacts', icon: '👥', label: 'Kontak', aria: 'Kontak' },
        { goto: 'stock', icon: '📦', label: 'Produk', aria: 'Produk dan stok' },
        { goto: 'sales', icon: '🛒', label: 'Penjualan', aria: 'Laporan penjualan' },
        { goto: 'pembelian', icon: '🧺', label: 'Pembelian', aria: 'Pembelian dan hutang supplier' },
        { goto: 'muatan', icon: '📦', label: 'Papan Muatan', aria: 'Belanja China dan muatan LCL' },
        { goto: 'preorder', icon: '🌏', label: 'Titip Beli', aria: 'Titip beli pelanggan' },
        { goto: 'biaya', icon: '💸', label: 'Biaya', aria: 'Pengeluaran operasional' },
        { goto: 'kas', icon: '💳', label: 'Kas', aria: 'Kas dan rekonsiliasi' },
        { goto: 'bank', icon: '🏦', label: 'Mutasi bank', aria: 'Import dan cocokkan mutasi bank' },
        { goto: 'settings', icon: '⚙️', label: 'Pengaturan', aria: 'Pengaturan' },
      ];
      const html = links.map(l => `<button type="button" class="notif-goto" data-goto="${l.goto}" aria-label="${l.aria}" style="display:flex;align-items:center;gap:10px;width:100%;background:none;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:6px;cursor:pointer">${l.icon} ${l.label}</button>`).join('');
      UI.openInfoModal('Menu lainnya', html);
    }
  });
  // keep active toggle for other sidebar items
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    if (btn.id === 'sidebarTransaksi' || btn.id === 'salesBtnSidebar' || btn.id === 'kasBtnSidebar' || btn.id === 'pembelianBtnSidebar' || btn.id === 'biayaBtnSidebar' || btn.dataset.nav === 'ringkasan') return;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sidebar?.classList.remove('open');
      overlay?.classList.add('hidden');
    });
  });
  document.getElementById('notifBtn')?.addEventListener('click', () => {
    const alerts = getAllAlerts();
    if (!alerts.length) { UI.showSuccess('Tidak ada pengingat 🎉'); return; }
    const items = alerts.map(a => `<li style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${a.icon} ${escapeHtml(a.text)}</span><button type="button" class="notif-goto" data-goto="${a.target || ''}" style="white-space:nowrap;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer">Buka →</button></li>`).join('');
    UI.openInfoModal('🔔 Pengingat', `<ul style="padding-left:20px;margin:0;list-style:disc">${items}</ul>`);
  });
  document.getElementById('infoModalBody')?.addEventListener('click', (ev) => {
    const cm = ev.target.closest('.close-month-btn[data-mk]');
    if (cm) {
      UI.closeInfoModal();
      const mk = cm.dataset.mk;
      if (confirm(`Tutup ${payrollMonthLabel(mk)}? Pendapatan & beban periode itu dipindah ke Laba Ditahan.`)) doClosing(mk);
      return;
    }
    const btn = ev.target.closest('.notif-goto[data-goto]');
    if (!btn) return;
    UI.closeInfoModal();
    const target = btn.dataset.goto;
    if (target === 'loans') UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
    else if (target === 'stock') showView('viewStock');
    else if (target === 'sales') showView('viewSales');
    else if (target === 'pembelian') showView('viewPembelian');
    else if (target === 'muatan') showView('viewMuatan');
    else if (target === 'preorder') showView('viewSales');
    else if (target === 'biaya') showView('viewBiaya');
    else if (target === 'kas') { refreshKas(); UI.openKas(); }
    else if (target === 'bank') { refreshKas(); UI.setBankRows([]); UI.openBank(); }
    else if (target === 'settings') openSettings();
    else if (target === 'tax') {
      const tab = document.querySelector('.report-tab[data-report="tax"]');
      if (tab) tab.click(); else renderReport();
      UI.openReportModal();
    }
  });
  document.getElementById('aksiTambahTransaksi')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); });
  document.getElementById('addEntryBtn2')?.addEventListener('click', () => { UI.renderPeopleDatalist(Storage.getAllPeople()); UI.openModal(); });
  document.getElementById('aksiTambahKontak')?.addEventListener('click', () => UI.openContacts(Storage.getAllPeople(), Storage.getAllLoans()));
  document.getElementById('aksiLaporan')?.addEventListener('click', () => showView('viewLaporan'));
  document.getElementById('ownerToReports')?.addEventListener('click', (e) => { e.preventDefault(); showView('viewLaporan'); });
  document.getElementById('topProductsMore')?.addEventListener('click', (e) => { e.preventDefault(); showView('viewSales'); });
  document.getElementById('reportJumpSales')?.addEventListener('click', () => showView('viewSales'));
  // Tab laporan halaman: delegasi body (tab kini terbagi 3 grup chip)
  if (!document.body.dataset.pagereportWired) {
    document.body.dataset.pagereportWired = '1';
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('.page-report-tab');
      if (!b) return;
      currentReportType = b.dataset.report;
      renderPageReport();
      if (window.innerWidth > 768) {
        const sec = document.getElementById('pageReportContent');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  document.getElementById('pageReportPrint')?.addEventListener('click', () => UI.printPageReport(periodLabelText()));
  document.getElementById('pageReportExcel')?.addEventListener('click', () => UI.exportPageReportExcel());
  const searchInp = document.getElementById('reportSearchInput');
  if (searchInp) searchInp.addEventListener('input', (e) => {
    UI.setReportSearch(e.target.value || '');
    const tab = document.querySelector('.page-report-tab.selected')?.dataset.report;
    if (tab === 'journal' || tab === 'ledger') renderPageReport();
    try { e.target.focus(); } catch {}
  });
  document.getElementById('pageReportPeriod')?.addEventListener('change', (e) => {
    const v = e.target.value;
    pageReportPeriodUi = v;
    let period = v, startDate = null, endDate = null;
    if (v === 'last-quarter') {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3); // 0-based quarter index of running month
      const pq = q === 0 ? { y: now.getFullYear() - 1, q: 3 } : { y: now.getFullYear(), q: q - 1 };
      const s = new Date(pq.y, pq.q * 3, 1);
      const en = new Date(pq.y, pq.q * 3 + 3, 0);
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      startDate = iso(s); endDate = iso(en);
      period = 'custom';
    }
    currentFilters = { period, type: 'all', category: 'all', startDate, endDate };
    renderPageReport();
    UI.showSuccess('Periode laporan diubah');
  });
  document.getElementById('aksiKategori')?.addEventListener('click', () => UI.showInfo('Kelola kategori: pilih kategori saat tambah transaksi'));
  // Topbar search mirrors main search
  const topSearch = document.getElementById('searchInputTop');
  if (topSearch) {
    topSearch.addEventListener('input', (e) => {
      const main = document.getElementById('searchInput');
      if (main) { main.value = e.target.value; main.dispatchEvent(new Event('input')); }
    });
  }
  // pagination + budget + settings
  document.getElementById('prevPage')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; render(); } });
  document.getElementById('nextPage')?.addEventListener('click', () => { currentPage++; render(); });
  document.getElementById('loadMoreBtn')?.addEventListener('click', () => { currentPage++; render(); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); });
  document.getElementById('editBudgetBtn')?.addEventListener('click', () => openSettings());
  document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettings);
  document.getElementById('closeSettingsCancel')?.addEventListener('click', closeSettings);
  document.getElementById('settingsModal')?.addEventListener('click', (e) => { if (e.target.id === 'settingsModal') closeSettings(); });
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
  document.getElementById('exportJsonBtn')?.addEventListener('click', () => { Storage.exportJSON(); UI.showSuccess('Backup JSON diunduh'); });
  document.getElementById('loansArchiveBtn')?.addEventListener('click', () => {
    UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
  });
  document.getElementById('backupShareBtn')?.addEventListener('click', handleBackupShare);
  document.getElementById('backupSelfTestBtn')?.addEventListener('click', handleBackupSelfTest);
  document.getElementById('dataHealthBtn')?.addEventListener('click', handleDataHealth);
  document.getElementById('importSalesBtn')?.addEventListener('click', () => openImport('sales'));
  document.getElementById('importProductsBtn')?.addEventListener('click', () => openImport('products'));
  document.getElementById('importClose')?.addEventListener('click', closeImport);
  document.getElementById('importCancel')?.addEventListener('click', closeImport);
  document.getElementById('importParseBtn')?.addEventListener('click', handleImportParse);
  document.getElementById('importCommitBtn')?.addEventListener('click', handleImportCommit);
  document.querySelectorAll('#importIntro .chip').forEach(c => c.addEventListener('click', () => openImport(c.dataset.mode)));
  document.getElementById('importMapWrap')?.addEventListener('change', () => { if (importMode === 'products') renderProductsPreview(); else renderSalesPreview(); });
  document.getElementById('importText')?.addEventListener('input', () => { if (importMode === 'wa') renderWaPreview(); });
  document.getElementById('stockAddBtn')?.addEventListener('click', () => { UI.resetStockForm(); UI.openStock(); });
  document.getElementById('supplierOpenBtn')?.addEventListener('click', () => UI.openSupplier());
  document.getElementById('stockImportPageBtn')?.addEventListener('click', () => openImport('products'));
  document.getElementById('stockPageSearch')?.addEventListener('input', refreshStockPage);
  document.getElementById('shopSelect')?.addEventListener('change', (e) => {
    try { Storage.setActiveShopId(e.target.value); } catch {}
    refreshStockPage();
    refreshStock();
  });
  document.getElementById('stockPageFilter')?.addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    stockPageFilter = c.dataset.f || 'all';
    document.querySelectorAll('#stockPageFilter .chip').forEach(x => x.classList.toggle('selected', x === c));
    refreshStockPage();
  });
  document.getElementById('stockPageList')?.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const k = th.dataset.sort;
      stockSort = (stockSort && stockSort.key === k) ? { key: k, dir: stockSort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'asc' };
      refreshStockPage();
      return;
    }
    const chip = e.target.closest('.stock-chip');
    const jual = e.target.closest('.stock-page-jual');
    const restock = e.target.closest('.stock-page-restock');
    const hist = e.target.closest('.stock-page-history');
    const bc = e.target.closest('.stock-page-barcode');
    const rowEdit = e.target.closest('.stock-row-edit');
    const rowQr = e.target.closest('.stock-row-qr');
    if (chip) openStockActionSheet(chip.dataset.id);
    else if (rowEdit) { const it = Storage.getItemById(rowEdit.dataset.id); if (it) { UI.fillStockForm(it); UI.openStock(); } }
    else if (rowQr) openBarcode(rowQr.dataset.id);
    else if (bc && bc.dataset.id) openBarcode(bc.dataset.id);
    else if (jual) UI.openSale();
    else if (restock) handleStockRestockGroup(restock.dataset.key);
    else if (hist) handleStockHistoryGroup(hist.dataset.key);
  });
  document.getElementById('stockPageSummary')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    if (b.dataset.f === 'moves') { openStockMovementsToday(); return; }
    stockPageFilter = b.dataset.f || 'all';
    refreshStockPage();
  });
  document.getElementById('stockActionClose')?.addEventListener('click', closeStockActionSheet);
  document.getElementById('saAdd')?.addEventListener('click', () => { const id = stockActionId; closeStockActionSheet(); openRestockForItem(id); });
  document.getElementById('saAdjust')?.addEventListener('click', () => { const id = stockActionId; closeStockActionSheet(); openStockAdjust(id); });
  document.getElementById('saTransfer')?.addEventListener('click', () => { const id = stockActionId; closeStockActionSheet(); openTransfer(id); });
  document.getElementById('saHistory')?.addEventListener('click', () => { const id = stockActionId; closeStockActionSheet(); handleStockHistory(id); });
  document.getElementById('saJual')?.addEventListener('click', () => { closeStockActionSheet(); UI.openSale(); });
  document.getElementById('saEdit')?.addEventListener('click', () => { const id = stockActionId; const it = Storage.getItemById(id); closeStockActionSheet(); if (it) { UI.fillStockForm(it); UI.openStock(); } });
  document.getElementById('saDelete')?.addEventListener('click', () => { const id = stockActionId; closeStockActionSheet(); handleStockDelete(id); });
  document.getElementById('saBarcode')?.addEventListener('click', () => { const id = stockActionId; closeStockActionSheet(); openBarcode(id); });
  document.getElementById('barcodeClose')?.addEventListener('click', closeBarcode);
  document.getElementById('barcodeCloseBtn')?.addEventListener('click', closeBarcode);
  document.getElementById('barcodePrint')?.addEventListener('click', printBarcode);
  document.getElementById('stockPageList')?.addEventListener('change', (e) => {
    if (e.target.id === 'stockSelectAll') {
      document.querySelectorAll('#stockPageList .stock-row-check').forEach(c => { c.checked = e.target.checked; });
      renderBulkBar();
    } else if (e.target.classList.contains('stock-row-check')) renderBulkBar();
  });
  document.getElementById('stockViewToggle')?.addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    stockView = c.dataset.v === 'table' ? 'table' : 'cards';
    safeLocalSet('wynara_stockView', stockView);
    refreshStockPage();
  });
  document.getElementById('reorderBtn')?.addEventListener('click', handleReorderReport);
  document.getElementById('stockShowInactive')?.addEventListener('change', (e) => { stockShowInactive = e.target.checked; refreshStockPage(); });
  document.getElementById('bulkActivate')?.addEventListener('click', () => bulkSetActive(true));
  document.getElementById('bulkArchive')?.addEventListener('click', () => bulkSetActive(false));
  document.getElementById('bulkCategory')?.addEventListener('change', (e) => {
    const cat = e.target.value; if (!cat) return;
    const ids = selectedStockIds(); if (!ids.length) return;
    Storage.setItemsCategory(ids, cat);
    UI.showSuccess(`${ids.length} produk diset kategori “${cat}”`);
    refreshStock();
    e.target.value = '';
    queueMirror();
  });
  document.getElementById('bulkExport')?.addEventListener('click', bulkExportCsv);
  document.getElementById('bulkStockEditBtn')?.addEventListener('click', handleBulkEditOpen);
  document.getElementById('bulkStockDeleteBtn')?.addEventListener('click', handleStockBulkDelete);
  document.getElementById('bulkEditClose')?.addEventListener('click', closeBulkEdit);
  document.getElementById('bulkEditCancel')?.addEventListener('click', closeBulkEdit);
  document.getElementById('bulkEditSave')?.addEventListener('click', handleBulkEditSubmit);
  document.getElementById('bulkCancel')?.addEventListener('click', () => {
    document.querySelectorAll('#stockPageList .stock-row-check').forEach(c => { c.checked = false; });
    renderBulkBar();
  });
  document.getElementById('stockPageSearch')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = String(e.target.value || '').trim().toLowerCase();
    if (!q) return;
    const all = Storage.getAllItems();
    const exact = all.find(i => String(i.barcode || '').toLowerCase() === q || String(i.sku || '').toLowerCase() === q);
    const near = exact || all.find(i => String(i.barcode || '').toLowerCase().includes(q) || String(i.sku || '').toLowerCase().includes(q));
    if (near) { UI.fillStockForm(near); UI.openStock(); }
  });
  document.getElementById('restockClose')?.addEventListener('click', closeRestock);
  document.getElementById('restockCancel')?.addEventListener('click', closeRestock);
  document.getElementById('restockSource')?.addEventListener('change', applyRestockSource);
  applyRestockSource();
  document.getElementById('restockSave')?.addEventListener('click', handleRestockSubmit);
  document.getElementById('returnClose')?.addEventListener('click', closeReturn);
  document.getElementById('returnCancel')?.addEventListener('click', closeReturn);
  document.getElementById('returnSave')?.addEventListener('click', handleReturnSubmit);
  document.getElementById('returnRows')?.addEventListener('input', updateReturnTotal);
  document.getElementById('stockAdjustOpenBtn')?.addEventListener('click', openStockAdjust);
  document.getElementById('stockAdjustClose')?.addEventListener('click', closeStockAdjust);
  document.getElementById('stockAdjustCancel')?.addEventListener('click', closeStockAdjust);
  document.getElementById('stockAdjustSave')?.addEventListener('click', handleStockAdjustSubmit);
  document.getElementById('stkAdjItem')?.addEventListener('change', updateStockAdjInfo);
  document.getElementById('transferOpenBtn')?.addEventListener('click', openTransfer);
  document.getElementById('transferClose')?.addEventListener('click', closeTransfer);
  document.getElementById('transferCancel')?.addEventListener('click', closeTransfer);
  document.getElementById('transferSave')?.addEventListener('click', handleTransferSubmit);
  document.getElementById('trfItem')?.addEventListener('change', updateTrfInfo);
  document.getElementById('trfFrom')?.addEventListener('change', updateTrfInfo);
  document.getElementById('severanceBtn')?.addEventListener('click', openSeverance);
  document.getElementById('severanceClose')?.addEventListener('click', () => { const m = document.getElementById('severanceModal'); if (m && m.open) { try { m.close(); } catch {} } });
  document.getElementById('sevEmp')?.addEventListener('change', sevFillFromEmp);
  document.getElementById('sevCalc')?.addEventListener('click', handleSeveranceCalc);
  document.getElementById('cloudAnonBtn')?.addEventListener('click', handleCloudAnon);
  document.getElementById('cloudLinkBtn')?.addEventListener('click', handleCloudLinkEmail);
  document.getElementById('cloudEmailLoginBtn')?.addEventListener('click', handleCloudEmailLogin);
  document.getElementById('cloudSyncBtn')?.addEventListener('click', handleCloudSyncNow);
  document.getElementById('cloudPingBtn')?.addEventListener('click', handleCloudPing);
  document.getElementById('cloudOffBtn')?.addEventListener('click', handleCloudOff);
  document.getElementById('closingBtn')?.addEventListener('click', handleClosing);
  const buildTaxCsv = () => {
    const d = buildTaxReport();
    const rows = [['Periode', 'Omzet', 'PPh Final 0,5%']];
    (d.months || []).forEach(m => rows.push([m.month, Math.round(m.omzet), Math.round(m.pph)]));
    rows.push([`TOTAL ${d.year}`, Math.round(d.omzetYear), Math.round(d.pphYear)]);
    rows.push(['PPN Keluaran', Math.round(d.ppnOut), '']);
    rows.push(['PPN Masukan', Math.round(d.ppnIn), '']);
    rows.push(['PPN Kurang Bayar', Math.round(d.ppnNet), '']);
    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `wynara-pajak-${d.year}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.showSuccess(`CSV pajak ${d.year} diunduh — siap untuk DJP/e-Bupot`);
  };
  document.addEventListener('wynara:tax-csv', buildTaxCsv);
  const dlCsv = (name, rows) => {
    const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.addEventListener('wynara:ppn-csv', () => {
    const d = buildPPNReport();
    const rows = [['Bulan', 'DPP Keluaran', 'PPN Keluar', 'DPP Masukan', 'PPN Masuk', 'Kurang/(Lebih)']];
    (d.months || []).forEach(m => rows.push([m.month, m.keluarDPP, m.keluarPPN, m.masukDPP, m.masukPPN, m.net]));
    rows.push(['TOTAL', '', d.totalKeluar, '', d.totalMasuk, d.net]);
    dlCsv(`wynara-ppn-1111-${d.year}.csv`, rows);
    UI.showSuccess('CSV SPT Masa PPN 1111 diunduh');
  });
  document.addEventListener('wynara:pph23-csv', () => {
    const d = buildPPh23Report();
    const rows = [['Bulan', 'Dipotong', 'Disetor', 'Sisa']];
    (d.months || []).forEach(m => rows.push([m.month, m.dipotong, m.disetor, m.net]));
    rows.push(['TOTAL', d.totalDipotong, d.totalDisetor, d.outstanding]);
    dlCsv(`wynara-pph23-4-2-${d.year}.csv`, rows);
    UI.showSuccess('CSV rekap PPh 23/4(2) diunduh');
  });
  document.addEventListener('wynara:pph21-csv', () => {
    const d = buildPPh21Report();
    const rows = [['Bulan', 'Gaji bersih (THP)', 'PPh 21 terpotong', 'Karyawan']];
    (d.rows || []).forEach(m => rows.push([m.month, m.thp, m.pph, m.count]));
    rows.push(['TOTAL', d.totalThp, d.totalPph, '']);
    dlCsv(`wynara-pph21-${d.year}.csv`, rows);
    UI.showSuccess('CSV rekap PPh 21 diunduh (e-SPT 21)');
  });
  document.addEventListener('wynara:expense-filter', (ev) => {
    const det = ev.detail || {};
    if (det.kind === 'cat') expenseCatFilter = det.value || 'all';
    if (det.kind === 'person') expensePersonFilter = det.value || 'all';
    renderReport();
    renderPageReport();
  });
  document.addEventListener('wynara:ledger-toggle', (ev) => {
    const det = ev.detail || {};
    UI.toggleDrill(det.kind || 'ledger', det.code || '');
    renderReport();
    renderPageReport();
  });
  document.addEventListener('wynara:dec-apply', (ev) => handleDecApply(ev.detail));
  document.addEventListener('wynara:dec-a1', (ev) => handleDecA1(ev.detail));
  document.getElementById('importJsonBtn')?.addEventListener('click', () => document.getElementById('importJsonFile')?.click());
  document.getElementById('importJsonFile')?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleImport(f); e.target.value = ''; });
  // Export mengikuti tampilan terfilter (bukan seluruh DB)
  document.getElementById('exportExcelBtn2')?.addEventListener('click', () => {
    try {
      const rows = getCurrentViewEntries();
      if (!rows.length) { UI.showInfo('Tidak ada data pada tampilan ini'); return; }
      Storage.exportExcelEntries(rows, `wynara-tampilan-${new Date().toISOString().split('T')[0]}.xlsx`);
      UI.showSuccess(`${rows.length} baris diexport ke Excel`);
    } catch (err) { UI.showError(err.message); }
  });
  document.getElementById('exportCsvBtn2')?.addEventListener('click', () => {
    try {
      const rows = getCurrentViewEntries();
      if (!rows.length) { UI.showInfo('Tidak ada data pada tampilan ini'); return; }
      Storage.exportCSVEntries(rows, `wynara-tampilan-${new Date().toISOString().split('T')[0]}.csv`);
      UI.showSuccess(`${rows.length} baris diexport ke CSV`);
    } catch (err) { UI.showError(err.message); }
  });
  document.getElementById('importAnyBtn')?.addEventListener('click', () => document.getElementById('importAnyFile')?.click());
  document.getElementById('importAnyFile')?.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleImport(f); e.target.value = ''; });
  document.getElementById('printBtn2')?.addEventListener('click', handlePrint);
  // budgetInput/equityInput diformat otomatis oleh initIdrInputs (desimal-aware)
  // fix themeToggleSidebar to open settings instead of directly toggling
  const themeSidebar = document.getElementById('themeToggleSidebar');
  if (themeSidebar) {
    const newEl = themeSidebar.cloneNode(true);
    themeSidebar.parentNode.replaceChild(newEl, themeSidebar);
    newEl.addEventListener('click', () => openSettings());
    newEl.id = 'themeToggleSidebar';
  }

  // tx income filter
  document.querySelectorAll('#txTypeFilter .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#txTypeFilter .chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const val = btn.dataset.value;
      const hiddenBtn = document.querySelector(`#typeGroupFilter .chip[data-value="${val}"]`);
      if (hiddenBtn) {
        document.querySelectorAll('#typeGroupFilter .chip').forEach(b => b.classList.remove('selected'));
        hiddenBtn.classList.add('selected');
      }
      currentFilters.type = val;
      currentPage = 1;
      render();
    });
  });

  // P1: density + column chooser (persisted)
  const applyDensity = () => {
    const panel = document.querySelector('.dash-panel-table');
    const mode = safeLocalGet('wynara_density') || 'padat';
    if (panel) { panel.classList.remove('density-padat', 'density-nyaman'); panel.classList.add(mode === 'nyaman' ? 'density-nyaman' : 'density-padat'); }
    document.querySelectorAll('#densityGroup .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === mode));
  };
  document.querySelectorAll('#densityGroup .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      safeLocalSet('wynara_density', btn.dataset.value);
      applyDensity();
    });
  });
  const applyPayCol = () => {
    const hide = safeLocalGet('wynara_hidePay') === '1';
    document.querySelector('.dash-panel-table')?.classList.toggle('hide-pay', hide);
    document.getElementById('transaksiTable')?.classList.toggle('hide-pay', hide);
    const t = document.getElementById('togglePayCol');
    if (t) { t.textContent = hide ? 'Cara Bayar: OFF' : 'Cara Bayar: ON'; t.setAttribute('aria-pressed', String(hide)); t.classList.toggle('selected', !hide); }
  };
  document.getElementById('togglePayCol')?.addEventListener('click', () => {
    const hide = safeLocalGet('wynara_hidePay') === '1';
    safeLocalSet('wynara_hidePay', hide ? '0' : '1');
    applyPayCol();
  });
  applyDensity();
  applyPayCol();

  // 5.1 Status Pajak: Non-PKP (default) menyembunyikan seluruh permukaan PPN
  const applyTaxStatus = () => {
    const pkp = safeLocalGet('wynara_taxpkp') === '1';
    document.body.classList.toggle('tax-nonpkp', !pkp);
    const cb = document.getElementById('settingTaxPKP');
    if (cb) cb.checked = pkp;
  };
  document.getElementById('settingTaxPKP')?.addEventListener('change', (e) => {
    safeLocalSet('wynara_taxpkp', e.target.checked ? '1' : '0');
  applyTaxStatus();

  // 5.5 Multi-toko di balik sakelar (default mati): satu gudang saja
  const applyMultiStore = () => {
    const on = safeLocalGet('wynara_multistore') === '1';
    document.body.classList.toggle('mstore-off', !on);
    const cb = document.getElementById('settingMultiStore');
    if (cb) cb.checked = on;
  };
  document.getElementById('settingMultiStore')?.addEventListener('change', (e) => {
    safeLocalSet('wynara_multistore', e.target.checked ? '1' : '0');
  applyMultiStore();

  // 5.4 Peran yang tidak ada: Mode Kasir & PIN HRD disembunyikan permanen; Akuntan tetap
  document.body.classList.add('no-kasir', 'no-hrd');

    UI.showInfo(e.target.checked ? 'Multi-toko aktif' : 'Multi-toko mati — satu gudang');
  });
  applyMultiStore();

    UI.showInfo(e.target.checked ? 'Status pajak: PKP — permukaan PPN tampil' : 'Status pajak: Non-PKP — seluruh PPN disembunyikan');
  });
  applyTaxStatus();

  // P2: arus kas range + toggle
  document.querySelectorAll('#arusRange .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      arusKasRange = Number(btn.dataset.value) || 6;
      safeLocalSet('wynara_arusRange', String(arusKasRange));
      renderArusKasChart(getCurrentViewEntriesRaw());
    });
  });
  document.querySelectorAll('#arusToggle .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.value;
      arusKasShow[k] = !arusKasShow[k];
      safeLocalSet('wynara_arusShow', JSON.stringify(arusKasShow));
      renderArusKasChart(getCurrentViewEntriesRaw());
    });
  });

  // P3: bulk select (delegated, survives re-render)
  document.getElementById('entriesBody')?.addEventListener('change', (e) => {
    const cb = e.target.closest('.row-select');
    if (!cb || cb.disabled) return;
    if (cb.checked) window.__selectedIds.add(cb.dataset.id);
    else window.__selectedIds.delete(cb.dataset.id);
    updateBulkBar();
  });
  document.getElementById('selectAllRows')?.addEventListener('change', (e) => {
    document.querySelectorAll('#entriesBody .row-select:not(:disabled)').forEach(cb => {
      cb.checked = e.target.checked;
      if (e.target.checked) window.__selectedIds.add(cb.dataset.id);
      else window.__selectedIds.delete(cb.dataset.id);
    });
    updateBulkBar();
  });
  document.getElementById('bulkClearBtn')?.addEventListener('click', () => { window.__selectedIds.clear(); render(); updateBulkBar(); });
  document.getElementById('bulkDeleteBtn')?.addEventListener('click', handleBulkDelete);
  document.getElementById('bulkExportBtn')?.addEventListener('click', () => {
    const rows = getCurrentViewEntries().filter(e => window.__selectedIds.has(e.id));
    if (!rows.length) { UI.showInfo('Pilih dulu baris yang mau diexport'); return; }
    Storage.exportExcelEntries(rows, `wynara-terpilih-${new Date().toISOString().split('T')[0]}.xlsx`);
    UI.showSuccess(`${rows.length} baris diexport ke Excel`);
  });
  document.getElementById('exportViewBtn')?.addEventListener('click', () => {
    const rows = getCurrentViewEntries();
    if (!rows.length) { UI.showInfo('Tidak ada data pada tampilan ini'); return; }
    Storage.exportExcelEntries(rows, `wynara-tampilan-${new Date().toISOString().split('T')[0]}.xlsx`);
    UI.showSuccess(`${rows.length} baris (tampilan + filter + pencarian) diexport`);
  });
  updateBulkBar();

  // delegated: filter pills reset (no inline onclick)
  document.getElementById('filterPills')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="reset-filters"]')) resetAllFilters();
  });
  // topbar pills: account info + period opens custom range
  document.getElementById('topbarAccount')?.addEventListener('click', () => {
    const n = Storage.snapshotSize();
    const last = Storage.getLastBackup();
    UI.openInfoModal('👤 Akun utama',
      `<p><b>admin</b> — demo lokal (tanpa server, data tersimpan di browser ini).</p>` +
      `<p>📦 ${n} baris data tersimpan.</p>` +
      `<p>💾 Backup terakhir: ${last ? last.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'belum pernah'}.</p>`);
  });
  document.getElementById('topbarPeriod')?.addEventListener('click', () => {
    UI.openCustomDateModal();
  });
  // sidebar help → panduan beneran
  UI.bindInfoModal();
  document.querySelector('.sidebar-help-btn')?.addEventListener('click', () => {
    UI.openInfoModal('❓ Bantuan Wynara',
      '<p><b>Alur harian:</b> Ringkasan → catat penjualan/biaya → pesanan preorder dipantau di <b>Pesanan Berjalan</b> (Penjualan).</p>' +
      '<p><b>Pesanan preorder China:</b> DP masuk → 🛍 Beli di marketplace → 🧾 tempel daftar koli dari forwarder → muat &amp; berangkat di <b>Papan Muatan</b> → tiba (biaya mendarat otomatis masuk harga modal) → kirim ke pelanggan.</p>' +
      '<p><b>Periode:</b> satu kontrol di kanan atas (mis. “Bulan ini ▾”) — Penjualan, Biaya, dan Ringkasan mengikuti periode itu. Pesanan Berjalan sengaja <b>semua periode</b>.</p>' +
      '<p><b>Data aman:</b> Pengaturan → JSON Backup tiap bulan, atau nyalakan Sinkron Online. Status penyimpanan selalu tampak di kanan atas.</p>');
  });

function loadChangelogPage() {
  const box = document.getElementById('changelogContent');
  if (!box) return;
  box.innerHTML = '<p style="color:#94a3b8">Memuat…</p>';
  const fallback = `<p>Sedang berjalan <b>v${APP_VERSION}</b>. Riwayat lengkap ada di file <code>CHANGELOG.md</code> pada repo.</p>`;
  let settled = false;
  const timer = setTimeout(() => { if (!settled) { settled = true; box.innerHTML = fallback; } }, 8000);
  fetch('CHANGELOG.md').then(r => {
    if (!r.ok) throw new Error('not-found');
    return r.text();
  }).then(t => {
    if (settled) return;
    settled = true; clearTimeout(timer);
    // Batasi tampilan ke rilis terbaru saja: file besar membuat DOM berat di HP.
    const lines = String(t).split('\n');
    let seen = 0, cut = lines.length;
    for (let i = 0; i < lines.length; i++) {
      if (/^## \[/.test(lines[i])) { seen++; if (seen > 8) { cut = i; break; } }
    }
    const head = lines.slice(0, cut).join('\n');
    const more = cut < lines.length
      ? '<p style="font-size:12px;color:#64748b;margin-top:12px">…rilis lama disembunyikan. Berkas lengkap: <code>CHANGELOG.md</code> di repo.</p>' : '';
    box.innerHTML = renderChangelogMd(head) + more;
  }).catch(() => {
    if (settled) return;
    settled = true; clearTimeout(timer);
    box.innerHTML = fallback;
  });
}
// Markdown minimal (aman XSS: escape dulu, lalu format sebaris)
function renderChangelogMd(t) {
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const inline = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  esc.split('\n').forEach(line => {
    if (/^### /.test(line)) { closeList(); out.push(`<h4 style="margin:14px 0 4px">${inline(line.slice(4))}</h4>`); }
    else if (/^## /.test(line)) { closeList(); out.push(`<h3 style="margin:18px 0 6px">${inline(line.slice(3))}</h3>`); }
    else if (/^# /.test(line)) { closeList(); out.push(`<h2 style="margin:18px 0 6px">${inline(line.slice(2))}</h2>`); }
    else if (/^---+$/.test(line)) { closeList(); out.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">'); }
    else if (/^- /.test(line)) { if (!inList) { out.push('<ul style="padding-left:20px;margin:4px 0">'); inList = true; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (!line.trim()) { closeList(); }
    else { closeList(); out.push(`<p style="margin:4px 0">${inline(line)}</p>`); }
  });
  closeList();
  return out.join('');
}
  document.getElementById('changelogLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    showView('viewChangelog');
    loadChangelogPage();
  });
  // transaksi view filters
  document.getElementById('transaksiSearch')?.addEventListener('input', (e) => {
    const main = document.getElementById('searchInput');
    const top = document.getElementById('searchInputTop');
    if (main) main.value = e.target.value;
    if (top) top.value = e.target.value;
    if (main) main.dispatchEvent(new Event('input'));
    else { currentPage = 1; transaksiPage = 1; render(); renderFullTransaksi(); }
  });
  document.getElementById('transaksiFilterJenis')?.addEventListener('change', (e) => {
    const v = e.target.value;
    const val = (v === 'income' || v === 'expense') ? v : 'all';
    currentFilters.type = val;
    const hidden = document.querySelector(`#typeGroupFilter .chip[data-value="${val}"]`);
    if (hidden) {
      document.querySelectorAll('#typeGroupFilter .chip').forEach(b => b.classList.remove('selected'));
      hidden.classList.add('selected');
    }
    // sync txTypeFilter
    document.querySelectorAll('#txTypeFilter .chip').forEach(b => {
      b.classList.toggle('selected', b.dataset.value === val);
    });
    currentPage = 1; transaksiPage = 1;
    render(); renderFullTransaksi();
  });
  document.getElementById('transaksiFilterKategori')?.addEventListener('change', (e) => {
    currentFilters.category = e.target.value;
    currentPage = 1; transaksiPage = 1;
    render(); renderFullTransaksi();
  });
  document.getElementById('transaksiPrev')?.addEventListener('click', () => { if (transaksiPage > 1) { transaksiPage--; renderFullTransaksi(); } });
  document.getElementById('transaksiNext')?.addEventListener('click', () => { transaksiPage++; renderFullTransaksi(); });
  document.addEventListener('wynara:edit', (e) => handleEdit(e.detail));
  document.addEventListener('wynara:delete', (e) => handleDelete(e.detail));
  document.addEventListener('wynara:receipt', (e) => handleReceipt(e.detail));

  window.__getActivePiutangPeople = () => {
    const loans = Storage.getAllLoans();
    const repayments = Storage.getAllRepayments();
    const allPeople = Storage.getAllPeople();
    const contactMap = new Map();
    allPeople.forEach(p => contactMap.set(p.name, p.type || 'person'));

    const loanSummary = new Map();
    loans.forEach(l => {
      const outstanding = outstandingOf(l, repayments.filter(r => r.loanId === l.id));
      if (outstanding > 0) {
        const existing = loanSummary.get(l.person) || { given: 0, taken: 0 };
        if (l.direction === 'given') existing.given += outstanding;
        else existing.taken += outstanding;
        loanSummary.set(l.person, existing);
      }
    });

    const result = [];
    allPeople.forEach(p => {
      const ls = loanSummary.get(p.name);
      const outstanding = ls ? (ls.given + ls.taken) : 0;
      result.push({ name: p.name, type: p.type || 'person', outstanding, hasLoan: !!ls });
    });
    result.sort((a, b) => {
      if (a.hasLoan && !b.hasLoan) return -1;
      if (!a.hasLoan && b.hasLoan) return 1;
      return b.outstanding - a.outstanding;
    });
    return result;
  };
  window.__getAllPeople = () => Storage.getAllPeople();
  window.__getActiveEmployees = () => {
    const repayments = Storage.getAllRepayments();
    return Storage.getAllEmployees()
      .filter(e => e.active !== false)
      .map(e => {
        const loans = Storage.getKasbonLoans(e.id, e.name);
        const kasbon = loans.reduce((s, l) => s + Math.max(totalOwed(l) - paidOf(repayments.filter(r => r.loanId === l.id)), 0), 0);
        return { id: e.id, name: e.name, role: e.role || '', kasbon: Math.round(kasbon) };
      });
  };
  const buildOutstanding = (direction) => {
    const loans = Storage.getAllLoans().filter(l => l.direction === direction && l.status !== 'paid');
    const repayments = Storage.getAllRepayments();
    return loans.map(l => {
      const reps = repayments.filter(r => r.loanId === l.id);
      const paid = paidOf(reps);
      const outstanding = outstandingOf(l, reps);
      const instAmt = Number(l.installmentAmount) || 0;
      const tenor = calcTenor(l);
      return {
        id: l.id,
        person: l.person,
        contactType: l.contactType || 'person',
        amount: totalOwed(l),
        paid,
        paidCount: reps.length,
        instAmt,
        outstanding,
        tenor,
        nextAmt: instAmt > 0 ? Math.min(instAmt, outstanding) : outstanding,
        date: l.date
      };
    }).filter(x => x.outstanding > 0.009)
      .sort((a, b) => b.outstanding - a.outstanding);
  };
  window.__getOutstandingHutang = () => buildOutstanding('taken');
  window.__getOutstandingPiutang = () => buildOutstanding('given');
  UI.bindRepayFormSubmit(handleRepaySubmit);

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  document.querySelectorAll('.sortable-col').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });
}

function computeLoanSummary() {
  return Reports.computeLoanSummary(Storage.getAllLoans(), Storage.getAllRepayments());
}

function getFilteredLoans() {
  const term = (loanSearchTerm || '').trim().toLowerCase();
  let all = Storage.getAllLoans();
  if (loanDirectionFilter === 'given' || loanDirectionFilter === 'taken') {
    all = all.filter(l => l.direction === loanDirectionFilter);
  }
  if (loanHidePaid) all = all.filter(l => l.status !== 'paid');
  return term ? all.filter(l => (l.person || '').toLowerCase().includes(term)) : all;
}

function renderLoansView() {
  UI.renderLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans());
}

function refreshLoans() {
  UI.openLoans(getFilteredLoans(), Storage.getAllRepayments(), computeLoanSummary(), Storage.getAllLoans(), Storage.getAllPeople());
  refresh();
}

function handleFormSubmit() {
  const data = UI.getFormData();
  const error = UI.validateForm(data);
  if (error) {
    UI.showError(error);
    return;
  }

  let ok = false;
  try {
    ok = submitFormData(data) !== false;
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan — coba lagi');
    return;
  }
  if (!ok) return; // validasi gagal — biarkan form terbuka biar bisa dibetulkan

  const recCb = document.getElementById('entryRecurring');
  if (recCb) recCb.checked = false;
  UI.closeModal();
  refresh();
}

function submitFormData(data) {
  // Kunci periode: transaksi bulan terkunci tak bisa ditambah/diubah/dipindah.
  // Cek tanggal tujuan dulu (menutup celah create-backdated), lalu tanggal lama saat edit.
  if (data.date && Storage.isMonthLocked(data.date)) {
    UI.showError(`Bulan ${String(data.date).slice(0, 7)} terkunci — buka di Pengaturan kalau mau ubah`);
    return false;
  }
  if (data.id) {
    const prev = Storage.getEntryById(data.id);
    if (prev && Storage.isMonthLocked(prev.date)) {
      UI.showError(`Transaksi bulan ${String(prev.date).slice(0, 7)} terkunci — buka di Pengaturan kalau mau ubah`);
      return false;
    }
  }
  const isLoan = LOAN_CATEGORIES.includes(data.category);

  if (isLoan) {
    const mode = data.loanMode || 'new';
    // 4 flows: Pinjemin 📤 / Balikin 📥 (terima) vs Ambil Loan 📥 / Balikin 📤 (bayar)
    if (mode === 'settle') {
      if (data.id) {
        UI.showError('Balikin tidak bisa diubah dari sini. Gunakan panel Pinjaman.');
        return false;
      }
      const loanId = data.loanId || null;
      if (!loanId) { UI.showError(data.category === 'Hutang' ? 'Pilih dulu loan yang mau kamu balikin' : 'Pilih dulu siapa yang balikin ke kamu'); return false; }
      const loan = Storage.getLoanById(loanId);
      if (!loan) { UI.showError('Pinjaman terpilih tidak ditemukan — pilih ulang'); return false; }
      const expectedDir = data.category === 'Hutang' ? 'taken' : 'given';
      if (loan.direction !== expectedDir) { UI.showError('Pinjaman terpilih tidak sesuai kategori — pilih ulang'); return false; }
      const reps = Storage.getLoanRepayments(loanId);
      const outstanding = outstandingOf(loan, reps);
      if (data.amount > outstanding + 0.01) {
        UI.showError(`Nominal melebihi sisa ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(Math.max(outstanding, 0))}`);
        return false;
      }
      Storage.addRepayment({
        loanId,
        amount: data.amount,
        date: data.date,
        description: data.description || (data.category === 'Hutang' ? `Balikin ke ${loan.person}` : `Dibalikin dari ${loan.person}`),
        payment: data.payment,
        paymentDetail: data.paymentDetail
      });
      const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(v);
      UI.showSuccess(data.category === 'Hutang'
        ? `Oke, kamu balikin ${fmt(data.amount)} ke ${loan.person} 👍`
        : `${loan.person} sudah balikin ${fmt(data.amount)} ke kamu 👍`);
    } else {
      const direction = data.category === 'Piutang' ? 'given' : 'taken';
      if (!data.person) { UI.showError(data.category === 'Hutang' ? 'Tulis dulu dari siapa ambil loan' : 'Tulis dulu ke siapa kasih pinjam'); return false; }
      // Kontak "Karyawan" → resolve & validasi ke data karyawan (kasbon)
      let employeeId = '';
      if (data.contactType === 'karyawan') {
        const emp = Storage.getAllEmployees().find(e => String(e.name || '').trim().toLowerCase() === String(data.person || '').trim().toLowerCase());
        if (!emp) { UI.showError('Karyawan tidak ditemukan — pilih dari daftar karyawan di kolom nama'); return false; }
        employeeId = emp.id;
      }

      if (data.id) {
        const existing = Storage.getEntryById(data.id);
        if (existing && existing.loanId) {
          Storage.updateLoan(existing.loanId, {
            direction,
            contactType: data.contactType,
            loanType: data.loanType,
            installmentAmount: data.installmentAmount,
            interestRate: data.interestRate,
            person: data.person,
            amount: data.amount,
            date: data.date,
            dueDate: data.loanDue,
            description: data.description,
            payment: data.payment,
            paymentDetail: data.paymentDetail,
            employeeId: employeeId || undefined
          });
        } else {
          Storage.updateEntry(data.id, data);
        }
        UI.showSuccess('Transaksi diperbarui');
      } else {
        Storage.savePerson(data.person, data.contactType);
        if (data.category === 'Piutang' && !data.invoiceNo) data.invoiceNo = Storage.nextInvoiceNo();
        Storage.createLoan({
          direction,
          contactType: data.contactType,
          loanType: data.loanType,
          installmentAmount: data.installmentAmount,
          interestRate: data.interestRate,
          person: data.person,
          amount: data.amount,
          date: data.date,
          dueDate: data.loanDue,
          description: data.description,
          payment: data.payment,
          paymentDetail: data.paymentDetail,
          invoiceNo: data.invoiceNo,
          employeeId
        });
        UI.showSuccess(data.category === 'Hutang' ? `Oke, kamu pinjam ${Reports.formatCurrency(data.amount)} dari ${data.person} 💰` : `Kasih pinjam ${Reports.formatCurrency(data.amount)} ke ${data.person} 📤${data.invoiceNo ? ` • ${data.invoiceNo}` : ''}`);
      }
    }
  } else {
    if (data.id) {
      const existing = Storage.getEntryById(data.id);
      if (existing && existing.loanId) {
        UI.showError('Transaksi pinjaman tidak bisa diubah dari sini. Gunakan panel Pinjaman.');
        return false;
      }
      Storage.updateEntry(data.id, data);
      UI.showSuccess('Transaksi diperbarui');
    } else {
      Storage.createEntry(data);
      const rec = document.getElementById('entryRecurring');
      if (rec && rec.checked) {
        const list = Storage.getRecurring();
        list.push({ ...data, recurringId: Date.now().toString(36), createdAt: new Date().toISOString() });
        Storage.saveRecurring(list);
        UI.showInfo('Recurring aktif: otomatis dibuat tiap bulan');
      }
      UI.showSuccess('Transaksi ditambahkan');
    }
  }
  return true;
}

function handleEdit(id) {
  const entry = Storage.getEntryById(id);
  if (entry) {
    UI.renderPeopleDatalist(Storage.getAllPeople());
    if (entry.loanId) {
      const loan = Storage.getLoanById(entry.loanId);
      if (loan && Number(loan.interestRate) > 0) entry.interestRate = Number(loan.interestRate);
    }
    UI.openModal(entry);
  }
}

function handleDelete(id) {
  const entry = Storage.getEntryById(id);
  if (entry && entry.loanId) {
    if (confirm('Hapus transaksi pinjaman ini beserta riwayat pembayaran?')) {
      Storage.deleteLoan(entry.loanId);
      UI.showSuccess('Pinjaman dihapus');
      refresh();
    }
  } else {
    const snapshot = { ...entry };
    Storage.deleteEntry(id);
    refresh();
    UI.showUndoToast('Transaksi dihapus', () => {
      Storage.restoreEntry(snapshot);
      UI.showSuccess('Transaksi dikembalikan');
      refresh();
    });
  }
}

/* ===== Retur penjualan ===== */
let returnSaleId = '';
function handleReturnOpen(entryId) {
  const e = Storage.getEntryById(entryId);
  if (!e || !e.sale || !Array.isArray(e.sale.lines)) return UI.showError('Bukan penjualan barang');
  returnSaleId = entryId;
  const returned = Storage.returnedQtyFor(entryId);
  const all = Storage.getAllItems();
  document.getElementById('returnRows').innerHTML = e.sale.lines.map(l => {
    const it = all.find(x => x.id === l.itemId);
    const v = it ? [it.size, it.color].filter(Boolean).join('/') : '';
    const name = (it ? it.name : '(barang terhapus)') + (v ? ' ' + v : '');
    const ret = returned[l.itemId] || 0;
    const remaining = (Number(l.qty) || 0) - ret;
    return `<tr><td style="font-size:12px">${escapeHtml(name)}</td><td class="amount-col">${l.qty}</td><td class="amount-col">${ret}</td><td class="amount-col"><input type="number" class="ret-qty" data-item="${l.itemId}" min="0" max="${Math.max(remaining, 0)}" step="1" value="0" ${remaining <= 0 ? 'disabled' : ''} style="width:80px;height:34px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px"></td></tr>`;
  }).join('');
  document.getElementById('returnInfo').innerHTML = `Penjualan <b>${new Date(e.date).toLocaleDateString('id-ID')}</b>${e.person ? ' • ' + escapeHtml(e.person) : ''} • ${Storage.getSaleReturns(entryId).length} retur sebelumnya`;
  const dEl = document.getElementById('returnDate'); if (dEl) dEl.value = new Date().toISOString().split('T')[0];
  const pEl = document.getElementById('returnPayment'); if (pEl) pEl.value = e.payment || 'transfer';
  updateReturnTotal();
  const m = document.getElementById('returnModal'); if (m && !m.open) { try { m.showModal(); } catch {} }
}
function updateReturnTotal() {
  const e = Storage.getEntryById(returnSaleId);
  if (!e) return;
  let total = 0;
  document.querySelectorAll('#returnRows .ret-qty').forEach(inp => {
    const q = Math.max(Math.floor(Number(inp.value) || 0), 0);
    const l = e.sale.lines.find(x => x.itemId === inp.dataset.item);
    if (l && q > 0) total += q * (Number(l.price) || 0);
  });
  const el = document.getElementById('returnTotal');
  if (el) el.textContent = `Refund: Rp${Math.round(total).toLocaleString('id-ID')}`;
}
function closeReturn() { const m = document.getElementById('returnModal'); if (m && m.open) { try { m.close(); } catch {} } }
function handleReturnSubmit() {
  const e = Storage.getEntryById(returnSaleId);
  if (!e) return;
  const items = [...document.querySelectorAll('#returnRows .ret-qty')]
    .map(inp => ({ itemId: inp.dataset.item, qty: Math.max(Math.floor(Number(inp.value) || 0), 0) }))
    .filter(x => x.qty > 0);
  if (!items.length) return UI.showError('Isi qty retur dulu');
  const date = document.getElementById('returnDate')?.value || new Date().toISOString().split('T')[0];
  const payment = document.getElementById('returnPayment')?.value || 'transfer';
  try {
    const rec = Storage.returnSale(returnSaleId, items, { date, payment });
    UI.showSuccess(`Retur Rp${Math.round(rec.refund).toLocaleString('id-ID')} — stok masuk lagi`);
    closeReturn(); refresh(); refreshStock(); queueMirror();
  } catch (err) { UI.showError(err && err.message ? err.message : 'Gagal retur'); }
}
function handleReceipt(id) {
  const entry = Storage.getEntryById(id);
  if (!entry) return;
  UI.openReceipt(entry);
}

function handleDuplicate(id) {
  const entry = Storage.getEntryById(id);
  if (!entry) return;
  if (entry.loanId) {
    UI.showError('Transaksi pinjaman tidak bisa diduplikasi dari sini');
    return;
  }
  UI.renderPeopleDatalist(Storage.getAllPeople());
  UI.openModal({
    ...entry,
    id: null,
    date: new Date().toISOString().split('T')[0]
  });
  UI.showSuccess('Transaksi diduplikasi, silakan edit dan simpan');
}

function handleFilterChange() {
  const values = UI.getFilterValues();
  const isCustom = values.period === 'custom';
  currentFilters = {
    period: values.period,
    type: values.type,
    category: values.category,
    startDate: isCustom ? customRange.start : null,
    endDate: isCustom ? customRange.end : null
  };
  currentPage = 1;
  render();
}

function handleCustomDateApply(startDate, endDate) {
  if (!startDate || !endDate) {
    UI.showError('Pilih kedua tanggal');
    return;
  }
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (s > e) {
    UI.showError('Tanggal mulai tidak boleh setelah tanggal selesai');
    return;
  }
  customRange = { start: startDate, end: endDate };
  const values = UI.getFilterValues();
  currentFilters = {
    period: 'custom',
    type: values.type,
    category: values.category,
    startDate,
    endDate
  };
  UI.selectPeriodChip('custom');
  currentPage = 1;
  render();
  UI.showSuccess(`Filter: ${startDate} → ${endDate}`);
}

function handleSearchChange(term) {
  currentPage = 1;
  render();
}

function handleExportExcel() {
  Storage.exportExcel();
  document.getElementById('exportMenu').classList.add('hidden');
  UI.showSuccess('Data diekspor ke Excel');
}

function handleExportCsv() {
  Storage.exportCSV();
  document.getElementById('exportMenu').classList.add('hidden');
  UI.showSuccess('Data diekspor ke CSV');
}

function getCurrentSearchFiltered() {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  const searchTerm = UI.getSearchTerm();
  return searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm))
      )
    : filtered;
}
function getCurrentViewEntriesRaw() {
  return getCurrentSearchFiltered();
}
function getCurrentViewEntries() {
  return sortEntries(Reports.computeRunningBalance(getCurrentSearchFiltered()));
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const count = document.getElementById('bulkCount');
  if (!bar || !count) return;
  const n = window.__selectedIds.size;
  bar.classList.toggle('hidden', n === 0);
  count.textContent = `${n} dipilih`;
  const selAll = document.getElementById('selectAllRows');
  if (selAll) {
    const visibleIds = (document.querySelectorAll('#entriesBody .row-select:not(:disabled)'));
    const checked = document.querySelectorAll('#entriesBody .row-select:checked:not(:disabled)');
    selAll.checked = visibleIds.length > 0 && checked.length === visibleIds.length;
    selAll.indeterminate = checked.length > 0 && checked.length < visibleIds.length;
  }
}

function handleBulkDelete() {
  if (!window.__selectedIds.size) return;
  const ids = [...window.__selectedIds];
  const loanLinked = ids.filter(id => { const e = Storage.getEntryById(id); return e && e.loanId; });
  if (loanLinked.length) {
    UI.showError(`${loanLinked.length} baris pinjaman dilewati (hapus via menu Pinjaman)`);
  }
  const deletable = ids.filter(id => { const e = Storage.getEntryById(id); return e && !e.loanId; });
  if (!deletable.length) return;
  const snapshots = deletable.map(id => ({ ...Storage.getEntryById(id) })).filter(e => e && e.id);
  deletable.forEach(id => Storage.deleteEntry(id));
  window.__selectedIds.clear();
  refresh();
  UI.showUndoToast(`${snapshots.length} transaksi dihapus`, () => {
    snapshots.forEach(s => Storage.restoreEntry(s));
    UI.showSuccess(`${snapshots.length} transaksi dikembalikan`);
    refresh();
  });
}

function handleImport(file) {
  Storage.importExcel(file).then((result) => {
    const parts = [];
    if (result.entries) parts.push(`${result.entries} transaksi`);
    if (result.loans) parts.push(`${result.loans} pinjaman`);
    if (result.repayments) parts.push(`${result.repayments} pembayaran`);
    if (result.people) parts.push(`${result.people} kontak`);
    if (result.journals) parts.push(`${result.journals} jurnal`);
    if (result.items) parts.push(`${result.items} barang`);
    if (result.employees) parts.push(`${result.employees} karyawan`);
    if (result.purchases) parts.push(`${result.purchases} pembelian`);
    if (parts.length) UI.showSuccess('Data digabung: ' + parts.join(', ') + (result.skipped ? ` (${result.skipped} baris rusak/duplikat dilewati)` : ''));
    else UI.showInfo(result && result.skipped ? `${result.skipped} baris dilewati (rusak/duplikat)` : 'Tidak ada data baru (mungkin duplikat)');
    refresh();
  }).catch((err) => {
    UI.showError(err.message);
  });
}

function handleReportOpen() {
  currentReportType = 'monthly';
  const tab = document.querySelector('.report-tab[data-report="monthly"]');
  if (tab) tab.click();
  else {
    // fallback: directly render
    currentReportType = 'monthly';
    renderReport();
  }
  UI.openReportModal();
}

function handleReportClose() {
  const m = document.getElementById('reportModal');
  if (m && m.open) { try { m.close(); } catch {} }
}

function handleReportTabChange(reportType) {
  currentReportType = reportType;
  renderReport();
}

function renderOwnerPanel() {
  const body = document.getElementById('ownerPanelBody');
  if (!body) return;
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const stats = {};
  months.forEach(k => { stats[k] = { omzet: 0, hpp: 0, beban: 0 }; });
  let kas = 0;
  try {
    Storage.getAllJournals().forEach(j => {
      const k = String(j.date || '').slice(0, 7);
      (j.lines || []).forEach(l => {
        const code = String(l.account || '');
        const deb = Number(l.debit) || 0, cr = Number(l.credit) || 0;
        if (stats[k] && code === '4101') stats[k].omzet += cr - deb;
        if (stats[k] && code === '5109') stats[k].hpp += deb - cr;
        if (stats[k] && code.startsWith('5') && code !== '5109') stats[k].beban += deb - cr;
        if (/^11/.test(code)) kas += deb - cr;
      });
    });
  } catch {}
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const monthLabel = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('id-ID', { month: 'short' });
  const curKey = months[months.length - 1];
  const cur = stats[curKey];
  const bebanAvg = months.slice(-3).reduce((s, k) => s + stats[k].hpp + stats[k].beban, 0) / 3;
  const runway = bebanAvg > 0 ? Math.floor(kas / bebanAvg) : null;
  const laba3a = months.slice(0, 3).reduce((s, k) => s + stats[k].omzet - stats[k].hpp - stats[k].beban, 0);
  const laba3b = months.slice(3).reduce((s, k) => s + stats[k].omzet - stats[k].hpp - stats[k].beban, 0);
  const naik = laba3b >= laba3a;
  const margin = cur.omzet > 0 ? Math.round(((cur.omzet - cur.hpp) / cur.omzet) * 100) : null;
  const labaBulan = s6 => (s6 < 0 ? '−' : '+') + 'Rp' + Math.abs(Math.round(s6)).toLocaleString('id-ID');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Laba ${monthLabel(curKey)}</div><div style="font-weight:800;font-size:14px;color:${cur.omzet - cur.hpp - cur.beban >= 0 ? '#059669' : '#dc2626'}">${labaBulan(cur.omzet - cur.hpp - cur.beban)}</div></div>
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Margin kotor</div><div style="font-weight:800;font-size:14px">${margin === null ? '—' : margin + '%'}</div></div>
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Kas & rekening</div><div style="font-weight:800;font-size:14px">${fmt(kas)}</div></div>
      <div style="background:#f8fafc;border-radius:10px;padding:10px"><div style="font-size:10px;color:#64748b">Runway kas</div><div style="font-weight:800;font-size:14px">${runway === null ? '—' : runway + ' bulan'}</div></div>
    </div>
    <div style="display:flex;align-items:flex-end;gap:5px;height:48px;margin-bottom:8px">${months.map((k) => {
    const laba = stats[k].omzet - stats[k].hpp - stats[k].beban;
    const max = Math.max(1, ...months.map(x => Math.abs(stats[x].omzet - stats[x].hpp - stats[x].beban)));
    const h = Math.max(3, Math.round((Math.abs(laba) / max) * 42));
    return `<div style="flex:1;text-align:center"><div style="height:${h}px;background:${laba >= 0 ? '#34d399' : '#fb7185'};border-radius:4px 4px 0 0"></div></div>`;
  }).join('')}</div>
    <div style="font-size:11px;color:${naik ? '#059669' : '#dc2626'};font-weight:600">${naik ? '📈' : '📉'} Laba 3 bulan terakhir ${naik ? 'lebih baik' : 'menurun'} dari sebelumnya</div>`;
}

function refresh() {
  loadData();
  render();
  renderOwnerPanel();
  renderReport();
  queueMirror();
}

function handleSort(column) {
  // balance column should not be sorted by balance value (misleading), fallback to date
  if (column === 'balance') {
    UI.showInfo('Saldo dihitung kronologis, tidak diurutkan');
    return;
  }
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = column === 'date' ? 'desc' : 'asc';
  }
  currentPage = 1;
  render();
}

function sortEntries(entries) {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    let va = a[sortColumn];
    let vb = b[sortColumn];
    if (sortColumn === 'amount' || sortColumn === 'balance') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else if (sortColumn === 'date') {
      va = va || '';
      vb = vb || '';
    } else {
      va = String(va || '').toLowerCase();
      vb = String(vb || '').toLowerCase();
    }
    if (va < vb) return sortDirection === 'asc' ? -1 : 1;
    if (va > vb) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

function render() {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  
  // Apply search filter (includes paymentDetail)
  const searchTerm = UI.getSearchTerm();
  const searchFiltered = searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm))
      )
    : filtered;

  const withBalance = Reports.computeRunningBalance(searchFiltered);
  const sorted = sortEntries(withBalance);
  const totals = Reports.computeTotals(searchFiltered);
  const categories = Reports.computeCategoryBreakdown(searchFiltered);

  // pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  UI.renderEntries(paginated);
  updateBulkBar();
  const ob = document.getElementById('onboardingCard');
  if (ob) ob.classList.toggle('hidden', currentEntries.length > 0);
  // pagination UI
  const pagerNum = document.getElementById('pagerNum');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const loadMoreWrap = document.getElementById('loadMoreWrap');
  const loadMoreInfo = document.getElementById('loadMoreInfo');
  if (pagerNum) pagerNum.textContent = String(currentPage);
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  if (loadMoreWrap) {
    if (sorted.length > pageSize && currentPage < totalPages) {
      loadMoreWrap.classList.remove('hidden');
      if (loadMoreInfo) loadMoreInfo.textContent = `Menampilkan ${paginated.length} dari ${sorted.length}`;
    } else loadMoreWrap.classList.add('hidden');
  }

  UI.renderSummary(totals, prevPeriodTotals());
  UI.renderCategoryBreakdown(categories);
  UI.updateSortArrows(sortColumn, sortDirection);
  UI.updateSearchResultsCount(searchFiltered.length, filtered.length);

  const loanSummary = computeLoanSummary();
  UI.renderLoanTotals(
    loanSummary.piutangOutstanding,
    loanSummary.hutangOutstanding,
    loanSummary.piutangCount,
    loanSummary.hutangCount
  );

  renderFilterPills();
  syncTopbarPeriod();
  renderArusKasChart(searchFiltered);
  renderDonut(categories);
  renderSalesDailyChart(searchFiltered);
  renderTopProducts(searchFiltered);
  updateTableCount(paginated.length, filtered.length, sorted.length);
  syncTopSearch();
  renderBudget(searchFiltered);
  renderWallets();
  checkOverdue();
  // also update full transaksi view if exists
  if (document.getElementById('viewTransaksi')) {
    // keep transaksi view in sync, but don't reset page unless needed
    renderFullTransaksi();
  }
  const salesView = document.getElementById('viewSales');
  if (salesView && !salesView.classList.contains('hidden')) renderSalesPage();
  const vis = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
  if (vis('viewKas')) renderKasPage();
  if (vis('viewPembelian')) renderPembelianPage();
  if (vis('viewBiaya')) renderBiayaPage();
}

// Label periode jujur di topbar (dulu statis "Agustus 2026" selamanya)
function periodLabelText() {
  const f = currentFilters;
  const monthName = (d) => d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const now = new Date();
  let label = 'Semua waktu';
  if (f.period === 'this-month') label = monthName(now);
  else if (f.period === 'last-month') label = monthName(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  else if (f.period === 'this-year') label = `Tahun ${now.getFullYear()}`;
  else if (f.period === 'custom' && (f.startDate || f.endDate)) {
    const fmt = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); };
    label = `${f.startDate ? fmt(f.startDate) : '…'} – ${f.endDate ? fmt(f.endDate) : '…'}`;
  }
  return label;
}
function syncTopbarPeriod() {
  const el = document.getElementById('topbarPeriod');
  if (!el) return;
  el.textContent = periodLabelText() + ' ▾';
}

// Total periode SEBELUM rentang filter aktif (panjang sama) — untuk tren kartu.
// Jujur: tren selalu vs periode sebelumnya, bukan angka statis.
function prevPeriodTotals() {
  const f = currentFilters;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let s, e;
  if (f.period === 'this-month') { s = new Date(now.getFullYear(), now.getMonth(), 1); e = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  else if (f.period === 'last-month') { s = new Date(now.getFullYear(), now.getMonth() - 1, 1); e = new Date(now.getFullYear(), now.getMonth(), 0); }
  else if (f.period === 'this-year') { s = new Date(now.getFullYear(), 0, 1); e = new Date(now.getFullYear(), 11, 31); }
  else if (f.period === 'custom' && (f.startDate || f.endDate)) {
    s = f.startDate ? new Date(f.startDate) : new Date(-8640000000000000);
    e = f.endDate ? new Date(f.endDate) : now;
  } else { e = now; s = new Date(now); s.setDate(s.getDate() - 29); }
  const span = Math.max(Math.round((e - s) / 86400000) + 1, 1);
  const ps = new Date(s); ps.setDate(ps.getDate() - span);
  const pe = new Date(s); pe.setDate(pe.getDate() - 1);
  let income = 0, expense = 0;
  currentEntries.forEach(en => {
    if (f.type !== 'all' && en.type !== f.type) return;
    if (f.category !== 'all' && en.category !== f.category) return;
    const d = new Date(en.date);
    if (isNaN(d) || d < ps || d > pe) return;
    const a = Number(en.amount) || 0;
    if (en.type === 'income') income += a; else expense += a;
  });
  return { income, expense, net: income - expense };
}

function renderFilterPills() {
  const container = document.getElementById('filterPills');
  if (!container) return;
  const vals = UI.getFilterValues();
  const pills = [];
  if (vals.period !== 'all') pills.push(`Periode: ${vals.period}`);
  if (vals.type !== 'all') pills.push(`Jenis: ${vals.type}`);
  if (vals.category !== 'all') pills.push(`Kategori: ${vals.category}`);
  const term = UI.getSearchTerm();
  if (term) pills.push(`Cari: "${term}"`);
  if (!pills.length) {
    container.innerHTML = '<span style="font-size:12px;color:#94a3b8">Semua transaksi</span>';
    return;
  }
  container.innerHTML = pills.map(p => `<span class="chip selected" style="font-size:11px;padding:4px 10px">${p}</span>`).join('') + ' <button class="chip" style="font-size:11px" data-action="reset-filters">Reset</button>';
}

function resetAllFilters() {
  ['periodGroup', 'typeGroupFilter', 'categoryGroupFilter'].forEach(g => {
    const all = document.querySelector(`#${g} .chip[data-value="all"]`);
    if (all) {
      document.querySelectorAll(`#${g} .chip`).forEach(b => b.classList.remove('selected'));
      all.classList.add('selected');
    }
  });
  document.querySelectorAll('#txTypeFilter .chip').forEach(b => b.classList.toggle('selected', b.dataset.value === 'all'));
  const s1 = document.getElementById('searchInput');
  const s2 = document.getElementById('searchInputTop');
  const s3 = document.getElementById('transaksiSearch');
  if (s1) s1.value = '';
  if (s2) s2.value = '';
  if (s3) s3.value = '';
  currentFilters = { period: 'all', type: 'all', category: 'all', startDate: null, endDate: null };
  customRange = { start: null, end: null };
  currentPage = 1;
  transaksiPage = 1;
  render();
}

function syncTopSearch() {
  const top = document.getElementById('searchInputTop');
  const main = document.getElementById('searchInput');
  if (top && main && top.value !== main.value) top.value = main.value;
}

// Grafik pindah ke charts.js — wrapper tipis supaya call-site tidak berubah
function renderArusKasChart(entries) {
  Charts.renderArusKasChart(entries, { range: arusKasRange, show: arusKasShow });
}

function renderDonut(categories) {
  Charts.renderDonut(categories);
}

// Widget dashboard: tren penjualan harian + produk terlaris (ikut filter periode).
function renderSalesDailyChart(entries) {
  Charts.renderSalesDailyChart(entries, { days: 14 });
}
function renderTopProducts(entries) {
  renderTopProductsInto('topProductsList', entries, currentFilters);
}
function renderTopProductsInto(containerId, entries, returnFilter) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const byItem = {};
  const items = {};
  try { Storage.getAllItems().forEach(i => { items[i.id] = i; }); } catch {}
  (entries || []).forEach(e => {
    if (e.category !== 'jualan' || !e.sale || !Array.isArray(e.sale.lines)) return;
    const lines = e.sale.lines;
    const sub = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
    const disc = Math.min(Math.max(Number(e.sale.discount) || 0, 0), sub);
    const factor = sub > 0 ? (sub - disc) / sub : 1;
    lines.forEach(l => {
      const q = Number(l.qty) || 0;
      if (!q) return;
      const key = l.itemId || l.name || '—';
      if (!byItem[key]) byItem[key] = { name: l.name || (items[key] && items[key].name) || '(barang terhapus)', qty: 0, omzet: 0 };
      byItem[key].qty += q;
      byItem[key].omzet += (Number(l.price) || 0) * q * factor;
    });
  });
  // Kurangi barang yang diretur pada periode yang sama.
  (returnFilter ? periodReturns(returnFilter) : []).forEach(r => (r.lines || []).forEach(l => {
    const key = l.itemId || l.name || '—';
    if (!byItem[key]) return;
    byItem[key].qty -= Number(l.qty) || 0;
    byItem[key].omzet -= (Number(l.price) || 0) * (Number(l.qty) || 0);
  }));
  const rows = Object.values(byItem).filter(r => r.qty > 0 || r.omzet > 0).sort((a, b) => b.qty - a.qty).slice(0, 10);
  if (!rows.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:12px;padding:12px 0;text-align:center">Belum ada penjualan barang pada periode ini.</p>';
    return;
  }
  const maxQty = rows[0].qty || 1;
  const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.round(v));
  box.innerHTML = rows.map((r, i) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">
    <span style="width:18px;font-size:11px;color:#94a3b8;font-weight:700;text-align:right">${i + 1}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
      <div style="height:6px;background:#f1f5f9;border-radius:9999px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${Math.round((r.qty / maxQty) * 100)}%;background:#10b981"></div></div>
    </div>
    <div style="text-align:right;white-space:nowrap"><div style="font-size:12px;font-weight:700">${r.qty} pcs</div><div style="font-size:10px;color:#64748b">${fmt(r.omzet)}</div></div>
  </div>`).join('');
}

/* ===== Halaman Penjualan (gabungan semua laporan penjualan) ===== */

const PAY_LABEL = { cash: '💵 Tunai', transfer: '🏦 Transfer', qris: '📱 QRIS', ewallet: '📲 E-Wallet', debit: '💳 Debit', other: '📦 Lainnya' };
// Retur penjualan (bukan entry) difilter seperti entry: bungkus dgn type/category agar filterEntries bekerja.
function periodReturns(filter) {
  if (!filter) return [];
  const pseudo = Storage.getSaleReturns().map(r => ({ ...r, type: 'income', category: 'jualan' }));
  return Reports.filterEntries(pseudo, filter);
}
// 4.4 Satu kontrol periode: Penjualan & Biaya mengikuti periode di header.
function pagePeriodOpts() {
  return { period: currentFilters.period || 'all', startDate: currentFilters.startDate, endDate: currentFilters.endDate };
}
function salesEntries() {
  const pp = pagePeriodOpts();
  return Reports.filterEntries(Storage.getAllEntries(), { period: pp.period, startDate: pp.startDate, endDate: pp.endDate, type: 'income', category: 'jualan' });
}
function computeSales(entries) {
  const items = {};
  try { Storage.getAllItems().forEach(i => { items[i.id] = i; }); } catch {}
  const byItem = {};
  entries.forEach(e => {
    const lines = (e.sale && Array.isArray(e.sale.lines)) ? e.sale.lines : [];
    const sub = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
    const disc = Math.min(Math.max(Number(e.sale && e.sale.discount) || 0, 0), sub);
    const factor = sub > 0 ? (sub - disc) / sub : 1;
    lines.forEach(l => {
      const q = Number(l.qty) || 0;
      if (!q) return;
      const it = items[l.itemId] || {};
      const cost = (l.avgCost != null) ? Number(l.avgCost) || 0 : Number(it.cost) || 0;
      if (!byItem[l.itemId]) byItem[l.itemId] = { name: l.name || it.name || '(barang terhapus)', qty: 0, omzet: 0, hpp: 0 };
      byItem[l.itemId].qty += q;
      byItem[l.itemId].omzet += (Number(l.price) || 0) * q * factor;
      byItem[l.itemId].hpp += cost * q;
    });
  });
  // Net retur periode berjalan (kurangi qty/omzet/HPP).
  const rets = periodReturns({ ...pagePeriodOpts(), type: 'income', category: 'jualan' });
  rets.forEach(r => (r.lines || []).forEach(l => {
    const key = l.itemId || l.name || '—';
    if (!byItem[key]) byItem[key] = { name: l.name || (items[l.itemId] && items[l.itemId].name) || '(barang terhapus)', qty: 0, omzet: 0, hpp: 0 };
    byItem[key].qty -= Number(l.qty) || 0;
    byItem[key].omzet -= (Number(l.price) || 0) * (Number(l.qty) || 0);
    byItem[key].hpp -= (Number(l.cost) || 0) * (Number(l.qty) || 0);
  }));
  const rows = Object.values(byItem).filter(x => x.qty !== 0 || x.omzet !== 0).map(x => ({ ...x, margin: x.omzet - x.hpp, marginPct: x.omzet > 0 ? ((x.omzet - x.hpp) / x.omzet) * 100 : 0 })).sort((a, b) => b.omzet - a.omzet);
  const omzet = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0) - rets.reduce((s, r) => s + (Number(r.refund) || 0), 0);
  const hpp = rows.reduce((s, x) => s + x.hpp, 0);
  const qty = rows.reduce((s, x) => s + x.qty, 0);
  return { entries, rows, omzet, hpp, qty, laba: omzet - hpp, orders: entries.length, avgOrder: entries.length ? omzet / entries.length : 0 };
}
function renderSalesPage() {
  if (!document.getElementById('viewSales')) return;
  const entries = salesEntries();
  const d = computeSales(entries);
  const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.round(v || 0));
  const sub = document.getElementById('salesSubtitle');
  if (sub) sub.textContent = `${d.orders} struk • ${d.qty} pcs barang terjual • ${d.rows.length} jenis produk • rata-rata ${fmt(d.avgOrder)}/struk`;
  // KPI
  const kpi = document.getElementById('salesKpi');
  if (kpi) {
    const tile = (label, value) => `<button type="button" style="cursor:default">${label}<b>${value}</b></button>`;
    kpi.innerHTML = tile('Omzet', fmt(d.omzet)) + tile('Barang terjual', d.qty + ' pcs') + tile('HPP', fmt(d.hpp)) + tile('Laba kotor', fmt(d.laba));
  }
  // Grafik + terlaris (pakai data periode terpilih)
  Charts.renderSalesDailyChart(entries, { days: 14, ids: { svg: 'salesPageChart', labels: 'salesPageLabels', total: 'salesPageTotal', avg: 'salesPageAvg', best: 'salesPageBest' } });
  renderTopProductsInto('salesTopList', entries, { ...pagePeriodOpts(), type: 'income', category: 'jualan' });
  // Tabel per produk
  const tbl = document.getElementById('salesProductTable');
  if (tbl) {
    tbl.innerHTML = d.rows.length ? `<table class="report-table">
      <thead><tr><th>Produk / varian</th><th class="amount-col">Terjual</th><th class="amount-col">Omzet</th><th class="amount-col">HPP</th><th class="amount-col">Laba kotor</th><th class="amount-col">Margin</th></tr></thead>
      <tbody>${d.rows.map(r => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td class="amount-col"><b>${r.qty}</b></td>
        <td class="amount-col income">${fmt(r.omzet)}</td>
        <td class="amount-col">${fmt(r.hpp)}</td>
        <td class="amount-col ${r.margin >= 0 ? 'income' : 'expense'}">${fmt(r.margin)}</td>
        <td class="amount-col">${r.marginPct.toFixed(1)}%</td></tr>`).join('')}
      <tr style="background:#f8fafc;font-weight:700"><td>Total</td><td class="amount-col">${d.qty}</td><td class="amount-col income">${fmt(d.omzet)}</td><td class="amount-col">${fmt(d.hpp)}</td><td class="amount-col">${fmt(d.laba)}</td><td class="amount-col">${d.omzet > 0 ? ((d.laba / d.omzet) * 100).toFixed(1) : '0.0'}%</td></tr>
      </tbody></table>` : '<p style="color:var(--text-muted)">Belum ada penjualan pada periode ini.</p>';
  }
  // Metode pembayaran
  const pay = document.getElementById('salesPayTable');
  if (pay) {
    const byPay = {};
    entries.forEach(e => { const k = e.payment || 'other'; byPay[k] = (byPay[k] || 0) + (Number(e.amount) || 0); });
    const pk = Object.keys(byPay).sort((a, b) => byPay[b] - byPay[a]);
    pay.innerHTML = pk.length ? `<table class="report-table"><thead><tr><th>Metode</th><th class="amount-col">Omzet</th><th class="amount-col">Porsi</th></tr></thead><tbody>
      ${pk.map(k => `<tr><td>${PAY_LABEL[k] || escapeHtml(k)}</td><td class="amount-col income">${fmt(byPay[k])}</td><td class="amount-col">${d.omzet > 0 ? ((byPay[k] / d.omzet) * 100).toFixed(1) : '0.0'}%</td></tr>`).join('')}
      </tbody></table>` : '<p style="color:var(--text-muted);font-size:12px">Belum ada pembayaran pada periode ini. Catat penjualan lewat ＋ Jual.</p>';
  }
  // Struk terbaru — tabel rapi
  const recent = document.getElementById('salesRecentList');
  if (recent) {
    const list = entries.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 15);
    const nOf = (e) => e.sale && Array.isArray(e.sale.lines) ? e.sale.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0) : 0;
    recent.innerHTML = list.length ? `<div style="overflow-x:auto"><table class="report-table"><thead><tr>
      <th>Tanggal</th><th>Pelanggan / struk</th><th>Qty</th><th>Cara bayar</th><th class="amount-col">Total</th></tr></thead><tbody>
      ${list.map(e => `<tr>
        <td style="font-size:12px;white-space:nowrap">${escapeHtml(e.date)}</td>
        <td style="font-size:12px">${escapeHtml(e.person || e.description || 'Penjualan')}</td>
        <td style="font-size:12px">${nOf(e)} pcs</td>
        <td style="font-size:11.5px;color:#475569">${PAY_LABEL[e.payment] || escapeHtml(e.payment || '')}</td>
        <td class="amount-col">${fmt(e.amount)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p style="color:var(--text-muted);font-size:12px">Belum ada struk.</p>';
  }
  renderCreditSection();
  renderOrdersPanel();
}

/* ===== Status Pesanan — satu alur: Jual (alur pesanan) & Titip Beli ===== */
const ORDER_STATUS_META = {
  ordered:  { chip: '📦 Pesanan dibuat', bg: '#fef3c7', fg: '#b45309' },
  dp_paid:  { chip: '💵 DP dibayar', bg: '#fef3c7', fg: '#b45309' },
  shipped:  { chip: '🚚 Sedang dikirim', bg: '#dbeafe', fg: '#1d4ed8' },
  received: { chip: '✅ Diterima di tujuan', bg: '#dcfce7', fg: '#166534' },
  invoiced: { chip: '🧾 Invoice terkirim — tunggu pembayaran', bg: '#e0e7ff', fg: '#4338ca' },
  done:     { chip: '🏁 Selesai', bg: '#dcfce7', fg: '#166534' },
};
function orderStageU(stage, kind) {
  const m = { shipping: 'to_indo', arrived: 'in_wh', settled: 'done', shipped: 'shipped', received: 'received' };
  return m[stage] || stage || 'ordered';
}
function renderOrdersPanel() {
  if (!document.getElementById('orderStatusList')) return;
  const fmt = preorderFmt;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cssOrders = Storage.getCreditSales().filter(cs => cs.flow === 'order').map(cs => ({
    kind: 'jual', id: cs.id, no: cs.invoiceNo, stage: orderStageU(cs.stage || 'ordered'), customer: cs.customer,
    date: cs.date, eta: '', dueDate: cs.dueDate, items: cs.lines || [], sellTotal: cs.total,
    deposit: cs.deposit, paid: Storage.creditPaidTotal(cs), balance: Storage.creditOutstanding(cs),
    events: cs.timeline || [], shipment: cs.shipment,
  }));
  const poRows = Storage.getPreorders()
    .filter(po => po.stage !== 'settled' && po.stage !== 'cancelled' && po.target !== 'stock') // order stok = pembelian, tampil di Pembelian
    .map(po => ({
    kind: 'po', id: po.id, no: po.no, stage: orderStageU(po.stage), customer: po.customer,
    date: po.date, eta: po.eta, dueDate: '', items: po.items || [], sellTotal: po.sellTotal,
    deposit: po.deposit, paid: Storage.preorderPaidTotal(po), balance: Storage.preorderBalance(po),
    costTotal: Storage.preorderCostTotal(po), events: po.events || [], shipment: po.shipment,
    months: po.monthsEta,
  }));
  // KPI titip beli (hanya pesanan PELANGGAN; order stok = pembelian, beban di Pembelian)
  const kpi = document.getElementById('preorderKpi');
  if (kpi) {
    const allPos = Storage.getPreorders().filter(po => po.target !== 'stock' && po.stage !== 'cancelled');
    let running = 0, unpaidKpi = 0, costKpi = 0, profitKpi = 0;
    allPos.forEach(po => {
      const lclCost = preorderLclCost(po.id);
      const cost = lclCost > 0 ? lclCost : Storage.preorderCostTotal(po);
      if (po.stage === 'settled') profitKpi += Storage.preorderPaidTotal(po) - cost;
      else { running++; unpaidKpi += Storage.preorderBalance(po); costKpi += cost; }
    });
    const tile = (label, value, color) => `<button type="button" style="cursor:default">${label}<b style="color:${color}">${value}</b></button>`;
    kpi.innerHTML = tile('🌏 Pesanan preorder berjalan', running, '#2563eb')
      + tile('💵 Sisa tagihan pesanan', fmt(unpaidKpi), '#b45309')
      + tile('🧾 Biaya sudah keluar', fmt(costKpi), '#475569')
      + tile('💰 Laba (selesai)', fmt(profitKpi), '#059669');
  }
  const running = cssOrders.filter(r => r.stage !== 'done').concat(poRows)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const history = cssOrders.filter(r => r.stage === 'done')
    .map(r => ({ kind: 'jual', no: r.no, customer: r.customer, paid: r.paid, total: r.sellTotal }))
    .concat(Storage.getPreorders().filter(po => po.stage === 'settled')
      .map(po => { const lclCost = preorderLclCost(po.id); const cost = lclCost > 0 ? lclCost : Storage.preorderCostTotal(po); return { kind: 'po', no: po.no, customer: po.customer, paid: Storage.preorderPaidTotal(po), total: po.sellTotal, profit: Storage.preorderPaidTotal(po) - cost }; }))
    .sort((a, b) => String(b.no).localeCompare(String(a.no)));
  const box = document.getElementById('orderStatusList');
  if (!box) return;
  const row = (r) => {
    const st = orderStageU(r.stage);
    const meta = ORDER_STATUS_META[st] || ORDER_STATUS_META.ordered;
    const overdue = r.balance > 0.01 && r.dueDate && new Date(r.dueDate + 'T00:00:00') < today;
    const etaMonths = Number(r.months) || 0;
    const ev = (r.events || []).slice(-1)[0] || null;
    const ageDays = r.date ? Math.max(Math.floor((today - new Date(String(r.date).slice(0, 10) + 'T00:00:00')) / 86400000), 0) : null;
    const itemsTxt = (r.items || []).slice(0, 3).map(l => `${l.qty}× ${escapeHtml(l.name)}`).join(', ') + ((r.items || []).length > 3 ? ` +${r.items.length - 3}` : '');
    const trackShow = (ev && ev.tracking) || (r.shipment && (r.shipment.tracking || r.shipment.courier)) || '';
    const shipLine = trackShow
      ? `<div style="font-size:10.5px;color:#475569">🚛 resi/kiriman: <b>${escapeHtml(trackShow)}</b> <a href="https://t.17track.net/id#nums=${encodeURIComponent(trackShow)}" target="_blank" rel="noopener" title="Cek status via 17track" style="font-size:10px;color:#2563eb;font-weight:600">🔍 cek status</a></div>`
      : '';
    // A5: baris sekunder = kejadian terakhir + tanggal (slot konsisten; status tetap di pill)
    const noteLine = ev ? `<div style="font-size:10.5px;color:#475569">📝 ${escapeHtml(ev.note || '')}${ev.date ? ' • ' + escapeHtml(ev.date) : ''}</div>` : '';
    const sched = ev && ev.schedule ? `<div style="font-size:10.5px;color:#4338ca;font-weight:600;margin-top:2px">⏰ Janji bayar ${escapeHtml(ev.schedule)}</div>` : '';
    const ageTxt = ageDays != null ? `<div style="font-size:10px;${ageDays > 21 ? 'color:#b45309;font-weight:700' : 'color:#64748b'}">⏱ ${ageDays} hari</div>` : '';
    const chip = st === 'ordered' && (Number(r.paid) || 0) <= 0.01 && (Number(r.deposit) || 0) <= 0.01
      ? '<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:9999px;font-size:11px">⚠️ Pesanan dibuat — DP belum dibayar</span>'
      : `<span style="background:${meta.bg};color:${meta.fg};padding:2px 8px;border-radius:9999px;font-size:11px">${meta.chip}</span>`;
    const typeBadge = r.kind === 'jual'
      ? '<span style="background:#eff6ff;color:#1d4ed8;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:700">JUAL</span>'
      : '<span style="background:#fef9c3;color:#a16206;border-radius:6px;padding:1px 6px;font-size:10px;font-weight:700">🌏 PRE-ORDER CHINA</span>';
    let action = '';
    if (st === 'ordered' && !(Number(r.paid) > 0.01)) {
      action = `<button class="btn btn-primary open-order-pay" data-kind="${r.kind}" data-id="${r.id}" style="font-size:11px;padding:2px 8px">💵 Tandai DP dibayar</button>`;
    } else if (st === 'dp_paid' && r.kind === 'jual') {
      action = `<button class="btn btn-primary order-ship" data-id="${r.id}" style="font-size:11px;padding:2px 8px">🚚 Kirim ke pelanggan / tulis resi</button>`;
    } else if (st === 'dp_paid' && r.kind === 'po') {
      action = `<button class="btn btn-primary preorder-ship" data-id="${r.id}" style="font-size:11px;padding:2px 8px">🛍 Beli di marketplace</button>
        <button class="btn btn-ghost order-koli-paste" data-id="${r.id}" style="font-size:11px;padding:2px 8px" title="Daftar koli dari forwarder (kode;CBM;kg)">🧾 Cek-in koli</button>
        <div style="font-size:10px;color:#64748b;margin-top:2px">CBM diukur gudang China — bukan saat beli</div>`;
    } else if (st === 'shipped') {
      action = `<button class="btn btn-primary order-recv" data-id="${r.id}" style="font-size:11px;padding:2px 8px">📦 Diterima pelanggan</button>`;
    } else if (st === 'received') {
      action = `<button class="btn btn-primary order-status" data-kind="${r.kind}" data-id="${r.id}" data-st="invoiced" style="font-size:11px;padding:2px 8px">🧾 Kirim Invoice — tunggu bayar</button>`;
    } else if (st === 'china') {
      action = `<button class="btn btn-primary order-koli-paste" data-id="${r.id}" style="font-size:11px;padding:2px 8px">🧾 Masuk gudang China — tempel daftar forwarder</button>
        <button class="btn btn-ghost order-goto-muatan notif-goto" data-goto="muatan" style="font-size:11px;padding:2px 8px">🚢 Muat ke muatan →</button>`;
    } else if (st === 'to_indo') {
      action = `<button class="btn btn-primary order-status" data-kind="${r.kind}" data-id="${r.id}" data-st="in_wh" style="font-size:11px;padding:2px 8px">🏭 Tiba di gudang kita (bayar kirim Indo)</button>`;
    } else if (st === 'in_wh') {
      action = `<button class="btn btn-primary order-status" data-kind="${r.kind}" data-id="${r.id}" data-st="sent" style="font-size:11px;padding:2px 8px">🚚 Kirim ke pelanggan</button>`;
    } else if (st === 'sent') {
      action = `<button class="btn btn-primary order-status" data-kind="${r.kind}" data-id="${r.id}" data-st="invoiced" style="font-size:11px;padding:2px 8px">🧾 Kirim Invoice ke pelanggan</button>`;
    } else if (st === 'invoiced') {
      action = `<button class="btn btn-primary open-order-pay" data-kind="${r.kind}" data-id="${r.id}" style="font-size:11px;padding:2px 8px">💵 Terima pembayaran</button>
       <button class="btn btn-secondary preorder-settle" data-id="${r.id}" style="font-size:11px;padding:2px 8px" title="Barang diterima pembeli + sudah lunas → tutup pesanan">✅ Lunas &amp; Selesai</button>`;
    }
    // 6.4: satu aksi utama + menu ⋯ (kolom aksi lebar tetap agar bisa dipindai)
    const moreBtn = `<button class="btn btn-ghost order-more" data-kind="${r.kind}" data-id="${r.id}" style="font-size:14px;padding:2px 10px;min-width:38px" aria-label="Aksi lain untuk ${escapeHtml(r.no)}" title="Aksi lain">⋯</button>`;
    return `<tr>
        <td style="font-size:12px;white-space:nowrap">${typeBadge} <div>${escapeHtml(r.date)}</div>${ageTxt}${etaMonths ? `<div style="font-size:10px;color:#64748b">Est datang ${escapeHtml(String(etaMonths))} bln</div>` : ''}</td>
        <td style="font-size:12px;white-space:nowrap">${escapeHtml(r.no)}</td>
        <td style="font-size:12px">${escapeHtml(r.customer || '—')}<div style="font-size:10.5px;color:#64748b">${itemsTxt}</div></td>
        <td>${chip}${shipLine}${noteLine}${sched}${overdue ? '<div style="font-size:10.5px;color:#b91c1c;font-weight:600">⚠️ Jatuh tempo</div>' : ''}</td>
        <td class="amount-col" style="font-weight:${r.balance > 0.01 ? '700' : '400'};color:${r.balance > 0.01 ? '#b45309' : '#059669'}">${r.balance > 0.01 ? fmt(r.balance) : 'Lunas'}</td>
        <td class="order-actions">${action || ''}${moreBtn}</td>
      </tr>`;
  };
  const runningHtml = running.length
    ? `<div style="overflow-x:auto"><table class="report-table"><thead><tr>
        <th>Jenis / Tanggal</th><th>No</th><th>Pelanggan</th><th>Status</th><th class="amount-col">Sisa tagihan</th><th></th></tr></thead><tbody>${running.map(row).join('')}</tbody></table></div>`
    : '<p style="color:var(--text-muted);font-size:12px">Tanpa pesanan berjalan. Buat dari ＋ Jual (centang Bayar nanti) di atas.</p>';
  const historyHtml = history.length
    ? `<div style="font-size:11px;font-weight:700;color:#64748b;margin:16px 0 4px">🗂 Riwayat selesai</div><div style="overflow-x:auto"><table class="report-table"><thead><tr><th>No</th><th>Pelanggan</th><th class="amount-col">Terbayar</th><th class="amount-col">Total</th><th class="amount-col">Laba</th></tr></thead><tbody>${history.map(h => `<tr><td style="font-size:12px">${escapeHtml(h.no)} <span style="font-size:10px;color:#64748b">${h.kind === 'po' ? 'TITIP' : 'JUAL'}</span></td><td style="font-size:12px">${escapeHtml(h.customer || '-')}</td><td class="amount-col">${fmt(h.paid)}</td><td class="amount-col">${fmt(h.total)}</td><td class="amount-col" style="color:${(h.profit != null ? h.profit : h.total - h.paid) >= 0 ? '#059669' : '#dc2626'};font-weight:700">${fmt(h.profit != null ? h.profit : h.total - h.paid)}</td></tr>`).join('')}</tbody></table></div>`
    : '';
  box.innerHTML = runningHtml + historyHtml;
}
function openOrderStatus(kind, id, presetStage) {
  const po = kind === 'po' ? Storage.getPreorderById(id) : Storage.getCreditSaleById(id);
  if (!po) return;
  document.getElementById('orderStatusKind').value = kind;
  document.getElementById('orderStatusId').value = id;
  const info = document.getElementById('orderStatusInfo');
  if (info) {
    const bal = kind === 'po' ? Storage.preorderBalance(po) : Storage.creditOutstanding(po);
    info.innerHTML = `<b>${escapeHtml(po.no || '')}</b> — ${escapeHtml(po.customer || '')}${bal > 0.01 ? ' • sisa ' + preorderFmt(bal) : ' • lunas'}`;
  }
  const st = document.getElementById('orderStatusSchedule'); if (st) st.value = '';
  const tr = document.getElementById('orderStatusTracking'); if (tr) tr.value = (po.shipment && po.shipment.tracking) || '';
  // blok dinamis sesuai tahap: 'sent' → cara kirim gudang; 'invoiced' → janji bayar
  const shipTypeWrap = document.getElementById('orderShipTypeWrap');
  if (shipTypeWrap) shipTypeWrap.hidden = presetStage !== 'sent';
  const schedWrap = document.getElementById('orderSchedWrap');
  if (schedWrap) schedWrap.hidden = presetStage !== 'invoiced';
  const poPayWrap = document.getElementById('orderPoPayWrap');
  if (poPayWrap) poPayWrap.hidden = presetStage !== 'paid';
  const sel = populateOrderStatusSelect(kind);
  if (sel && presetStage) sel.value = presetStage;
  else if (sel) sel.selectedIndex = 0;
  const dt = document.getElementById('orderStatusDate'); if (dt) dt.value = new Date().toISOString().split('T')[0];
  const nn = document.getElementById('orderStatusNote'); if (nn) nn.value = '';
  const er = document.getElementById('orderStatusError'); if (er) er.textContent = '';
  const m = document.getElementById('orderStatusModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
}
function closeOrderStatus() { const m = document.getElementById('orderStatusModal'); if (m && m.open) { try { m.close(); } catch {} } }
function handleOrderStatusSubmit() {
  const kind = document.getElementById('orderStatusKind')?.value || 'po';
  const id = document.getElementById('orderStatusId')?.value || '';
  let stage = document.getElementById('orderStatusStage')?.value || '';
  const date = document.getElementById('orderStatusDate')?.value || new Date().toISOString().split('T')[0];
  let note = document.getElementById('orderStatusNote')?.value.trim() || '';
  let tracking = document.getElementById('orderStatusTracking')?.value.trim() || '';
  const schedule = document.getElementById('orderStatusSchedule')?.value || '';
  if (!id) return;
  try {
    // tahap 'sent' → catat cara kirim gudang; 'invoiced' → janji bayar (hari/jam) + faktur opsional
    if (stage === 'sent') {
      const how = document.getElementById('orderShipType')?.value || '';
      const det = document.getElementById('orderShipTypeDetail')?.value.trim() || '';
      note = `${how ? 'Kirim via ' + how : ''}${det ? ' — ' + det : ''}${note ? ' • ' + note : ''}`.trim();
    }
    const faktur = document.getElementById('orderStatusFaktur')?.value.trim() || '';
    if (stage === 'invoiced' && schedule) {
      const n2 = `Janji bayar ${new Date(schedule).toLocaleString('id-ID')}${faktur ? ' • faktur ' + faktur : ' • tanpa faktur'}`;
      note = note ? `${note} • ${n2}` : n2;
    }
    if (kind === 'po') {
      const poRow = Storage.getPreorderById(id);
      if (poRow && poRow.target === 'stock' && stage === 'received') {
        Storage.receivePreorderStock(id, { date, note, tracking });
      } else if (stage === 'paid' && poRow && poRow.target === 'stock') {
        // Dibayar ke supplier: catat sebagai biaya barang ke supplier (bukan uang pelanggan)
        Storage.addPreorderCost(id, {
          amount: Storage.preorderSellTotal(poRow), kind: 'barang', date,
          payment: document.getElementById('orderStatusPay')?.value || 'transfer',
          note: note || 'Dibayar ke supplier',
        });
        Storage.trackPreorder(id, { stage: 'paid', date, note: note || 'Dibayar ke supplier', tracking, schedule: schedule.slice(0, 10) });
      } else {
        Storage.trackPreorder(id, { stage, date, note, tracking, schedule: schedule.slice(0, 10) });
      }
    }
    else Storage.trackCreditOrder(id, { stage, date, note, tracking, schedule: schedule.slice(0, 10) });
    closeOrderStatus();
    UI.showSuccess(stage === 'invoiced' && schedule ? 'Invoice terkirim — janji bayar tercatat' : 'Status pesanan diperbarui');
    refreshSalesPage();
  } catch (e) {
    const er = document.getElementById('orderStatusError');
    if (er) er.textContent = e && e.message ? e.message : 'Gagal menyimpan status';
    else UI.showError(e && e.message ? e.message : 'Gagal menyimpan status');
  }
}

/* ===== Piutang penjualan (kredit) ===== */
function renderCreditSection() {
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const kpi = document.getElementById('creditKpi');
  if (kpi) {
    const s = Storage.creditSalesSummary();
    const tile = (label, value, color) => `<button type="button" style="cursor:default">${label}<b style="color:${color}">${value}</b></button>`;
    kpi.innerHTML = tile('🕒 Piutang struk (penjualan kredit)', `${fmt(s.outstanding)} (${s.openCount})`, '#b45309')
      + tile('⚠️ Struk jatuh tempo', `${fmt(s.overdue)} (${s.overdueCount})`, '#dc2626')
      + tile('✅ Pelunasan 30 hari', fmt(s.received30), '#059669');
  }
  const box = document.getElementById('creditList');
  if (!box) return;
  const list = Storage.getCreditSales().slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  box.innerHTML = list.length ? `<div style="overflow-x:auto"><table class="report-table"><thead><tr>
    <th>Tanggal</th><th>Nomor</th><th>Pelanggan</th><th>Jatuh tempo</th><th>Status</th><th class="amount-col">Sisa tagihan</th><th class="amount-col">Total</th><th></th></tr></thead><tbody>
    ${list.map(cs => {
    const out = Storage.creditOutstanding(cs);
    const overdue = out > 0.01 && cs.dueDate && new Date(cs.dueDate + 'T00:00:00') < today;
    const paid = out <= 0.01;
    const status = paid
      ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:9999px;font-size:11px">Paid</span>'
      : `<span style="background:${overdue ? '#fee2e2' : '#fef3c7'};color:${overdue ? '#b91c1c' : '#b45309'};padding:2px 8px;border-radius:9999px;font-size:11px">${overdue ? 'Jatuh tempo' : 'Open'}</span>`;
    return `<tr>
        <td style="font-size:12px;white-space:nowrap">${escapeHtml(cs.date)}</td>
        <td style="font-size:12px;white-space:nowrap">${escapeHtml(cs.invoiceNo)}</td>
        <td style="font-size:12px">${escapeHtml(cs.customer || '—')}</td>
        <td style="font-size:12px;white-space:nowrap">${escapeHtml(cs.dueDate || '—')}</td>
        <td>${status}</td>
        <td class="amount-col">${fmt(out)}</td>
        <td class="amount-col">${fmt(cs.total)}</td>
        <td style="white-space:nowrap">${out > 0.01 ? `<button class="btn btn-primary credit-pay" data-id="${cs.id}" style="font-size:11px;padding:2px 8px">💰 Bayar</button>` : ''} <button class="btn btn-ghost credit-del" data-id="${cs.id}" style="font-size:11px;padding:2px 8px;color:#ef4444" title="Hapus">🗑</button></td>
      </tr>`;
  }).join('')}
  </tbody></table></div>` : '<p style="color:var(--text-muted);font-size:12px">Belum ada penjualan kredit. Centang "Bayar nanti (kredit)" saat menjual.</p>';

}
function openCreditPay(id) {
  const cs = Storage.getCreditSaleById(id);
  if (!cs) return;
  const kindEl = document.getElementById('creditPayKind'); if (kindEl) kindEl.value = 'credit';
  const ttl = document.getElementById('creditPayTitle'); if (ttl) ttl.textContent = '💰 Terima Pembayaran';
  document.getElementById('creditPayId').value = id;
  const out = Storage.creditOutstanding(cs);
  const info = document.getElementById('creditPayInfo');
  if (info) info.innerHTML = `<b>${escapeHtml(cs.invoiceNo)}</b> — ${escapeHtml(cs.customer || 'Tanpa nama')}<br>Total ${'Rp' + Math.round(cs.total).toLocaleString('id-ID')} • sudah dibayar ${'Rp' + Math.round(Storage.creditPaidTotal(cs)).toLocaleString('id-ID')} • <b>sisa Rp${Math.round(out).toLocaleString('id-ID')}</b>`;
  const amt = document.getElementById('creditPayAmount'); if (amt) amt.value = String(Math.round(out));
  const dt = document.getElementById('creditPayDate'); if (dt) dt.value = new Date().toISOString().split('T')[0];
  const err = document.getElementById('creditPayError'); if (err) err.textContent = '';
  const m = document.getElementById('creditPayModal'); if (m && !m.open) { try { m.showModal(); } catch {} }
}
function closeCreditPay() { const m = document.getElementById('creditPayModal'); if (m && m.open) { try { m.close(); } catch {} } }
function handleCreditPaySubmit() {
  const id = document.getElementById('creditPayId')?.value || '';
  const kind = document.getElementById('creditPayKind')?.value || 'credit';
  const amount = Math.round(Number(UI.parseIdrInput(document.getElementById('creditPayAmount')?.value || '')) || 0);
  const date = document.getElementById('creditPayDate')?.value || new Date().toISOString().split('T')[0];
  const payment = document.getElementById('creditPayPayment')?.value || 'cash';
  if (!id) return;
  try {
    if (kind === 'po') {
      Storage.payPreorder(id, { amount, date, payment });
      closeCreditPay();
      UI.showSuccess('Pembayaran diterima — uang muka pelanggan tercatat');
      refreshSalesPage();
      return;
    }
    Storage.payCreditSale(id, { amount, date, payment });
    closeCreditPay();
    UI.showSuccess('Pembayaran diterima — piutang berkurang');
    refreshSalesPage();
  } catch (e) {
    const err = document.getElementById('creditPayError');
    if (err) err.textContent = e && e.message ? e.message : 'Gagal menyimpan pembayaran';
    else UI.showError(e && e.message ? e.message : 'Gagal menyimpan pembayaran');
  }
}
function deleteCreditSalePrompt(id) {
  const cs = Storage.getCreditSaleById(id);
  if (!cs) return;
  if (!confirm(`Hapus penjualan kredit ${cs.invoiceNo}? Stok dikembalikan.`)) return;
  try { Storage.deleteCreditSale(id); UI.showSuccess('Penjualan kredit dihapus'); refreshSalesPage(); }
  catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menghapus'); }
}
function refreshSalesPage() { try { renderSalesPage(); } catch {} }
// Kurs online CNY→IDR (round up ke 1000 terdekat), cache 12 jam — offline pakai terakhir / 2300
const KURS_KEY = 'wynara_kurs_cny';
async function kursCnyOnline() {
  const cached = (() => { try { return JSON.parse(localStorage.getItem(KURS_KEY) || 'null'); } catch { return null; } })();
  if (cached && Number(cached.rate) > 0 && Date.now() - Number(cached.updatedAt || 0) < 12 * 3600000) return cached;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/CNY');
    const j = await r.json();
    const idr = Number(j?.rates?.IDR) || 0;
    if (idr <= 0) throw new Error('no-rate');
    const rec = { rate: Math.ceil(idr / 100) * 100, raw: Math.round(idr), updatedAt: Date.now(), source: 'online' };
    try { localStorage.setItem(KURS_KEY, JSON.stringify(rec)); } catch {}
    return rec;
  } catch {
    return cached || { rate: 2300, updatedAt: 0, source: 'default' };
  }
}
function applyKursToSaleForm(rec) {
  const fx = document.getElementById('saleFx');
  if (!fx) return;
  if (rec && rec.rate > 0) {
    fx.value = String(rec.rate);
    const hint = document.getElementById('saleFxHint');
    if (hint) hint.textContent = rec.source === 'online'
      ? `✅ Kurs online ¥1 = Rp${rec.rate.toLocaleString('id-ID')} (dibulatkan ke atas ke 100, asli ${rec.raw.toLocaleString('id-ID')}, ${new Date(rec.updatedAt).toLocaleString('id-ID')})`
      : rec.source === 'default' ? 'Kurs default — nyalakan internet untuk rate online' : `Kurs terakhir ¥1 = Rp${rec.rate.toLocaleString('id-ID')}`;
  }
}

/* ===== Titip Beli / Preorder (beli atas nama pelanggan) ===== */
function preorderFmt(v) { return 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID'); }
function openPreorder() {
  const m = document.getElementById('preorderModal');
  if (!m) return;
  document.getElementById('preorderCustomer').value = '';
  document.getElementById('preorderDate').value = new Date().toISOString().split('T')[0];
  const eta = document.getElementById('preorderEta');
  if (eta) {
    const d = new Date(); d.setDate(d.getDate() + 30); // estimasi datang ~1 bulan (boleh diubah)
    eta.value = d.toISOString().split('T')[0];
  }
  const dep = document.getElementById('preorderDeposit'); if (dep) { dep.value = ''; delete dep.dataset.touched; }
  document.getElementById('preorderRows').innerHTML = '';
  addPreorderRow();
  addPreorderRow();
  renderPreorderInfo();
  const er = document.getElementById('preorderError'); if (er) er.textContent = '';
  if (!m.open) { try { m.showModal(); } catch {} }
  setTimeout(() => document.getElementById('preorderCustomer')?.focus(), 60);
}
function closePreorder() { const m = document.getElementById('preorderModal'); if (m && m.open) { try { m.close(); } catch {} } }
function addPreorderRow(preselectId) {
  const box = document.getElementById('preorderRows');
  if (!box) return;
  const items = (Storage.getAllItems() || []).filter(i => i && i.active !== false);
  const row = document.createElement('div');
  row.className = 'preorder-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px';
  row.innerHTML = `
    <select class="preorder-item-sel" style="flex:2;min-width:130px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
      <option value="">— Pilih barang*</option>
      ${items.map(i => { return `<option value="${i.id}">${escapeHtml(Storage.fullItemName(i))}</option>`; }).join('')}
      <option value="__custom">✏️ Tulis manual / barang lain</option>
    </select>
    <input type="number" class="preorder-item-qty" min="1" step="1" value="1" title="Qty" style="width:60px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 6px;font-size:13px;text-align:center">
    <input type="text" class="preorder-item-price" inputmode="decimal" placeholder="Rp/pcs (harga jual)" style="flex:1;min-width:120px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px">
    <button type="button" class="btn btn-ghost preorder-row-del" aria-label="Hapus baris" style="font-size:12px;padding:4px 8px;color:#ef4444">✕</button>`;
  const sel = row.querySelector('.preorder-item-sel');
  const qty = row.querySelector('.preorder-item-qty');
  const price = row.querySelector('.preorder-item-price');
  const syncPrice = () => {
    if (sel.value === '__custom') {
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'preorder-item-name'; inp.placeholder = 'Nama barang'; inp.maxLength = 80;
      inp.style.cssText = 'flex:2;min-width:140px;height:40px;border:1px solid #e2e8f0;border-radius:10px;padding:0 8px;font-size:13px';
      sel.replaceWith(inp);
      inp.addEventListener('input', renderPreorderInfo);
      inp.focus();
      return;
    }
    const it = items.find(x => x.id === sel.value);
    if (it && !price.dataset.touched && Storage.itemNetPrice) price.value = Storage.itemNetPrice(it) ? String(Storage.itemNetPrice(it)) : '';
    renderPreorderInfo();
    maybeAddPoRow(); // UX: baris baru otomatis muncul saat barang pilihan terisi lengkap
  };
  sel.addEventListener('change', syncPrice);
  price.addEventListener('blur', () => { const v = UI.parseIdrInput(price.value); price.value = v ? (UI.formatIdrInput ? UI.formatIdrInput(v) : String(v)) : ''; renderPreorderInfo(); });
  qty.addEventListener('input', () => { renderPreorderInfo(); maybeAddPoRow(); });
  price.addEventListener('input', () => { price.dataset.touched = '1'; renderPreorderInfo(); maybeAddPoRow(); });
  row.querySelector('.preorder-row-del').addEventListener('click', () => { row.remove(); renderPreorderInfo(); });
  box.appendChild(row);
  if (preselectId) sel.value = preselectId;
  syncPrice();
}
function maybeAddPoRow() {
  const box = document.getElementById('preorderRows');
  if (!box) return;
  const rows = [...box.querySelectorAll('.preorder-row')];
  const last = rows[rows.length - 1];
  if (!last) return;
  const filled = !!((last.querySelector('.preorder-item-name')?.value || '').trim()
    || (last.querySelector('.preorder-item-sel')?.value || '').trim());
  const qty = last.querySelector('.preorder-item-qty');
  const price = last.querySelector('.preorder-item-price');
  if (filled && Number(qty.value) > 0 && UI.parseIdrInput(price.value || '') > 0 && rows.length < 30) addPreorderRow();
}
function readPreorderRows() {
  const rows = [...document.querySelectorAll('#preorderRows .preorder-row')];
  const items = Storage.getAllItems() || [];
  return rows.map(row => {
    const nameInp = row.querySelector('.preorder-item-name');
    let itemId = '';
    let nm = '';
    if (nameInp) { nm = (nameInp.value || '').trim(); }
    else {
      const sel = row.querySelector('.preorder-item-sel');
      const it = items.find(x => x.id === (sel?.value || ''));
      itemId = sel?.value || '';
      nm = it ? Storage.fullItemName(it) : '';
    }
    const qty = Math.max(parseInt(row.querySelector('.preorder-item-qty')?.value || '0', 10) || 0, 0);
    const price = Math.round(Number(UI.parseIdrInput(row.querySelector('.preorder-item-price')?.value || '')) || 0);
    return { itemId, name: nm, qty, price };
  }).filter(l => l.name && l.qty > 0 && l.price > 0);
}
function renderPreorderInfo() {
  const el = document.getElementById('preorderInfo');
  if (!el) return;
  const lines = readPreorderRows();
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const depEl = document.getElementById('preorderDeposit');
  const dep = Math.min(Math.max(Number(UI.parseIdrInput(depEl?.value || '')) || 0, 0), total);
  el.innerHTML = total > 0
    ? `Total ke pelanggan: <b>${preorderFmt(total)}</b>${dep > 0 ? ` • DP ${preorderFmt(dep)} → masuk kas, sisa dibayar saat barang datang (${preorderFmt(total - dep)})` : ' • tanpa DP'}`
    : '<span style="color:var(--text-muted)">Isi min 1 baris: pilih barang dari Produk (atau tulis manual), qty, dan harga jual ke pelanggan. Estimasi tanggal datang bisa diubah.</span>';
}
function openPoPay(id) {
  const po = Storage.getPreorderById(id);
  if (!po) return;
  const kindEl = document.getElementById('creditPayKind'); if (kindEl) kindEl.value = 'po';
  const ttl = document.getElementById('creditPayTitle'); if (ttl) ttl.textContent = '💵 Terima Pembayaran Pesanan';
  document.getElementById('creditPayId').value = id;
  const bal = Storage.preorderBalance(po);
  const info = document.getElementById('creditPayInfo');
  if (info) info.innerHTML = `<b>${escapeHtml(po.no || '')}</b> — ${escapeHtml(po.customer || '')}<br>Total ${preorderFmt(po.sellTotal)} • sudah dibayar ${preorderFmt(Storage.preorderPaidTotal(po))} • <b>sisa ${preorderFmt(bal)}</b>`;
  const amt = document.getElementById('creditPayAmount'); if (amt) { amt.value = String(Math.round(bal)); delete amt.dataset.touched; }
  const dt = document.getElementById('creditPayDate'); if (dt) dt.value = new Date().toISOString().split('T')[0];
  const er = document.getElementById('creditPayError'); if (er) er.textContent = '';
  const m = document.getElementById('creditPayModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
}
function closePoCost() { const m = document.getElementById('preorderCostModal'); if (m && m.open) { try { m.close(); } catch {} } }
function openPoCost(id) {
  const po = Storage.getPreorderById(id);
  if (!po) return;
  document.getElementById('preorderCostId').value = id;
  const info = document.getElementById('preorderCostInfo');
  if (info) info.innerHTML = `<b>${escapeHtml(po.no || '')}</b> — ${escapeHtml(po.customer || '')} • total biaya sejauh ini ${preorderFmt(Storage.preorderCostTotal(po))}`;
  const amt = document.getElementById('preorderCostAmount'); if (amt) { amt.value = ''; delete amt.dataset.touched; }
  const dt = document.getElementById('preorderCostDate'); if (dt) dt.value = new Date().toISOString().split('T')[0];
  const er = document.getElementById('preorderCostError'); if (er) er.textContent = '';
  const m = document.getElementById('preorderCostModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
}
function handlePoCostSubmit() {
  const id = document.getElementById('preorderCostId')?.value || '';
  const amount = Math.round(Number(UI.parseIdrInput(document.getElementById('preorderCostAmount')?.value || '')) || 0);
  const kind = document.getElementById('preorderCostKind')?.value || 'barang';
  const date = document.getElementById('preorderCostDate')?.value || new Date().toISOString().split('T')[0];
  const payment = document.getElementById('preorderCostPayment')?.value || 'cash';
  const note = document.getElementById('preorderCostNote')?.value.trim() || '';
  if (!id) return;
  try {
    Storage.addPreorderCost(id, { amount, kind, date, payment, note });
    closePoCost();
    UI.showSuccess('Biaya dicatat — ' + (kind === 'barang' ? 'masuk nilai barang pesanan' : kind === 'kirim' ? 'beban kirim' : 'beban lainnya'));
    refreshSalesPage();
  } catch (e) {
    const er = document.getElementById('preorderCostError');
    if (er) er.textContent = e && e.message ? e.message : 'Gagal menyimpan biaya';
    else UI.showError(e && e.message ? e.message : 'Gagal menyimpan biaya');
  }
}
function handlePreorderSubmit() {
  const d = {
    customer: document.getElementById('preorderCustomer')?.value.trim() || '',
    date: document.getElementById('preorderDate')?.value || new Date().toISOString().split('T')[0],
    eta: document.getElementById('preorderEta')?.value.trim() || '',
    deposit: Number(UI.parseIdrInput(document.getElementById('preorderDeposit')?.value || '')) || 0,
    payment: document.getElementById('preorderPayment')?.value || 'cash',
  };
  d.items = readPreorderRows();
  if (!d.customer) { const er = document.getElementById('preorderError'); if (er) er.textContent = 'Isi nama pelanggan'; else UI.showError('Isi nama pelanggan'); return; }
  if (!d.items.length) { const er = document.getElementById('preorderError'); if (er) er.textContent = 'Isi min 1 barang (nama + qty + harga)'; else UI.showError('Isi min 1 barang'); return; }
  try {
    const po = Storage.createPreorder(d);
    closePreorder();
    UI.showSuccess(`Pesanan ${po.no || po.id} tersimpan — ${preorderFmt(Storage.preorderSellTotal ? Storage.preorderSellTotal(po) : po.sellTotal)} — sisa dibayar saat barang datang`);
    refreshSalesPage();
  } catch (e) {
    const er = document.getElementById('preorderError');
    if (er) er.textContent = e && e.message ? e.message : 'Gagal menyimpan pesanan';
    else UI.showError(e && e.message ? e.message : 'Gagal menyimpan pesanan');
  }
}
function bindPreorderUI() {
  document.getElementById('preorderNewBtn')?.addEventListener('click', openPreorder);
  document.getElementById('preorderClose')?.addEventListener('click', closePreorder);
  document.getElementById('preorderCancel')?.addEventListener('click', closePreorder);
  document.getElementById('preorderAddRow')?.addEventListener('click', addPreorderRow);
  document.getElementById('preorderSave')?.addEventListener('click', handlePreorderSubmit);
  document.getElementById('preorderDeposit')?.addEventListener('input', renderPreorderInfo);
  document.getElementById('preorderCostClose')?.addEventListener('click', closePoCost);
  document.getElementById('preorderCostCancel')?.addEventListener('click', closePoCost);
  document.getElementById('preorderCostSave')?.addEventListener('click', handlePoCostSubmit);
}
function orderArrivePrompt(id) {
  const po = Storage.getPreorderById(id);
  if (!po) return;
  if (!confirm(`Paket ${po.no} sudah tiba di Indonesia/di tangan admin?`)) return;
  try { Storage.arrivePreorder(id, {}); UI.showSuccess('Barang sampai — serahkan ke pelanggan, terima pembayaran penuh'); refreshSalesPage(); }
  catch (e) { UI.showError(e && e.message ? e.message : 'Gagal memperbarui tahap'); }
}
function orderDeletePrompt(id) {
  const po = Storage.getPreorderById(id);
  if (!po) return;
  if (!confirm(`Batalkan & hapus pesanan ${po.no}? Semua jurnal ${po.no} (DP, biaya, bayar) ikut dihapus.`)) return;
  try { Storage.deletePreorder(id); UI.showSuccess('Pesanan dibatalkan'); refreshSalesPage(); }
  catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menghapus'); }
}
function printSalesPage() {
  const src = document.getElementById('salesContent');
  const label = document.getElementById('salesPeriod')?.selectedOptions?.[0]?.textContent || '';
  const ok = UI.printReportHTML('Laporan Penjualan', src ? src.innerHTML : '', 'Periode: ' + label);
  if (!ok) UI.showError('Izinkan pop-up untuk mencetak');
}
function exportSalesExcel() {
  try {
    if (typeof window.XLSX === 'undefined') { UI.showError('Library Excel belum termuat — coba muat ulang halaman'); return; }
    const box = document.getElementById('salesContent');
    if (!box) return;
    const tables = [...box.querySelectorAll('table.report-table')];
    if (!tables.length) { UI.showError('Belum ada tabel untuk diunduh'); return; }
    const wb = XLSX.utils.book_new();
    tables.forEach((t, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(t), ('Penjualan ' + (i + 1)).slice(0, 31)));
    XLSX.writeFile(wb, `wynara-penjualan-${new Date().toISOString().split('T')[0]}.xlsx`);
    UI.showSuccess(`${tables.length} tabel diekspor ke Excel`);
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal mengekspor'); }
}

/* ===== Halaman Kas & Bank ===== */
function cashAccountRows() {
  const bal = balances(Storage.getAllJournals(), {});
  return ACCOUNTS.filter(a => a.type === 'asset' && /^11/.test(a.code))
    .map(a => ({ code: a.code, name: a.name, payment: a.payment || '', net: (bal[a.code]?.debit || 0) - (bal[a.code]?.credit || 0) }))
    .filter(x => Math.abs(x.net) > 0.005)
    .sort((a, b) => b.net - a.net);
}
function renderKasPage() {
  if (!document.getElementById('viewKas')) return;
  const rows = cashAccountRows();
  const total = rows.reduce((s, x) => s + x.net, 0);
  const cash = rows.filter(x => x.payment === 'cash').reduce((s, x) => s + x.net, 0);
  const fmt = (v) => (v < 0 ? '−Rp' : 'Rp') + Math.abs(Math.round(v || 0)).toLocaleString('id-ID');
  const kpi = document.getElementById('kasKpi');
  if (kpi) {
    const tile = (label, value) => `<button type="button" style="cursor:default">${label}<b>${value}</b></button>`;
    kpi.innerHTML = tile('Total kas & bank', fmt(total)) + tile('💵 Tunai', fmt(cash)) + tile('🏦 Bank/QRIS/E-wallet', fmt(total - cash));
  }
  const sub = document.getElementById('kasSubtitle');
  if (sub) sub.textContent = `${rows.length} dompet aktif • saldo kumulatif dari jurnal`;
  const box = document.getElementById('kasWalletList');
  if (box) {
    if (!rows.length) {
      box.innerHTML = '<p style="color:var(--text-muted);font-size:12px">Belum ada saldo. Catat transaksi atau mutasi bank.</p>';
    } else {
      const catOf = (x) => {
        if (['1104', '1110'].includes(x.code)) return 'tunai';
        if (/^bank/i.test(x.name) || ['1101', '1106', '1107', '1108', '1109', '1111', '1112'].includes(x.code)) return 'bank';
        return 'ewallet';
      };
      const groups = [
        { key: 'tunai', label: '💵 Tunai' },
        { key: 'bank', label: '🏦 Bank' },
        { key: 'ewallet', label: '📱 E-Wallet / QRIS' },
      ];
      box.innerHTML = groups.map(g => {
        const list = rows.filter(x => catOf(x) === g.key);
        if (!list.length) return '';
        const sub = list.reduce((s, x) => s + x.net, 0);
        return `<div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px"><span>${g.label}</span><span>${fmt(sub)}</span></div>
          ${list.map(x => {
          const icon = x.payment ? ((Reports.PAYMENT_OPTIONS || []).find(p => p.value === x.payment)?.icon || '📦') : (g.key === 'bank' ? '🏦' : '📱');
          return `<div style="display:flex;align-items:center;gap:8px;font-size:13px;padding:6px 0;border-bottom:1px solid #f1f5f9">
              <span>${icon}</span><span style="flex:1">${escapeHtml(x.name)}<br><small style="color:#94a3b8">${x.code}</small></span>
              <b style="color:${x.net < 0 ? '#ef4444' : '#0f172a'}">${fmt(x.net)}</b></div>`;
        }).join('')}
        </div>`;
      }).join('');
    }
  }
  const recent = document.getElementById('kasRecentList');
  if (recent) {
    const codes = new Set(ACCOUNTS.filter(a => a.type === 'asset' && /^11/.test(a.code)).map(a => a.code));
    const list = Storage.getAllJournals()
      .filter(j => (j.lines || []).some(l => codes.has(l.account)))
      .slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 15);
    recent.innerHTML = list.length ? list.map(j => {
      const amt = (j.lines || []).filter(l => codes.has(l.account)).reduce((s, l) => s + (Number(l.debit) || 0) - (Number(l.credit) || 0), 0);
      const counterpart = (j.lines || []).find(l => !codes.has(l.account));
      const cpLabel = counterpart ? acctLabel(counterpart.account) : '';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">
        <div style="flex:1;min-width:0"><div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(j.memo || 'Jurnal')}${(j.ref || '') === 'preorder' ? ' <span style="font-size:10px;color:#a16207;font-weight:700">🌏 titip beli</span>' : ''}</div><div style="font-size:10px;color:#64748b">${escapeHtml(j.date || '')}${cpLabel ? ' • <b style="color:#334155">' + escapeHtml(cpLabel) + '</b>' : ''}</div></div>
        <b style="font-size:12px;white-space:nowrap;color:${amt < 0 ? '#ef4444' : '#0f172a'}">${fmt(amt)}</b></div>`;
    }).join('') : '<p style="color:var(--text-muted);font-size:12px">Belum ada mutasi kas/bank.</p>';
  }
  renderBankRecon();
}

/* ===== Rekonsiliasi bank (cocokkan mutasi ↔ transaksi) ===== */
function bankAccountSuggestion(desc, direction) {
  return bankAccountSuggestionFull(desc, direction).code;
}
function bankAccountSuggestionFull(desc, direction) {
  const rule = Storage.matchBankRule(desc, direction);
  if (rule) return { code: rule, source: 'rule' };
  return suggestBankAccountFull(desc, direction);
}
function renderBankRecon() {
  const box = document.getElementById('kasReconList');
  if (!box) return;
  renderKasReconDiff();
  const stmts = Storage.getBankStatement();
  const sumEl = document.getElementById('kasReconSummary');
  const allBtn = document.getElementById('kasReconMatchAllBtn');
  if (!stmts.length) {
    if (sumEl) sumEl.textContent = '';
    if (allBtn) allBtn.disabled = true;
    box.innerHTML = '<p style="color:var(--text-muted);font-size:12px">Belum ada mutasi bank. Klik 📂 Import mutasi untuk meng-upload CSV — sistem akan otomatis mencocokkan dengan transaksi yang sudah dicatat.</p>';
    return;
  }
  const results = suggestMatches(stmts, Storage.getAllEntries(), { days: 3 });
  const s = reconSummary(results);
  if (sumEl) sumEl.textContent = `${s.matched} cocok • ${s.pending} saran • ${s.posted} diposting • ${s.unmatched} tanpa pasangan`;
  if (allBtn) allBtn.disabled = s.pending === 0;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const rows = results.map(r => {
    const st = r.stmt;
    const pair = r.match;
    const cands = r.candidates || [];
    let status, actions = '';
    if (st.matchedId) {
      status = `✅ <span style="font-size:11px">${pair ? escapeHtml(pair.description || pair.category || 'transaksi') + ' • ' + escapeHtml(pair.date) : 'cocok'}</span>`;
    } else if (st.posted) {
      status = '<small style="color:#64748b">📘 diposting ke COA</small>';
    } else if (st.ignored) {
      status = '<small style="color:#94a3b8">— diabaikan</small>';
      actions = `<button class="btn btn-ghost recon-unignore" data-key="${st.key}" style="font-size:11px;padding:2px 8px">Batalkan</button>`;
    } else if (cands.length) {
      status = `<span style="font-size:11px;color:#b45309">↔ saran: ${escapeHtml(cands[0].description || cands[0].category || 'transaksi')} • ${escapeHtml(cands[0].date)}</span>`;
      actions = `<button class="btn btn-primary recon-match" data-key="${st.key}" data-entry="${cands[0].id}" style="font-size:11px;padding:3px 10px">✓ Cocokkan</button>
        <button class="btn btn-ghost recon-post" data-key="${st.key}" style="font-size:11px;padding:3px 8px">Posting COA</button>
        <button class="btn btn-ghost recon-rule" data-key="${st.key}" style="font-size:11px;padding:3px 8px" title="Simpan keterangan ini sebagai aturan">＋ Aturan</button>
        <button class="btn btn-ghost recon-ignore" data-key="${st.key}" style="font-size:11px;padding:3px 8px">Abaikan</button>`;
    } else {
      status = '<small style="color:#94a3b8">tidak ada pasangan</small>';
      actions = `<button class="btn btn-ghost recon-post" data-key="${st.key}" style="font-size:11px;padding:3px 8px">Posting COA</button>
        <button class="btn btn-ghost recon-rule" data-key="${st.key}" style="font-size:11px;padding:3px 8px" title="Simpan keterangan ini sebagai aturan">＋ Aturan</button>
        <button class="btn btn-ghost recon-ignore" data-key="${st.key}" style="font-size:11px;padding:3px 8px">Abaikan</button>`;
    }
    const acct = (getAccounts().find(a => a.code === st.counterAccount) || {});
    return `<tr style="${st.ignored ? 'opacity:0.55' : ''}">
      <td style="white-space:nowrap;font-size:12px">${escapeHtml(st.date)}</td>
      <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(st.desc || '')}">${escapeHtml(st.desc || '')}</td>
      <td class="amount-col" style="color:#059669">${st.direction === 'in' ? fmt(st.amount) : ''}</td>
      <td class="amount-col" style="color:#dc2626">${st.direction === 'out' ? fmt(st.amount) : ''}</td>
      <td style="font-size:11px;color:#64748b">${acct.code ? escapeHtml(acct.code + ' ' + acct.name) : '—'}</td>
      <td>${status}</td>
      <td style="white-space:nowrap">${actions}</td>
    </tr>`;
  }).join('');
  box.innerHTML = `<div style="overflow-x:auto"><table class="report-table"><thead><tr>
    <th>Tanggal</th><th>Keterangan</th><th class="amount-col">Masuk</th><th class="amount-col">Keluar</th>
    <th>Akun lawan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p style="font-size:11px;color:#64748b;margin-top:6px">Cocok = mutasi sama dengan transaksi tercatat (tak perlu dijurnal ulang). Posting COA = buat jurnal bank↔akun untuk mutasi yang belum tercatat.</p>`;
}
function bankReconMatch(key, entryId) {
  Storage.updateBankStatement(key, { matchedId: entryId, matchedType: 'entry' });
  UI.showSuccess('Mutasi dicocokkan dengan transaksi');
  renderBankRecon();
}
function bankReconPost(key) {
  const st = Storage.getBankStatement().find(s => s.key === key);
  if (!st) return;
  try {
    const res = Storage.importBankLines([{ date: st.date, amount: st.amount, direction: st.direction, counterAccount: st.counterAccount, memo: st.desc }], { bankAccount: st.bankAccount || '1101' });
    if (res.ok) { Storage.updateBankStatement(key, { posted: true }); UI.showSuccess('Mutasi diposting ke COA'); }
    else UI.showError('Gagal posting — bulan terkunci atau akun lawan belum dipilih');
    renderBankRecon(); refresh();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal posting'); }
}
function bankReconIgnore(key) {
  Storage.updateBankStatement(key, { ignored: true });
  renderBankRecon();
}
function bankReconUnignore(key) {
  Storage.updateBankStatement(key, { ignored: false });
  renderBankRecon();
}
function bankReconMatchAll() {
  const stmts = Storage.getBankStatement();
  const results = suggestMatches(stmts, Storage.getAllEntries(), { days: 3 });
  let n = 0;
  results.forEach(r => {
    if (!r.stmt.matchedId && !r.stmt.posted && !r.stmt.ignored && r.candidates && r.candidates.length) {
      Storage.updateBankStatement(r.stmt.key, { matchedId: r.candidates[0].id, matchedType: 'entry' });
      n++;
    }
  });
  if (n) UI.showSuccess(`${n} mutasi dicocokkan otomatis`); else UI.showInfo('Tidak ada saran untuk dicocokkan');
  renderBankRecon();
}
// Indikator selisih: saldo buku (COA) vs saldo akhir rekening koran.
function renderKasReconDiff() {
  const sel = document.getElementById('kasReconBankSelect');
  const inp = document.getElementById('kasReconEndBal');
  const out = document.getElementById('kasReconDiff');
  if (!sel || !out) return;
  const accts = getAccounts().filter(a => a.type === 'asset' && /^11/.test(a.code));
  if (sel.options.length !== accts.length) {
    const cur = sel.value;
    sel.innerHTML = accts.map(a => `<option value="${a.code}">${a.code} ${escapeHtml(a.name)}</option>`).join('');
    if (cur && accts.some(a => a.code === cur)) sel.value = cur;
  }
  const code = sel.value || '1101';
  const endBals = Storage.getBankEndBalances();
  if (inp) inp.value = endBals[code] ? String(endBals[code]).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
  const bal = balances(Storage.getAllJournals(), {});
  const book = (bal[code]?.debit || 0) - (bal[code]?.credit || 0);
  const end = Number(endBals[code]) || 0;
  const diff = end - book;
  const fmt = (v) => 'Rp' + Math.round(v || 0).toLocaleString('id-ID');
  out.innerHTML = `Saldo buku: <span style="color:#0f172a">${fmt(book)}</span> &nbsp;•&nbsp; Selisih: <span style="color:${Math.abs(diff) < 1 ? '#059669' : '#dc2626'}">${diff < 0 ? '−' : ''}${fmt(Math.abs(diff))}</span> ${Math.abs(diff) < 1 ? '✓ cocok' : ''}`;
}
function openBankRules(prefillKeyword, prefillCode) {
  const m = document.getElementById('bankRulesModal');
  if (!m) return;
  renderBankRules();
  const kw = document.getElementById('bankRuleKeyword');
  if (kw) kw.value = prefillKeyword || '';
  if (prefillCode) { const sel = document.getElementById('bankRuleCode'); if (sel) sel.value = prefillCode; }
  const dir = document.getElementById('bankRuleDir'); if (dir) dir.value = '';
  if (!m.open) { try { m.showModal(); } catch {} }
  updateBankRuleSuggestion();
  setTimeout(() => kw?.focus(), 40);
}
function closeBankRules() { const m = document.getElementById('bankRulesModal'); if (m && m.open) { try { m.close(); } catch {} } }
function accountOptionsWithSelected(code) {
  const accts = getAccounts();
  const TYPE = { asset: 'Aset', liability: 'Kewajiban', equity: 'Modal', revenue: 'Pendapatan', expense: 'Beban' };
  return ['asset', 'liability', 'equity', 'revenue', 'expense'].map(t =>
    `<optgroup label="${TYPE[t]}">${accts.filter(a => a.type === t).map(a => `<option value="${a.code}"${a.code === code ? ' selected' : ''}>${a.code} ${escapeHtml(a.name)}</option>`).join('')}</optgroup>`
  ).join('');
}
function acctLabel(code) {
  const a = getAccounts().find(x => x.code === code);
  return a ? `${a.code} ${a.name}` : String(code || '—');
}
function renderBankRules() {
  const sel = document.getElementById('bankRuleCode');
  if (sel && sel.options.length <= 1) sel.innerHTML = accountOptionsWithSelected('');
  const rules = Storage.getBankRules();
  const q = String(document.getElementById('bankRuleSearch')?.value || '').trim().toLowerCase();
  const match = (kw, code) => !q || kw.includes(q) || String(code).includes(q) || acctLabel(code).toLowerCase().includes(q);
  const countEl = document.getElementById('bankRuleCount');
  if (countEl) countEl.textContent = rules.length ? `• ${rules.length} aturan` : '';
  const chip = document.getElementById('kasReconRulesCount');
  if (chip) chip.textContent = rules.length ? `(${rules.length})` : '';
  // Tabel aturan tersimpan (bisa diedit langsung)
  const box = document.getElementById('bankRulesList');
  if (box) {
    const shown = rules.filter(r => match(r.keyword, r.code));
    box.innerHTML = shown.length ? `<div style="overflow-x:auto"><table class="report-table"><thead><tr><th>Kata kunci</th><th>Arah</th><th>Akun COA</th><th></th></tr></thead><tbody>
      ${shown.map(r => `<tr>
        <td><b style="font-size:12px">${escapeHtml(r.keyword)}</b></td>
        <td><select class="bank-rule-dir" data-id="${r.id}" aria-label="Arah" style="height:30px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;padding:0 6px">
          <option value=""${!r.direction ? ' selected' : ''}>↔ Dua arah</option>
          <option value="out"${r.direction === 'out' ? ' selected' : ''}>↑ Keluar</option>
          <option value="in"${r.direction === 'in' ? ' selected' : ''}>↓ Masuk</option></select></td>
        <td><select class="bank-rule-code" data-id="${r.id}" aria-label="Akun" style="max-width:260px;height:30px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;padding:0 6px">${accountOptionsWithSelected(r.code)}</select></td>
        <td><button class="btn btn-ghost bank-rule-del" data-id="${r.id}" aria-label="Hapus aturan" style="font-size:11px;padding:0 8px;color:#ef4444">✕</button></td>
      </tr>`).join('')}
    </tbody></table></div>`
      : `<p style="color:var(--text-muted);font-size:12px">${rules.length ? 'Tidak ada aturan yang cocok pencarian.' : 'Belum ada aturan. Klik salah satu contoh di bawah, atau isi form Tambah aturan.'}</p>`;
  }
  // Contoh aturan (difilter oleh pencarian)
  const presetsBox = document.getElementById('bankRulePresets');
  const existing = new Set(rules.map(r => `${r.keyword}|${r.direction || ''}`));
  if (presetsBox) {
    const list = BANK_RULE_PRESETS
      .filter(p => !existing.has(`${p.keyword}|${p.direction || ''}`))
      .filter(p => match(p.keyword, p.code))
      .slice(0, 80);
    presetsBox.innerHTML = list.length ? list.map(p => {
      const tag = p.direction === 'in' ? ' ↓' : p.direction === 'out' ? ' ↑' : '';
      return `<button type="button" class="bank-rule-preset" data-kw="${escapeHtml(p.keyword)}" data-code="${p.code}" data-dir="${p.direction || ''}" title="${escapeHtml(acctLabel(p.code))}" style="font-size:11px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:9999px;padding:4px 10px;cursor:pointer">＋ ${escapeHtml(p.keyword)}${tag} → ${p.code}</button>`;
    }).join('') : `<small style="color:#94a3b8">${rules.length && !q ? 'Semua contoh sudah ada.' : 'Tidak ada contoh yang cocok.'}</small>`;
  }
  renderBankRuleSuggestions();
}
// Saran aturan dari mutasi NYATA milik pengguna (bukan preset generik).
let lastSuggestCards = [];
function renderBankRuleSuggestions() {
  const box = document.getElementById('bankRuleSuggestions');
  if (!box) return;
  const rules = Storage.getBankRules();
  const existing = new Set(rules.map(r => `${r.keyword}|${r.direction || ''}`));
  lastSuggestCards = suggestRules(Storage.getBankStatement()).filter(s => !existing.has(`${s.keyword}|${s.direction || ''}`)).slice(0, 6);
  const bfCount = document.getElementById('bankRuleBackfillCount');
  if (bfCount) bfCount.textContent = String(lastSuggestCards.reduce((s, c) => s + c.count, 0));
  if (!lastSuggestCards.length) {
    box.innerHTML = '<div style="font-size:11px;color:#64748b">Belum ada pola baru dari mutasi. Import mutasi bank untuk mendapat saran.</div>';
    return;
  }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  box.innerHTML = `<div style="font-size:11px;font-weight:700;color:#1e3a8a;margin-bottom:8px">💡 Saran aturan dari mutasi Anda — pilih rekomendasi → periksa contoh → tambah aturan</div>`
    + lastSuggestCards.map((s, i) => {
    const dirTag = s.direction === 'out' ? '<span style="color:#dc2626;font-size:10px">↑ Uang keluar</span>' : s.direction === 'in' ? '<span style="color:#059669;font-size:10px">↓ Uang masuk</span>' : '';
    const badge = s.confirmed > 0
      ? '<span style="background:#dcfce7;color:#166534;border-radius:9999px;padding:2px 8px;font-size:10px;font-weight:700">✅ Berdasarkan pilihan Anda</span>'
      : '<span style="background:#fef3c7;color:#b45309;border-radius:9999px;padding:2px 8px;font-size:10px;font-weight:700">⚠️ Perlu konfirmasi</span>';
    const reason = s.confirmed > 0
      ? `${s.confirmed} transaksi sebelumnya dikategorikan sama oleh Anda.`
      : 'Saran dari kata pada mutasi bank — periksa tujuan transaksi.';
    const examples = s.examples.map(e => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#475569"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.desc)}</span><b style="white-space:nowrap">${fmt(e.amount)}</b></div>`).join('');
    return `<div style="background:#fff;border:1px solid #dbeafe;border-radius:12px;padding:10px 12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:13px;text-transform:uppercase;flex:1">${escapeHtml(s.keyword)}</b>
          <span style="font-size:11px;color:#64748b">${s.count} mutasi • ${fmt(s.total)}</span> ${dirTag}
        </div>
        <div style="margin:4px 0 6px">${badge} <span style="font-size:11px;color:#64748b">${reason}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:11px;color:#64748b">COA disarankan</span>
          <select class="bank-sgst-code" data-i="${i}" aria-label="COA" style="flex:1;min-width:200px;height:32px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;padding:0 6px">${accountOptionsWithSelected(s.code)}</select>
          <button type="button" class="btn btn-primary bank-sgst-add" data-i="${i}" style="font-size:12px;padding:5px 12px;white-space:nowrap">Tinjau &amp; tambah</button>
        </div>
        <div style="margin-top:6px;border-top:1px dashed #e2e8f0;padding-top:6px">${examples}</div>
      </div>`;
  }).join('');
}
function bankRuleAddSuggestion(i) {
  const sug = lastSuggestCards[i];
  if (!sug) return;
  const sel = document.querySelector(`.bank-sgst-code[data-i="${i}"]`);
  const code = sel ? sel.value : sug.code;
  const doBackfill = document.getElementById('bankRuleBackfill')?.checked !== false;
  try {
    Storage.addBankRule(sug.keyword, code, sug.direction);
    let n = 0;
    if (doBackfill) {
      Storage.getBankStatement().forEach(s => {
        if (s.posted || s.matchedId || s.ignored) return;
        const d = String(s.desc || '').toLowerCase();
        const dir = s.direction || '';
        if (!(d.includes(sug.keyword) && (!sug.direction || !dir || sug.direction === dir))) return;
        // Pertahankan koreksi manual: lewati baris yang akunnya sudah diubah dari saran awal
        if (s.suggestCode && s.counterAccount && s.counterAccount !== s.suggestCode) return;
        Storage.updateBankStatement(s.key, { counterAccount: code });
        n++;
      });
    }
    UI.showSuccess(`Aturan "${sug.keyword.toUpperCase()}" disimpan${n ? ` • ${n} mutasi diperbarui` : ''}`);
    renderBankRules();
    renderBankRecon();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menambah aturan'); }
}
function bankRuleAdd(kwArg, codeArg, dirArg) {
  const kw = (kwArg !== undefined ? kwArg : document.getElementById('bankRuleKeyword')?.value) || '';
  const code = codeArg !== undefined ? codeArg : document.getElementById('bankRuleCode')?.value;
  const dir = dirArg !== undefined ? dirArg : document.getElementById('bankRuleDir')?.value;
  try {
    Storage.addBankRule(kw.trim(), code, dir);
    const inp = document.getElementById('bankRuleKeyword'); if (inp) inp.value = '';
    UI.showSuccess('Aturan bank disimpan');
    renderBankRules();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menyimpan aturan'); }
}
function updateBankRuleSuggestion() {
  const el = document.getElementById('bankRuleSuggestion');
  if (!el) return;
  const kw = String(document.getElementById('bankRuleKeyword')?.value || '').trim();
  const dir = document.getElementById('bankRuleDir')?.value || '';
  if (!kw) { el.innerHTML = ''; return; }
  const s = bankAccountSuggestionFull(kw, dir);
  const src = s.source === 'rule' ? 'aturan tersimpan' : (s.source === 'preset' ? 'contoh' : 'default');
  el.innerHTML = `<span style="color:#64748b">Saran akun:</span> <b>${escapeHtml(acctLabel(s.code))}</b> <span style="color:#94a3b8">(${src})</span>
    <button type="button" class="btn btn-ghost bank-rule-use" data-code="${s.code}" style="font-size:11px;padding:2px 8px;margin-left:6px">Gunakan</button>`;
}
function bankRuleSeedAll() {
  const existing = new Set(Storage.getBankRules().map(r => `${r.keyword}|${r.direction || ''}`));
  let n = 0;
  BANK_RULE_PRESETS.forEach(p => {
    if (existing.has(`${p.keyword}|${p.direction || ''}`)) return;
    try { Storage.addBankRule(p.keyword, p.code, p.direction); n++; } catch {}
  });
  UI.showSuccess(n ? `${n} contoh aturan ditambahkan` : 'Semua contoh sudah ada');
  renderBankRules();
}
function bankRulesClearAll() {
  if (!Storage.getBankRules().length) return;
  if (!confirm('Hapus SEMUA aturan bank?')) return;
  Storage.clearBankRules();
  UI.showSuccess('Semua aturan dihapus');
  renderBankRules();
}
function bankRuleDelete(id) {
  Storage.deleteBankRule(id);
  renderBankRules();
}
// Isi ulang akun lawan baris mutasi yang belum diposting memakai aturan/saran.
function bankReconApplyRules() {
  let n = 0;
  Storage.getBankStatement().forEach(s => {
    if (s.posted || s.matchedId || s.ignored) return;
    const acct = bankAccountSuggestion(s.desc, s.direction);
    if (acct && acct !== s.counterAccount) { Storage.updateBankStatement(s.key, { counterAccount: acct }); n++; }
  });
  UI.showSuccess(n ? `${n} baris diisi akun dari aturan` : 'Semua baris sudah sesuai aturan');
  renderBankRecon();
}

/* ===== Halaman Pembelian ===== */
function openOrderMoreMenu(kind, id) {
  const r = kind === 'po' ? Storage.getPreorderById(id) : Storage.getCreditSaleById(id);
  if (!r) return;
  const bal = kind === 'po' ? Storage.preorderBalance(r) : Storage.creditOutstanding(r);
  const no = escapeHtml(r.no || r.invoiceNo || '');
  const cust = escapeHtml(r.customer || '—');
  const item = (cls, label) => `<button type="button" class="btn btn-ghost ${cls}" data-kind="${kind}" data-id="${id}" style="display:block;width:100%;text-align:left;font-size:13px;padding:10px 12px;margin-bottom:6px">${label}</button>`;
  const html = `<div>
    <p style="font-size:12px;color:#475569;margin:0 0 10px"><b>${no}</b> — ${cust}</p>
    ${bal > 0.01 ? item('order-more-pay', `💵 Terima pembayaran (sisa ${preorderFmt(bal)})`) : ''}
    ${kind === 'po' ? item('order-more-cost', '🧾 Catat biaya pesanan') : ''}
    ${item('order-more-status', '＋ Ubah status…')}
    ${kind === 'po' ? '<button type="button" class="btn btn-ghost order-more-muatan" style="display:block;width:100%;text-align:left;font-size:13px;padding:10px 12px;margin-bottom:6px">🚢 Buka Papan Muatan</button>' : ''}
    <button type="button" class="btn btn-ghost order-more-del" data-kind="${kind}" data-id="${id}" style="display:block;width:100%;text-align:left;font-size:13px;padding:10px 12px;color:#ef4444">${kind === 'po' ? '🗑 Batalkan pesanan' : '🗑 Hapus penjualan kredit'}</button>
  </div>`;
  UI.openInfoModal('⋯ Aksi pesanan', html);
}
function renderPembelianPage() {
  if (!document.getElementById('viewPembelian')) return;
  const purchases = Storage.getAllPurchases();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let outstanding = 0, overdue = 0, openCount = 0;
  purchases.forEach(p => {
    const out = Storage.purchaseOutstanding(p);
    if (out <= 0.01) return;
    openCount++; outstanding += out;
    if (p.dueDate && new Date(p.dueDate + 'T00:00:00') < today) overdue += out;
  });
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const kpi = document.getElementById('pembelianKpi');
  if (kpi) {
    const tile = (label, value) => `<button type="button" style="cursor:default">${label}<b>${value}</b></button>`;
    kpi.innerHTML = tile('Total hutang usaha', fmt(outstanding)) + tile('⏰ Jatuh tempo/terlambat', fmt(overdue)) + tile('Faktur belum lunas', openCount) + tile('Total pembelian', purchases.length);
  }
  const sub = document.getElementById('pembelianSubtitle');
  if (sub) sub.textContent = `${purchases.length} pembelian • ${openCount} belum lunas • hutang ${fmt(outstanding)}`;
  UI.renderSuppliers(purchases, 'pembelianList');
  // Sisi BELI dari titip beli / preorder (uang keluar: barang, kirim, lainnya)
  const pos = Storage.getPreorders().filter(po => po.stage !== 'cancelled');
  const poBox = document.getElementById('pembelianPoList');
  if (poBox) {
    const active = pos.filter(po => !['settled', 'cancelled'].includes(po.stage));
    let barang = 0, kirim = 0, lain = 0;
    pos.forEach(po => (po.costs || []).forEach(c => {
      if (c.kind === 'barang') barang += c.amount; else if (c.kind === 'kirim') kirim += c.amount; else lain += c.amount;
    }));
    const poSub = document.getElementById('pembelianPoSubtitle');
    if (poSub) poSub.textContent = `${active.length} pesanan aktif • biaya barang ${fmt(barang)} • kirim ${fmt(kirim)} • lainnya ${fmt(lain)} — daftar pembayaran pelanggan di halaman Penjualan`;
    const STAGE = { ordered: 'Dipesan', dp_paid: 'DP terbayar', china: 'Gudang China', shipping: 'Kirim ke Indo', shipped: 'Dikirim', arrived: 'Sampai Indo', received: 'Di gudang', invoiced: 'Teredi invoice', settled: 'Selesai', cancelled: 'Batal' };
    poBox.innerHTML = pos.length ? `<div style="overflow-x:auto"><table class="report-table"><thead><tr>
        <th>Tanggal</th><th>Nomor</th><th>Pelanggan</th><th>Tahap beli</th><th class="amount-col">Barang</th><th class="amount-col">Kirim</th><th class="amount-col">Total biaya</th><th class="amount-col">Sisa pelanggan</th><th>Resi</th><th>Aksi</th></tr></thead><tbody>
        ${pos.map(po => {
      const costs = po.costs || [];
      const b = costs.filter(c => c.kind === 'barang').reduce((s, c) => s + (Number(c.amount) || 0), 0);
      const k = costs.filter(c => c.kind === 'kirim').reduce((s, c) => s + (Number(c.amount) || 0), 0);
      return `<tr>
          <td style="font-size:12px;white-space:nowrap">${escapeHtml(po.date)}</td>
          <td style="font-size:12px;white-space:nowrap">${escapeHtml(po.no)}</td>
          <td style="font-size:12px">${escapeHtml(po.customer || '—')}</td>
          <td style="font-size:11px">${STAGE[po.stage] || escapeHtml(po.stage)}</td>
          <td class="amount-col">${fmt(b)}</td>
          <td class="amount-col">${fmt(k)}</td>
          <td class="amount-col">${fmt(Storage.preorderCostTotal(po))}</td>
          <td class="amount-col ${Storage.preorderBalance(po) > 0.01 ? 'expense' : ''}">${fmt(Storage.preorderBalance(po))}</td>
          <td style="font-size:11px">${escapeHtml((po.shipment || {}).tracking || '—')}</td>
          <td style="white-space:nowrap">
            <button type="button" class="btn btn-ghost po-status" data-id="${po.id}" style="font-size:11px;padding:2px 8px" title="Update status">⏱</button>
            ${po.target === 'stock' && !po.stockReceived ? `<button type="button" class="btn btn-primary stock-receive" data-id="${po.id}" style="font-size:11px;padding:2px 8px">📥 Terima stok</button>` : po.stockReceived ? '<span style="font-size:10px;color:#059669;font-weight:700">✔ stok masuk</span>' : ''}
          </td></tr>`;
    }).join('')}
        </tbody></table></div>` : '<p style="color:var(--text-muted);font-size:12px">Belum ada titip beli (preorder).</p>';
  }
}

function handleStockReceive(id) {
  try {
    const po = Storage.receivePreorderStock(id, { date: new Date().toISOString().split('T')[0] });
    UI.showSuccess(`Stok masuk gudang — ${po.items.reduce((s, l) => s + (Number(l.qty) || 0), 0)} pcs ditambahkan`);
    renderPembelianPage();
    refresh();
    queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menerima stok'); }
}
// Tutup pesanan titip beli (barang diterima pembeli & sudah lunas) → pengakuan pendapatan + HPP
function preorderSettlePrompt(id) {
  const po = Storage.getPreorderById(id);
  if (!po) return;
  if (!confirm(`Tutup pesanan ${po.no}? Pelunasan diakui (DP & bayaran jadi pendapatan, barang di gudang jadi HPP).`)) return;
  try {
    const lclCost = preorderLclCost(po.id);
    Storage.settlePreorder(id, { date: new Date().toISOString().split('T')[0], note: 'Barang diterima & lunas', costGoodsOvr: lclCost > 0 ? Math.max(Storage.preorderCostTotal(po), lclCost) : null });
    UI.showSuccess('Pesanan selesai — pendapatan & HPP diakui');
    refresh();
    queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menutup pesanan'); }
}
/* ===== Papan Muatan (LCL consolidation) ===== */
function renderMuatanPage() {
  if (!document.getElementById('viewMuatan')) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const bels = getBelanjas();
  const kolis = getKolis();
  const muats = getMuatans();

  // KPI
  let agentBalance = 0;
  Storage.getAllJournals().forEach((j) => (j.lines || []).forEach((l) => {
    if (l.account === '1212') agentBalance += (Number(l.debit) || 0) - (Number(l.credit) || 0);
  }));
  const belInChina = bels.filter((b) => ['paid', 'china'].includes(b.stage)).reduce((s, b) => s + (b.totalIdr || 0), 0);
  const belAtSea = bels.filter((b) => ['batch', 'ship'].includes(b.stage)).reduce((s, b) => s + (b.totalIdr || 0), 0);
  const freightAtSea = muats.filter((m) => m.freightBilled > 0 && !m.arrivedKoliIds?.length).reduce((s, m) => s + (m.freightBilled || 0), 0);
  const gerbong = (m) => kolis.filter((k) => (m.koliIds || []).includes(k.id));
  const nextMuat = muats.filter((m) => !m.departed).sort((a, b) => String(a.etd).localeCompare(String(b.etd)))[0];
  const nextCb = nextMuat ? gerbong(nextMuat).reduce((s, k) => s + (k.cbm || 0), 0) : 0;

  const kpi = document.getElementById('muatanKpi');
  if (kpi) {
    const tile = (label, value) => `<button type="button" style="cursor:default">${label}<b>${value}</b></button>`;
    kpi.innerHTML = tile('Saldo agen', fmt(agentBalance)) + tile('💵 Barang di gudang China', fmt(belInChina)) + tile('🚢 Barang di kapal', fmt(belAtSea + freightAtSea)) + tile(nextMuat ? `Muatan berikut ${escapeHtml(nextMuat.code)}` : 'Muatan berikut', nextMuat ? `${nextCb.toFixed(2)} CBM${nextMuat.etd ? ' • ETD ' + escapeHtml(nextMuat.etd) : ''}` : '—');
  }
  const sub = document.getElementById('muatanSubtitle');
  if (sub) sub.textContent = `${bels.length} belanja • ${kolis.length} koli • ${muats.length} muatan — cek "di mana uang saya sekarang"`;

  // Papan 3 kolom
  const chinaBox = document.getElementById('muatanColChina');
  const seaBox = document.getElementById('muatanColSea');
  const arrivedBox = document.getElementById('muatanColArrived');
  const chip = (t, c) => `<span style="background:${c};color:#fff;font-size:10px;font-weight:700;border-radius:9999px;padding:2px 8px">${t}</span>`;
  const colCard = (title, sub2, right, muatId) => `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;margin-bottom:6px;background:#fff"${muatId ? ` data-muatan="${muatId}" role="button" style="cursor:pointer"` : ''}>
    <div style="display:flex;justify-content:space-between;gap:6px;align-items:center"><b style="font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(title)}</b><span style="font-size:12px;white-space:nowrap;font-weight:700">${right}</span></div>
    <div style="font-size:11px;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(sub2)}</div></div>`;

  function kolisBelanjaStage(k) {
    const b = (k.belanjaIds || []).map((bid) => bels.find((x) => x.id === bid)).filter(Boolean);
    return b.length ? b[0].stage : '';
  }
  function belanjaIdrOf(k) {
    return (k.belanjaIds || []).reduce((s, bid) => s + (bels.find((x) => x.id === bid)?.totalIdr || 0), 0);
  }
  if (chinaBox) {
    const inHouse = kolis.filter((k) => !k.muatanId && kolisBelanjaStage(k) !== 'arrived');
    const pureBels = bels.filter((b) => !b.koliId && ['paid', 'china'].includes(b.stage));
    const html = inHouse.map((k) => colCard(`Koli ${k.parcelNo}`, `${(k.cbm || 0).toFixed(2)} CBM${k.weightKg ? ' • ' + k.weightKg + ' kg' : ''} • ${k.belanjaIds.length} belanja`, fmt(belanjaIdrOf(k)))).join('')
      + pureBels.map((b) => colCard(`${b.no}`, `${escapeHtml(b.seller || b.marketplace)} • ${fmtCnyLoc(b.totalCny)} @${b.kursAgen}`, fmt(b.totalIdr))).join('');
    chinaBox.innerHTML = (html || '<p style="color:var(--text-muted);font-size:12px">Belum ada paket di gudang China. Cek-in koli setelah agent menerimanya.</p>');
  }
  if (seaBox) {
    const atSea = muats.filter((m) => m.departed && !m.allocated);
    const html = atSea.map((m) => colCard(m.code || m.id, `${escapeHtml(m.forwarder || 'forwarder')} • ${(getChargeableOf(m, gerbong(m)) || 0).toFixed(2)} ${m.mode === 'air' ? 'kg' : 'CBM'}${m.eta ? ' • ETA ' + escapeHtml(m.eta) : ''}`, fmt((m.freightBilled || 0)), m.id)).join('');
    seaBox.innerHTML = (html || '<p style="color:var(--text-muted);font-size:12px">Tidak ada muatan di perjalanan.</p>');
  }
  function getChargeableOf(m, ks) {
    if (!ks.length) return 0;
    const mode = m.mode === 'air' ? 'air' : 'sea';
    const measure = (k) => (mode === 'air' ? Math.max(k.weightKg || 0, (k.cbm || 0) * 167) : (k.cbm || 0));
    const raw = ks.reduce((s, k) => s + measure(k), 0);
    return mode === 'air' ? Math.ceil(raw) : Math.max(Math.ceil(raw * 100) / 100, m.minCbm || 0);
  }
  if (arrivedBox) {
    const arrived = muats.filter((m) => m.arrivedKoliIds?.length && !m.allocated);
    const html = arrived.map((m) => {
      const arrivedKolis = gerbong(m).filter((k) => (m.arrivedKoliIds || []).includes(k.id));
      return colCard(m.code || m.id, `${arrivedKolis.length} koli tiba • ${m.allocated ? 'selesai' : 'perlu alokasi biaya'}`, fmt(m.freightBilled || 0), m.id);
    }).join('');
    arrivedBox.innerHTML = (html || '<p style="color:var(--text-muted);font-size:12px">Belum ada muatan tiba.</p>');
  }

  // Daftar belanja
  const listBox = document.getElementById('muatanBelanjaList');
  if (listBox) {
    const STAGE = { paid: 'Dipesan', china: 'Di gudang China', batch: 'Muat ke muatan', ship: 'Di kapal', arrived: 'Sampai gudang', done: 'Selesai' };
    const COLOR = { paid: '#94a3b8', china: '#f59e0b', batch: '#8b5cf6', ship: '#3b82f6', arrived: '#059669', done: '#64748b' };
    const pos = Storage.getPreorders();
    listBox.innerHTML = bels.length ? `<div style="overflow-x:auto"><table class="report-table"><thead><tr>
      <th>Tanggal</th><th>Nomor</th><th>Marketplace / Seller</th><th>Untuk</th><th class="amount-col">¥ Total</th><th class="amount-col">Rp Total</th><th class="amount-col">Mother cost</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
      ${bels.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map((b) => {
      const po = b.preorderId ? pos.find((p) => p.id === b.preorderId) : null;
      const mar = po ? preorderRealisedMargin(po) : null;
      const target = b.purpose === 'stock' ? '📦 Stok' : po ? `👤 ${escapeHtml(po.customer || po.no)}` : '👤 Preorder';
      const marginTxt = po && mar.landed > 0 ? `<br><span style="color:${mar.margin >= 0 ? '#059669' : '#dc2626'};font-weight:700">margin ${fmt(mar.margin)} (${mar.pct >= 0 ? '+' : ''}${Math.round(mar.pct * 100)}%)</span>` : '';
      return `<tr>
        <td style="font-size:12px;white-space:nowrap">${escapeHtml(b.date)}</td>
        <td style="font-size:12px;white-space:nowrap">${escapeHtml(b.no)}</td>
        <td style="font-size:12px">${escapeHtml(MARKETPLACES.find((mk) => mk.id === b.marketplace)?.label || b.marketplace)} • ${escapeHtml(b.seller || '—')}</td>
        <td style="font-size:11px">${target}${marginTxt}</td>
        <td class="amount-col">${fmtCnyLoc(b.totalCny)} <span style="font-size:10px;color:#64748b">@${b.kursAgen}</span></td>
        <td class="amount-col">${fmt(b.totalIdr)}</td>
        <td class="amount-col">${b.landedTotal != null ? fmt(b.landedTotal) : '—'}</td>
        <td style="font-size:11px">${chip(STAGE[b.stage] || b.stage, COLOR[b.stage] || '#94a3b8')}</td>
        <td style="white-space:nowrap">
          ${!b.koliId ? `<button type="button" class="btn btn-ghost belanja-koli" data-id="${b.id}" style="font-size:11px;padding:2px 8px">🧾 Koli</button>` : ''}
          ${b.stage !== 'done' ? `<button type="button" class="btn btn-ghost belanja-refund" data-id="${b.id}" style="font-size:11px;padding:2px 8px" title="Refund seller / kurang kirim">↩️</button>` : ''}
        </td></tr>`;
    }).join('')}
      </tbody></table></div>` : '<p style="color:var(--text-muted);font-size:12px">Belum ada belanja. Klik “＋ Belanja marketplace” untuk order pertama.</p>';
  }
}

function openBelanjaModalFor(poId) { openBelanjaModal(poId); }

// tempel daftar forwarder → koli: kode;CBM;kg per baris, cocok resi China → belanja
function openKoliPasteModal(poId) {
  const po = poId ? Storage.getPreorderById(poId) : null;
  const bels = po ? getBelanjas().filter((b) => b.preorderId === poId) : [];
  const html = `<div style="display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:#64748b">${po ? `<b>${escapeHtml(po.no)}</b> — ${escapeHtml(po.customer || '')} • ${bels.length} belanja terkait` : 'Semua belanja menunggu koli'}</div>
    <textarea id="koliPaste" rows="5" placeholder="K-001; 1,2; 8,5&#10;K-002; 0,06; 1,4&#10;(kode; CBM; kg)" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:12px"></textarea>
    <div style="font-size:11px;color:#64748b">Satu baris per paket — <b>kode; CBM; kg</b> dari daftar forwarder. Minimum 0,1 CBM diterapkan otomatis. Belanja dicocokkan via resi China.</div>
    <div id="koliPastePreview"></div>
    <button type="button" id="koliPasteCommit" class="btn btn-primary" disabled>📥 Cek-in (review dulu)</button>
  </div>`;
  UI.openInfoModal(poId ? `🧾 Masuk gudang China — ${po.no}` : '🧾 Cek-in koli (tempel daftar)', html);
  const parse = () => {
    const belPool = po ? bels : getBelanjas().filter((b) => !b.koliId);
    const rows = String(document.getElementById('koliPaste').value || '').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => {
      const p = s.split(/[;\t]/).map((x) => x.trim());
      const code = p[0] || '';
      const cbm = Math.max(Number((p[1] || '').replace(',', '.')) || 0, 0);
      const kg = Number((p[2] || '').replace(',', '.')) || 0;
      const track = p[3] || '';
      let bel = null;
      if (track) bel = belPool.find((b) => b.chinaTracking && track.toUpperCase().includes(b.chinaTracking.toUpperCase()));
      if (!bel) bel = belPool.find((b) => b.chinaTracking && code.toUpperCase().includes(b.chinaTracking.toUpperCase()));
      return { code, cbm, kg, track, bel };
    });
    const uniq = new Map();
    rows.forEach((r) => { const key = r.code || `${r.cbm}/${r.kg}`; if (!uniq.has(key)) uniq.set(key, r); });
    return Array.from(uniq.values());
  };
  const preview = () => {
    try {
      const list = parse();
      const rows = list.map((r) => `<tr>
          <td style="font-size:11px">${escapeHtml(r.code || '—')}</td>
          <td class="amount-col">${r.cbm.toFixed(2)}${r.cbm < MIN_CBM ? ' <span style="color:#b45309;font-weight:700">→ 0,1 (min)</span>' : ''}</td>
          <td class="amount-col">${r.kg || '—'}</td>
          <td style="font-size:11px;color:${r.bel ? '#059669' : '#b45309'}">${r.bel ? escapeHtml(r.bel.no) : (r.track ? 'resi ' + escapeHtml(r.track) : '—')}</td>
        </tr>`).join('');
      document.getElementById('koliPastePreview').innerHTML = list.length
        ? `<div style="overflow-x:auto"><table class="report-table"><thead><tr><th>Kode</th><th class="amount-col">CBM</th><th class="amount-col">kg</th><th>Cocok belanja</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';
      document.getElementById('koliPasteCommit').disabled = false;
    } catch (err) { UI.showError(err && err.message ? err.message : 'Gagal membaca daftar'); }
  };
  document.getElementById('koliPaste')?.addEventListener('input', preview);
  document.getElementById('koliPasteCommit')?.addEventListener('click', () => {
    try {
      const list = parse();
      list.forEach((r) => {
        const k = checkInKoli({ parcelNo: r.code || undefined, cbm: r.cbm, weightKg: r.kg, note: po ? po.no : '' });
        if (r.bel) { try { assignBelanjaToKoli(k.id, r.bel.id); } catch {} }
      });
      UI.closeInfoModal();
      UI.showSuccess(`${list.length} koli masuk gudang China — muat ke muatan di Papan Muatan`);
      if (po) { renderSalesPage(); refresh(); queueMirror(); } else renderMuatanPage();
    } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal cek-in'); }
  });
}

function openBelanjaModal(preorderId = null) {
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const pos = Storage.getPreorders().filter((po) => po.stage !== 'cancelled' && po.stage !== 'settled');
  const forOrder = preorderId ? pos.find((p) => p.id === preorderId) : null;
  const html = `<form id="belanjaForm" style="display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <label style="flex:1;min-width:120px;font-size:12px">Tanggal<br><input type="date" id="belanjaDate" value="${new Date().toISOString().split('T')[0]}" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;min-width:120px;font-size:12px">Marketplace<br><select id="belanjaMp" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px">${MARKETPLACES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}</select></label>
      <label style="flex:1;min-width:120px;font-size:12px">Seller<br><input id="belanjaSeller" placeholder="nama toko" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    </div>
    <label style="font-size:12px">Barang — satu baris per barang: <b>nama; qty; harga ¥</b><textarea id="belanjaLines" rows="3" placeholder="Case iPhone 15; 40; 28" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:12px"></textarea></label>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <label style="flex:1;min-width:110px;font-size:12px">Ongkir China (¥)<br><input type="number" id="belanjaOngkir" min="0" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;min-width:110px;font-size:12px">Biaya lain (Rp)<br><input type="number" id="belanjaFee" min="0" value="0" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;min-width:110px;font-size:12px">Kurs dibayar (Rp/¥)<br><input type="number" id="belanjaKurs" min="1" value="2300" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <label style="flex:1;min-width:110px;font-size:12px">Bayar dengan<br><select id="belanjaPay" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"><option value="transfer">Bank BCA (transfer)</option><option value="cash">Tunai (1104)</option><option value="qris">QRIS</option><option value="agent">Saldo agen — data lama (1212)</option></select></label>
      <label style="flex:1;min-width:110px;font-size:12px">Resi China (tracking seller)<br><input id="belanjaTracking" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    </div>
    <label style="font-size:12px">Untuk (tujuan barang)<br><select id="belanjaFor" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"${forOrder ? ' data-locked="1"' : ''}>
      <option value="">📦 Stok gudang</option>
      ${pos.map((po) => `<option value="${po.id}"${po.id === preorderId ? ' selected' : ''}>👤 ${escapeHtml(po.customer || po.no)} (${escapeHtml(po.no)})</option>`).join('')}
    </select>${forOrder ? `<div style="font-size:10.5px;color:#475569;margin-top:3px">Belanja ini untuk pesanan <b>${escapeHtml(forOrder.no)}</b>${forOrder.customer ? ' — ' + escapeHtml(forOrder.customer) : ''}</div>` : ''}</label>
    <div style="font-size:11px;color:#64748b">Jurnal: Dr Persediaan dalam Perjalanan (1211) / Cr kas. Ongkir laud (freight) <b>belum termasuk</b> — ditambahkan saat muatan tiba (alokasi otomatis).</div>
    <button type="submit" class="btn btn-primary" id="belanjaSave">🛍 Simpan belanja (bayar penuh)</button>
  </form>`;
  UI.openInfoModal(forOrder ? `🛍 Beli untuk pesanan ${forOrder.no}` : '🛍 Belanja marketplace', html);
  document.getElementById('belanjaSave')?.addEventListener('click', saveBelanja);
  const form = document.getElementById('belanjaForm');
  form?.addEventListener('submit', (e) => { e.preventDefault(); saveBelanja(); });
  function saveBelanja() {
    try {
      const lines = String(document.getElementById('belanjaLines').value || '').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => {
        const parts = s.split(';').map((x) => x.trim());
        return { name: parts[0], qty: Number(parts[1]) || 1, cnyUnit: Number(parts[2]) || 0 };
      });
      const poSel = document.getElementById('belanjaFor').value;
      const b = createBelanja({
        date: document.getElementById('belanjaDate').value,
        marketplace: document.getElementById('belanjaMp').value,
        seller: document.getElementById('belanjaSeller').value,
        orderNo: '',
        lines, ongkirCny: Number(document.getElementById('belanjaOngkir').value) || 0,
        agentFee: Number(document.getElementById('belanjaFee').value) || 0,
        kursAgen: Number(document.getElementById('belanjaKurs').value) || 0,
        payment: document.getElementById('belanjaPay').value,
        purpose: poSel ? 'preorder' : 'stock',
        preorderId: poSel || null,
        chinaTracking: document.getElementById('belanjaTracking').value,
      });
      UI.closeInfoModal();
      UI.showSuccess(`Belanja ${b.no} tersimpan — ${fmt(b.totalIdr)}`);
      renderMuatanPage();
      refresh();
      queueMirror();
    } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal simpan belanja'); }
  }
}

function openKoliModal() {
  const bels = getBelanjas().filter((b) => !b.koliId);
  const html = `<form id="koliForm" style="display:flex;flex-direction:column;gap:10px">
    <label style="font-size:12px">Nomor paket (opsional — auto)<input id="koliNo" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    <div style="display:flex;gap:10px">
      <label style="flex:1;font-size:12px">Tiba di gudang China<br><input type="date" id="koliDate" value="${new Date().toISOString().split('T')[0]}" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;font-size:12px">CBM diukur<br><input type="number" step="0.01" id="koliCbm" placeholder="0.35" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;font-size:12px">Berat kg<br><input type="number" step="0.1" id="koliKg" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    </div>
    <label style="font-size:12px">💡 Cek-in banyak paket sekaligus — satu baris per paket: <b>no;CBM;kg</b><textarea id="koliBulk" rows="4" placeholder="K-201;0.35;4.2&#10;K-202;0.8;9" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:12px"></textarea></label>
    <label style="font-size:12px">Catat belanja yang ikut paket ini (opsional)<br><select id="koliBelanja" multiple size="3" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;font-size:12px">
      ${bels.map((b) => `<option value="${b.id}">${b.no} — ${escapeHtml(b.seller || b.marketplace)}</option>`).join('')}
    </select></label>
    <button type="submit" class="btn btn-primary">📥 Cek-in (batch ok)</button>
  </form>`;
  UI.openInfoModal('🧾 Cek-in koli (gudang China)', html);
  document.getElementById('koliForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const bulk = String(document.getElementById('koliBulk').value || '').split('\n').map((s) => s.trim()).filter(Boolean);
      if (bulk.length) {
        bulk.forEach((line) => {
          const [no, cbm, kg] = line.split(';').map((x) => x.trim());
          checkInKoli({ parcelNo: no || undefined, cbm: Number(cbm) || 0, weightKg: Number(kg) || 0, arrivalDate: document.getElementById('koliDate').value });
        });
        const sel = Array.from(document.getElementById('koliBelanja').selectedOptions || []).map((o) => o.value);
        const kolis = getKolis();
        const newKolis = kolis.slice(-bulk.length);
        sel.forEach((bid, ix) => { try { assignBelanjaToKoli(newKolis[ix % newKolis.length].id, bid); } catch {} });
      } else {
        const k = checkInKoli({ parcelNo: document.getElementById('koliNo').value, cbm: Number(document.getElementById('koliCbm').value) || 0, weightKg: Number(document.getElementById('koliKg').value) || 0, arrivalDate: document.getElementById('koliDate').value });
        const bid = document.getElementById('koliBelanja') ;
        if (bid.value) { try { assignBelanjaToKoli(k.id, bid.value); } catch {} }
      }
      UI.closeInfoModal();
      UI.showSuccess('Paket tercatat di gudang China');
      renderMuatanPage();
      queueMirror();
    } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal cek-in koli'); }
  });
}

function openMuatanCreateModal() {
  const html = `<form id="muatanCreateForm" style="display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <label style="flex:1;min-width:110px;font-size:12px">Kode batch<br><input id="mutCode" placeholder="LCL-2026-04" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;min-width:110px;font-size:12px">Forwarder<br><input id="mutFwd" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;min-width:110px;font-size:12px">Mode<br><select id="mutMode" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"><option value="sea">Laut LCL (per CBM)</option><option value="air">Air (per kg)</option></select></label>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <label style="flex:1;min-width:110px;font-size:12px">Tarif per CBM/kg (Rp)<br><input type="number" id="mutRate" min="1" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;min-width:110px;font-size:12px">CBM minimum<br><input type="number" id="mutMin" step="0.01" min="0" value="0.5" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <label style="flex:1;min-width:120px;font-size:12px">ETD<br><input type="date" id="mutEtd" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
      <label style="flex:1;min-width:120px;font-size:12px">ETA<br><input type="date" id="mutEta" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    </div>
    <button type="submit" class="btn btn-primary">🚢 Simpan muatan</button>
  </form>`;
  UI.openInfoModal('🚢 Muatan baru (batch LCL)', html);
  document.getElementById('muatanCreateForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const m = createMuatan({
        code: document.getElementById('mutCode').value,
        forwarder: document.getElementById('mutFwd').value,
        mode: document.getElementById('mutMode').value === 'air' ? 'air' : 'sea',
        ratePerCbm: Number(document.getElementById('mutRate').value) || 0,
        minCbm: Number(document.getElementById('mutMin').value) || 0,
        etd: document.getElementById('mutEtd').value,
        eta: document.getElementById('mutEta').value,
      });
      UI.closeInfoModal();
      UI.showSuccess(`Muatan ${m.code} dibuat — muat koli di detail`);
      openMuatanDetailModal(m.id);
    } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal buat muatan'); }
  });
}

function openMuatanDetailModal(muatanId) {
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const render = () => {
    const m = getMuatanById(muatanId);
    if (!m) return;
    const kolis = getKolis();
    const loaded = kolis.filter((k) => (m.koliIds || []).includes(k.id));
    const waiting = kolis.filter((k) => !k.muatanId && !k.deferred);
    const measure = (k) => (m.mode === 'air' ? Math.max(k.weightKg || 0, (k.cbm || 0) * 167) : (k.cbm || 0));
    const raw = loaded.filter(k => !k.deferred).reduce((s, k) => s + measure(k), 0);
    const unit = m.mode === 'air' ? 'kg' : 'CBM';
    const chargeable = m.mode === 'air' ? Math.ceil(raw) : Math.max(Math.ceil(raw * 100) / 100, m.minCbm || 0);
    const rate = m.mode === 'air' ? m.ratePerKg : m.ratePerCbm;
    const est = Math.round(chargeable * (rate || 0)) + (m.charges || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const projPerCbm = chargeable > 0 ? Math.round(est / chargeable) : 0;
    const html = `<div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px">
        <b>${escapeHtml(m.code || '')}</b> ${escapeHtml(m.forwarder || '')} • ${m.mode === 'air' ? 'Air' : 'Laut LCL'} • tarif ${fmt(rate)}/${unit}${m.minCbm ? ' • min ' + m.minCbm : ''}
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:10px;font-size:12px">
        <b>Isi muatan:</b> ${raw.toFixed(2)} ${unit} terkumpul → chargeable ${chargeable.toFixed(2)} ${unit} • estimasi biaya <b>${fmt(est)}</b> • per ${unit} ${fmt(projPerCbm)}
      </div>
      <div><b style="font-size:12px">Koli di muatan</b><div>
        ${loaded.length ? loaded.map((k) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
          <span>🧾 ${escapeHtml(k.parcelNo)} • ${(k.cbm || 0).toFixed(2)} CBM</span>
          ${!m.departed ? `<button type="button" class="btn btn-ghost koli-unload" data-id="${k.id}" style="font-size:11px;padding:2px 8px">↩ Bongkar</button>` : `<span style="font-size:11px;color:#64748b">${(k.belanjaIds || []).length} belanja</span>`}
        </div>`).join('') : '<p style="font-size:12px;color:#64748b;margin:4px 0">Kosong — muat koli di bawah.</p>'}
      </div></div>
      ${!m.departed ? `<div><b style="font-size:12px">Koli menunggu</b><div>
        ${waiting.length ? waiting.map((k) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
          <span>🧾 ${escapeHtml(k.parcelNo)} • ${(k.cbm || 0).toFixed(2)} CBM</span>
          <button type="button" class="btn btn-ghost koli-load" data-id="${k.id}" style="font-size:11px;padding:2px 8px">＋ Muat</button>
        </div>`).join('') : '<p style="font-size:12px;color:#64748b;margin:4px 0">Semua koli sudah termuat (cek-in dulu di gudang China).</p>'}
      </div></div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${!m.departed ? `<button type="button" class="btn btn-primary muatan-depart" data-id="${m.id}">🚢 Tandai Berangkat</button>` : ''}
        ${m.departed && !m.allocated ? `<button type="button" class="btn btn-primary muatan-receive" data-id="${m.id}">📥 Tandai Tiba + Alokasi</button>` : ''}
        ${m.allocated ? '<span style="font-size:12px;color:#059669;font-weight:700">✔ Biaya sudah dialokasi</span>' : ''}
      </div>
      ${m.freightBilled ? `<div style="font-size:11px;color:#64748b">Ongkos dibill <b>${fmt(m.freightBilled)}</b>${m.departed ? ' • berangkat ' + escapeHtml(m.departed) : ''}</div>` : ''}
    </div>`;
    UI.openInfoModal(`🚢 Muatan ${m.code || m.id}`, html);
    document.querySelectorAll('.koli-load').forEach((el) => el.addEventListener('click', () => { try { loadKoli(muatanId, el.dataset.id); openMuatanDetailModal(muatanId); } catch (e) { UI.showError(e.message); } }));
    document.querySelectorAll('.koli-unload').forEach((el) => el.addEventListener('click', () => { try { unloadKoli(muatanId, el.dataset.id); openMuatanDetailModal(muatanId); } catch (e) { UI.showError(e.message); } }));
    document.querySelectorAll('.muatan-depart').forEach((el) => el.addEventListener('click', () => openDepartModal(el.dataset.id)));
    document.querySelectorAll('.muatan-receive').forEach((el) => el.addEventListener('click', () => openReceiveModal(el.dataset.id)));
  };
  render();
}

function openDepartModal(muatanId) {
  const m = getMuatanById(muatanId);
  const html = `<form id="mutDepartForm" style="display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:#64748b">Jurnal saat berangkat: <b>Dr Persediaan dalam Perjalanan (1211) / Cr kas atau hutang forwarder</b>. Ongkos = chargeable ${m.mode === 'air' ? 'kg' : 'CBM'} × tarif + biaya batch.</div>
    <label style="font-size:12px">Tanggal berangkat<br><input type="date" id="mutDepartDate" value="${new Date().toISOString().split('T')[0]}" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"></label>
    <label style="font-size:12px">Ongkos dibayar dengan<br><select id="mutDepartPay" style="width:100%;height:36px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px"><option value="cash">Tunai</option><option value="transfer">Bank BCA</option><option value="apputaran">Hutang forwarder</option></select></label>
    <button type="submit" class="btn btn-primary">🚢 Konfirmasi Berangkat</button>
  </form>`;
  UI.openInfoModal(`🚢 Berangkat ${m.code}`, html);
  document.getElementById('mutDepartForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const pay = document.getElementById('mutDepartPay').value;
      departMuatan(muatanId, { date: document.getElementById('mutDepartDate').value, payment: pay === 'apputaran' ? 'cash' : pay, delegateAp: pay === 'apputaran' });
      UI.closeInfoModal();
      UI.showSuccess(`Muatan berangkat — ongkos dibook ke Persediaan dalam Perjalanan`);
      renderMuatanPage();
      queueMirror();
    } catch (e) { UI.showError(e.message); }
  });
}

function openReceiveModal(muatanId) {
  const m = getMuatanById(muatanId);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const kolis = getKolis();
  const allKolis = kolis.filter((k) => (m.koliIds || []).includes(k.id) && !k.deferred);
  const arrivedIds = new Set(m.arrivedKoliIds || []);
  const nowKolis = allKolis.filter((k) => !arrivedIds.has(k.id));
  if (!nowKolis.length) { UI.showError('Semua koli sudah diterima'); return; }
  // PREVIEW alokasi (belum posting!)
  const alloc = allocateBatch(m, allKolis, { arrivedKoliIds: allKolis.filter((k) => arrivedIds.has(k.id) || nowKolis.includes(k)).map((k) => k.id), alreadyBilled: true });
  const rows = (alloc.lineAlloc || []).map((la) => {
    const qty = la.belanja.lines.reduce((s, l) => s + l.qty, 0);
    return `<tr>
      <td style="font-size:11px">${escapeHtml(la.belanja.no)} • ${escapeHtml(la.belanja.seller || '')}</td>
      <td class="amount-col">${fmt(la.landedTotal)}</td>
      <td class="amount-col" style="font-size:11px;color:#059669"><b>${fmt(Math.round(la.landedTotal / Math.max(qty, 1)))}/unit</b></td></tr>`;
  }).join('');
  const html = `<div style="display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:#64748b">Perkiraan biaya mendarat per belanja (alokasi: CBM share, residu ke koli terbesar). <b>Tidak menyimpan apa pun sebelum dikonfirmasi.</b></div>
    <div style="overflow-x:auto"><table class="report-table"><thead><tr><th>Belanja</th><th class="amount-col">Biaya mendarat</th><th class="amount-col">HPP/unit</th></tr></thead><tbody>${rows}</tbody></table></div>
    <label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="mutRcvAll" checked> Terima semua ${nowKolis.length} koli belum tiba (kosongkan untuk pilih manual selanjutnya)</label>
    <button type="button" class="btn btn-primary" id="mutRcvGo">📥 Konfirmasi tiba &amp; posting</button>
    <div style="font-size:11px;color:#64748b">Jurnal: Dr Persediaan (1105) / Cr Persediaan dalam Perjalanan (1211). Stok otomatis masuk untuk belanja bertanda produk.</div>
  </div>`;
  UI.openInfoModal(`📥 Tiba ${m.code}`, html);
  document.getElementById('mutRcvGo')?.addEventListener('click', () => {
    try {
      receiveMuatan(muatanId, { date: new Date().toISOString().split('T')[0], koliIds: null });
      UI.closeInfoModal();
      UI.showSuccess('Biaya mendarat diposting ke stok — Neraca tetap balance');
      renderMuatanPage();
      refresh();
      queueMirror();
    } catch (e) { UI.showError(e.message); }
  });
}

function openBelanjaRefundPrompt(belanjaId) {
  const b = getBelanjas().find((x) => x.id === belanjaId);
  if (!b) return;
  const amount = prompt(`Refund dari seller untuk ${b.no}.\nJumlah dalam ¥ (misal 20) dan kurs saat refund (misal 2250).\nFormat: jumlah;kurs`, `0;${b.kursAgen}`);
  if (!amount) return;
  const [cny, kr] = String(amount).split(';').map((x) => Number(x.trim()) || 0);
  try {
    refundBelanja(belanjaId, { amountCny: cny, kursRefund: kr || b.kursAgen });
    UI.showSuccess('Refund dicatat — selisih kurs masuk 5197');
    renderMuatanPage();
    refresh();
    queueMirror();
  } catch (e) { UI.showError(e.message); }
}

function fmtCnyLoc(v) { return '¥' + Math.round(Number(v) || 0).toLocaleString('id-ID'); }

  // 6.4 Menu ⋯ per baris pesanan
  document.getElementById('orderStatusList')?.addEventListener('click', (e) => {
    const more = e.target.closest('.order-more');
    if (!more) return;
    openOrderMoreMenu(more.dataset.kind, more.dataset.id);
  });
  document.getElementById('infoModalBody')?.addEventListener('click', (e) => {
    const pay = e.target.closest('.order-more-pay');
    const cost = e.target.closest('.order-more-cost');
    const stat = e.target.closest('.order-more-status');
    const del = e.target.closest('.order-more-del');
    const mut = e.target.closest('.order-more-muatan');
    if (pay) { UI.closeInfoModal(); if (pay.dataset.kind === 'po') openPoPay(pay.dataset.id); else openCreditPay(pay.dataset.id); return; }
    if (cost) { UI.closeInfoModal(); openPoCost(cost.dataset.id); return; }
    if (stat) { UI.closeInfoModal(); openOrderStatus(stat.dataset.kind, stat.dataset.id, ''); return; }
    if (del) { UI.closeInfoModal(); if (del.dataset.kind === 'po') orderDeletePrompt(del.dataset.id); else deleteCreditSalePrompt(del.dataset.id); return; }
    if (mut) { UI.closeInfoModal(); document.getElementById('muatanBtnSidebar')?.click(); return; }
  });
  document.getElementById('viewMuatan')?.addEventListener('click', (e) => {
  const del = e.target.closest('.belanja-refund');
  if (del) { openBelanjaRefundPrompt(del.dataset.id); return; }
  const koli = e.target.closest('.belanja-koli');
  if (koli) {
    openKoliModal();
    const sel = document.getElementById('koliBelanja');
    if (sel) Array.from(sel.options).forEach((o) => { if (o.value === koli.dataset.id) o.selected = true; });
    return;
  }
  const card = e.target.closest('[data-muatan]');
  if (card) openMuatanDetailModal(card.dataset.muatan);
});
document.getElementById('muatanBelanjaBtn')?.addEventListener('click', () => openBelanjaModal());
document.getElementById('muatanKoliBtn')?.addEventListener('click', () => openKoliModal());
document.getElementById('muatanBatchBtn')?.addEventListener('click', () => openMuatanCreateModal());

/* ===== Halaman Biaya ===== */

function renderBiayaPage() {
  if (!document.getElementById('viewBiaya')) return;
  const _pp = pagePeriodOpts();
  const entries = Reports.filterEntries(Storage.getAllEntries(), { period: _pp.period, startDate: _pp.startDate, endDate: _pp.endDate, type: 'expense' });
  const total = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const cats = (Reports.computeCategoryBreakdown(entries) || []).filter(c => c.type === 'expense').sort((a, b) => b.total - a.total);
  const kpi = document.getElementById('biayaKpi');
  if (kpi) {
    const tile = (label, value) => `<button type="button" style="cursor:default">${label}<b>${value}</b></button>`;
    kpi.innerHTML = tile('Total biaya', fmt(total)) + tile('Transaksi', entries.length) + tile('Kategori', cats.length) + tile('Terbesar', cats[0] ? escapeHtml(Reports.getCategoryLabel(cats[0].category)) : '—');
  }
  const sub = document.getElementById('biayaSubtitle');
  if (sub) sub.textContent = `${entries.length} transaksi biaya • total ${fmt(total)}`;
  const catBox = document.getElementById('biayaCats');
  if (catBox) {
    const max = Math.max(1, ...cats.map(c => c.total));
    catBox.innerHTML = cats.length ? cats.map(c => `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>${escapeHtml(Reports.getCategoryIcon?.(c.category) || '')} ${escapeHtml(Reports.getCategoryLabel(c.category))}</span><b>${fmt(c.total)}</b></div>
      <div style="height:6px;background:#f1f5f9;border-radius:9999px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${Math.round((c.total / max) * 100)}%;background:#f59e0b"></div></div>
    </div>`).join('') : '<p style="color:var(--text-muted);font-size:12px">Belum ada biaya pada periode ini.</p>';
  }
  const list = document.getElementById('biayaList');
  if (list) {
    const rows = entries.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 40);
    list.innerHTML = rows.length ? rows.map(e => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">
      <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.description || Reports.getCategoryLabel(e.category))}</div><div style="font-size:10px;color:#64748b">${escapeHtml(e.date)} • ${escapeHtml(Reports.getCategoryLabel(e.category))}${e.person ? ' • ' + escapeHtml(e.person) : ''}</div></div>
      <b style="font-size:12px;white-space:nowrap;color:#dc2626">−${fmt(e.amount)}</b></div>`).join('') : '<p style="color:var(--text-muted);font-size:12px">Belum ada transaksi biaya.</p>';
  }
}

function updateTableCount(filtered, total, shown) {
  const el = document.getElementById('tableCount');
  if (el) el.textContent = `Menampilkan ${shown} dari ${total} transaksi`;
}

function renderBudget(entries) {
  const card = document.getElementById('budgetCard');
  if (!card) return;
  const budget = Storage.getBudget();
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const limit = budget ? Number(budget.amount) || 0 : 0;
  const fill = document.getElementById('budgetFill');
  const spentEl = document.getElementById('budgetSpent');
  const limitEl = document.getElementById('budgetLimit');
  const hint = document.getElementById('budgetHint');
  if (!limit) {
    if (fill) fill.style.width = '0%';
    if (spentEl) spentEl.textContent = `Rp${expense.toLocaleString('id-ID')} terpakai`;
    if (limitEl) limitEl.textContent = 'Belum diatur';
    if (hint) hint.textContent = 'Atur anggaran di Pengaturan untuk melihat progress.';
    return;
  }
  const pct = Math.min(100, Math.round((expense / limit) * 100));
  if (fill) {
    fill.style.width = pct + '%';
    fill.classList.toggle('over', pct >= 90);
  }
  if (spentEl) spentEl.textContent = `Rp${expense.toLocaleString('id-ID')} terpakai`;
  if (limitEl) limitEl.textContent = `Limit: Rp${limit.toLocaleString('id-ID')} • ${pct}%`;
  if (hint) hint.textContent = pct >= 100 ? '⚠️ Melebihi anggaran!' : pct >= 80 ? 'Hampir mencapai limit' : 'Kelola pengeluaran dengan bijak';
  renderCategoryBudgets(entries);
}

function renderCategoryBudgets(entries) {
  const box = document.getElementById('budgetCats');
  if (!box) return;
  const limits = Storage.getCategoryBudgets();
  const cats = Object.keys(limits);
  if (!cats.length) { box.innerHTML = ''; return; }
  const fmt = (v) => 'Rp' + Number(v).toLocaleString('id-ID');
  box.innerHTML = cats.map(c => {
    const spent = entries.filter(e => e.type === 'expense' && e.category === c).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const lim = limits[c];
    const pct = lim > 0 ? Math.min(100, Math.round((spent / lim) * 100)) : 0;
    const over = spent > lim;
    let label = c;
    try { label = Reports.getCategoryLabel(c) || c; } catch {}
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-bottom:3px">
        <span>${escapeHtml(label)}</span>
        <span style="font-weight:600;color:${over ? '#ef4444' : '#0f172a'}">${fmt(spent)} / ${fmt(lim)}${over ? ' ⚠️' : ''}</span>
      </div>
      <div class="budget-bar" style="height:6px"><div class="budget-fill${over ? ' over' : ''}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderWallets() {
  const box = document.getElementById('walletList');
  if (!box) return;
  // Berbasis jurnal (bukan entry) supaya transfer antar kas ikut kehitung
  const r = journalDateRange();
  const bal = balances(Storage.getAllJournals(), r);
  const cashAccts = ACCOUNTS.filter(a => a.payment && a.type === 'asset');
  const rows = cashAccts
    .map(a => ({ code: a.code, net: (bal[a.code]?.debit || 0) - (bal[a.code]?.credit || 0) }))
    .filter(x => x.net !== 0);
  if (!rows.length) {
    box.innerHTML = '<span style="font-size:11px;color:#94a3b8">Belum ada transaksi</span>';
    return;
  }
  const fmt = (v) => (v < 0 ? '−Rp' : 'Rp') + Math.abs(Math.round(v)).toLocaleString('id-ID');
  rows.sort((a, b) => b.net - a.net);
  box.innerHTML = rows.map(x => {
    const acct = cashAccts.find(a => a.code === x.code) || {};
    const icon = (Reports.PAYMENT_OPTIONS || []).find(p => p.value === acct.payment)?.icon || '📦';
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px">
      <span>${icon}</span>
      <span style="flex:1">${acct.name || x.code}</span>
      <span style="font-weight:700;color:${x.net < 0 ? '#ef4444' : '#0f172a'}">${fmt(x.net)}</span>
    </div>`;
  }).join('');
}

function nextDueForLoan(l, paidCount) {
  return nextDue(l, paidCount);
}
function getLoanAlerts() {
  const loans = Storage.getAllLoans();
  const reps = Storage.getAllRepayments();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  loans.forEach(l => {
    if (l.status === 'paid') return;
    const paidCount = reps.filter(r => r.loanId === l.id).length;
    const due = nextDueForLoan(l, paidCount);
    if (!due || isNaN(due)) return;
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due - today) / 86400000);
    if (diffDays < 0) out.push({ loan: l, kind: 'overdue', diffDays, due, paidCount });
    else if (diffDays <= 3) out.push({ loan: l, kind: 'soon', diffDays, due, paidCount });
  });
  out.sort((a, b) => a.diffDays - b.diffDays);
  return out;
}
// Semua pengingat dalam satu tempat: pinjaman, stok, supplier, PPh
function pphPendingInfo() {
  if (new Date().getDate() > 15) return null;
  const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1);
  const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  let omzet = 0;
  try {
    Storage.getAllJournals().forEach(j => {
      if (String(j.date || '').slice(0, 7) !== key) return;
      (j.lines || []).forEach(l => {
        if (l.account === '4101') omzet += (Number(l.credit) || 0) - (Number(l.debit) || 0);
      });
    });
  } catch {}
  return omzet > 0 ? { key, pph: Math.round(omzet * 0.005) } : null;
}
function getAllAlerts() {
  const out = [];
  getLoanAlerts().forEach(a => out.push({
    type: 'loan', target: 'loans', icon: a.kind === 'overdue' ? '🔴' : '🟡',
    text: `Pinjaman ${a.loan.person || '—'} ${a.diffDays < 0 ? `terlambat ${Math.abs(a.diffDays)} hari` : (a.diffDays === 0 ? 'jatuh tempo hari ini' : `jatuh tempo H-${a.diffDays}`)}`
  }));
  let low = [];
  try { low = Storage.getAllItems().filter(i => (i.minStock || 0) > 0 && i.stock <= i.minStock); } catch {}
  if (low.length) out.push({
    type: 'stock', target: 'stock', icon: '📦',
    text: `Stok menipis: ${low.slice(0, 3).map(i => i.name).join(', ')}${low.length > 3 ? ` +${low.length - 3} lagi` : ''}`
  });
  let sup = [];
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    sup = Storage.getAllPurchases().filter(p => p.status !== 'paid' && p.dueDate && Storage.purchaseOutstanding(p) > 0.01 && new Date(p.dueDate + 'T00:00:00') < today);
  } catch {}
  if (sup.length) out.push({ type: 'supplier', target: 'stock', icon: '📥', text: `${sup.length} pembelian supplier lewat jatuh tempo — cek Stok → Hutang ke Supplier` });
  const pph = pphPendingInfo();
  if (pph) out.push({ type: 'pph', target: 'tax', icon: '🧾', text: `PPh Final ${pph.key}: Rp${pph.pph.toLocaleString('id-ID')} — bayar sebelum tgl 15 (Laporan — Pajak)` });
  // Titip beli & alur pesanan: barang lewat estimasi atau harus di-tagih
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const pos = (Storage.getPreorders() || []).filter(po => po.stage !== 'settled');
    const lateEta = pos.filter(po => /^\d{4}-\d{2}-\d{2}$/.test(po.eta || '') && new Date(po.eta + 'T00:00:00') < today);
    const noDp = pos.filter(po => po.stage === 'ordered' && Storage.preorderPaidTotal(po) <= 0.01);
    const arrived = pos.filter(po => po.stage === 'arrived' && Storage.preorderBalance(po) > 0.01);
    if (noDp.length) out.push({ type: 'preorder', target: 'sales', icon: '⚠️', text: `${noDp.length} titip beli belum DP — terima DP dulu (Penjualan -- Titip Beli)` });
    if (lateEta.length) out.push({ type: 'preorder', target: 'sales', icon: '🌏', text: `${lateEta.length} titip beli lewat estimasi datang ${lateEta.map(po => po.no).slice(0, 3).join(', ')}` });
    if (arrived.length) out.push({ type: 'preorder', target: 'sales', icon: '💰', text: `${arrived.length} titip beli barang sudah sampai — tagih pelanggan` });
    const orders = (Storage.getCreditSales() || []).filter(cs => cs.flow === 'order' && cs.stage && cs.stage !== 'done');
    const lateShip = orders.filter(cs => cs.stage === 'ordered' && cs.dueDate && new Date(cs.dueDate + 'T00:00:00') < today);
    const toBill = orders.filter(cs => cs.stage === 'delivered' && Storage.creditOutstanding(cs) > 0.01);
    if (lateShip.length) out.push({ type: 'order', target: 'sales', icon: '🚚', text: `${lateShip.length} pesanan belum dikirim sampai jatuh tempo (Penjualan -- Pemeriksaan Pengiriman)` });
    if (toBill.length) out.push({ type: 'order', target: 'sales', icon: '💰', text: `${toBill.length} pesanan sudah diterima pelanggan — tagih pelunasan` });
  } catch {}
  return out;
}
function updateNotifBadge() {
  const badge = document.querySelector('#notifBtn .notif-badge');
  if (!badge) return;
  const alerts = getAllAlerts();
  badge.textContent = String(alerts.length);
  badge.style.display = alerts.length ? 'flex' : 'none';
  const btn = document.getElementById('notifBtn');
  if (btn) btn.setAttribute('aria-label', alerts.length ? `${alerts.length} pengingat` : 'Tidak ada pengingat');
}
let overdueNotified = false;
function checkOverdue() {
  updateNotifBadge();
  if (overdueNotified) return;
  const setting = document.getElementById('settingNotif');
  const enabled = setting ? setting.checked : true;
  const stored = safeLocalGet('wynara_notif');
  const isEnabled = stored ? stored === 'true' : enabled;
  if (!isEnabled) return;
  const alerts = getLoanAlerts();
  if (alerts.length) {
    overdueNotified = true;
    const over = alerts.filter(a => a.kind === 'overdue').length;
    const soon = alerts.length - over;
    UI.showWarning(over ? `${over} pinjaman terlambat${soon ? `, ${soon} jatuh tempo ≤3 hari` : ''}! Cek menu Pinjaman.` : `${soon} pinjaman jatuh tempo ≤3 hari. Cek menu Pinjaman.`);
  }
  checkPPhReminder();
  checkStockAlert();
}

let stockNotified = false;
function checkStockAlert() {
  if (stockNotified) return;
  let low = [];
  try {
    low = Storage.getAllItems().filter(i => (i.minStock || 0) > 0 && i.stock <= i.minStock);
  } catch {}
  if (low.length) {
    stockNotified = true;
    const names = low.slice(0, 3).map(i => i.name).join(', ');
    UI.showWarning(`Stok menipis: ${names}${low.length > 3 ? ` +${low.length - 3} lagi` : ''}. Cek menu Stok.`);
  }
}

let pphNotified = false;
function checkPPhReminder() {
  if (pphNotified) return;
  const now = new Date();
  if (now.getDate() > 15) return; // lewat tenggat bulan ini
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  let omzet = 0;
  try {
    Storage.getAllJournals().forEach(j => {
      if (String(j.date || '').slice(0, 7) !== key) return;
      (j.lines || []).forEach(l => {
        if (l.account === '4101') omzet += (Number(l.credit) || 0) - (Number(l.debit) || 0);
      });
    });
  } catch {}
  if (omzet > 0) {
    pphNotified = true;
    const pph = Math.round(omzet * 0.005);
    UI.showWarning(`PPh Final bulan lalu Rp${pph.toLocaleString('id-ID')} — bayar sebelum tgl 15. Lihat Laporan → Pajak.`);
  }
}

function renderFullTransaksi() {
  const tbody = document.getElementById('transaksiBody');
  const empty = document.getElementById('transaksiEmpty');
  const countEl = document.getElementById('transaksiCount');
  const saldoEl = document.getElementById('transaksiSaldo');
  const pagerNum = document.getElementById('transaksiPagerNum');
  const prevBtn = document.getElementById('transaksiPrev');
  const nextBtn = document.getElementById('transaksiNext');
  const subtitle = document.getElementById('transaksiSubtitle');
  const kategoriSel = document.getElementById('transaksiFilterKategori');
  if (!tbody) return;
  if (kategoriSel && kategoriSel.options.length <= 1) {
    const cats = Storage.getCategories();
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = Reports.getCategoryLabel(c);
      kategoriSel.appendChild(opt);
    });
  }
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  const searchTerm = (document.getElementById('transaksiSearch')?.value || UI.getSearchTerm() || '').trim().toLowerCase();
  const searchFiltered = searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm))
      )
    : filtered;
  const withBalance = Reports.computeRunningBalance(searchFiltered);
  const sorted = sortEntries(withBalance);
  const totals = Reports.computeTotals(searchFiltered);
  if (subtitle) subtitle.textContent = `${searchFiltered.length} transaksi • Total ${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(totals.net)} saldo`;
  if (saldoEl) saldoEl.textContent = `Total saldo: ${Reports.formatCurrency(totals.net)}`;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  if (transaksiPage > totalPages) transaksiPage = totalPages;
  if (transaksiPage < 1) transaksiPage = 1;
  const pageData = sorted.slice((transaksiPage - 1) * pageSize, transaksiPage * pageSize);
  if (!pageData.length) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (countEl) countEl.textContent = `Menampilkan 0 dari ${sorted.length} transaksi`;
    if (pagerNum) pagerNum.textContent = '1';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }
  if (empty) empty.classList.add('hidden');
  tbody.innerHTML = pageData.map(e => {
    const isIncome = e.type === 'income';
    const sign = isIncome ? '+' : '-';
    const amt = Reports.formatCurrency(Number(e.amount)||0).replace(/\s/g,'');
    const kategori = Reports.getCategoryLabel(e.category);
    const ikon = Reports.getCategoryIcon(e.category);
    const kontak = e.person ? escapeHtml(e.person) : '—';
    const cara = `${Reports.getPaymentIcon(e.payment)} ${Reports.getPaymentLabel(e.payment)}${e.paymentDetail ? ' • ' + escapeHtml(e.paymentDetail) : ''}`;
    const acctCode = e.loanId ? '1201' : (e.type === 'income' ? REVENUE_ACCOUNT : expenseAccountFor(e.category));
    const acctName = (getAccounts().find(a => a.code === acctCode) || {}).name || '';
    return `<tr style="border-bottom:1px solid #f8fafc">
      <td style="padding:12px;white-space:nowrap;font-size:13px">${Reports.formatDate(e.date)}</td>
      <td style="padding:12px"><span style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:9999px;background:#f1f5f9;font-size:12px">${ikon} ${escapeHtml(kategori)}</span></td>
      <td style="padding:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.description||'')}">${escapeHtml(e.description||'-')}</td>
      <td style="padding:12px;white-space:nowrap" title="${escapeHtml(acctCode + ' ' + acctName)}"><span style="font-family:monospace;font-size:11px;color:#475569">${acctCode}</span> <span style="color:var(--text-muted);font-size:11px">${escapeHtml(acctName)}</span></td>
      <td style="padding:12px;white-space:nowrap;font-size:13px">${kontak}</td>
      <td style="padding:12px;white-space:nowrap;font-size:12px"><span style="background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:9999px">${cara}</span></td>
      <td style="padding:12px"><span style="background:${isIncome?'#ecfdf5':'#fff1f2'};color:${isIncome?'#047857':'#be123c'};padding:2px 8px;border-radius:9999px;font-size:11px">${isIncome?'📥 Masuk':'📤 Keluar'}</span></td>
      <td style="padding:12px;text-align:right;white-space:nowrap;font-weight:700;color:${isIncome?'#059669':'#dc2626'};font-family:monospace">${sign} ${amt}</td>
      <td style="padding:12px;text-align:right;white-space:nowrap">
        <button class="btn btn-ghost" onclick="document.dispatchEvent(new CustomEvent('wynara:edit',{detail:'${e.id}'}))" style="padding:2px 6px;font-size:12px">✎</button>
        <button class="btn btn-ghost" onclick="document.dispatchEvent(new CustomEvent('wynara:receipt',{detail:'${e.id}'}))" style="padding:2px 6px;font-size:12px" title="Kwitansi">🧾</button>
        <button class="btn btn-danger" onclick="document.dispatchEvent(new CustomEvent('wynara:delete',{detail:'${e.id}'}))" style="padding:2px 6px;font-size:12px">🗑</button>
      </td>
    </tr>`;
  }).join('');
  if (countEl) countEl.textContent = `Menampilkan ${pageData.length} dari ${sorted.length} transaksi`;
  if (pagerNum) pagerNum.textContent = String(transaksiPage);
  if (prevBtn) prevBtn.disabled = transaksiPage <= 1;
  if (nextBtn) nextBtn.disabled = transaksiPage >= totalPages;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function computeReportData(type) {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  switch (type) {
    case 'category':
      return Reports.computeCategoryBreakdown(filtered);
    case 'cashflow':
      return Reports.computeCashflow(filtered);
    case 'top-expenses':
      return Reports.computeTopExpenses(filtered);
    case 'journal':
      return journalInRange();
    case 'ledger':
      return ledgerDrillData();
    case 'pl':
      return buildProfitLoss();
    case 'bs':
      return buildBalanceSheet();
    case 'tax':
      return buildTaxReport();
    case 'audit':
      return Storage.getAudit().slice(0, 100);
    case 'payrollrep':
      return buildPayrollReport();
    case 'products':
      return buildProductsReport();
    case 'grossprofit':
      return buildGrossProfitReport();
    case 'pengeluaran':
      return buildExpenseReport();
    case 'trial':
      return buildTrialBalance();
    case 'ppn':
      return buildPPNReport();
    case 'pph21':
      return buildPPh21Report();
    case 'pph23':
      return buildPPh23Report();
    default:
      return Reports.computeMonthlySummary(filtered);
  }
}

// Neraca Saldo — alat kerja utama akuntan (saldo debit/kredit per akun, cek seimbang)
function buildTrialBalance() {
  const journals = Storage.getAllJournals();
  const drill = journalDateRange();
  const inRange = (r) => (!drill.start || String(r.date) >= drill.start) && (!drill.end || String(r.date) <= drill.end);
  const lines = {};
  try {
    journals.filter(inRange).forEach(j => {
      (j.lines || []).forEach(l => {
        if (!l || !l.account) return;
        if (!lines[l.account]) lines[l.account] = [];
        lines[l.account].push({ date: j.date, memo: j.memo || j.description || 'Jurnal', debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 });
      });
    });
  } catch {}
  const rangeJournals = journals.filter(inRange);
  const bal = balances(rangeJournals.length ? rangeJournals : journals, drill.start || drill.end ? drill : {});
  const accounts = getAccounts().map(a => ({ code: a.code, name: a.name, type: a.type, b: bal[a.code] || { debit: 0, credit: 0 } }));
  const totDeb = accounts.reduce((s, x) => s + x.b.debit, 0);
  const totCred = accounts.reduce((s, x) => s + x.b.credit, 0);
  let unbalanced = [];
  try { unbalanced = findUnbalanced(journals); } catch {}
  let locked = [];
  try { locked = Storage.getLockedMonths(); } catch {}
  return { rows: accounts, debit: totDeb, credit: totCred, diff: totDeb - totCred, balanced: Math.abs(totDeb - totCred) < 0.005, unbalanced, locked, lines, rangeLabel: drill.start && drill.end ? `${drill.start} — ${drill.end}` : 'Semua akun' };
}

// Laporan PPN bulanan (gaya 1111): PPN Keluaran (2105) vs Masukan (1401)
function buildPPNReport() {
  const by = {};
  const KEY = { '2105': 'keluaran', '1401': 'masukan' };
  let totK = 0, totM = 0;
  Storage.getAllJournals().forEach(j => {
    const m = String(j.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!by[m]) by[m] = { month: m, keluarPPN: 0, keluarDPP: 0, masukPPN: 0, masukDPP: 0 };
    (j.lines || []).forEach(l => {
      const t = KEY[l.account];
      const deb = Number(l.debit) || 0, cr = Number(l.credit) || 0;
      const RATE = Storage.getPpn().rate;
      if (t === 'keluaran' && cr > 0) { by[m].keluarPPN += cr - deb; by[m].keluarDPP += (cr - deb) / RATE; }
      if (t === 'masukan' && deb > 0) { by[m].masukPPN += deb - cr; by[m].masukDPP += (deb - cr) / RATE; }
    });
  });
  const months = Object.values(by).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({
    ...x, keluarPPN: Math.round(x.keluarPPN), keluarDPP: Math.round(x.keluarDPP), masukPPN: Math.round(x.masukPPN), masukDPP: Math.round(x.masukDPP),
    net: Math.round(x.keluarPPN - x.masukPPN)
  }));
  totK = months.reduce((s, x) => s + x.keluarPPN, 0);
  totM = months.reduce((s, x) => s + x.masukPPN, 0);
  return { months, totalKeluar: totK, totalMasuk: totM, net: totK - totM, year: new Date().getFullYear() };
}

// Rekap PPh 21 per bulan (untuk e-SPT 21) — dari data gaji yang difinalisasi
function buildPPh21Report() {
  const by = {};
  Storage.getAllEntries().forEach(e => {
    if (e.category !== 'gaji-out') return;
    const m = String(e.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!by[m]) by[m] = { month: m, thp: 0, pph: 0, count: 0 };
    const p = e.payroll || {};
    by[m].thp += Math.round(Number(e.amount) || 0);
    by[m].pph += Math.round(Number(p.ded && p.ded.pph21) || 0);
    by[m].count += 1;
  });
  const rows = Object.values(by).sort((a, b) => b.month.localeCompare(a.month));
  const totalPph = rows.reduce((s, x) => s + x.pph, 0);
  const totalThp = rows.reduce((s, x) => s + x.thp, 0);
  return { rows, totalPph, totalThp, year: new Date().getFullYear() };
}

// Rekap PPh 23 / 4(2) per bulan (akun 2107)
function buildPPh23Report() {
  const by = {};
  Storage.getAllJournals().forEach(j => {
    const m = String(j.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!by[m]) by[m] = { month: m, dipotong: 0, disetor: 0 };
    (j.lines || []).forEach(l => {
      if (l.account !== '2104') return;
      by[m].dipotong += Number(l.credit) || 0;
      by[m].disetor += Number(l.debit) || 0;
    });
  });
  const months = Object.values(by).sort((a, b) => a.month.localeCompare(b.month))
    .map(x => ({ ...x, dipotong: Math.round(x.dipotong), disetor: Math.round(x.disetor), net: Math.round(x.dipotong - x.disetor) }));
  const totalDipotong = months.reduce((s, x) => s + x.dipotong, 0);
  const totalDisetor = months.reduce((s, x) => s + x.disetor, 0);
  return { months, totalDipotong, totalDisetor, outstanding: totalDipotong - totalDisetor, year: new Date().getFullYear() };
}

// Laporan produk terlaris — dari entri penjualan (sale.lines)
let expenseCatFilter = 'all';
let expensePersonFilter = 'all';
// Laporan Pengeluaran vs Anggaran — dari budget + entri pengeluaran periode aktif
function buildExpenseReport() {
  const all = Reports.filterEntries(Storage.getAllEntries(), currentFilters).filter(e => e.type === 'expense');
  const budget = Storage.getBudget();
  const catLimits = Storage.getCategoryBudgets() || {};
  const budgetTotal = budget ? Number(budget.amount) || 0 : 0;
  const byCat = {};
  all.forEach(e => {
    const c = e.category || 'lainnya';
    if (!byCat[c]) byCat[c] = 0;
    byCat[c] += Number(e.amount) || 0;
  });
  const persons = [...new Set(all.map(e => (e.person || '').trim()).filter(Boolean))].sort();
  const cats = [...new Set([...Object.keys(byCat), ...Object.keys(catLimits)])];
  const rows = cats.map(c => {
    let label = c, icon = '';
    try { label = Reports.getCategoryLabel(c) || c; icon = Reports.getCategoryIcon(c) || ''; } catch {}
    const spent = Math.round(byCat[c] || 0);
    const limit = Math.round(Number(catLimits[c]) || 0);
    return { category: c, label, icon, budget: limit, spent, diff: limit - spent };
  }).sort((a, b) => b.spent - a.spent);
  const fCat = expenseCatFilter, fPer = expensePersonFilter;
  const fRows = rows.filter(r => (fCat === 'all' || r.category === fCat));
  const fAll = all.filter(e => (fCat === 'all' || (e.category || 'lainnya') === fCat) && (fPer === 'all' || (e.person || '').trim() === fPer));
  const spentTotal = Math.round(fAll.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const recent = fAll.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 5).map(e => {
    let label = e.category || 'lainnya', icon = '';
    try { label = Reports.getCategoryLabel(e.category) || label; icon = Reports.getCategoryIcon(e.category) || ''; } catch {}
    return { date: e.date, description: e.description || '-', category: e.category, label, icon, person: (e.person || '').trim(), payment: e.payment || '', amount: Math.round(Number(e.amount) || 0) };
  });
  const compMax = Math.max(1, ...fRows.map(r => r.spent));
  return { budgetTotal: Math.round(budgetTotal), spentTotal, remaining: Math.round(budgetTotal - spentTotal), rows: fRows, compMax, recent, persons, cats, fCat, fPer };
}
function buildProductsReport() {
  const byItem = {};
  const itemById = {};
  try { Storage.getAllItems().forEach(i => { itemById[i.id] = i; }); } catch {}
  try {
    Reports.filterEntries(Storage.getAllEntries(), currentFilters).forEach(e => {
      if (e.category !== 'jualan' || !e.sale || !Array.isArray(e.sale.lines)) return;
      const lines = e.sale.lines;
      const sub = lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
      const disc = Math.min(Math.max(Number(e.sale.discount) || 0, 0), sub);
      const factor = sub > 0 ? (sub - disc) / sub : 1;
      lines.forEach(l => {
        const qty = Number(l.qty) || 0;
        if (!qty) return;
        const it = itemById[l.itemId] || {};
        // HPP pakai modal yang dibekukan saat penjualan (fallback ke modal rata-rata sekarang).
        const cost = (l.avgCost != null) ? Number(l.avgCost) || 0 : Number(it.cost) || 0;
        if (!byItem[l.itemId]) byItem[l.itemId] = { name: l.name || it.name || '(barang terhapus)', qty: 0, omzet: 0, hpp: 0 };
        byItem[l.itemId].qty += qty;
        byItem[l.itemId].omzet += (Number(l.price) || 0) * qty * factor;
        byItem[l.itemId].hpp += cost * qty;
      });
    });
  } catch {}
  // Net retur periode berjalan
  periodReturns(currentFilters).forEach(r => (r.lines || []).forEach(l => {
    const it = itemById[l.itemId] || {};
    if (!byItem[l.itemId]) byItem[l.itemId] = { name: l.name || it.name || '(barang terhapus)', qty: 0, omzet: 0, hpp: 0 };
    byItem[l.itemId].qty -= Number(l.qty) || 0;
    byItem[l.itemId].omzet -= (Number(l.price) || 0) * (Number(l.qty) || 0);
    byItem[l.itemId].hpp -= (Number(l.cost) || 0) * (Number(l.qty) || 0);
  }));
  const total = Object.values(byItem).reduce((s, x) => s + x.omzet, 0);
  const totalQty = Object.values(byItem).reduce((s, x) => s + x.qty, 0);
  const totalHpp = Object.values(byItem).reduce((s, x) => s + x.hpp, 0);
  const rows = Object.keys(byItem).filter(id => byItem[id].qty !== 0 || byItem[id].omzet !== 0).map(id => {
    const x = byItem[id];
    const margin = x.omzet - x.hpp;
    return { name: x.name, qty: x.qty, omzet: x.omzet, hpp: x.hpp, margin, marginPct: x.omzet > 0 ? (margin / x.omzet) * 100 : 0, share: total > 0 ? (x.omzet / total) * 100 : 0 };
  }).sort((a, b) => b.omzet - a.omzet);
  return { rows, total, totalQty, totalHpp };
}

// Laba kotor per bulan: omzet − HPP (modal dibekukan saat penjualan).
function buildGrossProfitReport() {
  const items = {};
  try { Storage.getAllItems().forEach(i => { items[i.id] = i; }); } catch {}
  const byMonth = {};
  Reports.filterEntries(Storage.getAllEntries(), currentFilters).forEach(e => {
    if (e.category !== 'jualan') return;
    const m = String(e.date || '').slice(0, 7);
    if (!m) return;
    if (!byMonth[m]) byMonth[m] = { month: m, omzet: 0, hpp: 0, orders: 0 };
    byMonth[m].omzet += Number(e.amount) || 0;
    byMonth[m].orders += 1;
    (e.sale && Array.isArray(e.sale.lines) ? e.sale.lines : []).forEach(l => {
      const it = items[l.itemId] || {};
      const cost = (l.avgCost != null) ? Number(l.avgCost) || 0 : Number(it.cost) || 0;
      byMonth[m].hpp += cost * (Number(l.qty) || 0);
    });
  });
  // Net retur per bulan.
  periodReturns(currentFilters).forEach(r => {
    const m = String(r.date || '').slice(0, 7);
    if (!m) return;
    if (!byMonth[m]) byMonth[m] = { month: m, omzet: 0, hpp: 0, orders: 0 };
    byMonth[m].omzet -= Number(r.refund) || 0;
    byMonth[m].hpp -= Number(r.costBack) || 0;
  });
  const rows = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({
    ...x, laba: x.omzet - x.hpp, marginPct: x.omzet > 0 ? ((x.omzet - x.hpp) / x.omzet) * 100 : 0,
  }));
  const total = rows.reduce((s, x) => ({ omzet: s.omzet + x.omzet, hpp: s.hpp + x.hpp, laba: s.laba + x.laba, orders: s.orders + x.orders }), { omzet: 0, hpp: 0, laba: 0, orders: 0 });
  return { rows, ...total };
}

function renderReport() {
  UI.renderReport(currentReportType, computeReportData(currentReportType));
}
let pageReportPeriodUi = 'all';
function renderPageReport() {
  if (!document.getElementById('pageReportContent')) return;
  const tab = document.querySelector('.page-report-tab.selected')?.dataset.report || currentReportType;
  // Select periode mengikuti filter aktif (dashboard atau dropdown halaman)
  if (['all', 'this-month', 'last-month', 'this-year'].includes(currentFilters.period)) pageReportPeriodUi = currentFilters.period;
  const periodSel = document.getElementById('pageReportPeriod');
  if (periodSel && [...periodSel.options].some(o => o.value === pageReportPeriodUi)) periodSel.value = pageReportPeriodUi;
  // Search hanya relevan di Jurnal & Buku Besar — reset saat pindah tab lain
  const searchInp = document.getElementById('reportSearchInput');
  if (searchInp) {
    searchInp.hidden = !(tab === 'journal' || tab === 'ledger');
    if (searchInp.hidden && UI.getReportSearch()) { UI.setReportSearch(''); searchInp.value = ''; }
  }
  UI.renderReportPage(currentReportType, computeReportData(currentReportType));
  renderPageHealth();
}
// Kertas kerja ringkas: sekilas keadaan (jurnal pincang, penutupan terakhir, kunci)
function renderPageHealth() {
  const box = document.getElementById('pageReportHealth');
  if (!box) return;
  const t = buildTrialBalance();
  const lastCloseDate = (Storage.getAllJournals().filter(j => (j.ref || '') === 'closing').map(j => j.date).sort().pop()) || '';
  let closeText = 'belum ada penutupan (opsional)';
  let closeColor = '#94a3b8';
  if (lastCloseDate) {
    const [y, m] = String(lastCloseDate).split('-').map(Number);
    closeText = `🔒 penutupan terakhir ${new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`;
    closeColor = '#2563eb';
  }
  const chips = [
    t.unbalanced.length === 0 ? '<span style="color:#059669;font-weight:600">✓ jurnal lengkap</span>' : `<span style="color:#b91c1c;font-weight:600">⚠ ${t.unbalanced.length} jurnal pincang</span>`,
    t.balanced ? '<span style="color:#059669;font-weight:600">✓ neraca saldo seimbang</span>' : `<span style="color:#b91c1c;font-weight:600">⚠ selisih Rp${Math.abs(Math.round(t.diff)).toLocaleString('id-ID')}</span>`,
    `<span style="color:${closeColor};font-weight:600">${closeText}</span>`,
    t.locked.length ? `<span style="color:#64748b">🔒 ${t.locked.length} bulan terkunci</span>` : '<span style="color:#94a3b8">tidak ada periode terkunci</span>'
  ];
  box.innerHTML = chips.map(c => `<span class="chip" style="font-size:11px;margin:0 6px 6px 0">${c}</span>`).join('');
}

// Rentang tanggal dari filter periode aktif (untuk jurnal & buku besar)
function journalDateRange() {
  const p = currentFilters.period;
  const now = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (p === 'this-month') return { start: iso(new Date(now.getFullYear(), now.getMonth(), 1)), end: iso(now) };
  if (p === 'last-month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: iso(s), end: iso(e) };
  }
  if (p === 'this-year') return { start: `${now.getFullYear()}-01-01`, end: iso(now) };
  if (p === 'custom' && (currentFilters.startDate || currentFilters.endDate)) {
    return { start: currentFilters.startDate || '0000-01-01', end: currentFilters.endDate || '9999-12-31' };
  }
  return {};
}

function journalInRange() {
  const r = journalDateRange();
  return Storage.getAllJournals().filter(j => {
    if (r.start && String(j.date || '') < r.start) return false;
    if (r.end && String(j.date || '') > r.end) return false;
    return true;
  });
}

// Drill-down: balances + jurnal mentah periode yang sama (untuk ekspansi per akun)
function ledgerDrillData() {
  const journals = journalInRange();
  const lines = {};
  journals.forEach(j => {
    (j.lines || []).forEach(l => {
      if (!l || !l.account) return;
      if (!lines[l.account]) lines[l.account] = [];
      lines[l.account].push({ date: j.date, memo: j.memo || journalMemoOf(j), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 });
    });
  });
  return { bal: balances(journals), journals, lines };
}
function journalMemoOf(j) { return j.description || j.note || j.memo || 'Jurnal'; }

function addDaysStr(ymd, n) {
  const d = new Date(ymd + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plNumbers(bal) {
  const sum = (codes) => codes.reduce((s, c) => s + ((bal[c]?.credit || 0) - (bal[c]?.debit || 0)), 0);
  const exp = (codes) => codes.reduce((s, c) => s + ((bal[c]?.debit || 0) - (bal[c]?.credit || 0)), 0);
  const revCodes = ACCOUNTS.filter(a => a.type === 'revenue').map(a => a.code);
  const expCodes = ACCOUNTS.filter(a => a.type === 'expense').map(a => a.code);
  const revenue = sum(revCodes);
  const expenses = expCodes.map(c => ({ code: c, total: exp([c]) })).filter(x => x.total !== 0);
  const totalExp = expenses.reduce((s, x) => s + x.total, 0);
  return { revenue, expenses, totalExp, net: revenue - totalExp };
}

function buildProfitLoss() {
  const range = journalDateRange();
  const cur = plNumbers(balances(journalInRange()));
  // Periode sebelumnya sepanjang yang sama (kolom banding investor)
  let prev = null;
  if (range.start && range.end) {
    const s = range.start <= range.end ? range.start : range.end;
    const e = range.start <= range.end ? range.end : range.start;
    const span = Math.max(Math.round((new Date(e) - new Date(s)) / 86400000) + 1, 1);
    prev = plNumbers(balances(Storage.getAllJournals(), { start: addDaysStr(s, -span), end: addDaysStr(s, -1) }));
  }
  // Anggaran vs realisasi (bulan berjalan)
  const now = new Date();
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExp = currentEntries.filter(x => x.type === 'expense' && String(x.date || '').slice(0, 7) === mk);
  const spent = monthExp.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const budget = Storage.getBudget();
  const catLimits = Storage.getCategoryBudgets();
  const cats = Object.keys(catLimits).map(c => {
    const cs = monthExp.filter(x => x.category === c).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    let label = c;
    try { label = Reports.getCategoryLabel(c) || c; } catch {}
    return { label, limit: catLimits[c], spent: cs };
  });
  return { ...cur, prev, range, budget: { limit: budget ? Number(budget.amount) || 0 : 0, spent, cats } };
}

function bsSnapshot(bal) {
  const all = getAccounts();
  const assetCodes = all.filter(a => a.type === 'asset').map(a => a.code);
  const liabCodes = all.filter(a => a.type === 'liability').map(a => a.code);
  const netOf = (codes, normal) => codes.map(c => {
    const b = bal[c] || { debit: 0, credit: 0 };
    const net = normal === 'debit' ? b.debit - b.credit : b.credit - b.debit;
    return { code: c, total: net };
  }).filter(x => x.total !== 0);
  const assets = netOf(assetCodes, 'debit');
  const liabs = netOf(liabCodes, 'credit');
  const totalA = assets.reduce((s, x) => s + x.total, 0);
  const totalL = liabs.reduce((s, x) => s + x.total, 0);
  const eq = Storage.getOpeningEquity();
  const modal = eq ? Number(eq.amount) || 0 : 0;
  // Laba ditahan = total pendapatan − total beban (kumulatif s/d tanggal neraca)
  const revCodes = ACCOUNTS.filter(a => a.type === 'revenue').map(a => a.code);
  const rev = revCodes.reduce((s, c) => s + ((bal[c]?.credit || 0) - (bal[c]?.debit || 0)), 0);
  const expCodes = ACCOUNTS.filter(a => a.type === 'expense').map(a => a.code);
  const exp = expCodes.reduce((s, c) => s + ((bal[c]?.debit || 0) - (bal[c]?.credit || 0)), 0);
  const laba = rev - exp;
  return { assets, liabs, totalA, totalL, modal, laba, equity: modal + laba, balanced: totalA - (totalL + modal + laba) };
}

function buildBalanceSheet() {
  const range = journalDateRange();
  const journals = Storage.getAllJournals();
  const cur = bsSnapshot(balances(journals, range.end ? { end: range.end } : {}));
  // Pembanding = posisi sehari sebelum periode berjalan (saldo awal)
  let prev = null;
  let prevLabel = '';
  if (range.start) {
    const s = range.start <= (range.end || range.start) ? range.start : (range.end || range.start);
    const before = addDaysStr(s, -1);
    prev = bsSnapshot(balances(journals, { end: before }));
    prevLabel = `per ${before.slice(8, 10)}/${before.slice(5, 7)}/${before.slice(0, 4)}`;
  }
  return { ...cur, prev, prevLabel, range };
}

function buildTaxReport() {
  const journals = Storage.getAllJournals();
  const byMonth = {};
  journals.forEach(j => {
    const m = String(j.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!byMonth[m]) byMonth[m] = { month: m, omzet: 0 };
    (j.lines || []).forEach(l => {
      if (l.account === '4101') byMonth[m].omzet += (Number(l.credit) || 0) - (Number(l.debit) || 0);
    });
  });
  const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({
    ...x,
    omzet: Math.max(Math.round(x.omzet), 0),
    pph: Math.round(Math.max(x.omzet, 0) * 0.005)
  }));
  const year = new Date().getFullYear();
  const omzetYear = months.filter(m => m.month.startsWith(String(year))).reduce((s, m) => s + m.omzet, 0);
  const pf = pphFinalForYear(omzetYear);
  const bal = balances(journals);
  const ppnOut = (bal['2105']?.credit || 0) - (bal['2105']?.debit || 0);
  const ppnIn = (bal['1401']?.debit || 0) - (bal['1401']?.credit || 0);
  return { months: months.slice(-12), omzetYear, pphYear: pf.pph, pphEligible: pf.eligible, ppnOut, ppnIn, ppnNet: ppnOut - ppnIn, year };
}

function buildPayrollReport() {
  const months = {};
  Storage.getAllEntries().forEach(e => {
    if (e.category !== 'gaji-out') return;
    const m = String(e.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    if (!months[m]) months[m] = { month: m, thp: 0, gross: 0, thr: 0, dedEmp: 0, comp: 0, pph: 0, count: 0 };
    const p = e.payroll || {};
    const d = p.ded || {};
    months[m].thp += Math.round(Number(e.amount) || 0);
    months[m].gross += Math.round(Number(p.base || 0) + Number(p.allow || 0) + Number(p.overtime || 0));
    months[m].thr += Math.round(Number(p.thr) || 0);
    months[m].dedEmp += Math.round((Number(d.kesSelf) || 0) + (Number(d.jhtSelf) || 0) + (Number(d.jpSelf) || 0));
    const c = p.comp || {};
    months[m].comp += Math.round((Number(c.kesComp) || 0) + (Number(c.jhtComp) || 0) + (Number(c.jpComp) || 0) + (Number(c.jkk) || 0) + (Number(c.jkm) || 0));
    months[m].pph += Math.round(Number(d.pph21) || 0);
    months[m].count += 1;
  });
  const ms = Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
  const years = {};
  ms.forEach(m => {
    const y = m.month.slice(0, 4);
    if (!years[y]) years[y] = { year: y, thp: 0, gross: 0, thr: 0, dedEmp: 0, comp: 0, pph: 0, count: 0 };
    Object.keys(years[y]).forEach(k => { if (k !== 'year' && typeof years[y][k] === 'number') years[y][k] += m[k]; });
  });
  const bal = balances(Storage.getAllJournals());
  const bpjsDebt = (bal['2110']?.credit || 0) - (bal['2110']?.debit || 0);
  return { months: ms.slice(0, 24), years: Object.values(years).sort((a, b) => b.year.localeCompare(a.year)), bpjsDebt };
}

function handleClearAll() {
  if (confirm('Hapus SEMUA data (transaksi, pinjaman, jurnal, stok, gaji)? Kontak dipertahankan. Tindakan ini tidak dapat dibatalkan.')) {
    Storage.clearAllData();
    UI.showSuccess('Semua data dihapus');
    refresh();
  }
}

function handleKeyboardShortcut(e) {
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
    if (isInput) return;
    e.preventDefault();
    document.getElementById('addEntryBtn').click();
  }
  if (e.key === 'Escape') {
    const modals = ['entryModal','loansModal','repayModal','contactsModal','contactFormModal','reportModal','customDateModal'];
    for (const id of modals) {
      const m = document.getElementById(id);
      if (m && m.open) {
        try { m.close(); } catch {}
        return;
      }
    }
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      overlay?.classList.add('hidden');
    }
  }
  if (e.key === '/' && !isInput) {
    e.preventDefault();
    document.getElementById('searchInput')?.focus();
    document.getElementById('searchInputTop')?.focus();
  }
  if (e.key === '?' && !isInput) {
    UI.showInfo('Shortcuts: Ctrl+N tambah, / cari, Esc tutup');
  }
}

function handlePrint() {
  const filtered = Reports.filterEntries(currentEntries, currentFilters);
  const searchTerm = UI.getSearchTerm();
  const searchFiltered = searchTerm
    ? filtered.filter(e =>
        (e.description && e.description.toLowerCase().includes(searchTerm)) ||
        (e.category && e.category.toLowerCase().includes(searchTerm)) ||
        (e.payment && e.payment.toLowerCase().includes(searchTerm)) ||
        (e.paymentDetail && e.paymentDetail.toLowerCase().includes(searchTerm)) ||
        (e.person && e.person.toLowerCase().includes(searchTerm))
      )
    : filtered;
  const withBalance = Reports.computeRunningBalance(searchFiltered);
  const sorted = sortEntries(withBalance);
  const totals = Reports.computeTotals(searchFiltered);

  const rows = sorted.map(e => {
    const sign = e.type === 'income' ? '+' : '-';
    const pay = e.paymentDetail ? `${e.payment} (${e.paymentDetail})` : (e.payment || '');
    return `<tr><td>${escapeHtml(e.date)}</td><td>${e.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</td><td>${escapeHtml(Reports.getCategoryLabel(e.category))}</td><td>${escapeHtml(pay)}</td><td>${escapeHtml(e.description || '')}</td><td style="text-align:right">${sign} Rp${Number(e.amount).toLocaleString('id-ID')}</td><td style="text-align:right">Rp${Number(e.balance).toLocaleString('id-ID')}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><title>Wynara - ${new Date().toLocaleDateString('id-ID')}</title>
<style>
  body{font-family:system-ui;margin:20px;color:#222}
  h2{margin:0 0 4px}p{margin:0 0 16px;color:#666;font-size:0.85rem}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{padding:7px 10px;border:1px solid #ddd;text-align:left;font-size:0.82rem}
  th{background:#f5f5f5;font-weight:600;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.04em}
  .sum{display:flex;gap:24px;margin:16px 0}.sum-item{text-align:center}
  .sum-item .l{font-size:0.7rem;color:#888;text-transform:uppercase}.sum-item .v{font-size:1.1rem;font-weight:600}
  .inc{color:#16a34a}.exp{color:#dc2626}
  @media print{@page{size:A4;margin:15mm}}
</style></head><body>
<h2>Wynara Accounting System</h2>
<p>Dicetak: ${new Date().toLocaleString('id-ID')}</p>
<div class="sum">
  <div class="sum-item"><div class="l">Pemasukan</div><div class="v inc">Rp${totals.income.toLocaleString('id-ID')}</div></div>
  <div class="sum-item"><div class="l">Pengeluaran</div><div class="v exp">Rp${totals.expense.toLocaleString('id-ID')}</div></div>
  <div class="sum-item"><div class="l">Saldo</div><div class="v ${totals.net >= 0 ? 'inc' : 'exp'}">Rp${totals.net.toLocaleString('id-ID')}</div></div>
</div>
<table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Bayar</th><th>Deskripsi</th><th style="text-align:right">Jumlah</th><th style="text-align:right">Saldo</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { UI.showError('Izinkan pop-up untuk mencetak'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function handleThemeToggle() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  safeLocalSet('theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('themeToggle');
  const btn2 = document.getElementById('themeToggleSidebar');
  if (btn) btn.setAttribute('aria-label', isDark ? 'Light mode' : 'Dark mode');
  if (btn2) btn2.setAttribute('aria-label', isDark ? 'Light mode' : 'Dark mode');
  UI.showInfo(isDark ? 'Mode gelap aktif' : 'Mode terang aktif');
}

function handleRepayClick(loanId, presetAmount) {
  const loan = Storage.getLoanById(loanId);
  if (!loan) return;
  const reps = Storage.getLoanRepayments(loanId);
  const paid = paidOf(reps);
  const outstanding = outstandingOf(loan, reps);
  const instAmt = Number(loan.installmentAmount) || 0;
  const tenor = calcTenor(loan);
  const isTaken = loan.direction !== 'given';
  const verb = isTaken ? 'Bayar' : 'Terima';
  const label = loan.loanType === 'cicilan' && tenor > 1 ? `${verb} Cicilan ${Math.min(reps.length + 1, tenor)}/${tenor} — ${loan.person}` : `${verb} — ${loan.person}`;
  UI.openRepayModal(loanId, outstanding, presetAmount, label, {
    total: totalOwed(loan),
    paid,
    paidCount: reps.length,
    tenor,
    instAmt,
    direction: loan.direction
  });
}

function handleRepaySubmit() {
  const data = UI.getRepayFormData();
  const loan = Storage.getLoanById(data.loanId);
  if (!loan) return UI.showError('Pinjaman tidak ditemukan');
  if (!data.amount || data.amount <= 0) return UI.showError('Jumlah bayar harus > 0');
  if (data.date && Storage.isMonthLocked(data.date)) return UI.showError(`Bulan ${String(data.date).slice(0, 7)} terkunci — buka di Pengaturan`);

  const reps = Storage.getLoanRepayments(data.loanId);
  const paid = paidOf(reps);
  const outstanding = outstandingOf(loan, reps);
  if (data.amount > outstanding + 0.01) {
    return UI.showError(`Jumlah melebihi sisa: ${new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR'}).format(outstanding)}`);
  }

  try {
    Storage.addRepayment(data);
  } catch (err) {
    return UI.showError(err && err.message ? err.message : 'Gagal menyimpan pembayaran');
  }
  const afterPaid = paid + data.amount;
  const left = Math.max(totalOwed(loan) - afterPaid, 0);
  const tenor = calcTenor(loan);
  const doneCount = Storage.getLoanRepayments(data.loanId).length;
  const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(v);
  const verbDone = loan.direction !== 'given' ? 'Dibayar' : 'Diterima';
  UI.showSuccess(left <= 0.01
    ? `Lunas! ${loan.person} — total ${fmt(totalOwed(loan))}`
    : (tenor > 1
      ? `Cicilan ${doneCount}/${tenor} ${verbDone.toLowerCase()} ${fmt(data.amount)} — sisa ${fmt(left)}`
      : `${verbDone} ${fmt(data.amount)} — sisa ${fmt(left)}`));
  UI.closeRepayModal();
  refreshLoans();
}

function handleInvoicePrint(loanId) {
  const loan = Storage.getLoanById(loanId);
  if (!loan) return;
  const reps = Storage.getLoanRepayments(loanId);
  const paid = paidOf(reps);
  const out = outstandingOf(loan, reps);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  const sched = loan.loanType === 'cicilan' && Number(loan.installmentAmount) > 0
    ? `${fmt(loan.installmentAmount)}/bulan × ${calcTenor(loan)}`
    : 'Sekali bayar';
  const rows = reps.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((r, i) =>
    `<tr><td style="padding:6px 8px;border:1px solid #ddd">${i + 1}</td><td style="padding:6px 8px;border:1px solid #ddd">${esc(r.date)}</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${fmt(r.amount)}</td></tr>`
  ).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:12px">
      <div style="font-size:20px;font-weight:800">INVOICE / TAGIHAN</div>
      <div style="font-size:12px">${esc(loan.invoiceNo || `PINJAMAN-${String(loan.id).slice(-6).toUpperCase()}`)}</div>
    </div>
    <table style="width:100%;font-size:13px;margin-bottom:10px">
      <tr><td style="color:#555">Tagihan untuk</td><td><b>${esc(loan.person)}</b></td></tr>
      <tr><td style="color:#555">Tanggal</td><td>${esc(loan.date)}</td></tr>
      ${loan.dueDate ? `<tr><td style="color:#555">Jatuh tempo</td><td>${esc(loan.dueDate)}</td></tr>` : ''}
      <tr><td style="color:#555">Skema</td><td>${esc(sched)}${Number(loan.interestRate) > 0 ? ` • Bunga ${esc(String(loan.interestRate))}%` : ''}</td></tr>
      ${loan.description ? `<tr><td style="color:#555">Keterangan</td><td>${esc(loan.description)}</td></tr>` : ''}
    </table>
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:10px">
      <tr><td style="padding:6px 8px">Total tagihan</td><td style="padding:6px 8px;text-align:right"><b>${fmt(totalOwed(loan))}</b></td></tr>
      <tr><td style="padding:6px 8px">Sudah dibayar</td><td style="padding:6px 8px;text-align:right">${fmt(paid)}</td></tr>
      <tr><td style="padding:6px 8px"><b>Sisa</b></td><td style="padding:6px 8px;text-align:right"><b>${fmt(out)}</b></td></tr>
    </table>
    ${rows ? `<div style="font-size:13px;font-weight:700;margin-bottom:4px">Riwayat pembayaran</div>
    <table style="width:100%;font-size:12px;border-collapse:collapse"><tr><th style="padding:6px 8px;border:1px solid #ddd">#</th><th style="padding:6px 8px;border:1px solid #ddd">Tanggal</th><th style="padding:6px 8px;border:1px solid #ddd">Jumlah</th></tr>${rows}</table>` : ''}
  </div>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>${esc(loan.invoiceNo || 'Invoice')}</title></head><body>${html}<script>onload=()=>{print();}<\/script></body></html>`);
  w.document.close();
}

function handleLoanDelete(loanId) {
  if (confirm('Hapus pinjaman ini beserta riwayat pembayaran?')) {
    Storage.deleteLoan(loanId);
    UI.showSuccess('Pinjaman dihapus');
    refreshLoans();
  }
}

function handleRepayDelete(repayId) {
  const rep = Storage.getRepaymentById(repayId);
  const repSnap = rep ? { ...rep } : null;
  const entrySnap = rep && rep.entryId ? { ...Storage.getEntryById(rep.entryId) } : null;
  Storage.deleteRepayment(repayId);
  refreshLoans();
  if (!repSnap) return;
  UI.showUndoToast('Pembayaran dihapus', () => {
    if (entrySnap && entrySnap.id) Storage.restoreEntry(entrySnap);
    Storage.restoreRepayment(repSnap);
    const loan = Storage.getLoanById(repSnap.loanId);
    if (loan) {
      const total = Storage.getLoanRepayments(repSnap.loanId).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      Storage.updateLoan(loan.id, { status: total >= totalOwed(loan) ? 'paid' : 'active' });
    }
    UI.showSuccess('Pembayaran dikembalikan');
    refreshLoans();
  });
}

function handleContactDelete(contactId, contactName) {
  if (confirm(`Hapus kontak "${contactName}" dari daftar? Pinjaman terkait tidak dihapus.`)) {
    Storage.deletePerson(contactId);
    UI.showSuccess('Kontak dihapus');
    UI.renderContacts(Storage.getAllPeople(), Storage.getAllLoans());
  }
}

function handleContactEdit(contactId, contactName, contactType, contactPhone) {
  UI.openContactForm(contactId, contactName, contactType, contactPhone);
}

function handleContactFormSubmit() {
  const data = UI.getContactFormData();
  if (!data.name) return UI.showError('Nama kontak wajib diisi');

  if (data.id) {
    Storage.updatePerson(data.id, data.name, data.type, data.phone);
    UI.showSuccess('Kontak diperbarui');
  } else {
    Storage.savePerson(data.name, data.type, data.phone);
    UI.showSuccess('Kontak ditambahkan');
  }
  UI.closeContactForm();
  UI.renderContacts(Storage.getAllPeople(), Storage.getAllLoans());
}

/* ===== COA ===== */
function suggestCoaCode(type) {
  const base = { asset: 1000, liability: 2000, equity: 3000, revenue: 4000, expense: 5000 }[type] || 5000;
  const used = new Set(getAccounts().map(a => a.code));
  for (let n = base; n < base + 1000; n++) {
    const code = String(n);
    if (/^\d{4}$/.test(code) && !used.has(code)) return code;
  }
  return '';
}
function refreshCoa() {
  try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
  try { setCoaAliases(Storage.getCoaAliases()); } catch {}
  const q = String(document.getElementById('coaSearch')?.value || '').trim().toLowerCase();
  const tf = document.getElementById('coaTypeFilter')?.value || 'all';
  const list = getAccounts().filter(a =>
    (!q || a.code.includes(q) || String(a.name || '').toLowerCase().includes(q)) && (tf === 'all' || a.type === tf));
  UI.renderCoa(list, balances(Storage.getAllJournals()));
}
function openCoaModal() {
  refreshCoa();
  const codeEl = document.getElementById('coaCode');
  if (codeEl && !codeEl.value.trim()) codeEl.value = suggestCoaCode(document.getElementById('coaType')?.value || 'expense');
  UI.openCoa();
}
function handleCoaSave() {
  const d = UI.getCoaFormData();
  try {
    const saved = Storage.saveCustomAccount(d);
    try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
    Storage.logAudit('create', 'account', saved.code, null, { name: saved.name });
    UI.showSuccess(`Akun ${saved.code} ${saved.name} ditambahkan`);
    UI.resetCoaForm();
    refreshCoa();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menambah akun');
  }
}
function handleCoaImport() {
  const text = document.getElementById('coaImportText')?.value || '';
  const existing = getAccounts().map(a => a.code);
  const parsed = parseCoaCsv(text, existing);
  let added = 0;
  parsed.accounts.forEach(acc => {
    try { Storage.saveCustomAccount(acc); added++; } catch {}
  });
  try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
  refreshCoa();
  queueMirror();
  const info = document.getElementById('coaImportInfo');
  if (info) info.textContent = `${added} ditambah • ${parsed.collide.length} bentrok kode bawaan (tidak diubah) • ${parsed.skipped.length} dilewati`;
  if (added) UI.showSuccess(`${added} akun COA diimpor`); else UI.showInfo('Tidak ada akun baru yang diimpor');
}
function handleCoaRenumberPreview() {
  const p = Storage.previewCoaRenumber();
  const rows = p.hits.map(([code, n]) => `<tr><td style="font-family:monospace;font-size:12px">${escapeHtml(code)}</td><td style="font-size:12px">→</td><td style="font-family:monospace;font-size:12px">${escapeHtml(COA_RENUMBER[code] || code)}</td><td class="amount-col">${n}</td></tr>`).join('');
  const body = `<p style="font-size:12px;color:#64748b">Pratinjau migrasi renumber ke chart <b>PT Wynara Living Atelier</b>. <b>Belum ada data yang diubah.</b></p>
    <div class="report-summary">
      <div class="report-summary-item"><span class="label">Baris jurnal terdampak</span><span class="value">${p.journalLines}</span></div>
      <div class="report-summary-item"><span class="label">Jurnal</span><span class="value">${p.journalsAffected}</span></div>
      <div class="report-summary-item"><span class="label">Mutasi bank</span><span class="value">${p.statementsAffected}</span></div>
      <div class="report-summary-item"><span class="label">Aturan bank</span><span class="value">${p.rulesAffected}</span></div>
      <div class="report-summary-item"><span class="label">Akun saldo awal</span><span class="value">${p.openingCodes.length}</span></div>
    </div>
    ${p.unknownCodes.length ? `<p style="font-size:12px;color:#b91c1c">Kode tak dikenal (cek dulu): ${p.unknownCodes.map(escapeHtml).join(', ')}</p>` : ''}
    <table class="report-table"><thead><tr><th>Kode lama</th><th></th><th>Kode baru</th><th class="amount-col">Baris</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Tidak ada kode lama yang perlu diubah.</td></tr>'}</tbody></table>
    <p style="font-size:11px;color:#64748b">Setelah Anda setujui, saya jalankan migrasi: tulis ulang kode di jurnal + mutasi/aturan bank + saldo awal, lalu ganti chart.</p>`;
  UI.openInfoModal('🔄 Pratinjau Renumber COA', body);
}
function handleCoaRename(code, name) {
  try {
    const isCustom = Storage.getCustomAccounts().some(a => a.code === code);
    if (isCustom) {
      Storage.renameCustomAccount(code, name);
    } else {
      // Bawaan: simpan sebagai alias nama (kode/type tetap).
      const map = { ...Storage.getCoaAliases() };
      map[code] = String(name || '').trim().slice(0, 60);
      Storage.saveCoaAliases(map);
      try { setCoaAliases(map); } catch {}
    }
    UI.showSuccess('Nama akun diperbarui');
    refreshCoa();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal mengganti nama');
  }
}
function handleCoaDelete(code) {
  if (!confirm(`Hapus akun ${code}?`)) return;
  try {
    Storage.deleteCustomAccount(code, balances(Storage.getAllJournals()));
    try { setCustomAccounts(Storage.getCustomAccounts()); } catch {}
    Storage.logAudit('delete', 'account', code, null, null);
    UI.showSuccess('Akun dihapus');
    refreshCoa();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menghapus akun');
  }
}

/* ===== Stok ===== */
function refreshStock() {
  UI.renderStock(Storage.getAllItems());
  refreshSuppliers();
  refreshStockPage();
}
let stockPageFilter = 'all';
let stockView = safeLocalGet('wynara_stockView') === 'table' ? 'table' : 'cards';
let stockSort = null;
let stockShowInactive = false;
function refreshStockPage() {
  const term = document.getElementById('stockPageSearch')?.value || '';
  const shopId = Storage.getActiveShopId();
  const shopName = (Storage.getShops().find(s => s.id === shopId) || {}).name || '';
  renderShopSelect();
  const viewToggle = document.getElementById('stockViewToggle');
  if (viewToggle) viewToggle.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.v === stockView));
  const pf = document.getElementById('stockPageFilter');
  if (pf) pf.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.f === stockPageFilter));
  UI.renderStockPage(Storage.getStockGroups(), { term, filter: stockPageFilter, shopId, shopName, view: stockView, sort: stockSort, showInactive: stockShowInactive, movesToday: stockMovesTodayCount(shopId) });
  const qtyLabel = document.getElementById('stockQtyLabel');
  if (qtyLabel) qtyLabel.textContent = `Punya berapa? (${shopName})`;
  renderBulkBar();
}
function selectedStockIds() {
  return [...document.querySelectorAll('#stockPageList .stock-row-check:checked')].map(c => c.dataset.id);
}
function stockMovesTodayCount(shopId) {
  const today = new Date().toISOString().slice(0, 10);
  return Storage.getStockMoves().filter(m => String(m.ts || '').slice(0, 10) === today && (!m.shop || m.shop === shopId)).length;
}
const STOCK_MOVE_LABELS = { sale: 'Jual', purchase: 'Beli', restock: 'Restock', adjust: 'Koreksi', transfer: 'Transfer', return: 'Retur', opening: 'Stok awal', opname: 'Opname', reversal: 'Pembatalan' };
function openStockMovementsToday() {
  const shopId = Storage.getActiveShopId();
  const nm = (Storage.getShops().find(s => s.id === shopId) || {}).name || '';
  const today = new Date().toISOString().slice(0, 10);
  const moves = Storage.getStockMoves().filter(m => String(m.ts || '').slice(0, 10) === today && (!m.shop || m.shop === shopId));
  const dt = (s) => { try { return new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
  const th = (m) => STOCK_MOVE_LABELS[m.type] || (m.qtyIn ? 'Masuk' : 'Keluar');
  const body = moves.length
    ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px">Mutasi <b>${escapeHtml(nm)}</b> hari ini — ${moves.length} gerakan</div>
       <div style="overflow-x:auto"><table class="report-table"><thead><tr><th>Jam</th><th>Jenis</th><th>Produk</th><th class="amount-col">Masuk</th><th class="amount-col">Keluar</th><th class="amount-col">Sisa</th></tr></thead><tbody>
       ${moves.slice(0, 120).map(m => { const it = Storage.getItemById(m.itemId) || {}; return `<tr><td style="white-space:nowrap;font-size:11px">${dt(m.ts)}</td><td style="font-size:11px">${th(m)}</td><td style="font-size:12px">${escapeHtml(it.name || '—')}</td><td class="amount-col income">${m.qtyIn ? '+' + m.qtyIn : ''}</td><td class="amount-col expense">${m.qtyOut ? '−' + m.qtyOut : ''}</td><td class="amount-col"><b>${m.balance}</b></td></tr>`; }).join('')}
       </tbody></table></div>`
    : '<p style="color:#64748b">Belum ada mutasi stok hari ini.</p>';
  UI.openInfoModal('🔄 Mutasi stok hari ini', body);
}
function renderBulkBar() {
  const bar = document.getElementById('stockBulkBar');
  const ids = selectedStockIds();
  if (bar) bar.hidden = ids.length === 0;
  const cnt = document.getElementById('stockBulkCount');
  if (cnt) cnt.textContent = `${ids.length} dipilih`;
  const catSel = document.getElementById('bulkCategory');
  if (catSel && catSel.options.length <= 1) {
    const cats = [...new Set(Storage.getAllItems().map(i => i.category).filter(Boolean))].sort();
    cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  }
}
function handleReorderReport() {
  const shopId = Storage.getActiveShopId();
  const shopName = (Storage.getShops().find(s => s.id === shopId) || {}).name || '';
  const rows = Storage.getReorderList(shopId);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const totalCost = rows.reduce((s, r) => s + r.suggest * (Number(r.item.cost) || 0), 0);
  const body = rows.length
    ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px">Toko <b>${escapeHtml(shopName)}</b> — ${rows.length} varian ≤ titik pesan ulang • perkiraan biaya restock <b>${fmt(totalCost)}</b></div>
       <div style="overflow-x:auto"><table class="report-table"><thead><tr><th>Produk</th><th>SKU</th><th class="amount-col">Stok</th><th class="amount-col">Min</th><th class="amount-col">Saran</th></tr></thead><tbody>
       ${rows.slice(0, 200).map(r => `<tr><td style="font-size:12px">${escapeHtml(r.item.name)}${[r.item.size, r.item.color].filter(Boolean).length ? ' ' + escapeHtml([r.item.size, r.item.color].filter(Boolean).join('/')) : ''}</td><td style="font-size:11px">${escapeHtml(r.item.sku || '—')}</td><td class="amount-col ${r.stock <= r.min ? 'expense' : ''}">${r.stock}</td><td class="amount-col">${r.min}</td><td class="amount-col"><b>${r.suggest}</b></td></tr>`).join('')}
       </tbody></table></div>`
    : '<p style="color:#64748b">Tidak ada varian yang menipis di toko ini. 🎉</p>';
  UI.openInfoModal('📋 Perlu Restock', body);
}
function bulkSetActive(active) {
  const ids = selectedStockIds();
  if (!ids.length) return;
  try {
    Storage.setItemsActive(ids, active);
    UI.showSuccess(`${ids.length} produk ${active ? 'diaktifkan' : 'dinonaktifkan'}`);
    refreshStock();
    queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal'); }
}
function handleBulkEditOpen() {
  const ids = selectedStockIds();
  if (!ids.length) return;
  const info = document.getElementById('bulkEditInfo');
  if (info) info.textContent = `${ids.length} produk dipilih`;
  ['bulkEditCategory', 'bulkEditUnit', 'bulkEditPct'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const m = document.getElementById('bulkEditModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
}
function closeBulkEdit() { const m = document.getElementById('bulkEditModal'); if (m && m.open) { try { m.close(); } catch {} } }
function handleBulkEditSubmit() {
  const ids = selectedStockIds();
  if (!ids.length) return closeBulkEdit();
  const cat = document.getElementById('bulkEditCategory')?.value.trim();
  const unit = document.getElementById('bulkEditUnit')?.value.trim();
  const pct = document.getElementById('bulkEditPct')?.value;
  try {
    let n = 0;
    if (cat) { Storage.setItemsCategory(ids, cat); n++; }
    if (unit) { Storage.setItemsUnit(ids, unit); n++; }
    if (String(pct || '').trim() !== '' && Number(pct) !== 0) { Storage.setItemsPricePct(ids, Number(pct)); n++; }
    if (!n) return UI.showError('Isi minimal satu perubahan');
    UI.showSuccess(`${ids.length} produk diperbarui`);
    closeBulkEdit(); refreshStock(); queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal edit massal'); }
}
function handleStockBulkDelete() {
  const ids = selectedStockIds();
  if (!ids.length) return;
  if (!confirm(`Hapus ${ids.length} produk terpilih? Barang yang sudah dipakai transaksi/pembelian akan dilewati.`)) return;
  try {
    const r = Storage.deleteItemsBulk(ids);
    UI.showSuccess(`${r.deleted} dihapus${r.skipped ? `, ${r.skipped} dilewati (sudah dipakai)` : ''}`);
    refreshStock(); queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menghapus'); }
}
function bulkExportCsv() {
  const ids = selectedStockIds();
  if (!ids.length) return;
  const rows = [['Nama', 'Varian', 'SKU', 'Barcode', 'Kategori', 'Satuan', 'Stok', 'Harga', 'Modal']];
  Storage.getAllItems().filter(i => ids.includes(i.id)).forEach(i => rows.push([i.name, [i.size, i.color].filter(Boolean).join('/'), i.sku || '', i.barcode || '', i.category || '', i.unit || '', i.stock, i.price, i.cost]));
  const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `wynara-produk-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  UI.showSuccess(`${rows.length - 1} produk diekspor`);
}
function renderShopSelect() {
  const sel = document.getElementById('shopSelect');
  if (!sel) return;
  const shops = Storage.getShops();
  const active = Storage.getActiveShopId();
  sel.innerHTML = shops.map(s => `<option value="${s.id}" ${s.id === active ? 'selected' : ''}>🏬 ${escapeHtml(s.name)}</option>`).join('');
}
function handleStockRestockGroup(key) {
  const g = Storage.getStockGroups().find(x => x.key === key);
  if (!g) return;
  const sel = document.getElementById('restockVariant');
  if (sel) sel.innerHTML = g.variants.map(v => { const lab = [v.size, v.color].filter(Boolean).join('/') || 'Default'; return `<option value="${v.id}">${escapeHtml(lab)} — stok ${v.stock}</option>`; }).join('');
  const info = document.getElementById('restockInfo');
  if (info) info.innerHTML = `<b>${escapeHtml(g.name)}</b> — modal rata-rata Rp${Math.round(Number(g.variants[0] && g.variants[0].cost) || 0).toLocaleString('id-ID')}/pcs`;
  const dateEl = document.getElementById('restockDate'); if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
  const q = document.getElementById('restockQty'); if (q) q.value = '';
  const c = document.getElementById('restockCost'); if (c) c.value = g.variants[0] && g.variants[0].cost ? String(Math.round(g.variants[0].cost)) : '';
  const m = document.getElementById('restockModal'); if (m && !m.open) { try { m.showModal(); } catch {} }
}
function closeRestock() { const m = document.getElementById('restockModal'); if (m && m.open) { try { m.close(); } catch {} } }
/* ===== Dokumen stok: penyesuaian & transfer ===== */
function openStockAdjust(preselectId) {
  const sel = document.getElementById('stkAdjItem');
  if (sel) sel.innerHTML = '<option value="">— pilih barang —</option>' + Storage.getAllItems().map(i => { return `<option value="${i.id}">${escapeHtml(Storage.fullItemName(i))} (stok ${i.stock})</option>`; }).join('');
  const dEl = document.getElementById('stkAdjDate'); if (dEl) dEl.value = new Date().toISOString().split('T')[0];
  const q = document.getElementById('stkAdjQty'); if (q) q.value = '';
  const r = document.getElementById('stkAdjReason'); if (r) r.value = '';
  if (preselectId && sel && Storage.getItemById(preselectId)) sel.value = preselectId;
  updateStockAdjInfo();
  const m = document.getElementById('stockAdjustModal'); if (m && !m.open) { try { m.showModal(); } catch {} }
}
function updateStockAdjInfo() {
  const it = Storage.getItemById(document.getElementById('stkAdjItem')?.value || '');
  const info = document.getElementById('stkAdjInfo');
  if (!info) return;
  if (!it) { info.textContent = ''; return; }
  const shopId = Storage.getActiveShopId();
  const nm = (Storage.getShops().find(s => s.id === shopId) || {}).name || '';
  info.textContent = `Stok ${nm}: ${Storage.shopStockOf(it, shopId)} • modal rata-rata Rp${Math.round(it.cost || 0).toLocaleString('id-ID')}`;
}
function handleStockAdjustSubmit() {
  const itemId = document.getElementById('stkAdjItem')?.value || '';
  const qty = Math.trunc(Number(document.getElementById('stkAdjQty')?.value) || 0);
  const reason = document.getElementById('stkAdjReason')?.value.trim() || '';
  const date = document.getElementById('stkAdjDate')?.value || new Date().toISOString().split('T')[0];
  if (!itemId) return UI.showError('Pilih barang dulu');
  if (!qty) return UI.showError('Isi jumlah (+/−), tidak boleh 0');
  try {
    Storage.adjustStock(itemId, { qty, reason, date });
    UI.showSuccess(`Penyesuaian stok ${qty > 0 ? '+' : ''}${qty} disimpan`);
    closeStockAdjust(); refreshStock(); refresh(); queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menyesuaikan stok'); }
}
function closeStockAdjust() { const m = document.getElementById('stockAdjustModal'); if (m && m.open) { try { m.close(); } catch {} } }
function openTransfer(preselectId) {
  const sel = document.getElementById('trfItem');
  if (sel) sel.innerHTML = '<option value="">— pilih barang —</option>' + Storage.getAllItems().map(i => { return `<option value="${i.id}">${escapeHtml(Storage.fullItemName(i))}</option>`; }).join('');
  const shops = Storage.getShops();
  const opts = shops.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  const from = document.getElementById('trfFrom'); if (from) from.innerHTML = opts;
  const to = document.getElementById('trfTo'); if (to) to.innerHTML = opts;
  if (from) from.value = Storage.getActiveShopId();
  if (to && shops.length > 1) to.value = shops.find(s => s.id !== Storage.getActiveShopId()).id;
  if (preselectId && sel && Storage.getItemById(preselectId)) sel.value = preselectId;
  const q = document.getElementById('trfQty'); if (q) q.value = '';
  updateTrfInfo();
  const m = document.getElementById('transferModal'); if (m && !m.open) { try { m.showModal(); } catch {} }
}
function updateTrfInfo() {
  const it = Storage.getItemById(document.getElementById('trfItem')?.value || '');
  const from = document.getElementById('trfFrom')?.value || '';
  const info = document.getElementById('trfInfo');
  if (!info) return;
  if (!it || !from) { info.textContent = ''; return; }
  const nm = (Storage.getShops().find(s => s.id === from) || {}).name || '';
  info.textContent = `Stok ${nm}: ${Storage.shopStockOf(it, from)}`;
}
function handleTransferSubmit() {
  const itemId = document.getElementById('trfItem')?.value || '';
  const fromShop = document.getElementById('trfFrom')?.value || '';
  const toShop = document.getElementById('trfTo')?.value || '';
  const qty = Math.floor(Number(document.getElementById('trfQty')?.value) || 0);
  if (!itemId) return UI.showError('Pilih barang dulu');
  try {
    Storage.transferStock(itemId, { fromShop, toShop, qty });
    UI.showSuccess(`Dipindahkan ${qty} ke ${(Storage.getShops().find(s => s.id === toShop) || {}).name || ''}`);
    closeTransfer(); refreshStock(); refresh(); queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal transfer'); }
}
function closeTransfer() { const m = document.getElementById('transferModal'); if (m && m.open) { try { m.close(); } catch {} } }
function handleRestockSubmit() {
  const itemId = document.getElementById('restockVariant')?.value || '';
  const qty = Math.max(parseInt(document.getElementById('restockQty')?.value || '0', 10) || 0, 0);
  const cost = Math.round(Number(UI.parseIdrInput(document.getElementById('restockCost')?.value || '')) || 0);
  const date = document.getElementById('restockDate')?.value || new Date().toISOString().split('T')[0];
  const payment = document.getElementById('restockPayment')?.value || 'cash';
  const source = document.getElementById('restockSource')?.value || 'tunai';
  if (!itemId) return UI.showError('Pilih varian dulu');
  if (qty <= 0) return UI.showError('Jumlah masuk harus > 0');
  if (source === 'muatan') {
    closeRestock();
    UI.showInfo('Barang dari muatan impor: buka Papan Muatan → muatan yang tiba → Alokasi. Biaya mendarat dihitung otomatis, tidak diketik di sini.');
    document.getElementById('muatanBtnSidebar')?.click();
    return;
  }
  try {
    const it = Storage.receiveStockBySource(itemId, qty, cost, { date, payment, source });
    const note = source === 'hutang' ? 'hutang supplier' : source === 'awal' ? 'stok awal' : 'beli tunai';
    UI.showSuccess(`Stok ${it.name} +${qty} (${note}, modal Rp${cost.toLocaleString('id-ID')}/pcs)`);
    closeRestock();
    refreshStock();
    refresh();
    queueMirror();
  } catch (err) { UI.showError(err && err.message ? err.message : 'Gagal terima barang'); }
}
function applyRestockSource() {
  const src = document.getElementById('restockSource')?.value || 'tunai';
  const costWrap = document.getElementById('restockCostWrap');
  const payWrap = document.getElementById('restockPayWrap');
  const hint = document.getElementById('restockSourceHint');
  const save = document.getElementById('restockSave');
  if (src === 'muatan') {
    if (costWrap) costWrap.hidden = true;
    if (payWrap) payWrap.hidden = true;
    if (save) save.textContent = '🚢 Buka Papan Muatan';
  } else {
    if (costWrap) costWrap.hidden = false;
    if (payWrap) payWrap.hidden = src === 'hutang' || src === 'awal';
    if (save) save.textContent = 'Tambah stok';
  }
  if (hint) {
    hint.textContent = src === 'hutang'
      ? 'Dr Persediaan / Cr Hutang Supplier — stok bertambah, belum ada uang keluar; bayar belakangan di Pembelian → Lokal & Hutang.'
      : src === 'awal'
        ? 'Dr Persediaan / Cr Modal Pemilik — tidak ada kas keluar; untuk saldo stok yang sudah ada sebelum pakai aplikasi.'
        : src === 'muatan'
          ? 'Biaya tidak diketik di sini — angka berasal dari alokasi muatan (harga barang + ongkir + freight dibagi CBM).'
          : 'Dr Persediaan / Cr Kas — uang keluar sekarang, stok bertambah.';
  }
}
function handleStockSave() {
  const d = UI.getStockFormData();
  if (!d.name) return UI.showError('Nama barang wajib diisi');
  try {
    // Varian: harga & modal per ukuran; warna ikut ukuran (premium + surcharge); stok per sel.
    const vd = d.variantData || {};
    const variants = (d.variant === 'variant' && Array.isArray(vd.variants))
      ? vd.variants.filter(v => v && (v.size || v.color))
      : [];
    if (!d.id && variants.length > 0) {
      let created = 0, totalStock = 0;
      const groupId = 'G' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      variants.forEach((v, i) => {
        const nm = `${d.name}${v.size ? ' • ' + v.size : ''}${v.color ? ' • ' + v.color : ''}`;
        try {
          Storage.saveItem({
            id: null, name: nm, sku: v.sku || (d.sku ? `${d.sku}-${i + 1}` : ''), barcode: v.barcode || '',
            unit: d.unit, category: d.category,
            size: v.size, color: v.color,
            price: Number(v.price) || 0, cost: Number(v.cost) || 0,
            discountPct: v.discountPct != null ? v.discountPct : d.discountPct,
            stock: v.stock, minStock: d.minStock,
            image: d.image, weight: d.weight, length: d.length, width: d.width, height: d.height,
            groupId, baseName: d.name,
          });
          created++; totalStock += v.stock;
        } catch {}
      });
      Storage.logAudit('create', 'item', '', null, { variants: created, base: d.name });
      UI.showSuccess(`${created} varian “${d.name}” dibuat — total stok ${totalStock}.`);
      UI.resetStockForm();
      UI.closeStock();
      refreshStock();
      queueMirror();
      return;
    }
    const prev = d.id ? Storage.getItemById(d.id) : null;
    const opnameDate = new Date().toISOString().split('T')[0];
    if (prev && Number(d.stock) !== Number(prev.stock) && Storage.isMonthLocked(opnameDate)) {
      return UI.showError(`Bulan ${opnameDate.slice(0, 7)} terkunci — stok tidak bisa disesuaikan`);
    }
    // Fallback: mode varian tanpa ukuran/warna terisi → pakai harga varian pertama bila ada.
    if (!(Number(d.price) > 0) && Array.isArray(vd.variants) && vd.variants[0]) {
      d.price = Number(vd.variants[0].price) || 0;
      d.cost = Number(vd.variants[0].cost) || 0;
    }
    const saved = Storage.saveItem(d);
    if (prev && saved.stock !== prev.stock) {
      const diff = saved.stock - prev.stock;
      const j = buildAdjustJournal({
        account: '1105', amount: Math.abs(diff) * Math.max(saved.cost, 0),
        date: new Date().toISOString().split('T')[0],
        memo: `Opname ${saved.name}: ${prev.stock} → ${saved.stock}`,
        increase: diff > 0
      });
      if (j) Storage.postJournal(j);
    }
    Storage.logAudit(d.id ? 'update' : 'create', 'item', saved.id, prev ? { stock: prev.stock } : null, { stock: saved.stock });
    UI.showSuccess(`Barang “${saved.name}” disimpan`);
    UI.resetStockForm();
    UI.closeStock();
    refreshStock();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan barang');
  }
}
function handleStockEdit(id) {
  const it = Storage.getItemById(id);
  if (it) { UI.fillStockForm(it); UI.openStock(); }
}
function handleStockHistory(id) {
  const it = Storage.getItemById(id);
  if (!it) return;
  const moves = Storage.getStockMoves(id);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const dt = (s) => { try { return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
  const body = moves.length
    ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px">${escapeHtml(it.name)} — stok kini <b>${it.stock}</b> • modal rata-rata ${fmt(it.cost)}</div>
       <div style="overflow-x:auto"><table class="report-table"><thead><tr><th>Waktu</th><th>Jenis</th><th>Masuk</th><th>Keluar</th><th>Sisa</th><th>Modal/unit</th></tr></thead><tbody>
       ${moves.slice(0, 100).map(m => `<tr><td style="white-space:nowrap;font-size:11px">${dt(m.ts)}</td><td style="font-size:11px">${STOCK_MOVE_LABELS[m.type] || (m.qtyIn ? 'Masuk' : 'Keluar')}</td><td class="amount-col income">${m.qtyIn ? '+' + m.qtyIn : ''}</td><td class="amount-col expense">${m.qtyOut ? '−' + m.qtyOut : ''}</td><td class="amount-col"><b>${m.balance}</b></td><td class="amount-col">${fmt(m.unitCost)}</td></tr>`).join('')}
       </tbody></table></div>`
    : '<p style="color:#64748b">Belum ada mutasi tercatat untuk barang ini.</p>';
  UI.openInfoModal(`📜 Kartu stok — ${it.name}`, body);
}
function handleStockHistoryGroup(key) {
  const g = Storage.getStockGroups().find(x => x.key === key);
  if (!g) return;
  const shopId = Storage.getActiveShopId();
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const dt = (s) => { try { return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
  const rows = [];
  g.variants.forEach(v => {
    const vlabel = [v.size, v.color].filter(Boolean).join('/') || v.name;
    Storage.getStockMoves(v.id).slice(0, 40).forEach(m => rows.push({ ...m, vlabel }));
  });
  rows.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const val = g.variants.reduce((s, v) => s + Storage.shopStockOf(v, shopId) * (Number(v.cost) || 0), 0);
  const body = rows.length
    ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px"><b>${escapeHtml(g.name)}</b> — nilai ${fmt(val)} • ${g.variants.length} varian</div>
       <div style="overflow-x:auto"><table class="report-table"><thead><tr><th>Waktu</th><th>Varian</th><th>Masuk</th><th>Keluar</th><th>Sisa</th></tr></thead><tbody>
       ${rows.slice(0, 120).map(m => `<tr><td style="white-space:nowrap;font-size:11px">${dt(m.ts)}</td><td style="font-size:11px">${escapeHtml(m.vlabel)}</td><td class="amount-col income">${m.qtyIn ? '+' + m.qtyIn : ''}</td><td class="amount-col expense">${m.qtyOut ? '−' + m.qtyOut : ''}</td><td class="amount-col"><b>${m.balance}</b></td></tr>`).join('')}
       </tbody></table></div>`
    : '<p style="color:#64748b">Belum ada mutasi tercatat.</p>';
  UI.openInfoModal(`📜 Riwayat — ${g.name}`, body);
}

/* ===== Lembar aksi cepat produk (movement-first) ===== */
let stockActionId = '';
function openStockActionSheet(itemId) {
  const it = Storage.getItemById(itemId);
  if (!it) return;
  stockActionId = itemId;
  const shopId = Storage.getActiveShopId();
  const shopName = (Storage.getShops().find(s => s.id === shopId) || {}).name || '';
  const q = Storage.shopStockOf(it, shopId);
  const v = Storage.itemVariantLabel(it);
  const title = document.getElementById('stockActionTitle');
  if (title) title.textContent = it.name + (v ? ' • ' + v : '');
  const info = document.getElementById('stockActionInfo');
  if (info) info.innerHTML = `Stok <b>${q}</b> ${escapeHtml(shopName)} • total ${it.stock} • modal Rp${Math.round(Number(it.cost) || 0).toLocaleString('id-ID')}`;
  const m = document.getElementById('stockActionSheet');
  if (m && !m.open) { try { m.showModal(); } catch {} }
}
function closeStockActionSheet() { const m = document.getElementById('stockActionSheet'); if (m && m.open) { try { m.close(); } catch {} } }
function openRestockForItem(itemId) {
  const it = Storage.getItemById(itemId);
  if (!it) return;
  const g = Storage.getStockGroups().find(x => x.key === Storage.itemGroupKey(it));
  const shopId = Storage.getActiveShopId();
  const sel = document.getElementById('restockVariant');
  if (sel) {
    const list = g ? g.variants : [it];
    sel.innerHTML = list.map(x => { const lab = [x.size, x.color].filter(Boolean).join('/') || 'Default'; return `<option value="${x.id}">${escapeHtml(lab)} — stok ${Storage.shopStockOf(x, shopId)}</option>`; }).join('');
    sel.value = itemId;
  }
  const info = document.getElementById('restockInfo');
  if (info) info.innerHTML = `<b>${escapeHtml(g ? g.name : it.name)}</b> — modal rata-rata Rp${Math.round(Number(it.cost) || 0).toLocaleString('id-ID')}/pcs`;
  const dateEl = document.getElementById('restockDate'); if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
  const q = document.getElementById('restockQty'); if (q) q.value = '';
  const c = document.getElementById('restockCost'); if (c) c.value = it.cost ? String(Math.round(it.cost)) : '';
  const m = document.getElementById('restockModal'); if (m && !m.open) { try { m.showModal(); } catch {} }
}

/* ===== Barcode produk (Code128) ===== */
let barcodeItemId = '';
function openBarcode(itemId) {
  const it = Storage.getItemById(itemId);
  if (!it) return;
  barcodeItemId = itemId;
  const code = it.barcode || it.sku || it.id;
  const title = document.getElementById('barcodeTitle');
  if (title) title.textContent = '🏷️ ' + it.name;
  const info = document.getElementById('barcodeInfo');
  if (info) info.textContent = `${[it.size, it.color].filter(Boolean).join(' / ') || 'Produk'} • SKU ${it.sku || '—'}`;
  const box = document.getElementById('barcodeSvg');
  if (box) box.innerHTML = code128Svg(code, { height: 72 });
  const txt = document.getElementById('barcodeText');
  if (txt) txt.textContent = code;
  const m = document.getElementById('barcodeModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
}
function closeBarcode() { const m = document.getElementById('barcodeModal'); if (m && m.open) { try { m.close(); } catch {} } }
function printBarcode() {
  const it = Storage.getItemById(barcodeItemId);
  if (!it) return;
  const code = it.barcode || it.sku || it.id;
  const svg = code128Svg(code, { height: 72 });
  const w = window.open('', '_blank', 'width=440,height=340');
  if (!w) { UI.showError('Izinkan pop-up untuk mencetak barcode'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode ${escapeHtml(it.name)}</title></head><body style="font-family:sans-serif;text-align:center;padding:16px">${svg}<div style="font-family:ui-monospace,monospace;letter-spacing:1px;margin-top:6px">${escapeHtml(code)}</div><div style="font-size:12px;margin-top:4px">${escapeHtml(it.name)}</div></body></html>`);
  w.document.close(); w.focus();
  try { w.print(); } catch {}
}

/* ===== Import produk & penjualan (marketplace / WhatsApp) ===== */
let importMode = 'sales';
let importOrders = [];
let importProducts = [];
let importDataRows = [];
function openImport(mode) {
  importMode = mode || 'sales';
  importOrders = []; importProducts = []; importDataRows = [];
  const m = document.getElementById('importModal');
  if (!m) return;
  const titles = { sales: '📥 Import penjualan (marketplace)', wa: '📥 Import penjualan (WhatsApp/offline)', products: '📥 Import daftar produk' };
  const t = document.getElementById('importTitle'); if (t) t.textContent = titles[importMode] || 'Import';
  document.querySelectorAll('#importIntro .chip').forEach(c => c.classList.toggle('selected', c.dataset.mode === importMode));
  const ta = document.getElementById('importText');
  if (ta) { ta.value = ''; ta.placeholder = importMode === 'wa' ? 'Contoh:\n2x Kopi 15000\n1 Teh @8000\nKopi Susu 3x 20000' : 'Tempel data CSV/Excel di sini…'; }
  const f = document.getElementById('importModalFile'); if (f) f.value = '';
  const f2 = document.getElementById('importFile'); if (f2) f2.value = '';
  const mapWrap = document.getElementById('importMapWrap'); if (mapWrap) { mapWrap.hidden = true; mapWrap.innerHTML = ''; }
  const prev = document.getElementById('importPreview'); if (prev) prev.innerHTML = '';
  const commit = document.getElementById('importCommitBtn'); if (commit) { commit.disabled = true; commit.textContent = 'Import'; }
  if (!m.open) { try { m.showModal(); } catch {} }
}
function closeImport() { const m = document.getElementById('importModal'); if (m && m.open) { try { m.close(); } catch {} } }
async function readImportSource() {
  const fileEl = document.getElementById('importModalFile') || document.getElementById('importFile');
  const file = fileEl && fileEl.files && fileEl.files[0];
  if (file) {
    if (/\.(xlsx|xls)$/i.test(file.name) && window.XLSX) {
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).filter(r => r.some(x => String(x).trim() !== ''));
      return { headers: rows[0] || [], dataRows: rows.slice(1) };
    }
    const rows = parseDelimited(await file.text());
    return { headers: rows[0] || [], dataRows: rows.slice(1) };
  }
  const rows = parseDelimited(document.getElementById('importText')?.value || '');
  return { headers: rows[0] || [], dataRows: rows.slice(1) };
}
function mapSelects(headers, mapping, fields) {
  const opts = (sel) => ['<option value="-1">—</option>'].concat((headers || []).map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${escapeHtml(String(h || '').trim().slice(0, 28) || ('Kolom ' + (i + 1)))}</option>`)).join('');
  return `<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Pasangkan kolom (ditebak otomatis — ubah bila perlu):</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">
    ${(fields || []).map(f => `<label style="font-size:11px;color:#64748b">${f.label}<select data-map="${f.key}" style="width:100%;height:34px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;margin-top:2px">${opts(mapping[f.key])}</select></label>`).join('')}
    </div>`;
}
function readMapping(keys) {
  const out = {};
  keys.forEach(k => { const el = document.querySelector(`#importMapWrap select[data-map="${k}"]`); out[k] = el ? Number(el.value) : -1; });
  return out;
}
function renderSalesPreview() {
  const mapping = readMapping(['order', 'sku', 'name', 'qty', 'price', 'date', 'buyer', 'status']);
  const res = resolveOrders(buildOrders(importDataRows, mapping), Storage.getAllItems());
  importOrders = res.orders;
  const total = importOrders.reduce((s, o) => s + (o.total || 0), 0);
  const commit = document.getElementById('importCommitBtn');
  if (commit) commit.disabled = !importOrders.some(o => o.lines.some(l => l.itemId));
  document.getElementById('importPreview').innerHTML = `
    <div style="font-size:12px;color:#334155;margin-bottom:6px"><b>${importOrders.length}</b> pesanan • <b>${res.matched}</b> baris cocok${res.unmatched ? ` • <span style="color:#b45309">${res.unmatched} belum cocok</span>` : ' • semua cocok'} • total <b>${Reports.formatCurrency(total)}</b></div>
    <div style="max-height:220px;overflow:auto"><table class="report-table"><thead><tr><th>Pesanan</th><th>Tanggal</th><th>Pembeli</th><th>Item</th><th class="amount-col">Total</th></tr></thead><tbody>
    ${importOrders.slice(0, 50).map(o => `<tr><td style="font-size:11px">${escapeHtml(o.orderId)}</td><td style="font-size:11px">${escapeHtml(o.date)}</td><td style="font-size:11px">${escapeHtml(o.buyer || '—')}</td><td style="font-size:11px">${o.lines.map(l => `${l.qty}× ${escapeHtml(l.name || '(?)')}${l.itemId ? '' : ' ⚠'}`).join(', ')}</td><td class="amount-col">${Reports.formatCurrency(o.total)}</td></tr>`).join('')}
    </tbody></table></div>
    <p style="font-size:11px;color:#94a3b8;margin-top:6px">Tanda ⚠ = belum cocok ke barang (nama/SKU beda) → tidak ikut diimpor. Rapikan nama barang di Stok lalu ulangi.</p>`;
}
function renderProductsPreview() {
  const mapping = readMapping(['name', 'sku', 'size', 'color', 'price', 'cost', 'discount', 'stock', 'min']);
  importProducts = buildProducts(importDataRows, mapping).filter(p => p.name);
  const withSku = importProducts.filter(p => p.sku).length;
  const commit = document.getElementById('importCommitBtn');
  if (commit) commit.disabled = importProducts.length === 0;
  const variant = (p) => [p.size, p.color].filter(Boolean).join('/') || '—';
  document.getElementById('importPreview').innerHTML = `
    <div style="font-size:12px;color:#334155;margin-bottom:6px"><b>${importProducts.length}</b> produk siap diimpor (${withSku} ber-SKU). Upsert per SKU/nama.</div>
    <div style="max-height:220px;overflow:auto"><table class="report-table"><thead><tr><th>Nama</th><th>SKU</th><th>Varian</th><th class="amount-col">Jual</th><th class="amount-col">Modal</th><th class="amount-col">Stok</th></tr></thead><tbody>
    ${importProducts.slice(0, 50).map(p => `<tr><td style="font-size:11px">${escapeHtml(p.name)}</td><td style="font-size:11px">${escapeHtml(p.sku || '—')}</td><td style="font-size:11px">${escapeHtml(variant(p))}</td><td class="amount-col">${Reports.formatCurrency(p.price)}${p.discountPct ? ` <small>(−${p.discountPct}%)</small>` : ''}</td><td class="amount-col">${Reports.formatCurrency(p.cost)}</td><td class="amount-col">${p.stock}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function renderWaPreview() {
  const order = parseWaOrder(document.getElementById('importText')?.value || '', Storage.getAllItems());
  importOrders = order.lines.length ? [order] : [];
  const commit = document.getElementById('importCommitBtn');
  if (commit) commit.disabled = !order.lines.some(l => l.itemId);
  document.getElementById('importPreview').innerHTML = `
    <div style="font-size:12px;color:#334155;margin-bottom:6px">${order.lines.length} baris • total <b>${Reports.formatCurrency(order.total)}</b>${order.unmatched.length ? ` • <span style="color:#b45309">${order.unmatched.length} belum cocok</span>` : ''}</div>
    <div style="max-height:220px;overflow:auto"><table class="report-table"><thead><tr><th>Barang</th><th class="amount-col">Qty</th><th class="amount-col">Harga</th><th></th></tr></thead><tbody>
    ${order.lines.map(l => `<tr><td style="font-size:11px">${escapeHtml(l.name)}</td><td class="amount-col">${l.qty}</td><td class="amount-col">${Reports.formatCurrency(l.price)}</td><td>${l.itemId ? '✓' : '⚠ belum cocok'}</td></tr>`).join('')}
    </tbody></table></div>`;
}
async function handleImportParse() {
  try {
    if (importMode === 'wa') { renderWaPreview(); return; }
    const src = await readImportSource();
    importDataRows = src.dataRows;
    if (!importDataRows.length) return UI.showError('Tidak ada baris data terbaca');
    const mapWrap = document.getElementById('importMapWrap');
    if (importMode === 'products') {
      mapWrap.hidden = false;
      mapWrap.innerHTML = mapSelects(src.headers, autoMapProductColumns(src.headers), [
        { key: 'name', label: 'Nama produk' }, { key: 'sku', label: 'SKU/Kode' },
        { key: 'barcode', label: 'Barcode' }, { key: 'unit', label: 'Satuan' },
        { key: 'category', label: 'Kategori' },
        { key: 'size', label: 'Ukuran' }, { key: 'color', label: 'Warna' },
        { key: 'price', label: 'Harga jual' }, { key: 'cost', label: 'Modal/HPP' },
        { key: 'discount', label: 'Diskon (%)' }, { key: 'stock', label: 'Stok' }, { key: 'min', label: 'Min' },
      ]);
      renderProductsPreview();
    } else {
      mapWrap.hidden = false;
      mapWrap.innerHTML = mapSelects(src.headers, autoMapColumns(src.headers), [
        { key: 'order', label: 'Order/Pesanan' }, { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Nama produk' }, { key: 'qty', label: 'Qty' },
        { key: 'price', label: 'Harga' }, { key: 'date', label: 'Tanggal' },
        { key: 'buyer', label: 'Pembeli' }, { key: 'status', label: 'Status' },
      ]);
      renderSalesPreview();
    }
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal membaca data'); }
}
function handleImportCommit() {
  try {
    if (importMode === 'products') {
      const r = Storage.importItemsBulk(importProducts);
      UI.showSuccess(`Produk diimpor: ${r.added} baru, ${r.updated} diperbarui${r.skipped ? `, ${r.skipped} dilewati` : ''}`);
      refreshStock();
    } else {
      const channel = importMode === 'wa' ? 'whatsapp' : 'marketplace';
      const created = Storage.createSalesFromOrders(importOrders, { channel });
      if (!created.length) return UI.showError('Tidak ada baris yang cocok untuk disimpan');
      UI.showSuccess(`${created.length} penjualan diimpor (${channel}) — stok & jurnal diperbarui`);
      refresh();
    }
    closeImport();
    queueMirror();
  } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal mengimpor'); }
}

function handleStockDelete(id) {
  const it = Storage.getItemById(id);
  if (!it) return;
  if (!confirm(`Hapus barang “${it.name}”? (transaksi lama tidak ikut terhapus)`)) return;
  try {
    Storage.deleteItem(id);
    Storage.logAudit('delete', 'item', id, { name: it.name }, null);
    UI.showSuccess('Barang dihapus');
    refreshStock();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menghapus barang');
  }
}

/* ===== Beli supplier ===== */
function refreshSuppliers() {
  UI.renderSuppliers(Storage.getAllPurchases());
}
function handleBuySave() {
  const d = UI.getBuyData();
  if (!d.supplier) return UI.showError('Tulis dulu nama supplier');
  if (!d.lines.length) return UI.showError('Pilih dulu barang + isi qty dan harga modal');
  if (Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  try {
    const p = Storage.createPurchase(d);
    const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
    UI.closeBuy();
    UI.showSuccess(`Beli ke ${p.supplier} ${fmt(p.totalCost)} — jadi hutang, stok masuk`);
    refreshStock();
    refreshSuppliers();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan pembelian');
  }
}
function handleSupplierPay(id) {
  const p = Storage.getPurchaseById(id);
  if (p) UI.openSupplierPay(p);
}
function handleSupplierPaySubmit() {
  const d = UI.getSupplierPayData();
  if (!d.id) return;
  if (Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  try {
    const p = Storage.addPurchasePayment(d.id, d);
    const out = Storage.purchaseOutstanding(p);
    UI.closeSupplierPay();
    UI.showSuccess(out <= 0.01 ? `Lunas! ${p.supplier}` : `Bayar tercatat — sisa Rp${Math.round(out).toLocaleString('id-ID')}`);
    refreshSuppliers();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan pembayaran');
  }
}
function handleSupplierDelete(id) {
  const p = Storage.getPurchaseById(id);
  if (!p) return;
  if (!confirm(`Hapus pembelian ke ${p.supplier}? Stok akan dikembalikan.`)) return;
  try {
    Storage.deletePurchase(id);
    UI.showSuccess('Pembelian dihapus, stok dikembalikan');
    refreshStock();
    refreshSuppliers();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menghapus (stok sudah terjual?)');
  }
}

/* ===== Gaji ===== */
function payrollMonthKey(d) {
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
function payrollPaidMap(monthKey) {
  const map = {};
  currentEntries.forEach(e => {
    if (e.category === 'gaji-out' && String(e.date || '').slice(0, 7) === monthKey && e.person) map[e.person] = true;
  });
  // cocokkan nama (case-insensitive) ke id karyawan
  const out = {};
  Storage.getAllEmployees().forEach(emp => {
    if (Object.keys(map).some(n => n.toLowerCase() === emp.name.toLowerCase())) out[emp.id] = true;
  });
  return out;
}
function refreshPayroll() {
  const emps = Storage.getAllEmployees();
  const now = new Date();
  const key = payrollMonthKey(now);
  const monthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const active = emps.filter(e => e.active !== false && Storage.empGross(e) > 0);
  const total = active.reduce((s, e) => s + Storage.empGross(e), 0);
  UI.renderPayrollSummary(total, active.length, monthLabel);
  UI.renderEmployees(emps, payrollPaidMap(key));
  UI.renderPayrollRun(emps, payrollPaidMap(key), key);
}
function handleEmpSave() {
  const d = UI.getEmpFormData();
  if (!d.name) return UI.showError('Nama karyawan wajib diisi');
  if (!(d.baseSalary > 0)) return UI.showError('Gaji pokok harus lebih dari 0');
  try {
    const saved = Storage.saveEmployee(d);
    Storage.logAudit(d.id ? 'update' : 'create', 'employee', saved.id, null, { name: saved.name });
    UI.showSuccess(`Karyawan “${saved.name}” disimpan`);
    UI.resetEmpForm();
    refreshPayroll();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan karyawan');
  }
}
function handleEmpEdit(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (e) UI.fillEmpForm(e);
}
function handleEmpDelete(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (!e) return;
  if (!confirm(`Hapus karyawan “${e.name}”? (gaji yang sudah dibuat tidak ikut terhapus)`)) return;
  Storage.deleteEmployee(id);
  Storage.logAudit('delete', 'employee', id, { name: e.name }, null);
  UI.showSuccess('Karyawan dihapus');
  refreshPayroll();
  queueMirror();
}
function handlePayrollRun() {
  const emps = Storage.getAllEmployees();
  if (!emps.length) return UI.showError('Belum ada karyawan');
  const now = new Date();
  const key = payrollMonthKey(now);
  const monthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const sel = UI.getPayrollRun();
  if (!sel.length) return UI.showInfo('Centang dulu karyawan yang mau diproses');
  const payment = document.getElementById('payrollPayment')?.value || 'transfer';
  const date = now.toISOString().split('T')[0];
  if (Storage.isMonthLocked(date)) return UI.showError(`Bulan ${key} terkunci — buka di Pengaturan`);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  let ok = 0, compTotal = 0;
  sel.forEach(s => {
    const e = emps.find(x => x.id === s.id);
    if (!e) return;
    try {
      const kb = employeeKasbonDue(e, payrollCache[e.id] || {});
      const slip = computeSlip(e, { overtime: s.overtime, kasbon: kb.due, thr: s.withThr ? thrAmount(e, now) : 0, pph: s.withPph, refDate: now });
      const bits = [`pokok ${fmt(slip.base)}`];
      if (slip.allow > 0) bits.push(`tunj ${fmt(slip.allow)}`);
      if (slip.overtime > 0) bits.push(`lembur ${fmt(slip.overtime)}`);
      if (slip.thr > 0) bits.push(`THR ${fmt(slip.thr)}`);
      const deds = [];
      if (slip.ded.kesSelf > 0) deds.push(`BPJS Kes ${fmt(slip.ded.kesSelf)}`);
      if (slip.ded.jhtSelf > 0) deds.push(`JHT ${fmt(slip.ded.jhtSelf)}`);
      if (slip.ded.jpSelf > 0) deds.push(`JP ${fmt(slip.ded.jpSelf)}`);
      if (slip.ded.pph21 > 0) deds.push(`PPh ${fmt(slip.ded.pph21)}`);
      if (slip.kasbon > 0) deds.push(`kasbon ${fmt(slip.kasbon)}`);
      Storage.createEntry({
        date, type: 'expense', category: 'gaji-out', payment,
        description: `Gaji ${monthLabel} — ${e.name} (${bits.join(' + ')}${deds.length ? ` − ${deds.join(' + ')}` : ''})`,
        amount: slip.takeHome, person: e.name,
        payroll: { base: slip.base, allow: slip.allow, overtime: slip.overtime, thr: slip.thr, ded: slip.ded, comp: slip.comp, kasbon: slip.kasbon, takeHome: slip.takeHome, employerCost: slip.employerCost }
      });
      if (slip.kasbon > 0 && kb.detail.length) {
        let rem = slip.kasbon;
        kb.detail.forEach(d => {
          if (rem <= 0) return;
          const a = Math.min(rem, d.outstanding);
          if (a > 0) { try { Storage.applyPayrollKasbon(d.loan.id, a, date, key); } catch {} rem -= a; }
        });
      }
      compTotal += slip.totalComp;
      ok++;
    } catch {}
  });
  // Iuran perusahaan (BPJS) jadi beban + hutang BPJS
  if (compTotal > 0) {
    try {
      Storage.postJournal({
        id: `BPJS-${key}-${Date.now().toString(36)}`,
        date, memo: `Iuran BPJS perusahaan ${monthLabel}`, ref: 'payroll-bpjs', refId: key,
        lines: [
          { account: '6203', debit: Math.round(compTotal), credit: 0, memo: `BPJS ${monthLabel}` },
          { account: '2110', debit: 0, credit: Math.round(compTotal), memo: `BPJS ${monthLabel}` },
        ]
      });
    } catch {}
  }
  Storage.logAudit('create', 'payroll-run', key, null, { count: ok, month: monthLabel });
  UI.showSuccess(ok ? `Gaji ${monthLabel}: ${ok} karyawan diproses (THP)` : 'Tidak ada yang diproses');
  refreshPayroll();
  refresh();
}
/* ===== Kalkulator Pesangon / PHK (PP 35/2021) ===== */
function openSeverance() {
  const sel = document.getElementById('sevEmp');
  if (sel) {
    const emps = Storage.getAllEmployees().filter(e => e.active !== false);
    sel.innerHTML = '<option value="">— pilih (opsional) —</option>' + emps.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
  }
  const m = document.getElementById('severanceModal');
  if (m && !m.open) { try { m.showModal(); } catch {} }
}
function sevFillFromEmp() {
  const id = document.getElementById('sevEmp')?.value;
  if (!id) return;
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (!e) return;
  const wage = (Number(e.baseSalary) || 0) + (Number(e.allowance) || 0);
  const tm = tenureMonths(e.startDate, new Date());
  const lv = Storage.getLeave(e.id, new Date().getFullYear());
  const bal = leaveBalance(lv.entitled, lv.taken, lv.comp);
  const set = (id2, v) => { const el = document.getElementById(id2); if (el) el.value = v; };
  set('sevWage', String(wage));
  set('sevTenure', String(tm));
  set('sevLeave', String(bal));
  set('sevLeaveVal', String(Math.round(wage / 30)));
}
function handleSeveranceCalc() {
  const wage = Math.round(Number(UI.parseIdrInput(document.getElementById('sevWage')?.value || '')) || 0);
  const tm = Math.max(parseInt(document.getElementById('sevTenure')?.value || '0', 10) || 0, 0);
  const reason = document.getElementById('sevReason')?.value || 'normal';
  const remainingLeaveDays = Math.max(Number(document.getElementById('sevLeave')?.value) || 0, 0);
  const leaveDayValue = Math.round(Number(UI.parseIdrInput(document.getElementById('sevLeaveVal')?.value || '')) || 0);
  const extra = Math.round(Number(UI.parseIdrInput(document.getElementById('sevExtra')?.value || '')) || 0);
  const r = severancePay({ wage, tenureMonths: tm, reason, remainingLeaveDays, leaveDayValue, extra });
  const fmt = (v) => 'Rp' + Math.round(v).toLocaleString('id-ID');
  const out = document.getElementById('sevResult');
  if (!out) return;
  out.innerHTML = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;font-size:12px">
    <div style="font-size:11px;color:#64748b;margin-bottom:6px">${escapeHtml(r.reasonLabel)} • masa kerja ${Math.floor(tm / 12)} th ${tm % 12} bln</div>
    <div>Uang Pesangon (${r.upMonths} bln): <b>${fmt(r.up)}</b></div>
    <div>Uang Penghargaan Masa Kerja (${r.upmkMonths} bln): <b>${fmt(r.upmk)}</b></div>
    <div>Uang Penggantian Hak (+cuti/lain): <b>${fmt(r.uph)}</b></div>
    <div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px;font-size:14px">Total: <b>${fmt(r.total)}</b></div>
  </div>`;
  Storage.logAudit('create', 'severance-calc', '', null, { reason, tenure: tm, total: r.total });
}
function handleEmpSlip(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (!e) return;
  const now = new Date();
  const key = payrollMonthKey(now);
  const monthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const rows = currentEntries.filter(x => x.category === 'gaji-out' && String(x.date || '').slice(0, 7) === key && (x.person || '').toLowerCase() === e.name.toLowerCase());
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const esc = (s) => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
  const total = rows.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const who = [e.gender === 'P' ? 'Perempuan' : e.gender === 'L' ? 'Laki-laki' : '', e.role || '', e.contract || ''].filter(Boolean).join(' • ');
  const det = rows.map(x => {
    const p = x.payroll || {};
    const d = p.ded || {};
    const lines = [
      ['Gaji pokok', p.base], ['Tunjangan', p.allow], ['Lembur', p.overtime], ['THR', p.thr],
      ['BPJS Kes (1%)', d.kesSelf ? -d.kesSelf : 0], ['JHT (2%)', d.jhtSelf ? -d.jhtSelf : 0],
      ['JP (1%)', d.jpSelf ? -d.jpSelf : 0], ['PPh 21', d.pph21 ? -d.pph21 : 0],
    ].filter(([, v]) => Number(v) !== 0);
    return { date: x.date, desc: x.description, lines, thp: x.amount };
  });
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<html><head><title>Slip Gaji ${esc(e.name)}</title></head><body>
    <div style="font-family:Arial,sans-serif;max-width:440px;margin:0 auto">
      <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">
        <div style="font-size:18px;font-weight:800">SLIP GAJI</div>
        <div style="font-size:12px">${esc(monthLabel)}</div>
      </div>
      <table style="width:100%;font-size:13px;margin-bottom:10px">
        <tr><td style="color:#555">Nama</td><td><b>${esc(e.name)}</b></td></tr>
        ${who ? `<tr><td style="color:#555">Detail</td><td>${esc(who)}</td></tr>` : ''}
        ${e.phone ? `<tr><td style="color:#555">HP</td><td>${esc(e.phone)}</td></tr>` : ''}
      </table>
      ${det.length ? det.map(g => `
        <div style="font-size:12px;color:#555;margin:6px 0">${esc(g.date)} — ${esc(g.desc || '')}</div>
        <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:8px">
          ${g.lines.map(([k, v]) => `<tr><td style="padding:4px 6px;border:1px solid #ddd">${esc(k)}</td><td style="padding:4px 6px;border:1px solid #ddd;text-align:right">${v < 0 ? '−' : ''}${fmt(Math.abs(v))}</td></tr>`).join('')}
          <tr><td style="padding:4px 6px;border:1px solid #ddd"><b>THP diterima</b></td><td style="padding:4px 6px;border:1px solid #ddd;text-align:right"><b>${fmt(g.thp)}</b></td></tr>
        </table>`).join('') : '<p style="font-size:13px">Belum ada pembayaran bulan ini.</p>'}
      <div style="font-size:13px"><b>Total diterima: ${fmt(total)}</b></div>
    </div><script>onload=()=>{print();}<\/script></body></html>`);
  w.document.close();
}

/* ===== Kas & transfer ===== */
function kasRows() {
  const bal = balances(Storage.getAllJournals());
  return ACCOUNTS.filter(a => a.payment && a.type === 'asset').map(a => ({
    code: a.code, label: a.name, icon: cashIcon(a.payment), payment: a.payment,
    balance: (bal[a.code]?.debit || 0) - (bal[a.code]?.credit || 0)
  }));
}
function cashIcon(payment) {
  return { cash: '💵', transfer: '🏦', qris: '📱', ewallet: '📲', debit: '💳', other: '📦' }[payment] || '💰';
}
function refreshKas() {
  UI.renderKas(kasRows());
}
function handleTransfer() {
  if (blockKasir()) return;
  const d = UI.getTransferFormData();
  if (!d.amount || d.amount <= 0) return UI.showError('Nominal transfer harus lebih dari 0');
  if (d.from === d.to) return UI.showError('Kas asal dan tujuan harus beda');
  if (d.date && Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  try {
    const j = buildTransferJournal({ fromPayment: d.from, toPayment: d.to, amount: d.amount, date: d.date, memo: 'Transfer antar kas' });
    if (!j) throw new Error('Transfer tidak valid');
    Storage.postJournal(j);
    Storage.logAudit('create', 'transfer', j.id, null, { from: d.from, to: d.to, amount: d.amount });
    UI.showSuccess('Transfer tercatat');
    document.getElementById('transferForm')?.reset();
    const td = document.getElementById('transferDate');
    if (td) td.value = new Date().toISOString().split('T')[0];
    refreshKas();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal transfer');
  }
}
function handleRecon() {
  if (blockKasir()) return;
  const d = UI.getReconFormData();
  const rows = kasRows();
  const row = rows.find(r => r.payment === d.payment);
  if (!row) return UI.showError('Kas tidak ditemukan');
  const diff = Math.round(d.actual) - Math.round(row.balance);
  const box = document.getElementById('reconResult');
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  if (diff === 0) {
    if (box) box.innerHTML = `✅ <b>Cocok!</b> Catatan ${fmt(row.balance)} = fisik ${fmt(d.actual)}.`;
    return;
  }
  try {
    const j = buildAdjustJournal({
      account: row.code, amount: Math.abs(diff),
      date: new Date().toISOString().split('T')[0],
      memo: `Selisih kas ${row.label}: catat ${fmt(row.balance)}, fisik ${fmt(d.actual)}`,
      increase: diff > 0
    });
    if (j) Storage.postJournal(j);
    Storage.logAudit('create', 'recon', j ? j.id : '', null, { account: row.code, diff });
    if (box) box.innerHTML = `⚠️ Selisih <b>${fmt(diff)}</b> dicatat sebagai penyesuaian. Saldo kini ${fmt(d.actual)}.`;
    UI.showSuccess('Selisih dicatat');
    document.getElementById('reconForm')?.reset();
    refreshKas();
    render();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal rekonsiliasi');
  }
}

/* ===== Import mutasi bank ===== */
function parseIDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}
function parseIAmount(s) {
  s = String(s || '').trim();
  if (!s) return 0;
  // "1.234.567,89" → 1234567.89 ; "1,234.56" → 1234.56 ; "1.234" → 1234
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let norm = s.replace(/[^0-9,.-]/g, '');
  if (lastComma > lastDot) norm = norm.replace(/\./g, '').replace(',', '.');
  else norm = norm.replace(/,/g, '');
  const n = Number(norm);
  return isFinite(n) ? Math.round(n) : 0;
}
function handleBankFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = String(e.target.result || '').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('File kosong');
      const head0 = lines.find(l => /tanggal|date/i.test(l)) || lines[0];
      const delim = ((head0.match(/;/g) || []).length > (head0.match(/,/g) || []).length) ? ';' : ',';
      const split = (l) => Storage.parseCsvRow(l, delim);
      // cari baris header
      let hi = 0;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const low = lines[i].toLowerCase();
        if (/tanggal|date/.test(low) && /keterangan|description|uraian|mutasi|debit|kredit|credit|jumlah|amount/.test(low)) { hi = i; break; }
      }
      const head = split(lines[hi]).map(h => h.toLowerCase());
      const col = (names) => head.findIndex(h => names.some(n => h.includes(n)));
      const iDate = col(['tanggal', 'date']);
      const iDesc = col(['keterangan', 'description', 'uraian', 'narasi']);
      let iDebit = col(['debit', 'keluar', 'out', 'pengeluaran']);
      let iCredit = col(['kredit', 'credit', 'masuk', 'pemasukan', 'in ']);
      let iMut = col(['mutasi', 'amount', 'jumlah', 'nominal']);
      if (iDate < 0) throw new Error('Kolom tanggal tidak ketemu');
      const rows = [];
      for (let i = hi + 1; i < lines.length; i++) {
        if (/^===/.test(lines[i])) break;
        const c = split(lines[i]);
        const date = parseIDate(c[iDate]);
        if (!date) continue;
        const desc = iDesc >= 0 ? (c[iDesc] || '') : '';
        let masuk = 0, keluar = 0;
        if (iDebit >= 0 || iCredit >= 0) {
          keluar = iDebit >= 0 ? parseIAmount(c[iDebit]) : 0;
          masuk = iCredit >= 0 ? parseIAmount(c[iCredit]) : 0;
        } else if (iMut >= 0) {
          const v = parseIAmount(c[iMut]);
          if (v >= 0) masuk = v; else keluar = -v;
        } else continue;
        if (masuk <= 0 && keluar <= 0) continue;
        const direction = masuk > 0 ? 'in' : 'out';
        const acct = bankAccountSuggestion(desc, direction);
        rows.push({
          key: `${date}|${desc}|${masuk}|${keluar}|${i}`, date, desc: desc.slice(0, 100),
          in: masuk, out: keluar, direction, amount: masuk > 0 ? masuk : keluar,
          counterAccount: acct, suggestCode: acct,
          bankAccount: document.getElementById('bankAccount')?.value || '1101',
          selected: true, matched: false,
        });
      }
      if (!rows.length) throw new Error('Tidak ada baris mutasi terbaca');
      // cocokkan dengan transaksi ada (nominal sama + tanggal ±3 hari + arah sama)
      const existing = currentEntries;
      const bankJs = Storage.getAllJournals().filter(j => (j.ref || '') === 'bank');
      rows.forEach(r => {
        const amt = r.in > 0 ? r.in : r.out;
        const type = r.in > 0 ? 'income' : 'expense';
        const d = new Date(r.date);
        const hitEntry = existing.find(e => {
          if (e.type !== type) return false;
          if (Math.round(Number(e.amount) || 0) !== amt) return false;
          const ed = new Date(e.date);
          if (isNaN(ed)) return false;
          return Math.abs((ed - d) / 86400000) <= 3;
        });
        // Sudah pernah direkonsiliasi (jurnal ref 'bank') → tandai cocok.
        const nearBank = bankJs.some(j => {
          const t = (j.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
          if (Math.round(t) !== amt) return false;
          const jd = new Date(j.date);
          return !isNaN(jd) && Math.abs((jd - d) / 86400000) <= 3;
        });
        r.matchedEntryId = hitEntry ? hitEntry.id : null;
        r.matched = !!hitEntry || nearBank;
        if (r.matched) r.selected = false;
      });
      Storage.upsertBankStatement(rows);
      bankImportRows = rows;
      UI.setBankRows(rows);
      const fresh = rows.filter(r => !r.matched).length;
      UI.showInfo(`${rows.length} baris terbaca, ${fresh} baru`);
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal membaca CSV');
    }
  };
  reader.onerror = () => UI.showError('Gagal membaca file');
  reader.readAsText(file);
}
let bankImportRows = [];
function bankApplySuggest() {
  if (!bankImportRows.length) return UI.showInfo('Belum ada file mutasi');
  let n = 0;
  bankImportRows.forEach(r => {
    if (r.matched) return;
    const acct = bankAccountSuggestion(r.desc, r.direction);
    if (acct !== r.counterAccount) { r.counterAccount = acct; r.selected = true; n++; }
  });
  UI.setBankRows(bankImportRows);
  Storage.upsertBankStatement(bankImportRows);
  UI.showSuccess(n ? `Saran diterapkan ke ${n} baris` : 'Semua baris sudah sesuai saran');
}
function handleBankImport() {
  const rows = UI.getBankSelected();
  if (!rows.length) return UI.showInfo('Tidak ada baris terpilih');
  const bankAccount = document.getElementById('bankAccount')?.value || '1101';
  const lines = rows.map(r => ({
    date: r.date, amount: r.in > 0 ? r.in : r.out, direction: r.in > 0 ? 'in' : 'out',
    counterAccount: r.counterAccount, memo: r.desc || 'Mutasi bank',
  }));
  const res = Storage.importBankLines(lines, { bankAccount });
  rows.forEach(r => Storage.updateBankStatement(r.key, { posted: true }));
  UI.showSuccess(`${res.ok} mutasi direkonsiliasi ke COA${res.locked ? ` • ${res.locked} bulan terkunci dilewati` : ''}${res.skipped ? ` • ${res.skipped} tanpa akun` : ''}`);
  UI.setBankRows([]);
  bankImportRows = [];
  refresh();
}

/* ===== Penjualan ===== */
function handleSaleSave() {
  const d = UI.getSaleData();
  if (!d.lines.length) return UI.showError('Pilih dulu barang + isi qty dan harga');
  if (!d.date) return UI.showError('Tanggal wajib diisi');
  if (Storage.isMonthLocked(d.date)) return UI.showError(`Bulan ${String(d.date).slice(0, 7)} terkunci — buka di Pengaturan`);
  // Cek stok dulu biar pesan jelas sekaligus (per toko aktif) — preorder luar negeri tidak pakai stok.
  const items = Storage.getAllItems();
  const shopId = Storage.getActiveShopId();
  if (d.mode !== 'preorder') {
    for (const l of d.lines) {
      const it = items.find(x => x.id === l.itemId);
      if (!it) return UI.showError('Ada barang yang tidak dikenal — pilih ulang');
      const avail = Storage.shopStockOf(it, shopId);
      if (l.qty > avail) return UI.showError(`Stok ${it.name} di toko ini kurang (sisa ${avail}, mau ${l.qty})`);
    }
  }
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const descBase = d.note || `Jual: ${d.lines.map(l => `${l.qty}× ${l.name}`).join(', ')}`;
  const desc = d.discount > 0 ? `${descBase} • diskon ${fmt(d.discount)}` : descBase;
  // Penjualan KREDIT / prepaid: satu alur — barang ready OR preorder luar negeri.
  const isPreorder = d.mode === 'preorder';
  if (d.credit || isPreorder) {
    if (!d.customer) return UI.showError('Isi nama pelanggan dulu');
    // Preorder (beli dari luar negeri): tanpa ambil stok — barang dibeli setelah DP.
    if (isPreorder) {
      try {
        const poTarget = document.getElementById('salePoTarget')?.value === 'stock' ? 'stock' : 'customer';
        const poChannel = document.getElementById('salePoChannel')?.value === 'lokal' ? 'lokal' : 'luar';
        if (poTarget === 'stock' && d.lines.some(l => !l.itemId)) return UI.showError('Order stok: pilih barang dari daftar produk');
        if (poTarget === 'stock' && !d.customer) return UI.showError('Order stok: isi nama supplier/toko pada kolom pelanggan');
        const po = Storage.createPreorder({
          target: poTarget, channel: poChannel, shopId: d.shopId,
          date: d.date, customer: d.customer || (poTarget === 'stock' ? 'Pembelian stok' : ''), items: d.lines.map(l => ({ itemId: l.itemId, name: l.name, qty: l.qty, price: l.price })),
          deposit: d.deposit, payment: d.payment, note: d.note, months: d.monthsEta || 1, discount: d.discount, fx: d.fx,
        });
        UI.closeSale();
        if (poTarget === 'stock') {
          UI.showSuccess(`Order stok ${fmt(po.sellTotal)} tersimpan (${poChannel === 'lokal' ? 'lokal' : 'luar negeri'})  pantau di Pembelian → sisi beli`);
        } else {
        UI.showSuccess(`Preorder ${fmt(po.sellTotal)} tersimpan${po.deposit > 0 ? ` DP ${fmt(po.deposit)} masuk kas` : ''} est datang ${po.monthsEta || 1} bulan  pantau di Status Pesanan`);
        }
        refresh();
        refreshSalesPage();
      } catch (err) {
        UI.showError(err && err.message ? err.message : 'Gagal menyimpan preorder');
      }
      return;
    }
    if (!d.dueDate) return UI.showError('Isi tanggal jatuh tempo');
    try {
      const cs = Storage.createCreditSale({
        date: d.date, dueDate: d.dueDate, customer: d.customer, person: d.customer,
        lines: d.lines.map(l => ({ itemId: l.itemId, qty: l.qty, price: l.price, name: l.name })),
        discount: d.discount, ppn: d.ppn, deposit: d.deposit, depositPct: d.depositPct,
        terms: d.terms, payment: d.payment, note: d.note, flow: 'order',
      });
      Storage.logAudit('create', 'credit-sale', cs.id, null, { total: cs.total, deposit: cs.deposit });
      UI.closeSale();
      UI.showSuccess(`Penjualan kredit ${fmt(cs.total)} tersimpan • sisa ${fmt(Storage.creditOutstanding(cs))} • pantau di Status Pesanan`);
      refresh();
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal menyimpan penjualan kredit');
    }
    return;
  }
  try {
    const entry = Storage.createEntry({
      date: d.date, type: 'income', category: 'jualan', payment: d.payment,
      description: desc.slice(0, 120), amount: d.total,
      person: d.customer, ppn: d.ppn,
      sale: { lines: d.lines.map(l => ({ itemId: l.itemId, qty: l.qty, price: l.price })), total: d.total, subtotal: d.subtotal, discount: d.discount }
    });
    Storage.logAudit('create', 'sale', entry.id, null, { total: d.total, discount: d.discount, lines: d.lines.length });
    UI.closeSale();
    UI.showSuccess(`Penjualan ${fmt(d.total)} tersimpan — stok berkurang`);
    UI.openReceipt(entry);
    refresh();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan penjualan');
  }
}

/* ===== Halaman Karyawan & Gaji ===== */
let payrollViewMonth = '';
let payrollEmpSearch = '';
let payrollCache = {}; // empId -> {overtime, withThr, withPph, checked}
let payrollRates = {}; // tarif iuran bulan ini ({kesComp,...} pecahan) — default BPJS bila kosong

function payrollMonthEnd(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) { const n = new Date(); return n; }
  return new Date(y, m, 0);
}
function payrollMonthLabel(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
}
function ensurePayrollMonth() {
  if (!/^\d{4}-\d{2}$/.test(payrollViewMonth)) {
    const n = new Date();
    payrollViewMonth = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }
  const per = document.getElementById('payrollPeriod');
  if (per && !per.value) per.value = payrollViewMonth;
  if (per && per.value !== payrollViewMonth && document.activeElement !== per) per.value = payrollViewMonth;
}
function loadPayrollCache() {
  ensurePayrollMonth();
  const draft = Storage.getPayrollDraft(payrollViewMonth) || {};
  const saved = draft.items || {};
  payrollRates = sanitizeRates(draft.rates && Object.keys(draft.rates).length ? draft.rates : {});
  payrollCache = {};
  Storage.getAllEmployees().forEach(e => {
    const s = saved[e.id] || {};
    payrollCache[e.id] = {
      overtime: Math.max(Number(s.overtime) || 0, 0),
      bonus: Math.max(Number(s.bonus) || 0, 0),
      deduct: Math.max(Number(s.deduct) || 0, 0),
      hadir: Number(s.hadir) > 0 ? Number(s.hadir) : 0,
      withThr: !!s.withThr,
      withPph: s.withPph === undefined ? true : !!s.withPph,
      checked: s.checked === undefined ? true : !!s.checked,
      kasbonSkip: !!s.kasbonSkip,
      kasbonAmount: Number.isFinite(Number(s.kasbonAmount)) ? Math.max(Number(s.kasbonAmount), 0) : null,
      lemburJam: Math.max(Number(s.lemburJam) || 0, 0),
      gantiCuti: !!s.gantiCuti,
      cutiDiambil: Math.max(Number(s.cutiDiambil) || 0, 0),
      pphOverride: Number.isFinite(Number(s.pphOverride)) && Number(s.pphOverride) >= 0 ? Math.round(Number(s.pphOverride)) : null
    };
  });
}
// Upah lembur bulan ini: dari JAM (KEP-102) bila ada; kalau tidak, pakai rupiah lama.
function rowOvertime(emp, c) {
  const hours = Math.max(Number(c.lemburJam) || 0, 0);
  if (hours > 0) {
    if (c.gantiCuti) return 0;
    return overtimePay((Number(emp.baseSalary) || 0) + (Number(emp.allowance) || 0), hours);
  }
  return Math.max(Number(c.overtime) || 0, 0);
}
function rowCuti(emp, c) {
  const year = Number(String(payrollViewMonth || '').slice(0, 4)) || new Date().getFullYear();
  const lv = Storage.getLeave(emp.id, year);
  return { balance: leaveBalance(lv.entitled, lv.taken, lv.comp), ...lv };
}
function rowUmp(emp) {
  const u = Storage.getUmp().amount;
  return umpCheck((Number(emp.baseSalary) || 0) + (Number(emp.allowance) || 0), u);
}
// Potongan kasbon bulan ini untuk seorang karyawan (dari pinjaman aktif).
// c.kasbonSkip = jeda; c.kasbonAmount = override manual (null = otomatis).
function employeeKasbonDue(emp, c) {
  if (!emp || !c || c.kasbonSkip) return { due: 0, detail: [] };
  const loans = Storage.getKasbonLoans(emp.id, emp.name);
  const reps = Storage.getAllRepayments();
  let cap = 0, autoDue = 0;
  const detail = [];
  loans.forEach(l => {
    const paid = reps.filter(r => r.loanId === l.id).reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const out = Math.max(totalOwed(l) - paid, 0);
    if (out <= 0) return;
    cap += out;
    const inst = Number(l.installmentAmount) || 0;
    const amt = Math.min(inst > 0 ? inst : out, out);
    autoDue += amt;
    detail.push({ loan: l, amount: amt, outstanding: Math.round(out) });
  });
  const due = (c.kasbonAmount != null && Number.isFinite(Number(c.kasbonAmount)))
    ? Math.min(Number(c.kasbonAmount), cap)
    : autoDue;
  return { due: Math.max(Math.round(due), 0), detail };
}
function payRowsForView() {
  ensurePayrollMonth();
  const ref = payrollMonthEnd(payrollViewMonth);
  const paid = payrollPaidMap(payrollViewMonth);
  return Storage.getAllEmployees()
    .filter(e => e.active !== false && Storage.empGross(e) > 0)
    .map(emp => {
      const c = payrollCache[emp.id] || { overtime: 0, bonus: 0, deduct: 0, withThr: false, withPph: true, checked: true };
      const kb = employeeKasbonDue(emp, c);
      const cuti = rowCuti(emp, c);
      const ump = rowUmp(emp);
      const slip = computeSlip(emp, { overtime: rowOvertime(emp, c), overtimeHours: c.lemburJam || 0, gantiCuti: !!c.gantiCuti, cutiDiambil: c.cutiDiambil || 0, bonus: c.bonus, deduct: c.deduct, kasbon: kb.due, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
      const thrNote = c.withThr && slip.thr <= 0 ? 'Masa kerja belum 1 bulan — THR Rp0. Jangan centang bila belum waktunya.' : '';
      return { emp, slip, checked: !!c.checked, paid: !!paid[emp.id], overtime: c.overtime, hadir: c.hadir || 0, withThr: !!c.withThr, withPph: !!c.withPph, thrNote, kasbon: kb.due, kasbonDetail: kb.detail, kasbonSkip: !!c.kasbonSkip, kasbonAmount: c.kasbonAmount, lemburJam: c.lemburJam || 0, gantiCuti: !!c.gantiCuti, cutiDiambil: c.cutiDiambil || 0, cutiBalance: cuti.balance, ump };
    });
}
function renderPayrollView() {
  ensurePayrollMonth();
  const tab = UI.getPayrollTab();
  if (tab === 'data') {
    UI.renderEmpTable(Storage.getAllEmployees(), payrollEmpSearch);
  } else if (tab === 'process') {
    const draft = Storage.getPayrollDraft(payrollViewMonth);
    UI.renderPayrollProcess(payRowsForView(), payrollMonthLabel(payrollViewMonth), draft ? draft.status : 'new');
    renderDecPanel(draft ? draft.status : 'new');
  } else {
    const box = document.getElementById('payrollViewReport');
    if (box) {
      const d = buildPayrollReport();
      box.innerHTML = payrollReportHTML(d);
      window.__payrollRepData = d;
    }
  }
}
function payrollReportHTML(d) {
  // Render ulang via fungsi laporan (simpan sementara ke container laporan)
  const host = document.getElementById('reportContent');
  const prev = host ? host.innerHTML : '';
  const prevData = window.__payrollRepData;
  window.__payrollRepData = d;
  UI.renderReport('payrollrep', d);
  const html = host ? host.innerHTML : '';
  if (host) host.innerHTML = prev;
  window.__payrollRepData = prevData;
  return html;
}

/* ===== Handler halaman gaji ===== */function handlePayrollTab(tab) {
  UI.setPayrollTab(tab);
  renderPayrollView();
}
function handleEmpViewSave() {
  const d = UI.getEmpPanelData();
  if (!d.name) return UI.showError('Nama karyawan wajib diisi');
  if (!(d.baseSalary > 0)) return UI.showError('Gaji pokok harus lebih dari 0');
  try {
    const saved = d.id
      ? Storage.saveEmployee({ ...d, id: d.id })
      : Storage.saveEmployee(d);
    Storage.logAudit(d.id ? 'update' : 'create', 'employee', saved.id, null, { name: saved.name });
    UI.showSuccess(d.id ? 'Perubahan karyawan disimpan' : `Karyawan "${saved.name}" ditambahkan`);
    UI.closeEmpModal();
    loadPayrollCache();
    renderPayrollView();
    refresh();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menyimpan karyawan');
  }
}
function handleEmpViewEdit(id) {
  const e = Storage.getAllEmployees().find(x => x.id === id);
  if (e) UI.openEmpModal(e);
}
function handleEmpImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = String(e.target.result || '').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('File kosong');
      const head0 = lines.find(l => /nama|name/i.test(l)) || lines[0];
      const delim = ((head0.match(/;/g) || []).length > (head0.match(/,/g) || []).length) ? ';' : ',';
      const split = (l) => Storage.parseCsvRow(l, delim);
      let hi = 0;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (/nama|name/i.test(lines[i])) { hi = i; break; }
      }
      const head = split(lines[hi]).map(h => h.toLowerCase());
      const col = (names) => head.findIndex(h => names.some(n => h.includes(n)));
      const iName = col(['nama', 'name']);
      if (iName < 0) throw new Error('Kolom nama tidak ketemu');
      const iRole = col(['jabatan', 'role', 'posisi', 'position']);
      const iContract = col(['status_kerja', 'status kerja', 'contract', 'status']);
      const iBase = col(['gaji_pokok', 'gaji pokok', 'gaji', 'base', 'pokok']);
      const iAllow = col(['tunjangan', 'allowance', 'tunj']);
      const iPhone = col(['hp', 'telepon', 'phone', 'no']);
      const iEmail = col(['email', 'mail']);
      const iStart = col(['bergabung', 'mulai', 'start', 'join', 'masuk']);
      const iPtkp = col(['ptkp']);
      const iNpwp = col(['npwp']);
      const iGender = col(['kelamin', 'gender', 'jk']);
      const iAddr = col(['alamat', 'address']);
      const iBank = col(['bank']);
      const iAcc = col(['rekening', 'norek', 'account']);
      const num = (v) => Math.round(Number(String(v || '').replace(/[^0-9]/g, '')) || 0);
      const existing = new Set(Storage.getAllEmployees().map(x => x.name.toLowerCase()));
      let ok = 0, skipped = 0;
      for (let i = hi + 1; i < lines.length; i++) {
        if (/^===/.test(lines[i])) break;
        const c = split(lines[i]);
        const name = (c[iName] || '').trim();
        if (!name) { skipped++; continue; }
        if (existing.has(name.toLowerCase())) { skipped++; continue; }
        const contractRaw = (iContract >= 0 ? c[iContract] : '').toLowerCase();
        const contract = contractRaw.includes('harian') ? 'harian' : contractRaw.includes('kontrak') ? 'kontrak' : 'tetap';
        const genderRaw = (iGender >= 0 ? c[iGender] : '').toUpperCase();
        const gender = genderRaw.startsWith('P') ? 'P' : genderRaw.startsWith('L') ? 'L' : '';
        const startRaw = (iStart >= 0 ? c[iStart] : '').trim();
        const start = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? startRaw : '';
        try {
          Storage.saveEmployee({
            name,
            role: iRole >= 0 ? c[iRole] : '',
            contract,
            baseSalary: iBase >= 0 ? num(c[iBase]) : 0,
            allowance: iAllow >= 0 ? num(c[iAllow]) : 0,
            phone: iPhone >= 0 ? c[iPhone] : '',
            email: iEmail >= 0 ? c[iEmail] : '',
            startDate: start,
            ptkp: iPtkp >= 0 ? c[iPtkp] : 'TK/0',
            npwp: iNpwp >= 0 ? String(c[iNpwp] || '').replace(/[^0-9]/g, '') : '',
            gender,
            address: iAddr >= 0 ? c[iAddr] : '',
            bankName: iBank >= 0 ? c[iBank] : '',
            bankAcc: iAcc >= 0 ? c[iAcc] : ''
          });
          existing.add(name.toLowerCase());
          ok++;
        } catch { skipped++; }
      }
      UI.showSuccess(`Impor selesai: ${ok} ditambahkan${skipped ? `, ${skipped} dilewati` : ''}`);
      loadPayrollCache();
      renderPayrollView();
      refresh();
      queueMirror();
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal membaca file');
    }
  };
  reader.onerror = () => UI.showError('Gagal membaca file');
  reader.readAsText(file);
}
function handlePayrollPeriod(val) {
  if (/^\d{4}-\d{2}$/.test(val || '')) {
    payrollViewMonth = val;
    loadPayrollCache();
    renderPayrollView();
  }
}
function handlePayrollCheck(id, checked) {
  if (payrollCache[id]) payrollCache[id].checked = !!checked;
  renderPayrollView();
}
function handlePayrollCheckAll(checked) {
  Object.keys(payrollCache).forEach(k => { payrollCache[k].checked = !!checked; });
  renderPayrollView();
}
function handlePayrollExpand(id) {
  UI.setPayrollExpanded(id);
  renderPayrollView();
}
function handlePayrollDetailChange() {
  // baca status checkbox THR/PPh dari DOM ke cache lalu render ulang
  document.querySelectorAll('#payrollTableBody .pay-thr').forEach(el => {
    const id = el.dataset.id;
    if (payrollCache[id]) payrollCache[id].withThr = el.checked;
  });
  document.querySelectorAll('#payrollTableBody .pay-pph').forEach(el => {
    const id = el.dataset.id;
    if (payrollCache[id]) payrollCache[id].withPph = el.checked;
  });
  document.querySelectorAll('#payrollTableBody .pay-kasbon-skip').forEach(el => {
    const id = el.dataset.id;
    if (payrollCache[id]) payrollCache[id].kasbonSkip = el.checked;
  });
  document.querySelectorAll('#payrollTableBody .pay-ganti-cuti').forEach(el => {
    const id = el.dataset.id;
    if (payrollCache[id]) payrollCache[id].gantiCuti = el.checked;
  });
  renderPayrollView();
}
function handlePayrollLembur(input) {
  const empId = input.dataset.id;
  if (empId && payrollCache[empId]) {
    const v = Math.max(Number(UI.parseIdrInput(input.value)) || 0, 0);
    if (input.classList.contains('pay-bonus')) payrollCache[empId].bonus = v;
    else if (input.classList.contains('pay-denda')) payrollCache[empId].deduct = v;
    else if (input.classList.contains('pay-kasbon')) {
      payrollCache[empId].kasbonAmount = String(input.value || '').trim() === '' ? null : v;
    } else if (input.classList.contains('pay-lembur-jam')) {
      payrollCache[empId].lemburJam = Math.max(Number(input.value) || 0, 0);
    } else if (input.classList.contains('pay-cuti')) {
      payrollCache[empId].cutiDiambil = Math.max(Number(input.value) || 0, 0);
    } else payrollCache[empId].overtime = v;
  }
  // Patch sel tanpa render ulang (jaga fokus ketik)
  patchPayrollRow(empId);
}
function handlePayrollHadir(input) {
  const empId = input.dataset.id;
  if (!empId || !payrollCache[empId]) return;
  const n = Math.max(0, Math.min(Number(input.value) || 0, 31));
  payrollCache[empId].hadir = n;
  const std = 22;
  if (n > 0 && n < std && !(payrollCache[empId].deduct > 0)) {
    const suggest = (std - n) * 100000;
    payrollCache[empId].deduct = suggest;
    const dendaInput = document.querySelector(`#payrollTableBody .pay-denda[data-id="${empId}"]`);
    if (dendaInput) dendaInput.value = String(suggest);
    UI.showInfo(`Hadir ${n} hari — denda disarankan Rp${suggest.toLocaleString('id-ID')} (${std - n} × Rp100rb). Ubah bebas di kolom Denda.`);
  }
  patchPayrollRow(empId);
}
function patchPayrollRow(empId) {
  const c = payrollCache[empId];
  const emp = Storage.getAllEmployees().find(x => x.id === empId);
  if (!c || !emp) return;
  const ref = payrollMonthEnd(payrollViewMonth);
  const kb = employeeKasbonDue(emp, c);
  const s = computeSlip(emp, { overtime: rowOvertime(emp, c), overtimeHours: c.lemburJam || 0, gantiCuti: !!c.gantiCuti, cutiDiambil: c.cutiDiambil || 0, bonus: c.bonus, deduct: c.deduct, kasbon: kb.due, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  document.querySelectorAll('#payrollTableBody tr').forEach(tr => {
    const chk = tr.querySelector('.pay-check');
    if (chk && chk.dataset.id === empId) {
      const tds = tr.querySelectorAll('td');
      if (tds[3]) tds[3].textContent = fmt(s.allow + s.overtime + s.bonus + s.thr);
      if (tds[4]) tds[4].textContent = fmt(s.totalDed + s.deduct + s.kasbon);
      if (tds[5]) tds[5].innerHTML = `<b>${fmt(s.takeHome)}</b>`;
    }
  });
  // total footer
  let total = 0;
  Object.keys(payrollCache).forEach(k => {
    const cc = payrollCache[k];
    const em = Storage.getAllEmployees().find(x => x.id === k);
    if (!em || !cc.checked) return;
    const kb2 = employeeKasbonDue(em, cc);
    const ss = computeSlip(em, { overtime: rowOvertime(em, cc), overtimeHours: cc.lemburJam || 0, gantiCuti: !!cc.gantiCuti, cutiDiambil: cc.cutiDiambil || 0, bonus: cc.bonus, deduct: cc.deduct, kasbon: kb2.due, thr: cc.withThr ? thrAmount(em, ref) : 0, pph: cc.withPph, refDate: ref, rates: payrollRates, pphOverride: cc.pphOverride ?? null });
    total += ss.takeHome;
  });
  const foot = document.getElementById('payrollFootTotal');
  if (foot) foot.textContent = fmt(total);
}
function prevMonthKey(key) {
  const [y, m] = String(key || '').split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function handlePayrollRateChange(input) {
  const key = input.dataset.rate;
  if (!key) return;
  const draft = Storage.getPayrollDraft(payrollViewMonth);
  if (draft && draft.status === 'final') { renderPayrollView(); return; }
  const raw = String(input.value || '').replace(',', '.').trim();
  let v = Number(raw);
  if (!Number.isFinite(v) || v < 0) v = 0;
  if (v > 100) v = 100;
  const limit = (RATE_LIMITS[key] ?? 1) * 100;
  if (v > limit) {
    UI.showError(`Tarif ${input.getAttribute('aria-label') || key} maksimal ${limit.toLocaleString('id-ID')}% — ketik angka persen seperti 0,54 (bukan 54)`);
    renderPayrollView();
    return;
  }
  payrollRates = { ...payrollRates, [key]: v / 100 };
  const items = {};
  Object.keys(payrollCache).forEach(k => { items[k] = { ...payrollCache[k] }; });
  syncPayrollInputsFromDOM(items);
  try { Storage.savePayrollDraft(payrollViewMonth, { items, rates: payrollRates, status: draft ? draft.status : 'draft' }); } catch {}
  renderPayrollView();
  queueMirror();
}
function handlePayrollPrintSlip(empId) {
  const emp = Storage.getAllEmployees().find(x => x.id === empId);
  const c = payrollCache[empId];
  if (!emp || !c) return;
  const ref = payrollMonthEnd(payrollViewMonth);
  const kb = employeeKasbonDue(emp, c);
  const slip = computeSlip(emp, { overtime: rowOvertime(emp, c), overtimeHours: c.lemburJam || 0, gantiCuti: !!c.gantiCuti, cutiDiambil: c.cutiDiambil || 0, bonus: c.bonus, deduct: c.deduct, kasbon: kb.due, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
  const label = payrollMonthLabel(payrollViewMonth);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
  const R = slip.rates || {};
  const pct = (v) => ((Number(v) || 0) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
  const trow = (label_, amt, cls) => (amt > 0 ? `<tr><td>${label_}</td><td class="r ${cls || ''}">${fmt(amt)}</td></tr>` : '');
  const win = window.open('', '_blank', 'width=760,height=900');
  if (!win) return UI.showError('Popup diblokir browser — izinkan popup lalu coba lagi');
  win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Slip Gaji ${escapeHtml(emp.name)} — ${escapeHtml(label)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#0f172a;font-size:13px}
    h1{font-size:17px;margin:0} .sub{color:#64748b;font-size:11px;margin:2px 0 16px}
    .box{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:14px}
    .kv{display:grid;grid-template-columns:120px 1fr;gap:4px 12px;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:12px} td{padding:5px 0;border-bottom:1px dashed #e2e8f0}
    td.r{text-align:right;white-space:nowrap;font-weight:700} td.neg{color:#b91c1c} tr.sum td{border-top:2px solid #0f172a;border-bottom:none;font-weight:800}
    .big{font-size:20px;font-weight:800;color:#059669} .foot{margin-top:20px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
    .muted{color:#64748b;font-size:10px} h2{font-size:12px;margin:0 0 6px;color:#334155}
    @media print{ body{margin:12px} }
  </style></head><body>
    <h1>Slip Gaji — ${escapeHtml(label)}</h1>
    <div class="sub">Cetakan di-${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="box"><div class="kv">
      <b>Karyawan</b><span>${escapeHtml(emp.name)}${emp.role ? ' — ' + escapeHtml(emp.role) : ''}</span>
      <b>Status PTKP</b><span>${escapeHtml(emp.ptkp || 'TK/0')}${emp.npwp ? ` • NPWP ${escapeHtml(emp.npwp)}` : ' • tanpa NPWP (+20%)'}</span>
      <b>Masa kerja</b><span>${slip.tenureMonths} bulan</span>
    </div></div>
    <div class="box"><h2>Pendapatan</h2><table>
      ${trow('Gaji pokok', slip.base)}${trow('Tunjangan tetap', slip.allow)}${trow('Lembur', slip.overtime)}
      ${trow('Bonus/insentif', slip.bonus)}${trow('THR Keagamaan', slip.thr)}
      <tr class="sum"><td>Bruto</td><td class="r">${fmt(slip.gross + slip.thr)}</td></tr>
    </table></div>
    <div class="box"><h2>Potongan</h2><table>
      ${trow(`BPJS Kesehatan pekerja (${pct(R.kesSelf)})`, slip.ded.kesSelf, 'neg')}
      ${trow(`JHT pekerja (${pct(R.jhtSelf)})`, slip.ded.jhtSelf, 'neg')}
      ${trow(`JP pekerja (${pct(R.jpSelf)})`, slip.ded.jpSelf, 'neg')}
      ${trow(`PPh 21 TER × netto ${fmt(slip.pphNetto)}`, slip.ded.pph21, 'neg')}
      ${trow('Denda/absensi', slip.deduct, 'neg')}
      ${slip.kasbon > 0 ? trow('Potong kasbon', slip.kasbon, 'neg') : ''}
      <tr class="sum"><td>Total potongan</td><td class="r neg">${fmt(slip.totalDed + slip.deduct + slip.kasbon)}</td></tr>
    </table></div>
    <div class="box" style="text-align:center">Diterima karyawan (take-home pay)<br><span class="big">${fmt(slip.takeHome)}</span></div>
    <div class="box"><h2>Ditanggung perusahaan (tidak dikurangkan)</h2><div class="muted" style="margin-bottom:6px">Total ${fmt(slip.totalComp)}</div><table>
      ${trow(`BPJS Kesehatan (${pct(R.kesComp)})`, slip.comp.kesComp)}
      ${trow(`JHT (${pct(R.jhtComp)})`, slip.comp.jhtComp)}
      ${trow(`JP (${pct(R.jpComp)})`, slip.comp.jpComp)}
      ${trow(`JKK kecelakaan kerja (${pct(R.jkk)})`, slip.comp.jkk)}
      ${trow(`JKM kematian (${pct(R.jkm)})`, slip.comp.jkm)}
    </table></div>
    <div class="foot"><span>Slip ini dibuat otomatis oleh Wynara Accounting</span><span>Tanda tangan pemberi kerja: ______________</span></div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 400);
}
function handlePayrollSlipWa(empId) {
  const emp = Storage.getAllEmployees().find(x => x.id === empId);
  const c = payrollCache[empId];
  if (!emp || !c) return;
  let phone = String(emp.phone || '').replace(/[^0-9]/g, '');
  if (!phone || phone.length < 8) return UI.showError(`No. HP ${emp.name} kosong/tidak valid — isi di Data Karyawan agar slip bisa dikirim`);
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  const ref = payrollMonthEnd(payrollViewMonth);
  const kb = employeeKasbonDue(emp, c);
  const slip = computeSlip(emp, { overtime: rowOvertime(emp, c), overtimeHours: c.lemburJam || 0, gantiCuti: !!c.gantiCuti, cutiDiambil: c.cutiDiambil || 0, bonus: c.bonus, deduct: c.deduct, kasbon: kb.due, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
  const label = payrollMonthLabel(payrollViewMonth);
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const lines = [
    `*Slip Gaji ${label}*`,
    `${emp.name}${emp.role ? ' — ' + emp.role : ''}`,
    '',
    `Bruto: ${fmt(slip.gross + slip.thr)}${slip.thr > 0 ? ` (termasuk THR ${fmt(slip.thr)})` : ''}`,
    slip.ded.kesSelf > 0 ? `BPJS Anda: −${fmt(slip.ded.kesSelf + slip.ded.jhtSelf + slip.ded.jpSelf)}` : '',
    slip.ded.pph21 > 0 ? `PPh 21: −${fmt(slip.ded.pph21)}` : '',
    slip.deduct > 0 ? `Denda: −${fmt(slip.deduct)}` : '',
    slip.kasbon > 0 ? `Kasbon: −${fmt(slip.kasbon)}` : '',
    '',
    `*Diterima: ${fmt(slip.takeHome)}*`,
    '',
    'Dibayar perusahaan (BTW): BPJS Kes, JHT/JP, JKK & JKM.'
  ].filter(l => l !== '').join('\n');
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`;
  window.open(url, '_blank');
  UI.showSuccess('WhatsApp terbuka — teks slip sudah terisi, tinggal tekan kirim');
}
function handlePayrollCopyPrev() {
  ensurePayrollMonth();
  const prev = Storage.getPayrollDraft(prevMonthKey(payrollViewMonth));
  const items = (prev && prev.items) || {};
  if (!Object.keys(items).length) {
    UI.showInfo(`Belum ada draft ${payrollMonthLabel(prevMonthKey(payrollViewMonth))} untuk disalin`);
    return;
  }
  Storage.getAllEmployees().forEach(e => {
    const s = items[e.id] || {};
    payrollCache[e.id] = {
      overtime: Math.max(Number(s.overtime) || 0, 0),
      bonus: Math.max(Number(s.bonus) || 0, 0),
      deduct: Math.max(Number(s.deduct) || 0, 0),
      hadir: Number(s.hadir) > 0 ? Number(s.hadir) : 0,
      withThr: !!s.withThr,
      withPph: s.withPph === undefined ? true : !!s.withPph,
      checked: s.checked === undefined ? true : !!s.checked,
      pphOverride: Number.isFinite(Number(s.pphOverride)) && Number(s.pphOverride) >= 0 ? Math.round(Number(s.pphOverride)) : null
    };
  });
  try { Storage.savePayrollDraft(payrollViewMonth, { items: JSON.parse(JSON.stringify(payrollCache)), rates: payrollRates, status: 'draft' }); } catch {}
  UI.showSuccess('Disalin dari bulan lalu — cukup ubah lembur/bonus/potongan bila beda');
  renderPayrollView();
  queueMirror();
}
function syncPayrollInputsFromDOM(target) {
  // Sinkron lembur/bonus/denda/hadir dari DOM (bila sedang diketik)
  const store = target || payrollCache;
  document.querySelectorAll('#payrollTableBody .pay-lembur, #payrollTableBody .pay-bonus, #payrollTableBody .pay-denda, #payrollTableBody .pay-hadir').forEach(el => {
    const id = el.dataset.id;
    if (!store[id]) return;
    if (el.classList.contains('pay-bonus')) store[id].bonus = Math.max(Number(UI.parseIdrInput(el.value)) || 0, 0);
    else if (el.classList.contains('pay-denda')) store[id].deduct = Math.max(Number(UI.parseIdrInput(el.value)) || 0, 0);
    else if (el.classList.contains('pay-hadir')) store[id].hadir = Math.max(0, Math.min(Number(el.value) || 0, 31));
    else store[id].overtime = Math.max(Number(UI.parseIdrInput(el.value)) || 0, 0);
  });
  document.querySelectorAll('#payrollTableBody .pay-kasbon').forEach(el => {
    const id = el.dataset.id;
    if (!store[id]) return;
    const raw = String(el.value || '').trim();
    store[id].kasbonAmount = raw === '' ? null : Math.max(Number(UI.parseIdrInput(raw)) || 0, 0);
  });
  document.querySelectorAll('#payrollTableBody .pay-lembur-jam').forEach(el => {
    const id = el.dataset.id;
    if (!store[id]) return;
    store[id].lemburJam = Math.max(Number(el.value) || 0, 0);
  });
  document.querySelectorAll('#payrollTableBody .pay-cuti').forEach(el => {
    const id = el.dataset.id;
    if (!store[id]) return;
    store[id].cutiDiambil = Math.max(Number(el.value) || 0, 0);
  });
}
function handlePayrollDraft() {
  ensurePayrollMonth();
  const items = {};
  Object.keys(payrollCache).forEach(k => { items[k] = { ...payrollCache[k] }; });
  syncPayrollInputsFromDOM(items);
  try {
    Storage.savePayrollDraft(payrollViewMonth, { items, rates: payrollRates, status: 'draft' });
    loadPayrollCache();
    UI.showSuccess(`Draft ${payrollMonthLabel(payrollViewMonth)} disimpan`);
    renderPayrollView();
    queueMirror();
  } catch (err) {
    UI.showError('Gagal menyimpan draft');
  }
}
function handlePayrollFinal() {
  ensurePayrollMonth();
  if (Storage.isMonthLocked(payrollViewMonth + '-01')) return UI.showError(`Bulan ${payrollViewMonth} terkunci — buka di Pengaturan`);
  syncPayrollInputsFromDOM();
  const emps = Storage.getAllEmployees();
  const paid = payrollPaidMap(payrollViewMonth);
  const ref = payrollMonthEnd(payrollViewMonth);
  const [y, m] = payrollViewMonth.split('-').map(Number);
  const date = `${payrollViewMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const payment = document.getElementById('payrollViewPayment')?.value || 'transfer';
  const monthLabel = payrollMonthLabel(payrollViewMonth);
  const todo = Object.keys(payrollCache).filter(k => payrollCache[k].checked && !paid[k]);
  if (!todo.length) return UI.showInfo('Tidak ada yang perlu diproses (sudah dibayar / belum dicentang)');
  if (!confirm(`Finalisasi gaji ${monthLabel} untuk ${todo.length} karyawan? Transaksi dicatat dan bulan ditandai final.`)) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  let ok = 0, compTotal = 0;
  todo.forEach(k => {
    const e = emps.find(x => x.id === k);
    if (!e) return;
    const c = payrollCache[k];
    try {
      const kb = employeeKasbonDue(e, c);
      const slip = computeSlip(e, { overtime: rowOvertime(e, c), overtimeHours: c.lemburJam || 0, gantiCuti: !!c.gantiCuti, cutiDiambil: c.cutiDiambil || 0, bonus: c.bonus, deduct: c.deduct, kasbon: kb.due, thr: c.withThr ? thrAmount(e, ref) : 0, pph: c.withPph, refDate: ref, rates: payrollRates, pphOverride: c.pphOverride ?? null });
      const bits = [`pokok ${fmt(slip.base)}`];
      if (slip.allow > 0) bits.push(`tunj ${fmt(slip.allow)}`);
      if (slip.overtime > 0) bits.push(`lembur ${fmt(slip.overtime)}`);
      if (slip.bonus > 0) bits.push(`bonus ${fmt(slip.bonus)}`);
      if (slip.thr > 0) bits.push(`THR ${fmt(slip.thr)}`);
      const deds = [];
      if (slip.ded.kesSelf > 0) deds.push(`BPJS Kes ${fmt(slip.ded.kesSelf)}`);
      if (slip.ded.jhtSelf > 0) deds.push(`JHT ${fmt(slip.ded.jhtSelf)}`);
      if (slip.ded.jpSelf > 0) deds.push(`JP ${fmt(slip.ded.jpSelf)}`);
      if (slip.ded.pph21 > 0) deds.push(`PPh ${fmt(slip.ded.pph21)}`);
      if (slip.deduct > 0) deds.push(`denda ${fmt(slip.deduct)}`);
      if (slip.kasbon > 0) deds.push(`kasbon ${fmt(slip.kasbon)}`);
      Storage.createEntry({
        date, type: 'expense', category: 'gaji-out', payment,
        description: `Gaji ${monthLabel} — ${e.name} (${bits.join(' + ')}${deds.length ? ` − ${deds.join(' + ')}` : ''})${slip.pphOverridden ? ' (PPh rekonsiliasi Des)' : ''}`,
        amount: slip.takeHome, person: e.name,
        payroll: { base: slip.base, allow: slip.allow, overtime: slip.overtime, bonus: slip.bonus, deduct: slip.deduct, hadir: c.hadir || null, thr: slip.thr, ded: slip.ded, comp: slip.comp, kasbon: slip.kasbon, overtimeHours: slip.overtimeHours, gantiCuti: slip.gantiCuti, gantiCutiDays: slip.gantiCutiDays, cutiDiambil: slip.cutiDiambil, takeHome: slip.takeHome, employerCost: slip.employerCost, pphNetto: slip.pphNetto, npwp: !!e.npwp, recon: slip.pphOverridden === true }
      });
      if (slip.kasbon > 0 && kb.detail.length) {
        let rem = slip.kasbon;
        kb.detail.forEach(d => {
          if (rem <= 0) return;
          const a = Math.min(rem, d.outstanding);
          if (a > 0) { try { Storage.applyPayrollKasbon(d.loan.id, a, date, payrollViewMonth); } catch {} rem -= a; }
        });
      }
      // Ganti cuti & cuti terpakai → saldo cuti tahun ini
      if ((c.gantiCuti && c.lemburJam > 0) || c.cutiDiambil > 0) {
        const yr = Number(String(payrollViewMonth).slice(0, 4)) || new Date().getFullYear();
        try { Storage.addLeave(e.id, yr, { comp: c.gantiCuti ? gantiCutiDays(c.lemburJam) : 0, taken: c.cutiDiambil || 0 }); } catch {}
      }
      compTotal += slip.totalComp;
      ok++;
    } catch {}
  });
  if (compTotal > 0) {
    try {
      Storage.postJournal({
        id: `BPJS-${payrollViewMonth}-${Date.now().toString(36)}`,
        date, memo: `Iuran BPJS perusahaan ${monthLabel}`, ref: 'payroll-bpjs', refId: payrollViewMonth,
        lines: [
          { account: '6203', debit: Math.round(compTotal), credit: 0, memo: `BPJS ${monthLabel}` },
          { account: '2110', debit: 0, credit: Math.round(compTotal), memo: `BPJS ${monthLabel}` },
        ]
      });
    } catch {}
  }
  Storage.logAudit('create', 'payroll-run', payrollViewMonth, null, { count: ok, month: monthLabel });
  try { Storage.markPayrollFinal(payrollViewMonth); } catch {}
  UI.showSuccess(ok ? `Gaji ${monthLabel} final: ${ok} karyawan` : 'Tidak ada yang diproses');
  loadPayrollCache();
  renderPayrollView();
  refresh();
}

/* ===== Rekonsiliasi PPh 21 Desember (PMK 168/2023: TER = estimasi bulanan,
   Desember = hitung tahunan − potongan Jan–Nov). Tarif tahunan: UU 36/2008
   jo. UU HPP 7/2021 — minta konsultan konfirmasi sebelum filing. ===== */
function buildDecRecon() {
  const [y, m] = String(payrollViewMonth || '').split('-').map(Number);
  if (!y || m !== 12) return null;
  const year = String(y);
  const byPerson = {};
  try {
    Storage.getAllEntries().forEach(e => {
      if (e.category !== 'gaji-out' || !String(e.date || '').startsWith(year + '-')) return;
      const key = String(e.person || '').trim().toLowerCase();
      if (!key) return;
      const p = e.payroll || {};
      const d = p.ded || {};
      (byPerson[key] = byPerson[key] || []).push({
        month: String(e.date).slice(0, 7),
        gross: (Number(p.base) || 0) + (Number(p.allow) || 0) + (Number(p.overtime) || 0) + (Number(p.bonus) || 0),
        thr: Number(p.thr) || 0,
        jhtSelf: Number(d.jhtSelf) || 0,
        jpSelf: Number(d.jpSelf) || 0,
        pphPaid: Number(d.pph21) || 0
      });
    });
  } catch { return null; }
  const ref = payrollMonthEnd(payrollViewMonth);
  const paidMap = payrollPaidMap(payrollViewMonth);
  return Storage.getAllEmployees()
    .filter(e => e.active !== false)
    .map(emp => {
      const key = String(emp.name || '').trim().toLowerCase();
      const all = (byPerson[key] || []).slice().sort((a, b) => a.month < b.month ? -1 : 1);
      const jn = all.filter(x => x.month < `${year}-12`);
      if (!jn.length) return null;
      const c = payrollCache[emp.id] || {};
      const ter = computeSlip(emp, { overtime: c.overtime || 0, bonus: c.bonus || 0, deduct: c.deduct || 0, thr: c.withThr ? thrAmount(emp, ref) : 0, pph: c.withPph !== false, refDate: ref, rates: payrollRates });
      const r = decRecon(emp, jn, { gross: ter.gross, thr: ter.thr, jhtSelf: ter.ded.jhtSelf, jpSelf: ter.ded.jpSelf });
      return {
        empId: emp.id, name: emp.name, ptkp: emp.ptkp || 'TK/0', hasNpwp: !!emp.npwp,
        months: r.months, annualGross: r.annualGross, annualDue: r.annualDue,
        paidJanNov: r.paidJanNov, pkp: r.pkp, ptkpAmt: r.ptkp,
        decTer: c.withPph !== false ? ter.ded.pph21 : 0,
        decAdjust: r.decAdjust,
        applied: c.pphOverride != null ? c.pphOverride : null,
        decFinalized: !!paidMap[emp.id],
        monthly: all
      };
    }).filter(Boolean);
}
function renderDecPanel(status) {
  const box = document.getElementById('payrollDecPanel');
  if (!box) return;
  const [y, m] = String(payrollViewMonth || '').split('-').map(Number);
  if (m !== 12 || !y) { box.innerHTML = ''; return; }
  UI.renderDecRecon(buildDecRecon() || [], String(y), status === 'final');
}
function handleDecApply(empId) {
  const m = Number(String(payrollViewMonth || '').split('-')[1]);
  if (m !== 12) return;
  const draft = Storage.getPayrollDraft(payrollViewMonth);
  if (draft && draft.status === 'final') return UI.showError('Bulan sudah final — rekonsiliasi tidak bisa diubah');
  const rows = buildDecRecon() || [];
  const row = rows.find(r => r.empId === empId);
  if (!row) return UI.showError('Data setahun karyawan ini belum cukup');
  if (row.decFinalized) return UI.showInfo('Gaji Desember karyawan ini sudah difinalisasi');
  if (!payrollCache[empId]) return;
  if (!confirm(`Terapkan PPh 21 Desember ${row.name} = ${'Rp' + row.decAdjust.toLocaleString('id-ID')} (hasil rekonsiliasi, menggantikan TER ${'Rp' + row.decTer.toLocaleString('id-ID')})?`)) return;
  payrollCache[empId].pphOverride = row.decAdjust;
  const items = {};
  Object.keys(payrollCache).forEach(k => { items[k] = { ...payrollCache[k] }; });
  syncPayrollInputsFromDOM(items);
  items[empId].pphOverride = row.decAdjust;
  try { Storage.savePayrollDraft(payrollViewMonth, { items, rates: payrollRates, status: draft ? draft.status : 'draft' }); } catch {}
  loadPayrollCache();
  renderPayrollView();
  queueMirror();
  UI.showSuccess(`PPh Desember ${row.name} disetel ke hasil rekonsiliasi`);
}
function handleDecA1(empId) {
  const [y] = String(payrollViewMonth || '').split('-').map(Number);
  const rows = buildDecRecon() || [];
  const row = rows.find(r => r.empId === empId);
  if (!row) return UI.showError('Data setahun karyawan ini belum cukup');
  const emp = Storage.getAllEmployees().find(x => x.id === empId) || {};
  UI.printDecA1({
    year: String(y || new Date().getFullYear()),
    name: row.name, npwp: emp.npwp || '', ptkp: row.ptkp,
    monthly: row.monthly, annualGross: row.annualGross,
    annualDue: row.annualDue, paidJanNov: row.paidJanNov,
    pkp: row.pkp, ptkpAmt: row.ptkpAmt, decAdjust: row.decAdjust
  });
}

function handleLogout() {
  try { sessionStorage.removeItem('wynara_logged_in'); } catch {}
  try { localStorage.removeItem('wynara_logged_in'); } catch {}
  Storage.clearPersistedRole();
  Storage.setActor(null);
  document.getElementById('appRoot').classList.add('hidden');
  showLogin();
}

// Guard UI untuk aksi admin yang memposting jurnal langsung (lapisan storage
// tetap menegakkan lewat requireOwner; ini memberi pesan jelas + tak jalan).
function blockKasir() {
  if (!Storage.can('ledger')) {
    UI.showError('Akses ditolak — aksi ini hanya untuk pemilik/akuntan');
    return true;
  }
  return false;
}

/* ===== Jurnal penutupan (closing entries) ===== */
function buildClosingLines(mk) {
  const rev = {}, exp = {};
  try {
    Storage.getAllJournals().forEach(j => {
      if (String(j.date || '').slice(0, 7) !== mk) return;
      (j.lines || []).forEach(l => {
        const code = String(l.account || '');
        const deb = Number(l.debit) || 0, cr = Number(l.credit) || 0;
        if (/^4/.test(code)) rev[code] = (rev[code] || 0) + cr - deb;
        if (/^5/.test(code)) exp[code] = (exp[code] || 0) + deb - cr;
      });
    });
  } catch { return null; }
  const lines = [];
  Object.keys(rev).forEach(c => { if (rev[c] > 0.01) lines.push({ account: c, debit: Math.round(rev[c]), credit: 0, memo: 'Tutup pendapatan' }); });
  Object.keys(exp).forEach(c => { if (exp[c] > 0.01) lines.push({ account: c, debit: 0, credit: Math.round(exp[c]), memo: 'Tutup beban' }); });
  if (!lines.length) return null;
  const deb = lines.filter(l => l.debit > 0).reduce((s, l) => s + l.debit, 0);
  const cr = lines.filter(l => l.credit > 0).reduce((s, l) => s + l.credit, 0);
  const laba = deb - cr;
  if (laba > 0) lines.push({ account: '3102', debit: 0, credit: laba, memo: 'Laba periodenya masuk Laba Ditahan' });
  else if (laba < 0) lines.push({ account: '3102', debit: Math.abs(laba), credit: 0, memo: 'Rugi periode dikurangi dari Laba Ditahan' });
  return lines;
}
function buildClosingJournalData(mk) {
  const lines = buildClosingLines(mk);
  if (!lines) return null;
  const [y, m] = String(mk).split('-').map(Number);
  const date = `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const label = new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const total = lines.reduce((s, l) => s + l.debit, 0);
  return { id: `CLOSE-${mk}`, date, memo: `Jurnal penutupan ${label}`, ref: 'closing', refId: mk, lines, total, label };
}
function handleClosing() {
  if (blockKasir()) return;
  const now = new Date();
  const months = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const items = months.map((mk) => {
    const label = payrollMonthLabel(mk);
    const done = Storage.getAllJournals().some(j => j.id === `CLOSE-${mk}`);
    return `<button type="button" class="close-month-btn" data-mk="${mk}" style="display:flex;align-items:center;justify-content:space-between;width:100%;border:1px solid ${done ? '#e2e8f0' : '#bfdbfe'};background:${done ? '#f8fafc' : '#eff6ff'};color:${done ? '#64748b' : '#1d4ed8'};border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:6px;cursor:pointer"><span>📅 ${label}</span><span style="font-size:11px">${done ? '✓ sudah ditutup' : 'Tutup →'}</span></button>`;
  }).join('');
  UI.openInfoModal('🔒 Penutupan bulan', `<p style="font-size:12px;color:#64748b;margin:0 0 10px">Pilih bulan yang sudah selesai — pendapatan & beban ditutup ke Laba Ditahan (idempoten; menerkat tetap aman).</p>${items.join('')}`);
}
function doClosing(mk) {
  const data = buildClosingJournalData(mk);
  if (!data) return UI.showInfo(`Tidak ada pendapatan/beban di ${mk}`);
  const deb = data.lines.reduce((s, l) => s + l.debit, 0);
  const cr = data.lines.reduce((s, l) => s + l.credit, 0);
  if (deb !== cr) return UI.showError('Jurnal penutupan pincang — kontak cara bayar bermasalah');
  try {
    if (Storage.getAllJournals().some(j => j.id === data.id)) { UI.showInfo(`Penutupan ${mk} sudah pernah diposting`); return; }
    if (Storage.isMonthLocked(data.date)) return UI.showError(`Bulan ${mk} terkunci — jurnal penutupan tidak bisa diposting`);
    Storage.postJournal(data);
    Storage.logAudit('create', 'closing', data.id, null, { month: mk, total: Math.round(deb) });
    UI.showSuccess(`Jurnal penutupan ${data.label}: Rp${Math.round(data.total).toLocaleString('id-ID')} → Laba Ditahan`);
    refresh();
    renderPageReport();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting penutupan');
  }
}

/* ===== Kirim backup via WhatsApp/Email ===== */
async function handleBackupShare() {
  try {
    const json = Storage.backupJSONString();
    const name = `wynara-backup-${new Date().toISOString().split('T')[0]}.json`;
    const canShareFile = typeof navigator !== 'undefined' && navigator.canShare && typeof window.File === 'function';
    if (canShareFile) {
      const file = new window.File([json], name, { type: 'application/json' });
      await navigator.share({ title: 'Wynara Backup', text: `Backup Wynara ${new Date().toLocaleDateString('id-ID')}`, files: [file] });
      UI.showSuccess('Backup dibagikan — lampirkan/ubah destinasi WhatsApp/Email pilihanmu');
      stampShares();
      return;
    }
    Storage.exportJSON();
    UI.showInfo('Browser ini tidak bisa share langsung — file backup sudah diunduh. Kirim lewat WhatsApp/Email (lampirkan file).');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    UI.showError('Gagal membagikan backup');
  }
}
function stampShares() {
  try { localStorage.setItem('wynara_lastBackup', new Date().toISOString()); } catch {}
}

/* ===== Sinkron online (Supabase) — local-first, opsional ===== */
function refreshCloudLabel() {
  const linkWrap = document.getElementById('cloudLinkEmailWrap');
  try { if (linkWrap) linkWrap.hidden = !Cloud.isAnonymousSession(); } catch {}
  const label = document.getElementById('cloudStatusLabel');
  if (!label) return;
  const st = Cloud.getCloudStatus();
  const ses = Cloud.getCloudSession();
  if (!Cloud.isCloudConfigured()) {
    label.textContent = 'Belum terhubung — data hanya di HP ini. Pakai anon/public key, JANGAN service_role key.';
    return;
  }
  if (!ses) {
    label.textContent = 'Server tersimpan, belum masuk — tekan 👻 Masuk tanpa email.';
    return;
  }
  label.textContent = 'Terhubung sebagai ' + (ses.user_id || '').slice(0, 8) + '… — ' + (st.detail || st.state);
}
function handleDataHealth() {
  const r = Storage.dataHealthCheck();
  const head = r.ok
    ? '<div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:6px">✅ Tidak ada masalah kritis</div>'
    : '<div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:6px">⚠️ Ada masalah yang perlu diperhatikan</div>';
  const body = r.issues.length
    ? `<ul style="font-size:12px;padding-left:18px;margin:0">${r.issues.map(i => `<li style="margin:4px 0">${i.level === 'error' ? '🔴' : '🟡'} ${escapeHtml(i.label)}${i.detail ? ` <span style="color:#64748b">(${escapeHtml(i.detail)})</span>` : ''}</li>`).join('')}</ul>`
    : '<p style="color:#64748b;font-size:12px">Semua pemeriksaan lulus: jurnal seimbang, akun dikenal, stok sehat, backup segar.</p>';
  let cloud = '';
  try {
    const s = Cloud.getCloudSession();
    cloud = `<div style="font-size:11px;color:#64748b;margin-top:8px">Cloud: ${Cloud.isCloudConfigured() ? (s ? 'terkonfigurasi & terhubung' : 'terkonfigurasi, belum masuk') : 'tidak dipakai'}</div>`;
  } catch {}
  UI.openInfoModal('🩺 Kesehatan Data', head + body + cloud);
}
async function handleBackupSelfTest() {
  try {
    const r = Storage.backupSelfTest();
    if (r.ok) UI.showSuccess(`Backup OK — ${r.bytes.toLocaleString('id-ID')} byte • ${r.counts.entries} transaksi • ${r.counts.journals} jurnal. File bisa dipulihkan.`);
    else UI.showError(`Backup bermasalah: ${r.err || 'tidak valid'}`);
  } catch (e) {
    UI.showError(e && e.message ? e.message : 'Gagal menguji backup');
  }
}
async function handleCloudPing() {
  try {
    if (!Cloud.isCloudConfigured()) return UI.showError('Hubungkan Supabase dulu (isi URL + key)');
    await Cloud.cloudPing();
    UI.showSuccess('Koneksi OK — sesi valid & RLS jalan');
    refreshCloudLabel();
    updateCloudDot();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Koneksi gagal');
    refreshCloudLabel();
    updateCloudDot();
  }
}
async function handleCloudEmailLogin() {
  const url = document.getElementById('cloudUrl')?.value || '';
  const key = document.getElementById('cloudKey')?.value || '';
  const email = document.getElementById('cloudEmail2')?.value || '';
  const pass = document.getElementById('cloudPass2')?.value || '';
  try {
    if (url || key) Cloud.saveCloudConfig(url, key);
    if (!Cloud.isCloudConfigured()) return UI.showError('Isi URL + anon key Supabase dulu');
    if (!email || !pass) return UI.showError('Isi email + kata sandi akun');
    await Cloud.cloudSignIn(email, pass);
    const p = document.getElementById('cloudPass2');
    if (p) p.value = '';
    UI.showSuccess('Masuk — menarik data dari server…');
    refreshCloudLabel();
    updateCloudDot();
    const res = await Cloud.syncNow();
    if (res && res.error) UI.showError(res.error);
    else UI.showSuccess(`Data ditarik (↑${res.pushed || 0} ↓${res.pulled || 0})`);
    refreshCloudLabel();
    updateCloudDot();
    refresh();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal masuk dengan email');
    refreshCloudLabel();
    updateCloudDot();
  }
}
async function handleCloudLinkEmail() {
  try {
    if (!Cloud.isCloudConfigured()) return UI.showError('Hubungkan Supabase dulu (isi URL + key)');
    const email = document.getElementById('cloudLinkEmail')?.value || '';
    const pass = document.getElementById('cloudLinkPass')?.value || '';
    await Cloud.cloudLinkEmail(email, pass);
    const p = document.getElementById('cloudLinkPass');
    if (p) p.value = '';
    UI.showSuccess('Email tertaut — sekarang bisa masuk dari HP lain (cek email bila diminta konfirmasi)');
    refreshCloudLabel();
    updateCloudDot();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal menautkan email');
  }
}
async function handleCloudAnon() {
  const url = document.getElementById('cloudUrl')?.value || '';
  const key = document.getElementById('cloudKey')?.value || '';
  try {
    if (url || key) Cloud.saveCloudConfig(url, key);
    if (!Cloud.isCloudConfigured()) return UI.showError('Isi URL + anon key Supabase dulu');
    await Cloud.cloudSignInAnonymously();
    UI.showSuccess('Masuk anonim — sinkronisasi pertama mengunggah data HP ini');
    refreshCloudLabel();
    updateCloudDot();
    const res = await Cloud.syncNow();
    if (res && res.error) UI.showError(res.error);
    else UI.showSuccess(`Sinkron awal selesai (↑${res.pushed || 0} ↓${res.pulled || 0})`);
    refreshCloudLabel();
    updateCloudDot();
    refresh();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal masuk anonim');
    refreshCloudLabel();
    updateCloudDot();
  }
}
async function handleCloudSyncNow() {  if (!Cloud.isCloudConfigured()) return UI.showError('Hubungkan Supabase dulu (isi URL + key + login)');
  updateCloudDot();
  const res = await Cloud.syncNow();
  if (res && res.error) UI.showError(res.error);
  else {
    UI.showSuccess(`Sinkron selesai (↑${res.pushed || 0} ↓${res.pulled || 0}${res.conflicts ? ` • ${res.conflicts} beda versi, ikut terbaru` : ''})`);
    refresh();
  }
  refreshCloudLabel();
  updateCloudDot();
}
function handleCloudOff() {
  Cloud.clearCloudConfig();
  UI.showInfo('Sinkron online dimatikan — data lokal tetap utuh');
  refreshCloudLabel();
  updateCloudDot();
}

/* ===== Saldo awal per akun ===== */
function openOpening() {
  const m = document.getElementById('openingModal');
  if (!m) return;
  const drafts = Storage.getOpeningDraft();
  const dateEl = document.getElementById('openingDate');
  if (dateEl) dateEl.value = drafts.date || `${new Date().getFullYear()}-01-01`;
  const rows = getAccounts().filter(a => a.type !== 'equity');
  const body = document.getElementById('openingRows');
  if (body) {
    body.innerHTML = rows.map(a => {
      const v = drafts.rows || {};
      return `<tr style="border-bottom:1px solid #f8fafc">
        <td style="padding:6px 8px"><b style="font-size:11px">${a.code}</b> ${escapeHtml(a.name)}</td>
        <td style="padding:4px 6px"><input type="text" class="opening-deb" data-code="${a.code}" bind="rupiah" placeholder="Rp" inputmode="decimal" value="${v[a.code] && Number(v[a.code].debit) ? String(Number(v[a.code].debit)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}" style="width:100%;height:32px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;text-align:right" aria-label="Debit ${escapeHtml(a.name)}"></td>
        <td style="padding:4px 6px"><input type="text" class="opening-cred" data-code="${a.code}" bind="rupiah" placeholder="Rp" inputmode="decimal" value="${v[a.code] && Number(v[a.code].credit) ? String(Number(v[a.code].credit)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}" style="width:100%;height:32px;border:1px solid #e2e8f0;border-radius:8px;padding:0 8px;font-size:12px;text-align:right" aria-label="Kredit ${escapeHtml(a.name)}"></td>
      </tr>`;
    }).join('');
  }
  updateOpeningBalance();
  if (!m.open) { try { m.showModal(); } catch {} }
}
function openingNumInput(sel) {
  return Math.round(Number(String(sel.value || '').replace(/[^0-9]/g, '')) || 0) || 0;
}
function updateOpeningBalance() {
  const info = document.getElementById('openingBalanceInfo');
  if (!info) return;
  let deb = 0, cred = 0;
  document.querySelectorAll('#openingRows .opening-deb, #openingRows .opening-cred').forEach(inp => {
    const v = openingNumInput(inp);
    if (inp.classList.contains('opening-deb')) deb += v; else cred += v;
  });
  const diff = deb - cred;
  if (diff === 0) info.innerHTML = deb > 0 ? '<span style="color:#059669">✓ Seimbang</span>' : '<span style="color:#94a3b8">Isi debit/kredit per akun, atau tempel dari Excel</span>';
  else info.innerHTML = `<span style="color:#b91c1c">Selisih ${'Rp' + Math.abs(diff).toLocaleString('id-ID')} — dipasang otomatis ke 3101 Modal</span>`;
}
function handleOpeningPost() {
  if (blockKasir()) return;
  const date = document.getElementById('openingDate')?.value || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return UI.showError('Tanggal mulai pembukuan belum benar');
  const rows = {};
  const lines = [];
  document.querySelectorAll('#openingRows .opening-deb, #openingRows .opening-cred').forEach(inp => {
    const code = inp.dataset.code;
    const v = openingNumInput(inp);
    if (v <= 0) return;
    rows[code] = rows[code] || { debit: 0, credit: 0 };
    if (inp.classList.contains('opening-deb')) { rows[code].debit = v; lines.push({ account: code, debit: v, credit: 0 }); }
    else { rows[code].credit = v; lines.push({ account: code, credit: v, debit: 0 }); }
  });
  if (!lines.length) return UI.showInfo('Belum ada nilai yang diisi');
  const deb = lines.reduce((s, l) => s + l.debit, 0);
  const cred = lines.reduce((s, l) => s + l.credit, 0);
  let diff = deb - cred;
  if (diff !== 0) {
    // Modal/Rugi periode sebelumnya otomatis ke 3101 Modal Awal
    lines.push(diff > 0 ? { account: '3101', debit: 0, credit: diff } : { account: '3101', debit: Math.abs(diff), credit: 0 });
  }
  const m = document.getElementById('openingModal');
  try {
    Storage.deleteJournalsByRef('opening');
    const j = buildOpeningJournal({ date, memo: `Saldo awal pembukuan per ${date}` }, lines);
    if (!j) throw new Error('Jurnal tidak seimbang');
    Storage.postJournal(j);
    Storage.saveOpeningDraft({ date, rows });
    Storage.logAudit('create', 'opening-balance', j.id, null, { date, total: deb + (diff !== 0 ? Math.abs(diff) : 0) });
    if (m && m.open) { try { m.close(); } catch {} }
    UI.showSuccess(`Saldo awal diposting: ${lines.length} akun (seimbang dengan Modal)`);
    refresh();
    renderPageReport();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting saldo awal');
  }
}

/* ===== Jurnal penyesuaian manual ===== */
function accountOptionsHTML(selected) {
  return getAccounts().map(a => `<option value="${a.code}" ${a.code === selected ? 'selected' : ''}>${a.code} — ${escapeHtml(a.name)}</option>`).join('');
}
function openAdjust() {
  const m = document.getElementById('adjustModal');
  if (!m) return;
  ['adjustDate', 'adjustMemo', 'adjustDebitAmt', 'adjustCreditAmt'].forEach(id => { const el = document.getElementById(id); if (el && id === 'adjustDate') { el.value = new Date().toISOString().split('T')[0]; } else if (el && id !== 'adjustDate') el.value = ''; });
  const dAcc = document.getElementById('adjustDebitAcc');
  const cAcc = document.getElementById('adjustCreditAcc');
  const selectedA = (dAcc && dAcc.value) || '1101';
  const selectedB = (cAcc && cAcc.value) || '4101';
  if (dAcc) dAcc.innerHTML = accountOptionsHTML(selectedA);
  if (cAcc) cAcc.innerHTML = accountOptionsHTML(selectedB);
  updateAdjustPreview();
  if (!m.open) { try { m.showModal(); } catch {} }
}
function adjustAmount(sel) { return Math.round(Number(String(sel.value || '').replace(/[^0-9]/g, '')) || 0); }
function updateAdjustPreview() {
  const box = document.getElementById('adjustPreview');
  if (!box) return;
  const d = adjustAmount(document.getElementById('adjustDebitAmt'));
  const c = adjustAmount(document.getElementById('adjustCreditAmt'));
  const dAcc = document.getElementById('adjustDebitAcc')?.value;
  const cAcc = document.getElementById('adjustCreditAcc')?.value;
  const label = (code) => { const a = getAccounts().find(x => x.code === code); return a ? `${a.code} ${a.name}` : code; };
  if (d <= 0 && c <= 0) { box.innerHTML = '<span style="color:#94a3b8">Isi nominal debit & kredit.</span>'; return; }
  if (d !== c) {
    box.innerHTML = `<span style="color:#dc2626">⚠ Pincang: debit ${'Rp' + d.toLocaleString('id-ID')} ≠ kredit ${'Rp' + c.toLocaleString('id-ID')} — selisih ${'Rp' + Math.abs(d - c).toLocaleString('id-ID')}</span>`;
    return;
  }
  box.innerHTML = `✓ Balance: <b>${label(dAcc)}</b> ⇄ <b>${label(cAcc)}</b> — ${'Rp' + d.toLocaleString('id-ID')}`;
}
function handleAdjustPost() {
  if (blockKasir()) return;
  const date = document.getElementById('adjustDate')?.value || '';
  const memo = (document.getElementById('adjustMemo')?.value || '').trim();
  const dAcc = document.getElementById('adjustDebitAcc')?.value;
  const cAcc = document.getElementById('adjustCreditAcc')?.value;
  const d = adjustAmount(document.getElementById('adjustDebitAmt'));
  const c = adjustAmount(document.getElementById('adjustCreditAmt'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return UI.showError('Tanggal belum benar');
  if (Storage.isMonthLocked(date)) return UI.showError(`Bulan ${date.slice(0, 7)} terkunci — buka di Pengaturan`);
  if (!memo) return UI.showError('Keterangan wajib diisi');
  if (!(d > 0)) return UI.showError('Nominal debit harus lebih dari 0');
  if (d !== c) return UI.showError('Jurnal pincang — debit dan kredit harus sama');
  if (dAcc === cAcc) return UI.showError('Akun debit dan kredit tidak boleh sama');
  try {
    const id = `ADJ-${date.replace(/-/g, '')}-${Date.now().toString(36)}`;
    Storage.postJournal({
      id, date, memo, ref: 'adjustment', refId: id,
      lines: [
        { account: dAcc, debit: d, credit: 0, memo },
        { account: cAcc, debit: 0, credit: c, memo },
      ]
    });
    Storage.logAudit('create', 'journal-manual', id, null, { debit: `${dAcc} ${d}`, credit: `${cAcc} ${c}` });
    const m = document.getElementById('adjustModal');
    if (m && m.open) { try { m.close(); } catch {} }
    UI.showSuccess(`Jurnal penyesuaian ${'Rp' + d.toLocaleString('id-ID')} diposting`);
    renderReport();
    renderPageReport();
    refresh();
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting jurnal');
  }
}
/* ===== Aset tetap & penyusutan ===== */
function refreshAssets() {
  const body = document.getElementById('assetTableBody');
  if (!body) return;
  const fmt = (v) => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  const assets = Storage.getFixedAssets();
  let bulanIni = 0;
  body.innerHTML = assets.length ? assets.map(a => {
    const cost = Number(a.cost) || 0;
    const life = Math.max(1, Number(a.lifeMonths) || 1);
    const owned = Storage.monthsOwned(a.buyDate);
    const monthly = cost / life;
    const accum = Math.min(cost, monthly * Math.min(owned, life));
    const buku = cost - accum;
    bulanIni += owned > 0 && accum < cost ? monthly : 0;
    return `<tr style="border-bottom:1px solid #f8fafc">
      <td style="padding:8px"><b>${escapeHtml(a.name)}</b><br><small style="color:#94a3b8">${owned}/${life} bln</small></td>
      <td style="padding:8px;text-align:right">${fmt(cost)}</td>
      <td style="padding:8px;text-align:right">${fmt(monthly)}</td>
      <td style="padding:8px;text-align:right">${fmt(accum)}</td>
      <td style="padding:8px;text-align:right"><b>${fmt(buku)}</b></td>
      <td style="padding:8px;text-align:right"><button class="btn btn-danger asset-delete" data-id="${a.id}" aria-label="Hapus ${escapeHtml(a.name)}" style="padding:2px 8px;font-size:12px">×</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8">Belum ada aset. Isi form di atas lalu tekan Tambah.</td></tr>';
  const sum = document.getElementById('assetSummary');
  if (sum) sum.innerHTML = assets.length
    ? `<span class="chip" style="font-size:12px">Penyusutan bulan ini: <b>Rp${Math.round(bulanIni).toLocaleString('id-ID')}</b></span>`
    : '';
}

function handleAssetAdd() {
  const name = (document.getElementById('assetName')?.value || '').trim();
  const cost = Number(String(document.getElementById('assetCost')?.value || '').replace(/[^0-9]/g, '')) || 0;
  const buyDate = document.getElementById('assetBuyDate')?.value || '';
  const life = Number(document.getElementById('assetLife')?.value) || 0;
  if (!name || cost <= 0 || !buyDate || life <= 0) return UI.showError('Lengkapi nama, harga, tanggal beli, dan umur pakai');
  const list = Storage.getFixedAssets();
  list.push({ id: `AS-${Date.now().toString(36)}`, name, cost, buyDate, lifeMonths: life });
  Storage.saveFixedAssets(list);
  Storage.logAudit('create', 'fixed-asset', name, null, { cost, lifeMonths: life });
  ['assetName', 'assetCost', 'assetBuyDate', 'assetLife'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  UI.showSuccess(`Aset "${name}" ditambahkan`);
  refreshAssets();
  queueMirror();
}

function handleAssetDelete(id) {
  const list = Storage.getFixedAssets();
  const a = list.find(x => x.id === id);
  if (!a) return;
  if (!confirm(`Hapus aset "${a.name}"?`)) return;
  Storage.saveFixedAssets(list.filter(x => x.id !== id));
  Storage.logAudit('delete', 'fixed-asset', a.name, { cost: a.cost }, null);
  UI.showSuccess('Aset dihapus');
  refreshAssets();
  queueMirror();
}

function handleAssetPost() {
  if (blockKasir()) return;
  const mk = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  if (Storage.isMonthLocked(`${mk}-01`)) return UI.showError(`Bulan ${mk} terkunci — buka di Pengaturan`);
  const id = `DEP-${mk}`;
  if (Storage.getAllJournals().some(j => j.id === id)) return UI.showInfo(`Penyusutan ${mk} sudah pernah diposting`);
  const total = Storage.getFixedAssets().reduce((s, a) => {
    const cost = Number(a.cost) || 0;
    const life = Math.max(1, Number(a.lifeMonths) || 1);
    const owned = Storage.monthsOwned(a.buyDate);
    const monthly = cost / life;
    const accum = Math.min(cost, monthly * Math.min(owned, life));
    if (owned <= 0 || accum >= cost) return s;
    const sisa = Math.min(monthly, cost - accum);
    return s + sisa;
  }, 0);
  if (total <= 0.01) return UI.showInfo('Tidak ada penyusutan untuk bulan ini');
  try {
    Storage.postJournal({
      id, date: `${mk}-01`, memo: `Penyusutan aset ${mk}`, ref: 'fixed-asset-dep', refId: mk,
      lines: [
        { account: '5129', debit: Math.round(total), credit: 0, memo: `Penyusutan ${mk}` },
        { account: '1519', debit: 0, credit: Math.round(total), memo: `Akumulasi penyusutan ${mk}` },
      ]
    });
    Storage.logAudit('create', 'fixed-asset-dep', id, null, { total: Math.round(total) });
    UI.showSuccess(`Jurnal penyusutan ${mk}: Rp${Math.round(total).toLocaleString('id-ID')}`);
    queueMirror();
  } catch (err) {
    UI.showError(err && err.message ? err.message : 'Gagal posting jurnal');
  }
}
function openAssets() {
  refreshAssets();
  UI.openAssetModal();
}

function openSettings() {
  const modal = document.getElementById('settingsModal');
  const budget = Storage.getBudget();
  const input = document.getElementById('budgetInput');
  if (input) input.value = budget && budget.amount ? Number(budget.amount).toLocaleString('id-ID') : '';
  const eqInput = document.getElementById('equityInput');
  if (eqInput) {
    const eq = Storage.getOpeningEquity();
    eqInput.value = eq && eq.amount ? Number(eq.amount).toLocaleString('id-ID') : '';
  }
  const notif = document.getElementById('settingNotif');
  if (notif) notif.checked = safeLocalGet('wynara_notif') !== 'false';
  const themeBox = document.getElementById('settingTheme');
  if (themeBox) themeBox.checked = document.body.classList.contains('dark-mode');
  const ppnInput = document.getElementById('ppnRateInput');
  if (ppnInput) ppnInput.value = (Storage.getPpn().rate * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const umpInput = document.getElementById('umpInput');
  if (umpInput) umpInput.value = Storage.getUmp().amount ? Storage.getUmp().amount.toLocaleString('id-ID') : '';
  const modeBox = document.getElementById('settingModeSederhana');
  if (modeBox) modeBox.checked = safeLocalGet('wynara_mode') === 'sederhana';
  const cloudCfg = Cloud.getCloudConfig();
  const cloudUrl = document.getElementById('cloudUrl');
  if (cloudUrl && !cloudUrl.value) cloudUrl.value = cloudCfg ? cloudCfg.url : '';
  const cloudKey = document.getElementById('cloudKey');
  if (cloudKey && !cloudKey.value) cloudKey.value = cloudCfg ? cloudCfg.anonKey : '';
  refreshCloudLabel();
  const lastBackupEl = document.getElementById('lastBackupLabel');
  if (lastBackupEl) {
    const last = Storage.getLastBackup();
    lastBackupEl.textContent = last
      ? `Backup terakhir: ${last.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} — cadangan otomatis aktif di browser ini`
      : 'Belum pernah backup — unduh JSON Backup biar data aman';
  }
  // Kunci periode
  const renderLocks = () => {
    const box = document.getElementById('lockList');
    if (!box) return;
    const locks = Storage.getLockedMonths();
    box.innerHTML = locks.length
      ? locks.map(m => `<span class="chip" style="font-size:11px">🔒 ${m} <button data-unlock="${m}" style="margin-left:4px;background:none;border:none;cursor:pointer;color:#ef4444" title="Buka kunci">×</button></span>`).join('')
      : '<span style="font-size:11px;color:#94a3b8">Belum ada bulan terkunci</span>';
    box.querySelectorAll('[data-unlock]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`Buka kunci ${btn.dataset.unlock}? Bulan ini bisa diubah lagi.`)) return;
        Storage.unlockMonth(btn.dataset.unlock);
        Storage.logAudit('update', 'lock', btn.dataset.unlock, { locked: true }, { locked: false });
        renderLocks();
        queueMirror();
      });
    });
  };
  renderLocks();
  const lockOne = (d) => {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    try {
      Storage.lockMonth(key);
      Storage.logAudit('update', 'lock', key, { locked: false }, { locked: true });
      UI.showSuccess(`Bulan ${key} dikunci`);
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal mengunci');
    }
    renderLocks();
    queueMirror();
  };
  document.getElementById('lockPrevBtn').onclick = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); lockOne(d); };
  document.getElementById('lockCurBtn').onclick = () => lockOne(new Date());
  // Mode kasir
  const kasirHint = document.getElementById('kasirPinHint');
  const kasirInput = document.getElementById('kasirPinInput');
  const renderKasirHint = () => {
    if (kasirHint) kasirHint.textContent = Storage.kasirEnabled()
      ? 'Aktif — login pakai username "kasir" + PIN. Kasir: cuma catat transaksi (tanpa laporan/gaji/hapus). PIN default awal: 1234.'
      : 'Belum aktif — simpan PIN (default pertama: 1234) untuk memberi akses terbatas ke kasir.';
  };
  renderKasirHint();
  document.getElementById('kasirPinSave').onclick = async () => {
    const v = (kasirInput && kasirInput.value || '').trim();
    if (!v) return UI.showError('Isi PIN dulu (4–8 angka)');
    try {
      await Storage.setKasirPin(v, true);
      if (kasirInput) kasirInput.value = '';
      renderKasirHint();
      UI.showSuccess('PIN kasir disimpan — login "kasir" + PIN');
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Gagal menyimpan PIN');
    }
  };
  document.getElementById('kasirPinOff').onclick = () => {
    if (!Storage.kasirEnabled()) return UI.showInfo('Mode kasir memang belum aktif');
    if (!confirm('Matikan mode kasir? Login "kasir" jadi tidak bisa dipakai.')) return;
    try { Storage.setKasirPin('', false); renderKasirHint(); UI.showSuccess('Mode kasir dimatikan'); } catch {}
  };
  // Akuntan & HRD: PIN per peran (OQ4)
  const renderRolePins = () => {
    const h = document.getElementById('rolePinHint');
    if (h) h.textContent = `Akuntan: ${Storage.rolePinEnabled('akuntan') ? 'aktif' : 'belum'} • HRD: ${Storage.rolePinEnabled('hrd') ? 'aktif' : 'belum'}. Login pakai username akuntan / hrd + PIN. Akuntan = semua akuntansi; HRD = gaji & penggantian kas kecil.`;
  };
  renderRolePins();
  const wireRolePin = (role, inputId, saveId, offId, label) => {
    const input = document.getElementById(inputId);
    const save = document.getElementById(saveId);
    if (save) save.onclick = async () => {
      const v = (input && input.value || '').trim();
      if (!v) return UI.showError('Isi PIN dulu (4–8 angka)');
      try {
        await Storage.setRolePin(role, v, true);
        if (input) input.value = '';
        renderRolePins();
        UI.showSuccess(`PIN ${label} disimpan — login "${role}" + PIN`);
      } catch (err) { UI.showError(err && err.message ? err.message : 'Gagal menyimpan PIN'); }
    };
    const off = document.getElementById(offId);
    if (off) off.onclick = () => {
      if (!Storage.rolePinEnabled(role)) return UI.showInfo(`PIN ${label} memang belum aktif`);
      if (!confirm(`Matikan akses ${label}? Login "${role}" tak bisa dipakai.`)) return;
      try { Storage.setRolePin(role, '', false); renderRolePins(); UI.showSuccess(`Akses ${label} dimatikan`); } catch {}
    };
  };
  wireRolePin('akuntan', 'akuntanPinInput', 'akuntanPinSave', 'akuntanPinOff', 'Akuntan');
  wireRolePin('hrd', 'hrdPinInput', 'hrdPinSave', 'hrdPinOff', 'HRD');
  // Toko / lokasi (multi-toko)
  const renderShops = () => {
    const box = document.getElementById('shopList');
    if (!box) return;
    const shops = Storage.getShops();
    const active = Storage.getActiveShopId();
    box.innerHTML = shops.map(s => `<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px"><span style="flex:1">🏬 ${escapeHtml(s.name)} ${s.id === active ? '<small style="color:#64748b">(aktif)</small>' : ''}</span>${shops.length > 1 ? `<button type="button" data-shopdel="${s.id}" style="background:none;border:none;color:#ef4444;cursor:pointer" title="Hapus toko">✕</button>` : ''}</div>`).join('');
    box.querySelectorAll('[data-shopdel]').forEach(b => { b.onclick = () => {
      if (!confirm('Hapus toko ini? Stok di toko ini tidak lagi ditampilkan.')) return;
      try {
        Storage.saveShops(Storage.getShops().filter(x => x.id !== b.dataset.shopdel));
        if (Storage.getActiveShopId() === b.dataset.shopdel) Storage.setActiveShopId(Storage.getShops()[0].id);
        renderShops(); UI.showSuccess('Toko dihapus');
      } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menghapus toko'); }
    }; });
  };
  renderShops();
  const shopAdd = document.getElementById('shopAddBtn');
  if (shopAdd) shopAdd.onclick = () => {
    const name = (document.getElementById('shopNameInput')?.value || '').trim();
    if (!name) return UI.showError('Isi nama toko dulu');
    try {
      Storage.saveShops(Storage.getShops().concat([{ id: 'S' + Date.now().toString(36), name }]));
      const inp = document.getElementById('shopNameInput'); if (inp) inp.value = '';
      renderShops(); UI.showSuccess('Toko ditambahkan');
    } catch (e) { UI.showError(e && e.message ? e.message : 'Gagal menambah toko'); }
  };
  // Anggaran per kategori
  const catSel = document.getElementById('catBudgetSelect');
  const catAmt = document.getElementById('catBudgetAmount');
  const catAdd = document.getElementById('catBudgetAdd');
  const catList = document.getElementById('catBudgetList');
  const renderCatBudgets = () => {
    if (!catList) return;
    const all = Storage.getCategoryBudgets();
    const keys = Object.keys(all);
    const fmt = (v) => 'Rp' + Number(v).toLocaleString('id-ID');
    catList.innerHTML = keys.length
      ? keys.map(c => {
        let label = c;
        try { label = Reports.getCategoryLabel(c) || c; } catch {}
        return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:6px 10px">
          <span style="flex:1">${escapeHtml(label)} • <b>${fmt(all[c])}</b></span>
          <button data-catdel="${escapeHtml(c)}" class="btn btn-ghost" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
        </div>`;
      }).join('')
      : '<span style="font-size:11px;color:#94a3b8">Belum ada — tambah mis. Makanan Rp500rb</span>';
    catList.querySelectorAll('[data-catdel]').forEach(btn => {
      btn.addEventListener('click', () => {
        Storage.setCategoryBudget(btn.dataset.catdel, 0);
        renderCatBudgets();
        renderBudget(currentEntries);
        queueMirror();
      });
    });
  };
  if (catSel) {
    const predefined = Reports.CATEGORY_OPTIONS.expense.map(o => o.value);
    const customs = [...new Set(currentEntries.filter(e => e.type === 'expense').map(e => e.category))].filter(c => !predefined.includes(c));
    const labelOf = (c) => { try { return Reports.getCategoryLabel(c) || c; } catch { return c; } };
    catSel.innerHTML = '';
    predefined.concat(customs).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = labelOf(c);
      catSel.appendChild(opt);
    });
  }
  if (catAdd && !catAdd.dataset.bound) {
    catAdd.dataset.bound = '1';
    catAdd.addEventListener('click', () => {
      const c = catSel ? catSel.value : '';
      const raw = catAmt ? UI.parseIdrInput(catAmt.value) : '';
      if (!c || !raw) { UI.showError('Pilih kategori + isi nominal'); return; }
      Storage.setCategoryBudget(c, Number(raw));
      if (catAmt) catAmt.value = '';
      UI.showSuccess('Anggaran kategori disimpan');
      renderCatBudgets();
      renderBudget(currentEntries);
      queueMirror();
    });
  }
  renderCatBudgets();
  const recList = document.getElementById('recurringList');
  if (recList) {
    const templates = Storage.getRecurring();
    if (!templates.length) {
      recList.innerHTML = '<span style="font-size:11px;color:#94a3b8">Tidak ada transaksi rutin</span>';
    } else {
      const fmt = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);
      recList.innerHTML = templates.map(t => `
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px">
          <span>${t.type === 'income' ? '📥' : '📤'}</span>
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.category || 'Lainnya')} • ${fmt(Number(t.amount) || 0)}/bln${t.paused ? ' <small style="color:#94a3b8">(jeda)</small>' : ''}</span>
          <button data-rec="${t.recurringId}" data-act="pause" class="btn btn-ghost" style="font-size:11px;padding:2px 8px">${t.paused ? '▶️' : '⏸️'}</button>
          <button data-rec="${t.recurringId}" data-act="del" class="btn btn-ghost" style="font-size:11px;padding:2px 8px;color:#ef4444">✕</button>
        </div>`).join('');
      recList.querySelectorAll('button[data-rec]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.rec;
          if (btn.dataset.act === 'del') {
            if (!confirm('Hapus transaksi rutin ini? (yang sudah dibuat tidak ikut terhapus)')) return;
            Storage.deleteRecurring(id);
            UI.showSuccess('Transaksi rutin dihapus');
          } else {
            const t = Storage.getRecurring().find(x => x && x.recurringId === id);
            Storage.pauseRecurring(id, !(t && t.paused));
            UI.showInfo(t && t.paused ? 'Transaksi rutin dilanjutkan' : 'Transaksi rutin dijeda');
          }
          openSettings();
          queueMirror();
        });
      });
    }
  }
  const list = document.getElementById('customCategoryList');
  if (list) {
    const cats = Storage.getCategories();
    const predefined = new Set([...Reports.CATEGORY_OPTIONS.income.map(o=>o.value), ...Reports.CATEGORY_OPTIONS.expense.map(o=>o.value)]);
    const customs = cats.filter(c => !predefined.has(c));
    if (!customs.length) list.innerHTML = '<span style="font-size:11px;color:#94a3b8">Tidak ada kategori custom</span>';
    else list.innerHTML = customs.map(c => {
      const cnt = currentEntries.filter(e => e.category === c).length;
      return `<span class="chip" style="font-size:11px">${escapeHtml(c)} <small>(${cnt})</small> <button data-cat="${escapeHtml(c)}" class="del-cat" style="margin-left:4px;background:none;border:none;cursor:pointer;color:#ef4444">×</button></span>`;
    }).join('');
    list.querySelectorAll('.del-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        const cnt = currentEntries.filter(e => e.category === cat).length;
        if (cnt > 0) { UI.showError(`Kategori "${cat}" masih dipakai ${cnt} transaksi`); return; }
        if (confirm(`Hapus kategori "${cat}"?`)) {
          UI.showSuccess(`Kategori "${cat}" akan hilang setelah tidak ada transaksi`);
          list.innerHTML = '<span style="font-size:11px;color:#94a3b8">Kategori akan hilang otomatis</span>';
        }
      });
    });
  }
  if (modal && !modal.open) { modal.showModal(); UI.trapFocus(modal); }
  else if (modal) UI.trapFocus(modal);
}
function closeSettings() {
  const modal = document.getElementById('settingsModal');
  UI.releaseFocus(modal);
  if (modal && modal.open) try { modal.close(); } catch {}
}
function saveSettings() {
  const input = document.getElementById('budgetInput');
  const raw = input ? UI.parseIdrInput(input.value) : '';
  const amount = raw ? Number(raw) : 0;
  if (amount) Storage.saveBudget({ amount, updatedAt: new Date().toISOString() });
  else { try { localStorage.removeItem('wynara_budget'); } catch {} }
  const eqInput = document.getElementById('equityInput');
  const eqRaw = eqInput ? UI.parseIdrInput(eqInput.value) : '';
  Storage.saveOpeningEquity(eqRaw ? Number(eqRaw) : 0);
  postOpeningEquityJournal();
  queueMirror();
  const notif = document.getElementById('settingNotif');
  if (notif) safeLocalSet('wynara_notif', String(notif.checked));
  // Mode Sederhana (masking alat akuntan)
  const modeBox = document.getElementById('settingModeSederhana');
  if (modeBox) {
    const mode = modeBox.checked ? 'sederhana' : 'akuntan';
    safeLocalSet('wynara_mode', mode);
    applySimpleMode(mode);
    if (mode === 'sederhana' && ['journal', 'ledger', 'trial', 'audit', 'ppn', 'pph21'].includes(currentReportType)) {
      currentReportType = 'monthly';
      renderPageReport();
      const tab = document.querySelector('.report-tab[data-report="monthly"]');
      if (tab) tab.click();
    }
  }
  // Tarif PPN configurable
  const ppnInput = document.getElementById('ppnRateInput');
  if (ppnInput && String(ppnInput.value || '').trim() !== '') {
    try {
      const r = Storage.savePpn(ppnInput.value);
      Storage.logAudit('update', 'ppn-rate', 'settings', { rate: Storage.getPpn().rate }, { rate: r });
      UI.updatePpnLabels();
      UI.showInfo(`Tarif PPN kini ${(r * 100).toLocaleString('id-ID')}%`);
    } catch (err) {
      UI.showError(err && err.message ? err.message : 'Tarif PPN tidak valid');
    }
  }
  // UMP (upah minimum) — validasi gaji
  const umpInput = document.getElementById('umpInput');
  if (umpInput) {
    try { Storage.saveUmp(umpInput.value); } catch (err) { UI.showError(err && err.message ? err.message : 'UMP tidak valid'); }
  }
  closeSettings();
  UI.showSuccess('Pengaturan disimpan');
  render();
}

document.addEventListener('DOMContentLoaded', init);




function openOrderShip(kind, id) {
  const cs = kind === 'po' ? Storage.getPreorderById(id) : Storage.getCreditSaleById(id);
  if (!cs) return;
  document.getElementById('shipId').value = id;
  const kindEl = document.getElementById('shipKind'); if (kindEl) kindEl.value = kind || 'jual';
  const title = document.getElementById('shipTitle');
  if (title) title.textContent = '🚚 Kirim ke Pelanggan';
  const courierLabel = document.getElementById('shipCourierLabel');
  if (courierLabel) courierLabel.textContent = 'Ekspedisi / kurir';
  const out = kind === 'po' ? Storage.preorderBalance(cs) : Storage.creditOutstanding(cs);
  const info = document.getElementById('shipInfo');
  if (info) {
    info.innerHTML = `<b>${escapeHtml(cs.no || cs.invoiceNo || '')}</b> — ${escapeHtml(cs.customer || 'Tanpa nama')}<br>Total ${('Rp' + Math.round(cs.sellTotal || cs.total).toLocaleString('id-ID'))} • <b>sisa ${('Rp' + Math.round(out).toLocaleString('id-ID'))}</b>`;
  }
  const dt = document.getElementById('shipDate'); if (dt) dt.value = new Date().toISOString().split('T')[0];
  const er = document.getElementById('shipError'); if (er) er.textContent = '';
  const m = document.getElementById('shipModal');
  if (m && !m.open) {
    try { m.showModal(); } catch {}
    setTimeout(() => document.getElementById('shipCourier')?.focus(), 60);
  }
}
function closeOrderShip() { const m = document.getElementById('shipModal'); if (m && m.open) { try { m.close(); } catch {} } }
function handleOrderShipSubmit() {
  const id = document.getElementById('shipId')?.value || '';
  const kind = document.getElementById('shipKind')?.value || 'jual';
  if (!id) return;
  try {
    if (kind === 'po') {
      // 4.2: modal ini hanya pengiriman lokal ke pelanggan. Belanja & ongkos impor
      // sudah dicatat di Papan Muatan (Belanja/Koli/Muatan), bukan di sini.
      const courier = document.getElementById('shipCourier')?.value || '';
      const tracking = document.getElementById('shipTracking')?.value || '';
      const date = document.getElementById('shipDate')?.value || new Date().toISOString().split('T')[0];
      Storage.trackPreorder(id, { stage: 'sent', date, note: `Kirim ke pelanggan${courier ? ' via ' + courier : ''}`, tracking });
      closeOrderShip();
      UI.showSuccess('Pesanan dikirim ke pelanggan — berikutnya kirim invoice / terima pembayaran');
      refreshSalesPage();
      return;
    }
    Storage.shipCreditSale(id, {
      courier: document.getElementById('shipCourier')?.value || '',
      tracking: document.getElementById('shipTracking')?.value || '',
      date: document.getElementById('shipDate')?.value || new Date().toISOString().split('T')[0],
    });
    closeOrderShip();
    UI.showSuccess('Pesanan ditandai sedang dikirim — pantau sampai diterima pelanggan');
    refreshSalesPage();
  } catch (e) {
    const er = document.getElementById('shipError');
    if (er) er.textContent = e && e.message ? e.message : 'Gagal menyimpan';
    else UI.showError(e && e.message ? e.message : 'Gagal menyimpan');
  }
}
function handleOrderReceive(id) {
  const cs = Storage.getCreditSaleById(id);
  if (!cs) return;
  if (!confirm(`Barang ${cs.invoiceNo} sudah diterima pelanggan? Setelah ini tinggal pelunasan.`)) return;
  try { Storage.receiveCreditSale(id, {}); UI.showSuccess('Paket diterima pelanggan — tunggu pelunasan'); refreshSalesPage(); }
  catch (e) { UI.showError(e && e.message ? e.message : 'Gagal memperbarui status'); }
}
function populateOrderStatusSelect(kind) {
  const sel = document.getElementById('orderStatusStage');
  if (!sel) return null;
  // Cek target order dari data (stock order = pembelian, bukan jual)
  const id = document.getElementById('orderStatusId')?.value || '';
  const po = kind === 'po' && id ? Storage.getPreorderById(id) : null;
  const isStock = !!(po && po.target === 'stock');
  const opts = isStock
    ? [['ordered', '🧾 Dipesan ke supplier'], ['paid', '💰 Dibayar ke supplier'], ['china', '🏭 Barang dibeli — masuk gudang China (luar negeri)'], ['to_indo', '🚚 Dikirim China → Indonesia'], ['arrived', '📦 Sampai gudang kita'], ['received', '✅ Stok masuk (tercatat)']]
    : kind === 'po'
      ? [['china', '🏭 Barang dibeli — masuk gudang China'], ['to_indo', '🚚 Dikirim gudang China → Indonesia'], ['in_wh', '🏬 Barang di gudang kita'], ['sent', '📦 Dikirim ke pelanggan'], ['invoiced', '🧾 Invoice terkirim — tunai / jadwal bayar']]
      : [['shipped', '📦 Dikirim ke pelanggan (resi)'], ['received', '✅ Diterima pelanggan'], ['invoiced', '🧾 Invoice terkirim — tunai / jadwal bayar']];
  sel.innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  return sel;
}
