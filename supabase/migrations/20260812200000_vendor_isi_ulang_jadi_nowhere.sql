-- ---------------------------------------------------------------------------
-- Ubah semua lokasi tabung 'Vendor Isi Ulang' menjadi 'nowhere'.
-- Status tabung tidak diubah (tetap 'Refilling' dsb).
-- ---------------------------------------------------------------------------

update public.cylinders
set "lastLocation" = 'nowhere'
where "lastLocation" = 'Vendor Isi Ulang';

do $$
declare v_sisa integer;
begin
  select count(*) into v_sisa
  from public.cylinders
  where "lastLocation" = 'Vendor Isi Ulang';

  if v_sisa > 0 then
    raise exception 'Masih ada % tabung berlokasi Vendor Isi Ulang', v_sisa;
  end if;
end $$;
