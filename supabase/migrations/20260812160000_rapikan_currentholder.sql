-- Rapikan cylinders.currentHolder: harus berisi ID pelanggan, bukan nama.
--
-- Perhitungan barang di tangan pelanggan (hitungSemuaHolding di lib/memberExit.ts)
-- mencocokkan currentHolder dengan ID. Baris yang berisi nama tidak pernah terhitung,
-- sehingga tabungnya tidak muncul saat pelanggan hendak keluar -- depositnya bisa
-- dicairkan padahal tabungnya masih di luar. Itu kerugian uang, bukan sekadar
-- tampilan yang keliru.
--
-- Sumbernya App.tsx handleNewRental yang menulis member.name; diperbaiki di commit
-- yang sama dengan migration ini. Di sini akibatnya yang dibereskan.
--
-- Dari 1.582 baris yang terisi: 963 sudah ID yang sah, 619 tidak. Yang 619:
--   * 136 nama yang cocok dengan companyName -> dikonversi jadi ID
--   * 269 bernilai 'TOKO'    -> dikosongkan; toko bukan pelanggan
--   * 209 bernilai 'nowhere' -> dikosongkan; nilai sampah
--   *   5 nama pelanggan yang memang BELUM terdaftar -> DIBIARKAN
--
-- Lima baris terakhir sengaja tidak disentuh. Statusnya NULL sehingga tidak ikut
-- hitungan mana pun, dan namanya satu-satunya petunjuk tabung itu ada di siapa.
-- Mengosongkannya berarti membuang informasi demi kerapian.

-- 1. Nama -> ID
update public.cylinders c
set "currentHolder" = m.id
from public.members m
where upper(regexp_replace(m."companyName",'\s+',' ','g')) = upper(regexp_replace(c."currentHolder",'\s+',' ','g'))
  and c."currentHolder" is not null
  and btrim(c."currentHolder") <> ''
  and not exists (select 1 from public.members x where x.id = c."currentHolder");

-- 2. Penanda lokasi yang tersamar sebagai pemegang
update public.cylinders
set "currentHolder" = null
where "currentHolder" in ('TOKO', 'nowhere');

-- 3. Kosongkan juga yang jelas tidak sedang dipegang siapa pun
update public.cylinders
set "currentHolder" = null
where status in ('Available', 'Refilling')
  and "currentHolder" is not null;

do $$
declare v_bukan_id integer; v_sisa_nama integer;
begin
  select count(*) into v_bukan_id
  from public.cylinders c
  where c."currentHolder" is not null and btrim(c."currentHolder") <> ''
    and not exists (select 1 from public.members m where m.id = c."currentHolder");

  select count(*) into v_sisa_nama
  from public.cylinders c
  where c."currentHolder" is not null and btrim(c."currentHolder") <> ''
    and not exists (select 1 from public.members m where m.id = c."currentHolder")
    and exists (select 1 from public.members m
                where upper(regexp_replace(m."companyName",'\s+',' ','g')) = upper(regexp_replace(c."currentHolder",'\s+',' ','g')));

  if v_sisa_nama <> 0 then
    raise exception 'Masih ada % nama yang seharusnya bisa dikonversi jadi ID', v_sisa_nama;
  end if;

  if v_bukan_id > 5 then
    raise exception 'Sisa currentHolder bukan-ID diharapkan <= 5 (pelanggan belum terdaftar), dapat %', v_bukan_id;
  end if;

  raise notice 'currentHolder rapi: sisa bukan-ID % (pelanggan belum terdaftar)', v_bukan_id;
end $$;
