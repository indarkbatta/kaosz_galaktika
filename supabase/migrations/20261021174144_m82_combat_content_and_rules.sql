-- M82: data-driven character combat. Existing skill/Activity/Challenge rules are untouched.
create table public.game_combat_rules(
 id integer primary key default 1 check(id=1),
 defense_curves jsonb not null default '{"primary":{"base":3,"per_rank":2},"secondary":{"base":2,"per_rank":1},"tertiary":{"base":1,"per_rank":1}}',
 recovery_energy integer not null default 8 check(recovery_energy between 1 and 1000),
 injury_recovery_ticks integer not null default 8 check(injury_recovery_ticks between 1 and 1000),
 max_rounds integer not null default 100 check(max_rounds between 10 and 500),revision integer not null default 1
);
insert into public.game_combat_rules(id) values(1);
create table public.game_combat_profiles(
 id uuid primary key default gen_random_uuid(),species_id uuid unique references public.game_species(id) on delete cascade,
 class_id uuid unique references public.game_classes(id) on delete cascade,
 defenses jsonb not null,hp_per_rank integer not null default 5 check(hp_per_rank between 1 and 100),
 resistances jsonb not null default '{}',revision integer not null default 1,check(num_nonnulls(species_id,class_id)=1)
);
create table public.game_powers(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),
 image_path text,kind text not null default 'active' check(kind in ('active','passive')),
 target text not null default 'enemy' check(target in ('enemy','self')),range_kind text not null default 'ranged' check(range_kind in ('melee','ranged','self')),
 target_count integer not null default 1 check(target_count between 1 and 8),
 cooldown integer not null default 1 check(cooldown between 0 and 100),max_uses integer check(max_uses between 1 and 100),
 limit_scope text not null default 'battle' check(limit_scope in ('battle','operation')),
 min_level integer not null default 1 check(min_level between 1 and 100),requires_weapon boolean not null default false,
 requires_hit boolean not null default true,skill_id uuid references public.game_skills(id),
 defense text not null default 'body' check(defense in ('body','mind','soul','morale','social')),
 effects jsonb not null default '[]',is_published boolean not null default false,revision integer not null default 1
);
create index game_powers_skill_idx on public.game_powers(skill_id);
create table public.game_powers_i18n(power_id uuid not null references public.game_powers(id) on delete cascade,
 locale text not null references public.game_locales(code),name text not null check(length(btrim(name)) between 1 and 100),description text not null default '' check(length(description)<=4000),primary key(power_id,locale));
