-- Hapus data uji yang tertinggal di produksi.
--
-- Saat memverifikasi alur stok curah, transaksi uji dibuat langsung di database
-- produksi dan tidak dihapus sebelum pemilik mulai memakai sistemnya. Akibatnya
-- muncul pemasukan Rp 600.000 atas nama Ade Novansyah yang bukan berasal dari
-- input pemilik, dan namanya naik ke peringkat 2 Sumber Pendapatan Teratas.
--
-- Yang dihapus:
--   t-tukar-1786333742796   tukar isi 2 botol Rp 100.000  -- uji
--   t-new-1786334845469-0   sewa 2 botol Rp 600.000       -- uji
--   t-new-1786331171448-0   sewa 1 botol Rp 300.000       -- trial 9/8, atas permintaan pemilik
--
-- Yang DIPERTAHANKAN (transaksi asli hari ini):
--   t-tukar-1786335200002   tukar isi 1 botol Rp 50.000
--   t-new-1786335305685-0   sewa 1 botol Rp 300.000
--
-- Member Ade dan harga khususnya tidak disentuh -- dia pelanggan sungguhan.

delete from public.transactions
where id in (
  't-tukar-1786333742796',
  't-new-1786334845469-0',
  't-new-1786331171448-0'
);

-- Deposit menyisakan satu sewa asli hari ini saja.
update public.members set "totalDeposit" = 250000 where id = 'm-1786331169504';

-- Stok kembali ke 10, jumlah botol yang benar-benar ada di toko menurut pemilik.
-- Sempat turun jadi 7 karena sewa uji memotong 2 dan sewa asli memotong 1.
-- Angka ini berarti botol di toko; 1 botol yang dipegang Ade dihitung terpisah
-- lewat selisih transaksi.
update public.rental_tariffs
set "stockQty" = 10
where kind = 'CYLINDER' and "gasType" = 'Oxygen' and size = '1m3';

do $$
declare
  v_tx      integer;
  v_tx_ade  integer;
  v_deposit numeric;
  v_pegang  integer;
  v_tukar   integer;
  v_stok    integer;
  v_tabung  integer;
begin
  select count(*) into v_tx     from public.transactions;
  select count(*) into v_tx_ade from public.transactions where "memberId" = 'm-1786331169504';
  select "totalDeposit" into v_deposit from public.members where id = 'm-1786331169504';
  select coalesce(sum(case when type = 'RENTAL_OUT' then quantity when type = 'RETURN' then -quantity end), 0)
    into v_pegang from public.transactions
    where "memberId" = 'm-1786331169504' and "cylinderId" is null and size = '1m3';
  select count(*) into v_tukar  from public.transactions where type = 'GAS_EXCHANGE';
  select "stockQty" into v_stok from public.rental_tariffs
    where kind = 'CYLINDER' and "gasType" = 'Oxygen' and size = '1m3';
  select count(*) into v_tabung from public.cylinders;

  if v_tx      <> 324    then raise exception 'Total transaksi % (harus 324)', v_tx; end if;
  if v_tx_ade  <> 1      then raise exception 'Transaksi Ade % (harus 1)', v_tx_ade; end if;
  if v_deposit <> 250000 then raise exception 'Deposit Ade % (harus 250000)', v_deposit; end if;
  if v_pegang  <> 1      then raise exception 'Botol dipegang Ade % (harus 1)', v_pegang; end if;
  if v_tukar   <> 1      then raise exception 'Tukar isi % (harus 1)', v_tukar; end if;
  if v_stok    <> 10     then raise exception 'Stok 1m3 % (harus 10)', v_stok; end if;
  if v_tabung  <> 1829   then raise exception 'Tabung berkode % (harus 1829)', v_tabung; end if;

  raise notice 'Pembersihan OK: data uji hilang, transaksi asli utuh';
end $$;
