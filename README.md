# SysAcc — Wynara Accounting System

> Clean, offline-first accounting for UMKM Indonesia — pemasukan, pengeluaran, piutang/hutang cicilan, stok, payroll + PPh 21, laporan akuntan & pajak.

![Version](https://img.shields.io/badge/version-1.20.2-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%2B%20LocalStorage-lightgrey)

Live: `https://sysacc-three.vercel.app` — login `admin / admin` (pertama kali; ganti di Pengaturan → Keamanan) · Kasir: username `kasir` + PIN

---

## ✨ Features

**Dashboard**
- 4 metric cards: Pemasukan / Pengeluaran / Saldo Bersih / Piutang-Hutang
- Arus Kas 6-bulan (area + line, fills missing months with 0)
- Pengeluaran per Kategori donut + legend
- Anggaran bulanan progress bar
- Filter pills + search (debounced) + pagination (20/page)

**Transaksi**
- Tabel `TANGGAL / KATEGORI / CATATAN / BAYAR PAKAI / MASUK-KELUAR / UANG` — `↗ Masuk` green / `↘ Keluar` red, left border accent, `UANG` `white-space:nowrap` no wrap
- Filter `Semua / Masuk / Keluar` chips above table, syncs with hidden `typeGroupFilter`
- Full page `Transaksi` view with `KONTAK` column, search, `Semua Jenis/Kategori` + pagination (separate `transaksiPage`)
- `Masuk/Keluar` left border, `loan-row` yellow accent
- Bulk select (checkbox), hapus terpilih, export Excel terpilih/tampilan, density `Padat/Nyaman`, kolom Cara Bayar on/off

**Tambah Transaksi (clean modal, bahasa anak 10 tahun)**
- Hero `Uang berapa?` 48px centered, date pill, underline bar + hint Rupiah otomatis
- Jenis `Uang masuk atau keluar?` segmented `Pemasukan/Pengeluaran` sliding bg + hint `Uang masuk ke kamu — saldo nambah` / `Uang keluar dari kamu — saldo berkurang`
- Kategori `Buat apa?` 3×4 grid cards with check + sublabel jelas (`Gajian kamu`, `Jajan & makan`…)
- Panel pinjaman (when `Kasih Pinjam/Pinjam Uang`): mode `📤 Baru / 📥 Balikin`, `Teman / Perusahaan?`, `Kasih pinjam ke siapa? / Pinjam dari siapa?` search + chips + dropdown, `Bayarnya gimana?` `Sekali Bayar 1x/Cicilan`, `Bayar berapa tiap bulan? ↔ Berapa bulan?` bidirectional auto-calc (`ceil(amt/tenor)`), picker pelunasan (`N teman belum balikin — ketuk untuk memilih`)
- `Bayar pakai apa?` always visible (8 options: `Tunai`, `Credit Card`, `QRIS`, `Transfer`, `Debit`, `E-Wallet`, `Paylater`, `Lainnya`) + conditional detail (`Bank kartu kreditnya apa? + 4 angka belakang`, `QRIS pakai apa?`, `E-Walletnya apa?`, `Paylater pakai apa?`, `Transfer ke bank apa?`, `Bank debitnya apa?`)
- `Detail lainnya ▾` (kolaps): Barang, PPN, Catatan, Ulangi — auto-buka saat kategori butuh barang; `Bayar pakai` tetap terlihat (arus kas 4-tap)
- Catatan (boleh kosong) + `🔁 Ulangi otomatis tiap bulan` recurring

**Cara Bayar Detail**
- `credit` → `Bank CC + 4 Digit`
- `debit` → `Bank Debit + 4 Digit`
- `qris` → `Penyedia QRIS` (BCA/BRI/Mandiri/BNI/Shopee/GoPay/DANA/OVO/LinkAja)
- `ewallet` → `E-Wallet` (DANA/GoPay/OVO/ShopeePay/LinkAja/GrabPay)
- `paylater` → `Platform` (Shopee/Tokopedia/TikTok/Kredivo/Akulaku/Indodana/Atome/Lazada)
- `transfer` → `Bank Transfer`

**Akuntansi (double-entry, SAK EMKM)**
- COA 28 akun (kas 1101–1109, piutang, persediaan, PPN, aset tetap 1510 + akumulasi 1519, hutang incl. BPJS 2110 + PPh dipotong 2107, modal + laba ditahan 3102, pendapatan, beban incl. HPP 5109 + penyusutan 5129); tiap transaksi posting jurnal balance (kas/bank ↔ pendapatan/beban/piutang/hutang, split PPN, HPP/Opsname)
- Backfill otomatis untuk data lama; jurnal ikut backup; audit trail 500 aktivitas
- Modal Awal + **saldo awal per akun** (draft, live cek seimbang, reversible) di Pengaturan → Neraca balance (Aset = Kewajiban + Modal + Laba)
- **Jurnal penyesuaian manual** (debit/kredit bebas, cek balance live) + **jurnal penutupan bulan** (pendapatan & beban → Laba Ditahan, idempoten, picker 6 bulan)

**Usaha kecil**
- Stok: beli/jual dari form transaksi (rata-rata modal, cegah oversell), opname, alert menipis; **Beli ke supplier** (hutang usaha, bayar bertahap, jatuh tempo)
- Neraca komparatif (awal vs kini + selisih) melengkapi L/R komparatif
- Kas: transfer antar dompet, rekonsiliasi fisik, saldo dompet dari jurnal
- Import mutasi bank CSV (match ±3 hari), invoice `INV/…` + cetak, PPh Final 0.5% + reminder tgl 15, aging piutang + tagih via WA
- Gaji UU: halaman Karyawan & Gaji (Karyawan tab + modal edit 3 sub-tab, Hitung & Bayar tab per-periode + draft/final + **salin bulan lalu** + bonus/denda + **absensi hadir** (saran denda otomatis) + **⚙️ tarif iuran editable** — JKK/JKM/JHT/JP/Kes perusahaan & karyawan, Riwayat tab), **PPh 21 TER atas netto (PMK 168/2023)** + biaya jabatan cap Rp500rb + **NPWP (tanpa NPWP +20%)**, BPJS/THR otomatis, slip rinci + **cetak slip** + **kirim WA**; karyawan: email, bank, L/P, lahir, HP, alamat, mulai kerja, kontrak, PTKP
- Rupiah desimal di semua kolom uang (`1.234,56`)
- COA custom, Jual multi-baris dari stok (+HPP/struk), laporan Gaji bulanan/tahunan + cetak, cetak semua laporan, kunci periode, L/R komparatif + anggaran vs realisasi

**Pinjaman (Kasih Pinjam / Pinjam Uang)**
- 4 alur: `Kasih pinjam 📤` (uang keluar) / `Dibalikin 📥` (terima) vs `Pinjam uang 📥` (uang masuk) / `Balikin 📤` (bayar) via mode toggle + picker sisa
- Cicilan tenor `Math.ceil(amount/installment)` → `Lama: 12 bulan`, `Sisa 8 bulan • 4/12 kali`, `Bayar ke-5/12` — jadwal turunan dari tanggal mulai + progress cicilan
- `Lihat jadwal ▾` per cicilan 1..N + tombol `Bayar/Terima N/M` one-click + modal bayar ringkasan (`Total uang / Sudah dibayar / Sisa` + progress) + chip `1x..Nx` + `Bayar semua`
- Kartu: `Sudah`, `Sisa`, `Belum lunas/Lunas`, `Bayaran berikutnya/Harus dibayar`, badge `Telat N hari`, progress bar, bayar/hapus, riwayat pembayaran
- Tab `Semua (n) / 🟢 Kasih Pinjam (n) / 🔴 Pinjam Uang (n)` + `Sembunyikan lunas` (persisted) + legenda alur uang
- **Bunga flat opsional** 0–100%: total dibalikin = pokok + bunga; cicilan, jadwal, sisa & lunas ikut total
- Dashboard kartu ganda + `Surplus/Defisit`, pengingat dinamis (badge bell + kartu overdue)

**Lainnya**
- Kontak (orang/perusahaan, + No. WA) with cascade rename, search
- **Laporan 16 tabs** (halaman penuh + modal): Ikhtisar (Bulanan/Per Kategori/Arus Kas/Top Pengeluaran/Pengeluaran/Produk), Resmi (Laba Rugi/Neraca/Neraca Saldo/Jurnal/Buku Besar), Kepatuhan (Pajak/PPN/PPh 21/Gaji/Audit) — drill-down per akun, search Jurnal/Buku Besar, panel kesehatan pembukuan, periode selector (termasuk kuartal), PDF berlabel periode, export Excel, CSV pajak DJP
- Import/Export: `Excel (.xlsx)` 4 sheets, `CSV`, `JSON` backup (validasi schema, baris rusak dilewati, dedup), `JSON/CSV` import
- Backup `wynara-backup-YYYY-MM-DD.json` + restore + kirim via WA/Email + **cadangan otomatis IndexedDB** (pulih saat boot) + dot status topbar + nudge >14 hari
- Anggaran bulanan + **anggaran per kategori** + **saldo per dompet** + recurring auto-post + kategori custom delete
- **Kwitansi** 🧾 per transaksi (terbilang + PPN configurable + cetak), **Urungkan hapus** 6 detik
- **Tarif PPN configurable** (Pengaturan; jurnal, jual, kwitansi, laporan PPN ikut); **PPh 23/4(2)** potong di bayar supplier (akun 2107)
- PWA installable (offline; SW cache ikut VERSION + self-heal split-brain), Bantuan + halaman Changelog, 152 tes vitest
- Sidebar `Ringkasan ↔ Transaksi ↔ Laporan ↔ Gaji` views + drawer ☰ (collapse tersimpan) + bottom nav mobile (Beranda/Transaksi/＋/Laporan/Gaji/Lainnya), topbar search sync, theme `dark-mode` (toggle in Pengaturan; **chart ikut gelap** via CSS vars `--chart-*`), **Mode Sederhana** (sembunyikan alat akuntan)
- **Notifikasi terpadu** (badge 🔔: pinjaman + stok + hutang supplier + PPh) dengan tombol **Buka →** menuju bagian terkait
- **ARIA**: tombol ikon berlabel; rincian gaji `aria-expanded`; drill-down keyboard (Tab+Enter); focus ring `:focus-visible`
- Toast (`success/error/warning/info`), focus trap, keyboard `Ctrl+N` / `/` / `Esc` / `?`
- Print, pagination `prev/next/loadMore`, empty states instruktif semua tab laporan

---

## 🛠️ Stack

- Vanilla HTML/CSS/JS (ES modules) — no build
- `localStorage` keys: `ledger_entries`, `ledger_loans`, `ledger_repayments`, `ledger_people`, `wynara_budget`, `wynara_recurring`
- `xlsx@0.18.5` CDN for Excel
- `Inter` font, design tokens (`--space`, `--radius`, `--shadow`, `--font-mono`)

---

## ☁️ Sinkron Online (Supabase, opsional)

> Aplikasi tetap jalan 100% offline dari HP ini. Sinkron online hanya cermin
> agar data yang sama bisa dibuka di HP/laptop lain.

**1. Siapkan project (sekali saja, ~3 menit)**
1. Buka [supabase.com](https://supabase.com) → New project → catat **Project URL** (`https://xxx.supabase.co`)
2. Project Settings → API → salin **`anon` / `publishable` key** (JANGAN `service_role` — tidak pernah dibutuhkan aplikasi ini)
3. SQL Editor → New query → tempel isi `supabase/schema.sql` → Run (membuat 2 tabel + RLS: user hanya bisa baca/tulis datanya sendiri)

**2. Hubungkan aplikasi**
Pengaturan → *Sinkron Online* → isi URL + anon key + email + kata sandi → **Hubungkan & Masuk**. Sinkron pertama mengunggah data HP ini; dot ☁️ di topbar menunjukkan status (abu = mati, hijau = aktif, merah = gagal — arahkan kursor untuk detail).

**Aturan main:** local-first — localStorage sumber utama; konflik gabung last-write-wins per baris (seri → lokal menang); hapus dilacak 30 hari agar tak hidup lagi. Auth terpisah dari login kasir lokal (disatukan di iter peran/B3).

---

## 🚀 Getting Started

```bash
# clone
git clone https://github.com/CASANMGT/SysAcc.git
cd SysAcc

# serve (any static server, ES modules need http)
python -m http.server 3456
# or: npx http-server -p 3456

# open
http://localhost:3456
# login: admin / admin
```

No install, no env.

---

## 📁 Structure

```
accounting-system/
├─ index.html   # login + sidebar/drawer + 5 views + 20+ dialogs (stok, jual, beli, gaji, aset, penyesuaian, saldo awal…)
├─ style.css    # tokens + layout + views + modals + laporan + dark-mode + responsive
├─ features.css # gaya v1.4+ (toast undo, kwitansi, info modal, @font-face Inter lokal)
├─ app.js       # state, filters, sort, search, pagination, budget, wallet, kwitansi, backup, recurring
├─ ui.js        # renderEntries, category cards, tx modal, payment detail, loans cards, repay modal, undo toast
├─ storage.js   # entries/loans/repayments/people/budget/recurring + schema validation + snapshot/restore + engine
├─ reports.js   # filterEntries, computeTotals, breakdown, monthly/cashflow, loanSummary
├─ loanmath.js  # tenor/sisa/jadwal/jatuh tempo/bunga murni (satu-satunya sumber, di-test)
├─ charts.js    # Arus Kas SVG + donut (pindah dari app.js)
├─ coa.js       # Chart of Accounts SAK EMKM + pemetaan bayar/kategori
├─ journals.js  # builder jurnal balance + saldo + deteksi pincang
├─ idb.js       # mirror IndexedDB fire-and-forget
├─ sw.js        # service worker (cache-first app shell; CACHE ikut VERSION)
├─ supabase.js  # sinkron online opsional (REST murni, local-first, LWW + tombstone)
├─ supabase/    # schema.sql (2 tabel generik + RLS per user)
├─ scripts/     # sync-version.mjs (sumber versi tunggal), check-prod.mjs (ship gate)
├─ manifest.json
├─ vendor/      # xlsx.full.min.js + inter-*.woff2 (lokal, CDN cuma fallback)
├─ icons/       # icon.svg + icon-192/512.png
├─ tests/       # vitest (152 tes): ledger/jurnal/penutupan/saldo awal, payroll (BPJS/THR/TER netto+NPWP/tarif guard), boot halaman Laporan + nesting DOM + drawer + changelog
├─ AUDIT_STATE.md # status loop audit (rubric F1–F9, backlog, open questions regulasi)
├─ package.json # type module, scripts: test (vitest run), dev
├─ README.md
├─ CHANGELOG.md
└─ VERSION
```

---

## 🔖 Version

Current: **1.20.2** — see `VERSION` + `CHANGELOG.md`. Displayed in sidebar footer & login screen (`__APP_VERSION`/`__htmlVersion` skew-check + SW cache ikut versi).

Test: `npm install` sekali, lalu `npm test` (vitest, 152 tes) atau `npm run check` (lint + test).
(PowerShell execution policy memblokir npm/npx — jalankan `node node_modules/vitest/vitest.mjs run`.)

Versioning: `MAJOR.MINOR.PATCH` — storage `version:1` in JSON backup.

---

## 📜 Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## 🗺️ Roadmap

**Selesai di v1.6.0 ✅ (Fase 1–3)**
- COA + double-entry, Jurnal/Buku Besar/Laba Rugi/Neraca, audit trail, modal awal
- Aging + WA, jatuh tempo, PPh Final 0.5% + reminder, PPN transaksi, invoice + cetak
- Stok (beli/jual/HPP/opname), multi-kas + transfer + rekonsiliasi, import mutasi bank, gaji + slip

**Selesai di v1.13.0–v1.20.x ✅**
- Laporan halaman penuh (16 tab, 3 grup) + drill-down + search + PDF/Excel/CSV pajak; panel pemilik (margin/runway/tren); mode kasir + PIN + Mode Sederhana + drawer; aset tetap & penyusutan (jurnal 5129/1519); pajak UMKM semester (PP 23/2018); PPh 23/4(2) vendor; saldo awal per akun; jurnal penyesuaian + penutupan; PPN configurable
- Bottom nav mobile (Beranda/Transaksi/＋/Laporan/Gaji/Lainnya), cetak + WA slip gaji (UU 13/2003)
- PPh 21 TER atas netto (PMK 168/2023) + NPWP + biaya jabatan cap + guard tarif; salin bulan lalu; bonus/denda/absensi payroll
- Dark-mode charts, notifikasi terpadu, ARIA + keyboard, self-heal split-brain cache, test nesting DOM (152 tes)

**Berikutnya (belum — butuh keputusan)**
- ~~Sync cloud multi-device~~ → **berjalan: Supabase local-first** (butuh URL + anon key dari pemilik; RLS per user; lihat § Sinkron Online)
- Role Akuntan & HRD (matriks izin; audit trail per-aktor)
- Rekonsiliasi PPh 21 Desember + Bukti Potong 1721-A1 + validasi UMP (butuh konfirmasi tarif resmi)
- e-Faktur/Coretax export; dashboard proyeksi omzet

**Selesai di v1.4.0 ✅**
- Backup otomatis (mirror IDB + pengingat + label) + validasi schema import JSON
- `Cara Bayar` di pelunasan + deskripsi pinjaman bahasa baru
- Recurring auto-post engine + kelola di Pengaturan
- Anggaran per kategori, saldo per dompet, kwitansi + PPN 11%
- `settingLang` mati dihapus; Bantuan/Changelog/Akun jadi modal beneran; hapus pakai Urungkan
- Modul `loanmath.js`/`charts.js`/`idb.js` + `features.css`; 55 tes vitest; vendor lokal + PWA

---

## 📄 License

MIT — free for UMKM.

---

## 🙏 Credits

Design inspirations: clean Wynara `Inter` + `Inter` + Tailwind-like tokens, 6-bulan area chart, Piutang white-blue card.
