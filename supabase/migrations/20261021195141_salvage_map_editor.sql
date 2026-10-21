-- Authoring only: room encounters describe future salvage play; no player rewards are issued here.
create table public.game_salvage_maps(
 id uuid primary key default gen_random_uuid(),slug text unique not null check(slug ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),name_en text not null check(length(btrim(name_en)) between 1 and 100),
 description_hu text not null default '' check(length(description_hu)<=4000),description_en text not null default '' check(length(description_en)<=4000),
 width integer not null default 32 check(width between 12 and 64),height integer not null default 24 check(height between 12 and 64),
 location_id uuid references public.game_locations(id) on delete restrict,is_published boolean not null default false,
 revision integer not null default 1,updated_at timestamptz not null default now()
);
create index salvage_map_location on public.game_salvage_maps(location_id);
create table public.game_salvage_rooms(
 id uuid primary key,map_id uuid not null references public.game_salvage_maps(id) on delete cascade,
 x integer not null check(x>=0),y integer not null check(y>=0),width integer not null check(width between 2 and 16),height integer not null check(height between 2 and 16),
 name_hu text not null check(length(btrim(name_hu)) between 1 and 100),name_en text not null check(length(btrim(name_en)) between 1 and 100),
 description_hu text not null default '' check(length(description_hu)<=2000),description_en text not null default '' check(length(description_en)<=2000),
 kind text not null check(kind in ('empty','loot','challenge','combat')),is_entry boolean not null default false,
 challenge_id uuid references public.game_skill_challenges(id) on delete restrict,encounter_id uuid references public.game_combat_encounters(id) on delete restrict,
 credits integer not null default 0 check(credits between 0 and 1000000),unique(map_id,id),
 check((kind='challenge' and challenge_id is not null and encounter_id is null and credits=0)
 or(kind='combat' and encounter_id is not null and challenge_id is null and credits=0)
 or(kind in ('empty','loot') and challenge_id is null and encounter_id is null and (kind='loot' or credits=0)))
);
create unique index salvage_one_entry on public.game_salvage_rooms(map_id) where is_entry;
create index salvage_room_challenge on public.game_salvage_rooms(challenge_id);
create index salvage_room_encounter on public.game_salvage_rooms(encounter_id);
create table public.game_salvage_connections(
 map_id uuid not null references public.game_salvage_maps(id) on delete cascade,from_room_id uuid not null,to_room_id uuid not null,
 primary key(map_id,from_room_id,to_room_id),check(from_room_id<to_room_id),
 foreign key(map_id,from_room_id) references public.game_salvage_rooms(map_id,id) on delete cascade,
 foreign key(map_id,to_room_id) references public.game_salvage_rooms(map_id,id) on delete cascade
);
create index salvage_connection_target on public.game_salvage_connections(map_id,to_room_id);
create table public.game_salvage_room_loot(
 room_id uuid not null references public.game_salvage_rooms(id) on delete cascade,item_id uuid not null references public.game_items(id) on delete restrict,
 quantity integer not null check(quantity between 1 and 10000),primary key(room_id,item_id)
);
create index salvage_loot_item on public.game_salvage_room_loot(item_id);
do $$declare t text;begin foreach t in array array['game_salvage_maps','game_salvage_rooms','game_salvage_connections','game_salvage_room_loot'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy salvage_editor_read on public.%I for select to authenticated using((select private.can_edit_content()))',t);
end loop;end $$;

create function private.salvage_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 return jsonb_build_object(
 'maps',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object(
 'rooms',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('loot',coalesce((select jsonb_agg(jsonb_build_object('item_id',l.item_id,'quantity',l.quantity) order by l.item_id) from public.game_salvage_room_loot l where l.room_id=r.id),'[]'::jsonb)) order by r.y,r.x,r.id) from public.game_salvage_rooms r where r.map_id=m.id),'[]'::jsonb),
 'connections',coalesce((select jsonb_agg(jsonb_build_object('from_room_id',e.from_room_id,'to_room_id',e.to_room_id) order by e.from_room_id,e.to_room_id) from public.game_salvage_connections e where e.map_id=m.id),'[]'::jsonb)) order by m.slug) from public.game_salvage_maps m),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'slug',i.slug,'is_published',i.is_published,'name_hu',coalesce((select t.name from public.game_items_i18n t where t.item_id=i.id and t.locale='hu'),i.slug),'name_en',coalesce((select t.name from public.game_items_i18n t where t.item_id=i.id and t.locale='en'),i.slug)) order by i.slug) from public.game_items i),'[]'::jsonb),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'slug',i.slug,'is_published',i.is_published,'name_hu',coalesce((select t.name from public.game_locations_i18n t where t.location_id=i.id and t.locale='hu'),i.slug),'name_en',coalesce((select t.name from public.game_locations_i18n t where t.location_id=i.id and t.locale='en'),i.slug)) order by i.slug) from public.game_locations i),'[]'::jsonb),
 'challenges',coalesce((select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'name_hu',name_hu,'name_en',name_en,'is_published',is_published) order by slug) from public.game_skill_challenges),'[]'::jsonb),
 'encounters',coalesce((select jsonb_agg(jsonb_build_object('id',id,'slug',slug,'name_hu',name_hu,'name_en',name_en,'is_published',is_published) order by slug) from public.game_combat_encounters),'[]'::jsonb));
