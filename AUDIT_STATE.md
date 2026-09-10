# Audit State — Wynara Accounting

Repo **v1.20.2** · Production **v1.20.2 VERIFIED 2026-09-10** (fetch langsung; klaim "prod v1.14.2" di audit v2 tidak terbukti — pipeline deploy bekerja, deployment terakhir Ready/Production)
Loop **v2** sejak iter 17. Koreksi aritmetika diterapkan: overall tanpa aritmetika terlihat = invalid.

---

## ⚠ Feasibility — read first

```
F4 (Data durability, weight 15) is blocked on Open Question 3 (backend
choice). Ceiling without a backend: ~55.

max_achievable = 100 × 0.85 + 55 × 0.15 = 93.25

93.25 < 95  →  A+ IS UNREACHABLE.
```

Do not start another feature iteration until Open Question 3 is answered
by a human. Iterations chasing the remaining points without it burn effort
against an unreachable target.

---

## Current scores — corrected (aritmetika wajib tampil)

Recompute dari nilai v1 (F1 86, F2 76, F3 73, F4 52, F5 94, F6 86, F7 80, F8 82, F9 68) memberi **76.80**, bukan ~90. Setelah kalibrasi audit eksternal:

| Axis | W | Prev | **Now** | ×W | Note |
|---|---|---|---|---|---|
| F1 Core ledger | 15 | 86 | **78** | 11.70 | V17: V2/V4/V5/V6/V9 lulus; V3 4 lubang lock + V7 bunga tak diakui |
| F2 Tax conformance | 12 | 76 | **76** | 9.12 | Faktur/NITKU open; PPN position open |
| F3 Payroll & HR | 12 | 73 | **66** | 7.92 | Dec PPh 21 unresolved = correctness risk |
| F4 Data durability | 15 | 52 | **52** | 7.80 | Blocked. Caps the whole rubric. |
| F5 Reporting | 10 | 94 | **92** | 9.20 | Genuinely excellent |
| F6 Task efficiency | 12 | 86 | **86** | 10.32 | Benchmarks tracked honestly |
| F7 Cognitive load | 10 | 80 | **78** | 7.80 | Mode Sederhana helped; U2 Frozen |
| F8 Mobile | 7 | 82 | **74** | 5.18 | 8 releases of mobile layout defects |
| F9 Accessibility | 7 | 68 | **68** | 4.76 | U5 emoji icons untouched |
| **OVERALL** | | ~~90~~ | | **73.80** | Baseline was 59.7 → **+14.1** (iter 17: refinement pengukuran, bukan regresi kode) |

Six of nine axes below 85. Stop condition not met on either clause.

---

## Blocking decisions — nothing proceeds without these

1. **Backend for B1** — Supabase vs self-host. *Gates the A+ target outright.*
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
- **B1 (C1)** Server persistence + auth — Supabase; local-first sebagai cache. *Needs OQ3.*

**P0 — correctness**
- **B4a** December PPh 21 annual progressive reconciliation `[VERIFY]` — highest consequence item in the file. Wrong here = wrong payslips and wrong DJP reporting.
- **B7 (NEW, dari V7 iter 17)** Bunga pinjaman tak pernah menyentuh P&L — tidak ada akun Pendapatan/Beban Bunga di COA; pelunasan menyerap bunga ke AR/AP. Butuh akun + split jurnal pelunasan. Diusulkan slot setelah iter 21 (sebelum UI unfreeze).
- **B4b** Lembur (KEP-102/MEN/VI/2004), cuti 12 hari, UMP/UMK floor validation
- **B4c** Bukti Potong 1721-A1 generation
- **U9** Ten runtime V-checks, none yet run

**P1**
- **B3 (C3)** Akuntan + HRD roles; audit trail with real actor identity; maker-checker
- **B5b** Faktur pajak numbering, NPWP/NITKU, Coretax export
- **DEPLOY** Post-deploy version assertion (pipeline verified working 2026-09-10; add guard script)
- **VERSION** Single source of truth — 4 of 8 regressions traced to hand-syncing four copies

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

## Completed — iterations 1–17

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
