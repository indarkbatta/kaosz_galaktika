-- Crew have independent classes and a compact combat model. Captain classes remain portrait metadata only.
create function private.crew_stat_map(v jsonb,growth boolean) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;n numeric;begin
 if v is null or jsonb_typeof(v)<>'object' or (select count(*) from jsonb_object_keys(v))<>4 then return false;end if;
 foreach k in array array['health','attack','defense','damage'] loop
  if jsonb_typeof(v->k) is distinct from 'number' then return false;end if;
  n:=(v->>k)::numeric;
  if n<0 or n>(case when growth then 20 else 100 end) or (not growth and n<>floor(n)) or (not growth and k='health' and n<1) then return false;end if;
 end loop;return true;
end $$;
create table public.game_crew_classes(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug~'^[a-z][a-z0-9_]{1,79}$'),
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),name_en text not null check(length(btrim(name_en)) between 1 and 100),
 description_hu text not null default '' check(length(description_hu)<=2000),description_en text not null default '' check(length(description_en)<=2000),
 bases jsonb not null default '{"health":12,"attack":6,"defense":6,"damage":0}' check(private.crew_stat_map(bases,false)),
 growth jsonb not null default '{"health":3,"attack":0.5,"defense":0.5,"damage":0.25}' check(private.crew_stat_map(growth,true)),
 attack_skill_id uuid references public.game_skills(id),is_published boolean not null default false,revision integer not null default 1
);
create index crew_class_attack_skill on public.game_crew_classes(attack_skill_id);
create table public.game_crew_skill_bonuses(
 id uuid primary key default gen_random_uuid(),crew_class_id uuid references public.game_crew_classes(id) on delete cascade,
 species_id uuid references public.game_species(id) on delete cascade,skill_id uuid not null references public.game_skills(id),
 base_pips integer not null default 1 check(base_pips between 0 and 30),per_level numeric not null default 0 check(per_level between 0 and 3),
 check(num_nonnulls(crew_class_id,species_id)=1)
);
create unique index crew_class_skill_unique on public.game_crew_skill_bonuses(crew_class_id,skill_id) where crew_class_id is not null;
create unique index crew_species_skill_unique on public.game_crew_skill_bonuses(species_id,skill_id) where species_id is not null;
create index crew_bonus_skill_fk on public.game_crew_skill_bonuses(skill_id);
create index crew_bonus_species_fk on public.game_crew_skill_bonuses(species_id);
alter table public.game_crew_classes enable row level security;
alter table public.game_crew_skill_bonuses enable row level security;
create policy crew_class_read on public.game_crew_classes for select to authenticated using(is_published or (select private.can_edit_content()));
create policy crew_bonus_read on public.game_crew_skill_bonuses for select to authenticated using(true);
revoke all on public.game_crew_classes,public.game_crew_skill_bonuses from public,anon,authenticated;
grant select on public.game_crew_classes,public.game_crew_skill_bonuses to authenticated;
-- Initial values are editable balance defaults, not a new captain ruleset.
insert into public.game_crew_classes(slug,name_hu,name_en,bases,growth,is_published) values
 ('assault','Rohamosztagos','Assault','{"health":14,"attack":7,"defense":5,"damage":1}','{"health":3,"attack":0.5,"defense":0.25,"damage":0.25}',true),
 ('security','Biztonsági tiszt','Security officer','{"health":18,"attack":6,"defense":7,"damage":0}','{"health":4,"attack":0.5,"defense":0.5,"damage":0.25}',true),
 ('scout','Felderítő','Scout','{"health":12,"attack":7,"defense":6,"damage":0}','{"health":2,"attack":0.5,"defense":0.5,"damage":0.25}',true),
 ('technician','Technikus','Technician','{"health":12,"attack":5,"defense":5,"damage":0}','{"health":2,"attack":0.25,"defense":0.5,"damage":0.25}',true),
 ('medic','Szanitéc','Medic','{"health":14,"attack":5,"defense":6,"damage":0}','{"health":3,"attack":0.25,"defense":0.5,"damage":0.25}',true),
 ('psionic','Pszi-specialista','Psi specialist','{"health":10,"attack":7,"defense":5,"damage":0}','{"health":2,"attack":0.5,"defense":0.25,"damage":0.5}',true);
