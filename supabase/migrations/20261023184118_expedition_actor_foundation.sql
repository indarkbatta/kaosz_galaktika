-- HV-067: shared actor foundation. No crew conversion or character reset.
create table private.expedition_actors(
 id uuid primary key default gen_random_uuid(),
 character_id uuid not null references public.characters(id) on delete cascade,
 kind text not null check(kind in ('captain','companion')),
 name text, species_id uuid references public.game_species(id), class_id uuid references public.game_classes(id),
 portrait_path text, attribute_pips jsonb, skill_bonus_pips jsonb,
 level integer not null default 1 check(level between 1 and 1000),
 xp_total bigint not null default 0 check(xp_total>=0),
 health integer check(health>=0),injuries jsonb not null default '{}',
 created_at timestamptz not null default now(),
 check((kind='captain' and id=character_id and level=1 and xp_total=0 and health is null and injuries='{}'::jsonb and portrait_path is null and name is null and species_id is null and class_id is null and attribute_pips is null and skill_bonus_pips is null)
 or (kind='companion' and id<>character_id and name is not null and length(btrim(name)) between 2 and 40 and species_id is not null and class_id is not null and attribute_pips is not null and skill_bonus_pips is not null)),
 unique(id,character_id)
);
create unique index expedition_one_captain on private.expedition_actors(character_id) where kind='captain';
create index expedition_actors_owner on private.expedition_actors(character_id);
create table private.expedition_actor_nodes(
 actor_id uuid not null references private.expedition_actors(id) on delete cascade,
 node_id uuid not null, tree_id uuid not null references public.game_talent_trees(id) on delete restrict,
 branch text not null check(branch in ('species','class')), snapshot jsonb not null,
 learned_at timestamptz not null default now(),primary key(actor_id,node_id)
);
create index expedition_nodes_tree on private.expedition_actor_nodes(tree_id);
create table private.expedition_actor_powers(actor_id uuid not null references private.expedition_actors(id) on delete cascade,
 power_id uuid not null references public.game_powers(id) on delete restrict,primary key(actor_id,power_id));
create index expedition_powers_power on private.expedition_actor_powers(power_id);
create table private.expedition_actor_skills(actor_id uuid not null references private.expedition_actors(id) on delete cascade,
 skill_id uuid not null references public.game_skills(id) on delete restrict,bonus_pips integer not null check(bonus_pips>=0),primary key(actor_id,skill_id));
create index expedition_skills_skill on private.expedition_actor_skills(skill_id);
-- Shared-stock allocation and write RPCs arrive in HV-070. No client can mint gear here.
create table private.expedition_actor_equipment(actor_id uuid not null references private.expedition_actors(id) on delete cascade,
 slot text not null check(slot in ('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic')),
 item_id uuid not null references public.game_items(id) on delete restrict,primary key(actor_id,slot));
