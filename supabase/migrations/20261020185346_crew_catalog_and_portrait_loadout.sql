-- Crew identities survive station changes. Existing IDs/equipment are preserved.
create table public.game_crew_portrait_sets(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),name_en text not null check(length(btrim(name_en)) between 1 and 100),
 species_id uuid references public.game_species(id),class_id uuid references public.game_classes(id),
 image_paths text[] not null check(cardinality(image_paths) between 1 and 24),is_published boolean not null default false,revision integer not null default 0
);
create index crew_portrait_species_fk on public.game_crew_portrait_sets(species_id);
create index crew_portrait_class_fk on public.game_crew_portrait_sets(class_id);
create table public.game_crew_templates(
 id uuid primary key default gen_random_uuid(),slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),
 kind text not null check(kind in('named','generated')),translations jsonb not null,
 species_id uuid references public.game_species(id),class_id uuid references public.game_classes(id),
 specialty text not null check(specialty in('pilot','navigator','engineer','security','medic')),
 aptitude integer not null check(aptitude between 1 and 5),rarity text not null check(rarity in('common','uncommon','rare','epic')),
 portrait_set_id uuid references public.game_crew_portrait_sets(id),portrait_path text,
 weight integer not null default 10 check(weight between 0 and 100000),max_per_character integer not null default 0 check(max_per_character between 0 and 24),
 source text not null default 'cantina' check(source in('cantina','event')),
 hull_bonus integer not null default 0 check(hull_bonus between 0 and 100),shield_bonus integer not null default 0 check(shield_bonus between 0 and 100),
 damage_bonus integer not null default 0 check(damage_bonus between 0 and 100),speed_bonus integer not null default 0 check(speed_bonus between 0 and 20),
 is_published boolean not null default false,revision integer not null default 0
);
create index crew_template_species_fk on public.game_crew_templates(species_id);
create index crew_template_class_fk on public.game_crew_templates(class_id);
create index crew_template_portrait_fk on public.game_crew_templates(portrait_set_id);
alter table public.game_crew_portrait_sets enable row level security;
alter table public.game_crew_templates enable row level security;
create policy crew_sets_editor_read on public.game_crew_portrait_sets for select to authenticated using((select private.can_edit_content()));
create policy crew_templates_editor_read on public.game_crew_templates for select to authenticated using((select private.can_edit_content()));
revoke all on public.game_crew_portrait_sets,public.game_crew_templates from public,anon,authenticated;
grant select on public.game_crew_portrait_sets,public.game_crew_templates to authenticated;
alter table public.character_crew drop constraint character_crew_character_id_position_key;
-- position stays a compatibility field; specialty and character_ship_crew are authoritative.
alter table public.character_crew add column class_id uuid references public.game_classes(id),add column template_id uuid references public.game_crew_templates(id),
 add column portrait_path text,add column rarity text not null default 'common' check(rarity in('common','uncommon','rare','epic')),
 add column biography jsonb not null default '{}',add column hull_bonus integer not null default 0 check(hull_bonus between 0 and 100),
 add column shield_bonus integer not null default 0 check(shield_bonus between 0 and 100),add column damage_bonus integer not null default 0 check(damage_bonus between 0 and 100),
 add column speed_bonus integer not null default 0 check(speed_bonus between 0 and 20);
create index character_crew_template_fk on public.character_crew(template_id);
create index character_crew_class_fk on public.character_crew(class_id);
alter table public.character_cantina_candidates add column class_id uuid references public.game_classes(id),add column template_id uuid references public.game_crew_templates(id),
 add column portrait_path text,add column rarity text not null default 'common' check(rarity in('common','uncommon','rare','epic')),
 add column biography jsonb not null default '{}',add column hull_bonus integer not null default 0,
 add column shield_bonus integer not null default 0,add column damage_bonus integer not null default 0,add column speed_bonus integer not null default 0;
