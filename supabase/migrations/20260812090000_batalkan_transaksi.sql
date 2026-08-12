-- Pembatalan transaksi yang salah catat.
--
-- Sebelum ini tidak ada jalan membetulkan salah catat selain Pengeluaran. Itu bukan
-- sekadar merepotkan: stok dan barang di tangan pelanggan DITURUNKAN dari riwayat
-- transaksi (lihat lib/bulkStock.ts), jadi satu baris keliru membuat angka stok ikut
-- keliru selamanya, dan satu-satunya penyelesaiannya adalah menyunting database
-- langsung.
--
-- Dua keputusan bentuk:
--
--   1. DIBATALKAN, BUKAN DIHAPUS. Barisnya tetap ada dengan penanda waktu, pelaku,
--      dan alasan. Ini catatan uang orang; menghilangkannya tanpa jejak membuat
--      selisih kas tidak bisa ditelusuri.
--
--   2. PEMBALIKANNYA SATU FUNGSI, BUKAN BEBERAPA PERINTAH DARI BROWSER. Transaksi
--      tidak cuma menulis satu baris -- ia juga mengubah cylinders.status,
--      members.totalDebt/totalDeposit, dan rental_tariffs.stockQty. Menghapus baris
--      transaksinya saja tidak mengembalikan kolom-kolom itu: tabung akan tetap
--      berstatus 'Rented' atas nama pelanggan yang batal menyewa. Dikerjakan
--      berurutan dari browser, gagal di tengah meninggalkan data separuh terbalik;
--      di dalam fungsi, semuanya jadi atau semuanya batal.

-- ---------------------------------------------------------------------------
-- 1. Penanda pembatalan
--
-- Nullable: baris yang sah -- mayoritas -- tidak terisi sama sekali.
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists "voidedAt"   timestamptz;
alter table public.transactions add column if not exists "voidedBy"   uuid;
alter table public.transactions add column if not exists "voidReason" text;

-- ---------------------------------------------------------------------------
-- 2. Fungsi pembatalan
--
-- SECURITY DEFINER karena ia menyentuh cylinders, members, dan rental_tariffs
-- sekaligus, lalu memeriksa sendiri siapa pemanggilnya. search_path dipatok
-- (linter 0011), dan EXECUTE hanya diberikan ke authenticated.
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

  -- -------------------------------------------------------------------------
  -- Jenis yang didukung
  --
  -- Sisanya ditolak terang-terangan, bukan dibatalkan setengah-setengah: isi
  -- ulang, pengiriman, pembayaran utang, dan pengembalian deposit punya jalur
  -- pembalikan sendiri yang belum ditulis, dan membalik separuh lebih berbahaya
  -- daripada tidak membalik sama sekali.
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
-- 3. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_kolom integer;
  v_fungsi integer;
begin
  select count(*) into v_kolom from information_schema.columns
   where table_schema = 'public' and table_name = 'transactions'
     and column_name in ('voidedAt', 'voidedBy', 'voidReason');

  if v_kolom <> 3 then raise exception 'Kolom pembatalan diharapkan 3, dapat %', v_kolom; end if;

  select count(*) into v_fungsi from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'batalkan_transaksi';

  if v_fungsi <> 1 then raise exception 'Fungsi batalkan_transaksi diharapkan 1, dapat %', v_fungsi; end if;

  raise notice 'Migration OK: pembatalan transaksi siap';
end $$;