create index expedition_equipment_item on private.expedition_actor_equipment(item_id);
do $$declare t text;begin foreach t in array array['expedition_actors','expedition_actor_nodes','expedition_actor_powers','expedition_actor_skills','expedition_actor_equipment'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
end loop;end $$;
-- Captain entries are identities only: live build/progress remains in its authoritative tables.
create function private.register_expedition_captain() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.expedition_actors(id,character_id,kind) values(new.id,new.id,'captain');return new;
end $$;
revoke all on function private.register_expedition_captain() from public,anon,authenticated;
create trigger register_expedition_captain after insert on public.characters for each row execute function private.register_expedition_captain();
insert into private.expedition_actors(id,character_id,kind) select id,id,'captain' from public.characters;

create function private.expedition_branch_hp(p_species uuid,p_class uuid,p_species_points integer,p_class_points integer)
 returns jsonb language sql stable set search_path='' as $$
 with b as(select coalesce((select hp_per_rank from public.game_species where id=p_species),0) s,
 coalesce((select hp_per_rank from public.game_classes where id=p_class),0) c)
 select jsonb_build_object('species_base',s,'class_base',c,'species_points',p_species_points,'class_points',p_class_points,
 'species_total',s*(1+p_species_points),'class_total',c*(1+p_class_points),'max_health',s*(1+p_species_points)+c*(1+p_class_points)) from b
$$;
create function private.expedition_branch_defenses(p_species uuid,p_class uuid,p_species_points integer,p_class_points integer)
 returns jsonb language plpgsql stable set search_path='' as $$
declare cfg jsonb;b record;a text;d jsonb:='{}';v integer;begin
 select defense_curves into cfg from public.game_combat_rules where id=1;
 foreach a in array array['body','mind','soul','morale','social'] loop d:=jsonb_set(d,array[a],'0');end loop;
 for b in select passive_defenses,p_species_points spent from public.game_species where id=p_species
 union all select passive_defenses,p_class_points from public.game_classes where id=p_class loop
 foreach a in array array['body','mind','soul','morale','social'] loop
 v:=(d->>a)::int+(cfg->(b.passive_defenses->>a)->>'base')::int+b.spent*(cfg->(b.passive_defenses->>a)->>'per_rank')::int;
 d:=jsonb_set(d,array[a],to_jsonb(v));end loop;end loop;return d;
end $$;
create or replace function private.talent_hp(p_species uuid,p_class uuid,p_character uuid) returns jsonb language sql stable set search_path='' as $$
 with n as(select greatest(0,count(*) filter(where branch='species')::int-1) s,greatest(0,count(*) filter(where branch='class')::int-1) c from public.character_tree_nodes where character_id=p_character),
 g as(select coalesce((select species_rank-1 from public.character_combat_progress where character_id=p_character),0) s,coalesce((select class_rank-1 from public.character_combat_progress where character_id=p_character),0) c)
 select private.expedition_branch_hp(p_species,p_class,n.s+g.s,n.c+g.c) from n cross join g
$$;
create or replace function private.branch_defenses(p_species uuid,p_class uuid,p_character uuid) returns jsonb language sql stable set search_path='' as $$
 select private.expedition_branch_defenses(p_species,p_class,(h->>'species_points')::int,(h->>'class_points')::int)
 from (select private.talent_hp(p_species,p_class,p_character) h)x
$$;

-- One calculation path for captain and companions; contexts only adapt storage.
CREATE OR REPLACE FUNCTION private.expedition_evaluate(p_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare c public.characters%rowtype;g public.character_combat_progress%rowtype;lvl integer;cfg jsonb;prof record;a text;rank integer;defenses jsonb:='{}';effects jsonb:='[]';resist jsonb:='{}';skills jsonb:='{}';powers jsonb;hp integer:=0;weapon integer:=3;weapon_chosen boolean:=false;weapon_types jsonb:='["kinetic"]';r record;e jsonb;v integer;
begin
 c:=jsonb_populate_record(null::public.characters,p_context->'build');g:=jsonb_populate_record(null::public.character_combat_progress,p_context->'growth');lvl:=(p_context->>'level')::int;
 defenses:=private.expedition_branch_defenses(c.species_id,c.class_id,(p_context->>'species_points')::int,(p_context->>'class_points')::int);hp:=(private.expedition_branch_hp(c.species_id,c.class_id,(p_context->>'species_points')::int,(p_context->>'class_points')::int)->>'max_health')::int;
 for prof in select combat_resistances resistances from public.game_species where id=c.species_id union all select combat_resistances from public.game_classes where id=c.class_id loop
 for a,e in select * from jsonb_each(prof.resistances) loop resist:=jsonb_set(resist,array[a],to_jsonb(coalesce((resist->>a)::int,0)+(e::text)::int));end loop;end loop;
 for r in select ic.*,eq.slot from jsonb_to_recordset(p_context->'equipment') eq(slot text,item_id uuid) join public.game_item_combat ic on ic.item_id=eq.item_id order by case eq.slot when 'main_weapon' then 0 when 'sidearm' then 1 else 2 end loop
  if r.slot in ('main_weapon','sidearm') and r.weapon_pips>0 and not weapon_chosen then weapon:=r.weapon_pips;weapon_types:=r.damage_types;weapon_chosen:=true;end if;
  effects:=effects||r.effects;
  for a,e in select * from jsonb_each(r.resistances) loop resist:=jsonb_set(resist,array[a],to_jsonb(coalesce((resist->>a)::int,0)+(e::text)::int));end loop;
 end loop;
 for r in select t.effects,ct.rank from jsonb_to_recordset(p_context->'legacy_talents') ct(talent_id uuid,rank integer) join public.game_talents t on t.id=ct.talent_id loop
  for e in select value from jsonb_array_elements(r.effects) loop effects:=effects||jsonb_build_array(jsonb_set(e,'{amount}',to_jsonb((e->>'amount')::int*r.rank)));end loop;
 end loop;
 select effects||coalesce(jsonb_agg(ne.value),'[]') into effects from jsonb_to_recordset(p_context->'nodes') tn(snapshot jsonb) cross join lateral jsonb_array_elements(tn.snapshot->'effects') ne(value);
 select coalesce(jsonb_agg(p||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_powers_i18n t where t.power_id=(p->>'id')::uuid),'[]'))),'[]') into powers from (
 select distinct to_jsonb(p) p from public.game_powers p left join public.game_power_grants gr on gr.power_id=p.id
 where p.is_published and p.min_level<=lvl and ((gr.min_level<=lvl and (
 gr.source='basic' or gr.source='species' and gr.species_id=c.species_id and gr.min_rank<=coalesce(g.species_rank,1)
 or gr.source='class' and gr.class_id=c.class_id and gr.min_rank<=coalesce(g.class_rank,1)
 or gr.source='item' and exists(select 1 from jsonb_to_recordset(p_context->'equipment') eq(slot text,item_id uuid) where eq.item_id=gr.item_id)))
 or exists(select 1 from jsonb_to_recordset(p_context->'powers') cp(power_id uuid) where cp.power_id=p.id))) available;
 for e in select value from jsonb_array_elements(powers) where value->>'kind'='passive' loop effects:=effects||(e->'effects');end loop;
 for r in select s.id,s.attribute,coalesce(u.bonus_pips,0) earned from public.game_skills s left join jsonb_to_recordset(p_context->'upgrades') u(skill_id uuid,bonus_pips integer) on u.skill_id=s.id loop
  skills:=jsonb_set(skills,array[r.id::text],to_jsonb(coalesce((c.attribute_pips->>r.attribute::text)::int,3)+coalesce((c.skill_bonus_pips->>r.id::text)::int,0)+r.earned));
 end loop;
 return jsonb_build_object('id',p_context->>'id','player',true,'name_hu',c.captain_name,'name_en',c.captain_name,'image_path',(select image_path from public.game_species where id=c.species_id),
 'active_defense_skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'attribute',s.attribute,'texts',(select jsonb_agg(i) from public.game_skills_i18n i where i.skill_id=s.id))) from public.game_skills s where s.is_active_defense),'[]'),'active_defense',null,'level',lvl,'danger',0,'attributes',c.attribute_pips,'defenses',defenses,'skills',skills,'skill_attributes',(select jsonb_object_agg(id::text,attribute::text) from public.game_skills),
 'health',least(hp,coalesce(g.health,hp)),'max_health',hp,'injuries',coalesce(g.injuries,'{}'),'weapon_pips',weapon,'weapon_damage_types',weapon_types,
 'has_weapon',exists(select 1 from jsonb_to_recordset(p_context->'equipment') eq(slot text,item_id uuid) join public.game_item_combat ic on ic.item_id=eq.item_id where eq.slot in ('main_weapon','sidearm') and ic.weapon_pips>0),
 'resistances',resist,'effects',effects,'powers',powers,'turn',0,'cooldowns','{}'::jsonb,'uses','{}'::jsonb);
