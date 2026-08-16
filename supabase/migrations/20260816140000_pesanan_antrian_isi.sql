-- Antrian isi: pesanan yang isinya belum diserahkan.
--
-- Tiga kejadian di konter yang bentuknya sama dan sampai sekarang tidak punya tempat
-- di aplikasi:
--
--   1. Pelanggan menitipkan tabung MILIKNYA SENDIRI untuk diisi, bayar setelah jadi.
--   2. Stok isi habis, pelanggan hanya menaruh tabung besar berkode yang kosong.
--   3. Sama, tapi botol kecil tanpa kode.
--
-- Ketiganya berbagi satu keadaan yang belum bisa dicatat di mana pun: TOKO BERUTANG
-- ISI KE PELANGGAN -- kebalikan dari bon. Selama ini dicatat di kertas, dan pesanan
-- yang lupa diserahkan baru ketahuan saat pelanggan menagih.
--
-- DIPISAH DARI transactions, alasannya sama persis seperti refill_drafts
-- (20260814090000): pesanan yang masih MENUNGGU adalah JANJI, bukan kejadian. Seluruh
-- pembaca transactions -- laporan harian, rekap metode bayar, daftar bon, perhitungan
-- stok curah, barang di tangan pelanggan -- tidak mengenal siklus hidup apa pun; satu
-- baris "belum jadi" yang bocor ke sana langsung jadi omzet palsu, tagihan palsu, dan
-- stok palsu sekaligus. Menambahkan kolom status ke transactions berarti selusin
-- pembaca harus diajari melewatinya, dan satu yang terlewat salah tanpa error.
--
-- UANG DAN BARANG SENGAJA DUA PERISTIWA TERPISAH. Baris uang punya tanggalnya sendiri
-- dan hidup di transactions sebagai ORDER_PAYMENT; baris barang selalu bernominal nol.
-- Dengan begitu pelanggan yang bayar duluan tercatat pada hari uangnya benar-benar
-- masuk, bukan pada hari isinya diserahkan berminggu-minggu kemudian. Tabel ini cuma
-- mengikat keduanya dan mengingat mana yang belum selesai.

-- ---------------------------------------------------------------------------
-- 1. Tabel pesanan
-- ---------------------------------------------------------------------------

create table if not exists public.gas_orders (
  id                 text primary key,

  -- 'TITIP_ISI'   : tabung milik pelanggan, toko cuma mengisikannya
  -- 'TUKAR_BESAR' : tabung berkode milik toko, isinya habis, ditukar menyusul
  -- 'TUKAR_KECIL' : botol curah tanpa kode, isinya habis, ditukar menyusul
  --
  -- Sengaja tanpa CHECK, sama seperti transactions.type dan category: jenis keempat
  -- suatu saat bisa muncul dan tidak sepadan dengan migrasi. Nilai tak dikenal cuma
  -- memengaruhi label yang ditampilkan, tidak ada perhitungan yang rusak karenanya.
  jenis              text not null,

  -- Berbeda dari `jenis`, yang ini PAKAI CHECK. Status adalah mesin yang digerakkan
  -- aplikasi dan dibaca batalkan_pesanan(); nilai asing di sini bukan sekadar salah
  -- label, tapi pesanan yang tidak bisa diselesaikan maupun dibatalkan.
  status             text not null default 'MENUNGGU'
                     check (status in ('MENUNGGU', 'SELESAI', 'BATAL')),

  -- Wajib untuk TUKAR_BESAR -- lihat alasannya di "cylinderMasukId". Boleh kosong
  -- untuk dua jenis lain: titip isi dan tukar kecil terbuka untuk pembeli lepas,
  -- sama seperti tukar isi biasa yang memang tidak menuntut pelanggan terdaftar.
  --
  -- Aturannya dijaga aplikasi, bukan constraint: baris lama tidak boleh jadi tidak
  -- sah hanya karena aturannya berubah di kemudian hari.
  "memberId"         text references public.members (id) on delete set null,

  -- Selalu diisi, juga untuk pelanggan terdaftar. Pelanggan bisa dihapus (foreign key
  -- di atas menyetel kolomnya jadi null) dan kartu pesanannya masih harus terbaca
  -- "ini punya siapa". Alasan yang sama dengan refill_drafts."updatedBy".
  "namaPembeli"      text not null,

  "gasType"          text,
  size               text,
  quantity           integer not null default 1 check (quantity > 0),

  -- DUA kolom tabung, bukan satu.
  --
  -- Tukar besar bukan mengisi ulang tabung yang sama: yang masuk adalah tabung kosong
  -- yang sedang dipegang pelanggan, yang keluar adalah tabung penuh mana pun dari
  -- gudang -- dan tabung itu baru dipilih saat penyerahan, kadang berminggu-minggu
  -- kemudian. Satu kolom memaksa salah satu jejaknya hilang, dan pembatalan lalu tidak
  -- bisa mengembalikan tabung yang benar ke tangan siapa pun.
  --
  -- Keduanya hanya terisi untuk TUKAR_BESAR. Tabung titipan pelanggan TIDAK pernah
  -- didaftarkan ke cylinders: itu bukan aset toko, tidak ikut alur halaman Pabrik, dan
  -- kode serinya cuma teks di "serialTitipan".
  "cylinderMasukId"  text references public.cylinders (id),
  "cylinderKeluarId" text references public.cylinders (id),

  -- Kode seri tabung MILIK PELANGGAN, teks bebas. Bukan referensi ke cylinders.
  "serialTitipan"    text,

  harga              numeric,

  -- Tiga pengait ke transactions:
  --   "transaksiBayarId"  -> ORDER_PAYMENT, satu-satunya baris yang bernominal
  --   "transaksiTerimaId" -> RETURN cost 0, saat tabung kosong masuk gudang
  --   "transaksiSerahId"  -> RENTAL_OUT cost 0, saat tabung penuh diserahkan
  --
  -- Tanpa ON DELETE apa pun (NO ACTION) dengan sengaja. Baris transaksi tidak pernah
  -- dihapus keras kecuali lewat handleHapusKas, dan itu cuma menyentuh INCOME/EXPENSE
  -- yang tidak akan pernah tersambung ke sini. Pointer yang menggantung berarti
  -- pembatalan pesanan tidak tahu apa yang harus dibalik -- lebih baik ditolak
  -- database daripada membalik separuh.
  "transaksiBayarId"  text references public.transactions (id),
  "transaksiTerimaId" text references public.transactions (id),
  "transaksiSerahId"  text references public.transactions (id),

  catatan            text,
  "alasanBatal"      text,
  "tanggalMasuk"     timestamptz not null default now(),
  "tanggalSelesai"   timestamptz,
  "dibuatOleh"       text
);