end $$;
create function public.get_salvage_editor_catalog() returns jsonb language sql stable security invoker set search_path='' as $$select private.salvage_catalog()$$;

create function private.save_salvage_map(p_id uuid,p_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare mid uuid;rev integer;room jsonb;edge jsonb;entry_id uuid;room_id uuid;f uuid;t uuid;item jsonb;key text;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 if p_document is null or jsonb_typeof(p_document)<>'object' or pg_column_size(p_document)>524288
 or jsonb_typeof(p_document->'rooms') is distinct from 'array' or jsonb_typeof(p_document->'connections') is distinct from 'array' then raise exception 'Invalid map document';end if;
 if jsonb_array_length(p_document->'rooms') not between 1 and 100 or jsonb_array_length(p_document->'connections')>300 then raise exception 'Map requires 1-100 rooms and at most 300 connections';end if;
 foreach key in array array['width','height'] loop if coalesce(p_document->>key,'') !~ '^\d+$' then raise exception 'Invalid map dimensions';end if;end loop;
 if p_id is not null then
  select revision into rev from public.game_salvage_maps where id=p_id for update;
  if not found then raise exception 'Map not found';end if;
  if p_revision is distinct from rev then raise exception 'Map changed; reload before saving' using errcode='40001';end if;
  mid:=p_id;
  update public.game_salvage_maps set slug=p_document->>'slug',name_hu=p_document->>'name_hu',name_en=p_document->>'name_en',description_hu=coalesce(p_document->>'description_hu',''),description_en=coalesce(p_document->>'description_en',''),width=(p_document->>'width')::int,height=(p_document->>'height')::int,location_id=nullif(p_document->>'location_id','')::uuid,is_published=(p_document->>'is_published')::boolean,revision=revision+1,updated_at=now() where id=mid;
  delete from public.game_salvage_rooms where map_id=mid;
 else
  insert into public.game_salvage_maps(slug,name_hu,name_en,description_hu,description_en,width,height,location_id,is_published)
  values(p_document->>'slug',p_document->>'name_hu',p_document->>'name_en',coalesce(p_document->>'description_hu',''),coalesce(p_document->>'description_en',''),(p_document->>'width')::int,(p_document->>'height')::int,nullif(p_document->>'location_id','')::uuid,(p_document->>'is_published')::boolean) returning id into mid;
 end if;
 for room in select value from jsonb_array_elements(p_document->'rooms') loop
  foreach key in array array['x','y','width','height','credits'] loop if coalesce(room->>key,'') !~ '^\d+$' then raise exception 'Invalid room dimensions or credits';end if;end loop;
  room_id:=(room->>'id')::uuid;
  insert into public.game_salvage_rooms(id,map_id,x,y,width,height,name_hu,name_en,description_hu,description_en,kind,is_entry,challenge_id,encounter_id,credits)
  values(room_id,mid,(room->>'x')::int,(room->>'y')::int,(room->>'width')::int,(room->>'height')::int,room->>'name_hu',room->>'name_en',coalesce(room->>'description_hu',''),coalesce(room->>'description_en',''),room->>'kind',(room->>'is_entry')::boolean,nullif(room->>'challenge_id','')::uuid,nullif(room->>'encounter_id','')::uuid,(room->>'credits')::int);
  if jsonb_typeof(room->'loot') is distinct from 'array' or jsonb_array_length(room->'loot')>30 then raise exception 'Invalid room content';end if;
  if room->>'kind'<>'loot' and jsonb_array_length(room->'loot')>0 then raise exception 'Invalid room content';end if;
  if room->>'kind'='loot' and (room->>'credits')::int=0 and jsonb_array_length(room->'loot')=0 then raise exception 'Invalid room content';end if;
  for item in select value from jsonb_array_elements(room->'loot') loop
   if coalesce(item->>'quantity','') !~ '^\d+$' then raise exception 'Invalid loot quantity';end if;
   insert into public.game_salvage_room_loot(room_id,item_id,quantity) values(room_id,(item->>'item_id')::uuid,(item->>'quantity')::int);
  end loop;
 end loop;
 if (select count(*) from public.game_salvage_rooms where map_id=mid and is_entry)<>1 then raise exception 'Choose exactly one entry room';end if;
 if exists(select 1 from public.game_salvage_rooms r join public.game_salvage_maps m on m.id=r.map_id where m.id=mid and (r.x+r.width>m.width or r.y+r.height>m.height)) then raise exception 'Rooms outside map';end if;
 if exists(select 1 from public.game_salvage_rooms a join public.game_salvage_rooms b on a.map_id=b.map_id and a.id<b.id where a.map_id=mid and a.x<b.x+b.width and a.x+a.width>b.x and a.y<b.y+b.height and a.y+a.height>b.y) then raise exception 'Rooms overlap';end if;
 for edge in select value from jsonb_array_elements(p_document->'connections') loop
  f:=(edge->>'from_room_id')::uuid;t:=(edge->>'to_room_id')::uuid;
  insert into public.game_salvage_connections(map_id,from_room_id,to_room_id) values(mid,least(f,t),greatest(f,t));
 end loop;
 if (p_document->>'is_published')::boolean then
  select id into entry_id from public.game_salvage_rooms where map_id=mid and is_entry;
  if exists(with recursive reachable(id) as(select entry_id union select case when e.from_room_id=r.id then e.to_room_id else e.from_room_id end from reachable r join public.game_salvage_connections e on e.map_id=mid and (e.from_room_id=r.id or e.to_room_id=r.id)) select 1 from public.game_salvage_rooms where map_id=mid and id not in(select id from reachable)) then raise exception 'Map contains unreachable rooms';end if;
  if exists(select 1 from public.game_salvage_rooms r left join public.game_skill_challenges c on c.id=r.challenge_id left join public.game_combat_encounters e on e.id=r.encounter_id left join public.game_enemies enemy on enemy.id=e.enemy_id where r.map_id=mid and (c.is_published=false or e.is_published=false or enemy.is_published=false)) or exists(select 1 from public.game_salvage_room_loot l join public.game_salvage_rooms r on r.id=l.room_id join public.game_items i on i.id=l.item_id where r.map_id=mid and not i.is_published) then raise exception 'Unpublished encounter reference';end if;
 end if;
 return jsonb_build_object('id',mid,'revision',(select revision from public.game_salvage_maps where id=mid));
end $$;
create function public.save_salvage_map(p_id uuid,p_revision integer,p_document jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_salvage_map(p_id,p_revision,p_document)$$;
revoke all on function private.salvage_catalog(),public.get_salvage_editor_catalog(),private.save_salvage_map(uuid,integer,jsonb),public.save_salvage_map(uuid,integer,jsonb) from public,anon;
grant execute on function private.salvage_catalog(),public.get_salvage_editor_catalog(),private.save_salvage_map(uuid,integer,jsonb),public.save_salvage_map(uuid,integer,jsonb) to authenticated;
