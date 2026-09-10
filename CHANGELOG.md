# Changelog

All notable changes to **SysAcc — Wynara Accounting** will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.16.1] - 2026-09-09

### Iterasi audit 5 — saldo awal (pindah pembukuan → Wynara)
- **⚖️ Saldo awal per akun** — Pengaturan → Modal Awal → tombol baru: isi debit/kredit tiap akun (draft tersimpan), **live cek seimbang**, selisih otomatis masuk `3101 Modal`
- Posting **reversible**: posting ulang mengganti jurnal saldo awal lama (hapus ref lama → pasang baru) + audit trail
- `buildOpeningJournal` (murni, test baru) + draft tersimpan; pindah dari pembukuan lain tak perlu masuk ulang semuanya

---

## [1.16.0] - 2026-09-09

### Iterasi audit 4 — pajak bayaran vendor (akuntan)
- **PPh 23 & PPh 4(2) di pembayaran supplier** — modal Bayar Supplier kini punya pilihan: PPh 23 (jasa 2%) / PPh 4(2) (sewa tanah-bangunan 10%); estimasi live "PPh dipotong RpX • kas keluar RpY"
- Jurnal yang benar secara akuntansi: **Dr Hutang (penuh) · Cr Kas (netto) · Cr 2107 PPh Dipotong** — biaya tetap ada di Laba Rugi, pajak jadi liabilities sampai disetor
- Estimasi `supplierPayWithholdInfo` live saat ketik nominal; pilihan ter-reset tiap buka modal
- Lock periodik juga berjalan di pembayaran (F1 check): test baru 2 test + `2107` di Neraca & Neraca Saldo

---

## [1.15.3] - 2026-09-09

### Iterasi audit 3 — kecukupan data & keterbacaan
- **💾 Indikator cadangan di topbar** — dot berstatus otomatis: ⚪ belum pernah, 💾 (≤7 hari), 🔴 + situasi bila >7 hari; timestamp tiap tulis (IDB mirror)
- **⌨️ Focus ring universal** (`:focus-visible` biru 2px) + `aria-pressed` pada toggle sandi — jalur keyboard hidup
- **Nama seragam "Kontak"** — sebelumnya TEMAN di tabel, "Teman" di kwitansi & panel piutang; Pinjemin tetap santai nama pertanyaannya tapi entitas sekarang konsisten

---

## [1.15.2] - 2026-09-09

### Iterasi audit 2 — kurangi beban kognitif
- **Modal transaksi: "Detail lainnya ▾"** — Barang + PPN + Catatan + Ulangi (jarang dipakai) dikolaps jadi 1 section; buka otomatis saat pilih kategorinya barang. Modal jadi pendek & fokus: nominal → jenis → kategori → bayar. *Bayar pakai apa? tetap terlihat (jalur uang utama) — full 3-field wajib dimodifikasi agar T1 (4 tap) tidak rusak*
- **Tab laporan digroup 3 bagian** di halaman Laporan: 🔍 IKHTISAR (Bulanan, Per Kategori, Arus Kas, Top, Produk) · 📑 LAPORAN RESMI (L/R, Neraca, Neraca Saldo, Jurnal, Buku Besar) · ✅ KEPATUHAN (Pajak, PPN, PPh 21, Gaji, Audit) — akuntan & HR langsung tahu ke mana melihat
- `AUDIT_STATE.md`: F6 70→78, F7 68→74, F8 80 tetap; overall 73→75

---

## [1.15.1] - 2026-09-09

### Iterasi audit 1 — keamanan tampilan, mobile, tax config
- **Kredensial default kini kontekstual** — hint `admin/admin` di layar login hanya muncul selagi sandi masih default; hilang otomatis setelah diganti (PDP hygiene)
- **Bottom nav "+ Lainnya"** — akses Kontak, Pinjemin, Stok, Kas & Pengaturan dari HP (sebelumnya tak terjangkau)
- **Tarif PPN configurable** (hingga kini hardcode 11%) — Pengaturan → Tarif PPN; dipakai transaksi, 🧾 Jual (DPP/PPN live), kwitansi & Laporan PPN; lulus fitting audit "never hardcode tax rate"
- `AUDIT_STATE.md` ditambahkan: baseline rubric + backlog audit + open questions regulasi

---

## [1.15.0] - 2026-09-09

