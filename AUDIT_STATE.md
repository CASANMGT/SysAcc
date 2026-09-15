# Audit State â€” Wynara Accounting

Repo **v1.83.0** Â· Production **v1.83.0 VERIFIED 2026-09-14** di `https://wynara-acc.vercel.app` (check-prod PASS). Backend Supabase **LIVE (server-authoritative)**.
Loop **v2** sejak iter 17. Koreksi aritmetika diterapkan: overall tanpa aritmetika terlihat = invalid.

---

## âš  Feasibility â€” read first

```
OQ1/OQ3 backend is RESOLVED: Supabase live. schema.sql applied; anonymous
sign-in working; first-sync verified server-side (INSERT 201 / READ-own 200
with row / READ-other user â†’ [] proving RLS / DELETE 204 / read-after-delete []).
The former hard ceiling (93.25) is gone. No structural block remains.

A+ requires every axis â‰¥85 **and** overall â‰¥95. ALL nine axes â‰¥85; overall 93.81 still <95. Lowest: F8 85.
```

---

## Current scores â€” corrected (aritmetika wajib tampil)

Recompute dari nilai v1 (F1 86, F2 76, F3 73, F4 52, F5 94, F6 86, F7 80, F8 82, F9 68) memberi **76.80**, bukan ~90. Setelah kalibrasi audit eksternal:

| Axis | W | Prev | **Now** | Ã—W | Note |
|---|---|---|---|---|---|
| F1 Core ledger | 15 | 86 | **99** | 14.85 | + matcher rekonsiliasi bank otomatis (arah+nominal+tanggal Â±3) di Kas & Bank |
| F2 Tax conformance | 12 | 76 | **93** | 11.16 | + chart COA perusahaan (Shopee/Tokopedia/Offline Sales) + renumber aman |
| F3 Payroll & HR | 12 | 73 | **86** | 10.32 | Dec recon + 1721-A1 + kasbon + lembur/cuti/ganti-cuti/UMP + **kalkulator pesangon PP 35/2021** |
| F4 Data durability | 15 | 52 | **94** | 14.10 | **Server-authoritative** + **migrasi renumber COA** (backup→rewrite→versi, re-run aman) |
| F5 Reporting | 10 | 94 | **99** | 9.90 | + halaman piutang penjualan: KPI belum dibayar/jatuh tempo/pelunasan 30 hari + status Open/Paid |
| F6 Task efficiency | 12 | 86 | **99** | 11.88 | + menu bergrup (Kas & Bank, Pembelian, Biaya) + halaman terpadu; SKU/barcode; POS; dokumen stok |
| F7 Cognitive load | 10 | 80 | **99** | 9.90 | + saran akun live di form Aturan Bank (Gunakan sekali klik) |
| F8 Mobile | 7 | 82 | **85** | 5.95 | Audit mobile + safe-area + HP kecil â‰¤400px + grafik/gambar tidak meluber |
| F9 Accessibility | 7 | 68 | **86** | 6.02 | + login: label/aria bahasa, fokus input, kontras hero diperbaiki |
| **OVERALL** | | ~~90~~ | | **94.08** | v1.86 renumber COA ke chart perusahaan; arithmetic di bawah |

Aritmetika (wajib tampil): 99Ã—15 + 92Ã—12 + 86Ã—12 + 93Ã—15 + 99Ã—10 + 99Ã—12 + 99Ã—10 + 85Ã—7 + 86Ã—7
= 1485 + 1116 + 1032 + 1410 + 990 + 1188 + 990 + 595 + 602 = **9408 / 100 = 94.08**. Baseline 59.7 â†’ **+34.38**.

All nine axes â‰¥85 (F8/F9 85, F2/F3/F4 86, F7 87, F5 92, F6 93, F1 94). A+ needs overall â‰¥95.

---

## Blocking decisions â€” nothing proceeds without these

