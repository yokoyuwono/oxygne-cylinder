-- Tanggal tabung mulai dipegang pemegangnya sekarang.
--
-- Daftar "Tabung Dipegang" di layar pelanggan hanya memuat kode, jenis, ukuran, dan
-- status: kelihatan berapa banyak barang toko yang ada di tangan seseorang, tapi
-- tidak kelihatan sudah berapa lama di sana. Padahal tanggalnya ada -- buku opname
-- mencatatnya di kolom ketiga, dan sudah ikut termuat ke opname_tabung.tanggal sejak
-- 20260812113948, cuma belum pernah dipakai.
--
-- ---------------------------------------------------------------------------
-- Arti kolomnya
-- ---------------------------------------------------------------------------
--
-- "heldSince" adalah tanggal tabung berpindah ke pemegangnya SEKARANG, bukan
-- riwayat perpindahan. Diisi saat tabung keluar ke pelanggan, dikosongkan saat
-- kembali ke gudang. Riwayat lengkapnya tetap di tabel transactions.
--
-- Karena artinya begitu, tanggal buku hanya dipasang kalau nama pemegang di buku
-- MASIH SAMA dengan pemegang yang tercatat di database. Kalau tabungnya sudah
-- berpindah tangan setelah opname, tanggal itu milik pemegang lama; memasangnya di
-- pemegang baru bukan sekadar kurang lengkap, tapi salah -- dan salahnya tidak
-- kentara, karena yang terbaca di layar tetap berupa tanggal yang masuk akal.
--
-- Pencocokan pemegang memakai nama (companyName), bukan ID pelanggan. Ada dua
-- tabung yang pemegangnya terdaftar dua kali dengan nama sama tapi ID berbeda
-- (M-0802 dan YK-369); mencocokkan lewat ID membuat keduanya luput padahal orangnya
-- sama.
-- ---------------------------------------------------------------------------

alter table public.cylinders add column if not exists "heldSince" date;

update public.cylinders c
set "heldSince" = o.tanggal
from public.members m,
     public.opname_tabung o
where m.id = c."currentHolder"
  and o.prefiks = upper(split_part(c."serialCode", '-', 1))
  and o.nomor   = nullif(regexp_replace(split_part(c."serialCode", '-', 2), '\D', '', 'g'), '')::bigint
  and o.lokasi  = upper(regexp_replace(m."companyName", '\s+', ' ', 'g'))
  and o.tanggal is not null
  and c."heldSince" is null;

-- ---------------------------------------------------------------------------
-- Penjaga: tabung tanpa pemegang tidak boleh punya tanggal dipegang
--
-- Bukan sekadar kerapian. Tabung yang dikembalikan lalu disewakan lagi ke orang
-- lain akan membawa tanggal pemegang lama sampai ada yang menimpanya, dan di layar
-- itu terbaca sebagai fakta. Pengosongannya dipasang sebagai trigger, bukan
-- ditambahkan di tiap pemanggil, karena currentHolder disentuh dari beberapa tempat
-- sekaligus -- App.tsx dan fungsi batalkan_transaksi() -- dan cukup satu yang lupa
-- untuk membuat kolomnya berbohong.
-- ---------------------------------------------------------------------------

create or replace function public.kosongkan_held_since()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new."currentHolder" is null or btrim(new."currentHolder") = '' then
    new."heldSince" := null;
  end if;
  return new;
end $$;

drop trigger if exists cylinders_kosongkan_held_since on public.cylinders;
create trigger cylinders_kosongkan_held_since
  before insert or update on public.cylinders
  for each row execute function public.kosongkan_held_since();

-- ---------------------------------------------------------------------------
-- Pemeriksaan
--
-- 25 tabung yang dipegang pelanggan tetap tanpa tanggal, dan itu memang tidak ada
-- sumbernya: 3 tercatat di buku dengan nama pemegang tapi kolom tanggalnya kosong
-- (M-1766, R-2647, R-2674), 22 sisanya barisnya di berkas kosong sama sekali atau
-- nomornya tidak ada di berkas. Dibiarkan kosong, bukan ditebak dari transaksi --
-- tidak satu pun dari mereka punya riwayat RENTAL_OUT yang bisa dijadikan patokan.
-- ---------------------------------------------------------------------------

do $$
declare v_dipegang integer; v_terisi integer; v_nyasar integer; v_masa_depan integer;
begin
  select count(*) filter (where "currentHolder" is not null and btrim("currentHolder") <> ''),
         count(*) filter (where "currentHolder" is not null and btrim("currentHolder") <> '' and "heldSince" is not null),
         count(*) filter (where ("currentHolder" is null or btrim("currentHolder") = '') and "heldSince" is not null)
    into v_dipegang, v_terisi, v_nyasar
  from public.cylinders;

  if v_nyasar <> 0 then
    raise exception 'Ada % tabung tanpa pemegang tapi punya tanggal dipegang', v_nyasar;
  end if;

  select count(*) into v_masa_depan from public.cylinders where "heldSince" > current_date;
  if v_masa_depan <> 0 then
    raise exception 'Ada % tanggal dipegang yang melampaui hari ini', v_masa_depan;
  end if;

  raise notice 'Tanggal dipegang terisi % dari % tabung yang ada di tangan pelanggan', v_terisi, v_dipegang;
end $$;