end $function$
;

create function private.expedition_captain_context(cid uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id','captain','build',to_jsonb(c),'growth',coalesce(to_jsonb(g),'{}'),
 'level',p.level,'xp_total',p.xp_total,'species_points',(h->>'species_points')::int,'class_points',(h->>'class_points')::int,
 'equipment',coalesce((select jsonb_agg(jsonb_build_object('slot',eq.slot,'item_id',eq.item_id)) from public.character_equipment eq where eq.character_id=cid and eq.crew_id is null),'[]'),
 'legacy_talents',coalesce((select jsonb_agg(to_jsonb(t)) from public.character_talents t where t.character_id=cid),'[]'),
 'nodes',coalesce((select jsonb_agg(to_jsonb(n)) from public.character_tree_nodes n where n.character_id=cid),'[]'),
 'powers',coalesce((select jsonb_agg(to_jsonb(cp)) from public.character_powers cp where cp.character_id=cid),'[]'),
 'upgrades',coalesce((select jsonb_agg(to_jsonb(u)) from public.character_skill_upgrades u where u.character_id=cid),'[]'))
 from public.characters c join public.character_progress p on p.character_id=c.id
 left join public.character_combat_progress g on g.character_id=c.id
 cross join lateral (select private.talent_hp(c.species_id,c.class_id,c.id) h)x where c.id=cid
