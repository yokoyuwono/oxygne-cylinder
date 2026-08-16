-- Pembatalan pesanan antrian isi, dan penjagaan supaya bagiannya tidak bisa
-- dibatalkan satu-satu.
--
-- Satu pesanan bisa sudah menulis tiga baris di transactions: RETURN saat tabung
-- kosong masuk, ORDER_PAYMENT saat uangnya berpindah, RENTAL_OUT saat isi diserahkan.
-- Menandai pesanannya 'BATAL' tidak membalik satu pun dari ketiganya -- tabung tetap
-- tercatat di gudang padahal sudah dikembalikan ke pelanggan, bon tetap naik, dan
-- uangnya tetap terhitung di Laporan Harian.
--
-- Ini persis alasan batalkan_transaksi() ditulis sebagai fungsi database
-- (20260812090000): pembalikan yang menyentuh beberapa tabel sekaligus harus jadi
-- semua atau batal semua, bukan berurutan dari browser yang bisa putus di tengah.
--
-- Dua hal dikerjakan dalam satu berkas karena keduanya menjaga invarian yang sama:
-- pesanan adalah satu kesatuan, dan pembatalannya cuma boleh lewat satu pintu.

-- ---------------------------------------------------------------------------
-- 1. Penjaga di batalkan_transaksi()
--
-- RETURN dan RENTAL_OUT milik pesanan sama-sama jenis yang didukung fungsi itu, jadi
-- tombol Batalkan di halaman Riwayat aktif untuk keduanya. Membatalkannya dari sana
-- membalik status tabung tapi tidak menyentuh pesanannya sama sekali: kartu antrian
-- tetap MENUNGGU sementara tabungnya sudah pindah, dan tidak ada apa pun yang memberi
-- tahu siapa pun. Dua sumber kebenaran yang berselisih diam-diam lebih berbahaya
-- daripada tombol yang menolak bekerja.
--
-- Seluruh fungsinya ditulis ulang, bukan ditambal, supaya versi yang berlaku selalu
-- bisa dibaca utuh dari satu berkas.
-- ---------------------------------------------------------------------------