create index candidate_template_fk on public.character_cantina_candidates(template_id);
create index candidate_class_fk on public.character_cantina_candidates(class_id);

create function private.crew_image_valid(p text) returns boolean language sql immutable set search_path='' as $$
 select p is null or (length(p)<=300 and p ~ '^hatarvilag/[A-Za-z0-9_/-]+\.(webp|avif|png|jpg|jpeg)$' and p not like '%..%')
$$;
revoke all on function private.crew_image_valid(text) from public,anon,authenticated;
create function private.resolve_crew_portrait(p_species uuid,p_class uuid,p_set uuid default null,p_override text default null) returns text
language plpgsql volatile security definer set search_path='' as $$
declare paths text[];fallback text;
begin
 if p_override is not null then return p_override;end if;
 select x.image_paths into paths from public.game_crew_portrait_sets x where x.is_published
 and (p_set is null or x.id=p_set) and (x.species_id is null or x.species_id=p_species) and (x.class_id is null or x.class_id=p_class)
 order by ((x.species_id is not null)::integer+(x.class_id is not null)::integer) desc,(x.species_id is not null) desc,x.slug limit 1;
 if paths is not null then return paths[1+private.cantina_roll(cardinality(paths))];end if;
 select image_path into fallback from public.game_species where id=p_species;return fallback;
end $$;
revoke all on function private.resolve_crew_portrait(uuid,uuid,uuid,text) from public,anon,authenticated;
-- Reuse current individual painted assets as editable initial sets.
insert into public.game_crew_portrait_sets(slug,name_hu,name_en,species_id,image_paths,is_published)
select 'species_'||replace(slug,'-','_'),slug||' portrék',slug||' portraits',id,array[image_path],true from public.game_species where image_path is not null;
insert into public.game_crew_portrait_sets(slug,name_hu,name_en,species_id,class_id,image_paths,is_published)
select 'human_'||replace(c.slug,'-','_'),c.slug||' portrék',c.slug||' portraits',s.id,c.id,array[c.image_path],true
from public.game_classes c cross join public.game_species s where s.slug='ember' and c.image_path is not null;
insert into public.game_crew_templates(slug,kind,translations,specialty,aptitude,rarity,weight,is_published)
select 'recruit_'||r||'_'||rarity,'generated',jsonb_build_object('hu',jsonb_build_object('name',r,'description','Toborozható legénységi tag.'),'en',jsonb_build_object('name',r,'description','Recruitable crew member.')),r,apt,rarity,w,true
from unnest(array['pilot','navigator','engineer','security','medic'])r cross join(values('common',2,60),('uncommon',3,25),('rare',4,10),('epic',5,2))x(rarity,apt,w);
insert into public.game_crew_templates(slug,kind,translations,species_id,class_id,specialty,aptitude,rarity,portrait_path,weight,max_per_character,damage_bonus,is_published)
select 'kael_ross','named','{"hu":{"name":"Kael Ross","description":"Tapasztalt biztonsági tiszt a határvidékről."},"en":{"name":"Kael Ross","description":"Veteran security officer from the frontier."}}',s.id,c.id,'security',4,'rare',c.image_path,3,1,2,true
from public.game_species s cross join public.game_classes c where s.slug='ember' and c.slug='hadur';

create function private.initialize_crew_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare species uuid;
begin
 if new.species_slug is null then select s.slug into new.species_slug from public.characters c join public.game_species s on s.id=c.species_id where c.id=new.character_id;end if;
 if new.class_id is null then select class_id into new.class_id from public.characters where id=new.character_id;end if;
 select id into species from public.game_species where slug=new.species_slug;
 if new.portrait_path is null then new.portrait_path:=private.resolve_crew_portrait(species,new.class_id);end if;
 return new;
