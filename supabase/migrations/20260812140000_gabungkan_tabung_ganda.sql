-- Gabungkan tabung ganda: satu tabung fisik tercatat dua baris karena padding nol
-- tidak konsisten (M-0162 dan M-162), sebagian dengan status berbeda pula.
--
-- Akibatnya jumlah armada menggelembung dan satu tabung bisa 'Rented' di satu baris
-- sekaligus 'Unknown' di baris lain. Ini juga menghalangi impor data lokasi tabung
-- dari berkas opname: pemegangnya mau ditempel ke baris yang mana.
--
-- 56 grup, semuanya berpasangan dua. Dasar pemilihan baris yang disimpan, berurutan:
--
--   1. Punya transaksi, pasangannya tidak (10 grup). Menghapus baris yang dirujuk
--      riwayat akan memutus jejak sewa.
--   2. Satu-satunya yang berstatus nyata, bukan NULL/Unknown (4 grup).
--   3. Bentuk penulisan nomornya dipakai berkas opname pada baris yang ADA isinya
--      (34 grup). Contoh: opname menulis 'M,0014' berisi pemegang, sedangkan 'M,14'
--      kosong melompong -- jadi M-0014 yang nyata.
--   4. Tidak ada pembeda sama sekali: keduanya NULL, tanpa transaksi, dan opname
--      tidak menegaskan bentuk nomornya (8 grup). Di sini diambil baris warisan
--      (id lama). Ini memang pilihan sewenang-wenang; secara data keduanya setara.
--
-- Baris yang dibuang disalin ke cylinders_ganda_dihapus lengkap dengan alasan dan
-- tujuan penggabungannya, jadi keputusan ini bisa ditinjau ulang atau dibalik.
--
-- Hasil: 1829 -> 1773 tabung, 0 grup ganda tersisa, 0 transaksi yatim.

create table if not exists public.cylinders_ganda_dihapus (
  id            text,
  "serialCode"  text,
  "gasType"     text,
  size          text,
  status        text,
  "currentHolder" text,
  "lastLocation"  text,
  "digabungKe"  text,
  alasan        text,
  "dihapusPada" timestamptz default now()
);

alter table public.cylinders_ganda_dihapus enable row level security;
drop policy if exists cylinders_ganda_dihapus_baca on public.cylinders_ganda_dihapus;
create policy cylinders_ganda_dihapus_baca on public.cylinders_ganda_dihapus
  for all to authenticated using (true) with check (true);

