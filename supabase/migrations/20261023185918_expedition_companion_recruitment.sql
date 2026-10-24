-- HV-068: full companion templates/recruitment. No crew conversion, reset or equipment minting.
create function private.expedition_build(p_species uuid,p_class uuid,p_attribute_points jsonb,p_skill_points jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_rule public.game_rules%rowtype;v_species public.game_species%rowtype;v_class public.game_classes%rowtype;
v_attrs jsonb:='{}';v_skills jsonb:='{}';v_key text;v_skill record;v_extra int;v_total int:=0;v_value int;v_alloc int;v_species_bonus int;v_class_bonus int;
begin
 select * into strict v_rule from public.game_rules where id=1;
 select * into v_species from public.game_species where id=p_species and is_published;if not found then raise exception 'Invalid species';end if;
 select * into v_class from public.game_classes where id=p_class and is_published;if not found then raise exception 'Invalid class';end if;
 if jsonb_typeof(p_attribute_points) is distinct from 'object' or jsonb_typeof(p_skill_points) is distinct from 'object' then
   raise exception 'Allocations must be JSON objects';
 end if;
 if exists(select 1 from jsonb_object_keys(p_attribute_points) k where k not in ('body','mind','soul','morale','social')) then raise exception 'Unknown attribute key';end if;
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
 return jsonb_build_object('attribute_pips',v_attrs,'skill_bonus_pips',v_skills);
end $$;
-- Captain creation uses the same allocator, retaining ship/start-state initialization.
do $$declare d text;s int;e int;begin
 d:=pg_get_functiondef('private.create_captain_impl(text,uuid,uuid,uuid,jsonb,jsonb)'::regprocedure);
 s:=strpos(d,' if jsonb_typeof(p_attribute_points)');e:=strpos(d,' insert into public.characters(user_id,captain_name');
 if s=0 or e<=s then raise exception 'Unexpected captain allocator';end if;
 d:=substr(d,1,s-1)||$patch$ v_attrs:=private.expedition_build(p_species,p_class,p_attribute_points,p_skill_points);
 v_skills:=v_attrs->'skill_bonus_pips';v_attrs:=v_attrs->'attribute_pips';
$patch$||substr(d,e);execute d;
end $$;
create function private.expedition_tree_view(p_species uuid,p_class uuid,p_level int,p_owned jsonb,p_points jsonb,p_hp jsonb,p_defenses jsonb)
returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('level',p_level,'hp',p_hp,'passive_defenses',p_defenses,'points',p_points,
'powers',coalesce((select jsonb_agg(to_jsonb(p)) from public.game_powers p where p.is_published and exists(select 1 from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where n.power_id=p.id and t.is_published and (t.species_id=p_species or t.class_id=p_class))),'[]'),
 'skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name_hu',coalesce((select name from public.game_skills_i18n i where i.skill_id=s.id and i.locale='hu'),s.slug),'name_en',coalesce((select name from public.game_skills_i18n i where i.skill_id=s.id and i.locale='en'),s.slug))) from public.game_skills s),'[]'),
 'owned',p_owned,
 'trees',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('nodes',coalesce((select jsonb_agg(to_jsonb(n)||jsonb_build_object('effects',coalesce(ta.effects,n.effects),'talent_published',coalesce(ta.is_published,false),'power_published',coalesce(p.is_published,false)) order by n.y,n.x) from public.game_talent_tree_nodes n left join public.game_powers p on p.id=n.power_id left join public.game_talents ta on ta.id=n.talent_id where n.tree_id=t.id),'[]'),'connections',coalesce((select jsonb_agg(e) from public.game_talent_tree_edges e where e.tree_id=t.id),'[]'))) from public.game_talent_trees t where t.is_published and (t.species_id=p_species or t.class_id=p_class)),'[]'))
$$;

create function private.expedition_owned_nodes(aid uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(node_id),'[]') from (
 select n.node_id from public.character_tree_nodes n where n.character_id=aid
 union select nd.id from public.game_talent_tree_nodes nd join public.character_talents ct on ct.talent_id=nd.talent_id where ct.character_id=aid
 union select n.node_id from private.expedition_actor_nodes n where n.actor_id=aid)x