end $$;
revoke all on function private.initialize_crew_identity() from public,anon,authenticated;
create trigger initialize_crew_identity before insert on public.character_crew for each row execute function private.initialize_crew_identity();
update public.character_crew x set species_slug=coalesce(x.species_slug,s.slug),class_id=c.class_id from public.characters c join public.game_species s on s.id=c.species_id where x.character_id=c.id;
update public.character_crew x set portrait_path=private.resolve_crew_portrait(s.id,x.class_id) from public.game_species s where x.species_slug=s.slug;
update public.character_cantina_candidates x set portrait_path=s.image_path from public.game_species s where x.species_slug=s.slug;

create function private.get_crew_editor_catalog_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required' using errcode='42501';end if;
 return jsonb_build_object('sets',(select coalesce(jsonb_agg(to_jsonb(x) order by slug),'[]'::jsonb) from public.game_crew_portrait_sets x),
 'templates',(select coalesce(jsonb_agg(to_jsonb(x) order by slug),'[]'::jsonb) from public.game_crew_templates x),
 'species',(select jsonb_agg(to_jsonb(s)||jsonb_build_object('translations',(select jsonb_agg(to_jsonb(t)) from public.game_species_i18n t where t.species_id=s.id))) from public.game_species s),
 'classes',(select jsonb_agg(to_jsonb(s)||jsonb_build_object('translations',(select jsonb_agg(to_jsonb(t)) from public.game_classes_i18n t where t.class_id=s.id))) from public.game_classes s),
 'locales',(select jsonb_agg(to_jsonb(l)) from public.game_locales l where is_enabled));
end $$;
create function public.get_crew_editor_catalog() returns jsonb language sql security invoker set search_path='' as $$select private.get_crew_editor_catalog_impl()$$;
revoke all on function private.get_crew_editor_catalog_impl(),public.get_crew_editor_catalog() from public,anon;
grant execute on function private.get_crew_editor_catalog_impl(),public.get_crew_editor_catalog() to authenticated;