create table public.game_power_grants(
 id uuid primary key default gen_random_uuid(),power_id uuid not null references public.game_powers(id) on delete cascade,
 source text not null check(source in ('basic','species','class','item','special','faction')),
 species_id uuid references public.game_species(id) on delete cascade,class_id uuid references public.game_classes(id) on delete cascade,
 item_id uuid references public.game_items(id) on delete cascade,faction_id uuid references public.game_factions(id) on delete cascade,
 min_level integer not null default 1 check(min_level between 1 and 100),min_rank integer not null default 1 check(min_rank between 1 and 100),
 check((source in ('basic','special') and num_nonnulls(species_id,class_id,item_id,faction_id)=0)
 or (source='species' and species_id is not null and num_nonnulls(species_id,class_id,item_id,faction_id)=1)
 or (source='class' and class_id is not null and num_nonnulls(species_id,class_id,item_id,faction_id)=1)
 or (source='item' and item_id is not null and num_nonnulls(species_id,class_id,item_id,faction_id)=1)
 or (source='faction' and faction_id is not null and num_nonnulls(species_id,class_id,item_id,faction_id)=1))
);
create index game_power_grants_power_idx on public.game_power_grants(power_id);
create index game_power_grants_species_idx on public.game_power_grants(species_id);
create index game_power_grants_class_idx on public.game_power_grants(class_id);
create index game_power_grants_item_idx on public.game_power_grants(item_id);
create index game_power_grants_faction_idx on public.game_power_grants(faction_id);
create table public.game_talents(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),
 species_id uuid references public.game_species(id) on delete cascade,class_id uuid references public.game_classes(id) on delete cascade,
 image_path text,min_rank integer not null default 1 check(min_rank between 1 and 100),max_rank integer not null default 5 check(max_rank between 1 and 20),
 prerequisite_id uuid references public.game_talents(id) on delete restrict,prerequisite_rank integer not null default 1 check(prerequisite_rank between 1 and 20),
 effects jsonb not null default '[]',is_published boolean not null default false,revision integer not null default 1,
 check(num_nonnulls(species_id,class_id)=1),check(prerequisite_id is distinct from id)
);
create index game_talents_species_idx on public.game_talents(species_id);create index game_talents_class_idx on public.game_talents(class_id);create index game_talents_prerequisite_idx on public.game_talents(prerequisite_id);
create table public.game_talents_i18n(talent_id uuid not null references public.game_talents(id) on delete cascade,locale text not null references public.game_locales(code),name text not null check(length(btrim(name)) between 1 and 100),description text not null default '' check(length(description)<=4000),primary key(talent_id,locale));
create table public.game_item_combat(
 item_id uuid primary key references public.game_items(id) on delete cascade,tier integer not null default 1 check(tier between 1 and 5),
 weapon_pips integer not null default 0 check(weapon_pips between 0 and 90),damage_types jsonb not null default '["kinetic"]',
 resistances jsonb not null default '{}',effects jsonb not null default '[]',revision integer not null default 1
);
create table public.game_enemies(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),image_path text,
 level integer not null default 1 check(level between 1 and 100),danger integer not null default 0 check(danger between 0 and 30),
 attributes jsonb not null default '{"body":6,"mind":6,"soul":6,"morale":6,"social":6}',
 defenses jsonb not null default '{"body":3,"mind":3,"soul":3,"morale":3,"social":3}',
 health integer not null default 15 check(health between 1 and 100000),weapon_pips integer not null default 3 check(weapon_pips between 1 and 90),
 resistances jsonb not null default '{}',power_ids uuid[] not null default '{}',
 behavior text not null default 'aggressive' check(behavior in ('aggressive','healer','disruptor')),
 reward_xp integer not null default 20 check(reward_xp between 0 and 10000),reward_item_id uuid references public.game_items(id) on delete restrict,
 reward_quantity integer not null default 1 check(reward_quantity between 1 and 100),is_published boolean not null default false,revision integer not null default 1
);
create index game_enemies_reward_idx on public.game_enemies(reward_item_id);
create table public.game_enemies_i18n(enemy_id uuid not null references public.game_enemies(id) on delete cascade,locale text not null references public.game_locales(code),name text not null check(length(btrim(name)) between 1 and 100),description text not null default '' check(length(description)<=4000),primary key(enemy_id,locale));
create table public.game_combat_encounters(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),location_id uuid not null references public.game_locations(id) on delete restrict,
 enemy_id uuid not null references public.game_enemies(id) on delete restrict,name_hu text not null,name_en text not null,
 energy_cost integer not null default 2 check(energy_cost between 1 and 100),is_published boolean not null default false,revision integer not null default 1
);
create index game_combat_encounters_location_idx on public.game_combat_encounters(location_id);create index game_combat_encounters_enemy_idx on public.game_combat_encounters(enemy_id);
-- Strict schemas; effect values are data, never executable expressions.
create function private.combat_attribute(p text) returns boolean language sql immutable set search_path='' as $$select coalesce(p=any(array['body','mind','soul','morale','social']),false)$$;
create function private.combat_damage_types() returns text[] language sql immutable set search_path='' as $$select array['kinetic','heat','cold','electric','radiation','sonic','psionic','soul','vacuum','void','acid','biological','poison']$$;
create function private.combat_check_map(p jsonb,p_mode text) returns void language plpgsql set search_path='' as $$declare k text;v jsonb;begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid stat map';end if;
 if p_mode in ('attributes','defenses','profile') and (select count(*) from jsonb_object_keys(p))<>5 then raise exception 'Five attributes required';end if;
 for k,v in select * from jsonb_each(p) loop
  if p_mode='profile' then
   if not private.combat_attribute(k) or v#>>'{}' not in ('primary','secondary','tertiary') then raise exception 'Invalid Defense profile';end if;
  else
   if p_mode in ('attributes','defenses') and not private.combat_attribute(k) or p_mode='resistance' and not(k=any(private.combat_damage_types())) or v::text !~ '^-?[0-9]+$' or (v::text)::integer not between (case when p_mode='resistance' then -90 else 0 end) and 300 then raise exception 'Invalid stat value';end if;
  end if;
 end loop;
 if p_mode='profile' and ((select count(*) from jsonb_each_text(p) where value='primary')<>1 or (select count(*) from jsonb_each_text(p) where value='secondary')<>2) then raise exception 'Defense profile requires 1 primary, 2 secondary, 2 tertiary';end if;
