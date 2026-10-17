
-- M1.2 Space D6-inspired game balance and character creation.
alter table public.game_skills add column if not exists icon_path text
  check(icon_path is null or icon_path ~ '^hatarvilag/skills/[a-z0-9_-]+\.(webp|png|jpg)$');
alter table public.game_skills_i18n add column if not exists description text not null default '';
alter table public.game_skills add constraint skill_slot_combat_consistency check (is_combat = (position=5));
-- The assignment slots are fixed (four noncombat and one combat for each of five attributes).
create or replace function private.lock_skill_slot() returns trigger language plpgsql set search_path='' as $$
begin
  if new.attribute is distinct from old.attribute or new.position is distinct from old.position
     or new.is_combat is distinct from old.is_combat
  then raise exception 'Skill slot and combat category are immutable'; end if;
  return new;
end $$;
create trigger lock_skill_slot before update on public.game_skills
 for each row execute function private.lock_skill_slot();

create table public.game_rules (
 id integer primary key default 1 check(id=1),
 base_attribute_pips integer not null default 3 check(base_attribute_pips between 3 and 9),
 free_attribute_pips integer not null default 6 check(free_attribute_pips between 0 and 24),
 max_attribute_pips integer not null default 18 check(max_attribute_pips between 9 and 30),
 free_skill_pips integer not null default 6 check(free_skill_pips between 0 and 30),
 max_allocated_skill_pips integer not null default 6 check(max_allocated_skill_pips between 1 and 12),
 updated_at timestamptz not null default now()
);
insert into public.game_rules(id) values (1);
alter table public.game_rules enable row level security;
create policy rules_read on public.game_rules for select to authenticated using(true);
create policy rules_update on public.game_rules for update to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
revoke all on public.game_rules from anon,authenticated;
grant select on public.game_rules to authenticated;
grant update(base_attribute_pips,free_attribute_pips,max_attribute_pips,free_skill_pips,max_allocated_skill_pips) on public.game_rules to authenticated;

create table public.game_starter_ships(
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 image_path text check (image_path is null or image_path like 'hatarvilag/%'),
 hull integer not null check(hull>0),
 cargo integer not null check(cargo>=0),
 speed integer not null check(speed>0),
 is_published boolean not null default true
);
create table public.game_starter_ships_i18n(
 ship_id uuid not null references public.game_starter_ships(id) on delete cascade,
 locale text not null references public.game_locales(code),
 name text not null, description text not null default '',
 primary key(ship_id,locale)
);
insert into public.game_starter_ships(slug,hull,cargo,speed) values
 ('vagabond',100,80,5),('sparrow',70,40,9),('bastion',155,55,3);
insert into public.game_starter_ships_i18n(ship_id,locale,name,description)
select id,v.locale,v.name,v.descr from
(values ('vagabond','hu','Vándor','Kiegyensúlyozott, sokoldalú felfedező hajó.'),
        ('vagabond','en','Wanderer','Balanced multipurpose exploration vessel.'),
        ('sparrow','hu','Vércse','Gyors, könnyű felderítő hajó.'),
        ('sparrow','en','Kestrel','Fast, lightweight scouting vessel.'),
        ('bastion','hu','Bástya','Lassú, de erősen páncélozott járőrhajó.'),
        ('bastion','en','Bastion','Slow but heavily armored patrol ship.')) v(slug,locale,name,descr)
join public.game_starter_ships s on s.slug=v.slug;
alter table public.game_starter_ships enable row level security;
alter table public.game_starter_ships_i18n enable row level security;
create policy ships_select on public.game_starter_ships for select to authenticated
 using (is_published or (select private.can_edit_content()));
create policy ships_i18n_select on public.game_starter_ships_i18n for select to authenticated
 using (exists(select 1 from public.game_starter_ships s where s.id=ship_id));
revoke all on public.game_starter_ships,public.game_starter_ships_i18n from anon,authenticated;
grant select on public.game_starter_ships,public.game_starter_ships_i18n to authenticated;

create table public.characters(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 captain_name text not null check(length(btrim(captain_name)) between 2 and 40),
 species_id uuid not null references public.game_species(id),
 class_id uuid not null references public.game_classes(id),
 starter_ship_id uuid not null references public.game_starter_ships(id),
 attribute_pips jsonb not null,
 skill_bonus_pips jsonb not null,
 created_at timestamptz not null default now()
);
create table public.character_crew (
 id uuid primary key default gen_random_uuid(),
 character_id uuid not null references public.characters(id) on delete cascade,
 position text not null check(position in ('pilot','navigator')),
 name text not null,
 unique(character_id,position)
);
alter table public.characters enable row level security;
alter table public.character_crew enable row level security;
create policy characters_select_own on public.characters for select to authenticated
 using ((select auth.uid())=user_id);
