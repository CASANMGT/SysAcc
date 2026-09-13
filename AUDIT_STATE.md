# Audit State — Wynara Accounting

Repo **v1.40.0** · Production **v1.40.0 VERIFIED 2026-09-13** (check-prod PASS: index=1.40.0, sw=wynara-v1-40-0). Backend Supabase **LIVE** — first-sync + RLS terverifikasi server-side.
Loop **v2** sejak iter 17. Koreksi aritmetika diterapkan: overall tanpa aritmetika terlihat = invalid.

---

## ⚠ Feasibility — read first

```
OQ1/OQ3 backend is RESOLVED: Supabase live. schema.sql applied; anonymous
sign-in working; first-sync verified server-side (INSERT 201 / READ-own 200
with row / READ-other user → [] proving RLS / DELETE 204 / read-after-delete []).
The former hard ceiling (93.25) is gone. No structural block remains.

A+ still requires every axis ≥85. Lowest: F4 74, F2 80, F9 82, F8 83, F3 84
— five axes below 85 (F7 87, F6 90, F1 90, F5 92). Keep working correctness; do not chase cosmetics.
```

---

## Current scores — corrected (aritmetika wajib tampil)

Recompute dari nilai v1 (F1 86, F2 76, F3 73, F4 52, F5 94, F6 86, F7 80, F8 82, F9 68) memberi **76.80**, bukan ~90. Setelah kalibrasi audit eksternal:

| Axis | W | Prev | **Now** | ×W | Note |
|---|---|---|---|---|---|
| F1 Core ledger | 15 | 86 | **90** | 13.50 | + halaman stok bergrup, restock + jurnal Dr Persediaan/Cr Kas |
| F2 Tax conformance | 12 | 76 | **80** | 9.60 | OQ2 selesai (PPN 11% configurable, non-PKP); PPh Final PP23/2018 ambang Rp4,8M + peringatan |
| F3 Payroll & HR | 12 | 73 | **84** | 10.08 | Dec recon + 1721-A1 + kasbon + **lembur KEP-102, cuti UU13/2003, ganti cuti, validasi UMP** |
| F4 Data durability | 15 | 52 | **74** | 11.10 | Supabase LIVE + RLS; peran+actor; **tautkan sesi anonim→email + uji-diri backup**. Gap: OQ4 matriks Akuntan/HRD |
| F5 Reporting | 10 | 94 | **92** | 9.20 | Genuinely excellent |
| F6 Task efficiency | 12 | 86 | **90** | 10.80 | Halaman stok (cari/filter/restock) + import marketplace/WA |
| F7 Cognitive load | 10 | 80 | **87** | 8.70 | Harga/modal per ukuran + warna premium; stok per varian; import marketplace/WA |
| F8 Mobile | 7 | 82 | **83** | 5.81 | Audit mobile + lanjutan: safe-area footer entri, font ≥11px, modal scroll-x, target sentuh |
| F9 Accessibility | 7 | 68 | **82** | 5.74 | Label/dialog/focus/contrast + scope/caption/alt/hierarki + nama nav bersih (tanpa emoji) |
| **OVERALL** | | ~~90~~ | | **84.53** | F1 89→90, F6 88→90 (halaman stok+restock); arithmetic di bawah |

Aritmetika (wajib tampil): 90×15 + 80×12 + 84×12 + 74×15 + 92×10 + 90×12 + 87×10 + 83×7 + 82×7
= 1350 + 960 + 1008 + 1110 + 920 + 1080 + 870 + 581 + 574 = **8453 / 100 = 84.53**. Baseline 59.7 → **+24.83**.

Five of nine axes below 85. Stop condition not met on either clause.

---

## Blocking decisions — nothing proceeds without these

