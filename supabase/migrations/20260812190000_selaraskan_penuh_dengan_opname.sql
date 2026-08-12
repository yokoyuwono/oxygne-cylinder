-- Selaraskan seluruh status tabung dengan opname, tanpa pengecualian.
--
-- Penerapan sebelumnya (20260812150000) sengaja hanya menyentuh tabung berstatus
-- NULL/Unknown, karena saat itu belum jelas mana yang lebih benar: buku opname atau
-- status yang lahir dari transaksi aplikasi. Pemilik toko sudah menegaskan bahwa
-- berkas opname adalah data terbaru, jadi buku yang menang -- termasuk untuk 5 tabung
-- yang transaksi aplikasinya justru LEBIH BARU dari catatan buku (mis. M-0338:
-- transaksi 2026-08-06 vs buku 2026-01-18). Kelimanya ditimpa dengan sengaja, bukan
-- terlewat.
--
-- Riwayat transaksinya TIDAK disentuh; yang diselaraskan hanya kolom status,
-- currentHolder, dan lastLocation pada tabel cylinders.
--
-- ---------------------------------------------------------------------------
-- 82 tabung dua pemegang
-- ---------------------------------------------------------------------------
--
-- Buku memuat sebagian tabung dua kali dengan pemegang berbeda, jadi "ikuti buku"
-- saja tidak cukup -- pertentangannya ada DI DALAM buku itu sendiri. Diputuskan lebih
-- dulu di luar migration ini lalu dimuat ke opname_tabung, dengan aturan:
--
--   78 baris -> tanggal paling baru menang
--    2 baris -> hanya satu yang bertanggal; yang bertanggal menang
--    2 baris -> tanggalnya seri; baris yang letaknya lebih bawah di berkas menang
--
-- Dua yang terakhir itu ASUMSI, bukan fakta: baris yang ditulis belakangan dianggap
-- catatan yang lebih baru. Tidak ada pembeda lain yang tersedia.

-- ---------------------------------------------------------------------------
-- 1. Pelanggan yang tersisa
--
-- SAFI'I,DAWUNG didaftarkan sebagai pelanggan tersendiri. Ada kemiripan dengan
-- SAFI'I,DAWUHAN yang sudah terdaftar dan bisa jadi ini salah ketik, tapi buku memuat
-- keduanya dan buku yang jadi acuan. Kalau ternyata orangnya sama, penggabungannya
-- gampang menyusul: pindahkan tabungnya, hapus satu baris pelanggan.
-- ---------------------------------------------------------------------------