end $$;
create function private.combat_check_types(p jsonb) returns void language plpgsql set search_path='' as $$begin
 if p='["weapon"]'::jsonb then return;end if;
 if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between 1 and 13 or exists(select 1 from jsonb_array_elements_text(p) t where not(t=any(private.combat_damage_types()))) then raise exception 'Invalid damage types';end if;
end $$;
create function private.combat_check_formula(p jsonb) returns void language plpgsql set search_path='' as $$declare k text;v jsonb;begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid formula';end if;
 for k,v in select * from jsonb_each(p) loop
  if k='attribute' then if not private.combat_attribute(v#>>'{}') then raise exception 'Invalid formula attribute';end if;
  elsif k not in ('dice','pips','weapon','attribute_scale') or v::text !~ '^[0-9]+$' or (v::text)::int>30 then raise exception 'Invalid formula field';end if;
 end loop;
end $$;
create function private.combat_check_effects(p jsonb,p_passive boolean) returns void language plpgsql set search_path='' as $$declare e jsonb;k text;kind text;begin
 if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p)>16 then raise exception 'Invalid effects';end if;
 for e in select value from jsonb_array_elements(p) loop
  if jsonb_typeof(e) is distinct from 'object' then raise exception 'Invalid effect';end if;kind:=e->>'type';
  if kind is null or kind not in ('damage','heal','modifier','ongoing_damage','ongoing_heal','cleanse') or p_passive and kind<>'modifier' then raise exception 'Invalid effect type';end if;
  if p_passive and e ? 'target' and e->>'target'<>'self' then raise exception 'Passive effects target self';end if;
  if kind='modifier' and (e ? 'formula' or e ? 'damage_types') or kind='cleanse' and (e ? 'formula' or e ? 'stat' or e ? 'key' or e ? 'amount' or e ? 'damage_types') or kind in ('damage','heal','ongoing_damage','ongoing_heal') and (e ? 'stat' or e ? 'key' or e ? 'amount') then raise exception 'Invalid effect fields for type';end if;
  if coalesce(e->>'target','target') not in ('self','target') then raise exception 'Invalid effect target';end if;
  for k in select jsonb_object_keys(e) loop if k not in ('type','target','formula','damage_types','stat','key','amount','duration','group') then raise exception 'Unknown effect field';end if;end loop;
  if kind in ('damage','heal','ongoing_damage','ongoing_heal') then perform private.combat_check_formula(e->'formula');end if;
  if kind in ('damage','ongoing_damage') then perform private.combat_check_types(e->'damage_types');end if;
  if kind='modifier' then
   if e->>'stat' not in ('attribute','skill','defense','resistance') or e->>'stat' is null or coalesce(e->>'amount','') !~ '^-?[0-9]+$' or abs((e->>'amount')::integer)>90 then raise exception 'Invalid modifier';end if;
   if e->>'stat' in ('attribute','defense') and not private.combat_attribute(e->>'key') or e->>'stat'='resistance' and not(coalesce(e->>'key','')=any(private.combat_damage_types())) or e->>'stat'='skill' and not exists(select 1 from public.game_skills where id::text=e->>'key') then raise exception 'Invalid modifier key';end if;
  end if;
  if kind in ('modifier','ongoing_damage','ongoing_heal') and not p_passive and (coalesce(e->>'duration','') !~ '^[0-9]+$' or (e->>'duration')::integer not between 1 and 100) then raise exception 'Effect duration must be 1..100';end if;
  if p_passive and coalesce((e->>'duration')::integer,0)<>0 then raise exception 'Passive duration must be zero';end if;
  if kind='cleanse' and length(coalesce(e->>'group','')) not between 1 and 60 then raise exception 'Cleanse group required';end if;
  if length(coalesce(e->>'group',''))>60 then raise exception 'Effect group too long';end if;
 end loop;