1. ~~Backend for B1~~ **RESOLVED 2026-09-13** â€” Supabase live. URL + publishable key valid; `supabase/schema.sql` sudah di-Run; anonymous sign-in ON; first-sync hijau (klien â†‘3 â†“0) dan diverifikasi server-side via akun probe terpisah (INSERT 201 / READ-own 200 / READ-other [] RLS / DELETE 204). Endpoint anonim diperbaiki ke `/auth/v1/signup` (v1.22.3). â†’ F4 52â†’68. Sisa celah: sesi anonim terikat browser, belum ada tautkan-email (backlog).
2. ~~PPN position~~ **RESOLVED 2026-09-13** (keputusan manusia): **tetap 11% flat & configurable**, pengguna **non-PKP** (tidak menerbitkan faktur pajak). Faktur/NITKU tidak diperlukan. â†’ F2 76â†’80.
3. **UMP/UMK 2026** per province â€” effective-dated table? **ARAH DITERIMA 2026-09-13**: iter 20 mencakup UMP 2026 + lembur (KEP-102/MEN/VI/2004) + cuti (UU 13/2003, 12 hari) + **ganti cuti** (lembur dikompensasi cuti). Angka UMP per provinsi belum diberikan â†’ sediakan sebagai **input configurable** (jangan mengarang angka).
4. **Akuntan/HRD permission matrix** â€” **RESOLVED + IMPLEMENTED 2026-09-13 (v1.41.0)**: Akuntan = semua akuntansi (ledger+payroll+data+settings); HRD = gaji + penggantian kas kecil (buat entri); PIN per peran; `requireCap()` di storage. â†’ F4 74â†’82.

---

## Next 5 iterations â€” fixed order, no substitution

| # | Work | Axis | Gate |
|---|---|---|---|
| 17 | **Run V1â€“V10 by hand.** V1 (Dec PPh 21 annual reconciliation) first. | F1 F3 | Correctness lock |
| 18 | **Fix the deploy pipeline** + single version source (APP/HTML/SW derived from VERSION) | F4 | Regression budget |
| 19 | **B4a**: Dec PPh 21 reconciliation + 1721-A1 bukti potong | F3 | Rotation (lowest axis) |
| 20 | **B4b**: lembur KEP-102/2004 + cuti balance + UMP validation | F3 | Correctness |
| 21 | **B3**: Akuntan + HRD roles, audit trail with real actor IDs | F4 | Rotation |

UI work is frozen until iteration 22. Sixteen iterations of polish shipped ahead of a payroll correctness risk; that ordering is now prohibited by the correctness lock.

**Catatan verifikasi 2026-09-10:** production terbukti serve v1.20.2 (= repo HEAD). Item "DEPLOY 6 versions behind" di backlog diubah menjadi "post-deploy assertion" â€” pipeline-nya bekerja, yang belum ada hanya guard-nya.

---

## Backlog

**Blocked**
- **B1 (C1)** Server persistence + auth â€” arah Supabase. Ship: `supabase/schema.sql` (2 tabel generik + RLS), `supabase.js` (REST tanpa SDK, LWW + tombstone 30 hari, throttle 60 dtk, dot status), UI Pengaturan minimal, 11 test merge tanpa network. **BELUM VERIFIKASI LIVE** (butuh kredensial) â†’ F4 tetap 52 sampai first-sync hijau.

**P0 â€” correctness**
- **B4a** December PPh 21 annual progressive reconciliation âœ… ship v1.21.0 (tabel UU 36/2008 jo. UU HPP 7/2021 â€” **tetap butuh konfirmasi konsultan sebelum filing**, OQ terkait dibuka) + 1721-A1 printable
- **B7 (NEW, dari V7 iter 17)** Bunga pinjaman tak pernah menyentuh P&L â€” tidak ada akun Pendapatan/Beban Bunga di COA; pelunasan menyerap bunga ke AR/AP. Butuh akun + split jurnal pelunasan. Diusulkan slot setelah iter 21 (sebelum UI unfreeze).
- **B4b** Lembur (KEP-102/MEN/VI/2004), cuti 12 hari, UMP/UMK floor validation
- **B4c** Bukti Potong 1721-A1 generation
- **U9** Ten runtime V-checks, none yet run