### Added — Laporan level akuntan senior Indonesia
- **📒 Neraca Saldo** (tab baru, modal + halaman) — saldo debit/kredit per akun terkelompok per jenis, **total & cek "✓ Seimbang / ⚠ Selisih"**, deteksi **jurnal pincang** (findUnbalanced), indikator periode terkunci — alat kerja utama sebelum tutup buku
- **🧾 Laporan PPN (gaya 1111)** (tab baru) — per bulan: Penjualan DPP + PPN Keluaran (2105) vs Pembelian DPP + PPN Masukan (1401) + **kurang/lebih bayar**, total + catatan PKP — siap SPT Masa PPN
- **💼 Rekap PPh 21 (e-SPT 21)** (tab baru) — PPh 21 terpotong & THP per bulan dari payroll final
- **⬇️ Excel** — tombol unduh laporan aktif (tab apa pun) ke `.xlsx` via library XLSX
- Catatan: laporan PPh Final 0,5%/UMKM (PP 23/2018) & jurnal penutupan sudah ada — kini paket pajak & audit lengkap: Neraca Saldo → Penutupan → Neraca & Laba Rugi → pajak

---

## [1.14.2] - 2026-09-09

### Improved — Modal Jual & Beli (pola sama dgn input barang)
- **🧾 Jual**: header kolom (Barang · Qty · Harga/pcs · Subtotal), ringkasan live "Masuk kas + DPP + PPN 11%" & **estimasi untung** 📈/📉 dari modal rata-rata; PPN toggle kini langsung hitung ulang; total menampilkan jumlah barang
- **📥 Beli**: header kolom, ringkasan live "Stok bertambah N pcs • nilai persediaan +RpX" + catatan jadi hutang usaha
- (Catatan: modal Gaji lama ternyata tak dipakai — halaman Gaji modern sudah menggantikannya, jadi fokus di Jual/Beli yang aktif)

---

## [1.14.1] - 2026-09-09

### Improved — Form Input Barang (UX)
- Nama barang full-width di atas, grid Harga jual/modal/kode/qty rapi 2–3 kolom (dulu 6 field berdesakan satu baris)
- Tombol **Batal & Simpan** dipindah ke footer terpisah (dulu nyempil di antara field)
- **Live untung per pcs** 📈/📉 + margin % — merah + peringatan kalau harga di bawah modal, ter-update saat mengetik
- Label & ikon lebih jelas: "Harga jual / pcs", "Modal / pcs", "Punya berapa?", "Ingatkan kalau sisa", "Kode (opsional)"; placeholder uang rapi

---

## [1.14.0] - 2026-09-09

### Added — Akuntan, pemilik & HR
- **🔒 Jurnal penutupan bulan** — tombol di Laporan: pendapatan & beban periode → **Laba Ditahan** (`3102`, akun baru); idempoten per bulan, cek balance, tolak bila bulan terkunci. Neraca kini mencakup saldo semua akun modal
- **📤 Kirim backup via WA/Email** — Pengaturan → Backup: share file backup langsung dari HP (Web Share API); desktop fallback unduh + instruksi
- **🧾 Laporan Produk** (tab baru, modal + halaman) — qty terjual, omzet, bagian %, utung perkiraan per produk dari entri penjualan
- **📊 Tax siap e-Bupot** — tombol "⬇️ Unduh CSV untuk DJP" di laporan pajak (bulan, omzet, PPh 0,5%, PPN)
- **🕐 Absensi HR** — kolom "Hadir (hari)" per karyawan di proses gaji; <22 hari → saran denda otomatis (n × Rp100rb, tetap bisa diedit), tersimpan di draft & snapshot

---

## [1.13.2] - 2026-09-09

### Added — Untuk akuntan
- **＋ Jurnal penyesuaian manual** — tombol di halaman Laporan: akun debit/kredit bebas (termasuk akun custom), cek balance live dengan pesan "pincang" + nominal, posting idempoten ke Jurnal & audit trail — kebutuhan utama akuntan yang sebelumnya hilang (buildAdjustJournal cuma dipakai opname/rekon)

---

## [1.13.1] - 2026-09-09