create function private.save_crew_catalog_impl(p_kind text,p_id uuid,p_record jsonb,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid:=coalesce(p_id,gen_random_uuid());s public.game_crew_portrait_sets%rowtype;t public.game_crew_templates%rowtype;rev integer;path text;v record;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required' using errcode='42501';end if;
 if jsonb_typeof(p_record) is distinct from 'object' or length(p_record::text)>60000 then raise exception 'Invalid crew catalog payload';end if;
 if p_kind='set' then
  s:=jsonb_populate_record(null::public.game_crew_portrait_sets,p_record);
  if cardinality(s.image_paths) is null or cardinality(s.image_paths) not between 1 and 24 then raise exception 'Portrait set requires 1–24 images';end if;
  foreach path in array s.image_paths loop if path is null or not private.crew_image_valid(path) then raise exception 'Invalid crew portrait path';end if;end loop;
  if p_id is not null then select revision into rev from public.game_crew_portrait_sets where id=sid for update;
   if not found then raise exception 'Portrait set not found';end if;
   if rev is distinct from p_expected_revision then raise exception 'Catalog changed; reload before saving' using errcode='40001';end if;
  end if;
  insert into public.game_crew_portrait_sets(id,slug,name_hu,name_en,species_id,class_id,image_paths,is_published,revision)
  values(sid,s.slug,s.name_hu,s.name_en,s.species_id,s.class_id,s.image_paths,coalesce(s.is_published,false),coalesce(rev,0)+1)
  on conflict(id) do update set slug=excluded.slug,name_hu=excluded.name_hu,name_en=excluded.name_en,species_id=excluded.species_id,class_id=excluded.class_id,image_paths=excluded.image_paths,is_published=excluded.is_published,revision=excluded.revision;
 elsif p_kind='template' then
  t:=jsonb_populate_record(null::public.game_crew_templates,p_record);
  if jsonb_typeof(t.translations) is distinct from 'object' or length(coalesce(t.translations->'hu'->>'name','')) not between 1 and 100 or length(coalesce(t.translations->'en'->>'name','')) not between 1 and 100 then raise exception 'Hungarian and English crew names required';end if;
  for v in select * from jsonb_each(t.translations) loop
   if not exists(select 1 from public.game_locales where code=v.key and is_enabled) or jsonb_typeof(v.value) is distinct from 'object' or length(coalesce(v.value->>'name','')) not between 1 and 100 or length(coalesce(v.value->>'description',''))>4000 then raise exception 'Invalid crew translation';end if;
  end loop;
  if not private.crew_image_valid(t.portrait_path) then raise exception 'Invalid crew portrait path';end if;
  if t.kind='named' and (t.species_id is null or t.class_id is null) then raise exception 'Named crew requires species and class';end if;
  if t.portrait_set_id is not null and not exists(select 1 from public.game_crew_portrait_sets x where x.id=t.portrait_set_id and (x.species_id is null or x.species_id=t.species_id) and (x.class_id is null or x.class_id=t.class_id)) then raise exception 'Portrait set incompatible with species or class';end if;
  if p_id is not null then select revision into rev from public.game_crew_templates where id=sid for update;
   if not found then raise exception 'Crew template not found';end if;
   if rev is distinct from p_expected_revision then raise exception 'Catalog changed; reload before saving' using errcode='40001';end if;
  end if;
  insert into public.game_crew_templates(id,slug,kind,translations,species_id,class_id,specialty,aptitude,rarity,portrait_set_id,portrait_path,weight,max_per_character,source,hull_bonus,shield_bonus,damage_bonus,speed_bonus,is_published,revision)
  values(sid,t.slug,t.kind,t.translations,t.species_id,t.class_id,t.specialty,t.aptitude,t.rarity,t.portrait_set_id,t.portrait_path,t.weight,t.max_per_character,t.source,t.hull_bonus,t.shield_bonus,t.damage_bonus,t.speed_bonus,coalesce(t.is_published,false),coalesce(rev,0)+1)
  on conflict(id) do update set slug=excluded.slug,kind=excluded.kind,translations=excluded.translations,species_id=excluded.species_id,class_id=excluded.class_id,specialty=excluded.specialty,aptitude=excluded.aptitude,rarity=excluded.rarity,portrait_set_id=excluded.portrait_set_id,portrait_path=excluded.portrait_path,weight=excluded.weight,max_per_character=excluded.max_per_character,source=excluded.source,hull_bonus=excluded.hull_bonus,shield_bonus=excluded.shield_bonus,damage_bonus=excluded.damage_bonus,speed_bonus=excluded.speed_bonus,is_published=excluded.is_published,revision=excluded.revision;
 else raise exception 'Invalid crew catalog kind';end if;
 return jsonb_build_object('id',sid,'revision',coalesce(rev,0)+1);
end $$;
create function public.save_crew_catalog(p_kind text,p_id uuid,p_record jsonb,p_expected_revision integer) returns jsonb language sql security invoker set search_path='' as $$select private.save_crew_catalog_impl(p_kind,p_id,p_record,p_expected_revision)$$;
revoke all on function private.save_crew_catalog_impl(text,uuid,jsonb,integer),public.save_crew_catalog(text,uuid,jsonb,integer) from public,anon;
grant execute on function private.save_crew_catalog_impl(text,uuid,jsonb,integer),public.save_crew_catalog(text,uuid,jsonb,integer) to authenticated;

-- Catalog selection is server-only. Candidate identity and bonuses are snapshots.
create or replace function private.generate_cantina_candidate(p_character uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.game_crew_templates%rowtype;sp uuid;cl uuid;race text;nm text;pic text;
first_names text[]:=array['Aren','Kira','Marek','Nessa','Tarek','Lyra','Venn','Sora','Dax','Rian','Zera','Kael','Mira','Bren','Orin','Ilya','Varo','Syra'];
last_names text[]:=array['Voss','Rhett','Kade','Arden','Kross','Talon','Senn','Drake','Nyx','Rook','Astra','Fane','Korr','Thorne','Vale','Raxx','Vek'];
begin
 select * into t from public.game_crew_templates x where x.is_published and x.source='cantina' and x.weight>0
 and (x.species_id is null or exists(select 1 from public.game_species where id=x.species_id and is_published))
 and (x.class_id is null or exists(select 1 from public.game_classes where id=x.class_id and is_published))
 and (x.max_per_character=0 or x.max_per_character>(select count(*) from public.character_crew where character_id=p_character and template_id=x.id)+(select count(*) from public.character_cantina_candidates where character_id=p_character and template_id=x.id))
 order by -ln(1-random())/x.weight limit 1;
 if not found then raise exception 'No recruitable crew templates available';end if;
 sp:=t.species_id;cl:=t.class_id;
 if t.portrait_set_id is not null then select coalesce(sp,species_id),coalesce(cl,class_id) into sp,cl from public.game_crew_portrait_sets where id=t.portrait_set_id;end if;
 if sp is null then select id into sp from public.game_species where is_published order by gen_random_uuid() limit 1;end if;
 if cl is null then select id into cl from public.game_classes where is_published order by gen_random_uuid() limit 1;end if;
 select slug into race from public.game_species where id=sp;
 if sp is null or cl is null then raise exception 'Published species and class required';end if;
 nm:=case when t.kind='named' then t.translations->'hu'->>'name' else first_names[1+private.cantina_roll(cardinality(first_names))]||' '||last_names[1+private.cantina_roll(cardinality(last_names))] end;
 pic:=private.resolve_crew_portrait(sp,cl,t.portrait_set_id,t.portrait_path);
 insert into public.character_cantina_candidates(character_id,name,specialty,aptitude,species_slug,class_id,template_id,portrait_path,rarity,biography,hull_bonus,shield_bonus,damage_bonus,speed_bonus)
 values(p_character,nm,t.specialty,t.aptitude,race,cl,t.id,pic,t.rarity,t.translations,t.hull_bonus,t.shield_bonus,t.damage_bonus,t.speed_bonus);
end $$;
revoke all on function private.generate_cantina_candidate(uuid) from public,anon,authenticated;

create or replace function private.hire_cantina_impl(p_candidate uuid,p_position text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare cid uuid;c public.character_cantina_candidates%rowtype;previous text;
e integer;elapsed bigint;regen_at timestamptz;now_at timestamptz:=clock_timestamp();
cfg public.gameplay_rules%rowtype;p public.character_progress%rowtype;cost integer;
begin
if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
if p_position is null or p_position not in ('pilot','navigator','engineer','security','medic')
then raise exception 'Invalid crew position';end if;
select id into cid from public.characters where user_id=auth.uid();
if cid is null then raise exception 'Captain required';end if;
select * into p from public.character_progress where character_id=cid for update;
if not found then raise exception 'Missing progress';end if;
if not exists(select 1 from public.character_positions loc join public.game_locations l on l.id=loc.location_id
where loc.character_id=cid and l.slug='frontier_station') then raise exception 'Cantina is only accessible at Frontier Station';end if;
perform private.ensure_cantina_roster(cid);
select * into c from public.character_cantina_candidates where id=p_candidate and character_id=cid for update;
if not found then raise exception 'Candidate not available';end if;
if (select count(*) from public.character_crew where character_id=cid)>=24 then raise exception 'Crew roster full';end if;
if c.template_id is not null and exists(select 1 from public.game_crew_templates t where t.id=c.template_id and t.max_per_character>0 and t.max_per_character<=(select count(*) from public.character_crew where character_id=cid and template_id=t.id)) then raise exception 'Unique crew limit reached';end if;
cost:=20;
select * into strict cfg from public.gameplay_rules where id=1;
elapsed:=greatest(0,floor(extract(epoch from(now_at-p.energy_at)))::bigint);
e:=least(cfg.energy_max,p.energy+floor(elapsed::numeric/cfg.energy_regen_seconds)::integer);
regen_at:=case when e>=cfg.energy_max then now_at else
p.energy_at+(floor(elapsed::numeric/cfg.energy_regen_seconds)::bigint*cfg.energy_regen_seconds)*interval '1 second' end;
if e<cost then raise exception 'Insufficient energy';end if;
update public.character_progress set energy=e-cost,energy_at=regen_at,updated_at=now_at where character_id=cid;
insert into public.character_crew(character_id,position,name,specialty,aptitude,species_slug,class_id,template_id,portrait_path,rarity,biography,hull_bonus,shield_bonus,damage_bonus,speed_bonus)
values(cid,c.specialty,c.name,c.specialty,c.aptitude,c.species_slug,c.class_id,c.template_id,c.portrait_path,c.rarity,c.biography,c.hull_bonus,c.shield_bonus,c.damage_bonus,c.speed_bonus);
insert into public.character_recruit_log(character_id,candidate_name,assigned_position,replaced_name,energy_cost)
values(cid,c.name,c.specialty,previous,cost);
delete from public.character_cantina_candidates where id=c.id and character_id=cid;
return jsonb_build_object('name',c.name,'position',c.specialty,'replaced',previous,'energy_spent',cost,'energy',e-cost);
end $$;

create or replace function private.get_cantina_impl() returns jsonb
 language plpgsql security definer set search_path='' as $$
declare cid uuid;expiry timestamptz;roster jsonb;
begin
if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
select id into cid from public.characters where user_id=auth.uid();
if cid is null then raise exception 'Captain required';end if;
perform 1 from public.character_progress where character_id=cid for update;
if not exists(select 1 from public.character_positions p join public.game_locations l on l.id=p.location_id
where p.character_id=cid and l.slug='frontier_station') then raise exception 'Cantina is only accessible at Frontier Station';end if;
perform private.ensure_cantina_roster(cid);
select expires_at into expiry from public.character_cantina_rotation where character_id=cid;
select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'specialty',a.specialty,
'aptitude',a.aptitude,'species_slug',a.species_slug,'portrait_path',coalesce(a.portrait_path,s.image_path),'class_id',a.class_id,'rarity',a.rarity,'biography',a.biography)
order by a.created_at,a.id),'[]'::jsonb) into roster
from public.character_cantina_candidates a left join public.game_species s on s.slug=a.species_slug
where a.character_id=cid;
return jsonb_build_object('candidates',roster,'expires_at',expiry,'hire_energy_cost',20,'replace_energy_cost',25);
end $$;