update public.game_crew_classes c set attack_skill_id=s.id from public.game_skills s where s.is_combat and s.attribute::text=case when c.slug='psionic' then 'mind' else 'body' end;
insert into public.game_crew_skill_bonuses(crew_class_id,skill_id,base_pips,per_level)
 select c.id,s.id,3,0.5 from public.game_crew_classes c join public.game_skills s on s.slug=case c.slug when 'assault' then 'physical_arms' when 'security' then 'reflexes' when 'scout' then 'stealth' when 'technician' then 'engineering' when 'medic' then 'endurance' when 'psionic' then 'analysis' end;
-- Existing racial skill definitions are copied into an independently editable crew bonus catalog.
insert into public.game_crew_skill_bonuses(species_id,skill_id,base_pips) select species_id,skill_id,least(30,greatest(0,bonus_pips)) from public.game_species_skill_bonuses;
alter table public.game_crew_templates add column crew_class_id uuid references public.game_crew_classes(id);
alter table public.character_crew add column crew_class_id uuid references public.game_crew_classes(id),add column xp integer not null default 0 check(xp between 0 and 122500);
create index crew_template_simple_class on public.game_crew_templates(crew_class_id);
create index crew_member_simple_class on public.character_crew(crew_class_id);
create function private.default_crew_class(specialty text) returns uuid language sql stable set search_path='' as $$
 select id from public.game_crew_classes where slug=case specialty when 'security' then 'security' when 'engineer' then 'technician' when 'medic' then 'medic' else 'scout' end
$$;
update public.game_crew_templates set crew_class_id=private.default_crew_class(specialty);
update public.character_crew set crew_class_id=private.default_crew_class(coalesce(specialty,position));
alter table public.character_crew alter column crew_class_id set not null;
create function private.initialize_simple_crew() returns trigger language plpgsql set search_path='' as $$begin
 if new.crew_class_id is null then
 select crew_class_id into new.crew_class_id from public.game_crew_templates where id=new.template_id;
 new.crew_class_id:=coalesce(new.crew_class_id,private.default_crew_class(coalesce(new.specialty,new.position)));
 end if;
 if not exists(select 1 from public.game_crew_classes where id=new.crew_class_id and is_published) then raise exception 'Crew class unavailable';end if;return new;
end $$;
create trigger initialize_simple_crew before insert on public.character_crew for each row execute function private.initialize_simple_crew();
create function private.crew_level(p_xp integer) returns integer language sql immutable set search_path='' as $$
 select least(50,1+floor((sqrt(1+8*greatest(0,p_xp)::numeric/100)-1)/2)::int)
