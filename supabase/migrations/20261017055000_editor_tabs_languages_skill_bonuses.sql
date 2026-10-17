
-- M1.1 catalog editor: extensible languages + race/class starting skill bonuses.
create table public.game_locales(
 code text primary key check (code ~ '^[a-z]{2}(-[A-Z]{2})?$'),
 native_name text not null check (char_length(btrim(native_name)) between 2 and 80),
 name_en text not null check (char_length(btrim(name_en)) between 2 and 80),
 is_enabled boolean not null default true,
 sort_order integer not null default 100
);
insert into public.game_locales(code,native_name,name_en,sort_order) values
 ('hu','Magyar','Hungarian',0),('en','English','English',1);
alter table public.game_locales enable row level security;
create policy locales_read on public.game_locales for select to authenticated using (true);
create policy locales_insert on public.game_locales for insert to authenticated with check ((select private.can_edit_content()));
create policy locales_update on public.game_locales for update to authenticated using ((select private.can_edit_content())) with check ((select private.can_edit_content()));
-- Do not permit deleting locales which may already be referenced.
revoke all on public.game_locales from anon, authenticated;
grant select, insert, update on public.game_locales to authenticated;

create table public.game_species_skill_bonuses(
 species_id uuid not null references public.game_species(id) on delete cascade,
 skill_id uuid not null references public.game_skills(id) on delete cascade,
 bonus_pips smallint not null check (bonus_pips between 1 and 12),
 primary key(species_id,skill_id)
);
create table public.game_classes_skill_bonuses(
 class_id uuid not null references public.game_classes(id) on delete cascade,
 skill_id uuid not null references public.game_skills(id) on delete cascade,
 bonus_pips smallint not null check (bonus_pips between 1 and 12),
 primary key(class_id,skill_id)
);
alter table public.game_species_skill_bonuses enable row level security;
alter table public.game_classes_skill_bonuses enable row level security;
create policy species_skill_read on public.game_species_skill_bonuses for select to authenticated
 using (exists (select 1 from public.game_species p where p.id=species_id));
create policy classes_skill_read on public.game_classes_skill_bonuses for select to authenticated
 using (exists (select 1 from public.game_classes p where p.id=class_id));
-- Explicit edit rights, enforced independent of the client/UI.
create policy species_skill_insert on public.game_species_skill_bonuses for insert to authenticated
 with check ((select private.can_edit_content()));
create policy species_skill_update on public.game_species_skill_bonuses for update to authenticated
 using ((select private.can_edit_content())) with check ((select private.can_edit_content()));
create policy species_skill_delete on public.game_species_skill_bonuses for delete to authenticated
 using ((select private.can_edit_content()));
create policy classes_skill_insert on public.game_classes_skill_bonuses for insert to authenticated
 with check ((select private.can_edit_content()));
create policy classes_skill_update on public.game_classes_skill_bonuses for update to authenticated
 using ((select private.can_edit_content())) with check ((select private.can_edit_content()));
create policy classes_skill_delete on public.game_classes_skill_bonuses for delete to authenticated
 using ((select private.can_edit_content()));
revoke all on public.game_species_skill_bonuses,public.game_classes_skill_bonuses from anon,authenticated;
grant select,insert,update,delete on public.game_species_skill_bonuses, public.game_classes_skill_bonuses to authenticated;

-- One transaction replaces all current bonuses for a single entity.
-- SECURITY INVOKER: the same editor-only RLS still applies.
create or replace function public.replace_catalog_skill_bonuses(
 p_kind text, p_entity_id uuid, p_bonuses jsonb
)
returns void language plpgsql security invoker set search_path=''
as $$
declare
  v jsonb;
  v_skill uuid;
  v_pips integer;
  v_count integer;
begin
  if (select auth.uid()) is null or not (select private.can_edit_content()) then
    raise exception 'Editor permission required' using errcode='42501';
  end if;
  if p_bonuses is null or jsonb_typeof(p_bonuses)<>'array' then
    raise exception 'Expected skill bonus array';
  end if;
  v_count=jsonb_array_length(p_bonuses);
  if v_count > 25 then raise exception 'Too many skill bonuses'; end if;
  if p_kind='species' then
    if not exists(select 1 from public.game_species where id=p_entity_id) then
      raise exception 'Species not found';
    end if;
    delete from public.game_species_skill_bonuses where species_id=p_entity_id;
  elsif p_kind='classes' then
    if not exists(select 1 from public.game_classes where id=p_entity_id) then
      raise exception 'Class not found';
    end if;
    delete from public.game_classes_skill_bonuses where class_id=p_entity_id;
  else
    raise exception 'Invalid editor kind';
  end if;
  for v in select value from jsonb_array_elements(p_bonuses) loop
    if jsonb_typeof(v)<>'object' then raise exception 'Invalid bonus row'; end if;
    v_skill = (v->>'skill_id')::uuid;
    v_pips = (v->>'bonus_pips')::integer;
    if v_pips<1 or v_pips>12 or not exists(select 1 from public.game_skills where id=v_skill) then
      raise exception 'Invalid skill or bonus range';
    end if;
    if p_kind='species' then
      insert into public.game_species_skill_bonuses(species_id,skill_id,bonus_pips)
      values(p_entity_id,v_skill,v_pips);
    else
      insert into public.game_classes_skill_bonuses(class_id,skill_id,bonus_pips)
      values(p_entity_id,v_skill,v_pips);
    end if;
  end loop;
end;
$$;
revoke all on function public.replace_catalog_skill_bonuses(text,uuid,jsonb) from public,anon;
grant execute on function public.replace_catalog_skill_bonuses(text,uuid,jsonb) to authenticated;