create policy crew_select_own on public.character_crew for select to authenticated
 using (exists (select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.characters,public.character_crew from anon,authenticated;
grant select on public.characters,public.character_crew to authenticated;

-- All game calculations and inserts are server-owned; client cannot set authoritative stats.
create or replace function public.create_captain(
 p_name text,p_species uuid,p_class uuid,p_ship uuid,
 p_attribute_points jsonb,p_skill_points jsonb
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_user uuid := auth.uid();
 v_rule public.game_rules%rowtype;
 v_species public.game_species%rowtype;
 v_class public.game_classes%rowtype;
 v_attrs jsonb := '{}'::jsonb;
 v_skills jsonb := '{}'::jsonb;
 v_key text;
 v_extra integer;
 v_total integer := 0;
 v_value integer;
 v_alloc integer;
 v_skill record;
 v_species_bonus integer;
 v_class_bonus integer;
 v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if exists(select 1 from public.characters where user_id=v_user) then
    raise exception 'Captain already exists' using errcode='23505';
 end if;
 if length(btrim(coalesce(p_name,''))) not between 2 and 40 then raise exception 'Invalid captain name'; end if;
 select * into strict v_rule from public.game_rules where id=1;
 select * into v_species from public.game_species where id=p_species and is_published;
 if not found then raise exception 'Invalid species'; end if;
 select * into v_class from public.game_classes where id=p_class and is_published;
 if not found then raise exception 'Invalid class'; end if;
 if not exists(select 1 from public.game_starter_ships where id=p_ship and is_published) then
   raise exception 'Invalid starter ship';
 end if;
 if jsonb_typeof(p_attribute_points) is distinct from 'object' or jsonb_typeof(p_skill_points) is distinct from 'object' then
   raise exception 'Allocations must be JSON objects';
 end if;
 if (select count(*) from jsonb_object_keys(p_attribute_points)) > 5 then raise exception 'Too many attributes'; end if;
 for v_key in select unnest(array['body','mind','soul','morale','social']) loop
   if p_attribute_points ? v_key then
     if jsonb_typeof(p_attribute_points->v_key) <> 'number' or (p_attribute_points->>v_key) !~ '^[0-9]+$'
       then raise exception 'Attribute points must be integers'; end if;
   end if;
   v_extra := coalesce((p_attribute_points->>v_key)::integer,0);
   if v_extra<0 or v_extra>v_rule.free_attribute_pips then raise exception 'Invalid attribute allocation'; end if;
   v_total:=v_total+v_extra;
   v_value:=v_rule.base_attribute_pips+v_extra;
   if v_species.primary_attribute::text=v_key then v_value:=v_value+3; end if;
   if v_species.secondary_attribute::text=v_key then v_value:=v_value+1; end if;
   if v_class.primary_attribute::text=v_key then v_value:=v_value+3; end if;
   if v_class.secondary_attribute::text=v_key then v_value:=v_value+1; end if;
   if v_value>v_rule.max_attribute_pips then raise exception 'Attribute above maximum'; end if;
   v_attrs:=jsonb_set(v_attrs,array[v_key],to_jsonb(v_value));
 end loop;
 if v_total<>v_rule.free_attribute_pips then raise exception 'Assign all available attribute points'; end if;
 v_total:=0;
 if (select count(*) from jsonb_object_keys(p_skill_points))>25 then raise exception 'Too many skills'; end if;
 for v_skill in select id from public.game_skills loop
   v_key:=v_skill.id::text;
   if p_skill_points ? v_key then
     if jsonb_typeof(p_skill_points->v_key)<>'number' or (p_skill_points->>v_key) !~ '^[0-9]+$'
       then raise exception 'Skill points must be integers';end if;
   end if;
   v_alloc:=coalesce((p_skill_points->>v_key)::integer,0);
   if v_alloc<0 or v_alloc>v_rule.max_allocated_skill_pips then raise exception 'Invalid skill allocation'; end if;
   v_total:=v_total+v_alloc;
   select coalesce(sum(bonus_pips),0) into v_species_bonus
   from public.game_species_skill_bonuses where species_id=p_species and skill_id=v_skill.id;
   select coalesce(sum(bonus_pips),0) into v_class_bonus
   from public.game_classes_skill_bonuses where class_id=p_class and skill_id=v_skill.id;
   if v_alloc+v_species_bonus+v_class_bonus > 0 then
     v_skills:=jsonb_set(v_skills,array[v_key],to_jsonb(v_alloc+v_species_bonus+v_class_bonus));
   end if;
 end loop;
 if exists(select 1 from jsonb_object_keys(p_skill_points) x(key)
           where not exists(select 1 from public.game_skills s where s.id::text=x.key))
   then raise exception 'Unknown skill key';end if;
 if v_total<>v_rule.free_skill_pips then raise exception 'Assign all skill points'; end if;
 insert into public.characters(user_id,captain_name,species_id,class_id,starter_ship_id,attribute_pips,skill_bonus_pips)
 values(v_user,btrim(p_name),p_species,p_class,p_ship,v_attrs,v_skills) returning id into v_id;
 insert into public.character_crew(character_id,position,name) values
 (v_id,'pilot','Astra-7'),(v_id,'navigator','Navi-12');
 return v_id;
end $$;
revoke all on function public.create_captain(text,uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_captain(text,uuid,uuid,uuid,jsonb,jsonb) to authenticated;