1. ~~Backend for B1~~ **RESOLVED 2026-09-13** — Supabase live. URL + publishable key valid; `supabase/schema.sql` sudah di-Run; anonymous sign-in ON; first-sync hijau (klien ↑3 ↓0) dan diverifikasi server-side via akun probe terpisah (INSERT 201 / READ-own 200 / READ-other [] RLS / DELETE 204). Endpoint anonim diperbaiki ke `/auth/v1/signup` (v1.22.3). → F4 52→68. Sisa celah: sesi anonim terikat browser, belum ada tautkan-email (backlog).
2. ~~PPN position~~ **RESOLVED 2026-09-13** (keputusan manusia): **tetap 11% flat & configurable**, pengguna **non-PKP** (tidak menerbitkan faktur pajak). Faktur/NITKU tidak diperlukan. → F2 76→80.
3. **UMP/UMK 2026** per province — effective-dated table? **ARAH DITERIMA 2026-09-13**: iter 20 mencakup UMP 2026 + lembur (KEP-102/MEN/VI/2004) + cuti (UU 13/2003, 12 hari) + **ganti cuti** (lembur dikompensasi cuti). Angka UMP per provinsi belum diberikan → sediakan sebagai **input configurable** (jangan mengarang angka).
4. **Akuntan/HRD permission matrix** — **RESOLVED 2026-09-13**: **Akuntan = semua** fungsi akuntansi (jurnal, laporan, pajak, pinjaman, stok, pembelian, tutup buku, kunci, COA, saldo awal); **HRD = hanya Gaji + penggantian kas kecil (petty cash)** + data karyawan. (Belum diimplementasikan — lanjutan B3.)

---

## Next 5 iterations — fixed order, no substitution

| # | Work | Axis | Gate |
|---|---|---|---|
| 17 | **Run V1–V10 by hand.** V1 (Dec PPh 21 annual reconciliation) first. | F1 F3 | Correctness lock |
| 18 | **Fix the deploy pipeline** + single version source (APP/HTML/SW derived from VERSION) | F4 | Regression budget |
| 19 | **B4a**: Dec PPh 21 reconciliation + 1721-A1 bukti potong | F3 | Rotation (lowest axis) |
| 20 | **B4b**: lembur KEP-102/2004 + cuti balance + UMP validation | F3 | Correctness |
| 21 | **B3**: Akuntan + HRD roles, audit trail with real actor IDs | F4 | Rotation |

UI work is frozen until iteration 22. Sixteen iterations of polish shipped ahead of a payroll correctness risk; that ordering is now prohibited by the correctness lock.

**Catatan verifikasi 2026-09-10:** production terbukti serve v1.20.2 (= repo HEAD). Item "DEPLOY 6 versions behind" di backlog diubah menjadi "post-deploy assertion" — pipeline-nya bekerja, yang belum ada hanya guard-nya.

---

## Backlog

**Blocked**
- **B1 (C1)** Server persistence + auth — arah Supabase. Ship: `supabase/schema.sql` (2 tabel generik + RLS), `supabase.js` (REST tanpa SDK, LWW + tombstone 30 hari, throttle 60 dtk, dot status), UI Pengaturan minimal, 11 test merge tanpa network. **BELUM VERIFIKASI LIVE** (butuh kredensial) → F4 tetap 52 sampai first-sync hijau.

**P0 — correctness**
- **B4a** December PPh 21 annual progressive reconciliation ✅ ship v1.21.0 (tabel UU 36/2008 jo. UU HPP 7/2021 — **tetap butuh konfirmasi konsultan sebelum filing**, OQ terkait dibuka) + 1721-A1 printable
- **B7 (NEW, dari V7 iter 17)** Bunga pinjaman tak pernah menyentuh P&L — tidak ada akun Pendapatan/Beban Bunga di COA; pelunasan menyerap bunga ke AR/AP. Butuh akun + split jurnal pelunasan. Diusulkan slot setelah iter 21 (sebelum UI unfreeze).
- **B4b** Lembur (KEP-102/MEN/VI/2004), cuti 12 hari, UMP/UMK floor validation
- **B4c** Bukti Potong 1721-A1 generation
- **U9** Ten runtime V-checks, none yet run

**P1**
- **B3 (C3)** Akuntan + HRD roles; audit trail with real actor identity; maker-checker
- **B5b** Faktur pajak numbering, NPWP/NITKU, Coretax export
- **DEPLOY** Post-deploy assertion ✅ ada (`scripts/check-prod.mjs`) — pipeline verified working 2026-09-10
- **VERSION** Single source ✅ (`VERSION` + `scripts/sync-version.mjs`; rilis via `npm run release:patch|minor|major`)