### Fixed — Guard tarif salah ketik (JKK 300× lipat)
- Kasus nyata: JKK terisi `54` (artinya 54%) → potongan `0,54% × 7,5jt` jadi **Rp4.050.000** padahal harusnya **Rp40.500**. Sekarang tarif di atas batas legal otomatis di-setel balik ke standar BPJS
- Panel ⚙️ Tarif menolak simpan di atas batas risiko (JKK maks 1,74%, JKM maks 1%, dst) + pesan "ketik angka persen seperti 0,54, bukan 54"
- **Live hint** saat mengetik: `= Rp5.400 per Rp1jt` (merah + ⚠ kalau lewat batas)

---

## [1.13.0] - 2026-09-09

### Added — Laporan beranda penuh (Fase 4: A–G)
- **📄 Laporan = halaman penuh** (dulu cuma modal): sidebar & bottom-nav kini buka halaman `Laporan` dengan 11 tab standar, rapikan filter; modal masih tersedia
- **🖨️ Cetak / Simpan PDF** — tombol di header halaman laporan; dialog print menyediakan "Save as PDF" (semua laporan)
- **👩‍💼 Panel Khusus Pemilik** (dashboard): laba bulan berjalan, margin kotor (omzet−HPP), kas & rekening, **runway kas** (kas ÷ biaya rata-rata 3 bulan), sparkline laba 6 bulan + catatan tren naik/turun
- **🧑‍💼 Mode Kasir + PIN** — login username `kasir` + PIN (default 1234, bisa ganti/mati di Pengaturan → Keamanan; hash lokal). Kasir hanya bisa: beranda + catat transaksi; laporan/gaji/kontak/pinjemin/stok/pengaturan & tombol hapus disembunyikan via CSS
- **🏦 Aset tetap & penyusutan** — daftar aset (harga, tanggal beli, umur bulan), penyusutan garis lurus, akumulasi & nilai buku otomatis; posting jurnal bulanan idempoten (Dr `5129` Beban Penyusutan / Cr `1519` Akumulasi Penyusutan); akun baru `1510 Aset Tetap`, `1519`, `5129`
- **🧾 Pajak UMKM (PP 23/2018)** — kartu semester (Jan–Jun & Jul–Des): omzet × 0,5%, jatuh tempo tgl 15 bulan berikutnya, status bayar; langsung titipan ke e-Bupot
- **Bahasa lebih awam** — tab gaji: `Karyawan / Hitung & Bayar / Riwayat Gaji`; "Daftar Akun (COA)" → "Daftar Akun"

### Tests
- 139/139 tetap hijau

---

## [1.12.1] - 2026-09-09

### Added — Mobile & slip
- **Bottom nav mobile** — bar navigasi bawah di layar ≤768px: Beranda / Transaksi / tombol ＋ besar (langsung ke form catat) / Laporan / Gaji; tombol aktif ikut view; area aman iPhone (safe-area) + dukungan dark mode
- **🖨️ Cetak slip gaji per karyawan** — di rincian expandable; slip A4 siap print (identitas karyawan, PTKP/NPWP, masa kerja, tabel pendapatan–potongan–THP besar, iuran perusahaan dengan tarif asli, kolom tanda tangan) — kewajiban slip pemberi kerja (UU 13/2003 Ps. 93)

---

## [1.12.0] - 2026-09-09

### Fixed — PPh 21 sesuai PMK 168/2023 (perbaikan legal)
- **Tarif TER kini dihitung atas NETTO**, bukan bruto: netto = bruto − biaya jabatan (5%, maks Rp500.000) − iuran JHT 2% − iuran JP 1% — slip lama menghitung pajak lebih tinggi
- **No. NPWP** per karyawan (field baru + kolom impor Excel): tanpa NPWP otomatis kena **surcharge +20%** sesuai UU; slip menampilkan status NPWP
- Rincian PPh di slip sekarang transparan: `TER TK/0 × netto Rp… (tanpa NPWP +20%)`
- Bonus masuk dasar BPJS & PPh; denda hanya memotong take-home (tidak mengurangi dasar pajak) — dijelaskan di UI

