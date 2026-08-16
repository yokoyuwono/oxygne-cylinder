-- Menghapus bon yang salah catat.
--
-- Sampai sekarang bon hanya bisa turun lewat pembayaran. Itu benar untuk uang yang
-- memang masuk, tapi tidak ada jalan sama sekali untuk bon yang MEMANG TIDAK PERNAH
-- ADA: salah ketik nominal, salah pilih pelanggan, atau satu tagihan tercatat dua
-- kali. Satu-satunya siasat yang tersedia adalah mencatat pembayaran palsu -- yang
-- justru lebih buruk, karena uang yang tidak pernah diterima jadi ikut terhitung.
--
-- INI KOREKSI, BUKAN HAPUS BUKU. Piutang yang nyata tapi diputuskan hangus adalah
-- kejadian lain: itu kerugian, dan mestinya kelihatan sebagai pengeluaran supaya laba
-- bersih ikut turun. Fungsi di sini tidak mencatat pengeluaran apa pun, karena yang
-- dihapus memang bukan uang yang pernah ada.
--
-- DUA HAL YANG SENGAJA DIBEDAKAN:
--
--   1. Baris DEBT_ADD dibatalkan seluruhnya. Baris itu tidak punya guna lain selain
--      mencatat utang; tanpa utangnya, ia tidak menerangkan apa pun.
--
--   2. Baris penjualan yang belum dibayar -- sewa kredit, tukar isi, pembayaran
--      pesanan -- hanya ditandai lunas. Barangnya BENAR-BENAR keluar dan penjualannya
--      benar-benar terjadi; membatalkan barisnya akan menghapus pendapatan yang sah
--      dan, untuk sewa, mengembalikan tabung yang sebenarnya masih di tangan
--      pelanggan. Yang salah cuma status bayarnya, jadi cuma itu yang diperbaiki.
--
-- HANYA ADMINISTRATOR. Berbeda dari pembatalan transaksi -- yang boleh dilakukan
-- Operator sebatas hari ini karena salah ketik ketahuan dalam hitungan menit --
-- menghapus bon menghilangkan tagihan atas nama orang tanpa uang yang berpindah.
-- Tidak ada jendela waktu yang membuatnya aman untuk Operator.
--
-- Pemeriksaan perannya di sini, di dalam fungsi, bukan di layar. Policy RLS memberi
-- setiap akun yang login akses penuh ke members dan transactions (lihat catatan di
-- lib/peran.ts), jadi menyembunyikan tombolnya saja tidak menghalangi siapa pun.

-- ---------------------------------------------------------------------------
-- 1. Jejak penghapusan
--
-- Bernominal NOL dengan sengaja. Seluruh predikat laporan -- pendapatan,
-- pengeluaran, dan daftar tagihan -- berpagar cost > 0, jadi baris ini tidak akan
-- pernah ikut terhitung di mana pun. Yang dibawanya cuma kalimat: siapa, berapa yang
-- dihapus, dan alasannya. Nominalnya ditulis di keterangan, bukan di kolom cost,
-- justru supaya tidak ada satu pun rekap yang tergoda menjumlahkannya.
--
-- Tanpa baris ini, menghapus bon tidak meninggalkan jejak apa pun: totalDebt turun
-- dan tidak ada yang bisa menjawab kenapa. Ini catatan uang orang.
-- ---------------------------------------------------------------------------

