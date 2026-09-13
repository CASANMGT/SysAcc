# Audit State — Wynara Accounting

Repo **v1.23.0** · Production **v1.23.0 VERIFIED 2026-09-13** (check-prod PASS: index=1.23.0, sw=wynara-v1-23-0). Backend Supabase **LIVE** — first-sync + RLS terverifikasi server-side.
Loop **v2** sejak iter 17. Koreksi aritmetika diterapkan: overall tanpa aritmetika terlihat = invalid.

---

## ⚠ Feasibility — read first

```
OQ1/OQ3 backend is RESOLVED: Supabase live. schema.sql applied; anonymous
sign-in working; first-sync verified server-side (INSERT 201 / READ-own 200
with row / READ-other user → [] proving RLS / DELETE 204 / read-after-delete []).
The former hard ceiling (93.25) is gone. No structural block remains.

A+ still requires every axis ≥85. Lowest: F9 68, F8 74, F2 76, F3 76, F7 78
— five axes below 85 (F1 now 86). Keep working correctness; do not chase cosmetics.
```

---

## Current scores — corrected (aritmetika wajib tampil)

Recompute dari nilai v1 (F1 86, F2 76, F3 73, F4 52, F5 94, F6 86, F7 80, F8 82, F9 68) memberi **76.80**, bukan ~90. Setelah kalibrasi audit eksternal:

| Axis | W | Prev | **Now** | ×W | Note |
|---|---|---|---|---|---|
| F1 Core ledger | 15 | 86 | **86** | 12.90 | V3 4 lubang lock ditutup (ditegakkan di storage) + B7 bunga pinjaman kini masuk Laba/Rugi |
| F2 Tax conformance | 12 | 76 | **76** | 9.12 | Faktur/NITKU open; PPN position open |
| F3 Payroll & HR | 12 | 73 | **76** | 9.12 | Dec recon + 1721-A1 ship (lembur/cuti/UMP → iter 20) |
| F4 Data durability | 15 | 52 | **68** | 10.20 | Supabase LIVE: first-sync push + RLS read/write/delete verified server-side. Gap: sesi anonim masih terikat browser |
| F5 Reporting | 10 | 94 | **92** | 9.20 | Genuinely excellent |
| F6 Task efficiency | 12 | 86 | **86** | 10.32 | Benchmarks tracked honestly |
| F7 Cognitive load | 10 | 80 | **78** | 7.80 | Mode Sederhana helped; U2 Frozen |
| F8 Mobile | 7 | 82 | **74** | 5.18 | 8 releases of mobile layout defects |
| F9 Accessibility | 7 | 68 | **68** | 4.76 | U5 emoji icons untouched |
| **OVERALL** | | ~~90~~ | | **78.60** | F1 78→86 (V3+B7); arithmetic di bawah |

Aritmetika (wajib tampil): 86×15 + 76×12 + 76×12 + 68×15 + 92×10 + 86×12 + 78×10 + 74×7 + 68×7
= 1290 + 912 + 912 + 1020 + 920 + 1032 + 780 + 518 + 476 = **7860 / 100 = 78.60**. Baseline 59.7 → **+18.9**.

Five of nine axes below 85. Stop condition not met on either clause.

---

## Blocking decisions — nothing proceeds without these

1. ~~Backend for B1~~ **RESOLVED 2026-09-13** — Supabase live. URL + publishable key valid; `supabase/schema.sql` sudah di-Run; anonymous sign-in ON; first-sync hijau (klien ↑3 ↓0) dan diverifikasi server-side via akun probe terpisah (INSERT 201 / READ-own 200 / READ-other [] RLS / DELETE 204). Endpoint anonim diperbaiki ke `/auth/v1/signup` (v1.22.3). → F4 52→68. Sisa celah: sesi anonim terikat browser, belum ada tautkan-email (backlog).
2. **PPN position** — 11% flat, or 12% with DPP nilai lain (effective 11%)? Needs a current cited source.
3. **UMP/UMK 2026** per province — effective-dated table?
4. **Akuntan/HRD permission matrix** — may an accountant post adjusting journals without approval?

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