$$;
create function private.expedition_actor_trees(aid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare sheet jsonb;begin
 sheet:=private.read_expedition_actor(aid);
 return private.expedition_tree_view((sheet->>'species_id')::uuid,(sheet->>'class_id')::uuid,(sheet->>'level')::int,
 private.expedition_owned_nodes(aid),sheet->'points',sheet->'hp',sheet->'defenses');
end $$;
create or replace function private.player_tree_catalog(p_species uuid,p_class uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();
 if cid is not null then return private.expedition_actor_trees(cid);end if;
 return private.expedition_tree_view(p_species,p_class,1,'[]','{"species":1,"class":1,"shared":0}',
 private.expedition_branch_hp(p_species,p_class,0,0),private.expedition_branch_defenses(p_species,p_class,0,0));
end $$;

-- One validation path for initial selections and subsequent learning, including the captain.
create function private.expedition_checked_node(nid uuid,sid uuid,cid uuid,lvl int,owned jsonb,talents jsonb,rev int)
returns jsonb language plpgsql set search_path='' as $$
declare t public.game_talent_trees%rowtype;n public.game_talent_tree_nodes%rowtype;b text;begin
 select tr.* into t from public.game_talent_trees tr join public.game_talent_tree_nodes nd on nd.tree_id=tr.id where nd.id=nid for share of tr;
 if not found or not t.is_published or not(coalesce(t.species_id=sid,false) or coalesce(t.class_id=cid,false)) then raise exception 'Talent unavailable';end if;
 if rev is not null and t.revision<>rev then raise exception 'Tree changed; reload before learning' using errcode='40001';end if;
 select * into strict n from public.game_talent_tree_nodes where id=nid and tree_id=t.id;
 if owned ? n.id::text then raise exception 'Talent already learned';end if;
 if n.min_level>lvl or exists(select 1 from public.game_talent_tree_edges e where e.tree_id=t.id and e.to_node_id=n.id and not owned ? e.from_node_id::text) then raise exception 'Talent prerequisites unmet';end if;
 if n.kind='power' and not exists(select 1 from public.game_powers where id=n.power_id and is_published and min_level<=lvl) then raise exception 'Power unavailable';end if;
 if n.kind='passive' then
 select effects into n.effects from public.game_talents where id=n.talent_id and is_published
 and (species_id=sid and t.species_id=sid or class_id=cid and t.class_id=cid);
 if not found then raise exception 'Talent unavailable';end if;
 if talents ? n.talent_id::text then raise exception 'Talent already learned';end if;
 perform private.combat_check_effects(n.effects,true);
 end if;
 b:=case when t.species_id is not null then 'species' else 'class' end;
 return jsonb_build_object('tree_id',t.id,'branch',b,'snapshot',to_jsonb(n));
end $$;
create function private.expedition_assert_idle(cid uuid) returns void language plpgsql set search_path='' as $$begin
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation)
 or exists(select 1 from public.character_skill_challenge_runs where character_id=cid and status='active') then raise exception 'Finish active encounter first';end if;
end $$;
create function private.expedition_learn(aid uuid,nid uuid,rev int) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;a private.expedition_actors%rowtype;sheet jsonb;n jsonb;b text;talents jsonb;begin
 cid:=private.combat_owned_character();
 select * into a from private.expedition_actors where id=aid and character_id=cid for update;
 if not found then raise exception 'Actor not found' using errcode='42501';end if;
 perform private.expedition_assert_idle(cid);sheet:=private.read_expedition_actor(aid);
 select coalesce(jsonb_agg(talent_id),'[]') into talents from (
 select snapshot->>'talent_id' talent_id from public.character_tree_nodes where character_id=aid
 union select talent_id::text from public.character_talents where character_id=aid
 union select snapshot->>'talent_id' from private.expedition_actor_nodes where actor_id=aid)x;
 if rev is null then raise exception 'Tree revision required';end if;
 n:=private.expedition_checked_node(nid,(sheet->>'species_id')::uuid,(sheet->>'class_id')::uuid,(sheet->>'level')::int,private.expedition_owned_nodes(aid),talents,rev);b:=n->>'branch';
 if (sheet->'points'->>b)::int=0 and (sheet->'points'->>'shared')::int=0 then raise exception 'No talent points available';end if;
 if a.kind='captain' then
 insert into public.character_tree_nodes(character_id,node_id,tree_id,branch,snapshot) values(aid,nid,(n->>'tree_id')::uuid,b,n->'snapshot');
 if n->'snapshot'->>'kind'='power' then insert into public.character_powers values(aid,(n->'snapshot'->>'power_id')::uuid) on conflict do nothing;end if;
 else
 insert into private.expedition_actor_nodes(actor_id,node_id,tree_id,branch,snapshot) values(aid,nid,(n->>'tree_id')::uuid,b,n->'snapshot');
 if n->'snapshot'->>'kind'='power' then insert into private.expedition_actor_powers values(aid,(n->'snapshot'->>'power_id')::uuid) on conflict do nothing;end if;
 end if;
 return private.expedition_actor_trees(aid);
end $$;
create or replace function private.learn_tree_node(p_node uuid,p_revision int) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;begin cid:=private.combat_owned_character();return private.expedition_learn(cid,p_node,p_revision);end $$;

create table private.expedition_templates(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),
 name_hu text not null check(length(btrim(name_hu)) between 2 and 40),name_en text not null check(length(btrim(name_en)) between 2 and 40),
 description_hu text not null default '' check(length(description_hu)<=2000),description_en text not null default '' check(length(description_en)<=2000),
 species_id uuid not null references public.game_species(id),class_id uuid not null references public.game_classes(id),
 portrait_path text check(portrait_path is null or (length(portrait_path)<=300 and portrait_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$')),
 attribute_points jsonb not null default '{}',skill_points jsonb not null default '{}',
 species_node uuid references public.game_talent_tree_nodes(id) deferrable initially deferred,class_node uuid references public.game_talent_tree_nodes(id) deferrable initially deferred,
 hire_energy int not null default 1 check(hire_energy between 0 and 100),is_published boolean not null default false,
 revision int not null default 1,updated_at timestamptz not null default now()
);
create index expedition_templates_species on private.expedition_templates(species_id);
create index expedition_templates_class on private.expedition_templates(class_id);
create index expedition_templates_species_node on private.expedition_templates(species_node);
create index expedition_templates_class_node on private.expedition_templates(class_node);
alter table private.expedition_actors add column template_id uuid references private.expedition_templates(id) on delete restrict,
 add column biography jsonb not null default '{}',add column upgrade_points int not null default 0 check(upgrade_points>=0);
create unique index expedition_actor_template on private.expedition_actors(character_id,template_id) where template_id is not null;
create index expedition_actor_template_fk on private.expedition_actors(template_id);
create table private.expedition_hires(character_id uuid not null references public.characters(id) on delete cascade,
 request_id uuid not null,template_id uuid not null references private.expedition_templates(id),actor_id uuid not null references private.expedition_actors(id) on delete cascade,
 primary key(character_id,request_id));
create index expedition_hires_template on private.expedition_hires(template_id);
create index expedition_hires_actor on private.expedition_hires(actor_id);
create table private.expedition_xp_events(actor_id uuid not null references private.expedition_actors(id) on delete cascade,
 event_id uuid not null,amount int not null check(amount>=0),primary key(actor_id,event_id));
do $$declare t text;begin foreach t in array array['expedition_templates','expedition_hires','expedition_xp_events'] loop
 execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);
end loop;end $$;

create function private.expedition_effective_sheet(sheet jsonb) returns jsonb language sql stable set search_path='' as $$
 select sheet||jsonb_build_object(
 'effective_defenses',(select jsonb_object_agg(k,private.active_defense_pool(sheet,k)) from unnest(array['body','mind','soul','morale','social'])k),
 'effective_skills',(select jsonb_object_agg(s.id::text,greatest(0,(sheet->'skills'->>s.id::text)::int+private.combat_modifier(sheet,'skill',s.id::text)+private.combat_modifier(sheet,'attribute',s.attribute::text)-coalesce((sheet->'injuries'->>s.attribute::text)::int,0))) from public.game_skills s)
)
$$;

create function private.expedition_template_context(doc jsonb) returns jsonb language plpgsql set search_path='' as $$
declare build jsonb;nodes jsonb:='[]';powers jsonb:='[]';b text;nid uuid;n jsonb;sid uuid:=(doc->>'species_id')::uuid;cid uuid:=(doc->>'class_id')::uuid;begin
 build:=private.expedition_build(sid,cid,doc->'attribute_points',doc->'skill_points');
 foreach b in array array['species','class'] loop
 nid:=nullif(doc->>(b||'_node'),'')::uuid;
 if exists(select 1 from public.game_talent_trees where is_published and (b='species' and species_id=sid or b='class' and class_id=cid)) then
 if nid is null then raise exception 'Choose one starting talent in each available tree';end if;
 n:=private.expedition_checked_node(nid,sid,cid,1,'[]','[]',null);
 if n->>'branch'<>b then raise exception 'Wrong starting talent tree';end if;
 nodes:=nodes||jsonb_build_array(jsonb_build_object('snapshot',n->'snapshot'));
 if n->'snapshot'->>'kind'='power' then powers:=powers||jsonb_build_array(jsonb_build_object('power_id',n->'snapshot'->>'power_id'));end if;
 elsif nid is not null then raise exception 'Talent tree unavailable';end if;
 end loop;
 return jsonb_build_object('id',doc->>'id','build',build||jsonb_build_object('captain_name',doc->>'name_hu','species_id',sid,'class_id',cid),
 'growth','{"species_rank":1,"class_rank":1}'::jsonb,'level',1,'species_points',0,'class_points',0,'equipment','[]'::jsonb,'legacy_talents','[]'::jsonb,'nodes',nodes,'powers',powers,'upgrades','[]'::jsonb);
end $$;
create function private.expedition_template_preview(doc jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required' using errcode='42501';end if;
 return private.expedition_effective_sheet(private.expedition_evaluate(private.expedition_template_context(doc)));
end $$;
create function private.save_expedition_template(tid uuid,rev int,doc jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.expedition_templates%rowtype;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required' using errcode='42501';end if;
 -- Serialize new slugs as well as existing updates; no last-writer-wins authoring.
 perform pg_advisory_xact_lock(hashtextextended('expedition_templates',0));
 if tid is not null then
 select * into t from private.expedition_templates where id=tid for update;
 if not found or t.revision is distinct from rev then raise exception 'Template changed; reload before saving' using errcode='40001';end if;
 end if;
 if jsonb_typeof(doc->'attribute_points') is distinct from 'object' or jsonb_typeof(doc->'skill_points') is distinct from 'object' then raise exception 'Allocations must be JSON objects';end if;
 if coalesce((doc->>'is_published')::boolean,false) then perform private.expedition_template_context(doc);end if;
 insert into private.expedition_templates(id,slug,name_hu,name_en,description_hu,description_en,species_id,class_id,portrait_path,attribute_points,skill_points,species_node,class_node,hire_energy,is_published,revision)
 values(coalesce(tid,gen_random_uuid()),doc->>'slug',btrim(doc->>'name_hu'),btrim(doc->>'name_en'),coalesce(doc->>'description_hu',''),coalesce(doc->>'description_en',''),
 (doc->>'species_id')::uuid,(doc->>'class_id')::uuid,nullif(doc->>'portrait_path',''),doc->'attribute_points',doc->'skill_points',nullif(doc->>'species_node','')::uuid,nullif(doc->>'class_node','')::uuid,coalesce((doc->>'hire_energy')::int,1),coalesce((doc->>'is_published')::boolean,false),coalesce(t.revision,0)+1)
 on conflict(id) do update set slug=excluded.slug,name_hu=excluded.name_hu,name_en=excluded.name_en,description_hu=excluded.description_hu,description_en=excluded.description_en,
 species_id=excluded.species_id,class_id=excluded.class_id,portrait_path=excluded.portrait_path,attribute_points=excluded.attribute_points,skill_points=excluded.skill_points,
 species_node=excluded.species_node,class_node=excluded.class_node,hire_energy=excluded.hire_energy,is_published=excluded.is_published,revision=excluded.revision,updated_at=clock_timestamp()
 returning * into t;return to_jsonb(t);
end $$;
create function private.expedition_template_catalog() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required' using errcode='42501';end if;
 return jsonb_build_object('templates',coalesce((select jsonb_agg(t order by t.slug) from private.expedition_templates t),'[]'),
 'species',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_species_i18n i where i.species_id=s.id),'[]'))) from public.game_species s where is_published),'[]'),
 'classes',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_classes_i18n i where i.class_id=c.id),'[]'))) from public.game_classes c where is_published),'[]'),
 'skills',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_skills_i18n i where i.skill_id=s.id),'[]'))) from public.game_skills s),'[]'),
 'rules',(select to_jsonb(r) from public.game_rules r where id=1),'trees',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('nodes',coalesce((select jsonb_agg(n) from public.game_talent_tree_nodes n where n.tree_id=t.id),'[]'),'connections',coalesce((select jsonb_agg(e) from public.game_talent_tree_edges e where e.tree_id=t.id),'[]'))) from public.game_talent_trees t where t.is_published),'[]'));
