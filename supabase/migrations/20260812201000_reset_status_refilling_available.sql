-- ---------------------------------------------------------------------------
-- 1. Semua tabung berstatus 'Sedang Diisi' (Refilling) -> 'Tidak Diketahui'
--    (Unknown). Lokasi dibiarkan apa adanya.
-- 2. Semua tabung berstatus 'Tersedia' (Available)     -> 'Tidak Diketahui'
--    (Unknown) sekaligus lokasinya jadi 'nowhere'.
-- Nilai yang tersimpan di DB memakai enum bahasa Inggris; label Indonesia
-- hanya dipakai di UI (lihat labels.ts).
-- ---------------------------------------------------------------------------

update public.cylinders
set status = 'Unknown'
where status = 'Refilling';

update public.cylinders
set status = 'Unknown',
    "lastLocation" = 'nowhere'
where status = 'Available';

do $$
declare v_sisa integer;
begin
  select count(*) into v_sisa
  from public.cylinders
  where status in ('Refilling', 'Available');

  if v_sisa > 0 then
    raise exception 'Masih ada % tabung berstatus Refilling/Available', v_sisa;
  end if;
end $$;