$$;
create function private.expedition_actor_context(aid uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare a private.expedition_actors%rowtype;begin
 select * into strict a from private.expedition_actors where id=aid;
 if a.kind='captain' then return private.expedition_captain_context(a.character_id);end if;
 return jsonb_build_object('id',a.id,'build',jsonb_build_object('id',a.id,'captain_name',a.name,'species_id',a.species_id,'class_id',a.class_id,'attribute_pips',a.attribute_pips,'skill_bonus_pips',a.skill_bonus_pips),
 'growth',jsonb_build_object('health',a.health,'injuries',a.injuries,'species_rank',1,'class_rank',1),'level',a.level,'xp_total',a.xp_total,
 'species_points',(select greatest(0,count(*)::int-1) from private.expedition_actor_nodes where actor_id=aid and branch='species'),
 'class_points',(select greatest(0,count(*)::int-1) from private.expedition_actor_nodes where actor_id=aid and branch='class'),
 'equipment',coalesce((select jsonb_agg(jsonb_build_object('slot',e.slot,'item_id',e.item_id)) from private.expedition_actor_equipment e where e.actor_id=aid),'[]'),
 'legacy_talents','[]'::jsonb,'nodes',coalesce((select jsonb_agg(to_jsonb(n)) from private.expedition_actor_nodes n where n.actor_id=aid),'[]'),
 'powers',coalesce((select jsonb_agg(to_jsonb(p)) from private.expedition_actor_powers p where p.actor_id=aid),'[]'),
 'upgrades',coalesce((select jsonb_agg(to_jsonb(u)) from private.expedition_actor_skills u where u.actor_id=aid),'[]'));
end $$;

-- The existing combat protocol stays compatible until HV-045 replaces the turn engine.
-- No duplicate hero arithmetic remains behind this adapter.
create or replace function private.combat_hero_before_loadout(p_character uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor jsonb;begin
 actor:=private.expedition_evaluate(private.expedition_captain_context(p_character));
 return actor||jsonb_build_object('skill_attributes',(select jsonb_object_agg(id::text,attribute::text) from public.game_skills where is_combat or is_active_defense),'action_points',3,'skills',coalesce((select jsonb_object_agg(s.id::text,actor->'skills'->s.id::text)
 from public.game_skills s where s.is_combat or s.is_active_defense),'{}'));
end $$;

create function private.expedition_points(l integer,s integer,c integer,sr integer default 1,cr integer default 1)
 returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('species',greatest(0,1-s),'class',greatest(0,1-c),
 'shared',greatest(0,l-1-greatest(0,s-1)-greatest(0,c-1)-(sr+cr-2)))
$$;
create or replace function private.tree_points(cid uuid) returns jsonb language sql stable set search_path='' as $$
 select private.expedition_points(coalesce(p.level,1),n.s,n.c,coalesce(g.species_rank,1),coalesce(g.class_rank,1))
 from (select count(*) filter(where branch='species')::int s,count(*) filter(where branch='class')::int c from public.character_tree_nodes where character_id=cid)n
 left join public.character_progress p on p.character_id=cid left join public.character_combat_progress g on g.character_id=cid
$$;

create function private.validate_expedition_actor() returns trigger language plpgsql set search_path='' as $$
declare k text;v jsonb;begin
 if new.kind='companion' then
  if jsonb_typeof(new.attribute_pips) is distinct from 'object' or (select count(*) from jsonb_object_keys(new.attribute_pips))<>5 then raise exception 'Invalid actor attributes';end if;
  foreach k in array array['body','mind','soul','morale','social'] loop
   v:=new.attribute_pips->k;if jsonb_typeof(v) is distinct from 'number' or v::text !~ '^[0-9]+$' then raise exception 'Invalid actor attribute';end if;
  end loop;
  if jsonb_typeof(new.skill_bonus_pips) is distinct from 'object' then raise exception 'Invalid actor skills';end if;
  for k,v in select * from jsonb_each(new.skill_bonus_pips) loop
   if jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or not exists(select 1 from public.game_skills s where s.id::text=k) then raise exception 'Invalid actor skill';end if;
  end loop;
 end if;
 if jsonb_typeof(new.injuries) is distinct from 'object' then raise exception 'Invalid actor injuries';end if;
 for k,v in select * from jsonb_each(new.injuries) loop
  if k not in ('body','mind','soul','morale','social') or jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' then raise exception 'Invalid actor injury';end if;
 end loop;
 if tg_op='UPDATE' and (new.character_id<>old.character_id or new.kind<>old.kind or new.id<>old.id) then raise exception 'Actor identity is immutable';end if;
 return new;
end $$;
create trigger validate_expedition_actor before insert or update on private.expedition_actors for each row execute function private.validate_expedition_actor();

-- Read-only player API. Authoring, recruitment, learning and gear writes are separate cards.
create function private.read_expedition_actor(aid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.expedition_actors%rowtype;ctx jsonb;sheet jsonb;points jsonb;lvl integer;begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 select a0.* into a from private.expedition_actors a0 join public.characters c on c.id=a0.character_id where a0.id=aid and c.user_id=auth.uid();
 if not found then raise exception 'Actor not found' using errcode='42501';end if;
 ctx:=private.expedition_actor_context(aid);sheet:=private.expedition_evaluate(ctx);lvl:=(ctx->>'level')::int;
 if a.kind='captain' then points:=private.tree_points(a.character_id);
 else points:=private.expedition_points(lvl,(select count(*)::int from private.expedition_actor_nodes where actor_id=aid and branch='species'),(select count(*)::int from private.expedition_actor_nodes where actor_id=aid and branch='class'));end if;
 return sheet||jsonb_build_object('id',a.id,'character_id',a.character_id,'kind',a.kind,'portrait_path',coalesce(a.portrait_path,sheet->>'image_path'),
 'xp_total',ctx->'xp_total','species_id',ctx->'build'->'species_id','class_id',ctx->'build'->'class_id','points',points,
 'hp',private.expedition_branch_hp((ctx->'build'->>'species_id')::uuid,(ctx->'build'->>'class_id')::uuid,(ctx->>'species_points')::int,(ctx->>'class_points')::int),
 'effective_defenses',(select jsonb_object_agg(k,private.active_defense_pool(sheet,k)) from unnest(array['body','mind','soul','morale','social'])k),
 'effective_skills',(select jsonb_object_agg(s.id::text,greatest(0,(sheet->'skills'->>s.id::text)::int+private.combat_modifier(sheet,'skill',s.id::text)+private.combat_modifier(sheet,'attribute',s.attribute::text)-coalesce((sheet->'injuries'->>s.attribute::text)::int,0))) from public.game_skills s));
end $$;
create function private.read_expedition_roster() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 return jsonb_build_object('actors',coalesce((select jsonb_agg(private.read_expedition_actor(a.id) order by case a.kind when 'captain' then 0 else 1 end,a.created_at,a.id)
 from private.expedition_actors a join public.characters c on c.id=a.character_id where c.user_id=auth.uid()),'[]'));
end $$;
-- Explicitly close every new helper/table; only guarded reads are callable.
do $$declare p record;begin for p in select p0.oid::regprocedure sig from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace
 where n.nspname='private' and (p0.proname like 'expedition_%' or p0.proname in ('validate_expedition_actor','read_expedition_actor','read_expedition_roster')) loop
 execute format('revoke all on function %s from public,anon,authenticated',p.sig);
end loop;end $$;
revoke all on function private.combat_hero_before_loadout(uuid) from public,anon,authenticated;
grant execute on function private.read_expedition_actor(uuid),private.read_expedition_roster() to authenticated;
create function public.get_expedition_actor(p_actor uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.read_expedition_actor(p_actor)$$;
create function public.get_expedition_roster() returns jsonb language sql stable security invoker set search_path='' as $$select private.read_expedition_roster()$$;
revoke all on function public.get_expedition_actor(uuid),public.get_expedition_roster() from public,anon;
grant execute on function public.get_expedition_actor(uuid),public.get_expedition_roster() to authenticated;