**P2 — UI, frozen until iter 22**
- **U5** Emoji icons → labelled icon set (F9)
- **U2** Transaction modal to 3 visible fields (Frozen: conflicts with T1 4-tap benchmark)
- **U7** Remaining a11y: contrast audit, custom numpad keyboard path

---

## Regressions — 8 self-inflicted in 15 releases

| Fixed in | Defect |
|---|---|
| 1.16.3 | Tab regroup broke wiring on groups 2–3 → body delegation |
| 1.17.6 | SW cache name frozen `v1-11-0` → blank Laporan (split-brain HTML/JS) |
| 1.18.1 | Stale-file self-heal needed after 1.17.6 |
| 1.18.2 | Header overflow + scroll carry-over |
| 1.18.3 | CSS rule too broad — broke Gaji title + Changelog panel |
| 1.18.4 | The 1.18.3 guard didn't catch old-JS + new-HTML |
| 1.19.1 | Drawer stuck over content |
| 1.20.1 | Missing `<div>` opener → `#viewLaporan` outside `main` |

**Pattern:** the suite went 141→152 tests and stayed green through every one of these. Unit tests cannot catch a missing `</div>`. Loop v2 adds structural DOM invariants and headless screenshot diffs at 460px/1280px as mandatory gates.

**Pattern:** 4 of 8 were version/cache skew. Root cause is the version living in four hand-synced places, not developer discipline.

---

## Completed — iterations 1–19 + supabase engine (unversioned F4 groundwork)

- **supabase engine (v1.22.0)**: direct human order (menyimpang dari urutan tetap — dicatat). Skema 2-tabel + RLS, mesin LWW/tombstone, throttle, dot status, 11 test (1 test menangkap bug `Date.parse(0)` pra-produksi). Personas: tak ada perubahan UI yang mereka pakai (section di Pengaturan, kasir tak melihat).
- **v1.22.1 / v1.22.2 / v1.22.3 / v1.22.4 (direct human order — dicatat)**: onboarding akun, masuk anonim, **fix endpoint anonim** (`/auth/v1/authorize`→`/auth/v1/signup`, bug 405), lalu **UI Sinkron disederhanakan** jadi satu tombol primer (hapus email/password + handler mati). First-sync LIVE hijau + RLS diverifikasi server-side dengan akun probe (INSERT 201 / READ-own 200 / READ-other [] / DELETE 204). **F4 54→68.** Tests 175/175 ✓.

- **v1.22.5 (V3 — kunci periode)**: lubang lock ditutup di **lapisan storage** (bukan hanya UI): `assertUnlocked()` dipanggil di `createEntry`/`createLoan`/`addRepayment`/`postJournal`; `submitFormData` cek tanggal tujuan (create-backdated), guard `handleAdjustPost`/`handleAssetPost`/`handleStockSave`. Recurring auto-post aman (bulan terkunci dilewati, tak ditandai posted). +3 test. 178/178 ✓.

- **v1.23.0 (B7 — bunga pinjaman)**: akun **4102 Pendapatan Bunga** / **5113 Beban Bunga**; `splitRepaymentPortions()` (proporsional, kumulatif, dibatasi); `buildRepaymentJournal` pisah pokok vs bunga (given → Cr Piutang + Cr 4102; taken → Dr Hutang + Dr 5113); Laba Rugi & Neraca ikut otomatis. Catatan: pelunasan lama tidak dihitung ulang. **→ F1 78→86.** +6 test. 184/184 ✓.

- **v1.24.0 (B3 subset — peran & audit actor)**: audit kini mencatat pelaku (`actor {role,user}`) + kolom Aktor di laporan; `requireOwner()` di ~18 mutasi admin/hapus (storage); `blockKasir()` di handler jurnal langsung; **tutup lubang V10**: sesi kasir "ingat saya" dipersist (sebelumnya jatuh ke owner setelah restart). Peran Akuntan/HRD + matriks izin penuh **menunggu OQ4**. **→ F4 68→71.** +4 test. 188/188 ✓.

