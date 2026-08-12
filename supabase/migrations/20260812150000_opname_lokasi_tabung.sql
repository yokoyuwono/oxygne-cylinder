-- Opname lokasi tabung, Agustus 2026.
--
-- Sebelum ini 1.102 dari 1.829 tabung -- 60% armada -- berstatus NULL. Baris itu
-- ikut dihitung sebagai "Total Tabung" dan masuk penyebut rumus utilisasi, tapi
-- tidak muncul di kotak status mana pun, sehingga Pemakaian di Dashboard terbaca
-- ~4% padahal tabung yang benar-benar terlacak cuma 463.
--
-- Sumbernya berkas "Lokasi Tabung - LOKASI.csv" dari catatan toko: 1.968 baris,
-- 1.852 nomor tabung, 488 nama pemegang. Nama pemegangnya cocok dengan
-- members.companyName tanpa perlu dicocokkan manual.
--
-- ---------------------------------------------------------------------------
-- Yang TIDAK ikut masuk, dan alasannya
-- ---------------------------------------------------------------------------
--
--   * 82 tabung yang di berkas tercatat DUA pemegang berbeda. Tanggalnya tidak bisa
--     dijadikan patokan otomatis (68 kasus baris pertama lebih baru, 20 sebaliknya,
--     78 tidak bisa dibandingkan). Perlu keputusan manusia.
--
--   * 25 baris yang nama pemegangnya belum ada di data pelanggan. Dilewati utuh,
--     bukan diisi setengah: mengisi status 'Rented' tanpa currentHolder membuat
--     tabungnya tercatat disewa tapi tidak bisa ditelusuri ke siapa pun.
--
--   * 32 tabung yang ada di berkas tapi belum ada di database.
--
-- ---------------------------------------------------------------------------
-- Kenapa hanya menyentuh yang NULL/Unknown
-- ---------------------------------------------------------------------------
--
-- 130 tabung punya status nyata yang BERBEDA dari opname, dan 59 di antaranya
-- punya riwayat transaksi aplikasi. Opname adalah catatan buku dengan tanggal
-- tersebar sampai 2020; menimpakannya ke status yang lahir dari transaksi tercatat
-- berarti bertaruh bahwa buku selalu lebih benar. Taruhan itu tidak perlu diambil
-- untuk memperoleh manfaat utamanya, jadi 130 baris itu dibiarkan untuk ditinjau
-- terpisah.

create table if not exists public.opname_tabung (
  prefiks  text   not null,
  nomor    bigint not null,
  lokasi   text   not null,
  tanggal  date,
  primary key (prefiks, nomor)
);

alter table public.opname_tabung enable row level security;
drop policy if exists opname_tabung_baca on public.opname_tabung;
create policy opname_tabung_baca on public.opname_tabung
  for all to authenticated using (true) with check (true);

-- Catatan: 1.482 baris isinya dimuat dari berkas CSV, bukan ditulis di migration ini
-- -- terlalu besar untuk berkas kode, dan sifatnya data lapangan sekali pakai
-- seperti hapus_data_uji. Tabelnya sengaja disimpan, bukan dibuang setelah dipakai:
-- kalau kelak ada angka stok yang dipertanyakan, inilah sumber yang bisa ditunjuk.

-- ---------------------------------------------------------------------------
-- Terapkan ke cylinders
--
-- Pemetaan lokasi -> status:
--   TOKO   -> Available  (di gudang, siap disewakan)
--   PABRIK -> Refilling  (sedang di vendor isi ulang)
--   nama   -> Rented, currentHolder diisi ID pelanggan
--
-- currentHolder diisi ID, BUKAN nama. Perhitungan barang di tangan pelanggan
-- (hitungSemuaHolding di lib/memberExit.ts) mencocokkan dengan ID; mengisi nama
-- membuat tabungnya tidak pernah terhitung -- persis bug yang masih ada di jalur
-- "Sewa Baru" (App.tsx handleNewRental), yang meninggalkan 630 baris bernama.
-- ---------------------------------------------------------------------------

with o as (select * from public.opname_tabung),
m as (select id, "companyName", upper(regexp_replace("companyName",'\s+',' ','g')) as nama from public.members),
sasaran as (
  select c.id as cyl_id, o.lokasi, m.id as member_id, m."companyName"
  from public.cylinders c
  join o on o.prefiks = upper(split_part(c."serialCode",'-',1))
        and o.nomor  = nullif(regexp_replace(split_part(c."serialCode",'-',2),'\D','','g'),'')::bigint
  left join m on m.nama = o.lokasi
  where (c.status is null or c.status = 'Unknown')
    and (o.lokasi in ('TOKO','PABRIK') or m.id is not null)
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

do $$
declare v_null integer; v_total integer;
begin
  select count(*) filter (where status is null), count(*) into v_null, v_total
  from public.cylinders;

  if v_total <> 1773 then raise exception 'Jumlah tabung berubah! diharapkan 1773, dapat %', v_total; end if;

  raise notice 'Opname diterapkan: total %, status kosong tersisa %', v_total, v_null;
end $$;
