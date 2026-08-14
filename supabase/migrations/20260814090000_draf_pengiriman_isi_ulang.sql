-- Draf pengiriman isi ulang: simpan pilihan tabung yang belum final.
--
-- Memilih tabung untuk dikirim ke vendor tidak selesai dalam sekali duduk. Petugas
-- menyusuri gudang sambil mencentang di HP, ketemu tabung yang belum jelas, lalu
-- ditinggal dulu. Sampai sekarang pilihan itu cuma ada di useState RefillView:
-- refresh, ganti tab, atau HP terkunci -- tiga puluh centangan hilang tanpa jejak
-- dan harus diulang dari nol.
--
-- Yang disimpan di sini SEMATA-MATA niat, bukan kejadian. Selama masih draf, status
-- tabung tetap 'Kosong (Perlu Isi Ulang)' dan tidak ada satu pun baris transactions
-- yang lahir. Perpindahan barang baru tercatat saat petugas menekan "Kirim Sekarang",
-- persis seperti sebelumnya. Karena itu tabel ini sengaja dipisah dari transactions:
-- seluruh laporan keuangan, stok, dan Laporan Harian membaca transactions, dan draf
-- yang bocor ke sana akan langsung jadi angka palsu di semua tempat itu.
--
-- Draf juga bukan milik pribadi satu petugas. Toko ini dijalankan berdua-bertiga di
-- shift yang sama; yang mulai memilih pagi hari belum tentu yang menyelesaikan sore
-- hari. Jadi barisnya dikunci per vendor, bukan per pengguna -- lihat primary key.

-- ---------------------------------------------------------------------------
-- 1. Tabel draf
--
-- "stationId" jadi primary key sekaligus foreign key: satu vendor tepat satu draf
-- berjalan. Ini yang membuat aturan "pilih vendor -> draf-nya termuat" berlaku tanpa
-- perlu memilih draf mana, dan menutup kemungkinan dua draf bersaing untuk vendor
-- yang sama. ON DELETE CASCADE ikut membuang draf saat vendornya dihapus, supaya
-- tidak tertinggal baris yang menunjuk vendor yang sudah tidak ada.
--
-- "cylinderIds" disimpan sebagai array, bukan tabel baris-per-tabung. Isinya selalu
-- dibaca dan ditulis utuh sebagai satu pilihan; tidak ada query yang butuh mencari
-- "draf mana saja yang memuat tabung X". Array juga membuat penyimpanan draf jadi
-- satu upsert, bukan hapus-lalu-sisipkan yang bisa putus di tengah.
--
-- Sengaja TIDAK ada foreign key ke cylinders (array memang tidak bisa), jadi id
-- tabung yang keburu dihapus akan tertinggal di sini. Itu ditangani saat memuat:
-- RefillView menyaring isi draf terhadap tabung yang benar-benar masih layak kirim
-- dan memberi tahu kalau ada yang gugur. Draf memang tebakan tentang masa depan --
-- ia harus tahan terhadap kenyataan yang berubah di belakangnya.
-- ---------------------------------------------------------------------------

create table if not exists public.refill_drafts (
  "stationId"   text primary key references public.refill_stations (id) on delete cascade,
  "cylinderIds" text[]      not null default '{}',
  "updatedAt"   timestamptz not null default now(),
  "updatedBy"   text
);

-- Nama petugas disalin apa adanya, bukan referensi ke profiles. Draf berumur
-- pendek dan hanya perlu menjawab "ini pilihan siapa, kapan" saat dilanjutkan;
-- join ke profiles untuk keperluan sesempit itu tidak sepadan.
comment on column public.refill_drafts."updatedBy" is
  'Nama petugas yang terakhir menyimpan, disalin saat menyimpan.';

-- ---------------------------------------------------------------------------
-- 2. RLS -- samakan dengan tabel lain: hanya user yang sudah login
-- ---------------------------------------------------------------------------

alter table public.refill_drafts enable row level security;

drop policy if exists authenticated_full_access on public.refill_drafts;
create policy authenticated_full_access on public.refill_drafts
  for all to authenticated using (true) with check (true);

revoke all on public.refill_drafts from anon;

-- ---------------------------------------------------------------------------
-- 3. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_pk    integer;
  v_rls   boolean;
  v_polis integer;
begin
  select count(*) into v_pk
    from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'refill_drafts'
      and constraint_type = 'PRIMARY KEY';

  if v_pk <> 1 then raise exception 'refill_drafts wajib punya primary key, dapat %', v_pk; end if;

  select relrowsecurity into v_rls from pg_class where relname = 'refill_drafts';
  if not v_rls then raise exception 'RLS refill_drafts belum aktif'; end if;

  select count(*) into v_polis from pg_policies
    where schemaname = 'public' and tablename = 'refill_drafts';
  if v_polis <> 1 then raise exception 'Policy refill_drafts diharapkan 1, dapat %', v_polis; end if;

  raise notice 'Migration OK: refill_drafts siap menampung draf pengiriman per vendor';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (jalankan hanya jika app rusak setelah migration ini)
-- ---------------------------------------------------------------------------
-- drop table if exists public.refill_drafts;
