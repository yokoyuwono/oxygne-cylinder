-- Metode bayar untuk baris pemasukan.
--
-- Laporan Harian melaporkan satu angka "Pemasukan" gelondongan. Angka itu memberi
-- tahu berapa yang masuk hari itu, tapi tidak lewat mana -- uang di laci dan uang di
-- rekening menumpuk jadi satu bilangan, sehingga saldo kas fisik tidak pernah bisa
-- dicocokkan dengan catatan.
--
-- Kolom ini menampung metodenya (tunai atau transfer), sehingga total tadi bisa
-- dipecah di Laporan Harian. Sifatnya murni penandaan: tidak menyentuh stok, deposit,
-- bon, maupun alur mana pun. Daftar metodenya sendiri tetap di kode
-- (lib/metodeBayar.ts), dengan alasan yang sama seperti daftar pos belanja di
-- 20260815090000 -- dua baris konstanta belum sepadan dengan satu tabel master.
--
-- Kosong untuk seluruh catatan lama, untuk sewa yang dibayar nanti (paymentStatus
-- 'UNPAID' -- uangnya memang belum berpindah, jadi belum ada metodenya), dan untuk
-- baris yang bukan pemasukan. Rekapnya memperlakukan yang kosong sebagai kelompok
-- tersendiri, jadi tidak ada baris yang hilang dari hitungan. Karena itu kolom ini
-- nullable dan tetap kosong untuk sebagian besar baris, mengikuti pola kolom lain di
-- tabel ini yang cuma bermakna untuk sebagian jenis (quantity, size, description,
-- category).

-- ---------------------------------------------------------------------------
-- 1. Metode bayar untuk baris pemasukan
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists "paymentMethod" text;

-- Sengaja tanpa CHECK constraint maupun enum, sama seperti kolom `type` dan
-- `category`: daftar metode hidup di kode dan bisa bertambah (QRIS, kartu debit),
-- sementara baris lama harus tetap terbaca apa adanya. Nilai yang tidak dikenal
-- jatuh ke kelompok "Tidak Dicatat" saat direkap, bukan menolak simpan atau
-- memutus pemuatan laporan.

-- ---------------------------------------------------------------------------
-- 2. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_kolom integer;
begin
  select count(*) into v_kolom from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions'
      and column_name = 'paymentMethod';

  if v_kolom <> 1 then raise exception 'Kolom paymentMethod diharapkan 1, dapat %', v_kolom; end if;

  raise notice 'Migration OK: transactions.paymentMethod siap menampung metode bayar';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- alter table public.transactions drop column if exists "paymentMethod";