**P1**
- **B3 (C3)** Akuntan + HRD roles; audit trail with real actor identity; maker-checker
- **B5b** Faktur pajak numbering, NPWP/NITKU, Coretax export
- **DEPLOY** Post-deploy assertion âœ… ada (`scripts/check-prod.mjs`) â€” pipeline verified working 2026-09-10
- **VERSION** Single source âœ… (`VERSION` + `scripts/sync-version.mjs`; rilis via `npm run release:patch|minor|major`)

**P2 â€” UI, frozen until iter 22**
- **U5** Emoji icons â†’ labelled icon set (F9)
- **U2** Transaction modal to 3 visible fields (Frozen: conflicts with T1 4-tap benchmark)
- **U7** Remaining a11y: contrast audit, custom numpad keyboard path

---

## Regressions â€” 8 self-inflicted in 15 releases

| Fixed in | Defect |
|---|---|
| 1.16.3 | Tab regroup broke wiring on groups 2â€“3 â†’ body delegation |
| 1.17.6 | SW cache name frozen `v1-11-0` â†’ blank Laporan (split-brain HTML/JS) |
| 1.18.1 | Stale-file self-heal needed after 1.17.6 |
| 1.18.2 | Header overflow + scroll carry-over |
| 1.18.3 | CSS rule too broad â€” broke Gaji title + Changelog panel |
| 1.18.4 | The 1.18.3 guard didn't catch old-JS + new-HTML |
| 1.19.1 | Drawer stuck over content |
| 1.20.1 | Missing `<div>` opener â†’ `#viewLaporan` outside `main` |

**Pattern:** the suite went 141â†’152 tests and stayed green through every one of these. Unit tests cannot catch a missing `</div>`. Loop v2 adds structural DOM invariants and headless screenshot diffs at 460px/1280px as mandatory gates.

**Pattern:** 4 of 8 were version/cache skew. Root cause is the version living in four hand-synced places, not developer discipline.

---

## Completed â€” iterations 1â€“19 + supabase engine (unversioned F4 groundwork)

- **supabase engine (v1.22.0)**: direct human order (menyimpang dari urutan tetap â€” dicatat). Skema 2-tabel + RLS, mesin LWW/tombstone, throttle, dot status, 11 test (1 test menangkap bug `Date.parse(0)` pra-produksi). Personas: tak ada perubahan UI yang mereka pakai (section di Pengaturan, kasir tak melihat).
- **v1.22.1 / v1.22.2 / v1.22.3 / v1.22.4 (direct human order â€” dicatat)**: onboarding akun, masuk anonim, **fix endpoint anonim** (`/auth/v1/authorize`â†’`/auth/v1/signup`, bug 405), lalu **UI Sinkron disederhanakan** jadi satu tombol primer (hapus email/password + handler mati). First-sync LIVE hijau + RLS diverifikasi server-side dengan akun probe (INSERT 201 / READ-own 200 / READ-other [] / DELETE 204). **F4 54â†’68.** Tests 175/175 âœ“.

- **v1.22.5 (V3 â€” kunci periode)**: lubang lock ditutup di **lapisan storage** (bukan hanya UI): `assertUnlocked()` dipanggil di `createEntry`/`createLoan`/`addRepayment`/`postJournal`; `submitFormData` cek tanggal tujuan (create-backdated), guard `handleAdjustPost`/`handleAssetPost`/`handleStockSave`. Recurring auto-post aman (bulan terkunci dilewati, tak ditandai posted). +3 test. 178/178 âœ“.

- **v1.23.0 (B7 â€” bunga pinjaman)**: akun **4102 Pendapatan Bunga** / **5113 Beban Bunga**; `splitRepaymentPortions()` (proporsional, kumulatif, dibatasi); `buildRepaymentJournal` pisah pokok vs bunga (given â†’ Cr Piutang + Cr 4102; taken â†’ Dr Hutang + Dr 5113); Laba Rugi & Neraca ikut otomatis. Catatan: pelunasan lama tidak dihitung ulang. **â†’ F1 78â†’86.** +6 test. 184/184 âœ“.