insert into public.members (id, name, "companyName", address, phone, ktp, "totalDeposit", "totalDebt", "joinDate", status)
values ('m-opname-17','SAFI''I,DAWUNG','SAFI''I,DAWUNG','-','-',null,0,0,'-','Active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Tabung yang ada di buku tapi belum ada di database
--
-- Jenis gas dan ukuran diturunkan dari prefiks, bukan ditebak: pemetaannya konsisten
-- 100% di seluruh armada (C2H2 -> Acetylene, R/SL/YK -> Oxygen, semuanya 6m3).
-- Blok pemeriksaan di bawah menolak kalau ada prefiks di luar keempat itu.
-- ---------------------------------------------------------------------------

insert into public.cylinders (id, "serialCode", "gasType", size, status, "currentHolder", "lastLocation")
select 'c-opname-' || o.prefiks || '-' || o.nomor,
       o.prefiks || '-' || o.nomor,
       case when o.prefiks = 'C2H2' then 'Acetylene (C2H2)' else 'Oxygen' end,
       '6m3',
       case o.lokasi when 'TOKO' then 'Available' when 'PABRIK' then 'Refilling' else 'Rented' end,
       case when o.lokasi in ('TOKO','PABRIK') then null else m.id end,
       case o.lokasi when 'TOKO' then 'Gudang Utama' when 'PABRIK' then 'Vendor Isi Ulang' else m."companyName" end
from public.opname_tabung o
left join public.members m
  on upper(regexp_replace(m."companyName",'\s+',' ','g')) = o.lokasi
where not exists (
  select 1 from public.cylinders c
  where upper(split_part(c."serialCode",'-',1)) = o.prefiks
    and nullif(regexp_replace(split_part(c."serialCode",'-',2),'\D','','g'),'')::bigint = o.nomor
)
and (o.lokasi in ('TOKO','PABRIK') or m.id is not null);

-- ---------------------------------------------------------------------------
-- 3. Selaraskan seluruh tabung yang ada di buku
--
-- Tanpa saringan status kali ini. Tabung yang pemegangnya belum terdaftar tetap
-- dilewati -- mengisi 'Rented' tanpa currentHolder membuatnya tercatat disewa tapi
-- tidak bisa ditelusuri ke siapa pun.
-- ---------------------------------------------------------------------------

with m as (select id, "companyName", upper(regexp_replace("companyName",'\s+',' ','g')) as nama from public.members),
sasaran as (
  select c.id as cyl_id, o.lokasi, m.id as member_id, m."companyName"
  from public.cylinders c
  join public.opname_tabung o
    on o.prefiks = upper(split_part(c."serialCode",'-',1))
   and o.nomor  = nullif(regexp_replace(split_part(c."serialCode",'-',2),'\D','','g'),'')::bigint
  left join m on m.nama = o.lokasi
  where o.lokasi in ('TOKO','PABRIK') or m.id is not null
)
update public.cylinders c
set status = case s.lokasi when 'TOKO'   then 'Available'
                           when 'PABRIK' then 'Refilling'
                           else 'Rented' end,
    "currentHolder" = case when s.lokasi in ('TOKO','PABRIK') then null else s.member_id end,
    "lastLocation"  = case s.lokasi when 'TOKO'   then 'Gudang Utama'
                                    when 'PABRIK' then 'Vendor Isi Ulang'
                                    else s."companyName" end
from sasaran s
where c.id = s.cyl_id;

-- ---------------------------------------------------------------------------
-- 4. DIDIK,KALIREJO
--
-- Baru muncul sebagai pemegang setelah 82 bentrokan diputuskan: tabung M-1457
-- termasuk yang bentrok, jadi namanya tidak ikut terhitung waktu pelanggan tak
-- dikenal didata di migration 20260812170000.
-- ---------------------------------------------------------------------------

insert into public.members (id, name, "companyName", address, phone, ktp, "totalDeposit", "totalDebt", "joinDate", status)
values ('m-opname-18','DIDIK,KALIREJO','DIDIK,KALIREJO','-','-',null,0,0,'-','Active')
on conflict (id) do nothing;

update public.cylinders
set status = 'Rented', "currentHolder" = 'm-opname-18', "lastLocation" = 'DIDIK,KALIREJO'
where "serialCode" = 'M-1457';

-- ---------------------------------------------------------------------------
-- Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare v_total integer; v_null integer; v_prefiks_asing integer; v_di_buku_kosong integer;
        v_disewa_tanpa_pemegang integer; v_tersedia_ada_pemegang integer; v_bukan_id integer;
begin
  select count(*) into v_prefiks_asing from public.cylinders
   where id like 'c-opname-%'
     and upper(split_part("serialCode",'-',1)) not in ('C2H2','R','SL','YK');
  if v_prefiks_asing <> 0 then
    raise exception 'Ada % tabung baru berprefiks di luar C2H2/R/SL/YK', v_prefiks_asing;
  end if;

  select count(*) into v_disewa_tanpa_pemegang from public.cylinders
   where status = 'Rented' and ("currentHolder" is null or btrim("currentHolder") = '');
  if v_disewa_tanpa_pemegang <> 0 then
    raise exception 'Ada % tabung Rented tanpa pemegang', v_disewa_tanpa_pemegang;
  end if;

  select count(*) into v_tersedia_ada_pemegang from public.cylinders
   where status in ('Available','Refilling') and "currentHolder" is not null and btrim("currentHolder") <> '';
  if v_tersedia_ada_pemegang <> 0 then
    raise exception 'Ada % tabung tersedia/di-vendor yang masih tercatat dipegang', v_tersedia_ada_pemegang;
  end if;

  select count(*) into v_bukan_id from public.cylinders c
   where c."currentHolder" is not null and btrim(c."currentHolder") <> ''
     and not exists (select 1 from public.members m where m.id = c."currentHolder");
  if v_bukan_id <> 0 then
    raise exception 'Ada % currentHolder yang bukan ID pelanggan', v_bukan_id;
  end if;

  select count(*) into v_di_buku_kosong
  from public.cylinders c
  join public.opname_tabung o
    on o.prefiks = upper(split_part(c."serialCode",'-',1))
   and o.nomor  = nullif(regexp_replace(split_part(c."serialCode",'-',2),'\D','','g'),'')::bigint
  where c.status is null or c.status = 'Unknown';
  if v_di_buku_kosong <> 0 then
    raise exception 'Ada % tabung yang tercatat di buku tapi masih tanpa status', v_di_buku_kosong;
  end if;

  select count(*), count(*) filter (where status is null) into v_total, v_null from public.cylinders;

  -- 229 tabung yang TIDAK tercatat di buku tetap tanpa status; itu bukan kegagalan
  -- impor, melainkan memang tidak ada datanya.
  raise notice 'Selaras: total tabung %, status kosong tersisa % (semuanya di luar buku)', v_total, v_null;
end $$;
