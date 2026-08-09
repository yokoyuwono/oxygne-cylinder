-- Menaikkan pemilik sistem jadi admin, dan memperbaiki handle_new_user().
--
-- Masalah: handle_new_user() selalu memberi role 'operator' ke setiap user baru,
-- termasuk user pertama. Akibatnya belum pernah ada satu pun akun ber-role 'admin',
-- sehingga menu User Management (App.tsx:599, Layout.tsx:117 yang mengecek
-- role === UserRole.Admin) tidak pernah muncul dan penambahan staf hanya bisa
-- lewat Dashboard Supabase.
--
-- Perbaikan:
--   1. user pertama (saat tabel profiles masih kosong) otomatis jadi 'admin'
--   2. akun pemilik yang sudah ada dinaikkan jadi 'admin'

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text;
begin
  -- User pertama yang terdaftar memegang sistem, jadi dia admin.
  -- Staf berikutnya masuk sebagai operator dan dinaikkan manual bila perlu.
  v_role := case
    when exists (select 1 from public.profiles) then 'operator'
    else 'admin'
  end;

  insert into public.profiles ("id", "username", "name", "role")
  values (new.id, new.email, 'New User', v_role);
  return new;
end;
$function$;

-- create or replace mempertahankan ACL, tapi ditegaskan ulang supaya tidak
-- bergantung pada perilaku itu.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

update public.profiles
set role = 'admin'
where username = 'admin@gmail.com';

do $$
declare v_admin integer;
begin
  select count(*) into v_admin from public.profiles where role = 'admin';
  if v_admin <> 1 then
    raise exception 'Diharapkan tepat 1 admin, dapat %', v_admin;
  end if;
  raise notice 'Role admin OK';
end $$;
