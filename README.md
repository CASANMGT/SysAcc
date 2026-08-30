# SysAcc — Wynara Accounting System

> Clean, offline-first accounting for UMKM Indonesia — pemasukan, pengeluaran, piutang/hutang cicilan, laporan & kontak.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
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
- Tabel `TANGGAL / KATEGORI / DESKRIPSI / KONTAK / CARA BAYAR / JENIS / JUMLAH` — `↗ Masuk` green / `↘ Keluar` red, left border accent, `JUMLAH` `white-space:nowrap` no wrap
- Filter `Semua / Masuk / Keluar` chips above table, syncs with hidden `typeGroupFilter`
- Full page `Transaksi` view (`viewTransaksi:350`) with `KONTAK` column, search, `Semua Jenis/Kategori` + pagination (separate `transaksiPage`)
- `Masuk/Keluar` left border, `loan-row` yellow accent

**Tambah Transaksi (clean modal)**
- Hero `Rp` 48px centered, date pill, underline bar
- Jenis segmented `Pemasukan/Pengeluaran` sliding bg
- Kategori 3×4 grid cards with check
- Detail Piutang (when `Piutang/Hutang`): `Tipe Kontak` pill, `Ke siapa` search + chips + dropdown, `Tipe Pembayaran` `Sekali/Cicilan`, `Nominal Cicilan / Bulan ↔ Tenor / bulan` bidirectional auto-calc (`ceil(amt/tenor)`), `Cara Bayar` always visible (8 options: `Tunai`, `Credit Card`, `QRIS`, `Transfer`, `Debit`, `E-Wallet`, `Paylater Shopee`, `Lainnya`) + conditional detail (`Bank + 4 digit`, `QRIS BCA/Shopee`, `DANA/GoPay/OVO`, `Shopee/Tokopedia/TikTok Paylater`, `Bank Transfer`)
- Deskripsi + `Ulangi tiap bulan` recurring

**Cara Bayar Detail**
- `credit` → `Bank CC + 4 Digit`
- `debit` → `Bank Debit + 4 Digit`
- `qris` → `Penyedia QRIS` (BCA/BRI/Mandiri/BNI/Shopee/GoPay/DANA/OVO/LinkAja)
- `ewallet` → `E-Wallet` (DANA/GoPay/OVO/ShopeePay/LinkAja/GrabPay)
- `paylater` → `Platform` (Shopee/Tokopedia/TikTok/Kredivo/Akulaku/Indodana/Atome/Lazada)
- `transfer` → `Bank Transfer`

**Pinjaman (Piutang/Hutang)**
- Cicilan tenor `Math.ceil(amount/installment)` → `Tenor 12 bulan • Rp250k ×11 + Rp250k`, `Sisa 8 bulan • 4/12 cicilan`, `Cicilan 5/12` — no `Jatuh Tempo` date per request
- Progress bar, bayar/hapus, riwayat pembayaran, overdue badge (kept but date hidden)

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

Current: **1.2.0** — see `VERSION` + `CHANGELOG.md`. Displayed in sidebar footer & `Pengaturan`.

Versioning: `MAJOR.MINOR.PATCH` — storage `version:1` in JSON backup.

---

## 📜 Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

## 📄 License

MIT — free for UMKM.

---

## 🙏 Credits

Design inspirations: clean Wynara `Inter` + `Inter` + Tailwind-like tokens, 6-bulan area chart, Piutang white-blue card.