- **v1.25.0 (F9 aksesibilitas — audit WCAG 2.1 AA)**: label aksesibel (nominal `aria-labelledby`; auto-label input dinamis via MutationObserver); semua dialog dinamai + `aria-modal`; fokus kembali ke pemicu + trap dilepas semua jalur tutup; `aria-pressed`/`aria-selected` chip & tab; kontras `--text-muted`→#64748b; focus ring nominal; `prefers-reduced-motion`; `role="alert"` login; hapus `role="main"` ganda; pager berlabel. Sisa: caption/scope tabel, alt chart, hierarki heading. **→ F9 68→75.** +5 test. 193/193 ✓.

- **v1.26.0 (F7 — form Pinjaman disederhanakan)**: bunga jadi chip preset (`Tanpa/2/5/10/Lainnya`), cicilan satu penggerak ("Dibayar berapa bulan?" chip 3/6/12/24) dengan cicilan/bulan read-only (hapus dua field yang saling menimpa), jatuh tempo chip cepat (7/14/30/90 hari) — bahasa diper-sederhana. Validasi cicilan wajib pilih tenor. **→ F7 78→82.** +4 test. 197/197 ✓.

- **v1.27.0 (F3 — kasbon karyawan)**: pinjaman ke nama karyawan auto-link (`employeeId`) → potong otomatis dari gaji; baris "Potong kasbon bulan ini" (cicilan atau sisa, setelah pajak/BPJS, THP ≥ 0, bisa override); "Jeda potong bulan ini"; finalisasi → entri gaji THP berkurang + **Dr Beban Gaji / Cr Piutang** (bunga → Cr 4102), pelunasan source `payroll`, status Lunas; slip cetak & WA menampilkan. **→ F3 76→81.** +6 test. 205/205 ✓.

- **v1.28.0 (F7 — tautkan kontak Karyawan)**: toggle kontak form Pinjaman **Orang / 👷 Karyawan / Perusahaan**; pilih Karyawan → picker karyawan (datalist + chip sisa kasbon) + validasi nama; simpan `contactType:"karyawan"` + `employeeId`; ikon 👷 di kartu/Kontak + Excel-CSV. **→ F7 82→83.** +2 test. 206/206 ✓.

- **v1.29.0 (F8 — mobile)**: audit responsif → hapus aturan global `th/td:nth-child(3,4){display:none}` (menyembunyikan Debit/Kredit di HP = data hilang); tabel Saldo Awal scroll; drawer di atas bottom-nav (z 70/65); `viewport-fit=cover` + `text-size-adjust` + `overflow-x:clip`; padding topbar/konten ≤640; toast di atas nav; modal `max-height:90vh` + body scroll; `.dashboard-head` wrap; grid 2-kolom inline → 1 kolom ≤480; target sentuh `pointer:coarse` ≥44px. **→ F8 74→81.** +3 test statis (12 file). 209/209 ✓.

- **v1.30.0 (F4 — durability)**: **tautkan sesi anonim ke email** (`PUT /auth/v1/user`, user_id tetap) → data bisa diakses dari HP lain; **uji-diri backup** (snapshot→JSON→parse→validasi skema) via tombol 🧪 + audit. **→ F4 71→74.** +4 test. 212/212 ✓.

- **v1.31.0 (F9 lanjutan)**: `scope="col"` + `<caption>` tersembunyi otomatis untuk semua tabel (termasuk dinamis); grafik arus kas & donut `role="img"` + `aria-label`; h3/h4 dashboard diberi `aria-level` (h1→h2→h3). **→ F9 75→80.** +3 test. 215/215 ✓.

- **v1.32.0 (F2 — pajak)**: **OQ2 selesai** (PPN 11% flat configurable, non-PKP — didokumentasikan); `pphFinalForYear()` (PP 23/2018): 0,5% hanya bila omzet ≤ Rp4,8M, di atas → 0 + banner peringatan di laporan pajak. **→ F2 76→80.** +2 test. 217/217 ✓.

- **v1.33.0 (F8 lanjutan + F9 final)**: safe-area kiri/kanan footer entri (landscape/poni); font mikro ≥11px; `.modal-body` scroll-x; item sidebar & bottom-nav beremoji diberi `aria-label` bersih. **→ F8 81→83, F9 80→82.** +1 test (12 file). 218/218 ✓.