create or replace function private.get_ship_loadout_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare cid uuid; sid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select id,starter_ship_id into cid,sid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required'; end if;
 return jsonb_build_object('ship_id',sid,'stats',private.ship_status(cid),
 'slots',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('item_id',e.item_id,'crew_id',a.crew_id) order by s.sort_order),'[]'::jsonb)
 from public.game_ship_slots s left join public.character_ship_equipment e on e.ship_id=s.ship_id and e.slot_key=s.slot_key and e.character_id=cid
 left join public.character_ship_crew a on a.ship_id=s.ship_id and a.slot_key=s.slot_key and a.character_id=cid where s.ship_id=sid),
 'modules',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('slug',i.slug,'image_path',i.image_path,'is_published',i.is_published,
 'translations',(select jsonb_agg(to_jsonb(t)) from public.game_items_i18n t where t.item_id=i.id),
 'quantity',coalesce((select quantity from public.character_inventory v where v.character_id=cid and v.item_id=i.id),0)) order by i.slug),'[]'::jsonb)
 from public.game_ship_modules m join public.game_items i on i.id=m.item_id where i.is_published or exists(select 1 from public.character_ship_equipment e where e.character_id=cid and e.item_id=i.id)),
 'crew',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('portrait_path',coalesce(c.portrait_path,s.image_path),'species_name',(select jsonb_agg(to_jsonb(t)) from public.game_species_i18n t where t.species_id=s.id),'class_name',(select jsonb_agg(to_jsonb(t)) from public.game_classes_i18n t where t.class_id=c.class_id)) order by c.position),'[]'::jsonb)
 from public.character_crew c left join public.game_species s on s.slug=c.species_slug where c.character_id=cid));
