# Changelog

All notable changes to **SysAcc — Wynara Accounting** will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.22.1] - 2026-09-11

### Added — Tombol daftar akun Supabase
- Pengaturan → Sinkron: **📝 Daftar akun baru** (sebelumnya hanya Masuk — akun pertama tak bisa dibuat dari aplikasi)
- Alur konfirmasi email ditangani eksplisit (pesan "cek email" bila provider minta konfirmasi)

---

## [1.22.0] - 2026-09-11

### Added — Sinkron Online Supabase, local-first (B1 groundwork)
- `supabase/schema.sql`: 2 tabel generik (`wynara_records`, `wynara_kv`) + RLS per user — tempel di SQL Editor
- `supabase.js`: REST murni tanpa SDK (aturan no-build terjaga); auth email + refresh token; gabung last-write-wins per baris (seri → lokal), hapus via tombstone 30 hari, throttle 60 dtk menumpang mirror, dot status ☁️ topbar
- UI minimal: section Sinkron di Pengaturan (URL + anon key + login + status) — tanpa nav baru, kasir tak melihat
- 11 test merge/sync tanpa network (1 test menangkap bug `Date.parse(0)` pra-produksi)
- **Belum aktif tanpa kredensial**: butuh Project URL + anon key (JANGAN service_role) → F4 tetap 52 sampai first-sync hijau
- 173/173 tests ✓

---

## [1.21.0] - 2026-09-11

### Added — Rekonsiliasi PPh 21 Desember + Bukti Potong 1721-A1 (B4a)
- **Panel rekonsiliasi Desember** di Hitung & Bayar (muncul bila periode Desember + ada gaji final Jan–Nov): bruto setahun, sudah dipotong, terutang progresif, TER draf vs angka rekonsiliasi, tombol **Terapkan** + **🧾 A1** per karyawan
- **Perhitungan tahunan** (`decRecon`, murni & ter-test): biaya jabatan 5% maks Rp6jt/tahun, PKP setelah PTKP (pembulatan ribuan), progresif 5/15/25/30/35% (UU PPh 36/2008 jo. UU HPP 7/2021 — tabel terisolasi, minta konsultan konfirmasi sebelum filing), NPWP +20%, floor 0
- **Override transparan**: `pphOverride` di computeSlip + flag `pphOverridden` (slip, snapshot, deskripsi final bertanda "(PPh rekonsiliasi Des)")
- **Cetak 1721-A1**: identitas + PTKP, tabel bruto/PPh per bulan, penghitungan tahunan, kolom tanda tangan
- 162/162 tests ✓ (test hitung-tangan menangkap cacat desain Jan–Nov/Des sebelum produksi)

---

## [1.20.3] - 2026-09-10

### Fixed — JKK Rp4.050.000 KEMBALI (akar sebenarnya)
- **Bukan salah ketik user**: `saveEmployee` memberi default `jkkRate: 0.54` (gaya persen, cap 5) sementara `computeSlip` memakainya sebagai pecahan → semua karyawan tanpa override kena tarif 54%. Guard v1.13.1 tidak menjangkau jalur ini (label pakai `R.jkk` yang benar → label 0,54% tapi nominal 100× lipat)
- **3 lapis**: `sanitizeJkkRate()` baru (satu-satunya pintu tarif JKK final; di luar 0–1,74% → fallback) dipakai di `computeSlip` (kebal terhadap data lama beracun apa pun) + dipakai di `saveEmployee` (data sembuh saat disimpan; override legal mis. 1,2% tetap dihormati)
- Data lama beracun (0.54 tersimpan) langsung dihitung benar tanpa migrasi; 4 test regresi end-to-end (save→slip = Rp40.500)
- 156/156 tests ✓

---

## [1.20.2] - 2026-09-10

### Fixed — Teks bertumpuk di Jurnal + audit UI/UX Laporan
- **Memo jurnal wrap** (bukan `nowrap` meluber): memo payroll panjang kini turun baris rapi + tooltip penuh; tanggal/akun/angka tetap sebaris — tidak ada lagi teks menutupi kolom Akun. Berlaku juga di sub-tabel drill-down
- **Tabel laporan min-width 620px**: kolom punya napas, panel scroll horizontal di HP (terverifikasi screenshot headless 460px)
- 152/152 tests ✓

---

## [1.20.1] - 2026-09-10