### Added — Payroll
- **⚙️ Tarif iuran editable** — panel baru di Proses Gaji: semua tarif bisa diubah per bulan (dibayar perusahaan: BPJS Kes 4%, JHT 3,7%, JP 2%, **JKK kecelakaan kerja 0,54%** [range risiko 0,24–1,74%], JKM 0,3%; dipotong karyawan: Kes 1%, JHT 2%, JP 1%). Tarif tersimpan di draft, ikut salin bulan lalu, terkunci saat Final
- **📋 Salin bulan lalu**: copy lembur/bonus/potongan/pengaturan dari bulan sebelumnya ke draft bulan ini
- **Bonus & Denda/absensi** per karyawan (input di rincian expandable), ikut draft, snapshot & deskripsi transaksi final
- Legenda THR & PPh di bawah tabel proses (masa kerja n/12; TER atas netto)

### Improved — UI/UX
- **Mode gelap kini benar-benar gelap**: gridline/axis/titik/area chart pakai CSS variables (`--chart-*`) dengan override dark — dulu garis grid & area hilang di dark mode; donut & label ikut
- **Notifikasi terpadu**: badge 🔔 menghitung pinjaman jatuh tempo + stok menipis + hutang supplier lewat tempo + PPh Final belum dibayar; klik bell → daftar + tombol **Buka →** melompat langsung ke Pinjeman/Stok/Laporan Pajak
- Header tabel proses gaji dijelaskan (Tambahan = tunjangan+lembur+bonus+THR; Potongan = BPJS+PPh+denda; Gaji bersih = THP) + tooltip
- Subjudul "Proses gaji" pakai bahasa awam
- **ARIA**: 17 tombol tutup modal + semua tombol ikon dinamis (stok, karyawan, supplier, kontak) kini punya `aria-label` bernama; rincian karyawan pakai `aria-expanded`

### Tests
- 139 tests pass — PPh diuji: netto formula, cap biaya jabatan, surcharge tanpa NPWP, bonus masuk dasar, denda tidak mengurangi dasar; tarif override (JKK risiko tinggi, iuran karyawan 2%, tarif invalid → default)

---

## [1.11.0] - 2026-09-09

### Added — Login & merek
- **Logo W sendiri** (SVG + PNG, dipakai login, sidebar, favicon, PWA) menggantikan emoji 🏦 yang generik
- **Login sesuai desain**: headline + trio fitur, tanpa tombol Google, link Bantuan berfungsi, teks jujur
- **Kata sandi beneran**: hash SHA-256 lokal (migrasi otomatis dari default), Ingat saya (tetap masuk), Lupa kata sandi (reset ke default), Ganti kata sandi di Pengaturan → Keamanan

---

## [1.10.0] - 2026-09-09

### Added — Halaman Karyawan & Gaji (sesuai desain)
- **Tab Data Karyawan**: tabel (avatar, jabatan, status kerja, aktif, gaji pokok) + cari + panel edit samping dengan sub-tab Data utama / Gaji & rekening / Pajak & BPJS; field baru email + bank + no. rekening
- **Tab Proses Gaji**: pilih periode (bulan apa pun, mundur/maju), kartu ringkasan (dipilih, pokok, status Draft/Final), stepper 3 langkah, tabel centang + rincian expandable (lembur/THR/PPh editable, THP live), total footer + catatan kesiapan, Simpan draft (tersimpan per bulan) & Finalisasi (catat + tandai final, hormati kunci periode)
- **Tab Laporan Gaji**: laporan bulanan/tahunan + cetak, tertanam di halaman
- Sidebar kini buka halaman (modal lama pensiun)

---

## [1.9.0] - 2026-09-09

### Added — Tutup loop inventori + paket investor
- **Beli ke supplier** — modal multi-baris (supplier, jatuh tempo, modal/pcs): stok masuk + jurnal Persediaan/Hutang Usaha; bayar bertahap (cicil hutang) + hapus kembalikan stok (ditolak bila sudah terjual); ikut backup/restore
- **Neraca komparatif** — kolom saldo awal + ± per akun dan total (siap untuk investor & akuntan)

---

## [1.8.0] - 2026-09-09

### Added — Akun & penjualan terpadu
- **Kelola COA** — tambah/ganti-nama/hapus akun custom (proteksi hapus bila bermutasi); Laba Rugi & Neraca ikut akun custom otomatis (sebelumnya hardcode — Hutang BPJS tak masuk Neraca!)
- **Jual dari stok** — modal 🧾 Jual: multi-baris barang + qty + harga (auto), pelanggan, PPN, diskon via catatan; 1 entry + HPP per baris + stok berkurang + struk; kategori baru Jualan
- **Laporan Gaji** — tab Bulanan/Tahunan: bruto, THR, potongan, PPh 21, iuran perusahaan, THP + hutang BPJS; tombol cetak
- **Cetak semua laporan** — tombol 🖨️ di Laporan (kop Wynara + tanggal cetak)
- **Kunci periode** — kunci/buka bulan di Pengaturan; form, cicilan, gaji, mutasi, transfer & edit menolak bulan terkunci; ikut backup
- **Laba Rugi komparatif + anggaran** — kolom periode lalu & ±, plus tabel Anggaran vs Realisasi bulanan

