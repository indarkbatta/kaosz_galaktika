-- M80: Faction definitions. Rewards are configuration only; no player reputation is awarded here.
create table public.game_factions (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z][a-z0-9_]{1,79}$'),
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),
 name_en text not null check(length(btrim(name_en)) between 1 and 100),
 description_hu text not null default '' check(length(description_hu)<=4000),
 description_en text not null default '' check(length(description_en)<=4000),
 image_path text check(image_path is null or (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$')),
 color text not null default '#cc7048' check(color ~ '^#[0-9a-fA-F]{6}$'),
 home_quadrant_id uuid references public.game_quadrants(id) on delete restrict,
 reputation_min integer not null default 0 check(reputation_min between -1000000 and 1000000),
 reputation_max integer not null default 1000 check(reputation_max between -1000000 and 1000000),
 is_published boolean not null default false,
 revision integer not null default 1,
 check(reputation_min<reputation_max),
 check(not is_published or home_quadrant_id is not null)
);
create index game_factions_home_idx on public.game_factions(home_quadrant_id);
create table public.game_faction_presence (
 faction_id uuid not null references public.game_factions(id) on delete cascade,
 quadrant_id uuid not null references public.game_quadrants(id) on delete restrict,
 strength text not null check(strength in ('none','covert','minor','established','dominant')),
 notes_hu text not null default '' check(length(notes_hu)<=2000),
 notes_en text not null default '' check(length(notes_en)<=2000),
 primary key(faction_id,quadrant_id)
);
create index game_faction_presence_quadrant_idx on public.game_faction_presence(quadrant_id);
create table public.game_faction_companies (
 id uuid primary key default gen_random_uuid(),
 faction_id uuid not null references public.game_factions(id) on delete cascade,
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),
 name_en text not null check(length(btrim(name_en)) between 1 and 100),
 activity_hu text not null default '' check(length(activity_hu)<=200),
 activity_en text not null default '' check(length(activity_en)<=200),
 description_hu text not null default '' check(length(description_hu)<=2000),
 description_en text not null default '' check(length(description_en)<=2000),
 sort_order integer not null default 0
);
create index game_faction_companies_faction_idx on public.game_faction_companies(faction_id);
create table public.game_faction_tiers (
 id uuid primary key default gen_random_uuid(),
 faction_id uuid not null references public.game_factions(id) on delete cascade,
 threshold integer not null,
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),
 name_en text not null check(length(btrim(name_en)) between 1 and 100),
 credits integer not null default 0 check(credits between 0 and 1000000000),
 unique(faction_id,threshold) deferrable initially deferred
);
create table public.game_faction_reward_items (
 tier_id uuid not null references public.game_faction_tiers(id) on delete cascade,
 item_id uuid not null references public.game_items(id) on delete restrict,
 quantity integer not null check(quantity between 1 and 10000),
 primary key(tier_id,item_id)
);
create index game_faction_reward_items_item_idx on public.game_faction_reward_items(item_id);
-- Only content editors can currently access definitions. Publishing prepares future gameplay use.
do $$ declare t text; begin
 foreach t in array array['game_factions','game_faction_presence','game_faction_companies','game_faction_tiers','game_faction_reward_items'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy faction_editor on public.%I for all to authenticated using((select private.can_edit_content())) with check((select private.can_edit_content()))',t);
 end loop;
end $$;
-- Invoker: normal RLS applies to every write, including related definitions.
create function public.save_game_faction(p_faction jsonb,p_presence jsonb,p_companies jsonb,p_tiers jsonb,p_expected_revision integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare fid uuid; rev integer; row_data jsonb; tier jsonb; reward jsonb; tid uuid; cid uuid; ids uuid[]; lo integer; hi integer;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required'; end if;
 if jsonb_typeof(p_faction) is distinct from 'object' or jsonb_typeof(p_presence) is distinct from 'array'
 or jsonb_typeof(p_companies) is distinct from 'array' or jsonb_typeof(p_tiers) is distinct from 'array'
 then raise exception 'Invalid faction document'; end if;
 if jsonb_array_length(p_presence)>100 or jsonb_array_length(p_companies)>100 or jsonb_array_length(p_tiers)>100 then raise exception 'Too many entries (maximum 100)'; end if;
 fid:=nullif(p_faction->>'id','')::uuid;lo:=(p_faction->>'reputation_min')::integer;hi:=(p_faction->>'reputation_max')::integer;
 if fid is not null then
  select revision into rev from public.game_factions where id=fid for update;
  if not found then raise exception 'Faction not found'; end if;
  if p_expected_revision is distinct from rev then raise exception 'Faction changed since loading; reload before saving'; end if;
 else
  if p_expected_revision is not null then raise exception 'Invalid new faction revision'; end if;
  fid:=gen_random_uuid();rev:=0;
 end if;
 insert into public.game_factions(id,slug,name_hu,name_en,description_hu,description_en,image_path,color,home_quadrant_id,reputation_min,reputation_max,is_published,revision)
 values(fid,p_faction->>'slug',btrim(p_faction->>'name_hu'),btrim(p_faction->>'name_en'),coalesce(p_faction->>'description_hu',''),coalesce(p_faction->>'description_en',''),nullif(p_faction->>'image_path',''),p_faction->>'color',nullif(p_faction->>'home_quadrant_id','')::uuid,lo,hi,(p_faction->>'is_published')::boolean,rev+1)
 on conflict(id) do update set slug=excluded.slug,name_hu=excluded.name_hu,name_en=excluded.name_en,description_hu=excluded.description_hu,description_en=excluded.description_en,image_path=excluded.image_path,color=excluded.color,home_quadrant_id=excluded.home_quadrant_id,reputation_min=excluded.reputation_min,reputation_max=excluded.reputation_max,is_published=excluded.is_published,revision=excluded.revision;
 delete from public.game_faction_presence where faction_id=fid;
 for row_data in select value from jsonb_array_elements(p_presence) loop
  insert into public.game_faction_presence(faction_id,quadrant_id,strength,notes_hu,notes_en)
  values(fid,(row_data->>'quadrant_id')::uuid,row_data->>'strength',coalesce(row_data->>'notes_hu',''),coalesce(row_data->>'notes_en',''));
 end loop;
 -- IDs remain stable across saves; a client cannot move another faction's child records.
 ids:='{}';
 for row_data in select value from jsonb_array_elements(p_companies) loop
  cid:=coalesce(nullif(row_data->>'id','')::uuid,gen_random_uuid());
  if cid=any(ids) then raise exception 'Duplicate company'; end if;ids:=array_append(ids,cid);
  if exists(select 1 from public.game_faction_companies where id=cid and faction_id<>fid) then raise exception 'Company belongs to another faction'; end if;
  insert into public.game_faction_companies(id,faction_id,name_hu,name_en,activity_hu,activity_en,description_hu,description_en,sort_order)
  values(cid,fid,btrim(row_data->>'name_hu'),btrim(row_data->>'name_en'),coalesce(row_data->>'activity_hu',''),coalesce(row_data->>'activity_en',''),coalesce(row_data->>'description_hu',''),coalesce(row_data->>'description_en',''),cardinality(ids)-1)
  on conflict(id) do update set name_hu=excluded.name_hu,name_en=excluded.name_en,activity_hu=excluded.activity_hu,activity_en=excluded.activity_en,description_hu=excluded.description_hu,description_en=excluded.description_en,sort_order=excluded.sort_order;
 end loop;
 delete from public.game_faction_companies where faction_id=fid and not(id=any(ids));
 -- Defer threshold uniqueness so two existing milestones can exchange thresholds in one save.
 -- Temporarily delete removed tiers first; upserts use a separate pass to update thresholds.
 ids:='{}';
 for tier in select value from jsonb_array_elements(p_tiers) loop
  tid:=coalesce(nullif(tier->>'id','')::uuid,gen_random_uuid());
  if tid=any(ids) then raise exception 'Duplicate milestone'; end if;ids:=array_append(ids,tid);
  if (tier->>'threshold')::integer not between lo and hi then raise exception 'Milestone outside reputation range'; end if;
  if exists(select 1 from public.game_faction_tiers where id=tid and faction_id<>fid) then raise exception 'Milestone belongs to another faction'; end if;
 end loop;
 delete from public.game_faction_tiers where faction_id=fid and not(id=any(ids));
 for i in 0..jsonb_array_length(p_tiers)-1 loop
  tier:=p_tiers->i;tid:=ids[i+1];
  insert into public.game_faction_tiers(id,faction_id,threshold,name_hu,name_en,credits)
  values(tid,fid,(tier->>'threshold')::integer,btrim(tier->>'name_hu'),btrim(tier->>'name_en'),(tier->>'credits')::integer)
  on conflict(id) do update set threshold=excluded.threshold,name_hu=excluded.name_hu,name_en=excluded.name_en,credits=excluded.credits;
  if jsonb_typeof(tier->'items') is distinct from 'array' or jsonb_array_length(tier->'items')>100 then raise exception 'Invalid reward items'; end if;
  delete from public.game_faction_reward_items where tier_id=tid;
  for reward in select value from jsonb_array_elements(tier->'items') loop
   insert into public.game_faction_reward_items(tier_id,item_id,quantity) values(tid,(reward->>'item_id')::uuid,(reward->>'quantity')::integer);
  end loop;
 end loop;
 return jsonb_build_object('id',fid,'revision',rev+1);
end $$;
revoke all on function public.save_game_faction(jsonb,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function public.save_game_faction(jsonb,jsonb,jsonb,jsonb,integer) to authenticated;
