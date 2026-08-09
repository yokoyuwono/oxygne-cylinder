-- Menutup akses anonim ke seluruh data.
--
-- Keadaan sebelum migration ini:
--   * ketujuh tabel punya policy `for all to public using (true)`
--   * role `anon` punya grant SELECT/INSERT/UPDATE/DELETE/TRUNCATE
--   * anon key ada di bundle JS publik
--   => siapa pun bisa membaca dan menghapus seluruh data tanpa login.
--
-- Yang diubah:
--   1. policy dipersempit dari role `public` ke `authenticated`
--   2. grant tabel dicabut dari `anon`
--   3. handle_new_user() diberi search_path tetap, EXECUTE dicabut dari anon/authenticated
--
-- Perilaku untuk user yang sudah login TIDAK berubah: policy tetap `using (true)`,
-- hanya rolenya yang dipersempit. App tidak pernah query tabel sebelum login
-- (lihat App.tsx checkSession/handleLogin), jadi tidak ada jalur yang putus.
--
-- Rollback ada di bagian bawah file (dikomentari).

begin;

-- ---------------------------------------------------------------------------
-- 1. Policy: public -> authenticated
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'members','refill_stations','cylinders',
    'member_prices','refill_prices','transactions','profiles'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'Enable all access for all users', t);
    execute format('drop policy if exists %I on public.%I', 'authenticated_full_access', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      'authenticated_full_access', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Cabut grant dari anon
--
-- service_role sengaja dibiarkan utuh (dipakai akses admin/server-side).
-- ---------------------------------------------------------------------------

revoke all on public.members         from anon;
revoke all on public.refill_stations from anon;
revoke all on public.cylinders       from anon;
revoke all on public.member_prices   from anon;
revoke all on public.refill_prices   from anon;
revoke all on public.transactions    from anon;
revoke all on public.profiles        from anon;

-- Tabel baru yang dibuat kemudian tidak otomatis ter-grant ke anon.
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- 3. Hardening handle_new_user()
--
-- Linter 0011: search_path mutable pada fungsi SECURITY DEFINER.
-- Linter 0028/0029: fungsi bisa dipanggil anon/authenticated via /rest/v1/rpc.
-- Fungsi ini hanya dipakai sebagai trigger, jadi EXECUTE tidak perlu diberikan
-- ke siapa pun -- trigger tetap jalan karena dieksekusi dalam konteks owner.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.profiles ("id", "username", "name", "role")
  values (new.id, new.email, 'New User', 'operator');
  return new;
end;
$function$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

commit;

-- ---------------------------------------------------------------------------
-- ROLLBACK (jalankan hanya jika app rusak setelah migration ini)
-- ---------------------------------------------------------------------------
-- begin;
-- do $$
-- declare t text;
-- begin
--   foreach t in array array[
--     'members','refill_stations','cylinders',
--     'member_prices','refill_prices','transactions','profiles'
--   ] loop
--     execute format('drop policy if exists %I on public.%I', 'authenticated_full_access', t);
--     execute format(
--       'create policy %I on public.%I for all to public using (true)',
--       'Enable all access for all users', t
--     );
--     execute format('grant all on public.%I to anon', t);
--   end loop;
-- end $$;
-- commit;