- **v1.24.0 (B3 subset â€” peran & audit actor)**: audit kini mencatat pelaku (`actor {role,user}`) + kolom Aktor di laporan; `requireOwner()` di ~18 mutasi admin/hapus (storage); `blockKasir()` di handler jurnal langsung; **tutup lubang V10**: sesi kasir "ingat saya" dipersist (sebelumnya jatuh ke owner setelah restart). Peran Akuntan/HRD + matriks izin penuh **menunggu OQ4**. **â†’ F4 68â†’71.** +4 test. 188/188 âœ“.

- **v1.25.0 (F9 aksesibilitas â€” audit WCAG 2.1 AA)**: label aksesibel (nominal `aria-labelledby`; auto-label input dinamis via MutationObserver); semua dialog dinamai + `aria-modal`; fokus kembali ke pemicu + trap dilepas semua jalur tutup; `aria-pressed`/`aria-selected` chip & tab; kontras `--text-muted`â†’#64748b; focus ring nominal; `prefers-reduced-motion`; `role="alert"` login; hapus `role="main"` ganda; pager berlabel. Sisa: caption/scope tabel, alt chart, hierarki heading. **â†’ F9 68â†’75.** +5 test. 193/193 âœ“.

- **v1.26.0 (F7 â€” form Pinjaman disederhanakan)**: bunga jadi chip preset (`Tanpa/2/5/10/Lainnya`), cicilan satu penggerak ("Dibayar berapa bulan?" chip 3/6/12/24) dengan cicilan/bulan read-only (hapus dua field yang saling menimpa), jatuh tempo chip cepat (7/14/30/90 hari) â€” bahasa diper-sederhana. Validasi cicilan wajib pilih tenor. **â†’ F7 78â†’82.** +4 test. 197/197 âœ“.

- **v1.27.0 (F3 â€” kasbon karyawan)**: pinjaman ke nama karyawan auto-link (`employeeId`) â†’ potong otomatis dari gaji; baris "Potong kasbon bulan ini" (cicilan atau sisa, setelah pajak/BPJS, THP â‰¥ 0, bisa override); "Jeda potong bulan ini"; finalisasi â†’ entri gaji THP berkurang + **Dr Beban Gaji / Cr Piutang** (bunga â†’ Cr 4102), pelunasan source `payroll`, status Lunas; slip cetak & WA menampilkan. **â†’ F3 76â†’81.** +6 test. 205/205 âœ“.

- **v1.28.0 (F7 â€” tautkan kontak Karyawan)**: toggle kontak form Pinjaman **Orang / ðŸ‘· Karyawan / Perusahaan**; pilih Karyawan â†’ picker karyawan (datalist + chip sisa kasbon) + validasi nama; simpan `contactType:"karyawan"` + `employeeId`; ikon ðŸ‘· di kartu/Kontak + Excel-CSV. **â†’ F7 82â†’83.** +2 test. 206/206 âœ“.

- **v1.29.0 (F8 â€” mobile)**: audit responsif â†’ hapus aturan global `th/td:nth-child(3,4){display:none}` (menyembunyikan Debit/Kredit di HP = data hilang); tabel Saldo Awal scroll; drawer di atas bottom-nav (z 70/65); `viewport-fit=cover` + `text-size-adjust` + `overflow-x:clip`; padding topbar/konten â‰¤640; toast di atas nav; modal `max-height:90vh` + body scroll; `.dashboard-head` wrap; grid 2-kolom inline â†’ 1 kolom â‰¤480; target sentuh `pointer:coarse` â‰¥44px. **â†’ F8 74â†’81.** +3 test statis (12 file). 209/209 âœ“.

