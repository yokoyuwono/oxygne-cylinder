-- Pisahkan tabung berkode dari stok curah tanpa kode.
--
-- Sistem semula memodelkan setiap tabung sebagai aset bernama: satu baris
-- cylinders = satu barang fisik berkode. Itu benar untuk 6m3 karena kodenya
-- tertera di tabungnya. Tabung oksigen 1m3 tidak berkode -- barangnya saling
-- gantikan dan siapa pun boleh menukar isinya, jadi memaksakan model aset ke
-- sana hanya menghasilkan kode karangan seperti '1M3 01' yang tidak bisa
-- dicocokkan staf dengan barang fisik mana pun.
--
-- Ukuran tanpa kode kini dilacak sebagai JUMLAH pada baris tarifnya sendiri,
-- bukan sebagai baris-baris cylinders.
--
-- Catatan penting soal arti stockQty: ini jumlah KEPEMILIKAN, bukan kesiapan.
-- Tukar isi tidak menggerakkannya sama sekali (botol masuk satu, keluar satu);
-- yang menggerakkan hanya botol yang pergi atau kembali permanen.
--
-- Botol yang sedang dipegang pelanggan sengaja TIDAK disimpan sebagai kolom
-- tersendiri, melainkan dihitung dari selisih RENTAL_OUT dikurangi RETURN.
-- Angka turunan tidak bisa melenceng dari sumbernya.

-- ---------------------------------------------------------------------------
-- 1. Master data: penanda berkode dan jumlah stok
-- ---------------------------------------------------------------------------

alter table public.rental_tariffs add column if not exists "isCoded"  boolean not null default true;
alter table public.rental_tariffs add column if not exists "stockQty" integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Transaksi: jumlah dan ukuran
--
-- Baris curah tidak punya cylinderId, jadi ukurannya harus tersimpan langsung
-- supaya laporan tetap bisa mengelompokkannya.
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists quantity integer;
alter table public.transactions add column if not exists size     text;

-- ---------------------------------------------------------------------------
-- 3. Oxygen 1m3 jadi stok curah
--
-- stockQty sengaja 0: jumlah botol yang sebenarnya dimiliki toko tidak diketahui
-- dan tidak boleh dikarang. Pemilik mengisinya lewat halaman Master Data.
-- ---------------------------------------------------------------------------

update public.rental_tariffs
set "isCoded" = false, "stockQty" = 0
where kind = 'CYLINDER' and "gasType" = 'Oxygen' and size = '1m3';

-- ---------------------------------------------------------------------------
-- 4. Konversi data trial
--
-- Sewa Ade Novansyah nyata dan nilainya benar (sewa 250rb + gas 50rb = 300rb,
-- deposit 250rb). Yang keliru hanya bentuk pencatatannya: sistem memaksa
-- membuat tabung berkode '1M3 01' untuk botol yang tidak berkode.
--
-- Nilai uang tidak disentuh sama sekali. Yang berubah hanya bentuknya, dari
-- baris beraset menjadi baris curah berjumlah.
-- ---------------------------------------------------------------------------

update public.transactions
set "cylinderId" = null, quantity = 1, size = '1m3'
where id = 't-new-1786331171448-0';

delete from public.cylinders where id = 'c-1786331033258';

-- KTP Ade berisi '081359203960', sama persis dengan kolom phone -- nomor
-- teleponnya, bukan nomor identitas. Dikosongkan supaya diisi ulang dengan
-- benar; menebak nomor identitas lebih buruk daripada membiarkannya kosong.
update public.members set ktp = null where id = 'm-1786331169504';

-- ---------------------------------------------------------------------------
-- 5. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_tabung   integer;
  v_1m3_row  integer;
  v_tarif    integer;
  v_tx_qty   integer;
  v_ktp      integer;
  v_deposit  numeric;
begin
  select count(*) into v_tabung  from public.cylinders;
  select count(*) into v_1m3_row from public.cylinders where size = '1m3';
  select count(*) into v_tarif   from public.rental_tariffs
    where "gasType" = 'Oxygen' and size = '1m3' and "isCoded" = false;
  select count(*) into v_tx_qty  from public.transactions
    where id = 't-new-1786331171448-0' and quantity = 1 and size = '1m3' and "cylinderId" is null;
  select count(*) into v_ktp     from public.members where id = 'm-1786331169504' and ktp is null;
  select "totalDeposit" into v_deposit from public.members where id = 'm-1786331169504';

  if v_tabung  <> 1829 then raise exception 'Tabung diharapkan 1829, dapat %', v_tabung; end if;
  if v_1m3_row <> 0    then raise exception 'Masih ada % baris cylinders berukuran 1m3', v_1m3_row; end if;
  if v_tarif   <> 1    then raise exception 'Tarif Oxygen 1m3 tanpa kode tidak ditemukan'; end if;
  if v_tx_qty  <> 1    then raise exception 'Transaksi trial belum terkonversi jadi baris curah'; end if;
  if v_ktp     <> 1    then raise exception 'KTP trial belum dikosongkan'; end if;
  if v_deposit <> 250000 then raise exception 'Deposit Ade berubah jadi % (harus tetap 250000)', v_deposit; end if;

  raise notice 'Migration OK: % tabung berkode, Oxygen 1m3 jadi stok curah, deposit utuh', v_tabung;
end $$;
