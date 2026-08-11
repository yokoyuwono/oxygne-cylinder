-- Catat pengeluaran operasional -- galon air, ATK, tambahan solar mobil.
--
-- Sebelum ini satu-satunya pengeluaran yang tercatat adalah biaya isi ulang ke
-- vendor (REFILL_IN), sehingga "Total Pengeluaran" dan "Laba Bersih" di halaman
-- Keuangan melaporkan laba lebih besar dari kenyataan: seluruh belanja harian
-- toko tidak pernah masuk hitungan.
--
-- Pengeluaran disimpan sebagai baris transactions ber-type 'EXPENSE', bukan tabel
-- tersendiri. Seluruh pelaporan aplikasi -- rekap Keuangan, tren bulanan, Laporan
-- Harian, Riwayat Aktivitas, Beranda -- membaca dari satu array transaksi yang
-- sama; tabel terpisah menuntut setiap tempat itu menggabungkan dua sumber, dan
-- satu penggabungan yang terlewat langsung jadi angka yang diam-diam berselisih.
--
-- Kolom `type` memang text tanpa CHECK constraint maupun enum, jadi nilai jenis
-- baru tidak menuntut perubahan skema sama sekali. Yang benar-benar kurang hanya
-- tempat menyimpan keterangannya: sampai sekarang tidak ada satu pun kolom teks
-- bebas di transactions, karena setiap baris selalu bisa dijelaskan lewat tabung,
-- pelanggan, atau vendor yang direferensikannya. Baris pengeluaran tidak punya
-- ketiganya -- hanya kalimat yang diketik admin.

-- ---------------------------------------------------------------------------
-- 1. Keterangan bebas untuk baris pengeluaran
--
-- Nullable dan hanya terisi untuk type = 'EXPENSE', mengikuti pola kolom lain di
-- tabel ini yang cuma bermakna untuk sebagian jenis (quantity, size, regulatorQty).
-- ---------------------------------------------------------------------------

alter table public.transactions add column if not exists "description" text;

-- ---------------------------------------------------------------------------
-- 2. Pemeriksaan
-- ---------------------------------------------------------------------------

do $$
declare
  v_kolom integer;
begin
  select count(*) into v_kolom from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions'
      and column_name = 'description';

  if v_kolom <> 1 then raise exception 'Kolom description diharapkan 1, dapat %', v_kolom; end if;

  raise notice 'Migration OK: transactions.description siap menampung keterangan pengeluaran';
end $$;
