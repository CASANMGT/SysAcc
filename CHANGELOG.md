# Changelog

All notable changes to **SysAcc — Wynara Accounting** will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.1] - 2026-09-08

### Changed
- **Bahasa anak 10 tahun di seluruh app** — modal Tambah Transaksi (`Uang berapa?`, `Uang masuk atau keluar?`, `Buat apa?`), hint `Uang masuk ke kamu — saldo nambah` / `Uang keluar dari kamu — saldo berkurang`, sublabel kategori spesifik (`Gajian kamu`, `Jajan & makan`…), panel pinjaman (`Kasih pinjam ke siapa?`, `Pinjam dari siapa?`, `Bayarnya gimana?`), modal bayar (`Berapa uang?`, `Tanggal berapa?`, `Bayar semua`), kartu pinjaman (`Sudah`, `Belum lunas`, `Bayaran berikutnya`, `Telat N hari`), validasi ramah (`Tanggalnya diisi dulu ya`, `Ketik dulu nama temanmu`, `Kebanyakan! Sisa cuma …`), header tabel (`CATATAN`, `BAYAR PAKAI`, `MASUK/KELUAR`, `UANG`)
- **Ringkasan bayar** — `Total uang` / `Sudah dibayar` / `Sisa`, jadwal `Ke-N/M` + badge `Sudah` / `Sekarang` / `Belum`

### Fixed
- Tag `<label>` tak tertutup di modal bayar (`index.html` `repayAmount`)

---

## [1.3.0] - 2026-09-08

### Added
- **Pinjaman/Hutangan split flows** — `Pinjamin` (keluar) / `Balikin Pinjaman` (terima cicilan) dan `Hutang` (masuk) / `Balikin Hutang` (bayar cicilan) via mode toggle + picker sisa (`index.html:506` `ui.js:755` `app.js:513`)
- **Cicilan schedule per loan** — `Jadwal ▾` 1..N + `Bayar cicilan k/N` one-click + repay modal ringkasan (total/sudah/sisa) + chip 1x..Nx + `Lunasi` (`ui.js:1341`)
- **Bulk actions + export tampilan** — checkbox baris, hapus terpilih, export Excel terpilih/tampilan (`storage.js:180` `app.js:547`)
- **Arus Kas controls** — range 3/6/12, toggle Masuk/Keluar, tooltip + sumbu-y (`app.js:731`)
- **Pengingat dinamis** — badge bell dari jadwal turunan + kartu overdue (`app.js:868` `ui.js:1617`)
- **Boot watchdog** — pesanDiagnostik di login jika modul gagal (`index.html:919`)

### Changed
- **Tabel Transaksi** — kolom JUMLAH nowrap Rp, filter `Masuk/Keluar`, density Padat/Nyaman, sembunyikan Cara Bayar, paginasi 20
- **Dashboard** — kartu Pinjaman+Hutangan dua baris + Surplus/Defisit; tab Pinjaman ada hitungan; toggle sembunyikan lunas
- **Login** — trim + case-insensitive, guard storage, link mati jadi toast

### Fixed
- `SyntaxError: return not in function` di `validateForm` (`ui.js:1144`) — modul mati total, login ikut mati
- `exportCSV` `esc(0)`, saldo kronologis,BYTE/BLoB revoke, print ikut filter+sort

---

## [1.2.0] - 2026-08-30

