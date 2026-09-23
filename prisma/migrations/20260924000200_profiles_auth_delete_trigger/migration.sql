-- A cross-schema FK (profiles → auth.users) breaks `prisma migrate diff --from-config-datasource`
-- (P4002). Replace it with a trigger giving the same ON DELETE CASCADE behaviour.
-- Note: deletion is still blocked (FK RESTRICT) for users who have orders — history is kept.

alter table public.profiles drop constraint profiles_id_fkey;

create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

revoke all on function public.handle_user_deleted() from public, anon, authenticated;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_user_deleted();
