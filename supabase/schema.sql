-- Wynara Accounting — skema Supabase (sinkronisasi online, local-first)
-- Cara pakai: buka Supabase Dashboard → SQL Editor → tempel seluruh file → Run.
-- Arsitektur: aplikasi tetap jalan 100% dari localStorage. Dua tabel generik
-- ini HANYA cermin sinkronisasi (multi-HP). Validasi tetap di aplikasi.
-- JANGAN pernah pakai service_role key di aplikasi — cukup anon key + RLS.

-- 1) Records: satu baris per record lokal (entries, loans, repayments,
--    people, journals, items, employees, purchases, assets).
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

-- 2) KV: blob singleton per kunci (locks, budget, equity, recurring,
--    catBudget, ppn, opening, coa_custom, counters, draft:YYYY-MM, tombstones).
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
