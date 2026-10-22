-- Single talent catalog; branch defenses and HP belong to species/classes.
-- Release after 20261022191143_talent_branch_hp.sql. Existing learned snapshots stay immutable.
do $$declare tab text;begin foreach tab in array array['game_species','game_classes'] loop
 execute format('alter table public.%I add column hp_per_rank integer not null default 5 check(hp_per_rank between 1 and 100), add column passive_defenses jsonb not null default ''{"body":"primary","mind":"secondary","soul":"secondary","morale":"tertiary","social":"tertiary"}'', add column combat_resistances jsonb not null default ''{}''',tab);
 execute format('update public.%I s set hp_per_rank=p.hp_per_rank,passive_defenses=p.defenses,combat_resistances=p.resistances from public.game_combat_profiles p where p.%I=s.id',tab,case when tab='game_species' then 'species_id' else 'class_id' end);
end loop;end $$;
create function private.validate_branch_combat() returns trigger language plpgsql set search_path='' as $$begin
 perform private.combat_check_map(new.passive_defenses,'profile');perform private.combat_check_map(new.combat_resistances,'resistance');return new;
end $$;
revoke all on function private.validate_branch_combat() from public,anon,authenticated;
create trigger validate_species_combat before insert or update on public.game_species for each row execute function private.validate_branch_combat();
create trigger validate_class_combat before insert or update on public.game_classes for each row execute function private.validate_branch_combat();

alter table public.game_skills add column is_active_defense boolean not null default false;
update public.game_skills set is_active_defense=true where slug in ('reflexes','analysis','willpower','discipline','networking');
create unique index one_active_defense_per_attribute on public.game_skills(attribute) where is_active_defense;
alter table public.game_skills add constraint defense_skill_not_attack check(not(is_active_defense and is_combat));
-- Stable skill IDs/slugs preserve all investments, challenges and item references.
update public.game_skills_i18n i set name=v.name,description=v.description from (values
 ('reflexes','hu','Reakció','Aktív védelem a Testre érkező támadások ellen.'),('reflexes','en','Reaction','Active defense against attacks targeting Body.'),
 ('analysis','hu','Pszi-védelem','Aktív védelem az Elmére érkező támadások ellen.'),('analysis','en','Psi Defense','Active defense against attacks targeting Mind.'),
 ('willpower','hu','Akaraterő','Aktív védelem a Lélekre érkező támadások ellen.'),('willpower','en','Willpower','Active defense against attacks targeting Soul.'),
 ('discipline','hu','Fegyelem','Aktív védelem a Morálra érkező támadások ellen.'),('discipline','en','Discipline','Active defense against attacks targeting Morale.'),
 ('networking','hu','Állhatatosság','Aktív védelem a Szociális tulajdonságra érkező támadások ellen.'),('networking','en','Steadfastness','Active defense against attacks targeting Social.')
 ) v(slug,locale,name,description),public.game_skills s where s.slug=v.slug and i.skill_id=s.id and i.locale=v.locale;

alter table public.game_talent_tree_nodes add column talent_id uuid references public.game_talents(id) on delete restrict;
-- Migrate ALL authored passives, including Human/Mercenary, with stable node IDs.
insert into public.game_talents(id,slug,species_id,class_id,min_rank,max_rank,effects,image_path,is_published)
 select n.id,'tree_'||replace(n.id::text,'-',''),t.species_id,t.class_id,1,1,n.effects,n.image_path,t.is_published
 from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where n.kind='passive';
insert into public.game_talents_i18n(talent_id,locale,name,description)
 select n.id,'hu',n.name_hu,n.description_hu from public.game_talent_tree_nodes n where n.kind='passive'
 union all select n.id,'en',n.name_en,n.description_en from public.game_talent_tree_nodes n where n.kind='passive';
update public.game_talent_tree_nodes set talent_id=id,effects='[]' where kind='passive';
alter table public.game_talent_tree_nodes add constraint catalog_reward_only check(effects='[]'::jsonb and (kind='passive' and talent_id is not null or kind='power' and talent_id is null));
create index tree_node_talent on public.game_talent_tree_nodes(talent_id);
-- HP is the two branch bases plus the branch selected for each later point.
create or replace function private.talent_hp(p_species uuid,p_class uuid,p_character uuid) returns jsonb language sql stable set search_path='' as $$
 with bases as (
 select coalesce((select hp_per_rank from public.game_species where id=p_species),0) s,
 coalesce((select hp_per_rank from public.game_classes where id=p_class),0) c),
 spent as(select greatest(0,count(*) filter(where branch='species')::int-1) s,greatest(0,count(*) filter(where branch='class')::int-1) c from public.character_tree_nodes where character_id=p_character),
 ranks as(select coalesce((select species_rank-1 from public.character_combat_progress where character_id=p_character),0) s,coalesce((select class_rank-1 from public.character_combat_progress where character_id=p_character),0) c)
 select jsonb_build_object('species_base',b.s,'class_base',b.c,'species_points',n.s+r.s,'class_points',n.c+r.c,'species_total',b.s*(1+n.s+r.s),'class_total',b.c*(1+n.c+r.c),'max_health',b.s*(1+n.s+r.s)+b.c*(1+n.c+r.c)) from bases b cross join spent n cross join ranks r
$$;
revoke all on function private.talent_hp(uuid,uuid,uuid) from public,anon,authenticated;

