-- Baseline: snapshot skema produksi (project mtlsimsndniuonblmnsw) per 2026-08-09.
--
-- Skema ini dibangun manual lewat dashboard/SQL Editor sebelum ada version control,
-- jadi file ini direkonstruksi dari katalog Postgres (information_schema, pg_constraint,
-- pg_indexes, pg_proc, pg_policies) dan merekam keadaan APA ADANYA -- termasuk policy
-- RLS longgar yang diperbaiki di migration berikutnya.
--
-- File ini TIDAK dijalankan terhadap produksi (objeknya sudah ada di sana). Gunanya:
--   1. titik awal versi skema,
--   2. supaya environment baru bisa dibangun dari nol.
--
-- Backup data yang menyertai snapshot ini:
--   ../../../oxygne-cylinder-backups/20260809-140937/

begin;

-- ---------------------------------------------------------------------------
-- Tabel dasar (tanpa dependensi)
-- ---------------------------------------------------------------------------

create table if not exists public.members (
  id                text primary key,
  name              text,
  "companyName"     text,
  address           text,
  phone             text,
  "totalDeposit"    numeric default 0,
  "totalDebt"       numeric default 0,
  "joinDate"        text,
  status            text default 'Active'::text,
  "exitRequestDate" text
);

create table if not exists public.refill_stations (
  id              text primary key,
  name            text,
  address         text,
  "contactPerson" text,
  phone           text
);

create table if not exists public.cylinders (
  id              text primary key,
  "serialCode"    text not null,
  "gasType"       text,
  size            text,
  status          text,
  "currentHolder" text default ''::text,
  "lastLocation"  text
);

-- ---------------------------------------------------------------------------
-- Tabel dengan foreign key
-- ---------------------------------------------------------------------------

create table if not exists public.member_prices (
  id         text primary key,
  "memberId" text references public.members (id) on delete cascade,
  "gasType"  text,
  size       text,
  price      numeric
);

create table if not exists public.refill_prices (
  id           text primary key,
  "stationId"  text references public.refill_stations (id) on delete cascade,
  "gasType"    text,
  size         text,
  price        numeric,
  "serialCode" text
);

create table if not exists public.transactions (
  id                      text primary key,
  "cylinderId"            text references public.cylinders (id),
  "memberId"              text references public.members (id) on delete set null,
  "refillStationId"       text references public.refill_stations (id) on delete set null,
  type                    text not null,
  date                    text not null,
  "rentalDuration"        numeric,
  cost                    numeric,
  "paymentStatus"         text,
  "relatedTransactionIds" text[]
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text,
  name        text,
  role        text default 'operator'::text,
  "lastLogin" text
);

-- ---------------------------------------------------------------------------
-- Trigger pembuatan profile saat user auth baru dibuat
--
-- CATATAN: versi ini selalu memberi role 'operator', sehingga belum pernah ada
-- user ber-role admin. search_path juga belum di-set (temuan linter 0011).
-- Keduanya diperbaiki di migration berikutnya.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.profiles ("id", "username", "name", "role")
  values (new.id, new.email, 'New User', 'operator');
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS -- KEADAAN AS-FOUND, TIDAK AMAN
--
-- Ketujuh tabel memakai policy `for all to public using (true)`, artinya role
-- `anon` boleh SELECT/INSERT/UPDATE/DELETE tanpa login. Direkam di sini apa
-- adanya sebagai titik awal; diganti di migration berikutnya.
-- ---------------------------------------------------------------------------

alter table public.members         enable row level security;
alter table public.refill_stations enable row level security;
alter table public.cylinders       enable row level security;
alter table public.member_prices   enable row level security;
alter table public.refill_prices   enable row level security;
alter table public.transactions    enable row level security;
alter table public.profiles        enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'members','refill_stations','cylinders',
    'member_prices','refill_prices','transactions','profiles'
  ] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'Enable all access for all users'
    ) then
      execute format(
        'create policy %L on public.%I for all to public using (true)',
        'Enable all access for all users', t
      );
    end if;
  end loop;
end $$;

commit;
