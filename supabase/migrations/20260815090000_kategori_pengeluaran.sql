-- Pos belanja untuk pengeluaran operasional.
--
-- Sejak 20260811103000 pengeluaran tercatat sebagai baris transactions ber-type
-- 'EXPENSE' dengan keterangan bebas. Yang terbaca di halaman Keuangan sejauh ini
-- hanya satu angka gelondongan: "Total Pengeluaran". Angka itu memberi tahu berapa
-- yang keluar, tapi tidak pernah ke mana -- solar mobil, gaji, dan galon air
-- menumpuk jadi satu bilangan yang tidak bisa ditindaklanjuti.
--
-- Kolom ini menampung pos belanjanya, sehingga total tadi bisa dipecah per pos di
-- tab Keuangan. Daftar posnya sendiri tetap di kode (lib/pengeluaran.ts), bukan
-- tabel master: isinya jarang berubah, dan tabel tersendiri menuntut satu halaman
-- pengelolaan yang belum sepadan dengan tujuh baris konstanta.
--
-- Yang dicatat lewat halaman /kas sengaja tidak diberi pilihan pos -- di sana
-- Operator mencatat belanja harian secepat mungkin, dan menambah satu pilihan wajib
-- memperlambat jalur yang paling sering dipakai. Barisnya masuk pos "Lain-lain" di
-- rekap. Karena itu kolom ini nullable dan tetap kosong untuk sebagian besar baris,
-- mengikuti pola kolom lain di tabel ini yang cuma bermakna untuk sebagian jenis
-- (quantity, size, regulatorQty, description).

-- ---------------------------------------------------------------------------
-- 1. Pos belanja untuk baris pengeluaran
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists "category" text;

-- Sengaja tanpa CHECK constraint maupun enum, sama seperti kolom `type`: daftar pos
-- hidup di kode dan sesekali bertambah, sementara baris lama harus tetap terbaca
-- apa adanya. Nilai yang tidak dikenal jatuh ke "Lain-lain" saat direkap, bukan
-- menolak simpan atau memutus pemuatan laporan.

-- ---------------------------------------------------------------------------
-- 2. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_kolom integer;
begin
  select count(*) into v_kolom from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions'
      and column_name = 'category';

  if v_kolom <> 1 then raise exception 'Kolom category diharapkan 1, dapat %', v_kolom; end if;

  raise notice 'Migration OK: transactions.category siap menampung pos belanja';
end $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- ---------------------------------------------------------------------------
-- alter table public.transactions drop column if exists "category";