- **v1.34.0 (iter 20 — F3)**: lembur **KEP-102/MEN/VI/2004** (jam → 1,5×/2× dari upah÷173); **ganti cuti** (lembur → saldo cuti, 8 jam=1 hari); cuti **UU 13/2003** (jatah 12, saldo per karyawan/tahun, ikut sinkron); **UMP configurable** + peringatan upah di bawah UMP. **→ F3 81→84.** +8 test. 225/225 ✓.

- **v1.35.0 (stok & penjualan — F1)**: audit menemukan bug kritis — penjualan modal **Jual** tak mengurangi stok tapi posting HPP (oversell + mismatch); **diperbaiki** (`sale.lines` kurangi stok). Reversal stok tak lagi ditelan (hapus/edit aman); hapus barang yang dipakai ditolak; kunci periode ditegakkan di pembelian/pembayaran supplier; **📜 kartu stok** (riwayat mutasi). **→ F1 86→88.** +3 test. 228/228 ✓.

- **v1.36.0 (F6/F7 — import marketplace/WA)**: **📥 Import produk** (CSV/Excel, pemetaan kolom otomatis, upsert per SKU/nama) + **📥 Import penjualan** (CSV/Excel pesanan Shopee/TikTok: peta kolom, kelompok per pesanan, cocokkan item, pratinjau, buat penjualan + stok/jurnal) + **WhatsApp/offline** (tempel `2x Kopi 15000`). `marketplace.js` murni. **→ F6 86→88, F7 83→84.** +10 test (13 file). 238/238 ✓.

- **v1.37.0 (F1/F7 — varian & diskon)**: produk punya **Ukuran/Warna/Diskon**; **buat banyak varian** (matriks); harga jual di **Jual** otomatis = harga setelah diskon; untung dari netto; **import produk** memetakan Ukuran/Warna/Diskon. **→ F1 88→89, F7 84→85.** +5 test. 242/242 ✓.

- **v1.38.0 (F7)**: **isi stok & diskon per varian** langsung di tabel matriks (kombinasi ukuran × warna) — sekali isi & Simpan (sebelumnya varian jadi stok 0 lalu diedit satu-satu). **→ F7 85→86.** 242/242 ✓.

- **v1.39.0 (F7)**: **harga & modal per UKURAN** (bukan harga pusat) + **warna premium** (tambahan harga) — varian jadi = ukuran × warna; stok per sel (total ditampilkan); harga/modal/stok pusat disembunyikan saat varian aktif. **→ F7 86→87.** 242/242 ✓.

- **v1.40.0 (F1/F6)**: **halaman Stok** — produk dikelompokkan (SKU) dengan varian sebagai chip + stok; filter stok menipis; **Restock cepat** per varian (jurnal Dr Persediaan / Cr Kas); aksi Jual/Restock/Edit per produk; varian simpan `groupId`/`baseName`. **→ F1 89→90, F6 88→90.** +2 test. 244/244 ✓.

> Catatan sisa (audit stok): **retur penjualan sebagian** belum ada (bisa pakai hapus transaksi = void penuh); harga rata-rata saat hapus pembelian & snapshot HPP historis belum dibetulkan.

- **iter 19 (v1.21.0): B4a Dec PPh 21 + 1721-A1.** `decRecon` (progresif tahunan UU 36/2008 jo. UU HPP 7/2021, cited+isolated, floor 0, NPWP +20%), `pphOverride` di computeSlip + flag, panel Des (Jan–Nov aktual + draf Des, TER vs rekonsiliasi, Terapkan + A1), snapshot `recon` + deskripsi, slip detail transparan. Tarif tahunan menunggu konfirmasi konsultan (OQ tetap terbuka). Test menangkap cacat desain pra-produksi (pemisahan Jan–Nov/Des). Visual gate headless lulus (angka + kedua tombol ter-paint). Tests 162/162 ✓. → F3 66→76.

- **iter 18 (tooling, tanpa perubahan app → tanpa bump versi): DEPLOY guard + VERSION source tunggal.** `scripts/check-prod.mjs` (`npm run verify:prod`, dogfood PASS index+sw) + `scripts/sync-version.mjs` (`npm run sync:version`, `release:patch|minor|major`; idempoten terbukti zero-diff; fail-loudly terbukti via uji marker-hilang; bug Windows-path tertangkap saat verifikasi lalu diperbaiki). F4 52→54. Tests 152/152 ✓. SHIP GATE N/A (tanpa kode app baru; production tetap v1.20.2 terverifikasi via script baru).