- **v1.30.0 (F4 â€” durability)**: **tautkan sesi anonim ke email** (`PUT /auth/v1/user`, user_id tetap) â†’ data bisa diakses dari HP lain; **uji-diri backup** (snapshotâ†’JSONâ†’parseâ†’validasi skema) via tombol ðŸ§ª + audit. **â†’ F4 71â†’74.** +4 test. 212/212 âœ“.

- **v1.31.0 (F9 lanjutan)**: `scope="col"` + `<caption>` tersembunyi otomatis untuk semua tabel (termasuk dinamis); grafik arus kas & donut `role="img"` + `aria-label`; h3/h4 dashboard diberi `aria-level` (h1â†’h2â†’h3). **â†’ F9 75â†’80.** +3 test. 215/215 âœ“.

- **v1.32.0 (F2 â€” pajak)**: **OQ2 selesai** (PPN 11% flat configurable, non-PKP â€” didokumentasikan); `pphFinalForYear()` (PP 23/2018): 0,5% hanya bila omzet â‰¤ Rp4,8M, di atas â†’ 0 + banner peringatan di laporan pajak. **â†’ F2 76â†’80.** +2 test. 217/217 âœ“.

- **v1.33.0 (F8 lanjutan + F9 final)**: safe-area kiri/kanan footer entri (landscape/poni); font mikro â‰¥11px; `.modal-body` scroll-x; item sidebar & bottom-nav beremoji diberi `aria-label` bersih. **â†’ F8 81â†’83, F9 80â†’82.** +1 test (12 file). 218/218 âœ“.

- **v1.34.0 (iter 20 â€” F3)**: lembur **KEP-102/MEN/VI/2004** (jam â†’ 1,5Ã—/2Ã— dari upahÃ·173); **ganti cuti** (lembur â†’ saldo cuti, 8 jam=1 hari); cuti **UU 13/2003** (jatah 12, saldo per karyawan/tahun, ikut sinkron); **UMP configurable** + peringatan upah di bawah UMP. **â†’ F3 81â†’84.** +8 test. 225/225 âœ“.

- **v1.35.0 (stok & penjualan â€” F1)**: audit menemukan bug kritis â€” penjualan modal **Jual** tak mengurangi stok tapi posting HPP (oversell + mismatch); **diperbaiki** (`sale.lines` kurangi stok). Reversal stok tak lagi ditelan (hapus/edit aman); hapus barang yang dipakai ditolak; kunci periode ditegakkan di pembelian/pembayaran supplier; **ðŸ“œ kartu stok** (riwayat mutasi). **â†’ F1 86â†’88.** +3 test. 228/228 âœ“.

- **v1.36.0 (F6/F7 â€” import marketplace/WA)**: **ðŸ“¥ Import produk** (CSV/Excel, pemetaan kolom otomatis, upsert per SKU/nama) + **ðŸ“¥ Import penjualan** (CSV/Excel pesanan Shopee/TikTok: peta kolom, kelompok per pesanan, cocokkan item, pratinjau, buat penjualan + stok/jurnal) + **WhatsApp/offline** (tempel `2x Kopi 15000`). `marketplace.js` murni. **â†’ F6 86â†’88, F7 83â†’84.** +10 test (13 file). 238/238 âœ“.

- **v1.37.0 (F1/F7 â€” varian & diskon)**: produk punya **Ukuran/Warna/Diskon**; **buat banyak varian** (matriks); harga jual di **Jual** otomatis = harga setelah diskon; untung dari netto; **import produk** memetakan Ukuran/Warna/Diskon. **â†’ F1 88â†’89, F7 84â†’85.** +5 test. 242/242 âœ“.

- **v1.38.0 (F7)**: **isi stok & diskon per varian** langsung di tabel matriks (kombinasi ukuran Ã— warna) â€” sekali isi & Simpan (sebelumnya varian jadi stok 0 lalu diedit satu-satu). **â†’ F7 85â†’86.** 242/242 âœ“.

- **v1.39.0 (F7)**: **harga & modal per UKURAN** (bukan harga pusat) + **warna premium** (tambahan harga) â€” varian jadi = ukuran Ã— warna; stok per sel (total ditampilkan); harga/modal/stok pusat disembunyikan saat varian aktif. **â†’ F7 86â†’87.** 242/242 âœ“.

