-- Tabung titipan ikut ke pabrik.
--
-- Pelanggan menitipkan tabung MILIKNYA SENDIRI untuk diisi (pesanan TITIP_ISI).
-- Tabungnya memang harus ikut naik truk ke pabrik -- tapi sampai sekarang tidak ada
-- jalan untuk memasukkannya ke jadwal pengisian: halaman Pabrik cuma melayani baris
-- cylinders berstatus 'Empty (Needs Refill)', sementara tabung titipan sengaja TIDAK
-- pernah didaftarkan ke cylinders (lihat 20260816140000 baris 75-77).
--
-- Akibatnya nyata: dari 4 pesanan titip isi, 3 menggantung -- satu sejak 24 Agustus
-- 2026, dua puluh enam hari, padahal ambang "terlalu lama" cuma seminggu. Tidak ada
-- yang bisa membawanya ke pabrik, jadi tidak ada yang selesai.
--
-- Keputusan yang TIDAK diubah: tabung titipan tetap bukan aset toko dan tetap tidak
-- masuk cylinders. Yang diperluas halaman Pabrik, supaya menerima dua jenis kandidat.

-- ---------------------------------------------------------------------------
-- 1. Kolom baru di gas_orders
-- ---------------------------------------------------------------------------

alter table public.gas_orders
  add column if not exists "refillStationId"     text references public.refill_stations (id),
  add column if not exists "tanggalKirimPabrik"  timestamptz,
  add column if not exists "tanggalPulangPabrik" timestamptz,
  add column if not exists "transaksiIsiId"      text references public.transactions (id);

-- Tabung toko tidak butuh kolom vendor: vendornya dibaca dari baris REFILL_OUT lewat
-- vendorTerakhir() di lib/isiUlang.ts. Tabung titipan tidak punya baris itu sama sekali
-- -- transactions."cylinderId" menunjuk cylinders, dan titipan tidak ada di sana --
-- jadi kolom ini satu-satunya yang bisa menjawab "ini dikirim ke mana" saat harganya
-- dicari kembali pada waktu pulang.
comment on column public.gas_orders."refillStationId" is
  'Vendor yang sedang memegang tabung titipan. Tabung toko memakai REFILL_OUT, bukan kolom ini.';

-- Umur "sudah di pabrik berapa lama", terpisah dari tanggalMasuk yang mengukur umur
-- janji ke pelanggan. Diisi dengan nilai yang SAMA PERSIS dengan date baris REFILL_OUT
-- sekiriman: RefillHistory mengenali satu batch dari pasangan tanggal + vendor, dan
-- itu satu-satunya cara titipan bisa ikut terhitung di kartu riwayat tanpa id batch.
comment on column public.gas_orders."tanggalKirimPabrik" is
  'Sama persis dengan date baris REFILL_OUT sekiriman -- itu kunci batch di RefillHistory.';

-- Pengait keempat, sebaris dengan tiga yang sudah ada. Menunjuk baris EXPENSE biaya
-- isinya. Sengaja BUKAN kolom nominal: aturan "tabel niat tidak ikut dijumlahkan"
-- (lihat comment pada kolom harga) berlaku sama di sini, dan salinan kedua dari angka
-- yang sudah ada di transactions.cost selalu punya hari di mana ia berselisih dengan
-- aslinya.
--
-- NO ACTION seperti tiga pengait lain, dengan alasan yang sama.
comment on column public.gas_orders."transaksiIsiId" is
  'Baris EXPENSE biaya isi di pabrik. Nominalnya dibaca dari sana, tidak disalin ke sini.';

-- ---------------------------------------------------------------------------
-- 2. Status keempat: DI_PABRIK
--
-- Sampai sekarang MENUNGGU menutupi dua keadaan yang berbeda jauh: tabung masih
-- tergeletak di rak toko, dan tabung sedang ada di pabrik orang lain. Petugas tidak
-- bisa menjawab "tabung saya sudah dibawa belum?" tanpa menebak, dan yang lebih
-- berbahaya: tombol Serahkan tetap hidup untuk tabung yang fisiknya sedang di truk.
--
-- Constraint lamanya ditulis inline di 20260816140000 baris 47-48, jadi namanya
-- diberi Postgres dan tidak boleh ditebak.
-- ---------------------------------------------------------------------------

