-- Applied to project lsodhqokudnfriosqqfe at 2026-10-16 21:13 UTC
create type public.app_role as enum ('user','editor','admin');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(char_length(display_name)<=60),
 preferred_locale text not null default 'hu' check(preferred_locale in('hu','en')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role public.app_role not null default 'user',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.user_roles where user_id=(select auth.uid()) and role='admin'::public.app_role)$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name,preferred_locale) values (
 new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),60),
 case when new.raw_user_meta_data->>'preferred_locale'='en' then 'en' else 'hu' end
 );
 insert into public.user_roles(user_id,role) values(new.id,'user'::public.app_role);
 return new;
end;$$;
revoke all on function private.handle_new_user() from public,anon,authenticated;
create trigger hatarvilag_auth_user_created after insert on auth.users
 for each row execute function private.handle_new_user();
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
create policy "profiles_read_own_or_admin" on public.profiles for select to authenticated
 using ((select auth.uid())=id or (select private.is_admin()));
create policy "profiles_update_own" on public.profiles for update to authenticated
 using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy "roles_read_own_or_admin" on public.user_roles for select to authenticated
 using ((select auth.uid())=user_id or (select private.is_admin()));
revoke all on public.profiles from anon,authenticated;
revoke all on public.user_roles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(display_name,preferred_locale) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
comment on table public.user_roles is 'Source of truth for authorization; never trust user_metadata for roles.';