create function private.branch_defenses(p_species uuid,p_class uuid,p_character uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare cfg jsonb;hp jsonb;branch record;a text;value int;d jsonb:='{}';begin
 select defense_curves into cfg from public.game_combat_rules where id=1;hp:=private.talent_hp(p_species,p_class,p_character);
 for a in select unnest(array['body','mind','soul','morale','social']) loop d:=jsonb_set(d,array[a],'0');end loop;
 for branch in select passive_defenses, (hp->>'species_points')::int spent from public.game_species where id=p_species union all select passive_defenses,(hp->>'class_points')::int from public.game_classes where id=p_class loop
 for a in select unnest(array['body','mind','soul','morale','social']) loop
 value:=(d->>a)::int+(cfg->(branch.passive_defenses->>a)->>'base')::int+branch.spent*(cfg->(branch.passive_defenses->>a)->>'per_rank')::int;
 d:=jsonb_set(d,array[a],to_jsonb(value));end loop;end loop;return d;
end $$;
revoke all on function private.branch_defenses(uuid,uuid,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.combat_hero(p_character uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.characters%rowtype;g public.character_combat_progress%rowtype;lvl integer;cfg jsonb;prof record;a text;rank integer;defenses jsonb:='{}';effects jsonb:='[]';resist jsonb:='{}';skills jsonb:='{}';powers jsonb;hp integer:=0;weapon integer:=3;weapon_chosen boolean:=false;weapon_types jsonb:='["kinetic"]';r record;e jsonb;v integer;
begin
 select * into c from public.characters where id=p_character;select * into g from public.character_combat_progress where character_id=p_character;select level into lvl from public.character_progress where character_id=p_character;select defense_curves into cfg from public.game_combat_rules where id=1;
 defenses:=private.branch_defenses(c.species_id,c.class_id,c.id);hp:=(private.talent_hp(c.species_id,c.class_id,c.id)->>'max_health')::int;
 for prof in select combat_resistances resistances from public.game_species where id=c.species_id union all select combat_resistances from public.game_classes where id=c.class_id loop
 for a,e in select * from jsonb_each(prof.resistances) loop resist:=jsonb_set(resist,array[a],to_jsonb(coalesce((resist->>a)::int,0)+(e::text)::int));end loop;end loop;
 for r in select ic.*,eq.slot from public.character_equipment eq join public.game_item_combat ic on ic.item_id=eq.item_id where eq.character_id=c.id and eq.crew_id is null order by case eq.slot when 'main_weapon' then 0 when 'sidearm' then 1 else 2 end loop
  if r.slot in ('main_weapon','sidearm') and r.weapon_pips>0 and not weapon_chosen then weapon:=r.weapon_pips;weapon_types:=r.damage_types;weapon_chosen:=true;end if;
  effects:=effects||r.effects;
  for a,e in select * from jsonb_each(r.resistances) loop resist:=jsonb_set(resist,array[a],to_jsonb(coalesce((resist->>a)::int,0)+(e::text)::int));end loop;
 end loop;
 for r in select t.effects,ct.rank from public.character_talents ct join public.game_talents t on t.id=ct.talent_id where ct.character_id=c.id loop
  for e in select value from jsonb_array_elements(r.effects) loop effects:=effects||jsonb_build_array(jsonb_set(e,'{amount}',to_jsonb((e->>'amount')::int*r.rank)));end loop;
 end loop;
 select effects||coalesce(jsonb_agg(ne.value),'[]') into effects from public.character_tree_nodes tn cross join lateral jsonb_array_elements(tn.snapshot->'effects') ne(value) where tn.character_id=c.id;
 select coalesce(jsonb_agg(p||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_powers_i18n t where t.power_id=(p->>'id')::uuid),'[]'))),'[]') into powers from (
 select distinct to_jsonb(p) p from public.game_powers p left join public.game_power_grants gr on gr.power_id=p.id
 where p.is_published and p.min_level<=lvl and ((gr.min_level<=lvl and (
 gr.source='basic' or gr.source='species' and gr.species_id=c.species_id and gr.min_rank<=coalesce(g.species_rank,1)
 or gr.source='class' and gr.class_id=c.class_id and gr.min_rank<=coalesce(g.class_rank,1)
 or gr.source='item' and exists(select 1 from public.character_equipment eq where eq.character_id=c.id and eq.crew_id is null and eq.item_id=gr.item_id)))
 or exists(select 1 from public.character_powers cp where cp.character_id=c.id and cp.power_id=p.id))) available;
 for e in select value from jsonb_array_elements(powers) where value->>'kind'='passive' loop effects:=effects||(e->'effects');end loop;
 for r in select s.id,s.attribute,coalesce(u.bonus_pips,0) earned from public.game_skills s left join public.character_skill_upgrades u on u.skill_id=s.id and u.character_id=c.id where s.is_combat or s.is_active_defense loop
  skills:=jsonb_set(skills,array[r.id::text],to_jsonb(coalesce((c.attribute_pips->>r.attribute::text)::int,3)+coalesce((c.skill_bonus_pips->>r.id::text)::int,0)+r.earned));
 end loop;
 return jsonb_build_object('id','captain','player',true,'name_hu',c.captain_name,'name_en',c.captain_name,'image_path',(select image_path from public.game_species where id=c.species_id),
 'active_defense_skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'attribute',s.attribute,'texts',(select jsonb_agg(i) from public.game_skills_i18n i where i.skill_id=s.id))) from public.game_skills s where s.is_active_defense),'[]'),'action_points',3,'active_defense',null,'level',lvl,'danger',0,'attributes',c.attribute_pips,'defenses',defenses,'skills',skills,'skill_attributes',(select jsonb_object_agg(id::text,attribute::text) from public.game_skills where is_combat or is_active_defense),
 'health',least(hp,coalesce(g.health,hp)),'max_health',hp,'injuries',coalesce(g.injuries,'{}'),'weapon_pips',weapon,'weapon_damage_types',weapon_types,
 'has_weapon',exists(select 1 from public.character_equipment eq join public.game_item_combat ic on ic.item_id=eq.item_id where eq.character_id=c.id and eq.crew_id is null and eq.slot in ('main_weapon','sidearm') and ic.weapon_pips>0),
 'resistances',resist,'effects',effects,'powers',powers,'turn',0,'cooldowns','{}'::jsonb,'uses','{}'::jsonb);