do $$
declare
  v_nama text;
begin
  select conname into v_nama
    from pg_constraint
   where conrelid = 'public.gas_orders'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';

  if v_nama is not null then
    execute format('alter table public.gas_orders drop constraint %I', v_nama);
  end if;
end $$;

alter table public.gas_orders
  add constraint gas_orders_status_check
  check (status in ('MENUNGGU', 'DI_PABRIK', 'SELESAI', 'BATAL'));

-- ---------------------------------------------------------------------------
-- 3. Draf pengiriman ikut mengingat pesanan titipan
--
-- Draf yang memulihkan tabung toko tapi diam-diam melupakan tabung titipan adalah
-- persis keluhan yang sudah ditulis di RefillView ("draf yang diam-diam menyusut
-- lebih mirip kerusakan daripada penyesuaian"). Default '{}' membuat seluruh baris
-- draf lama tetap sah tanpa disentuh.
-- ---------------------------------------------------------------------------

alter table public.refill_drafts
  add column if not exists "orderIds" text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- 4. batalkan_pesanan: tolak yang tabungnya sedang di pabrik
--
-- Fungsi lamanya cuma menolak pesanan yang sudah BATAL. Pesanan DI_PABRIK lolos
-- sepenuhnya, dan yang terjadi bukan sekadar catatan yang salah: tabung MILIK
-- PELANGGAN ada di pabrik, dan satu-satunya baris yang menyebutkan di pabrik mana
-- baru saja ditutup. Tidak ada yang bisa dibalik dan tidak ada yang bisa ditagih.
--
-- Ditulis ulang utuh, bukan ditambal: plpgsql tidak bisa disisipi sebagian.
-- Yang berubah dari versi 20260816141000 hanya satu blok, ditandai di bawah.
-- ---------------------------------------------------------------------------

create or replace function public.batalkan_pesanan(p_id text, p_alasan text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_peran    text;
  v_p        public.gas_orders%rowtype;
  v_tx       public.transactions%rowtype;
  v_hari_p   date;
  v_hari_ini date;
  v_dibalik  text[] := array[]::text[];
begin
  if v_uid is null then
    raise exception 'Harus login untuk membatalkan pesanan.';
  end if;

  select role into v_peran from public.profiles where id = v_uid;

  -- FOR UPDATE, alasan yang sama seperti batalkan_transaksi: dua orang menekan
  -- Batalkan bersamaan tidak boleh membalik efeknya dua kali.
  select * into v_p from public.gas_orders where id = p_id for update;

  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;

  if v_p.status = 'BATAL' then
    raise exception 'Pesanan ini sudah dibatalkan sebelumnya.';
  end if;

  -- >>> SATU-SATUNYA TAMBAHAN terhadap versi 20260816141000 <<<
  --
  -- Tabungnya sedang tidak ada di toko. Membatalkan sekarang menutup satu-satunya
  -- catatan yang menyebutkan tabung milik pelanggan ada di pabrik mana, dan tidak
  -- ada satu pun efek yang bisa dibalik dari sini -- gasnya sudah dibeli, tabungnya
  -- sudah berangkat. Yang benar adalah menerimanya pulang lebih dulu.
  if v_p.status = 'DI_PABRIK' then
    raise exception 'Tabung titipan ini sedang di pabrik. Terima dulu kembali di halaman Pabrik sebelum membatalkan.';
  end if;

  -- Operator sebatas pesanan yang masuk hari ini, Administrator bebas -- sama seperti
  -- pembatalan transaksi. Yang dipakai tanggal masuknya, bukan tanggal selesai:
  -- itu tanggal yang diingat petugas saat sadar salah catat.
  v_hari_p   := (v_p."tanggalMasuk" at time zone 'Asia/Jakarta')::date;
  v_hari_ini := (now() at time zone 'Asia/Jakarta')::date;

  if coalesce(v_peran, 'operator') <> 'admin' and v_hari_p <> v_hari_ini then
    raise exception 'Operator hanya boleh membatalkan pesanan hari ini. Minta bantuan Administrator.';
  end if;

  -- -------------------------------------------------------------------------
  -- Penjaga tabung, dua kali.
  --
  -- Tabung yang masuk lewat pesanan ini bisa saja sudah keburu dikirim ke pabrik dan
  -- pulang penuh. Mengembalikannya ke 'Rented' atas nama pelanggan akan mengarang
  -- kenyataan; yang benar adalah menolak dan membiarkan orang membetulkannya dari
  -- transaksi paling baru.
  -- -------------------------------------------------------------------------

  if v_p."transaksiTerimaId" is not null and exists (
    select 1 from public.transactions t
    where t."cylinderId" = v_p."cylinderMasukId"
      and t.id <> v_p."transaksiTerimaId"
      and t.id is distinct from v_p."transaksiSerahId"
      and t."voidedAt" is null
      and t.date::timestamptz > (select d.date::timestamptz from public.transactions d
                                 where d.id = v_p."transaksiTerimaId")
  ) then
    raise exception 'Ada transaksi lebih baru untuk tabung yang masuk. Batalkan yang paling baru dulu.';
  end if;

  if v_p."transaksiSerahId" is not null and exists (
    select 1 from public.transactions t
    where t."cylinderId" = v_p."cylinderKeluarId"
      and t.id <> v_p."transaksiSerahId"
      and t."voidedAt" is null
      and t.date::timestamptz > (select s.date::timestamptz from public.transactions s
                                 where s.id = v_p."transaksiSerahId")
  ) then
    raise exception 'Ada transaksi lebih baru untuk tabung yang diserahkan. Batalkan yang paling baru dulu.';
  end if;

  -- -------------------------------------------------------------------------
  -- Pembalikan, dari yang paling belakang ke yang paling depan
  -- -------------------------------------------------------------------------

  -- Penyerahan: tabung penuh kembali ke gudang. heldSince ikut kosong sendiri lewat
  -- trigger kosongkan_held_since begitu currentHolder dikosongkan.
  if v_p."transaksiSerahId" is not null then
    if v_p."cylinderKeluarId" is not null then
      update public.cylinders
      set status = 'Available', "currentHolder" = null, "lastLocation" = 'Gudang Utama'
      where id = v_p."cylinderKeluarId";
      v_dibalik := array_append(v_dibalik, 'tabung yang diserahkan');
    end if;

    update public.transactions
    set "voidedAt" = now(), "voidedBy" = v_uid,
        "voidReason" = nullif(btrim(coalesce(p_alasan, '')), '')
    where id = v_p."transaksiSerahId" and "voidedAt" is null;
  end if;

  -- Uang: baris bon menaikkan totalDebt saat dicatat, jadi pembatalannya menurunkan
  -- lagi. Baris yang sudah lunas tidak menyentuh totalDebt sama sekali.
  if v_p."transaksiBayarId" is not null then
    select * into v_tx from public.transactions where id = v_p."transaksiBayarId" for update;

    if found and v_tx."voidedAt" is null then
      if v_tx."paymentStatus" = 'UNPAID' and coalesce(v_tx.cost, 0) > 0 and v_tx."memberId" is not null then
        update public.members
        set "totalDebt" = greatest(0, coalesce("totalDebt", 0) - v_tx.cost)
        where id = v_tx."memberId";
        v_dibalik := array_append(v_dibalik, 'bon pelanggan');
      end if;

      update public.transactions
      set "voidedAt" = now(), "voidedBy" = v_uid,
          "voidReason" = nullif(btrim(coalesce(p_alasan, '')), '')
      where id = v_p."transaksiBayarId";
      v_dibalik := array_append(v_dibalik, 'catatan pembayaran');
    end if;
  end if;

  -- Penerimaan: tabung kosong kembali ke tangan pelanggan. currentHolder diisi
  -- memberId, bukan nama -- itu yang dibaca perhitungan barang di tangan pelanggan.
  if v_p."transaksiTerimaId" is not null then
    if v_p."cylinderMasukId" is not null and v_p."memberId" is not null then
      update public.cylinders
      set status = 'Rented',
          "currentHolder" = v_p."memberId",
          "lastLocation" = coalesce((select "companyName" from public.members where id = v_p."memberId"), 'Pelanggan')
      where id = v_p."cylinderMasukId";
      v_dibalik := array_append(v_dibalik, 'tabung yang dititipkan');
    end if;

    update public.transactions
    set "voidedAt" = now(), "voidedBy" = v_uid,
        "voidReason" = nullif(btrim(coalesce(p_alasan, '')), '')
    where id = v_p."transaksiTerimaId" and "voidedAt" is null;
  end if;

  -- Biaya isi di pabrik SENGAJA TIDAK dibalik. Pesanan yang sudah pulang dari pabrik
  -- lalu dibatalkan tetap menyisakan gas yang benar-benar dibeli dengan uang yang
  -- benar-benar keluar; menghapusnya membuat pengeluaran sungguhan hilang dari
  -- laporan, dan itu kesalahan yang lebih besar daripada pesanan batal yang punya
  -- biaya melekat. Disebutkan di hasil supaya pemanggilnya bisa mengabarkannya.
  if v_p."transaksiIsiId" is not null then
    v_dibalik := array_append(v_dibalik, 'biaya isi pabrik TETAP tercatat');
  end if;

  update public.gas_orders
  set status = 'BATAL',
      "alasanBatal" = nullif(btrim(coalesce(p_alasan, '')), ''),
      "tanggalSelesai" = now()
  where id = p_id;

  return jsonb_build_object(
    'id', v_p.id,
    'jenis', v_p.jenis,
    'dibalik', to_jsonb(v_dibalik)
  );
end;
$$;

revoke execute on function public.batalkan_pesanan(text, text) from public, anon;
grant  execute on function public.batalkan_pesanan(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_kolom   integer;
  v_draf    integer;
  v_status  text;
  v_penjaga integer;
begin
  select count(*) into v_kolom from information_schema.columns
    where table_schema = 'public' and table_name = 'gas_orders'
      and column_name in ('refillStationId', 'tanggalKirimPabrik',
                          'tanggalPulangPabrik', 'transaksiIsiId');

  if v_kolom <> 4 then raise exception 'Kolom pabrik gas_orders diharapkan 4, dapat %', v_kolom; end if;

  select count(*) into v_draf from information_schema.columns
    where table_schema = 'public' and table_name = 'refill_drafts' and column_name = 'orderIds';

  if v_draf <> 1 then raise exception 'refill_drafts."orderIds" belum ada'; end if;

  -- Status keempat harus benar-benar diizinkan; CHECK yang tertinggal membuat seluruh
  -- pengiriman titipan ditolak database dengan pesan yang tidak menerangkan apa-apa.
  select pg_get_constraintdef(oid) into v_status
    from pg_constraint
   where conrelid = 'public.gas_orders'::regclass
     and contype  = 'c'
     and pg_get_constraintdef(oid) ilike '%status%';

  if v_status is null or v_status not like '%DI_PABRIK%' then
    raise exception 'CHECK status gas_orders belum mengizinkan DI_PABRIK, isinya: %', coalesce(v_status, '(tidak ada)');
  end if;

  -- Penjaga di batalkan_pesanan diperiksa dari isi definisinya, alasan yang sama
  -- seperti pemeriksaan di 20260816141000: itu bagian yang paling mudah hilang saat
  -- fungsinya ditulis ulang lagi di kemudian hari.
  select count(*) into v_penjaga from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'batalkan_pesanan'
     and pg_get_functiondef(p.oid) like '%DI_PABRIK%';

  if v_penjaga <> 1 then raise exception 'batalkan_pesanan kehilangan penjaga DI_PABRIK'; end if;

  raise notice 'Migration OK: tabung titipan siap ikut ke pabrik';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (jalankan hanya jika app rusak setelah migration ini)
-- ---------------------------------------------------------------------------
-- alter table public.gas_orders drop constraint if exists gas_orders_status_check;
-- alter table public.gas_orders
--   add constraint gas_orders_status_check check (status in ('MENUNGGU','SELESAI','BATAL'));
-- alter table public.gas_orders
--   drop column if exists "refillStationId",
--   drop column if exists "tanggalKirimPabrik",
--   drop column if exists "tanggalPulangPabrik",
--   drop column if exists "transaksiIsiId";
-- alter table public.refill_drafts drop column if exists "orderIds";
-- lalu jalankan ulang 20260816141000_batalkan_pesanan_antrian.sql untuk versi tanpa penjaga.
