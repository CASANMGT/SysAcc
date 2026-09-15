-- ============================================================================
-- Wynara — Seed CUSTOM COA (akun tambahan) ke server.
-- Cara pakai:
--   1) Siapkan daftar akun kustom (yang TIDAK bentrok kode akun bawaan).
--   2) Ganti <EMAIL_AKUN> dan sesuaikan JSON di bawah.
--   3) Supabase → SQL Editor → Run.
-- Catatan: akun BAWAAN (1101..1109, 1201, 1301, 1510, 2101..2110, 3101/3102,
--   4101/4102, 5101..5199) sudah ada di kode aplikasi dan TIDAK perlu di-insert.
--   Kode yang sama akan meng-override bawaan → hati-hati bentrok makna.
-- ============================================================================

-- Contoh (silakan ganti isinya):
with target as (
  select id from auth.users where email = 'admin@wynara.com'
)
insert into wynara_kv (user_id, key, value, updated_at)
select t.id, 'wynara_coa_custom',
       '[
          {"code":"1106","name":"Bank Mandiri","type":"asset","custom":true},
          {"code":"1202","name":"Piutang Karyawan","type":"asset","custom":true},
          {"code":"6201","name":"Beban Iklan & Promosi","type":"expense","category":"iklan","custom":true},
          {"code":"6202","name":"Beban Pengiriman","type":"expense","category":"kirim","custom":true}
        ]'::jsonb,
       now()
from target t
on conflict (user_id, key) do update
  set value = excluded.value, updated_at = now();

-- Verifikasi:
-- select key, jsonb_array_length(value) as jumlah_akun from wynara_kv where key = 'wynara_coa_custom';
