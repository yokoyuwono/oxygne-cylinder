-- Kosongkan seluruh riwayat transaksi supaya pemilik bisa mulai mencatat dari nol.
--
-- Sistem sudah dipakai sejak Januari 2026 sambil dibangun, jadi 325 baris yang ada
-- bercampur antara data percobaan dan catatan sungguhan yang sudah tidak dipakai
-- lagi. Atas permintaan pemilik seluruhnya dihapus permanen tanpa arsip.
--
-- Yang dihapus (325 baris di public.transactions):
--   RENTAL_OUT    129   sewa / tukar besar
--   REFILL_OUT     91   tabung dikirim ke pabrik
--   REFILL_IN      49   tabung kembali dari pabrik
--   RETURN         29   tabung dikembalikan pelanggan
--   DELIVERY       24   pengiriman
--   GAS_EXCHANGE    1   tukar kecil
--   INCOME          1   uang masuk lepas
--   DEBT_PAYMENT    1   pembayaran utang
--
-- Yang DIPERTAHANKAN -- ini master data, bukan transaksi:
--   members          pelanggan beserta harga khususnya
--   cylinders        tabung berkode, termasuk kolom currentHolder. Catatan siapa
--                    memegang tabung berasal dari opname fisik, bukan turunan
--                    transaksi, jadi menghapusnya di sini justru membuang hasil
--                    pendataan lapangan yang tidak bisa dihitung ulang.
--   opname_tabung    hasil pendataan lapangan
--   rental_tariffs   tarif dan stok curah
--   refill_prices, refill_stations, member_prices

delete from public.transactions;

do $$
declare
  v_tx      integer;
  v_member  integer;
  v_tabung  integer;
  v_pegang  integer;
  v_opname  integer;
begin
  select count(*) into v_tx     from public.transactions;
  select count(*) into v_member from public.members;
  select count(*) into v_tabung from public.cylinders;
  select count(*) into v_pegang from public.cylinders where "currentHolder" is not null;
  select count(*) into v_opname from public.opname_tabung;

  if v_tx     <> 0    then raise exception 'Masih ada % transaksi (harus 0)', v_tx; end if;
  if v_member <  1308 then raise exception 'Pelanggan tinggal % (harus tetap 1308)', v_member; end if;
  if v_tabung <  1805 then raise exception 'Tabung tinggal % (harus tetap 1805)', v_tabung; end if;
  if v_pegang <  1230 then raise exception 'Tabung dipegang tinggal % (harus tetap 1230)', v_pegang; end if;
  if v_opname <  1563 then raise exception 'Opname tinggal % (harus tetap 1563)', v_opname; end if;

  raise notice 'Pembersihan OK: transaksi kosong, master data utuh';
end $$;
