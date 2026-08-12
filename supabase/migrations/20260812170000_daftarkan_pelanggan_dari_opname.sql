-- Daftarkan pelanggan yang muncul di opname tapi belum ada di data pelanggan,
-- lalu tempelkan tabung yang mereka pegang.
--
-- Bentuk barisnya mengikuti 1.290 pelanggan yang sudah ada apa adanya: name dan
-- companyName sama persis ("NAMA,DESA"), address dan phone '-', ktp kosong,
-- joinDate '-'.
--
-- joinDate sengaja TIDAK diisi tanggal opname. Tanggal itu menandai kapan tabungnya
-- keluar, bukan kapan orangnya jadi pelanggan; menuliskannya sebagai tanggal
-- bergabung berarti mengarang fakta yang tidak diketahui. '-' jujur: tidak tahu.
--
-- ---------------------------------------------------------------------------
-- Yang sengaja TIDAK didaftarkan
-- ---------------------------------------------------------------------------
--
-- 'SAFI''I,DAWUNG'. Sudah ada pelanggan 'SAFI''I,DAWUHAN' dan keduanya beda satu-dua
-- huruf. Buku opname memang memuat keduanya, tapi buku itu sendiri bisa salah ketik --
-- data pelanggan yang ada pun sudah memuat pasangan mirip seperti 'AGUNG,GLEDUNG' vs
-- 'AGUNG,GLEDUG'. Menebak salah berarti membuat pelanggan kembar, dan untuk satu
-- tabung itu tidak sepadan. Diserahkan ke pemilik toko.
--
-- Nama depan yang sama BUKAN pertanda kembar: 'AGUS' muncul 37 kali dengan desa
-- berbeda, dan desanya itulah yang membedakan orangnya.

insert into public.members (id, name, "companyName", address, phone, ktp, "totalDeposit", "totalDebt", "joinDate", status)
values
  ('m-opname-01','ACHMAD ZAMZANI,KROMASAN','ACHMAD ZAMZANI,KROMASAN','-','-',null,0,0,'-','Active'),
  ('m-opname-02','AGUNG,BRINTIK','AGUNG,BRINTIK','-','-',null,0,0,'-','Active'),
  ('m-opname-03','AGUS,GLAGAH OMBO','AGUS,GLAGAH OMBO','-','-',null,0,0,'-','Active'),
  ('m-opname-04','AMINULLOH,KEDUNGBUNDER','AMINULLOH,KEDUNGBUNDER','-','-',null,0,0,'-','Active'),
  ('m-opname-05','AZIZ,SLUMBUNG','AZIZ,SLUMBUNG','-','-',null,0,0,'-','Active'),
  ('m-opname-06','DODIK,SIRAMAN','DODIK,SIRAMAN','-','-',null,0,0,'-','Active'),
  ('m-opname-07','HANAFI,TEGALREJO','HANAFI,TEGALREJO','-','-',null,0,0,'-','Active'),
  ('m-opname-08','HARI,SELOPURO','HARI,SELOPURO','-','-',null,0,0,'-','Active'),
  ('m-opname-09','HENDRA WIDYANDRI,BERU','HENDRA WIDYANDRI,BERU','-','-',null,0,0,'-','Active'),
  ('m-opname-10','ILLING,TALUN','ILLING,TALUN','-','-',null,0,0,'-','Active'),
  ('m-opname-11','JOKO,TUMPUK','JOKO,TUMPUK','-','-',null,0,0,'-','Active'),
  ('m-opname-12','LAILIL,BAJANG','LAILIL,BAJANG','-','-',null,0,0,'-','Active'),
  ('m-opname-13','MSA,GANDUSARI','MSA,GANDUSARI','-','-',null,0,0,'-','Active'),
  ('m-opname-14','MUKLISON,JAMBEWANGI','MUKLISON,JAMBEWANGI','-','-',null,0,0,'-','Active'),
  ('m-opname-15','NDARI,PJKA','NDARI,PJKA','-','-',null,0,0,'-','Active'),
  ('m-opname-16','YAMAGUNG,KENDALREJO','YAMAGUNG,KENDALREJO','-','-',null,0,0,'-','Active')
on conflict (id) do nothing;

-- Tempelkan tabungnya. Syaratnya sama dengan penerapan opname sebelumnya: hanya
-- menyentuh tabung berstatus NULL atau 'Unknown', supaya status yang lahir dari
-- transaksi tercatat tidak ikut tertimpa. Karena itu 7 tabung milik nama-nama ini
-- TIDAK ikut tertempel -- statusnya sudah nyata dan berbeda dari opname, 5 di
-- antaranya punya riwayat transaksi. Mereka masuk kelompok 130 yang ditinjau
-- terpisah, bukan yang terlewat.
with o as (select * from public.opname_tabung),
m as (select id, "companyName", upper(regexp_replace("companyName",'\s+',' ','g')) as nama from public.members),
sasaran as (
  select c.id as cyl_id, m.id as member_id, m."companyName"
  from public.cylinders c
  join o on o.prefiks = upper(split_part(c."serialCode",'-',1))
        and o.nomor  = nullif(regexp_replace(split_part(c."serialCode",'-',2),'\D','','g'),'')::bigint
  join m on m.nama = o.lokasi
  where (c.status is null or c.status = 'Unknown')
    and o.lokasi not in ('TOKO','PABRIK')
)
update public.cylinders c
set status = 'Rented',
    "currentHolder" = s.member_id,
    "lastLocation"  = s."companyName"
from sasaran s
where c.id = s.cyl_id;

do $$
declare v_pelanggan integer; v_tabung integer; v_bukan_id integer;
begin
  select count(*) into v_pelanggan from public.members where id like 'm-opname-%';
  select count(*) into v_tabung    from public.cylinders where "currentHolder" like 'm-opname-%';

  select count(*) into v_bukan_id from public.cylinders c
  where c."currentHolder" is not null and btrim(c."currentHolder") <> ''
    and not exists (select 1 from public.members m where m.id = c."currentHolder");

  if v_pelanggan <> 16 then raise exception 'Pelanggan baru diharapkan 16, dapat %', v_pelanggan; end if;
  if v_bukan_id  >  1  then raise exception 'Sisa currentHolder bukan-ID diharapkan <= 1, dapat %', v_bukan_id; end if;

  raise notice 'Pelanggan baru %, tabung tertempel %, sisa bukan-ID % (SAFI''I,DAWUNG)', v_pelanggan, v_tabung, v_bukan_id;
end $$;