end $function$
;
CREATE OR REPLACE FUNCTION private.save_talent_tree(p_id uuid, p_revision integer, p_document jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tid uuid;old public.game_talent_trees%rowtype;n jsonb;e jsonb;k text;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 if jsonb_typeof(p_document) is distinct from 'object' or pg_column_size(p_document)>524288 or jsonb_typeof(p_document->'nodes') is distinct from 'array' or jsonb_typeof(p_document->'connections') is distinct from 'array' then raise exception 'Invalid tree document';end if;
 if jsonb_array_length(p_document->'nodes')>100 or jsonb_array_length(p_document->'connections')>300 then raise exception 'Tree content limit exceeded';end if;
 foreach k in array array['width','height'] loop if coalesce(p_document->>k,'') !~ '^[0-9]+$' then raise exception 'Invalid tree size';end if;end loop;
 if p_id is null then
  insert into public.game_talent_trees(species_id,class_id,width,height,is_published) values(nullif(p_document->>'species_id','')::uuid,nullif(p_document->>'class_id','')::uuid,(p_document->>'width')::int,(p_document->>'height')::int,(p_document->>'is_published')::boolean) returning id into tid;
 else
  select * into old from public.game_talent_trees where id=p_id for update;if not found then raise exception 'Tree not found';end if;
  if old.revision is distinct from p_revision then raise exception 'Tree changed; reload before saving' using errcode='40001';end if;
  if old.species_id is distinct from nullif(p_document->>'species_id','')::uuid or old.class_id is distinct from nullif(p_document->>'class_id','')::uuid then raise exception 'Tree owner cannot change';end if;
  tid:=p_id;update public.game_talent_trees set width=(p_document->>'width')::int,height=(p_document->>'height')::int,is_published=(p_document->>'is_published')::boolean,revision=revision+1,updated_at=now() where id=tid;
  delete from public.game_talent_tree_nodes where tree_id=tid;
 end if;
 for n in select value from jsonb_array_elements(p_document->'nodes') loop
  foreach k in array array['x','y'] loop if coalesce(n->>k,'') !~ '^[0-9]+$' then raise exception 'Invalid node position';end if;end loop;
  if coalesce(n->'effects','[]'::jsonb)<>'[]'::jsonb then raise exception 'Choose a catalog talent; inline effects are not allowed';end if;
  if n->>'kind'='passive' and not exists(select 1 from public.game_talents ta join public.game_talent_trees tr on tr.id=tid where ta.id=nullif(n->>'talent_id','')::uuid and (ta.species_id=tr.species_id or ta.class_id=tr.class_id)) then raise exception 'Choose a talent for this branch';end if;
  insert into public.game_talent_tree_nodes(id,tree_id,x,y,name_hu,name_en,description_hu,description_en,image_path,kind,power_id,effects,min_level,talent_id)
  values((n->>'id')::uuid,tid,(n->>'x')::int,(n->>'y')::int,n->>'name_hu',n->>'name_en',coalesce(n->>'description_hu',''),coalesce(n->>'description_en',''),nullif(n->>'image_path',''),n->>'kind',nullif(n->>'power_id','')::uuid,'[]',coalesce((n->>'min_level')::int,1),nullif(n->>'talent_id','')::uuid);
 end loop;
 if exists(select 1 from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where t.id=tid and (n.x+4>t.width or n.y+4>t.height)) then raise exception 'Nodes outside tree';end if;
 if exists(select 1 from public.game_talent_tree_nodes a join public.game_talent_tree_nodes b on a.tree_id=b.tree_id and a.id<b.id where a.tree_id=tid and a.x<b.x+4 and a.x+4>b.x and a.y<b.y+4 and a.y+4>b.y) then raise exception 'Nodes overlap';end if;
 for e in select value from jsonb_array_elements(p_document->'connections') loop insert into public.game_talent_tree_edges values(tid,(e->>'from_node_id')::uuid,(e->>'to_node_id')::uuid);end loop;
 if exists(select 1 from public.game_talent_tree_nodes where tree_id=tid and talent_id is not null group by talent_id having count(*)>1) then raise exception 'Talent already assigned in tree';end if;
 if exists(with recursive reach(a,b) as(select from_node_id,to_node_id from public.game_talent_tree_edges where tree_id=tid union select r.a,e.to_node_id from reach r join public.game_talent_tree_edges e on e.tree_id=tid and e.from_node_id=r.b) select 1 from reach where a=b) then raise exception 'Circular tree connection';end if;
 if (p_document->>'is_published')::boolean and (jsonb_array_length(p_document->'nodes')=0 or exists(select 1 from public.game_talent_tree_nodes n left join public.game_powers p on p.id=n.power_id left join public.game_talents ta on ta.id=n.talent_id where n.tree_id=tid and (n.kind='passive' and (not coalesce(ta.is_published,false) or ta.effects='[]'::jsonb) or n.kind='power' and not coalesce(p.is_published,false)))) then raise exception 'Ready tree requires configured published rewards';end if;
 return jsonb_build_object('id',tid,'revision',(select revision from public.game_talent_trees where id=tid));
end $function$
;
CREATE OR REPLACE FUNCTION private.talent_tree_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 return jsonb_build_object(
 'trees',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('nodes',coalesce((select jsonb_agg(n order by n.y,n.x,n.id) from public.game_talent_tree_nodes n where n.tree_id=t.id),'[]'::jsonb),'connections',coalesce((select jsonb_agg(e order by e.from_node_id,e.to_node_id) from public.game_talent_tree_edges e where e.tree_id=t.id),'[]'::jsonb))) from public.game_talent_trees t),'[]'::jsonb),
 'species',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_species_i18n i where i.species_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_species s),'[]'::jsonb),
 'classes',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_classes_i18n i where i.class_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_classes s),'[]'::jsonb),
 'powers',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_powers_i18n i where i.power_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_powers s),'[]'::jsonb),
 'talents',coalesce((select jsonb_agg(to_jsonb(ta)||jsonb_build_object('texts',(select jsonb_agg(i) from public.game_talents_i18n i where i.talent_id=ta.id))) from public.game_talents ta),'[]'),
 'skills',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(i) from public.game_skills_i18n i where i.skill_id=s.id),'[]'::jsonb)) order by s.slug) from public.game_skills s),'[]'::jsonb));
