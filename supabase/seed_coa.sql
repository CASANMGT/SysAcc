-- ============================================================================
-- OBSOLETE (v1.86.0): chart "PT Wynara Living Atelier" kini menjadi COA BAWAAN
-- aplikasi (lihat coa.js ACCOUNTS). File ini hanya untuk REFERENSI pemetaan.
-- Data lama otomatis di-renumber saat aplikasi dibuka (migrateCoaRenumber()).
-- ============================================================================
-- Wynara — Seed COA "PT WYNARA LIVING ATELIER" (2026)
-- Menyatukan chart perusahaan ke aplikasi:
--   * ALIAS  : ganti NAMA TAMPILAN akun bawaan (kode & tipe tetap) → laporan
--              memakai istilah perusahaan tanpa merusak mesin akuntansi.
--   * CUSTOM : akun tambahan (kode yang belum dipakai bawaan).
-- Cara pakai: Supabase → SQL Editor → Run (ganti email bila perlu).
-- Setelah itu: login ulang / tunggu pullAll → Daftar Akun menampilkan chart ini.
--
-- PEMETAAN LENGKAP (chart PT Wynara Living Atelier → kode aplikasi):
--   Bank BCA              -> 1106  (nama diganti via alias)
--   Wallet Shopee         -> 1112  (alias)
--   Wallet Tokopedia      -> 1116  (alias)
--   Petty Cash            -> 1120  (alias)
--   Inventory             -> 1301  (alias; mesin memakai 1301 utk persediaan)
--   Account Receivable    -> 1201  (alias, sama)
--   Employee Loan         -> 1202  (alias, sama)
--   Other Receivable      -> 1203  (alias, sama)
--   Customer Deposit      -> 2202  (alias)
--   Account Payable       -> 2103  (alias, sama)
--   PPh 21 Payable        -> 2201  (alias)
--   PPh 23 Payable        -> 2107  (alias)
--   Owner Capital         -> 3101  (alias, sama)
--   Shopee Sales          -> 4101  (alias)
--   Tokopedia Sales       -> 4105 (custom; 4102 dipakai Pendapatan Bunga)
--   Offline Sales         -> 4106 (custom; 4103 dipakai Pendapatan Jasa)
--   Other Sales           -> 4107 (custom)
--   Salary Expense        -> 6201 (custom + kategori gaji-out)
--   THR Expense           -> 6202 (custom)
--   BPJS TK Expense       -> 6203 (custom)
--   BPJS Kes Expense      -> 6204 (custom)
--   Bank Admin Fee        -> 6205 (custom + kategori adm_bank)
--   Entertainment Expense -> 6206 (custom + kategori hiburan)
--   Marketing & Ads       -> 6207 (custom + kategori iklan)
--   Shipping & Logistic   -> 6208 (custom + kategori kirim)
--   PPh 21 Expense        -> 6209 (custom)

-- ============================================================================

-- 1) ALIAS nama akun bawaan → istilah perusahaan
with target as (select id from auth.users where email = 'admin@wynara.com')
insert into wynara_kv (user_id, key, value, updated_at)
select t.id, 'wynara_coa_alias',
'{
  "1106":"Bank BCA",
  "1112":"Wallet Shopee",
  "1116":"Wallet Tokopedia",
  "1120":"Petty Cash",
  "1301":"Inventory",
  "1201":"Account Receivable",
  "1202":"Employee Loan",
  "1203":"Other Receivable",
  "2103":"Account Payable",
  "2201":"PPh 21 Payable",
  "2107":"PPh 23 Payable",
  "2202":"Customer Deposit",
  "3101":"Owner Capital",
  "4101":"Sales"
}'::jsonb,
now()
from target t
on conflict (user_id, key) do update set value = excluded.value, updated_at = now();

-- 2) AKUN TAMBAHAN (kode bebas). Kategori (bila diisi) membuat transaksi
--    berkategori itu otomatis posting ke akun ini.
with target as (select id from auth.users where email = 'admin@wynara.com')
insert into wynara_kv (user_id, key, value, updated_at)
select t.id, 'wynara_coa_custom',
'[
  {"code":"4105","name":"Tokopedia Sales","type":"revenue","custom":true},
  {"code":"4106","name":"Offline Sales","type":"revenue","custom":true},
  {"code":"4107","name":"Other Sales","type":"revenue","custom":true},
  {"code":"6201","name":"Salary Expense","type":"expense","category":"gaji-out","custom":true},
  {"code":"6202","name":"THR Expense","type":"expense","custom":true},
  {"code":"6203","name":"BPJS TK Expense","type":"expense","custom":true},
  {"code":"6204","name":"BPJS Kes Expense","type":"expense","custom":true},
  {"code":"6205","name":"Bank Admin Fee","type":"expense","category":"adm_bank","custom":true},
  {"code":"6206","name":"Entertainment Expense","type":"expense","category":"hiburan","custom":true},
  {"code":"6207","name":"Marketing & Ads Expense","type":"expense","category":"iklan","custom":true},
  {"code":"6208","name":"Shipping & Logistic Expense","type":"expense","category":"kirim","custom":true},
  {"code":"6209","name":"PPh 21 Expense","type":"expense","custom":true}
]'::jsonb,
now()
from target t
on conflict (user_id, key) do update set value = excluded.value, updated_at = now();

-- Verifikasi:
-- select key, jsonb_array_length(value) from wynara_kv where key in ('wynara_coa_alias','wynara_coa_custom');