create or replace function public.batalkan_transaksi(p_id text, p_alasan text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_peran     text;
  v_tx        public.transactions%rowtype;
  v_tarif_id  text;
  v_cocok     integer;
  v_hari_tx   date;
  v_hari_ini  date;
  v_dibalik   text[] := array[]::text[];
begin
  if v_uid is null then
    raise exception 'Harus login untuk membatalkan transaksi.';
  end if;

  select role into v_peran from public.profiles where id = v_uid;

  -- FOR UPDATE: dua orang menekan Batalkan bersamaan tidak boleh membalik efeknya
  -- dua kali (stok bertambah dobel).
  select * into v_tx from public.transactions where id = p_id for update;

  if not found then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  if v_tx."voidedAt" is not null then
    raise exception 'Transaksi ini sudah dibatalkan sebelumnya.';
  end if;

  -- Baris milik pesanan antrian isi: satu kesatuan, satu pintu pembatalan.
  if exists (
    select 1 from public.gas_orders o
    where p_id in (o."transaksiTerimaId", o."transaksiSerahId", o."transaksiBayarId")
  ) then
    raise exception 'Baris ini bagian dari pesanan Antrian Isi. Batalkan pesanannya di halaman Antrian Isi.';
  end if;

  -- -------------------------------------------------------------------------
  -- Jenis yang didukung
  --
  -- Sisanya ditolak terang-terangan, bukan dibatalkan setengah-setengah: isi
  -- ulang, pengiriman, pembayaran utang, dan pengembalian deposit punya jalur
  -- pembalikan sendiri yang belum ditulis, dan membalik separuh lebih berbahaya
  -- daripada tidak membalik sama sekali.
  --
  -- ORDER_PAYMENT juga tidak ada di sini: pembatalannya ikut pesanannya, lewat
  -- batalkan_pesanan() di bawah.
  -- -------------------------------------------------------------------------
  if v_tx.type not in ('RENTAL_OUT', 'RETURN', 'GAS_EXCHANGE') then
    raise exception 'Jenis % belum bisa dibatalkan dari aplikasi. Hubungi Administrator.', v_tx.type;
  end if;

  -- -------------------------------------------------------------------------
  -- Hak akses: Operator sebatas hari ini, Administrator bebas.
  --
  -- Salah ketik ketahuan dalam hitungan menit, jadi Operator tidak perlu menunggu
  -- siapa pun. Membongkar catatan lama urusan lain -- itu ranah Administrator.
  -- Zona waktu dipatok Asia/Jakarta supaya "hari ini" sama bagi semua orang,
  -- bukan mengikuti jam server yang UTC.
  -- -------------------------------------------------------------------------
  v_hari_tx  := (v_tx.date::timestamptz at time zone 'Asia/Jakarta')::date;
  v_hari_ini := (now() at time zone 'Asia/Jakarta')::date;

  if coalesce(v_peran, 'operator') <> 'admin' and v_hari_tx <> v_hari_ini then
    raise exception 'Operator hanya boleh membatalkan transaksi hari ini. Minta bantuan Administrator.';
  end if;

  -- -------------------------------------------------------------------------
  -- Hanya transaksi terakhir pada tabung itu
  --
  -- Membatalkan sewa lama padahal tabungnya sudah dikembalikan dan disewakan lagi
  -- akan mengembalikan statusnya ke 'Available' padahal sedang dipegang orang.
  -- -------------------------------------------------------------------------
  if v_tx."cylinderId" is not null and exists (
    select 1 from public.transactions t
    where t."cylinderId" = v_tx."cylinderId"
      and t.id <> v_tx.id
      and t."voidedAt" is null
      and t.date::timestamptz > v_tx.date::timestamptz
  ) then
    raise exception 'Ada transaksi lebih baru untuk tabung ini. Batalkan yang paling baru dulu.';
  end if;

  -- -------------------------------------------------------------------------
  -- Pembalikan efek samping
  -- -------------------------------------------------------------------------

  if v_tx.type = 'RENTAL_OUT' then

    if v_tx."cylinderId" is not null then
      update public.cylinders
      set status = 'Available', "currentHolder" = null, "lastLocation" = 'Gudang Utama'
      where id = v_tx."cylinderId";
      v_dibalik := array_append(v_dibalik, 'status tabung');
    end if;

    -- Botol curah pergi bersama pelanggan, jadi kepemilikan toko berkurang saat
    -- disewa; membatalkannya mengembalikan jumlah itu.
    if v_tx."cylinderId" is null and coalesce(v_tx.quantity, 0) > 0 and v_tx.size is not null then
      select count(*), min(id) into v_cocok, v_tarif_id
      from public.rental_tariffs
      where kind = 'CYLINDER' and "isCoded" = false and size = v_tx.size;

      if v_cocok > 1 then
        raise exception 'Ada % tarif curah berukuran %; tidak bisa menentukan stok mana yang dikembalikan.', v_cocok, v_tx.size;
      end if;

      if v_cocok = 1 then
        update public.rental_tariffs
        set "stockQty" = coalesce("stockQty", 0) + v_tx.quantity
        where id = v_tarif_id;
        v_dibalik := array_append(v_dibalik, 'stok botol curah');
      end if;
    end if;

    -- Regulator terjual: kepemilikan stok baru berkurang permanen saat dijual.
    if coalesce(v_tx."regulatorSalePrice", 0) > 0 and v_tx."regulatorTariffId" is not null then
      update public.rental_tariffs
      set "regulatorNewStock" = coalesce("regulatorNewStock", 0) + coalesce(v_tx."regulatorQty", 1)
      where id = v_tx."regulatorTariffId";
      v_dibalik := array_append(v_dibalik, 'stok regulator baru');
    end if;

    if coalesce(v_tx."depositAmount", 0) > 0 and v_tx."memberId" is not null then
      update public.members
      set "totalDeposit" = greatest(0, coalesce("totalDeposit", 0) - v_tx."depositAmount")
      where id = v_tx."memberId";
      v_dibalik := array_append(v_dibalik, 'deposit pelanggan');
    end if;

    if v_tx."paymentStatus" = 'UNPAID' and coalesce(v_tx.cost, 0) > 0 and v_tx."memberId" is not null then
      update public.members
      set "totalDebt" = greatest(0, coalesce("totalDebt", 0) - v_tx.cost)
      where id = v_tx."memberId";
      v_dibalik := array_append(v_dibalik, 'bon pelanggan');
    end if;

  elsif v_tx.type = 'RETURN' then

    -- Tabung kembali ke tangan pelanggan seperti sebelum pengembalian dicatat.
    -- currentHolder diisi memberId, bukan nama: itu yang dibaca perhitungan barang
    -- di tangan pelanggan (lihat hitungSemuaHolding di lib/memberExit.ts).
    if v_tx."cylinderId" is not null and v_tx."memberId" is not null then
      update public.cylinders
      set status = 'Rented',
          "currentHolder" = v_tx."memberId",
          "lastLocation" = coalesce((select "companyName" from public.members where id = v_tx."memberId"), 'Pelanggan')
      where id = v_tx."cylinderId";
      v_dibalik := array_append(v_dibalik, 'status tabung');
    end if;

    if v_tx."cylinderId" is null and coalesce(v_tx.quantity, 0) > 0 and v_tx.size is not null then
      select count(*), min(id) into v_cocok, v_tarif_id
      from public.rental_tariffs
      where kind = 'CYLINDER' and "isCoded" = false and size = v_tx.size;

      if v_cocok > 1 then
        raise exception 'Ada % tarif curah berukuran %; tidak bisa menentukan stok mana yang dikurangi.', v_cocok, v_tx.size;
      end if;

      if v_cocok = 1 then
        update public.rental_tariffs
        set "stockQty" = greatest(0, coalesce("stockQty", 0) - v_tx.quantity)
        where id = v_tarif_id;
        v_dibalik := array_append(v_dibalik, 'stok botol curah');
      end if;
    end if;

    -- Deposit yang tadi dikembalikan ke pelanggan ditahan lagi.
    if coalesce(v_tx."depositAmount", 0) > 0 and v_tx."memberId" is not null then
      update public.members
      set "totalDeposit" = coalesce("totalDeposit", 0) + v_tx."depositAmount"
      where id = v_tx."memberId";
      v_dibalik := array_append(v_dibalik, 'deposit pelanggan');
    end if;

  end if;
  -- GAS_EXCHANGE tidak menyentuh apa pun selain barisnya sendiri: botol masuk satu,
  -- keluar satu, dan stok memang tidak pernah digerakkan olehnya.

  update public.transactions
  set "voidedAt" = now(), "voidedBy" = v_uid, "voidReason" = nullif(btrim(coalesce(p_alasan, '')), '')
  where id = p_id;

  return jsonb_build_object(
    'id', v_tx.id,
    'jenis', v_tx.type,
    'dibalik', to_jsonb(v_dibalik)
  );
end;
$$;

revoke execute on function public.batalkan_transaksi(text, text) from public, anon;
grant  execute on function public.batalkan_transaksi(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pembatalan pesanan
--
-- Membalik seluruh bagian pesanan sekaligus, masing-masing dijaga "is not null"
-- supaya pesanan yang baru separuh jalan -- sudah menerima tabung tapi belum dibayar,
-- misalnya -- tetap bisa dibatalkan.
--
-- Yang TIDAK dikerjakan fungsi ini: mengembalikan uang tunai yang sudah diterima.
-- Itu kejadian tersendiri di laci, bukan pembalikan catatan; yang dibalik di sini
-- hanya catatannya, dan pengembalian uangnya dicatat sebagai Uang Keluar.
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
-- 3. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_batal_tx integer;
  v_batal_ps integer;
  v_penjaga  integer;
begin
  select count(*) into v_batal_tx from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'batalkan_transaksi';

  if v_batal_tx <> 1 then raise exception 'Fungsi batalkan_transaksi diharapkan 1, dapat %', v_batal_tx; end if;

  select count(*) into v_batal_ps from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'batalkan_pesanan';

  if v_batal_ps <> 1 then raise exception 'Fungsi batalkan_pesanan diharapkan 1, dapat %', v_batal_ps; end if;

  -- Penjaganya yang paling mudah hilang saat fungsinya ditulis ulang di kemudian
  -- hari, jadi keberadaannya diperiksa dari isi definisinya.
  select count(*) into v_penjaga from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'batalkan_transaksi'
     and pg_get_functiondef(p.oid) like '%gas_orders%';

  if v_penjaga <> 1 then raise exception 'batalkan_transaksi kehilangan penjaga baris milik pesanan'; end if;

  raise notice 'Migration OK: pembatalan pesanan antrian isi siap';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (jalankan hanya jika app rusak setelah migration ini)
-- ---------------------------------------------------------------------------
-- drop function if exists public.batalkan_pesanan(text, text);
-- lalu jalankan ulang 20260812090000_batalkan_transaksi.sql untuk versi tanpa penjaga.