---

## [1.7.0] - 2026-09-09

### Added — Gaji sesuai UU Ketenagakerjaan
- **BPJS otomatis**: Kesehatan 4%/1% (plafon 12jt), JHT 3.7%/2%, JP 2%/1% (plafon), JKK (default 0.54%) + JKM 0.3% — bisa off per karyawan
- **THR proporsional** (Permenaker 6/2016): ≥12 bln penuh, kurang dari itu n/12, dari masa kerja tanggal mulai kerja
- **PPh 21 TER bulanan** (PMK 168/2023): kategori A/B/C dari status PTKP, tabel tarif penuh
- **Tabel proses gaji**: centang + lembur + THR + PPh per baris, THP live; bayar = THP; iuran perusahaan dijurnal (Beban + Hutang BPJS)
- **Data karyawan lengkap**: L/P, tgl lahir, HP, alamat, mulai kerja, tetap/kontrak/harian, PTKP, flag BPJS — form lipat “opsional”
- **Slip gaji rinci**: pokok, tunjangan, lembur, THR, tiap potongan, THP + tombol cetak

### Added — Input Rupiah desimal
- Semua kolom uang terima koma desimal (`1.234.567,89` / `0,5`), format otomatis saat ketik (ekor koma dijaga), titik ribuan + koma desimal Indonesia; semua pembaca nominal diperbaiki (dulu `1.000,5` terbaca 10005!)

### Changed — Form stok ramah anak
- Label jelas (“Dijual berapa?”, “Modal 1 pcs berapa?”, “Punya berapa?”, “Ingatkan kalau sisa”), contoh placeholder, catatan untung per pcs

---

## [1.6.1] - 2026-09-09

### Changed
- **Transfer-first** — default cara bayar di semua form (transaksi, pelunasan, gaji, transfer, import bank) kini Transfer, bukan Tunai

### Fixed (audit kejujuran UI + bug)
- **Tren kartu bohongan** — badge `+100%`/`0%`/`Stabil` statis kini dihitung beneran vs periode sebelumnya (pengeluaran naik = merah); label periode topbar ikut filter (dulu macet “Agustus 2026”)
- **Klaim login palsu** — “Dipercaya 12.000+ bisnis / Rating 4.9 G2” diganti teks jujur (offline-first & gratis)
- **Tombol Export Excel mati** (ketahuan eslint) — kini terhubung
- **Restore JSON buang jurnal/barang/karyawan** — backup v3 kini digabung utuh + dilaporkan di toast
- **Hapus semua sisakan jurnal hantu** — reset kini wipe total (jurnal, audit, stok, gaji, anggaran) + konfirmasi tegas
- **CSV injection & CSV koma** — sel `= + - @` dinetralkan; parser hormati kutip + deteksi delimiter (roundtrip export→import aman)
- **Print kena XSS yang sama** — semua field di-escape
- Label “Pertumbuhan” → “Pertumbuhan masuk”; meta bar tampilkan total berbunga

---

## [1.6.0] - 2026-09-09

### Added — Fase 1: Sistem pembukuan beneran
- **Double-entry + COA SAK EMKM** (`coa.js`, `journals.js`) — tiap transaksi/pinjaman/pelunasan posting jurnal balance otomatis; cara bayar → akun kas/hutang; kategori → akun beban/pendapatan
- **Backfill otomatis** — data lama dijurnalkan saat boot (idempoten); semua jurnal ikut backup JSON + mirror IDB
- **Jurnal Umum + Buku Besar + Laba Rugi + Neraca** — 4 tab laporan baru (Neraca: Aset = Kewajiban + Modal Awal + Laba Ditahan, indikator balance)
- **Audit trail** — tiap create/update/delete tercatat (500 terakhir) + tab Audit
- **Modal Awal** di Pengaturan untuk Neraca