create temporary table pasangan(buang_id text, simpan_id text, alasan text) on commit drop;
insert into pasangan values
  ('c-1767575881183','1652','bentuk nomornya dipakai CSV (C2H2-001)'),
  ('1810','c-1767348305835','punya 1 transaksi'),
  ('1293','1053','bentuk nomornya dipakai CSV (M-0014)'),
  ('1478','1058','bentuk nomornya dipakai CSV (M-0042)'),
  ('1483','1061','bentuk nomornya dipakai CSV (M-0058)'),
  ('1491','1066','bentuk nomornya dipakai CSV (M-0070)'),
  ('1492','1067','bentuk nomornya dipakai CSV (M-0073)'),
  ('1270','1074','bentuk nomornya dipakai CSV (M-0130)'),
  ('1323','1077','bentuk nomornya dipakai CSV (M-0149)'),
  ('1333','1078','tidak ada pembeda; ambil baris warisan'),
  ('1342','1080','punya 3 transaksi'),
  ('1471','1087','bentuk nomornya dipakai CSV (M-0203)'),
  ('1096','1472','satu-satunya berstatus nyata (Available)'),
  ('1473','1100','bentuk nomornya dipakai CSV (M-0271)'),
  ('1474','1102','bentuk nomornya dipakai CSV (M-0282)'),
  ('1475','1104','bentuk nomornya dipakai CSV (M-0288)'),
  ('1476','1107','punya 1 transaksi'),
  ('1117','1477','satu-satunya berstatus nyata (Available)'),
  ('1479','1125','bentuk nomornya dipakai CSV (M-0430)'),
  ('1480','1127','bentuk nomornya dipakai CSV (M-0437)'),
  ('1481','1134','tidak ada pembeda; ambil baris warisan'),
  ('1482','1143','tidak ada pembeda; ambil baris warisan'),
  ('1484','1148','bentuk nomornya dipakai CSV (M-0581)'),
  ('1485','1149','bentuk nomornya dipakai CSV (M-0603)'),
  ('1486','1150','bentuk nomornya dipakai CSV (M-0618)'),
  ('1487','1152','punya 1 transaksi'),
  ('1488','1157','bentuk nomornya dipakai CSV (M-0669)'),
  ('1489','1159','punya 1 transaksi'),
  ('1490','1161','bentuk nomornya dipakai CSV (M-0677)'),
  ('1493','1172','bentuk nomornya dipakai CSV (M-0752)'),
  ('1494','1174','bentuk nomornya dipakai CSV (M-0775)'),
  ('1495','1179','punya 5 transaksi'),
  ('1496','1182','bentuk nomornya dipakai CSV (M-0830)'),
  ('1497','1183','bentuk nomornya dipakai CSV (M-0833)'),
  ('1498','1185','bentuk nomornya dipakai CSV (M-0836)'),
  ('1499','1194','bentuk nomornya dipakai CSV (M-0880)'),
  ('1500','1195','bentuk nomornya dipakai CSV (M-0891)'),
  ('1501','1197','bentuk nomornya dipakai CSV (M-0901)'),
  ('1502','1198','bentuk nomornya dipakai CSV (M-0905)'),
  ('1503','1199','bentuk nomornya dipakai CSV (M-0909)'),
  ('1504','1204','bentuk nomornya dipakai CSV (M-0939)'),
  ('1300','c-1767346044672','punya 1 transaksi'),
  ('1359','c-1767348917949','punya 5 transaksi'),
  ('825','771','bentuk nomornya dipakai CSV (R-0128)'),
  ('775','742','satu-satunya berstatus nyata (Available)'),
  ('776','743','bentuk nomornya dipakai CSV (R-231)'),
  ('744','1871','satu-satunya berstatus nyata (Empty (Needs Refill))'),
  ('46','39','bentuk nomornya dipakai CSV (YK-002)'),
  ('53','40','tidak ada pembeda; ambil baris warisan'),
  ('58','41','tidak ada pembeda; ambil baris warisan'),
  ('431','1715','punya 3 transaksi'),
  ('47','134','tidak ada pembeda; ambil baris warisan'),
  ('51','166','tidak ada pembeda; ambil baris warisan'),
  ('408','407','bentuk nomornya dipakai CSV (YK-508)'),
  ('56','28','tidak ada pembeda; ambil baris warisan'),
  ('1631','c-1767345913939','punya 4 transaksi');

-- Pengaman: kalau ternyata ada transaksi menunjuk baris yang dibuang, pindahkan dulu
-- ke baris yang disimpan supaya riwayatnya tidak terputus. Pemeriksaan menunjukkan
-- tidak ada, tapi pengamannya tetap dipasang -- yang mahal bukan perintah ini,
-- melainkan riwayat sewa yang hilang diam-diam.
update public.transactions t
set "cylinderId" = p.simpan_id
from pasangan p
where t."cylinderId" = p.buang_id;

insert into public.cylinders_ganda_dihapus
  (id, "serialCode", "gasType", size, status, "currentHolder", "lastLocation", "digabungKe", alasan)
select c.id, c."serialCode", c."gasType", c.size, c.status, c."currentHolder", c."lastLocation",
       p.simpan_id, p.alasan
from public.cylinders c join pasangan p on p.buang_id = c.id;

delete from public.cylinders c using pasangan p where c.id = p.buang_id;

-- ---------------------------------------------------------------------------
-- Pemeriksaan: gagal di sini membatalkan seluruh migration.
-- ---------------------------------------------------------------------------

do $$
declare v_sisa integer; v_total integer; v_arsip integer;
begin
  select count(*) into v_sisa from (
    select 1 from public.cylinders
    where nullif(regexp_replace(split_part("serialCode",'-',2), '\D','','g'), '') is not null
    group by upper(split_part("serialCode",'-',1)),
             nullif(regexp_replace(split_part("serialCode",'-',2), '\D','','g'), '')::bigint
    having count(*) > 1
  ) x;

  select count(*) into v_total from public.cylinders;
  select count(*) into v_arsip from public.cylinders_ganda_dihapus;

  if v_sisa  <> 0    then raise exception 'Masih ada % grup tabung ganda', v_sisa; end if;
  if v_arsip <> 56   then raise exception 'Arsip diharapkan 56 baris, dapat %', v_arsip; end if;
  if v_total <> 1773 then raise exception 'Total tabung diharapkan 1773, dapat %', v_total; end if;

  raise notice 'Penggabungan OK: total tabung %, diarsipkan %', v_total, v_arsip;
end $$;
