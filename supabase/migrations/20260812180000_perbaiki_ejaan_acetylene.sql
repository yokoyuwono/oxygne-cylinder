-- 256 tabung ber-gasType 'Acetyline' -- salah eja.
--
-- Nilai sah di types.ts adalah GasType.Acetylene = 'Acetylene (C2H2)', jadi 256 baris
-- itu tidak cocok dengan nilai enum mana pun. Akibatnya bukan sekadar tampilan:
-- gasStokKritis (lib/beranda.ts:51) menghitung per-gasType mentah lalu menyaring
-- hasilnya lewat Object.values(GasType), sehingga 256 tabung itu tidak pernah ikut.
--
-- Peringatan "Stok siap sewa menipis untuk Acetylene" di Beranda karena itu dihitung
-- dari 6 tabung dengan 1 siap sewa, padahal kenyataannya 262 tabung dengan 63 siap
-- sewa. Peringatannya keliru, dan grafik Persediaan per Jenis Gas juga melewatkan
-- mereka.
--
-- Diperbaiki di data, bukan di kode: kodenya sudah benar, ejaannya yang salah.
--
-- rental_tariffs sengaja TIDAK disentuh. Tarif rt-ace-6m3 memakai ejaan lama, tapi
-- membetulkannya melanggar index unik (gasType, size) karena rt-c2h2-6m3 sudah
-- memakai ejaan yang benar untuk kombinasi yang sama -- keduanya kembaran, dan
-- keduanya sudah nonaktif sehingga tidak dipakai perhitungan mana pun. Menghapus
-- salah satunya urusan terpisah yang tidak perlu dibonceng ke sini.

update public.cylinders set "gasType" = 'Acetylene (C2H2)' where "gasType" = 'Acetyline';

do $$
declare v_sisa integer; v_acet integer; v_siap integer;
begin
  select count(*) into v_sisa from public.cylinders where "gasType" = 'Acetyline';
  if v_sisa <> 0 then raise exception 'Masih ada % tabung ber-ejaan lama', v_sisa; end if;

  select count(*) into v_sisa from public.cylinders
   where "gasType" is not null
     and "gasType" not in ('Oxygen','Acetylene (C2H2)','Argon','CO2','Nitrogen','Helium',
                           'Hydrogen','LPG','Propane','Methane','Butane','Medical Oxygen',
                           'Medical Air','Nitrous Oxide','Sulfur Hexafluoride (SF6)',
                           'Ammonia','Chlorine','Mix Gas','Other');
  if v_sisa <> 0 then raise exception 'Ada % tabung ber-gasType di luar enum', v_sisa; end if;

  select count(*), count(*) filter (where status = 'Available') into v_acet, v_siap
  from public.cylinders where "gasType" = 'Acetylene (C2H2)';

  if v_acet <> 262 then raise exception 'Acetylene diharapkan 262, dapat %', v_acet; end if;

  raise notice 'Ejaan gas OK: Acetylene % tabung, % siap sewa', v_acet, v_siap;
end $$;