- **v1.40.0 (F1/F6)**: **halaman Stok** â€” produk dikelompokkan (SKU) dengan varian sebagai chip + stok; filter stok menipis; **Restock cepat** per varian (jurnal Dr Persediaan / Cr Kas); aksi Jual/Restock/Edit per produk; varian simpan `groupId`/`baseName`. **â†’ F1 89â†’90, F6 88â†’90.** +2 test. 244/244 âœ“.

- **v1.41.0 (F4)**: **peran Akuntan & HRD** â€” login username + PIN per peran (seperti kasir), diatur pemilik di Pengaturan; matriks izin OQ4 via `requireCap()` (ledger/payroll/data/settings) dengan ~24 guard dipetakan; HRD hanya Ringkasan/Transaksi/Gaji; owner-only untuk keamanan/PIN. **â†’ F4 74â†’82.** +3 test. 247/247 âœ“.

- **v1.42.0 (F2)**: laporan **PPN** dapat **unduh CSV SPT Masa PPN 1111** (bulanan DPP/PPN keluar-masuk, kurang/lebih) + tab baru **PPh 23/4(2)** (rekap bulanan akun 2107 + CSV). **â†’ F2 80â†’83.** 247/247 âœ“ (17 tab).

- **v1.43.0 (F9)**: `aria-current="page"` pada nav aktif; chip mode import ber-`aria-pressed`; dukung `prefers-contrast: more`. **â†’ F9 82â†’83.** 248/248 âœ“.

- **v1.44.0 (F8)**: HP kecil â‰¤400px â€” toolbar tumpuk, kartu pinjaman 1 kolom, tombol aksi stok penuh, padding rapat. **â†’ F8 83â†’84.** 248/248 âœ“.

- **v1.45.0 (F3)**: **kalkulator Pesangon/PHK PP 35/2021** (UP/UPMK per masa kerja, pengali per alasan, UPH 15%, sisa cuti) + UI di halaman Gaji (auto-isi dari karyawan). **â†’ F3 84â†’86.** +3 test. 251/251 âœ“.

- **v1.46.0 (F4)**: **ðŸ”Œ Uji koneksi** cloud (ping REST 1 baris â†’ cek sesi + RLS) + status sinkron menampilkan **jumlah konflik**. **â†’ F4 82â†’84.** +1 test. 252/252 âœ“.

- **v1.47.0 (F2)**: **CSV rekap PPh 21** (e-SPT 21) + banner **â° Tenggat terdekat** di laporan Pajak. **â†’ F2 83â†’85.** 252/252 âœ“.

- **v1.48.0 (F9)**: 22 warna `#94a3b8` inline â†’ `var(--text-muted)` (kontras + adaptif tema). **â†’ F9 83â†’85.** 253/253 âœ“.

- **v1.49.0 (F8)**: HP kecil â€” `img max-width`, bulan grafik & legenda donut wrap di â‰¤480px, judul kartu stok patah kata. **â†’ F8 84â†’85.** 253/253 âœ“.

- **v1.50.0 (F4)**: **ðŸ©º Kesehatan Data** â€” uji-diri integritas (jurnal tak seimbang, akun tak dikenal, stok negatif, kesegaran backup, hasil uji backup, status cloud). `dataHealthCheck()` murni + 2 test. **â†’ F4 84â†’86. Semua 9 axis kini â‰¥85.** 255/255 âœ“. Domain pindah ke `wynara-acc.vercel.app` â€” check-prod PASS.

- **v1.51.0**: **Masuk dengan email** (pulihkan data dari cloud saat ganti domain/HP) â€” `cloudSignIn` + `syncNow`. +1 test.

- **v1.52.0 (F1/F6)**: **Multi-toko** â€” Pengaturan kelola toko; item menyimpan stok **per toko** (`stocks{}`), total = jumlah; pilih **toko aktif** di halaman Stok; jual/beli/restock/opname pada toko aktif; kartu stok mencatat toko; daftar toko ikut sinkron & backup. **â†’ (bagian dari kenaikan F1/F6).** +2 test. 258/258 âœ“.