end $$;
create function private.validate_combat_content() returns trigger language plpgsql set search_path='' as $$declare a text;b text;v jsonb;begin
 if tg_table_name in ('game_powers','game_talents','game_enemies') then
  if new.image_path is not null and (length(new.image_path)>300 or new.image_path !~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$') then raise exception 'Invalid combat artwork path';end if;
 end if;
 if tg_table_name='game_powers' then
  perform private.combat_check_effects(new.effects,new.kind='passive');
  if new.requires_hit and not exists(select 1 from public.game_skills where id=new.skill_id and is_combat) then raise exception 'Choose an existing combat skill';end if;
  if new.kind='passive' and (new.requires_hit or new.target<>'self') then raise exception 'Passives must target self without an attack';end if;
 elsif tg_table_name='game_talents' then perform private.combat_check_effects(new.effects,true);
  if new.prerequisite_id is not null and not exists(select 1 from public.game_talents t where t.id=new.prerequisite_id and t.species_id is not distinct from new.species_id and t.class_id is not distinct from new.class_id) then raise exception 'Talent prerequisite must be in the same tree';end if;
  if exists(with recursive parents as (select id,prerequisite_id from public.game_talents where id=new.prerequisite_id union select t.id,t.prerequisite_id from public.game_talents t join parents p on t.id=p.prerequisite_id) select 1 from parents where id=new.id) then raise exception 'Talent prerequisite cycle';end if;
 elsif tg_table_name='game_item_combat' then if new.damage_types='["weapon"]'::jsonb then raise exception 'Item requires concrete damage types';end if;perform private.combat_check_types(new.damage_types);perform private.combat_check_map(new.resistances,'resistance');perform private.combat_check_effects(new.effects,true);
 elsif tg_table_name='game_combat_profiles' then perform private.combat_check_map(new.defenses,'profile');perform private.combat_check_map(new.resistances,'resistance');
 elsif tg_table_name='game_combat_rules' then
  for a in select unnest(array['primary','secondary','tertiary']) loop
   v:=new.defense_curves->a;
   if jsonb_typeof(v) is distinct from 'object' or coalesce(v->>'base','') !~ '^[0-9]+$' or coalesce(v->>'per_rank','') !~ '^[0-9]+$' or (v->>'base')::int>90 or (v->>'per_rank')::int>9 then raise exception 'Invalid Defense curve';end if;
  end loop;
 elsif tg_table_name='game_enemies' then
  perform private.combat_check_map(new.attributes,'attributes');perform private.combat_check_map(new.defenses,'defenses');perform private.combat_check_map(new.resistances,'resistance');
  if cardinality(new.power_ids) not between 1 and 12 or exists(select 1 from unnest(new.power_ids) pid where not exists(select 1 from public.game_powers p where p.id=pid and p.kind='active' and (not new.is_published or p.is_published))) then raise exception 'Enemy needs 1..12 valid active powers';end if;
 end if;
 if tg_op='UPDATE' then new.revision:=old.revision+1;end if;
 return new;
end $$;
-- Editor write policies; gameplay will read published definitions via controlled snapshots.
do $$declare t text;begin
 foreach t in array array['game_combat_rules','game_combat_profiles','game_powers','game_power_grants','game_talents','game_item_combat','game_enemies','game_combat_encounters'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy combat_editor on public.%I for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()))',t);
  if t<>'game_power_grants' and t<>'game_combat_encounters' then execute format('create trigger combat_validate before insert or update on public.%I for each row execute function private.validate_combat_content()',t);end if;
 end loop;
 foreach t in array array['game_powers_i18n','game_talents_i18n','game_enemies_i18n'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy combat_editor on public.%I for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()))',t);
 end loop;