end $function$
;
CREATE OR REPLACE FUNCTION private.learn_tree_node(p_node uuid, p_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid;c public.characters%rowtype;t public.game_talent_trees%rowtype;n public.game_talent_tree_nodes%rowtype;pts jsonb;b text;lvl int;begin
 cid:=private.combat_owned_character();select * into c from public.characters where id=cid;
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) or exists(select 1 from public.character_skill_challenge_runs where character_id=cid and status='active') then raise exception 'Finish active encounter first';end if;
 select tr.* into t from public.game_talent_trees tr join public.game_talent_tree_nodes nd on nd.tree_id=tr.id where nd.id=p_node for update of tr;
 if not found or not t.is_published or not(coalesce(t.species_id=c.species_id,false) or coalesce(t.class_id=c.class_id,false)) then raise exception 'Talent unavailable';end if;
 if t.revision is distinct from p_revision then raise exception 'Tree changed; reload before learning' using errcode='40001';end if;
 select * into strict n from public.game_talent_tree_nodes where id=p_node and tree_id=t.id;
 if exists(select 1 from public.character_tree_nodes where character_id=cid and node_id=n.id) then raise exception 'Talent already learned';end if;
 select level into lvl from public.character_progress where character_id=cid;
 if n.min_level>lvl or exists(select 1 from public.game_talent_tree_edges e where e.tree_id=t.id and e.to_node_id=n.id and not exists(select 1 from public.character_tree_nodes o where o.character_id=cid and o.node_id=e.from_node_id)) then raise exception 'Talent prerequisites unmet';end if;
 if n.kind='power' and not exists(select 1 from public.game_powers where id=n.power_id and is_published and min_level<=lvl) then raise exception 'Power unavailable';end if;
 if n.kind='passive' then
 select effects into n.effects from public.game_talents where id=n.talent_id and is_published;
 if not found then raise exception 'Talent unavailable';end if;
 if exists(select 1 from public.character_tree_nodes where character_id=cid and (snapshot->>'talent_id'=n.talent_id::text or node_id=n.talent_id)) or exists(select 1 from public.character_talents where character_id=cid and talent_id=n.talent_id) then raise exception 'Talent already learned';end if;
 perform private.combat_check_effects(n.effects,true);
 end if;
 b:=case when t.species_id is not null then 'species' else 'class' end;pts:=private.tree_points(cid);
 if (pts->>b)::int=0 and (pts->>'shared')::int=0 then raise exception 'No talent points available';end if;
 insert into public.character_tree_nodes(character_id,node_id,tree_id,branch,snapshot) values(cid,n.id,t.id,b,to_jsonb(n));
 if n.kind='power' then insert into public.character_powers(character_id,power_id) values(cid,n.power_id) on conflict do nothing;end if;
 return private.player_tree_catalog(null,null);
end $function$
;
CREATE OR REPLACE FUNCTION private.player_tree_catalog(p_species uuid, p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid;lvl int:=1;begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();
 if cid is not null then select species_id,class_id into p_species,p_class from public.characters where id=cid;select level into lvl from public.character_progress where character_id=cid;end if;
 return jsonb_build_object('level',lvl,'hp',private.talent_hp(p_species,p_class,cid),'passive_defenses',private.branch_defenses(p_species,p_class,cid),'points',case when cid is null then '{"species":1,"class":1,"shared":0}'::jsonb else private.tree_points(cid) end,
 
 'powers',coalesce((select jsonb_agg(to_jsonb(p)) from public.game_powers p where p.is_published and exists(select 1 from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where n.power_id=p.id and t.is_published and (t.species_id=p_species or t.class_id=p_class))),'[]'),
 'skills',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name_hu',coalesce((select name from public.game_skills_i18n i where i.skill_id=s.id and i.locale='hu'),s.slug),'name_en',coalesce((select name from public.game_skills_i18n i where i.skill_id=s.id and i.locale='en'),s.slug))) from public.game_skills s),'[]'),
 'owned',coalesce((select jsonb_agg(node_id) from (select node_id from public.character_tree_nodes where character_id=cid union select nd.id from public.game_talent_tree_nodes nd join public.character_talents ct on ct.talent_id=nd.talent_id where ct.character_id=cid) owned_nodes),'[]'),
 'trees',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('nodes',coalesce((select jsonb_agg(to_jsonb(n)||jsonb_build_object('effects',coalesce(ta.effects,n.effects),'talent_published',coalesce(ta.is_published,false),'power_published',coalesce(p.is_published,false)) order by n.y,n.x) from public.game_talent_tree_nodes n left join public.game_powers p on p.id=n.power_id left join public.game_talents ta on ta.id=n.talent_id where n.tree_id=t.id),'[]'),'connections',coalesce((select jsonb_agg(e) from public.game_talent_tree_edges e where e.tree_id=t.id),'[]'))) from public.game_talent_trees t where t.is_published and (t.species_id=p_species or t.class_id=p_class)),'[]'));
end $function$
;