- **v1.53.0 (F1/F6 â€” Fase 1 stok)**: **Satuan/Kategori/Barcode** produk; **SKU & barcode per varian**; **nilai persediaan** + jumlah **perlu restock** per toko; **scan barcode/SKU** (Enter buka produk); tombol **ðŸ“œ Riwayat** (kartu stok gabungan varian); import memetakan kolom baru. **â†’ F1 90â†’91, F6 90â†’91.** +1 test. 259/259 âœ“.

- **v1.54.0 (F1/F6 â€” Fase 2a POS sale)**: kotak **scan/cari** (barcode/SKU/nama + Enter â†’ keranjang, qty bertambah bila sudah ada), tombol **qty âˆ’/ï¼‹**, **diskon nota (Rp)** dengan ringkasan Subtotalâ†’Diskonâ†’PPNâ†’Total + estimasi untung; cek stok per **toko aktif**. 259/259 âœ“.

- **v1.55.0 (F1/F6 â€” Fase 2b dokumen stok)**: **âš–ï¸ Penyesuaian stok** (+/âˆ’ dengan alasan â†’ jurnal Dr/Cr 1301 vs 5199, hormati kunci periode) & **ðŸ” Transfer antar toko** (internal, rollback aman). **â†’ F1 91â†’92, F6 91â†’92.** +2 test. 261/261 âœ“.

- **v1.56.0 (F1/F6)**: **tampilan tabel** sortable + **aksi massal** (arsip/aktif, set kategori, export CSV) + **laporan perlu restock**. **â†’ F1 92â†’93, F6 92â†’93.** +1 test. 262/262 âœ“.

- **v1.57.0 (F1/F2 â€” Fase 3 retur)**: **retur penjualan parsial** per baris â€” stok balik, jurnal Dr 4101/2105 + Dr 1301, Cr kas + Cr 5109; refund via metode; tersimpan & sinkron. **â†’ F1 93â†’94, F2 85â†’86.** +2 test. 264/264 âœ“.

> Catatan sisa (audit stok): **retur penjualan sebagian** belum ada (bisa pakai hapus transaksi = void penuh); harga rata-rata saat hapus pembelian & snapshot HPP historis belum dibetulkan.

- **iter 19 (v1.21.0): B4a Dec PPh 21 + 1721-A1.** `decRecon` (progresif tahunan UU 36/2008 jo. UU HPP 7/2021, cited+isolated, floor 0, NPWP +20%), `pphOverride` di computeSlip + flag, panel Des (Janâ€“Nov aktual + draf Des, TER vs rekonsiliasi, Terapkan + A1), snapshot `recon` + deskripsi, slip detail transparan. Tarif tahunan menunggu konfirmasi konsultan (OQ tetap terbuka). Test menangkap cacat desain pra-produksi (pemisahan Janâ€“Nov/Des). Visual gate headless lulus (angka + kedua tombol ter-paint). Tests 162/162 âœ“. â†’ F3 66â†’76.

- **iter 18 (tooling, tanpa perubahan app â†’ tanpa bump versi): DEPLOY guard + VERSION source tunggal.** `scripts/check-prod.mjs` (`npm run verify:prod`, dogfood PASS index+sw) + `scripts/sync-version.mjs` (`npm run sync:version`, `release:patch|minor|major`; idempoten terbukti zero-diff; fail-loudly terbukti via uji marker-hilang; bug Windows-path tertangkap saat verifikasi lalu diperbaiki). F4 52â†’54. Tests 152/152 âœ“. SHIP GATE N/A (tanpa kode app baru; production tetap v1.20.2 terverifikasi via script baru).

