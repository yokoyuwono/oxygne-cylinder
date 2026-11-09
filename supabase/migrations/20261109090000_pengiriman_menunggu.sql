-- Pengiriman menunggu nomor tabung: catatan siang hari yang belum berkode.
--
-- Di lapangan, pencatatan pengiriman siang hari hanya sempat menuliskan siapa
-- pelanggannya, berapa tabung, dan berapa harganya. Nomor tabungnya baru diketahui
-- dan diketik malam hari saat toko tutup. Tabel ini menampung catatan siang itu
-- sampai nomornya lengkap.
--
-- Sengaja BUKAN baris transactions. Laporan keuangan, stok, dan hitungan tabung curah
-- semua membaca transactions; RENTAL_OUT tanpa cylinderId yang berisi quantity dan size
-- terbaca sebagai botol curah tanpa kode (lib/bulkStock.ts), jadi catatan yang belum
-- berkode akan mengacaukan stok curah. Selama masih menunggu, status tabung tidak
-- berubah dan tidak ada transaksi yang lahir -- yang tersimpan di sini hanya niat,
-- sama seperti refill_drafts. Transaksi dan perpindahan status tabung baru ditulis
-- ketika nomornya lengkap, bertanggal sesuai "tanggal", bukan tanggal malam itu.
--
-- Kode tabung yang sedang diketik malam hari (3 dari 5) sengaja tidak disimpan di
-- sini. Yang tersimpan hanya yang final, supaya tidak ada tabung yang "setengah
-- terpasang" ke pelanggan.

-- ---------------------------------------------------------------------------
-- 1. Tabel
--
-- harga adalah harga PER TABUNG, disalin saat dicatat (bukan dicari ulang), supaya
-- mengubah harga pelanggan atau tarif sesudahnya tidak menulis ulang catatan siang.
--
-- "caraBayar" memuat BON di samping CASH dan TRANSFER: bon bukan metode bayar
-- (uangnya belum berpindah), hanya cara mencatat. Saat diselesaikan, BON menjadi
-- paymentStatus 'UNPAID' tanpa paymentMethod dan menambah members."totalDebt".
--
-- "memberId" tanpa ON DELETE: pelanggan yang masih punya pengiriman menunggu tidak
-- boleh terhapus diam-diam.
-- ---------------------------------------------------------------------------

create table if not exists public.pengiriman_menunggu (
  id           text primary key,
  tanggal      text         not null,
  "memberId"   text         not null references public.members (id),
  "gasType"    text         not null,
  size         text         not null,
  jumlah       integer      not null check (jumlah > 0),
  harga        numeric      not null default 0,
  "caraBayar"  text         not null check ("caraBayar" in ('CASH', 'TRANSFER', 'BON')),
  status       text         not null default 'MENUNGGU' check (status in ('MENUNGGU', 'SELESAI')),
  "createdAt"  timestamptz  not null default now(),
  "createdBy"  text,
  "selesaiAt"  timestamptz
);

comment on column public.pengiriman_menunggu.tanggal is
  'Tanggal laporan (YYYY-MM-DD). Dipakai sebagai tanggal transaksi saat diselesaikan.';
comment on column public.pengiriman_menunggu.harga is
  'Harga per tabung, disalin saat dicatat.';
comment on column public.pengiriman_menunggu."createdBy" is
  'Nama petugas yang mencatat, disalin saat menyimpan.';

create index if not exists pengiriman_menunggu_status_idx
  on public.pengiriman_menunggu (status);

-- ---------------------------------------------------------------------------
-- 2. RLS -- samakan dengan tabel lain: hanya user yang sudah login
-- ---------------------------------------------------------------------------

alter table public.pengiriman_menunggu enable row level security;

drop policy if exists authenticated_full_access on public.pengiriman_menunggu;
create policy authenticated_full_access on public.pengiriman_menunggu
  for all to authenticated using (true) with check (true);

revoke all on public.pengiriman_menunggu from anon;

-- ---------------------------------------------------------------------------
-- 3. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_pk    integer;
  v_rls   boolean;
  v_polis integer;
begin
  select count(*) into v_pk
    from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'pengiriman_menunggu'
      and constraint_type = 'PRIMARY KEY';

  if v_pk <> 1 then raise exception 'pengiriman_menunggu wajib punya primary key, dapat %', v_pk; end if;

  select relrowsecurity into v_rls from pg_class where relname = 'pengiriman_menunggu';
  if not v_rls then raise exception 'RLS pengiriman_menunggu belum aktif'; end if;

  select count(*) into v_polis from pg_policies
    where schemaname = 'public' and tablename = 'pengiriman_menunggu';
  if v_polis <> 1 then raise exception 'Policy pengiriman_menunggu diharapkan 1, dapat %', v_polis; end if;

  raise notice 'Migration OK: pengiriman_menunggu siap menampung catatan pengiriman yang belum berkode';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (jalankan hanya jika app rusak setelah migration ini)
-- ---------------------------------------------------------------------------
-- drop table if exists public.pengiriman_menunggu;