create or replace function private.combat_learn(p_talent uuid,p_expected_rank integer) returns jsonb language plpgsql security definer set search_path='' as $$begin raise exception 'Choose talents in the talent tree';end $$;
CREATE OR REPLACE FUNCTION private.combat_editor_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 return jsonb_build_object(
 'powers',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_powers_i18n t where t.power_id=p.id),'[]'),'grants',coalesce((select jsonb_agg(g) from public.game_power_grants g where g.power_id=p.id),'[]'))) from public.game_powers p),'[]'),
 'talents',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_talents_i18n t where t.talent_id=p.id),'[]'))) from public.game_talents p),'[]'),
 'enemies',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_enemies_i18n t where t.enemy_id=p.id),'[]'))) from public.game_enemies p),'[]'),
 'encounters',coalesce((select jsonb_agg(p) from public.game_combat_encounters p),'[]'),
 'items',coalesce((select jsonb_agg(p) from public.game_item_combat p),'[]'),
 'rules',(select to_jsonb(p) from public.game_combat_rules p where id=1),
 'skills',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_skills_i18n t where t.skill_id=s.id),'[]'))) from public.game_skills s),'[]'),
 'species',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_species_i18n t where t.species_id=s.id),'[]'))) from public.game_species s),'[]'),
 'classes',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_classes_i18n t where t.class_id=s.id),'[]'))) from public.game_classes s),'[]'),
 'equipment',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_items_i18n t where t.item_id=i.id),'[]'))) from public.game_items i where i.equip_owner is not null),'[]'),
 'locations',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('texts',coalesce((select jsonb_agg(t) from public.game_locations_i18n t where t.location_id=l.id),'[]'))) from public.game_locations l),'[]'),
 'locales',(select jsonb_agg(l order by sort_order) from public.game_locales l where is_enabled));