### Added
- **Cara Bayar detail inputs** — `credit` → `Bank + 4 Digit Terakhir`, `qris` → `Penyedia QRIS` (BCA/BRI/Mandiri/BNI/Shopee/GoPay/DANA/OVO/LinkAja), `ewallet` → `DANA/GoPay/OVO/ShopeePay/LinkAja/GrabPay`, `paylater` → `Shopee/Tokopedia/TikTok/Kredivo/Akulaku/Indodana/Atome/Lazada`, `transfer` → `Bank Transfer` (`index.html:497` `ui.js:750` `storage.js:47`)
- **Bidirectional Piutang cicilan** — `Nominal Cicilan / Bulan ↔ Tenor / bulan` auto-sync (`ceil(amt/tenor)`) in `Detail Piutang` (`index.html:475` `ui.js:338`), no `Jatuh Tempo` date per request, blue hint `Tenor 12 bulan • Rp250k ×11 + ...`
- **Paylater Shopee** payment option (`reports.js:340` `index.html:500` `style.css:1867` `#ee4d2d`)
- **`Masuk/Keluar` filter** above `Transaksi Terbaru` (`txTypeFilter:300` `app.js:242` chips `Semua/↗ Masuk/↘ Keluar` syncs hidden `typeGroupFilter`)
- **Full `Transaksi` view** (`viewTransaksi:350` in `index.html:350`) — separate page with `KONTAK` column, `Cari` + `Semua Jenis/Kategori`, pagination (`transaksiPage`), subtitle `Transaksi • Total saldo` (`app.js:440` `renderFullTransaksi:480`)
- **Budget card** (`budgetCard:200` + `renderBudget:600` progress `over` red)
- **Recurring** checkbox `Ulangi tiap bulan` (`entryRecurring:498` → `Storage.saveRecurring`)
- **Settings modal** (`settingsModal:580`) — anggaran, bahasa, notif, `JSON Backup/Restore`, custom category delete
- **Import/Export** `JSON` + `CSV` (dedup, `Detail Bayar` col) (`storage.js:72` `exportJSON` `importJSONFile` `importCSVFile`)

### Changed
- **Transaction table** not too wide — `min-width 680` `table-layout:fixed` `col 110/130/200/110/90/130/48` `td 10px nowrap ellipsis` `tr 48px` `loan-row` left-border yellow, `tr-income/tr-expense` green/red (`style.css:3410` `ui.js:166`)
- **Arus Kas** 6-bulan window — fills missing months with `0`, `yMax*1.15`, centered dots, `monthNames` (`app.js:632`)
- **Piutang card** `Tenor X bulan` + `Sisa Y bulan • A/B cicilan` + `Cicilan N/M` without `Jatuh Tempo` date (`ui.js:1236`)
- **Cara Bayar** always visible even for `Piutang/Hutang` (`handleCategoryChange:653` `hidden=false`)

### Fixed
- `exportCSV` `esc(0)` → `"0"` (`storage.js:185`)
- `computeRunningBalance` chronological sort + `Math.max(0, outstanding)` (`reports.js:65` `296`)
- `balance` sort disabled (misleading) (`handleSort:386`)
- `print` respects search + sort (`handlePrint:692`)
- `initSearch` leak guard (`searchBound:15`), `initIdrInputs` `dataset.idrBound` guard, modal `open` guard + `trapFocus`/`releaseFocus` (`ui.js:314` `462`)
- `importExcel` missing `Pembayaran`/`Kontak` sheets, dedup, `paylater` type
- `payment` forced `cash` for loans removed — now respects selected value (`ui.js:825`)

---

## [1.1.0] - 2026-08-29

### Added
- Clean transaction modal — hero `Rp` 48px, date pill, segmented `Pemasukan/Pengeluaran`, 3×4 category cards, `Detail Piutang` white-blue card, `Cara Bayar` grid, `Deskripsi` + recurring, `Simpan` dark pill (`index.html:364` `style.css:2930` `ui.js:338`)
- Dashboard redesign — two-column login (gradient left), sidebar `280px` + topbar, 4 metric cards, `Arus Kas` area + `Pengeluaran` donut, `Aksi Cepat` 4 cards (`index.html:14` `style.css:2930`)
- `Masuk/Keluar` left-border row accent + `↗/↘` badge (`ui.js:183`)

### Changed
- `Inter` font, design tokens (`--space`, `--radius`, `--shadow`), `dark-mode` overrides for new UI
- `viewRingkasan` / `viewTransaksi` switching (`showView:176`)

---

## [1.0.0] - 2026-08-28

### Added
- Initial release — `admin/admin` login, `localStorage` ledger (`ledger_entries`, `ledger_loans`, `ledger_repayments`, `ledger_people`)
- CRUD transaksi, `Piutang/Hutang` with `lunas/cicilan`, `Kontak` orang/perusahaan, 4 laporan (Bulanan/Per Kategori/Arus Kas/Top Pengeluaran)
- Filter pills `Periode/Jenis/Kategori`, search, sort, pagination, `Excel/CSV` export, `Excel` import, print, theme, toast, keyboard `Ctrl+N`/`/`/`Esc`

---

[1.3.1]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.3.1
[1.2.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.2.0
[1.1.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.1.0
[1.0.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.0.0