### Added — Fase 2: Dibayar + patuh pajak
- **Aging piutang + WA** — strip Lancar/Telat ≤30/31–60/Macet + tombol 💬 WA per kartu telat (prefill teks + no. kontak; field No. WA di Kontak)
- **Jatuh tempo pinjaman** — input tanggal di form + dipakai pengingat & aging
- **PPh Final 0.5%** — tab Pajak (omzet/bulan, sisa plafon 4.8M, PPN Keluaran−Masukan) + pengingat sebelum tgl 15
- **PPN di transaksi** — checkbox “termasuk PPN 11%” posting split DPP/PPN
- **Invoice otomatis** — `INV/YYYY/MM/NNNN` tiap Kasih Pinjam + tombol cetak invoice (tagihan, sisa, riwayat)

### Added — Fase 3: Operasional
- **Stok barang** — master + beli (tambah stok, rata-rata modal) / jual (kurang stok, HPP otomatis, cegah oversell) langsung dari form transaksi; peringatan stok menipis; nilai persediaan di Neraca
- **Multi-kas** — saldo per dompet kini dari jurnal (transfer ikut kehitung); modal Kas: transfer antar kas + rekonsiliasi fisik-vs-catat (selisih dijurnal)
- **Import mutasi bank CSV** — BCA/Mandiri/umum, auto-match nominal±3 hari, import terpilih ke kas pilihan
- **Gaji karyawan** — master + proses bulanan (1 transaksi/karyawan, kategori Gaji Karyawan) + slip gaji cetak + sidebar 💼

### Changed
- Backup `version: 3` (jurnal, barang, karyawan, ekuitas ikut tersimpan)

---

## [1.5.2] - 2026-09-09

### Fixed
- **Tombol Export Excel mati** — `exportExcelBtn` tidak punya listener (ketahuan oleh eslint `no-unused-vars`); kini terhubung ke `handleExportExcel`
- **Hitungan cicilan bisa lewat tenor** — banyak bayaran kecil bikin label `ke-21/12`; kini dijepit (`2/2 kali`, tombol `Bayar • Sisa …`) + catatan kelebihan bayar; tenor kartu ikut total berbunga (dulu pakai pokok)
- **Rentang tanggal satu sisi diabaikan diam-diam** — `filterEntries` kini dukung open-ended (cuma start / cuma akhir) + tanggal terbalik tetap ditukar

### Added
- **ESLint** — `npm run lint` / `npm run check` (lint + test); bersih dari 14 temuan (kode mati: `syncBtn`, `VALID_TYPES`, `EMPTY_LOAN_SUMMARY`, `verbRepay`, `populateHutangPicker`, dead code `clearAllLoans`/CSV; global `Event` didaftarkan)

---

## [1.5.1] - 2026-09-08

### Fixed (hasil audit keamanan + logika)
- **Stored XSS via kategori custom & deskripsi** — nama kategori/deskripsi ber-HTML kini dinetralkan di perbatasan storage (`sanitizeCategory`) + di-escape di semua render (tabel, laporan, donut, kwitansi, filter chips, pengaturan). Vektor termasuk file import jahat (Excel/CSV/JSON)
- **Preset nominal pelunasan kosong** — `formatIdrInput` menulis `250.000` ke `<input type=number>` sehingga browser mengosongkannya; tombol Bayar N/M, chip cicilan & Lunasi kini isi angka mentah
- **Edit pinjaman menimpa catatan** — `updateLoan` kini pertahankan deskripsi user di entry pokok (bukan reset ke teks otomatis)
- **Edit pinjaman bisa hapus bunga** — field bunga selalu terbaca & terlihat saat edit (tidak tergantung mode lama)
- **Status tidak ikut kebenaran** — `updateLoan` hitung ulang lunas/aktif dari terbayar vs total (mis. pokok dikecilkan di bawah terbayar → otomatis lunas); sisa dropdown kontak ikut total berbunga
- **Submit tanpa pengaman error** — `handleFormSubmit`/`handleRepaySubmit` kini tangkap error storage (mis. penyimpanan penuh) jadi toast, bukan diam
- Cache service worker ketinggalan versi (`v1-4-0` → `v1-5-0`); `computeLoanSummary` kembalikan objek nol (bukan array) untuk input rusak; kartu pinjaman tampilkan total (pokok+bunga) sebagai headline

