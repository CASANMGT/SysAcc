# SysAcc — Wynara Accounting System

> Clean, offline-first accounting for UMKM Indonesia — pemasukan, pengeluaran, piutang/hutang cicilan, laporan & kontak.

![Version](https://img.shields.io/badge/version-1.3.1-blue)
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

**Pinjaman (Kasih Pinjam / Pinjam Uang)**
- 4 alur: `Kasih pinjam 📤` (uang keluar) / `Dibalikin 📥` (terima) vs `Pinjam uang 📥` (uang masuk) / `Balikin 📤` (bayar) via mode toggle + picker sisa
- Cicilan tenor `Math.ceil(amount/installment)` → `Lama: 12 bulan`, `Sisa 8 bulan • 4/12 kali`, `Bayar ke-5/12` — jadwal turunan dari tanggal mulai + progress cicilan
- `Lihat jadwal ▾` per cicilan 1..N + tombol `Bayar/Terima N/M` one-click + modal bayar ringkasan (`Total uang / Sudah dibayar / Sisa` + progress) + chip `1x..Nx` + `Bayar semua`
- Kartu: `Sudah`, `Sisa`, `Belum lunas/Lunas`, `Bayaran berikutnya/Harus dibayar`, badge `Telat N hari`, progress bar, bayar/hapus, riwayat pembayaran
- Tab `Semua (n) / 🟢 Kasih Pinjam (n) / 🔴 Pinjam Uang (n)` + `Sembunyikan lunas` (persisted) + legenda alur uang
- Dashboard kartu ganda + `Surplus/Defisit`, pengingat dinamis (badge bell + kartu overdue)

**Lainnya**
- Kontak (orang/perusahaan) with cascade rename, search
- Laporan 4 tabs: Bulanan/Per Kategori/Arus Kas/Top Pengeluaran
- Import/Export: `Excel (.xlsx)` 4 sheets, `CSV`, `JSON` backup (`exportJSON:72` + dedup), `JSON/CSV` import
- Backup `wynara-backup-YYYY-MM-DD.json` + restore
- Anggaran bulanan + recurring + kategori custom delete
- Sidebar `Ringkasan ↔ Transaksi` views (`showView:176`), topbar search sync, theme `dark-mode` (toggle in Pengaturan)
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
├─ index.html   # login two-column + sidebar + dashboard + transaksi view + 7 dialogs
├─ style.css    # tokens + login + sidebar/topbar + metric/donut/chart + tx modal + table
├─ app.js       # state, filters, sort, search, pagination, budget, overdue, view switching
├─ ui.js        # renderEntries (7 cols), category cards, tx modal bidirectional, payment detail, focus trap
├─ storage.js   # entries/loans/repayments/people/budget/recurring + import/export + dedup + cascade
├─ reports.js   # filterEntries, computeTotals, computeRunningBalance (chronological), monthly/cashflow, loanSummary
├─ README.md
├─ CHANGELOG.md
└─ VERSION
```

---

## 🔖 Version

Current: **1.3.1** — see `VERSION` + `CHANGELOG.md`. Displayed in sidebar footer & `Pengaturan`.

Versioning: `MAJOR.MINOR.PATCH` — storage `version:1` in JSON backup.

---

## 📜 Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## 🗺️ Roadmap (next version)

Hasil audit v1.3.1 — diurut dari yang paling berdampak:

**P0 — Data tidak boleh hilang**
- Backup otomatis (pengingat / unduh terjadwal) + validasi schema saat import JSON (file rusak = toast jelas, bukan crash)
- Rencana migrasi `localStorage` (limit ~5MB) → `IndexedDB`, lalu sync cloud opsional (Supabase/Firebase) untuk multi-device

**P0 — Kebenaran uang**
- Pilihan `Cara Bayar` di modal bayar/terima cicilan — sekarang pelunasan selalu tercatat `cash`
- Samakan deskripsi otomatis pinjaman (`Kasih pinjam →`, `Dibalikin:`…) dengan bahasa baru

**P1 — Fitur UMKM**
- Recurring beneran: auto-post tiap bulan (sekarang cuma flag + toast pengingat, tidak ada engine)
- Anggaran per kategori (sekarang cuma 1 limit global), saldo per dompet (`Tunai`, `BCA`, `DANA`…), cetak kwitansi/invoice + export PDF, hitung PPN

**P1 — Selesaikan yang mati**
- `settingLang` disimpan tapi tidak dipakai (tanpa i18n) — hapus atau implementasi beneran
- `topbarAccount` (toast demo), `sidebar-help-btn` (toast), `changelogLink` (buka tab kosong) — hubungkan atau buang
- Tombol hapus pakai `confirm()` tanpa undo — ganti toast Undo 5 detik

**P2 — Kesehatan kode**
- Pecah monolit: `ui.js` (~2000 baris), `style.css` (~3300 baris), `app.js` (~1600 baris) → modul `loans.js`, `repay.js`, `charts.js`, `settings.js` + CSS per fitur; tambah `eslint` + `vitest` untuk `validateForm`, `computeTotals`, matematika tenor
- Ganti CDN `xlsx` + font `Inter` dengan vendor lokal — CDN mati = app offline-first ikut mati

**P2 — Mobile & akses**
- `manifest.json` + service worker (PWA installable), bottom-nav mobile, warna chart dark-mode, audit `aria` dialog, test layar 360px

---

## 📄 License

MIT — free for UMKM.

---

## 🙏 Credits

Design inspirations: clean Wynara `Inter` + `Inter` + Tailwind-like tokens, 6-bulan area chart, Piutang white-blue card.