end $$;
-- Shared rule functions: no frontend mirror and no damage-type implicit statuses.
create function private.combat_roll(p_pips integer,p_mode text default 'plain') returns jsonb language plpgsql volatile set search_path='' as $$
declare dice jsonb:='[]';chains jsonb:='[]';chain jsonb;v integer;total integer:=0;i integer;begin
 if p_pips not between 0 and 900 or p_mode not in ('plain','skill') then raise exception 'Invalid combat dice';end if;
 for i in 1..p_pips/3 loop
  chain:='[]';loop v:=private.secure_d6();chain:=chain||to_jsonb(v);total:=total+v;exit when p_mode='plain' or v<>6;end loop;
  dice:=dice||to_jsonb((chain->>0)::int);chains:=chains||jsonb_build_array(chain);
 end loop;
 return jsonb_build_object('dice',dice,'chains',chains,'pip_bonus',mod(p_pips,3),'roll_total',total+mod(p_pips,3),'mode',p_mode,'pool_pips',p_pips);
end $$;
create function private.combat_modifier(p_actor jsonb,p_stat text,p_key text) returns integer language sql immutable set search_path='' as $$
 select coalesce(sum(amount),0)::integer from (
 select case when amount>=0 then max(amount) else min(amount) end amount from (
 select coalesce(e->>'group','default') grp,(e->>'amount')::integer amount from jsonb_array_elements(coalesce(p_actor->'effects','[]')) e
 where e->>'type'='modifier' and e->>'stat'=p_stat and e->>'key'=p_key
 ) grouped group by grp,amount>=0) strongest
$$;
create function private.combat_stat(p_actor jsonb,p_stat text,p_key text) returns integer language sql immutable set search_path='' as $$
 select greatest(0,coalesce((p_actor->p_stat->>p_key)::integer,0)+private.combat_modifier(p_actor,case p_stat when 'attributes' then 'attribute' when 'defenses' then 'defense' else 'skill' end,p_key)
 -case when p_stat in ('attributes','defenses') then coalesce((p_actor->'injuries'->>p_key)::integer,0) else 0 end)
$$;
create function private.combat_formula(p_actor jsonb,p_formula jsonb) returns integer language sql immutable set search_path='' as $$
 select greatest(0,coalesce((p_formula->>'dice')::int,0)*3+coalesce((p_formula->>'pips')::int,0)+coalesce((p_formula->>'weapon')::int,0)*coalesce((p_actor->>'weapon_pips')::int,3)
 +case when p_formula ? 'attribute' then private.combat_stat(p_actor,'attributes',p_formula->>'attribute')*coalesce((p_formula->>'attribute_scale')::int,1) else 0 end)
$$;
create function private.combat_damage(p_attacker jsonb,p_defender jsonb,p_formula jsonb,p_types jsonb) returns jsonb language plpgsql volatile set search_path='' as $$declare base integer;armor integer;pool integer;roll jsonb;begin
 if p_types='["weapon"]'::jsonb then p_types:=coalesce(p_attacker->'weapon_damage_types','["kinetic"]'::jsonb);end if;
 base:=private.combat_formula(p_attacker,p_formula);
 select min(coalesce((p_defender->'resistances'->>t)::int,0)+private.combat_modifier(p_defender,'resistance',t)) into armor from jsonb_array_elements_text(p_types) t;
 pool:=greatest(0,base-coalesce(armor,0));roll:=private.combat_roll(least(900,pool),'plain');
 return roll||jsonb_build_object('base_pips',base,'sfe_pips',coalesce(armor,0),'damage', (roll->>'roll_total')::int,'damage_types',p_types);
end $$;
-- Helpers are internal; public gameplay commands added by M83 are the sole player boundary.
do $$declare r record;begin for r in select oid::regprocedure sig from pg_proc where pronamespace='private'::regnamespace and (proname like 'combat_%' or proname='validate_combat_content') loop execute format('revoke all on function %s from public,anon',r.sig);end loop;end $$;