- **iter 17 (verify-only, tanpa perubahan kode): V1–V10 dieksekusi.**
  - V1 FAIL: Desember = TER bulanan identik ×12 (161000×12=1.932.000, contoh gapok 8jt+tunj 2jt TK/0); nol logika rekonsiliasi tahunan di payroll.js/app.js → B4a terkonfirmasi, fix di iter 19.
  - V2 PASS: balance lintas tahun utuh; sort YYYY-MM benar.
  - V3 PARTIAL FAIL: lock di 10 jalur, tapi 4 lubang — (a) create via modal entry backdated ke bulan terkunci (entry+loan, submitFormData hanya cek edit-path), (b) jurnal penyesuaian manual (handleAdjustPost), (c) posting penyusutan (handleAssetPost, tanggal bulan berjalan), (d) opname stok (handleStockSave, tanggal hari ini). Storage tidak menegakkan lock secara internal.
  - V4 PASS: split DPP/PPN ke akun terpisah dua sisi + rate configurable.
  - V5 PASS: oversell melempar error, stok tak pernah negatif (applyStockMove).
  - V6 PASS: DEP-YYYY-MM idempoten (cek id eksplisit).
  - V7 FAIL: bunga tak menyentuh P&L (bukti: AR 5.000.000 → pelunasan 5.500.000 terserap penuh ke AR; tak ada akun bunga di COA) → temuan baru **B7**.
  - V8 PASS dgn catatan: 5000 transaksi ≈0.86MB + jurnal ≈1MB < kuota 5MB; QuotaExceededError ditangkap per-store dgn pesan jelas.
  - V9 PASS: restore = merge+sanitize+dedup; jurnal lama dibangun ulang via backfillJournals idempoten.
  - V10 PARTIAL: kontainment kasir hanya CSS display:none; tanpa guard JS/object-level; role dari sessionStorage (client-mutable); audit tanpa aktor → sesuai C3/B3.
- iter 16 (1.19.2)

- **iter 16** (1.19.2) Laporan a11y: drill keyboard, Excel scoping, print filters, period sync, aria groups → F9 64→68
- **iter 15** (1.17.5) Journal/ledger account+memo filter; bookkeeping readiness panel
- **iter 14** (1.17.4) Month-close month picker → T7 ≤9 taps
- **iter 13** (1.17.3) Auto-row in Jual/Beli; Enter → salary field
- **iter 12** (1.17.2) Mode Sederhana toggle; backup download reminder
- **iter 11** (1.17.1) PDF header records active period
- **iter 10** (1.17.0) Buku Besar + Neraca Saldo drill-down
- **iter 9** (1.16.5) Payslip via WhatsApp; report period selector → T8 ≤5 taps
- **iter 8** (1.16.4) Supplier debt aging buckets; bank import surfaced on mobile
- **iter 5** (1.16.1) **B6** opening balances per account, reversible, auto-balance to 3101 → F1 80→86
- **iter 4** (1.16.0) **B5** PPh 23 / 4(2) withholding, account 2107, correct journal → F2 70→76
- **iter 3** (1.15.3) Backup indicator; focus-visible; "Kontak" naming unified (U6)
- **iter 2** (1.15.2) **U2-hybrid** Detail lainnya ▾; **U3** report tabs grouped
- **iter 1** (1.15.1) **B2** contextual credentials; **U4** bottom-nav Lainnya; **B5-lite** configurable PPN
- **iter 0** (1.15.0) Neraca Saldo, PPN 1111 report, PPh 21 recap, Excel export, closing journal (3102)

---

## Frozen — deliberate declines

- **PPh Final 0,5% stays a constant.** PP 23/2018 sets 0.5% of gross turnover. It is statutory, not a preference; making it freely configurable invites wrong input. Revisit as an effective-dated table only if the regulation changes. *(Good call — keep.)*
- **U2 full 3-field modal.** Hiding "Bayar pakai apa?" would break the T1 4-tap benchmark. Payment is the main money path and stays visible. *(Defensible — keep, revisit only if T1 can be preserved.)*