### Fixed — JURANG halaman Laporan: satu `</div>` hilang (akar masalah)
- **Diagnosis forensik** (bukan cache!): salah satu edit lama menghapus pembuka `<div class="payroll-grid">` tapi penutupnya tertinggal → `#viewPayroll` tertutup prematur → `main` + wrapper ikut tertutup → `#viewLaporan` + `#viewChangelog` terlempar jadi anak langsung `#appRoot`, tampil DI BAWAH wrapper `min-height:100vh` yang kosong = jurang raksasa + konten kiri tertutup sidebar
- **Perbaikan 1 baris**: kembalikan pembuka `payroll-grid` — nesting kembali sempurna (parser + headless Chrome: `PARENT:MAIN`, `H1TOP:88`)
- **Test struktural permanen**: semua view wajib di dalam `#main-content` (terbukti GAGAL tanpa fix, lulus dengan fix)
- File debug sementara (`debug-*.html`) tidak ikut rilis
- 152/152 tests ✓

---

## [1.20.0] - 2026-09-10

### Added — Drawer menu samping (toggle hamburger)
- Tombol **☰ kini selalu tampil** (dulu hanya HP): di desktop menciutkan sidebar jadi drawer geser — konten melebar penuh; pilihan tersimpan (`wynara_sb`)
- Di HP tetap drawer overlay seperti semula + lapis penutup otomatis saat pilih menu (tidak bisa nyangkut menutupi konten)
- `aria-expanded` + label "Buka atau tutup menu samping"
- Layout statis halaman Laporan diverifikasi piksel-per-piksel via headless Chrome 460px: tanpa jurang, H1 tepat di bawah topbar
- 151/151 tests ✓

---

## [1.19.2] - 2026-09-10

### Fixed — Audit UI/UX halaman Laporan (7 temuan)
- **Drill-down bisa keyboard**: baris akun Buku Besar & Neraca Saldo kini `tabindex + role=button`, Enter/Space membuka rincian (sebelumnya hanya klik mouse)
- **Excel tidak lagi campur tabel drill**: hanya tabel utama per sheet; toast info bila laporan tak punya tabel
- **Cetak/PDF bersih**: baris filter dropdown tidak ikut tercetak (label yatim hilang)
- **Dropdown Periode sinkron** dengan filter dashboard (Bulan ini/Lalu/Tahun ini); pilihan Kuartal halaman tetap diingat
- **Search auto-reset** saat pindah dari tab Jurnal/Buku Besar (filter basi tidak terbawa)
- **Grup tab berlabel** (Ikhtisar terlabel; Resmi & Kepatuhan `role=group` + aria-label) untuk screen reader
- 150/150 tests ✓

---

## [1.19.1] - 2026-09-10

### Fixed — drawer nyangkut + purge anti-macet
- **Delegasi global drawer**: klik item sidebar MANAPUN selalu menutup drawer (lapis kedua di atas showView) — menutup kemungkinan drawer overlay menutupi konten di HP
- **Purge anti-macet**: counter 3 percobaan; percobaan ke-3 memakai `?fresh=` (SW tidak bisa sajikan cache basi untuk URL baru) + URL dibersihkan otomatis setelah cocok
- Sinkron versi 1.19.1 di semua penanda (APP/VERSION/HTML/SW)
- 149/149 tests ✓ (target: 150+ setelah tambah test drawer)

---

## [1.19.0] - 2026-09-10

### Changed — Halaman Laporan ditulis ulang ikut standar Ringkasan/Gaji
- **Header ramping**: judul + subjudul di kiri; kanan hanya Periode + Excel + Cetak/PDF (sebelumnya 6 kontrol berdesakan: search, 2 tombol akuntan, Excel, PDF)
- **Toolbar baris sendiri** (di bawah tab, seperti pola halaman Gaji): kolom cari Jurnal/Buku Besar + Jurnal penyesuaian + Penutupan bulan — tidak lagi menekan judul
- **Urutan standar**: header → tab grup → toolbar → ringkasan keadaan → panel konten
- Kelas CSS baru `.view-actions` / `.view-toolbar` dipakai ulang antar-view; tanpa ubah logika (semua ID dipertahankan), 149/149 tests ✓

---

## [1.18.4] - 2026-09-10

### Fixed — guard loloskan JS-lama + HTML-baru (dari screenshot user)
- Guard v1.18.3 mensyaratkan `pageReportContent` hilang — HTML baru selalu memilikinya, sehingga kombinasi **JS basi + HTML segar** (drawer tak tertutup, tanpa scroll-reset, tombol meluber) lolos tanpa purge
- Guard disederhanakan total: **versi tidak sama persis → purge**. JS lama tanpa penanda = selalu beda = selalu diperbaiki otomatis
- Revert CSS luas v1.18.2 sudah aman di rilis ini (wrap hanya inline header Laporan)
- 149/149 tests ✓

---

## [1.18.3] - 2026-09-10

### Fixed — CSS header + versi basi persisten
- **Revert rule CSS terlalu luas** (`.view-header > div:last-child` ikut merusak judul halaman Gaji & panel Changelog) → wrap hanya di baris aksi header Laporan (inline, aman)
- Semua penanda versi disegarakan (APP/VERSION/HTML/SW `v1-18-3`) agar skew-check & self-heal mengenali rilis ini
- 149/149 tests ✓

