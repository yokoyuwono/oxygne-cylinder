-- Seragamkan nilai status 'Tidak Diketahui' menjadi 'Unknown'.
--
-- Saat backfill sebelumnya, status baru ini ditulis dalam bahasa Indonesia
-- sehingga jadi satu-satunya nilai non-Inggris di kolom cylinders.status.
-- Sekarang seluruh label tampilan diterjemahkan lewat labels.ts, jadi nilai yang
-- tersimpan dikembalikan konsisten berbahasa Inggris. Tampilannya di layar tetap
-- "Tidak Diketahui".
--
-- Migration ini harus diterapkan bersamaan dengan perubahan types.ts
-- (CylinderStatus.Unknown = 'Unknown'); kalau kode lebih dulu, 264 tabung tidak
-- akan cocok dengan nilai enum mana pun.

update public.cylinders
set status = 'Unknown'
where status = 'Tidak Diketahui';

do $$
declare
  v_unknown integer;
  v_lama    integer;
  v_total   integer;
begin
  select count(*) into v_unknown from public.cylinders where status = 'Unknown';
  select count(*) into v_lama    from public.cylinders where status = 'Tidak Diketahui';
  select count(*) into v_total   from public.cylinders;

  if v_unknown <> 264 then
    raise exception 'Unknown diharapkan 264, dapat %', v_unknown;
  end if;

  if v_lama <> 0 then
    raise exception 'Masih ada % baris bernilai Tidak Diketahui', v_lama;
  end if;

  if v_total <> 1829 then
    raise exception 'Total tabung diharapkan 1829, dapat %', v_total;
  end if;

  raise notice 'Normalisasi OK: Unknown=%, total=%', v_unknown, v_total;
end $$;
