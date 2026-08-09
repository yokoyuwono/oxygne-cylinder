-- Skema untuk fitur Sewa Baru: master data tarif, aset regulator, dan rincian biaya.
--
-- Seluruh perubahan di sini bersifat aditif -- dua tabel baru, satu kolom di
-- members, enam kolom di transactions. Tidak ada UPDATE maupun DELETE pada data
-- yang sudah ada, sehingga membatalkannya cukup dengan DROP objek baru.
--
-- Latar keputusan:
--   * Tarif ditaruh di tabel, bukan konstanta di kode, supaya harga bisa diubah
--     lewat halaman Master Data tanpa deploy ulang.
--   * Nominal yang dipakai saat transaksi disalin ke baris transaksi itu, jadi
--     mengubah tarif tidak pernah mengubah riwayat keuangan.
--   * cost tetap berisi PENDAPATAN saja (sewa + gas + regulator). Deposit adalah
--     titipan yang nanti dikembalikan, jadi disimpan terpisah di depositAmount --
--     kalau ikut masuk cost, Laporan Keuangan akan melaporkan laba yang bukan laba.

-- ---------------------------------------------------------------------------
-- 1. Master data tarif penyewaan
-- ---------------------------------------------------------------------------

create table if not exists public.rental_tariffs (
  id                text primary key,
  kind              text not null check (kind in ('CYLINDER', 'REGULATOR')),
  name              text,           -- dipakai baris REGULATOR; null untuk CYLINDER
  "gasType"         text,           -- dipakai baris CYLINDER; null untuk REGULATOR
  size              text,           -- dipakai baris CYLINDER; null untuk REGULATOR
  "depositAmount"   numeric default 0,
  "rentalFee"       numeric default 0,
  "gasPrice"        numeric default 0,
  "salePrice"       numeric default 0,
  "isActive"        boolean not null default true,
  "createdAt"       timestamptz not null default now()
);

-- Satu tarif per kombinasi jenis gas + ukuran.
create unique index if not exists rental_tariffs_cylinder_uniq
  on public.rental_tariffs ("gasType", size)
  where kind = 'CYLINDER';

-- ---------------------------------------------------------------------------
-- 2. Regulator sebagai aset yang dilacak per unit
-- ---------------------------------------------------------------------------

create table if not exists public.regulators (
  id              text primary key,
  code            text not null,
  status          text not null default 'Available'
                    check (status in ('Available', 'Rented', 'Sold', 'Damaged')),
  "currentHolder" text,
  "memberId"      text references public.members (id) on delete set null,
  notes           text,
  "createdAt"     timestamptz not null default now()
);

create unique index if not exists regulators_code_uniq on public.regulators (code);
create index if not exists regulators_status_idx on public.regulators (status);

-- ---------------------------------------------------------------------------
-- 3. KTP pelanggan
--
-- Nullable karena 1.289 pelanggan lama tidak punya. Unique-nya parsial supaya
-- satu KTP tidak bisa didaftarkan dua kali tanpa mengganggu baris lama yang kosong.
-- ---------------------------------------------------------------------------

alter table public.members add column if not exists ktp text;

create unique index if not exists members_ktp_uniq
  on public.members (ktp)
  where ktp is not null and btrim(ktp) <> '';

-- ---------------------------------------------------------------------------
-- 4. Rincian biaya pada transaksi
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists "depositAmount"     numeric;
alter table public.transactions add column if not exists "rentalFee"         numeric;
alter table public.transactions add column if not exists "gasPrice"          numeric;
alter table public.transactions add column if not exists "regulatorFee"      numeric;
alter table public.transactions add column if not exists "regulatorSalePrice" numeric;
alter table public.transactions add column if not exists "regulatorId"       text
  references public.regulators (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. RLS -- samakan dengan tabel lain: hanya user yang sudah login
-- ---------------------------------------------------------------------------

alter table public.rental_tariffs enable row level security;
alter table public.regulators     enable row level security;

drop policy if exists authenticated_full_access on public.rental_tariffs;
create policy authenticated_full_access on public.rental_tariffs
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_full_access on public.regulators;
create policy authenticated_full_access on public.regulators
  for all to authenticated using (true) with check (true);

revoke all on public.rental_tariffs from anon;
revoke all on public.regulators     from anon;

-- ---------------------------------------------------------------------------
-- 6. Isian awal
--
-- Dua baris Oxygen aktif sesuai ketentuan yang diberikan pemilik toko.
-- Tiga jenis gas lain sudah punya tabung dan pelanggan tapi tarif standarnya
-- belum pernah ditetapkan, jadi dibuat NONAKTIF sebagai draf: harga gas diisi
-- dari rata-rata yang benar-benar dibayar pelanggan saat ini, sementara deposit
-- dan sewa sengaja dibiarkan 0 supaya diisi sendiri -- angka itu tidak boleh
-- dikarang.
-- ---------------------------------------------------------------------------

insert into public.rental_tariffs
  (id, kind, name, "gasType", size, "depositAmount", "rentalFee", "gasPrice", "salePrice", "isActive")
values
  ('rt-oxy-6m3', 'CYLINDER', null, 'Oxygen',           '6m3', 500000, 500000, 140000, 0, true),
  ('rt-oxy-1m3', 'CYLINDER', null, 'Oxygen',           '1m3', 250000, 250000,  50000, 0, true),
  ('rt-ace-6m3', 'CYLINDER', null, 'Acetyline',        '6m3',      0,      0, 576000, 0, false),
  ('rt-arg-6m3', 'CYLINDER', null, 'Argon',            '6m3',      0,      0, 425000, 0, false),
  ('rt-c2h2-6m3','CYLINDER', null, 'Acetylene (C2H2)', '6m3',      0,      0, 530000, 0, false),
  ('rt-reg-std', 'REGULATOR', 'Regulator Standar', null, null,     0, 250000,      0, 400000, true)
on conflict (id) do nothing;

do $$
declare
  v_tarif  integer;
  v_aktif  integer;
  v_kolom  integer;
begin
  select count(*) into v_tarif from public.rental_tariffs;
  select count(*) into v_aktif from public.rental_tariffs where "isActive";
  select count(*) into v_kolom from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions'
      and column_name in ('depositAmount','rentalFee','gasPrice','regulatorFee','regulatorSalePrice','regulatorId');

  if v_tarif <> 6 then raise exception 'Tarif diharapkan 6 baris, dapat %', v_tarif; end if;
  if v_aktif <> 3 then raise exception 'Tarif aktif diharapkan 3, dapat %', v_aktif; end if;
  if v_kolom <> 6 then raise exception 'Kolom rincian transaksi diharapkan 6, dapat %', v_kolom; end if;

  raise notice 'Migration OK: % tarif (% aktif), % kolom rincian', v_tarif, v_aktif, v_kolom;
end $$;
