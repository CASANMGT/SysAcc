-- ============================================================================
-- Wynara Accounting — Skema Supabase (SERVER-AUTHORITATIVE)
-- Server = SUMBER KEBENARAN. localStorage hanya cache cepat di klien.
-- Cara pakai (30 detik):
--   1) Buka Supabase Dashboard → SQL Editor → New query
--   2) Tempel SELURUH isi file ini → Run
--   3) Authentication → Providers → pastikan "Email" ENABLED
--      (opsional) Authentication → Sign In / Providers → matikan "Confirm email"
--      agar bisa langsung masuk tanpa klik tautan email.
--   4) Masuk aplikasi dengan email + kata sandi (atau "Daftar dengan email").
-- JANGAN pakai service_role key di aplikasi — cukup publishable/anon + RLS.
-- ============================================================================

-- 1) Records: satu baris per record (entries, loans, repayments, people,
--    journals, items, employees, purchases, assets, bank statement/rules).
--    PK (user_id, kind, id) → mendukung upsert "resolution=merge-duplicates".
create table if not exists wynara_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
create index if not exists wynara_records_sync_idx
  on wynara_records (user_id, kind, updated_at);

-- 2) KV: blob singleton per kunci (locks, budget, equity, recurring, catBudget,
--    ppn, opening, coa_custom, counters, draft:YYYY-MM, leave, ump, shops,
--    sale_returns, bank_endbal).
create table if not exists wynara_kv (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists wynara_kv_sync_idx
  on wynara_kv (user_id, updated_at);

-- 3) Row Level Security: user hanya boleh menyentuh baris miliknya.
alter table wynara_records enable row level security;
alter table wynara_kv enable row level security;

drop policy if exists "own rows" on wynara_records;
create policy "own rows" on wynara_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own rows" on wynara_kv;
create policy "own rows" on wynara_kv
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Hak akses untuk peran PostgREST (authenticated) — aman karena RLS aktif.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on wynara_records to authenticated;
grant select, insert, update, delete on wynara_kv to authenticated;

-- ============================================================================
-- 5) (OPSIONAL) Buat akun langsung: admin@wynara.com / wynara
--    Jalankan bagian ini HANYA jika ingin user dibuat dari SQL.
--    Cara yang DIREKOMENDASIKAN tetap: klik "Daftar dengan email" di aplikasi,
--    atau Dashboard → Authentication → Users → Add user.
--    Jika error pada versi Supabase tertentu, lewati saja dan pakai cara di atas.
-- ============================================================================
create extension if not exists pgcrypto;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  'admin@wynara.com', crypt('wynara', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
where not exists (select 1 from auth.users where email = 'admin@wynara.com');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  json_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true)::jsonb,
  'email', now(), now(), now()
from auth.users u
where u.email = 'admin@wynara.com'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');
