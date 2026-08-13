-- Nol-kan sisa bon yang tidak lagi punya transaksi pendukung.
--
-- Lanjutan dari 20260813090000_hapus_semua_transaksi: seluruh riwayat transaksi
-- dihapus, tapi members.totalDebt adalah kolom tersimpan yang tidak ikut terhapus.
-- Yang tertinggal adalah tiga angka bon tanpa asal-usul -- muncul di Beranda dan
-- halaman Bon Pelanggan sebagai tagihan, padahal tagihannya sudah tidak ada.
--
--   207  CV RIKO,KENDALREJO      Rp 200.000
--   238  DIAH,JABUNG             Rp 130.000
--   910  SUHARIANTO,MANDESAN     Rp 100.000
--
-- Bon yang benar-benar masih berjalan dicatat ulang lewat tombol Tambah Bon di
-- halaman Bon Pelanggan, sehingga tiap angka punya baris transaksi dan tanggal.
--
-- members.totalDeposit sengaja tidak disentuh: pemilik belum memutuskan soal itu.

update public.members set "totalDebt" = 0 where "totalDebt" > 0;

do $$
declare
  v_berbon  integer;
  v_member  integer;
begin
  select count(*) into v_berbon from public.members where "totalDebt" > 0;
  select count(*) into v_member from public.members;

  if v_berbon <> 0    then raise exception 'Masih ada % pelanggan berbon (harus 0)', v_berbon; end if;
  if v_member <  1308 then raise exception 'Pelanggan tinggal % (harus tetap 1308)', v_member; end if;

  raise notice 'Bon sisa sudah nol, data pelanggan utuh';
end $$;