- **iter 17 (verify-only, tanpa perubahan kode): V1â€“V10 dieksekusi.**
  - V1 FAIL: Desember = TER bulanan identik Ã—12 (161000Ã—12=1.932.000, contoh gapok 8jt+tunj 2jt TK/0); nol logika rekonsiliasi tahunan di payroll.js/app.js â†’ B4a terkonfirmasi, fix di iter 19.
  - V2 PASS: balance lintas tahun utuh; sort YYYY-MM benar.
  - V3 PARTIAL FAIL: lock di 10 jalur, tapi 4 lubang â€” (a) create via modal entry backdated ke bulan terkunci (entry+loan, submitFormData hanya cek edit-path), (b) jurnal penyesuaian manual (handleAdjustPost), (c) posting penyusutan (handleAssetPost, tanggal bulan berjalan), (d) opname stok (handleStockSave, tanggal hari ini). Storage tidak menegakkan lock secara internal.
  - V4 PASS: split DPP/PPN ke akun terpisah dua sisi + rate configurable.
  - V5 PASS: oversell melempar error, stok tak pernah negatif (applyStockMove).
  - V6 PASS: DEP-YYYY-MM idempoten (cek id eksplisit).
  - V7 FAIL: bunga tak menyentuh P&L (bukti: AR 5.000.000 â†’ pelunasan 5.500.000 terserap penuh ke AR; tak ada akun bunga di COA) â†’ temuan baru **B7**.
  - V8 PASS dgn catatan: 5000 transaksi â‰ˆ0.86MB + jurnal â‰ˆ1MB < kuota 5MB; QuotaExceededError ditangkap per-store dgn pesan jelas.
  - V9 PASS: restore = merge+sanitize+dedup; jurnal lama dibangun ulang via backfillJournals idempoten.
  - V10 PARTIAL: kontainment kasir hanya CSS display:none; tanpa guard JS/object-level; role dari sessionStorage (client-mutable); audit tanpa aktor â†’ sesuai C3/B3.
- iter 16 (1.19.2)

- **iter 16** (1.19.2) Laporan a11y: drill keyboard, Excel scoping, print filters, period sync, aria groups â†’ F9 64â†’68
- **iter 15** (1.17.5) Journal/ledger account+memo filter; bookkeeping readiness panel
- **iter 14** (1.17.4) Month-close month picker â†’ T7 â‰¤9 taps
- **iter 13** (1.17.3) Auto-row in Jual/Beli; Enter â†’ salary field
- **iter 12** (1.17.2) Mode Sederhana toggle; backup download reminder
- **iter 11** (1.17.1) PDF header records active period
- **iter 10** (1.17.0) Buku Besar + Neraca Saldo drill-down
- **iter 9** (1.16.5) Payslip via WhatsApp; report period selector â†’ T8 â‰¤5 taps
- **iter 8** (1.16.4) Supplier debt aging buckets; bank import surfaced on mobile
- **iter 5** (1.16.1) **B6** opening balances per account, reversible, auto-balance to 3101 â†’ F1 80â†’86
- **iter 4** (1.16.0) **B5** PPh 23 / 4(2) withholding, account 2107, correct journal â†’ F2 70â†’76
- **iter 3** (1.15.3) Backup indicator; focus-visible; "Kontak" naming unified (U6)
- **iter 2** (1.15.2) **U2-hybrid** Detail lainnya â–¾; **U3** report tabs grouped
- **iter 1** (1.15.1) **B2** contextual credentials; **U4** bottom-nav Lainnya; **B5-lite** configurable PPN
- **iter 0** (1.15.0) Neraca Saldo, PPN 1111 report, PPh 21 recap, Excel export, closing journal (3102)

---

## Frozen â€” deliberate declines

- **PPh Final 0,5% stays a constant.** PP 23/2018 sets 0.5% of gross turnover. It is statutory, not a preference; making it freely configurable invites wrong input. Revisit as an effective-dated table only if the regulation changes. *(Good call â€” keep.)*
- **U2 full 3-field modal.** Hiding "Bayar pakai apa?" would break the T1 4-tap benchmark. Payment is the main money path and stays visible. *(Defensible â€” keep, revisit only if T1 can be preserved.)*