---

## [1.18.2] - 2026-09-10

### Fixed — Laporan tidak "nempel ke atas" (dari screenshot user)
- **Scroll ke atas tiap pindah view**: `showView` kini reset scroll window + `#main-content` — posisi scroll halaman panjang sebelumnya tidak lagi terbawa, header "Laporan" selalu terlihat penuh
- **Header Laporan wrap**: tombol Periode/Jurnal/Penutupan/Excel/Cetak + search kini turun baris rapi di layar sempit (sebelumnya meluber terpotong "Exce…")
- 149/149 tests ✓

---

## [1.18.1] - 2026-09-10

### Fixed — file basi tidak mungkin lagi (self-heal total)
- **Skew-check HTML↔JS di inline script**: tiap load, versi HTML (`__htmlVersion`) dibandingkan versi JS (`__APP_VERSION`); bila beda → buang SW + seluruh cache → reload sekali (anti-loop). Berlaku untuk HTML versi APAPUN yang termuat — termasuk salinan basi lama
- **Auto-reload saat SW baru aktif**: update versi langsung terasa tanpa hard-refresh manual
- `app.js` menandai `window.__APP_VERSION` di top-level

---

## [1.18.0] - 2026-09-10

### Added — Tab Pengeluaran vs Anggaran (gaya screenshot)
- **Tab "Pengeluaran" baru** (Laporan → Ikhtisar, modal + halaman): kartu Anggaran bulan ini / Biaya tercatat / Sisa anggaran, filter Kategori + Pembayar, tabel Anggaran per kategori (limit, tercatat, selisih hijau/merah), grafik batang Komposisi biaya, tabel Pengeluaran terbaru (tanggal, deskripsi, kategori, pembayar, jumlah, bayar pakai)
- Semua dari data real: budget bulanan + budget per kategori (Pengaturan) × entri pengeluaran periode aktif; ikut periode selector, PDF & Excel
- Catatan jujur: "Pengajuan tambahan" & status reimbursement (Belum diganti) butuh model data penggantian dana — masuk backlog, belum di rilis ini

---

## [1.17.7] - 2026-09-10

### Changed — Changelog jadi halaman (bukan modal)
- Link "Changelog" di footer sidebar kini membuka **halaman Changelog sendiri** (bukan popup modal yang rapuh): isi `CHANGELOG.md` di-render rapi (heading, list, bold, code) langsung di halaman
- Fallback bila file tak terjangkau: tampilkan versi berjalan + petunjuk repo
- Test regresi: boot penuh + buka halaman Changelog (148/148 tests)

---

## [1.17.6] - 2026-09-10

### Fixed — Halaman Laporan putih kosong (split-brain cache)
- **Akar masalah**: nama cache service worker beku di `wynara-v1-11-0` sejak v1.11.0 → browser mencampur `index.html` lama (tanpa section Laporan) dengan `app.js` baru → klik Laporan = hide-all + target null = layar putih
- **4 lapis perbaikan**: (1) nama cache kini ikut VERSION tiap rilis + catatan wajib-bump; (2) guard saat boot — bila anchor wajib hilang dari DOM, buang SW + cache lalu reload sekali (anti-loop via session flag); (3) `showView` fallback ke Ringkasan, tidak pernah layar putih; (4) selaraskan kunci `wynara_lastBackup` (dot 💾 sebelumnya selalu "belum pernah")
- 144/144 tests ✓

---

## [1.17.5] - 2026-09-09

### Iterasi audit 15 — laporan in-depth lagi
- **🔍 Filter akun/memo di halaman Laporan (tab Jurnal & Buku Besar)** — bagian header, state module, incoming reset instan; label hit coastal `filter "x" — N cocok`
- **🧾 Ringkasan keadaan pembukuan** — panel kertas kerja ringkas di halaman Laporan: ✓ jurnal lengkap/pincang, ✓ neraca saldo balance/ selisih, 🔒 penutupan terakhir, 🔒 Jumlah periode terkunci — detail collapse
- Tests 144/144 ✓

---

## [1.17.4] - 2026-09-09

### Iterasi audit 14 — penutupan bulan tanpa ketik (T7)
- **🔒 Picker bulan untuk Penutupan**: modal chips berisi 6 bulan terakhir + status "✓ sudah ditutup" / "Tutup →" — tidak lagi mengetik `YYYY-MM` di prompt mentah (salah-tulisformat membunuh alur)
- confirm 1 kali menjaga idempoten & lock; T7 = **≪9 taps** (Laporan → Penutupan → pilih → Tutup)
- Tests 144/144 ✓