$$;
create function private.crew_base_stats(b jsonb,g jsonb,l integer) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_object_agg(k,(b->>k)::int+floor((greatest(1,least(50,l))-1)*(g->>k)::numeric)::int) from unnest(array['health','attack','defense','damage']) k
$$;
-- Equipment uses the same grouped modifier evaluator as captain combat. Crew defense keys merge into one TN.
create function private.crew_sheet(p_id uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare c public.character_crew%rowtype;cl public.game_crew_classes%rowtype;l int;b jsonb;tot jsonb;gear jsonb:='[]';fx jsonb:='[]';res jsonb:='{}';skills jsonb:='{}';r record;e jsonb;k text;weapon int:=3;v int;actor jsonb;begin
 select * into strict c from public.character_crew where id=p_id;select * into strict cl from public.game_crew_classes where id=c.crew_class_id;
 l:=private.crew_level(c.xp);b:=private.crew_base_stats(cl.bases,cl.growth,l);
 for r in select eq.slot,i.id,i.slug,ic.weapon_pips,ic.effects,ic.resistances from public.character_equipment eq join public.game_items i on i.id=eq.item_id left join public.game_item_combat ic on ic.item_id=i.id where eq.crew_id=c.id and eq.character_id=c.character_id loop
  gear:=gear||jsonb_build_array(jsonb_build_object('slot',r.slot,'item_id',r.id,'slug',r.slug));
  if r.slot='weapon' and coalesce(r.weapon_pips,0)>0 then weapon:=r.weapon_pips;end if;
  fx:=fx||coalesce(r.effects,'[]');
  for k,e in select * from jsonb_each(coalesce(r.resistances,'{}')) loop res:=jsonb_set(res,array[k],to_jsonb(coalesce((res->>k)::int,0)+(e::text)::int));end loop;
 end loop;
 -- A defense modifier targeting any attribute affects the single crew defense; groups still prevent duplicate stacking.
 select coalesce(jsonb_agg(case when x->>'type'='modifier' and x->>'stat'='defense' then jsonb_set(x,'{key}','"body"') else x end),'[]') into fx from jsonb_array_elements(fx) x;
 actor:=jsonb_build_object('effects',fx);
 for r in select s.id,s.slug,s.attribute,
 coalesce((select sum(z.base_pips+floor((l-1)*z.per_level)) from public.game_crew_skill_bonuses z where z.skill_id=s.id and (z.crew_class_id=cl.id or z.species_id=(select id from public.game_species where slug=c.species_slug))),0)::int bonus
 from public.game_skills s loop
 v:=r.bonus+private.combat_modifier(actor,'skill',r.id::text);
 if v<>0 then skills:=jsonb_set(skills,array[r.id::text],to_jsonb(v));end if;
 end loop;
 tot:=b||jsonb_build_object('attack',greatest(0,(b->>'attack')::int+private.combat_modifier(actor,'skill',cl.attack_skill_id::text)),
 'defense',greatest(0,(b->>'defense')::int+private.combat_modifier(actor,'defense','body')),'damage',(b->>'damage')::int+weapon);
 return jsonb_build_object('id',c.id,'name',c.name,'portrait_path',c.portrait_path,'species_slug',c.species_slug,'crew_class_id',cl.id,'class_name_hu',cl.name_hu,'class_name_en',cl.name_en,
 'level',l,'xp',c.xp,'next_level_xp',case when l<50 then 100*l*(l+1)/2 else null end,'base',b,'stats',tot,'weapon_pips',weapon,'skills',skills,'resistances',res,'equipment',gear,'effects',fx);
end $$;
create table public.character_salvage_party(character_id uuid not null references public.characters(id) on delete cascade,slot integer not null check(slot in(1,2)),crew_id uuid not null references public.character_crew(id) on delete cascade,primary key(character_id,slot),unique(crew_id));
alter table public.character_salvage_party enable row level security;
create policy own_salvage_party on public.character_salvage_party for select to authenticated using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.character_salvage_party from public,anon,authenticated;grant select on public.character_salvage_party to authenticated;
create function private.get_simple_crew() returns jsonb language plpgsql stable security definer set search_path='' as $$declare cid uuid;begin
 cid:=private.combat_owned_character();
 return jsonb_build_object('crew',coalesce((select jsonb_agg(private.crew_sheet(id) order by name,id) from public.character_crew where character_id=cid),'[]'),
 'party',coalesce((select jsonb_agg(crew_id order by slot) from public.character_salvage_party where character_id=cid),'[]'),
 'skills',(select jsonb_agg(jsonb_build_object('id',s.id,'texts',(select jsonb_agg(i) from public.game_skills_i18n i where i.skill_id=s.id))) from public.game_skills s));
end $$;
create function public.get_simple_crew() returns jsonb language sql security invoker set search_path='' as $$select private.get_simple_crew()$$;
create function private.set_salvage_party(ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$declare cid uuid;begin
 cid:=private.combat_owned_character();perform 1 from public.characters where id=cid for update;
 if ids is null or cardinality(ids)>2 or array_position(ids,null) is not null or (select count(distinct x) from unnest(ids)x)<>cardinality(ids) then raise exception 'Choose at most two distinct crew members';end if;
 if exists(select 1 from unnest(ids)x where not exists(select 1 from public.character_crew c where c.id=x and c.character_id=cid)) then raise exception 'Not your crew member';end if;
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) then raise exception 'Finish active encounter first';end if;
 delete from public.character_salvage_party where character_id=cid;
 insert into public.character_salvage_party select cid,n,x from unnest(ids) with ordinality a(x,n);
 return private.get_simple_crew();end $$;
create function public.set_salvage_party(p_crew uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.set_salvage_party(p_crew)$$;
-- XP is an internal reward operation, never exposed as a player RPC. Event/member uniqueness prevents retries granting twice.
create table private.crew_xp_events(event_id uuid not null,crew_id uuid not null references public.character_crew(id) on delete cascade,amount integer not null check(amount between 1 and 10000),primary key(event_id,crew_id));
alter table private.crew_xp_events enable row level security;
create function private.award_crew_xp(p_character uuid,p_crew uuid[],p_amount integer,p_event uuid) returns void language plpgsql set search_path='' as $$declare c uuid;old_amount int;begin
 if p_amount is null or p_amount not between 1 and 10000 or p_event is null or p_crew is null or cardinality(p_crew)>2 or array_position(p_crew,null) is not null or cardinality(p_crew)<>(select count(distinct x) from unnest(p_crew)x) then raise exception 'Invalid crew XP reward';end if;
 perform 1 from public.characters where id=p_character for update;if not found then raise exception 'Character not found';end if;
 for c in select x from unnest(p_crew)x order by x loop
 perform 1 from public.character_crew where id=c and character_id=p_character for update;if not found then raise exception 'Not your crew member';end if;
 select amount into old_amount from private.crew_xp_events where event_id=p_event and crew_id=c;
 if found then if old_amount<>p_amount then raise exception 'Reward request mismatch';end if;continue;end if;
 insert into private.crew_xp_events values(p_event,c,p_amount);update public.character_crew set xp=least(122500,xp+p_amount) where id=c;
 end loop;end $$;
-- Independent editor catalog, with optimistic revisions and atomic skill-bonus replacement.
create function private.crew_progression_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required';end if;
 return jsonb_build_object('classes',(select jsonb_agg(c order by slug) from public.game_crew_classes c),'bonuses',coalesce((select jsonb_agg(b) from public.game_crew_skill_bonuses b),'[]'),
 'species',(select jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'texts',(select jsonb_agg(i) from public.game_species_i18n i where i.species_id=s.id))) from public.game_species s),
 'skills',(select jsonb_agg(jsonb_build_object('id',s.id,'slug',s.slug,'texts',(select jsonb_agg(i) from public.game_skills_i18n i where i.skill_id=s.id))) from public.game_skills s));end $$;