-- Nominal di sini BUKAN sumber angka laporan. Untuk titip isi, harganya sering baru
-- diketahui setelah pabrik menagih, jadi kolomnya boleh kosong dan boleh berubah
-- sebelum dibayar. Yang masuk laporan hanya baris ORDER_PAYMENT di transactions --
-- aturan yang sama dengan refill_drafts: tabel niat tidak pernah ikut dijumlahkan.
comment on column public.gas_orders.harga is
  'Taksiran harga saat pesanan masuk. BUKAN sumber angka laporan -- itu ada di baris ORDER_PAYMENT.';

-- Nama petugas disalin apa adanya, bukan referensi ke profiles. Sama seperti
-- refill_drafts."updatedBy": yang perlu dijawab cuma "ini dicatat siapa".
comment on column public.gas_orders."dibuatOleh" is
  'Nama petugas yang mencatat pesanan, disalin saat menyimpan.';

-- Sengaja tanpa index selain primary key. Seluruh baris dimuat sekali ke browser lewat
-- fetchAllRecords seperti tabel lain, dan penyaringannya terjadi di memori -- index di
-- sini tidak akan pernah dibaca siapa pun.

-- ---------------------------------------------------------------------------
-- 2. RLS -- samakan dengan tabel lain: hanya user yang sudah login
-- ---------------------------------------------------------------------------

alter table public.gas_orders enable row level security;

drop policy if exists authenticated_full_access on public.gas_orders;
create policy authenticated_full_access on public.gas_orders
  for all to authenticated using (true) with check (true);

revoke all on public.gas_orders from anon;

-- ---------------------------------------------------------------------------
-- 3. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_kolom integer;
  v_fk    integer;
  v_rls   boolean;
  v_polis integer;
begin
  select count(*) into v_kolom from information_schema.columns
    where table_schema = 'public' and table_name = 'gas_orders'
      and column_name in ('cylinderMasukId', 'cylinderKeluarId',
                          'transaksiBayarId', 'transaksiTerimaId', 'transaksiSerahId');

  if v_kolom <> 5 then raise exception 'Kolom pengait gas_orders diharapkan 5, dapat %', v_kolom; end if;

  -- Enam: memberId, dua tabung, tiga transaksi. Diperiksa sebagai batas bawah supaya
  -- constraint tambahan di kemudian hari tidak membuat migrasi ini gagal dijalankan
  -- ulang.
  select count(*) into v_fk from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'gas_orders'
      and constraint_type = 'FOREIGN KEY';

  if v_fk < 6 then raise exception 'Foreign key gas_orders diharapkan minimal 6, dapat %', v_fk; end if;

  select relrowsecurity into v_rls from pg_class where relname = 'gas_orders';
  if not v_rls then raise exception 'RLS gas_orders belum aktif'; end if;

  select count(*) into v_polis from pg_policies
    where schemaname = 'public' and tablename = 'gas_orders';
  if v_polis <> 1 then raise exception 'Policy gas_orders diharapkan 1, dapat %', v_polis; end if;

  raise notice 'Migration OK: gas_orders siap menampung pesanan yang isinya belum diserahkan';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (jalankan hanya jika app rusak setelah migration ini)
-- ---------------------------------------------------------------------------
-- drop table if exists public.gas_orders;