end $fn$;

create or replace function private.ship_status(p_character uuid) returns jsonb
language sql stable security definer set search_path='' as $fn$
 with ship as (select s.* from public.characters c join public.game_starter_ships s on s.id=c.starter_ship_id where c.id=p_character),
 effects as (select coalesce(sum(m.power_draw),0) draw,coalesce(sum(m.power_output),0) output,
 coalesce(sum(m.hull_bonus),0) hull,coalesce(sum(m.shield_bonus),0) shield,
 coalesce(sum(m.damage_bonus),0) damage,coalesce(sum(m.speed_bonus),0) speed,coalesce(sum(m.cargo_bonus),0) cargo
 from public.character_ship_equipment e join public.game_ship_modules m on m.item_id=e.item_id
 where e.character_id=p_character and e.ship_id=(select id from ship)),
 crew_effects as (select coalesce(sum(c.hull_bonus),0) hull,coalesce(sum(c.shield_bonus),0) shield,coalesce(sum(c.damage_bonus),0) damage,coalesce(sum(c.speed_bonus),0) speed from public.character_ship_crew a join public.character_crew c on c.id=a.crew_id and c.character_id=a.character_id where a.character_id=p_character and a.ship_id=(select id from ship)),
 missing as (select count(*) n from public.game_ship_slots s where s.ship_id=(select id from ship) and s.required and
 case when s.kind='module' then not exists(select 1 from public.character_ship_equipment e where e.character_id=p_character and e.ship_id=s.ship_id and e.slot_key=s.slot_key)
 else not exists(select 1 from public.character_ship_crew a join public.character_crew c on c.id=a.crew_id and c.character_id=a.character_id
 where a.character_id=p_character and a.ship_id=s.ship_id and a.slot_key=s.slot_key and c.specialty=s.crew_role and c.aptitude>=s.min_aptitude) end)
 select jsonb_build_object('hull',s.hull+e.hull+k.hull,'shield',e.shield+k.shield,'damage',e.damage+k.damage,
 'speed',greatest(1,s.speed+e.speed+k.speed),'cargo',s.cargo+e.cargo,'base_speed',s.speed,
 'power_draw',e.draw,'power_output',e.output,'missing_required',m.n,'ready',m.n=0 and e.draw<=e.output and exists(select 1 from public.game_ship_slots z where z.ship_id=s.id))
 from ship s cross join effects e cross join missing m cross join crew_effects k;
 $fn$;

