# Audit State — Wynara Accounting

Baseline: v1.15.0 (audit dibuat atas v1.14.2; sebagian finding sudah terdafikan di v1.15.0).
Metode: statis + code review; angka `[VERIFY]` butuh uji runtime oleh manusia.

## Current scores (rubric, 0–100; setelah iter 1)

| Axis | Nilai | Catatan |
|---|---|---|
| F1 Core ledger | 78 | double-entry kuat, lock periode ada; opening balance belum |
| F2 Tax conformance | 70 | PPN **configurable** ✓; PPh21 TER ✓; PPh23/4(2) ✗; PPh Final 0,5% masih konstanta |
| F3 Payroll & HR | 70 | absensi ada; lembur formula ✗; Dec recon ✗; 1721-A1 ✗ |
| F4 Data durability | 44 | kredensial default kini kontekstual; tanpa server/auth nyata |
| F5 Reporting | 84 | set lengkap + Excel |
| F6 Task efficiency | 70 | modal transaksi ~18 kontrol (target 3) |
| F7 Cognitive load | 68 | dua nada bicara bercampur |
| F8 Mobile | 80 | **Lainnya** menutup 8 tujuan |
| F9 Accessibility | 55 | emoji-icon tanpa label |
| **Grade** | **~73** | +1 dari iter 1 |

## Backlog (dari WYNARA-AUDIT-v1.14.2.md + ongoing)

- **B1 (C1)** Server persistence + auth — Supabase; local-first sebagai cache. *Butuh keputusan backend.*
- **B2 (C2)** Kredensial default tercetak di layar login → hilangkan saat sandi sudah diganti; nudge ganti sandi.
- **B3 (C3)** Role model: tambah Akuntan & HRD; audit trail pakai aktor nyata.
- **B4 (C4)** Payroll: lembur KEP-102/2004, cuti 12 hari, **rekonsiliasi Des PPh21** (`[VERIFY]`), 1721-A1, validasi UMP.
- **B5 (C5)** PPN configurable + DPP nilai lain; PPh 23 / 4(2) pemotongan vendor; faktur pajak/NITKU.
- **B6 (C6)** Opening balance import; year-end close sudah ada (penutupan bulanan, ulangi per akhir tahun).
- **U1** Mode Sederhana vs Mode Akuntan (peta istilah).
- **U2** Modal transaksi: maks 3 field terlihat on-open; sisanya `Detail lainnya ▾`.
- **U3** Regroup 15 tab laporan → Ikhtisar/Resmi/Kepatuhan.
- **U4** Bottom nav: tambah "Lainnya" (Kontak, Pinjemin, Stok, Pengaturan).
- **U5** Ganti emoji-icon → icon set berlabel.
- **U6** Satu entitas empat nama (Teman/Kontak/…) → "Kontak".
- **U7** Aksesibilitas: focus ring, label kontrol khusus, kontras.
- **U8** Empty states untuk semua tab laporan.
- **U9** [VERIFY] 10 cek runtime di audit §6 (Dec TER, lock lintas modul, PPN split, dst).

## Completed

- iter 0 (v1.15.0): Neraca Saldo + Laporan PPN 1111 + Rekap PPh21 + Export Excel + jurnal penutupan (Laba Ditahan 3102) + backup share WA + absensi saran denda.
- iter 1 (v1.15.1): **B2** kredensial default kontekstual (hint hilang setelah sandi diganti) → F4 40→44. **U4** "Lainnya" bottom-nav sheet (Kontak/Pinjemin/Stok/Kas/Pengaturan) → F8 74→80. **B5-lite** tarif PPN configurable (Pengaturan) + DPP report & kwitansi ikut tarif → F2 66→70. Tests 141/141 ✓.

## Regressions

- (belum ada)

## Frozen

- **PPh Final 0,5% tetap konstanta** (diterakan ke backlog B5 penuh): PP 23/2018 menetapkan 0,5% atas omzet bruto — tarif ini statutory, bukan "konfigurasi bebas"; memindahannya ke konfigurasi bisa membuat user salah input. Rencana: jadikan tabel effective-dated bila regulasi berubah.

## Open questions (keputusan manusia — JANGAN kode tanpa jawaban)

1. **PPN**: posisi tarif benar sekarang — 11% flat, atau 12% dengan DPP nilai lain (efektif 11%)? Sumber: UU HPP/Pmk terkini? Konfirmasi sebelum mengubah kalkulasi; sementara tarif tetap tersimpan konfigurasi default 11%.
2. **UMP/UMK 2026** per provinsi — tabel effective-dated apakah default tahunan?
3. **Backend**: pilih Supabase vs self-host untuk C1 (butuh akun/domain/token)?
4. **Role Akuntan & HRD**: matriks izin akhir (akuntan boleh posting penyesuaian tanpa approve?)