create function public.get_crew_progression_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.crew_progression_catalog()$$;
create function private.save_crew_progression(p_kind text,p_id uuid,p_revision integer,p_data jsonb,p_bonuses jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid:=coalesce(p_id,gen_random_uuid());r public.game_crew_classes%rowtype;oldrev int;b jsonb;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required';end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_bonuses is null or jsonb_typeof(p_bonuses)<>'array' or jsonb_array_length(p_bonuses)>25 then raise exception 'Invalid crew settings';end if;
 if p_kind='class' then
 if p_id is not null then select revision into oldrev from public.game_crew_classes where id=rid for update;if not found then raise exception 'Crew class not found';end if;if oldrev is distinct from p_revision then raise exception 'Crew class changed; reload' using errcode='40001';end if;end if;
 r:=jsonb_populate_record(null::public.game_crew_classes,p_data);
 if not coalesce(r.is_published,false) and exists(select 1 from public.game_crew_templates where crew_class_id=rid and is_published) then raise exception 'Unpublish crew templates before retiring their class';end if;
 insert into public.game_crew_classes(id,slug,name_hu,name_en,description_hu,description_en,bases,growth,attack_skill_id,is_published,revision)
 values(rid,r.slug,r.name_hu,r.name_en,coalesce(r.description_hu,''),coalesce(r.description_en,''),r.bases,r.growth,r.attack_skill_id,coalesce(r.is_published,false),coalesce(oldrev,0)+1)
 on conflict(id) do update set slug=excluded.slug,name_hu=excluded.name_hu,name_en=excluded.name_en,description_hu=excluded.description_hu,description_en=excluded.description_en,bases=excluded.bases,growth=excluded.growth,attack_skill_id=excluded.attack_skill_id,is_published=excluded.is_published,revision=excluded.revision;
 delete from public.game_crew_skill_bonuses where crew_class_id=rid;
 elsif p_kind='species' then
 perform 1 from public.game_species where id=p_id for update;if not found then raise exception 'Species not found';end if;
 -- Species use the current bonus set as the revision token (no captain row schema changes).
 if md5(coalesce((select jsonb_agg(to_jsonb(x)-'id' order by skill_id)::text from public.game_crew_skill_bonuses x where species_id=p_id),'[]')) is distinct from p_data->>'bonus_revision' then raise exception 'Species bonuses changed; reload' using errcode='40001';end if;
 delete from public.game_crew_skill_bonuses where species_id=rid;
 else raise exception 'Invalid crew settings kind';end if;
 for b in select value from jsonb_array_elements(p_bonuses) loop
 insert into public.game_crew_skill_bonuses(crew_class_id,species_id,skill_id,base_pips,per_level) values(case when p_kind='class' then rid end,case when p_kind='species' then rid end,(b->>'skill_id')::uuid,(b->>'base_pips')::int,(b->>'per_level')::numeric);
 end loop;return rid;end $$;
create function public.save_crew_progression(p_kind text,p_id uuid,p_revision integer,p_data jsonb,p_bonuses jsonb) returns uuid language sql security invoker set search_path='' as $$select private.save_crew_progression(p_kind,p_id,p_revision,p_data,p_bonuses)$$;
-- Preserve legacy template save/portrait validation; add the new independent class atomically.
alter function private.save_crew_catalog_impl(text,uuid,jsonb,integer) rename to save_crew_catalog_before_simple;
create function private.save_crew_catalog_impl(p_kind text,p_id uuid,p_record jsonb,p_expected_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required';end if;
 result:=private.save_crew_catalog_before_simple(p_kind,p_id,p_record,p_expected_revision);
 if p_kind='template' then
 if coalesce((p_record->>'is_published')::boolean,false) and not exists(select 1 from public.game_crew_classes where id=coalesce(nullif(p_record->>'crew_class_id','')::uuid,private.default_crew_class(p_record->>'specialty')) and is_published) then raise exception 'Crew class unavailable';end if;
 update public.game_crew_templates set crew_class_id=coalesce(nullif(p_record->>'crew_class_id','')::uuid,private.default_crew_class(specialty)) where id=(result->>'id')::uuid;end if;return result;end $$;
-- Add crew class options without changing the existing portrait-class catalog.
alter function private.get_crew_editor_catalog_impl() rename to get_crew_editor_catalog_before_simple;
create function private.get_crew_editor_catalog_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$declare data jsonb;begin
 data:=private.get_crew_editor_catalog_before_simple();return data||jsonb_build_object('crew_classes',(select jsonb_agg(c) from public.game_crew_classes c));end $$;
-- Species bonus revision is supplied by the server, not computed from a client-specific JSON order.
alter function private.crew_progression_catalog() rename to crew_progression_catalog_base;
create function private.crew_progression_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$declare data jsonb;begin
 data:=private.crew_progression_catalog_base();return data||jsonb_build_object('species',(select jsonb_agg(s||jsonb_build_object('bonus_revision',md5(coalesce((select jsonb_agg(to_jsonb(x)-'id' order by skill_id)::text from public.game_crew_skill_bonuses x where species_id=(s->>'id')::uuid),'[]')))) from jsonb_array_elements(data->'species')s));end $$;
-- Restrict every new helper; only ownership/editor-checking entry points are callable by players.
do $$declare r record;begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname in ('crew_stat_map','crew_level','crew_base_stats','crew_sheet','get_simple_crew','set_salvage_party','award_crew_xp','default_crew_class','initialize_simple_crew','crew_progression_catalog','crew_progression_catalog_base','save_crew_progression','save_crew_catalog_impl','get_crew_editor_catalog_impl')) loop execute format('revoke all on function %s from public,anon,authenticated',r.signature);end loop;
end $$;
grant execute on function private.crew_stat_map(jsonb,boolean) to authenticated;
grant execute on function private.get_simple_crew(),private.set_salvage_party(uuid[]),private.crew_progression_catalog(),private.save_crew_progression(text,uuid,integer,jsonb,jsonb),private.save_crew_catalog_impl(text,uuid,jsonb,integer),private.get_crew_editor_catalog_impl() to authenticated;
revoke all on function public.get_simple_crew(),public.set_salvage_party(uuid[]),public.get_crew_progression_catalog(),public.save_crew_progression(text,uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.get_simple_crew(),public.set_salvage_party(uuid[]),public.get_crew_progression_catalog(),public.save_crew_progression(text,uuid,integer,jsonb,jsonb) to authenticated;