create or replace function public.catat_hapus_bon(
  p_member_id text,
  p_jumlah    numeric,
  p_alasan    text,
  p_uid       uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    text := 'th-' || (extract(epoch from clock_timestamp()) * 1000)::bigint
                        || '-' || substr(md5(random()::text), 1, 6);
  v_nama  text;
  v_oleh  text;
begin
  select "companyName" into v_nama from public.members where id = p_member_id;
  select coalesce(name, username) into v_oleh from public.profiles where id = p_uid;

  insert into public.transactions (id, "memberId", type, date, cost, description)
  values (
    v_id,
    p_member_id,
    'DEBT_REMOVED',
    now(),
    0,
    -- Pemisah ribuannya dipatok titik lewat replace, bukan diserahkan ke penanda
    -- golongan G: itu mengikuti lc_numeric server, yang di sini berbahasa Inggris dan
    -- menghasilkan "25,000" -- angka yang dibaca petugas sebagai dua puluh lima koma
    -- nol. Ini kalimat yang dibaca orang, jadi bentuknya harus bentuk yang mereka pakai.
    format('Bon Rp %s dihapus dari %s oleh %s. Alasan: %s',
           replace(to_char(p_jumlah, 'FM999,999,999,999'), ',', '.'),
           coalesce(v_nama, 'pelanggan'),
           coalesce(v_oleh, 'Administrator'),
           coalesce(nullif(btrim(p_alasan), ''), 'tidak disebutkan'))
  );

  return v_id;
end;
$$;

revoke execute on function public.catat_hapus_bon(text, numeric, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Menghapus seluruh sisa bon seorang pelanggan
--
-- Sisa bon diambil dari members.totalDebt, bukan dari menjumlahkan baris UNPAID.
-- Alasannya sama seperti yang tertulis di lib/bon.ts: cicilan menurunkan totalDebt
-- tanpa bisa ditunjuk melunasi tagihan yang mana, jadi jumlah baris UNPAID hampir
-- selalu lebih besar daripada sisa yang sebenarnya. Yang dinolkan sisanya; barisnya
-- ikut dibereskan supaya tidak tertinggal sebagai tagihan tanpa induk.
-- ---------------------------------------------------------------------------

create or replace function public.hapus_bon(p_member_id text, p_alasan text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_peran    text;
  v_member   public.members%rowtype;
  v_sisa     numeric;
  v_dibatal  integer := 0;
  v_dilunasi integer := 0;
  v_jejak    text;
begin
  if v_uid is null then
    raise exception 'Harus login untuk menghapus bon.';
  end if;

  select role into v_peran from public.profiles where id = v_uid;

  if coalesce(v_peran, 'operator') <> 'admin' then
    raise exception 'Hanya Administrator yang boleh menghapus bon.';
  end if;

  if nullif(btrim(coalesce(p_alasan, '')), '') is null then
    raise exception 'Alasan penghapusan wajib diisi.';
  end if;

  -- FOR UPDATE: dua orang menekan Hapus bersamaan tidak boleh menulis dua jejak
  -- untuk satu bon yang sama.
  select * into v_member from public.members where id = p_member_id for update;

  if not found then
    raise exception 'Pelanggan tidak ditemukan.';
  end if;

  v_sisa := coalesce(v_member."totalDebt", 0);

  if v_sisa <= 0 then
    raise exception 'Pelanggan ini tidak punya bon yang bisa dihapus.';
  end if;

  -- Baris bon murni: dibatalkan seluruhnya, karena tidak menerangkan apa pun selain
  -- utang yang barusan dihapus.
  update public.transactions
  set "voidedAt" = now(), "voidedBy" = v_uid,
      "voidReason" = format('Bon dihapus: %s', btrim(p_alasan))
  where "memberId" = p_member_id
    and type = 'DEBT_ADD'
    and "paymentStatus" = 'UNPAID'
    and "voidedAt" is null;

  get diagnostics v_dibatal = row_count;

  -- Baris penjualan: barangnya sudah keluar, jadi barisnya tetap hidup dan
  -- pendapatannya tetap terhitung. Yang berubah cuma status bayarnya.
  update public.transactions
  set "paymentStatus" = 'PAID'
  where "memberId" = p_member_id
    and type <> 'DEBT_ADD'
    and "paymentStatus" = 'UNPAID'
    and "voidedAt" is null;

  get diagnostics v_dilunasi = row_count;

  update public.members set "totalDebt" = 0 where id = p_member_id;

  v_jejak := public.catat_hapus_bon(p_member_id, v_sisa, p_alasan, v_uid);

  return jsonb_build_object(
    'memberId', p_member_id,
    'dihapus', v_sisa,
    'barisDibatalkan', v_dibatal,
    'barisDitandaiLunas', v_dilunasi,
    'jejakId', v_jejak
  );
end;
$$;

revoke execute on function public.hapus_bon(text, text) from public, anon;
grant  execute on function public.hapus_bon(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Menghapus satu baris tagihan
--
-- Untuk salah catat yang cuma mengenai satu tagihan, bukan seluruh bon pelanggan.
--
-- Sisa bon dikurangi sebesar baris itu dan dijepit di nol. Menjepitnya perlu karena
-- totalDebt dan jumlah baris UNPAID memang tidak selalu sama -- lihat catatan di
-- fungsi sebelumnya. Akibat yang harus diterima: kalau sisanya jatuh ke nol padahal
-- masih ada baris UNPAID lain, pelanggannya hilang dari daftar bon. Itu keadaan yang
-- sudah ada sebelum fungsi ini, bukan yang dibuatnya.
-- ---------------------------------------------------------------------------

create or replace function public.hapus_baris_bon(p_id text, p_alasan text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_peran  text;
  v_tx     public.transactions%rowtype;
  v_sisa   numeric;
  v_baru   numeric;
  v_jejak  text;
begin
  if v_uid is null then
    raise exception 'Harus login untuk menghapus bon.';
  end if;

  select role into v_peran from public.profiles where id = v_uid;

  if coalesce(v_peran, 'operator') <> 'admin' then
    raise exception 'Hanya Administrator yang boleh menghapus bon.';
  end if;

  if nullif(btrim(coalesce(p_alasan, '')), '') is null then
    raise exception 'Alasan penghapusan wajib diisi.';
  end if;

  select * into v_tx from public.transactions where id = p_id for update;

  if not found then
    raise exception 'Tagihan tidak ditemukan.';
  end if;

  if v_tx."voidedAt" is not null then
    raise exception 'Tagihan ini sudah dibatalkan sebelumnya.';
  end if;

  if v_tx."paymentStatus" is distinct from 'UNPAID' or coalesce(v_tx.cost, 0) <= 0 then
    raise exception 'Baris ini bukan tagihan yang belum dibayar.';
  end if;

  if v_tx."memberId" is null then
    raise exception 'Tagihan ini tidak menunjuk pelanggan mana pun.';
  end if;

  select coalesce("totalDebt", 0) into v_sisa
  from public.members where id = v_tx."memberId" for update;

  v_baru := greatest(0, v_sisa - v_tx.cost);
  update public.members set "totalDebt" = v_baru where id = v_tx."memberId";

  if v_tx.type = 'DEBT_ADD' then
    update public.transactions
    set "voidedAt" = now(), "voidedBy" = v_uid,
        "voidReason" = format('Bon dihapus: %s', btrim(p_alasan))
    where id = p_id;
  else
    update public.transactions set "paymentStatus" = 'PAID' where id = p_id;
  end if;

  v_jejak := public.catat_hapus_bon(v_tx."memberId", v_tx.cost, p_alasan, v_uid);

  return jsonb_build_object(
    'id', p_id,
    'jenis', v_tx.type,
    'dihapus', v_tx.cost,
    'sisaBon', v_baru,
    'jejakId', v_jejak
  );
end;
$$;

revoke execute on function public.hapus_baris_bon(text, text) from public, anon;
grant  execute on function public.hapus_baris_bon(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_fungsi  integer;
  v_penjaga integer;
begin
  select count(*) into v_fungsi from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hapus_bon', 'hapus_baris_bon', 'catat_hapus_bon');

  if v_fungsi <> 3 then raise exception 'Fungsi hapus bon diharapkan 3, dapat %', v_fungsi; end if;

  -- Penjaga peran adalah seluruh alasan fungsi ini ada di database dan bukan di
  -- browser, jadi keberadaannya diperiksa dari isi definisinya -- bukan dianggap
  -- sudah pasti ada karena barusan ditulis.
  select count(*) into v_penjaga from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('hapus_bon', 'hapus_baris_bon')
     and pg_get_functiondef(p.oid) like '%Hanya Administrator yang boleh menghapus bon%';

  if v_penjaga <> 2 then raise exception 'Penjaga peran hilang dari % fungsi hapus bon', 2 - v_penjaga; end if;

  raise notice 'Migration OK: penghapusan bon siap, hanya untuk Administrator';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (jalankan hanya jika app rusak setelah migration ini)
-- ---------------------------------------------------------------------------
-- drop function if exists public.hapus_baris_bon(text, text);
-- drop function if exists public.hapus_bon(text, text);
-- drop function if exists public.catat_hapus_bon(text, numeric, text, uuid);
