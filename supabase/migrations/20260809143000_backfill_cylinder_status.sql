-- Backfill status tabung yang selama ini NULL -- pendekatan konservatif.
--
-- Latar: 1.632 dari 1.829 tabung tidak punya status. Penyebabnya pencatatan yang
-- tidak dijalankan oleh karyawan lama. Kolom "currentHolder" ternyata masih terisi
-- untuk hampir semuanya, jadi NULL di sini berarti "status tidak pernah diisi",
-- bukan selalu "tabung hilang".
--
-- Sebaran currentHolder untuk baris berstatus NULL:
--     966  nama yang cocok dengan tabel members
--     266  TOKO
--     262  nowhere
--     118  PABRIK
--      21  nama yang tidak cocok dengan members
--       2  kosong
--
-- Yang diisi migration ini HANYA yang tidak ambigu:
--     TOKO            -> 'Available'
--     nowhere/kosong  -> 'Tidak Diketahui'
--
-- Sengaja TIDAK disentuh:
--     966 nama pelanggan -- tidak ada transaksi RENTAL_OUT pendukung (total
--         transaksi cuma 322), jadi menandainya 'Rented' akan mengarang riwayat
--         sewa dan mengacaukan laporan keuangan serta daftar keterlambatan.
--     118 PABRIK dan 21 nama tak dikenal -- perlu verifikasi lapangan dulu.
--
-- Backup sebelum perubahan: oxygne-cylinder-backups/20260809-140937/

-- TOKO -> tersedia di toko
update public.cylinders
set status = 'Available'
where status is null
  and upper(btrim("currentHolder")) = 'TOKO';

-- nowhere / tanpa keterangan -> benar-benar tidak diketahui posisinya
update public.cylinders
set status = 'Tidak Diketahui'
where status is null
  and (
    "currentHolder" is null
    or btrim("currentHolder") in ('', '-')
    or upper(btrim("currentHolder")) = 'NOWHERE'
  );

-- Gagalkan seluruh migration kalau hasilnya di luar dugaan.
do $$
declare
  v_available integer;
  v_unknown   integer;
  v_sisa_null integer;
begin
  select count(*) into v_available from public.cylinders where status = 'Available';
  select count(*) into v_unknown   from public.cylinders where status = 'Tidak Diketahui';
  select count(*) into v_sisa_null from public.cylinders where status is null;

  -- 20 Available sebelumnya + 266 dari TOKO
  if v_available <> 286 then
    raise exception 'Available diharapkan 286, dapat %', v_available;
  end if;

  -- 262 nowhere + 2 kosong
  if v_unknown <> 264 then
    raise exception 'Tidak Diketahui diharapkan 264, dapat %', v_unknown;
  end if;

  -- 1632 - 266 - 264 = 1102 sisa NULL yang sengaja dibiarkan
  if v_sisa_null <> 1102 then
    raise exception 'Sisa NULL diharapkan 1102, dapat %', v_sisa_null;
  end if;

  raise notice 'Backfill OK: Available=%, Tidak Diketahui=%, sisa NULL=%',
    v_available, v_unknown, v_sisa_null;
end $$;