create or replace function private.sync_ship_crew_station() returns trigger language plpgsql security definer set search_path='' as $fn$
declare sid uuid;target text;
begin
 if tg_op='INSERT' and new.template_id is not null then return new;end if;
 select starter_ship_id into sid from public.characters where id=new.character_id;
 delete from public.character_ship_crew a using public.game_ship_slots s where a.character_id=new.character_id and a.crew_id=new.id
 and s.ship_id=a.ship_id and s.slot_key=a.slot_key and (s.crew_role<>new.specialty or new.aptitude<s.min_aptitude or a.ship_id<>sid);
 if not exists(select 1 from public.character_ship_crew where character_id=new.character_id and crew_id=new.id) then
 select s.slot_key into target from public.game_ship_slots s where s.ship_id=sid and s.kind='crew' and s.crew_role=new.specialty and s.min_aptitude<=new.aptitude
 and not exists(select 1 from public.character_ship_crew a where a.character_id=new.character_id and a.ship_id=sid and a.slot_key=s.slot_key)
 order by s.required desc,s.sort_order limit 1;
 if target is not null then insert into public.character_ship_crew(character_id,ship_id,slot_key,crew_id) values(new.character_id,sid,target,new.id);end if;
 end if;
 return new;
end $fn$;

notify pgrst,'reload schema';