end $function$;
CREATE OR REPLACE FUNCTION private.save_combat_content(p_kind text, p_id uuid, p_document jsonb, p_translations jsonb, p_grants jsonb, p_revision integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tab text;prefix text;pk text:='id';ident uuid;existing integer;cols text;sets text;allowed text[];k text;t jsonb;g jsonb;result jsonb;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 tab:=case p_kind when 'powers' then 'game_powers' when 'talents' then 'game_talents' when 'enemies' then 'game_enemies' when 'encounters' then 'game_combat_encounters' when 'items' then 'game_item_combat' when 'rules' then 'game_combat_rules' end;
 if tab is null or jsonb_typeof(p_document) is distinct from 'object' then raise exception 'Invalid combat document';end if;
 if p_kind='rules' then
  select revision into existing from public.game_combat_rules where id=1 for update;if p_revision is distinct from existing then raise exception 'Content changed; reload';end if;
  update public.game_combat_rules set defense_curves=p_document->'defense_curves',recovery_energy=(p_document->>'recovery_energy')::int,injury_recovery_ticks=(p_document->>'injury_recovery_ticks')::int,max_rounds=(p_document->>'max_rounds')::int where id=1 returning to_jsonb(game_combat_rules) into result;return result;
 end if;
 if p_kind='items' then pk:='item_id';ident:=coalesce(p_id,(p_document->>'item_id')::uuid);else ident:=coalesce(p_id,gen_random_uuid());end if;
 execute format('select revision from public.%I where %I=$1 for update',tab,pk) into existing using ident;
 if existing is not null and p_revision is distinct from existing or existing is null and p_revision is not null then raise exception 'Content changed; reload';end if;
 select array_agg(attname::text) into allowed from pg_attribute where attrelid=('public.'||tab)::regclass and attnum>0 and not attisdropped and attname not in ('id','revision');
 for k in select jsonb_object_keys(p_document) loop if not k=any(allowed) then raise exception 'Unknown content field: %',k;end if;end loop;
 p_document:=p_document||jsonb_build_object(pk,ident,'revision',coalesce(existing,0)+1);
 select string_agg(format('%I',key),','),string_agg(format('%1$I=excluded.%1$I',key),',') into cols,sets from jsonb_object_keys(p_document)key where key<>'revision';
 -- Populate from the existing row for updates so omitted optional fields retain their values.
 if existing is not null then execute format('select to_jsonb(t) from public.%I t where %I=$1',tab,pk) into result using ident;p_document:=result||p_document;end if;
 execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) on conflict(%3$I) do update set %4$s returning to_jsonb(%1$I)',tab,cols,pk,sets) into result using p_document;
 if p_kind in ('powers','talents','enemies') then
  if jsonb_typeof(p_translations) is distinct from 'array' or jsonb_array_length(p_translations)>30 or not exists(select 1 from jsonb_array_elements(p_translations)x where x->>'locale'='hu' and length(btrim(x->>'name'))>0) or not exists(select 1 from jsonb_array_elements(p_translations)x where x->>'locale'='en' and length(btrim(x->>'name'))>0) then raise exception 'Hungarian and English names required';end if;
  prefix:=case p_kind when 'powers' then 'power_id' when 'talents' then 'talent_id' else 'enemy_id' end;
  execute format('delete from public.%I_i18n where %I=$1',tab,prefix) using ident;
  for t in select value from jsonb_array_elements(p_translations) loop execute format('insert into public.%I_i18n(%I,locale,name,description) values($1,$2,$3,$4)',tab,prefix) using ident,t->>'locale',t->>'name',coalesce(t->>'description','');end loop;
 end if;
 if p_kind='powers' then
  if jsonb_typeof(p_grants) is distinct from 'array' or jsonb_array_length(p_grants)>100 then raise exception 'Invalid power grants';end if;
  delete from public.game_power_grants where power_id=ident;
  for g in select value from jsonb_array_elements(p_grants) loop
   insert into public.game_power_grants(power_id,source,species_id,class_id,item_id,faction_id,min_level,min_rank) values(ident,g->>'source',nullif(g->>'species_id','')::uuid,nullif(g->>'class_id','')::uuid,nullif(g->>'item_id','')::uuid,nullif(g->>'faction_id','')::uuid,coalesce((g->>'min_level')::int,1),coalesce((g->>'min_rank')::int,1));
  end loop;
 end if;
 if p_kind='talents' and not (result->>'is_published')::boolean and exists(select 1 from public.game_talent_tree_nodes n join public.game_talent_trees t on t.id=n.tree_id where n.talent_id=ident and t.is_published) then raise exception 'Published tree requires this talent';end if;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION private.validate_combat_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare a text;b text;v jsonb;begin
 if tg_table_name in ('game_powers','game_talents','game_enemies') then
  if new.image_path is not null and (length(new.image_path)>300 or new.image_path !~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$') then raise exception 'Invalid combat artwork path';end if;
 end if;
 if tg_table_name='game_powers' then
  if new.kind<>'active' then raise exception 'Create passive abilities in the talent catalog';end if;
  perform private.combat_check_effects(new.effects,new.kind='passive');
  if new.requires_hit and not exists(select 1 from public.game_skills where id=new.skill_id and is_combat) then raise exception 'Choose an existing combat skill';end if;
  if new.kind='passive' and (new.requires_hit or new.target<>'self') then raise exception 'Passives must target self without an attack';end if;
 elsif tg_table_name='game_talents' then perform private.combat_check_effects(new.effects,true);
  if exists(select 1 from public.game_talent_tree_nodes nd join public.game_talent_trees tr on tr.id=nd.tree_id where nd.talent_id=new.id and not(coalesce(new.species_id=tr.species_id,false) or coalesce(new.class_id=tr.class_id,false))) then raise exception 'Assigned talent must stay in its branch';end if;
  if new.effects='[]'::jsonb and exists(select 1 from public.game_talent_tree_nodes nd join public.game_talent_trees tr on tr.id=nd.tree_id where nd.talent_id=new.id and tr.is_published) then raise exception 'Published tree requires configured talent effects';end if;
  if new.prerequisite_id is not null and not exists(select 1 from public.game_talents t where t.id=new.prerequisite_id and t.species_id is not distinct from new.species_id and t.class_id is not distinct from new.class_id) then raise exception 'Talent prerequisite must be in the same tree';end if;
  if exists(with recursive parents as (select id,prerequisite_id from public.game_talents where id=new.prerequisite_id union select t.id,t.prerequisite_id from public.game_talents t join parents p on t.id=p.prerequisite_id) select 1 from parents where id=new.id) then raise exception 'Talent prerequisite cycle';end if;
 elsif tg_table_name='game_item_combat' then if new.damage_types='["weapon"]'::jsonb then raise exception 'Item requires concrete damage types';end if;perform private.combat_check_types(new.damage_types);perform private.combat_check_map(new.resistances,'resistance');perform private.combat_check_effects(new.effects,true);
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
end $function$;
drop table public.game_combat_profiles;

-- One active skill replaces only its attribute's passive defense, until the next own turn.
create function private.active_defense_pool(p_actor jsonb,p_attribute text) returns integer language plpgsql immutable set search_path='' as $$declare sk jsonb;begin
 sk:=p_actor->'active_defense';
 if sk->>'attribute'=p_attribute then
 return greatest(0,coalesce((p_actor->'skills'->>(sk->>'id'))::int,0)+private.combat_modifier(p_actor,'skill',sk->>'id')+private.combat_modifier(p_actor,'attribute',p_attribute)-coalesce((p_actor->'injuries'->>p_attribute)::int,0));end if;
 return private.combat_stat(p_actor,'defenses',p_attribute)+case when (p_actor->>'player')::boolean then 0 else coalesce((p_actor->>'danger')::int,0) end;
end $$;
revoke all on function private.active_defense_pool(jsonb,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.combat_resolve_action(p_state jsonb, p_power uuid, p_target integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare idx integer:=(p_state->>'current')::int;actor jsonb:=p_state->'actors'->idx;power jsonb;e jsonb;target jsonb;attack jsonb;defense jsonb;pool integer;attr text;hit boolean:=true;reason text;key text;where_target integer;list jsonb;startseq integer:=coalesce((actor->>'turn_start_sequence')::int,0);old jsonb;current_effect jsonb;status_list jsonb;blocked boolean;strength integer;old_strength integer;
begin
 if p_state->>'status'<>'active' or p_target not between 0 and jsonb_array_length(p_state->'actors')-1 then raise exception 'Invalid combat action';end if;
 if coalesce((actor->>'action_points')::int,3)<1 then raise exception 'No action points available';end if;
 if p_power is not null then
  select value into power from jsonb_array_elements(actor->'powers') where value->>'id'=p_power::text;
  reason:=private.combat_power_reason(actor,power,p_state->'operation_uses');if reason is not null then raise exception 'Power unavailable: %',reason;end if;
  if power->>'target'='self' and p_target<>idx or power->>'target'='enemy' and p_target=idx then raise exception 'Wrong target';end if;
  key:=p_power::text;actor:=jsonb_set(actor,array['cooldowns',key],to_jsonb((actor->>'turn')::int+(power->>'cooldown')::int));actor:=jsonb_set(actor,array['uses',key],to_jsonb(coalesce((actor->'uses'->>key)::int,0)+1));
  if power->>'limit_scope'='operation' and (actor->>'player')::boolean then p_state:=jsonb_set(p_state,array['operation_uses',key],to_jsonb(coalesce((p_state->'operation_uses'->>key)::int,0)+1));end if;
  p_state:=jsonb_set(p_state,array['actors',idx::text],actor);
  p_state:=private.combat_log(p_state,jsonb_build_object('type','power','source',idx,'target',p_target,'power_id',p_power,'texts',power->'texts'));
  if (power->>'requires_hit')::boolean then
   target:=p_state->'actors'->p_target;attr:=coalesce(actor->'skill_attributes'->>(power->>'skill_id'),power->>'defense');
   if (actor->>'player')::boolean then pool:=coalesce((actor->'skills'->>(power->>'skill_id'))::int,private.combat_stat(actor,'attributes',attr)) +private.combat_modifier(actor,'skill',power->>'skill_id')+private.combat_modifier(actor,'attribute',attr)-coalesce((actor->'injuries'->>attr)::int,0);
   else pool:=private.combat_stat(actor,'attributes',attr)+(actor->>'danger')::int;end if;
   attack:=private.combat_roll(least(900,greatest(0,pool)),case when (actor->>'player')::boolean then 'skill' else 'plain' end);
   defense:=private.combat_roll(least(900,private.active_defense_pool(target,power->>'defense')),case when target->'active_defense'->>'attribute'=power->>'defense' then 'skill' else 'plain' end);
   hit:=(attack->>'roll_total')::int>(defense->>'roll_total')::int;
   p_state:=private.combat_log(p_state,jsonb_build_object('type','attack','source',idx,'target',p_target,'roll',attack));p_state:=private.combat_log(p_state,jsonb_build_object('type','defense','source',p_target,'target',idx,'roll',defense,'hit',hit));
  end if;
  p_state:=p_state||jsonb_build_object('attack_defense',power->>'defense');
  if hit then
   for e in select value from jsonb_array_elements(power->'effects') loop
    where_target:=case when e->>'target'='self' then idx else p_target end;
    if e->>'type' in ('ongoing_damage','ongoing_heal') then
     old:=p_state->'actors'->where_target;
     e:=e||jsonb_build_object('source',idx,'remaining',(e->>'duration')::int,'applied_sequence',coalesce((p_state->>'event_sequence')::int,0),'defense',power->>'defense');
     status_list:='[]';blocked:=false;strength:=private.combat_formula(actor,e->'formula');
     for current_effect in select value from jsonb_array_elements(old->'effects') loop
      if current_effect->>'type'=e->>'type' and coalesce(current_effect->>'group','default')=coalesce(e->>'group','default') then
       old_strength:=private.combat_formula(p_state->'actors'->coalesce((current_effect->>'source')::int,idx),current_effect->'formula');
       if old_strength>strength then blocked:=true;status_list:=status_list||jsonb_build_array(current_effect);end if;
      else status_list:=status_list||jsonb_build_array(current_effect);end if;
     end loop;
     if not blocked then status_list:=status_list||jsonb_build_array(e);end if;
     old:=jsonb_set(old,'{effects}',status_list);p_state:=jsonb_set(p_state,array['actors',where_target::text],old);
     p_state:=private.combat_log(p_state,jsonb_build_object('type','effect','source',idx,'target',where_target,'effect',e,'blocked',blocked));
    else p_state:=private.combat_apply_effect(p_state,idx,where_target,e);end if;
   end loop;
  end if;
 else p_state:=private.combat_log(p_state,jsonb_build_object('type','wait','source',idx));end if;
 actor:=p_state->'actors'->idx;actor:=jsonb_set(actor,'{action_points}',to_jsonb(case when p_power is null then 0 else coalesce((actor->>'action_points')::int,3)-1 end));p_state:=jsonb_set(p_state,array['actors',idx::text],actor);
 -- Age effects after their owner's action; self effects created during this action keep their first full turn.
 actor:=p_state->'actors'->idx;list:='[]';
 for e in select value from jsonb_array_elements(actor->'effects') loop
  if coalesce((actor->>'action_points')::int,0)=0 and coalesce((e->>'duration')::int,0)>0 and coalesce((e->>'applied_sequence')::int,0)<=startseq then e:=jsonb_set(e,'{remaining}',to_jsonb((e->>'remaining')::int-1));end if;
  if coalesce((e->>'duration')::int,0)=0 or (e->>'remaining')::int>0 then list:=list||jsonb_build_array(e);end if;
 end loop;
 actor:=jsonb_set(actor,'{effects}',list);p_state:=jsonb_set(p_state,array['actors',idx::text],actor);
 return p_state;
end $function$
;
CREATE OR REPLACE FUNCTION private.combat_next_turn(p_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$declare cursor integer:=(p_state->>'cursor')::int;idx integer;actor jsonb;e jsonb;source integer;begin
 -- A zero-health participant can keep acting until an attribute is reduced to zero.
 if coalesce((p_state->'actors'->0->>'extracted')::boolean,false) then return p_state||'{"status":"defeat"}'::jsonb;end if;
 if coalesce((p_state->'actors'->1->>'extracted')::boolean,false) then return p_state||'{"status":"victory"}'::jsonb;end if;
 if coalesce((p_state->'actors'->((p_state->>'current')::int)->>'action_points')::int,0)>0 then return p_state;end if;
 cursor:=cursor+1;if cursor>=jsonb_array_length(p_state->'order') then cursor:=0;p_state:=jsonb_set(p_state,'{round}',to_jsonb((p_state->>'round')::int+1));end if;
 if (p_state->>'round')::int>(p_state->>'max_rounds')::int then return p_state||'{"status":"draw"}'::jsonb;end if;
 idx:=(p_state->'order'->>cursor)::int;actor:=p_state->'actors'->idx;actor:=jsonb_set(actor,'{turn}',to_jsonb((actor->>'turn')::int+1));actor:=actor||jsonb_build_object('action_points',3,'active_defense',null,'turn_start_sequence',coalesce((p_state->>'event_sequence')::int,0));
 p_state:=p_state||jsonb_build_object('cursor',cursor,'current',idx);p_state:=jsonb_set(p_state,array['actors',idx::text],actor);
 for e in select value from jsonb_array_elements(actor->'effects') where value->>'type' in ('ongoing_damage','ongoing_heal') loop
  source:=coalesce((e->>'source')::int,idx);p_state:=private.combat_apply_effect(p_state,source,idx,e);
 end loop;
 if coalesce((p_state->'actors'->0->>'extracted')::boolean,false) then p_state:=p_state||'{"status":"defeat"}'::jsonb;
 elsif coalesce((p_state->'actors'->1->>'extracted')::boolean,false) then p_state:=p_state||'{"status":"victory"}'::jsonb;end if;
 return p_state;
end $function$
;

create function private.combat_activate_defense(p_run uuid,p_revision integer,p_request uuid,p_skill uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.combat_runs%rowtype;response jsonb;s jsonb;actor jsonb;sk jsonb;begin
 if auth.uid() is null then raise exception 'Login required';end if;
 select * into r from public.combat_runs where id=p_run and owner_id=auth.uid();if not found then raise exception 'Combat not found';end if;
 if not r.simulation then perform private.combat_owned_character();end if;
 select * into r from public.combat_runs where id=p_run and owner_id=auth.uid() for update;
 if r.simulation and not private.can_edit_content() then raise exception 'Editor permission required';end if;
 if p_request is null then raise exception 'Request ID required';end if;
 select combat_commands.response into response from public.combat_commands where run_id=r.id and request_id=p_request;if found then return response;end if;
 if r.status<>'active' then raise exception 'Combat has ended';end if;
 if p_revision is distinct from r.revision then raise exception 'Combat state changed; reload';end if;
 if (r.state->>'current')::int<>0 then raise exception 'Not your turn';end if;
 actor:=r.state->'actors'->0;
 select value into sk from jsonb_array_elements(coalesce(actor->'active_defense_skills','[]')) where value->>'id'=p_skill::text;
 if sk is null then raise exception 'Choose an active defense skill';end if;
 if coalesce((actor->>'action_points')::int,3)<1 then raise exception 'No action points available';end if;
 actor:=actor||jsonb_build_object('active_defense',sk,'action_points',coalesce((actor->>'action_points')::int,3)-1);
 s:=jsonb_set(jsonb_set(r.state,'{events}','[]'),'{actors,0}',actor);
 s:=private.combat_log(s,jsonb_build_object('type','active_defense','source',0,'texts',sk->'texts'));
 s:=private.combat_auto(private.combat_next_turn(s));
 perform private.combat_commit(r.id,s);response:=private.combat_view(r.id);
 insert into public.combat_commands(run_id,request_id,response) values(r.id,p_request,response);return response;
end $$;
create function public.activate_combat_defense(p_run uuid,p_revision integer,p_request uuid,p_skill uuid) returns jsonb language sql security invoker set search_path='' as $$select private.combat_activate_defense(p_run,p_revision,p_request,p_skill)$$;
revoke all on function private.combat_activate_defense(uuid,integer,uuid,uuid),public.activate_combat_defense(uuid,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function private.combat_activate_defense(uuid,integer,uuid,uuid),public.activate_combat_defense(uuid,integer,uuid,uuid) to authenticated;
CREATE OR REPLACE FUNCTION private.combat_view(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.combat_runs%rowtype;state jsonb;actor jsonb;idx int;a text;stats jsonb;powers jsonb;
begin
 select * into r from public.combat_runs where id=p_run;state:=r.state;
 for idx in 0..jsonb_array_length(state->'actors')-1 loop
  actor:=state->'actors'->idx;stats:='{}';
  for a in select unnest(array['body','mind','soul','morale','social']) loop stats:=jsonb_set(stats,array[a],to_jsonb(private.active_defense_pool(actor,a)));end loop;
  state:=jsonb_set(state,array['actors',idx::text],actor||jsonb_build_object('effective_defenses',stats));
 end loop;
 select coalesce(jsonb_agg(p||jsonb_build_object('blocked_reason',private.combat_power_reason(state->'actors'->0,p,state->'operation_uses'),
 'cooldown_remaining',greatest(0,coalesce((state->'actors'->0->'cooldowns'->>(p->>'id'))::int,0)-(state->'actors'->0->>'turn')::int),
 'uses_remaining',case when p->>'max_uses' is null then null else greatest(0,(p->>'max_uses')::int-case when p->>'limit_scope'='operation' and (state->'actors'->0->>'player')::boolean then coalesce((state->'operation_uses'->>(p->>'id'))::int,0) else coalesce((state->'actors'->0->'uses'->>(p->>'id'))::int,0) end) end)),'[]') into powers from jsonb_array_elements(state->'actors'->0->'powers')p where p->>'kind'='active';
 return to_jsonb(r)||jsonb_build_object('state',state,'available_powers',powers);
end $function$
;

-- Authoritative starting-defense preview shared with combat calculations.
create function private.preview_character_defenses(p_species uuid,p_class uuid,p_species_node uuid,p_class_node uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb;effects jsonb:='[]';n record;a text;actor jsonb;nd uuid;b text;begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501';end if;
 if not exists(select 1 from public.game_species where id=p_species and is_published) or not exists(select 1 from public.game_classes where id=p_class and is_published) then raise exception 'Character origin unavailable';end if;
 d:=private.branch_defenses(p_species,p_class,null);
 foreach b in array array['species','class'] loop
 nd:=case when b='species' then p_species_node else p_class_node end;
 if nd is null then continue;end if;
 select tn.*,ta.effects talent_effects,ta.is_published talent_published into n from public.game_talent_tree_nodes tn join public.game_talent_trees tr on tr.id=tn.tree_id left join public.game_talents ta on ta.id=tn.talent_id
 where tn.id=nd and tr.is_published and tn.min_level=1 and (b='species' and tr.species_id=p_species or b='class' and tr.class_id=p_class)
 and not exists(select 1 from public.game_talent_tree_edges e where e.to_node_id=tn.id and e.tree_id=tr.id);
 if not found then raise exception 'Wrong starting talent tree';end if;
 if n.kind='passive' then if not coalesce(n.talent_published,false) then raise exception 'Talent unavailable';end if;effects:=effects||n.talent_effects;end if;
 end loop;
 actor:=jsonb_build_object('defenses',d,'effects',effects,'injuries','{}');
 for a in select unnest(array['body','mind','soul','morale','social']) loop d:=jsonb_set(d,array[a],to_jsonb(private.combat_stat(actor,'defenses',a)));end loop;
 return jsonb_build_object('passive_defenses',d,'hp',private.talent_hp(p_species,p_class,null));
end $$;
create function public.preview_character_defenses(p_species uuid,p_class uuid,p_species_node uuid default null,p_class_node uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select private.preview_character_defenses(p_species,p_class,p_species_node,p_class_node)$$;
revoke all on function private.preview_character_defenses(uuid,uuid,uuid,uuid),public.preview_character_defenses(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.preview_character_defenses(uuid,uuid,uuid,uuid),public.preview_character_defenses(uuid,uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
