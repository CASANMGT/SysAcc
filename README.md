# SysAcc — Wynara Accounting System

> Clean, offline-first accounting for UMKM Indonesia — pemasukan, pengeluaran, piutang/hutang cicilan, laporan & kontak.

![Version](https://img.shields.io/badge/version-1.14.2-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Stack](https://img.shields.io/badge/stack-Vanilla%20JS%20%2B%20LocalStorage-lightgrey)

Live: `http://localhost:3456` — login `admin / admin`

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
- Full page `Transaksi` view with `TEMAN` column, search, `Semua Jenis/Kategori` + pagination (separate `transaksiPage`)
- `Masuk/Keluar` left border, `loan-row` yellow accent
- Bulk select (checkbox), hapus terpilih, export Excel terpilih/tampilan, density `Padat/Nyaman`, kolom Cara Bayar on/off

**Tambah Transaksi (clean modal, bahasa anak 10 tahun)**
- Hero `Uang berapa?` 48px centered, date pill, underline bar + hint Rupiah otomatis
- Jenis `Uang masuk atau keluar?` segmented `Pemasukan/Pengeluaran` sliding bg + hint `Uang masuk ke kamu — saldo nambah` / `Uang keluar dari kamu — saldo berkurang`
- Kategori `Buat apa?` 3×4 grid cards with check + sublabel jelas (`Gajian kamu`, `Jajan & makan`…)
- Panel pinjaman (when `Kasih Pinjam/Pinjam Uang`): mode `📤 Baru / 📥 Balikin`, `Teman / Perusahaan?`, `Kasih pinjam ke siapa? / Pinjam dari siapa?` search + chips + dropdown, `Bayarnya gimana?` `Sekali Bayar 1x/Cicilan`, `Bayar berapa tiap bulan? ↔ Berapa bulan?` bidirectional auto-calc (`ceil(amt/tenor)`), picker pelunasan (`N teman belum balikin — ketuk untuk memilih`)
- `Bayar pakai apa?` always visible (8 options: `Tunai`, `Credit Card`, `QRIS`, `Transfer`, `Debit`, `E-Wallet`, `Paylater`, `Lainnya`) + conditional detail (`Bank kartu kreditnya apa? + 4 angka belakang`, `QRIS pakai apa?`, `E-Walletnya apa?`, `Paylater pakai apa?`, `Transfer ke bank apa?`, `Bank debitnya apa?`)
- Catatan (boleh kosong) + `🔁 Ulangi otomatis tiap bulan` recurring

**Cara Bayar Detail**
- `credit` → `Bank CC + 4 Digit`
- `debit` → `Bank Debit + 4 Digit`
- `qris` → `Penyedia QRIS` (BCA/BRI/Mandiri/BNI/Shopee/GoPay/DANA/OVO/LinkAja)
- `ewallet` → `E-Wallet` (DANA/GoPay/OVO/ShopeePay/LinkAja/GrabPay)
- `paylater` → `Platform` (Shopee/Tokopedia/TikTok/Kredivo/Akulaku/Indodana/Atome/Lazada)
- `transfer` → `Bank Transfer`

**Akuntansi (double-entry, SAK EMKM)**
- COA 20+ akun; tiap transaksi posting jurnal balance (kas/bank ↔ pendapatan/beban/piutang/hutang, split PPN, HPP/Opsname)
- Backfill otomatis untuk data lama; jurnal ikut backup; audit trail 500 aktivitas
- Modal Awal di Pengaturan → Neraca balance (Aset = Kewajiban + Modal + Laba)

**Usaha kecil**
- Stok: beli/jual dari form transaksi (rata-rata modal, cegah oversell), opname, alert menipis; **Beli ke supplier** (hutang usaha, bayar bertahap, jatuh tempo)
- Neraca komparatif (awal vs kini + selisih) melengkapi L/R komparatif
- Kas: transfer antar dompet, rekonsiliasi fisik, saldo dompet dari jurnal
- Import mutasi bank CSV (match ±3 hari), invoice `INV/…` + cetak, PPh Final 0.5% + reminder tgl 15, aging piutang + tagih via WA
- Gaji UU: halaman Karyawan & Gaji (Data tab + edit panel 3 sub-tab, Proses tab per-periode + draft/final + **salin bulan lalu** + bonus/denda + **⚙️ tarif iuran editable** — JKK/JKM/JHT/JP/Kes perusahaan & karyawan, Laporan tab), **PPh 21 TER atas netto (PMK 168/2023)** + biaya jabatan cap Rp500rb + **NPWP (tanpa NPWP +20%)**, BPJS/THR otomatis, slip rinci; karyawan: email, bank, L/P, lahir, HP, alamat, mulai kerja, kontrak, PTKP
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
- Laporan 10 tabs: Bulanan/Per Kategori/Arus Kas/Top Pengeluaran/**Jurnal/Buku Besar/Laba Rugi/Neraca/Pajak/Audit**
- Import/Export: `Excel (.xlsx)` 4 sheets, `CSV`, `JSON` backup (validasi schema, baris rusak dilewati, dedup), `JSON/CSV` import
- Backup `wynara-backup-YYYY-MM-DD.json` + restore + **cadangan otomatis IndexedDB** (pulih saat boot) + pengingat backup >30 hari
- Anggaran bulanan + **anggaran per kategori** + **saldo per dompet** + recurring auto-post + kategori custom delete
- **Kwitansi** 🧾 per transaksi (terbilang + PPN 11% + cetak), **Urungkan hapus** 6 detik
- PWA installable (offline), Bantuan + Changelog modal, 137 tes vitest
- Sidebar `Ringkasan ↔ Transaksi` views (`showView:176`), topbar search sync, theme `dark-mode` (toggle in Pengaturan; **chart ikut gelap** via CSS vars `--chart-*`)
- **Notifikasi terpadu** (badge 🔔: pinjaman + stok + hutang supplier + PPh) dengan tombol **Buka →** menuju bagian terkait
- **ARIA penuh**: semua tombol ikon + 17 tombol tutup modal punya `aria-label`; rincian gaji `aria-expanded`
- Toast (`success/error/warning/info`), focus trap, keyboard `Ctrl+N` / `/` / `Esc` / `?`
- Print, pagination `prev/next/loadMore`, empty filtered state

---

## 🛠️ Stack

- Vanilla HTML/CSS/JS (ES modules) — no build
- `localStorage` keys: `ledger_entries`, `ledger_loans`, `ledger_repayments`, `ledger_people`, `wynara_budget`, `wynara_recurring`
- `xlsx@0.18.5` CDN for Excel
- `Inter` font, design tokens (`--space`, `--radius`, `--shadow`, `--font-mono`)

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
├─ index.html   # login two-column + sidebar + dashboard + transaksi view + 10 dialogs
├─ style.css    # tokens + login + sidebar/topbar + metric/donut/chart + tx modal + table
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
├─ sw.js        # service worker (cache-first app shell)
├─ manifest.json
├─ vendor/      # xlsx.full.min.js + inter-*.woff2 (lokal, CDN cuma fallback)
├─ icons/       # icon.svg + icon-192/512.png
├─ tests/       # vitest: + payroll (BPJS/THR/TER netto+NPWP), parse desimal (137 tes)
├─ package.json # type module, scripts: test (vitest run), dev
├─ README.md
├─ CHANGELOG.md
└─ VERSION
```

---

## 🔖 Version

Current: **1.12.0** — see `VERSION` + `CHANGELOG.md`. Displayed in sidebar footer & `Pengaturan`.

Test: `npm install` sekali, lalu `npm test` (vitest, 137 tes) atau `npm run check` (lint + test).
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

**Selesai di v1.13.0 ✅**
- Laporan halaman penuh + cetak/PDF, panel pemilik (margin/runway/tren), mode kasir + PIN, aset tetap & penyusutan (jurnal 5129/1519), pajak UMKM semester (PP 23/2018), bahasa lebih awam
- Bottom nav mobile (Beranda/Transaksi/＋/Laporan/Gaji), cetak slip gaji per karyawan (UU 13/2003)
- PPh 21 TER atas netto (PMK 168/2023) + NPWP + biaya jabatan cap; salin bulan lalu; bonus/denda payroll
- Dark-mode charts (CSS vars), notifikasi terpadu + lompat ke bagian terkait, ARIA icon buttons

**Berikutnya (Fase 5, belum)**
- Sync cloud multi-device (butuh backend + kunci API — Supabase/Firebase)
- Multi-user sanggup lanjut: audit per-user + izin halus per modul
- Dashboard pemilik lanjut: proyeksi omzet, banding tahun
- e-Bupot > laporan pajak masuk dalam 1.13.0 ✅

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