---

## [1.17.3] - 2026-09-09

### Iterasi audit 13 — entri barang & karyawan lebih cepat (benchmarks)
- **🧾/📥 Baris auto** — di modal Jual & Beli: baris berikutnya muncul otomatis begitu baris terakhir terisi lengkap (maks 8) — jual 2 barang hemat 1 ketukan 🧾 "Tambah barang"
- **⏎ Enter di Nama/Jabatan karyawan → langsung tab Gaji + fokus field gaji** — offih jalur pendek T3
- Tests 144/144 ✓

---

## [1.17.2] - 2026-09-09

### Iterasi audit 12 — progresif disclosure (U1-lite) & pengaman data
- **🎭 Mode Sederhana** — toggle di Pengaturan: menyembunyikan alat khusus akuntan (Jurnal, Buku Besar, Neraca Saldo di tab laporan + tombol Jurnal penyesuaian & Penutupan bulan). Kuis pemilik warung tak lagi memilih laporan "neraca saldo" yang tak ini butuhkan. Default: **Mode Akuntan penuh** (tidak berubah untuk siapa pun)
- **Pengingat unduhan cadangan** — bila >14 hari sejak file .json backup terakhir diunduh → peringatan toast (1×/bulan). IDB mirror tidak selamat jika browser dibersihkan
- Tests 144/144 ✓

---

## [1.17.1] - 2026-09-09

### Iterasi audit 11 — PDF berstandar filing & akses sisa
- **📄 Header PDF/Cetak kini mencatat "Periode: …"** — dari filter aktif (Semua/Bulan/Kustom/Kuartal) — dulu hanya tanggal cetak, tidak tahu periode apakah yang dicetak di arsip
- aria-label lucid: `＋` anggaran per kategori
- Tests 144/144 ✓

---

## [1.17.0] - 2026-09-09

### Iterasi audit 10 — in-depth laporan (drill-down)
- **Buku Besar drill-down** — klik akun ▸ → garis transaksinya ekspansi di bawah: tanggal, memo jurnal asli, debit/kredit + subtotal per akun (tidak perlu buka tab lain)
- **Neraca Saldo drill-down** — setiap akun berlabel ▸ bisa dibukukun; detail jurnal menjadi baris yang sama
- Periode selector di iterasi lalu kini tetap terpatan; nested braces drill-down di modal & halaman Laporan
- Jurnal per akun punya memo asli & jurnal id (slaent kertas kerja auditor); print/PDF & Excel ikut memperhitungkan drill aktif

---

## [1.16.5] - 2026-09-09

### Iterasi audit 9 — slip WA + periode laporan (benchmark T10 & T8)
- **📤 Kirim slip via WhatsApp** — tiap karyawan di Proses Gaji: tombol "WA" share ringkasan slip (bruto, BPJS, PPh, THP besar) ke wa.me; no. HP harus ada (auto-format 62)
- **🗓️ Periode di halaman Laporan** — dropdown: Semua / Bulan ini / Bulan lalu / **Kuartal lalu (3 bulan otomatis)** / Tahun ini — T8 "Laba Rugi kuartalan PDF" jadi ≤5 tap; PDF & Excel ikut periode
- Tests 144/144 ✓

---

## [1.16.4] - 2026-09-09

### Iterasi audit 8 — aging hutang + temu fitur tersembunyi
- **📊 Aging hutang supplier** — bagian "Umur hutang" di Stok → Hutang ke Supplier: bucket *Belum jatuh tempo / 1–30 / 31–60 / 61–90 / 90+ hari* dengan nominal per bucket (alat nguhut & kertas kerja akuntan)
- **🏦 Mutasi Bank masuk sheet "Lainnya"** — fitur import BCA/Mandiri/BRI ±3-day matching yang paling tinggi tingkat ketergunaannya kini terlihat di HP juga

---

## [1.16.3] - 2026-09-09

### Fixed — Laporan halaman mati (bug wiring iter 6)
- **Tab Laporan Resmi & Kepatuhan (10 tab) tidak merespon klik** — saat tab digroup 3 chip-group, listener cuma terpasang di grup pertama (id `pageReportTabs`). Kini **delegasi ke body** (`.page-report-tab`) sehingga 15 tab semua hidup; auto-scroll ke konten di desktop

---

## [1.16.2] - 2026-09-09

### Iterasi audit 6 — laporan tak lagi dead-end (UX + akses)
- **Empty-state semua 6 tab laporan** kini kasih instruksi langkah berikutnya ("Catat transaksinya dulu — tombol ＋ di dashboard / bottom-bar"), bukan teks mati
- **aria-label** pada avatar topbar (role img + title)
- Tests 144/144 stable persi ke iter 7

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