end $$;

create function private.expedition_recruitment() returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;offers jsonb:='[]';t private.expedition_templates%rowtype;sheet jsonb;begin
 cid:=private.combat_owned_character();
 if not exists(select 1 from public.character_positions p join public.game_locations l on l.id=p.location_id where p.character_id=cid and l.slug='frontier_station') then raise exception 'Recruitment requires Frontier Station';end if;
 for t in select * from private.expedition_templates where is_published order by slug loop
 -- An outdated published template becomes unavailable, never a broken/free hire.
 begin sheet:=private.expedition_effective_sheet(private.expedition_evaluate(private.expedition_template_context(to_jsonb(t))));
 offers:=offers||jsonb_build_array(to_jsonb(t)-'attribute_points'-'skill_points'||jsonb_build_object('sheet',sheet,'owned',exists(select 1 from private.expedition_actors where character_id=cid and template_id=t.id)));
 exception when raise_exception then null;end;
 end loop;
 return jsonb_build_object('offers',offers,'roster',private.read_expedition_roster());
end $$;
create function private.hire_expedition_companion(tid uuid,rev int,req uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;t private.expedition_templates%rowtype;ctx jsonb;aid uuid;prev private.expedition_hires%rowtype;n jsonb;begin
 cid:=private.combat_owned_character();
 if req is null then raise exception 'Request ID required';end if;
 if tid is null or rev is null then raise exception 'Template and revision required';end if;
 select * into prev from private.expedition_hires where character_id=cid and request_id=req;
 if found then
 if prev.template_id<>tid then raise exception 'Request ID already used';end if;
 return private.read_expedition_actor(prev.actor_id);end if;
 perform private.expedition_assert_idle(cid);
 if not exists(select 1 from public.character_positions p join public.game_locations l on l.id=p.location_id where p.character_id=cid and l.slug='frontier_station') then raise exception 'Recruitment requires Frontier Station';end if;
 select * into t from private.expedition_templates where id=tid and is_published for share;
 if not found then raise exception 'Template unavailable';end if;
 if t.revision is distinct from rev then raise exception 'Template changed; reload before hiring' using errcode='40001';end if;
 if exists(select 1 from private.expedition_actors where character_id=cid and template_id=tid) then raise exception 'Companion already recruited';end if;
 if (select count(*) from private.expedition_actors where character_id=cid and kind='companion')>=24 then raise exception 'Expedition roster full';end if;
 ctx:=private.expedition_template_context(to_jsonb(t));
 perform private.combat_spend_energy(cid,t.hire_energy);
 insert into private.expedition_actors(character_id,kind,name,species_id,class_id,portrait_path,attribute_pips,skill_bonus_pips,template_id,biography)
 values(cid,'companion',t.name_hu,t.species_id,t.class_id,t.portrait_path,ctx->'build'->'attribute_pips',ctx->'build'->'skill_bonus_pips',tid,jsonb_build_object('name_en',t.name_en,'description_hu',t.description_hu,'description_en',t.description_en)) returning id into aid;
 for n in select value->'snapshot' from jsonb_array_elements(ctx->'nodes') loop
 insert into private.expedition_actor_nodes(actor_id,node_id,tree_id,branch,snapshot)
 select aid,(n->>'id')::uuid,(n->>'tree_id')::uuid,case when tr.species_id is not null then 'species' else 'class' end,n from public.game_talent_trees tr where tr.id=(n->>'tree_id')::uuid;
 end loop;
 insert into private.expedition_actor_powers select aid,(value->>'power_id')::uuid from jsonb_array_elements(ctx->'powers') on conflict do nothing;
 insert into private.expedition_hires values(cid,req,tid,aid);
 return private.read_expedition_actor(aid);
end $$;
-- Server rewards only; no browser RPC can award XP or choose a level.
create function private.award_expedition_actor_xp(cid uuid,aid uuid,amount int,event uuid) returns void language plpgsql set search_path='' as $$
declare a private.expedition_actors%rowtype;cfg public.gameplay_rules%rowtype;lvl int;points int:=0;old_amount int;begin
 if amount is null or amount<0 or event is null then raise exception 'Invalid XP reward';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 select * into a from private.expedition_actors where id=aid and character_id=cid and kind='companion' for update;
 if not found then raise exception 'Companion not found';end if;
 select xp.amount into old_amount from private.expedition_xp_events xp where actor_id=aid and event_id=event;
 if found then if old_amount<>amount then raise exception 'XP event changed';end if;return;end if;
 select * into strict cfg from public.gameplay_rules where id=1;lvl:=a.level;
 while lvl<100 and a.xp_total+amount>=cfg.xp_level_base::bigint*lvl*(lvl+1)/2 loop lvl:=lvl+1;points:=points+cfg.skill_points_per_level;end loop;
 update private.expedition_actors set xp_total=xp_total+amount,level=lvl,upgrade_points=upgrade_points+points where id=aid;
 insert into private.expedition_xp_events values(aid,event,amount);
end $$;
create function private.expedition_upgrade_skill(aid uuid,sk uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;a private.expedition_actors%rowtype;bonus int;begin
 cid:=private.combat_owned_character();
 select * into a from private.expedition_actors where id=aid and character_id=cid for update;
 if not found then raise exception 'Actor not found' using errcode='42501';end if;
 perform private.expedition_assert_idle(cid);
 if a.kind='captain' then perform private.upgrade_captain_skill_impl(sk);
 else
 if a.upgrade_points<1 then raise exception 'No upgrade points';end if;
 if not exists(select 1 from public.game_skills where id=sk) then raise exception 'Invalid skill';end if;
 insert into private.expedition_actor_skills values(aid,sk,1) on conflict(actor_id,skill_id) do update set bonus_pips=private.expedition_actor_skills.bonus_pips+1 where private.expedition_actor_skills.bonus_pips<12 returning bonus_pips into bonus;
 if not found then raise exception 'Skill upgrade limit reached';end if;
 update private.expedition_actors set upgrade_points=upgrade_points-1 where id=aid;
 end if;
 return private.read_expedition_actor(aid);
end $$;
-- Expose the additional progression fields without changing the shared evaluator.
do $$declare d text;begin
 d:=pg_get_functiondef('private.read_expedition_actor(uuid)'::regprocedure);
 if strpos(d,$before$ 'effective_defenses',(select jsonb_object_agg(k,private.active_defense_pool(sheet,k)) from unnest(array['body','mind','soul','morale','social'])k),
 'effective_skills',(select jsonb_object_agg(s.id::text,greatest(0,(sheet->'skills'->>s.id::text)::int+private.combat_modifier(sheet,'skill',s.id::text)+private.combat_modifier(sheet,'attribute',s.attribute::text)-coalesce((sheet->'injuries'->>s.attribute::text)::int,0))) from public.game_skills s)$before$)=0 then raise exception 'Unexpected effective actor sheet';end if;
 d:=replace(d,$before$ 'effective_defenses',(select jsonb_object_agg(k,private.active_defense_pool(sheet,k)) from unnest(array['body','mind','soul','morale','social'])k),
 'effective_skills',(select jsonb_object_agg(s.id::text,greatest(0,(sheet->'skills'->>s.id::text)::int+private.combat_modifier(sheet,'skill',s.id::text)+private.combat_modifier(sheet,'attribute',s.attribute::text)-coalesce((sheet->'injuries'->>s.attribute::text)::int,0))) from public.game_skills s)$before$,$after$ 'effective_defenses',sheet->'effective_defenses','effective_skills',sheet->'effective_skills'$after$);
 d:=replace(d,'sheet:=private.expedition_evaluate(ctx);','sheet:=private.expedition_effective_sheet(private.expedition_evaluate(ctx));');
 if strpos(d,$needle$'xp_total',ctx->'xp_total'$needle$)=0 then raise exception 'Unexpected actor sheet';end if;
 d:=replace(d,$needle$'xp_total',ctx->'xp_total'$needle$,$patch$'name_en',coalesce(a.biography->>'name_en',sheet->>'name_en'),'biography',a.biography,'upgrade_points',case when a.kind='captain' then (select upgrade_points from public.character_progress where character_id=a.character_id) else a.upgrade_points end,'skill_upgrades',case when a.kind='captain' then coalesce((select jsonb_object_agg(skill_id::text,bonus_pips) from public.character_skill_upgrades where character_id=a.id),'{}') else coalesce((select jsonb_object_agg(skill_id::text,bonus_pips) from private.expedition_actor_skills where actor_id=a.id),'{}') end,'xp_total',ctx->'xp_total'$patch$);execute d;
end $$;

-- All privileged helpers remain outside the exposed schema; guarded entrypoints only.
do $$declare p record;begin for p in select p0.oid::regprocedure sig from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace
 where n.nspname='private' and (p0.proname like 'expedition_%' or p0.proname in ('save_expedition_template','hire_expedition_companion','award_expedition_actor_xp')) loop
 execute format('revoke all on function %s from public,anon,authenticated',p.sig);
end loop;end $$;
grant execute on function private.expedition_template_catalog(),private.save_expedition_template(uuid,int,jsonb),private.expedition_template_preview(jsonb),private.expedition_recruitment(),private.hire_expedition_companion(uuid,int,uuid),private.expedition_actor_trees(uuid),private.expedition_learn(uuid,uuid,int),private.expedition_upgrade_skill(uuid,uuid) to authenticated;
create function public.get_expedition_template_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.expedition_template_catalog()$$;
create function public.save_expedition_template(p_template uuid,p_revision int,p_record jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_expedition_template(p_template,p_revision,p_record)$$;
create function public.preview_expedition_template(p_record jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_template_preview(p_record)$$;
create function public.get_expedition_recruitment() returns jsonb language sql security invoker set search_path='' as $$select private.expedition_recruitment()$$;
create function public.hire_expedition_companion(p_template uuid,p_revision int,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$select private.hire_expedition_companion(p_template,p_revision,p_request)$$;
create function public.get_expedition_actor_trees(p_actor uuid) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_actor_trees(p_actor)$$;
create function public.learn_expedition_talent(p_actor uuid,p_node uuid,p_revision int) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_learn(p_actor,p_node,p_revision)$$;
create function public.upgrade_expedition_skill(p_actor uuid,p_skill uuid) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_upgrade_skill(p_actor,p_skill)$$;
do $$declare p record;begin for p in select p0.oid::regprocedure sig from pg_proc p0 join pg_namespace n on n.oid=p0.pronamespace
 where n.nspname='public' and p0.proname in ('get_expedition_template_catalog','save_expedition_template','preview_expedition_template','get_expedition_recruitment','hire_expedition_companion','get_expedition_actor_trees','learn_expedition_talent','upgrade_expedition_skill') loop
 execute format('revoke all on function %s from public,anon',p.sig);execute format('grant execute on function %s to authenticated',p.sig);
end loop;end $$;