---

## [1.5.0] - 2026-09-08

### Added
- **Bunga pinjaman (%)** — opsional 0–100% saat buat pinjaman baru; model flat: total wajib dibalikin = pokok + bunga (mis. 1jt + 5% = 1.050.000)
- Cicilan/tenor otomatis dihitung dari **total** (bukan pokok); jadwal, sisa, progress, ringkasan bayar, validasi nominal, dan status lunas semuanya ikut total
- Kartu pinjaman tunjukkan `🌸 Bunga X% (+Rp…) • Total Rp…`; hint live di form (`Bunga 5% = Rp50rb • Total dibalikin …`); kolom `Bunga %` di export/import Excel + backup JSON

---

## [1.4.0] - 2026-09-08

### Added
- **Cadangan otomatis** — mirror IndexedDB tiap ada perubahan (`idb.js`), pulihkan otomatis saat boot kalau localStorage kosong, pengingat backup kalau >30 hari + label backup terakhir di Pengaturan (`app.js` `storage.js`)
- **Cara Bayar di pelunasan** — modal bayar/terima ada pilihan dompet + detail (tidak lagi selalu `cash`); pinjaman baru juga simpan cara bayar (`index.html` `ui.js` `storage.js:loanEntryData`)
- **Recurring beneran** — engine auto-post tiap bulan saat boot (maks 12/bulan, lewati hari yang belum tiba) + kelola (jeda/hapus) di Pengaturan (`storage.js:runRecurringEngine`)
- **Anggaran per kategori + Saldo per Dompet** — limit per kategori di Pengaturan, mini-bar di kartu anggaran, panel dompet masuk−keluar per cara bayar (`storage.js` `app.js:renderCategoryBudgets/renderWallets`)
- **Kwitansi** — tombol 🧾 per transaksi, pratinjau + terbilang + rincian PPN 11% opsional + cetak (`ui.js:terbilang/openReceipt`)
- **Urungkan hapus** — hapus transaksi (1/banyak) + pembayaran pinjaman tanpa `confirm`, toast Urungkan 6 detik (`ui.js:showUndoToast` `storage.js:restoreEntry/restoreRepayment`)
- **PWA** — `manifest.json` + `sw.js` (cache-first app shell) + ikon, bisa install & buka offline
- **Tes otomatis** — `vitest` + `jsdom`, 55 tes (`tests/`: loanmath, reports, validateForm+terbilang, backup schema, smoke DOM render)
- **Modul baru** — `loanmath.js` (satu-satunya sumber hitungan tenor/sisa/jadwal), `charts.js` (Arus Kas + donut pindah dari app.js), `features.css` (gaya v1.4+), `vendor/` (xlsx + Inter lokal, CDN cuma fallback)

### Changed
- **Restore JSON divalidasi schema** — file bukan-backup ditolak dengan pesan jelas, baris rusak dilewati satu-satu (tidak menggugurkan semua), duplikat pembayaran terdeteksi, status lunas dihitung ulang (`storage.js:validateBackupJSON`)
- **Bahasa** — deskripsi otomatis pinjaman ikut bahasa baru (`Kasih pinjam ke`, `Dibalikin dari`…); dropdown Bahasa mati dihapus; Bantuan + Changelog jadi modal beneran; Akun tunjukkan info data nyata

### Fixed
- **Bug impor**: 1 baris `null`/rusak menggugurkan seluruh impor (ketahuan oleh tes baru) — `importEntries` sekarang pakai sanitizer
- Tag `<label>` tak tertutup di modal bayar

### Deferred
- Sync cloud multi-device (butuh backend + kunci API — belum ada)
- Migrasi penuh localStorage → IndexedDB sebagai sumber utama (butuh rewrite async; mirror + backup menutup risiko data hilang untuk sekarang)

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

[1.11.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.11.0
[1.10.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.10.0
[1.9.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.9.0
[1.8.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.8.0
[1.7.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.7.0
[1.6.1]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.6.1
[1.6.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.6.0
[1.5.2]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.5.2
[1.5.1]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.5.1
[1.5.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.5.0
[1.4.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.4.0
[1.3.1]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.3.1
[1.2.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.2.0
[1.1.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.1.0
[1.0.0]: https://github.com/CASANMGT/SysAcc/releases/tag/v1.0.0
