-- Sederhanakan regulator: dari aset per-unit berkode menjadi dua angka stok.
--
-- Fitur regulator sebelumnya (baseline_existing_schema + rental_master_data)
-- melacak tiap regulator sebagai baris individual (kode, status, pemegang) --
-- persis pola tabung. Di lapangan itu berlebihan: yang dibutuhkan cuma dua
-- angka, regulator BARU (dijual) dan regulator BEKAS (disewakan), sama seperti
-- tabung 1m3 tanpa kode yang sudah disederhanakan jadi stok curah.
--
-- Data regulator yang ada di tabel `regulators` sengaja TIDAK dimigrasikan --
-- baru/bekas tidak pernah dibedakan sebelumnya, jadi menebak dari status lama
-- (Available/Rented/Sold/Damaged) hanya mengarang angka. Pemilik toko mengisi
-- ulang stok baru dan bekas secara manual lewat Master Data, sama seperti
-- stockQty tabung 1m3 direset ke 0 di migrasi sebelumnya.

-- ---------------------------------------------------------------------------
-- 1. Master data: stok baru & bekas pada baris tarif REGULATOR
--
-- regulatorNewStock berkurang otomatis saat terjual (state permanen).
-- regulatorUsedStock TIDAK bergerak saat disewa/dikembalikan -- itu perputaran,
-- bukan kepemilikan. Jumlah yang sedang beredar diturunkan dari transaksi.
-- ---------------------------------------------------------------------------

alter table public.rental_tariffs add column if not exists "regulatorNewStock"  integer not null default 0;
alter table public.rental_tariffs add column if not exists "regulatorUsedStock" integer not null default 0;

update public.rental_tariffs
set "regulatorNewStock" = 0, "regulatorUsedStock" = 0
where kind = 'REGULATOR';

-- ---------------------------------------------------------------------------
-- 2. Transaksi: regulatorId (unit tertentu) diganti regulatorTariffId + qty
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists "regulatorTariffId" text
  references public.rental_tariffs (id) on delete set null;
alter table public.transactions add column if not exists "regulatorQty" integer;

alter table public.transactions drop constraint if exists transactions_regulatorId_fkey;
alter table public.transactions drop column if exists "regulatorId";

-- ---------------------------------------------------------------------------
-- 3. Hapus tabel regulators -- tracking per-unit tidak dipakai lagi
-- ---------------------------------------------------------------------------

drop table if exists public.regulators;

-- ---------------------------------------------------------------------------
-- 4. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_kolom_tarif integer;
  v_kolom_tx    integer;
  v_tabel_reg   integer;
begin
  select count(*) into v_kolom_tarif from information_schema.columns
    where table_schema = 'public' and table_name = 'rental_tariffs'
      and column_name in ('regulatorNewStock', 'regulatorUsedStock');
  select count(*) into v_kolom_tx from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions'
      and column_name in ('regulatorTariffId', 'regulatorQty');
  select count(*) into v_tabel_reg from information_schema.tables
    where table_schema = 'public' and table_name = 'regulators';

  if v_kolom_tarif <> 2 then raise exception 'Kolom stok regulator diharapkan 2, dapat %', v_kolom_tarif; end if;
  if v_kolom_tx <> 2 then raise exception 'Kolom regulator transaksi diharapkan 2, dapat %', v_kolom_tx; end if;
  if v_tabel_reg <> 0 then raise exception 'Tabel regulators masih ada'; end if;

  raise notice 'Migration OK: stok regulator baru/bekas siap, tabel regulators dihapus';
end $$;
