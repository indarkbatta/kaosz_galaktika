-- M70: Galaxy -> Quadrant -> Sector (solar system) -> Location.
-- This is additive and deliberately preserves all existing location UUIDs, routes and player positions.
create table public.game_galaxies (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
 name_hu text not null check (length(btrim(name_hu))>0),
 name_en text not null check (length(btrim(name_en))>0),
 description_hu text not null default '',
 description_en text not null default '',
 is_published boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.game_quadrants (
 id uuid primary key default gen_random_uuid(),
 galaxy_id uuid not null references public.game_galaxies(id) on delete restrict,
 slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
 name_hu text not null check (length(btrim(name_hu))>0),
 name_en text not null check (length(btrim(name_en))>0),
 description_hu text not null default '',
 description_en text not null default '',
 x integer not null default 50 check(x between 7 and 93),
 y integer not null default 50 check(y between 7 and 93),
 is_published boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.game_sectors (
 id uuid primary key default gen_random_uuid(),
 quadrant_id uuid not null references public.game_quadrants(id) on delete restrict,
 slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
 name_hu text not null check (length(btrim(name_hu))>0),
 name_en text not null check (length(btrim(name_en))>0),
 description_hu text not null default '',
 description_en text not null default '',
 x integer not null default 50 check(x between 7 and 93),
 y integer not null default 50 check(y between 7 and 93),
 is_published boolean not null default false,
 created_at timestamptz not null default now()
);
create index game_quadrants_galaxy_idx on public.game_quadrants(galaxy_id);
create index game_sectors_quadrant_idx on public.game_sectors(quadrant_id);

-- Backfill through stable slugs, never fabricated UUIDs.
insert into public.game_galaxies(slug,name_hu,name_en,description_hu,description_en,is_published)
 values('hatarvilag','Határvilág','Borderworld','A felderített galaxis.','The charted galaxy.',true);
insert into public.game_quadrants(galaxy_id,slug,name_hu,name_en,description_hu,description_en,x,y,is_published)
 select id,'hatarvidek','Határvidék','Frontier','A civilizáció peremvidéke.','The edge of civilization.',50,50,true
 from public.game_galaxies where slug='hatarvilag';
insert into public.game_sectors(quadrant_id,slug,name_hu,name_en,description_hu,description_en,x,y,is_published)
 select id,'kezdo_rendszer','Határvidéki naprendszer','Frontier System','A négy ismert kezdőhelyszín naprendszere.','The system containing the original four locations.',50,50,true
 from public.game_quadrants where slug='hatarvidek';

alter table public.game_locations
 add column sector_id uuid references public.game_sectors(id) on delete restrict;
update public.game_locations
 set sector_id=(select id from public.game_sectors where slug='kezdo_rendszer');
alter table public.game_locations alter column sector_id set not null;
create index game_locations_sector_idx on public.game_locations(sector_id);

alter table public.game_galaxies enable row level security;
alter table public.game_quadrants enable row level security;
alter table public.game_sectors enable row level security;
create policy galaxy_read on public.game_galaxies for select to authenticated
 using(is_published or (select private.can_edit_content()));
create policy quadrant_read on public.game_quadrants for select to authenticated
 using((is_published and exists (select 1 from public.game_galaxies g where g.id=galaxy_id and g.is_published))
  or (select private.can_edit_content()));
create policy sector_read on public.game_sectors for select to authenticated
 using((is_published and exists (select 1 from public.game_quadrants q
   join public.game_galaxies g on g.id=q.galaxy_id
   where q.id=quadrant_id and q.is_published and g.is_published))
  or (select private.can_edit_content()));
create policy galaxy_edit on public.game_galaxies for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy quadrant_edit on public.game_quadrants for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
create policy sector_edit on public.game_sectors for all to authenticated
 using((select private.can_edit_content())) with check((select private.can_edit_content()));
revoke all on public.game_galaxies,public.game_quadrants,public.game_sectors from anon,authenticated;
grant select,insert,update,delete on public.game_galaxies,public.game_quadrants,public.game_sectors to authenticated;

-- A normal travel route is always local to one solar-system sector.
create function private.check_local_sector_route() returns trigger
 language plpgsql set search_path='' as $$
declare v_origin uuid;v_destination uuid;
begin
 select sector_id into v_origin from public.game_locations where id=new.origin_id;
 select sector_id into v_destination from public.game_locations where id=new.destination_id;
 if v_origin is null or v_destination is null or v_origin<>v_destination then
  raise exception 'Ordinary travel routes must remain within one sector' using errcode='23514';
 end if;
 return new;
end $$;
create trigger route_sector_scope before insert or update of origin_id,destination_id on public.game_routes
 for each row execute function private.check_local_sector_route();
create function private.check_location_sector_move() returns trigger
 language plpgsql set search_path='' as $$
begin
 if old.sector_id is distinct from new.sector_id and
    exists(select 1 from public.game_routes where origin_id=new.id or destination_id=new.id) then
  raise exception 'Remove existing travel routes before moving a location to another sector' using errcode='23514';
 end if;
 return new;
end $$;
create trigger location_sector_scope before update of sector_id on public.game_locations
 for each row execute function private.check_location_sector_move();

-- Existing editor RPC also enforces sector containment before replacing routes.
create or replace function private.replace_sector_links_impl(p_location uuid,p_actions uuid[],p_routes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r jsonb;v_target uuid;v_cost integer;v_seen uuid[]:='{}'::uuid[];
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';
 end if;
 if not exists(select 1 from public.game_locations where id=p_location) then raise exception 'Location not found';end if;
 if p_actions is null or array_length(p_actions,1)>40 then raise exception 'Invalid action collection';end if;
 if exists(select 1 from unnest(p_actions) u(id) where not exists(select 1 from public.game_actions a where a.id=u.id)) then
  raise exception 'Unknown action id';
 end if;
 if jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes)>40 then
  raise exception 'Invalid route collection';
 end if;
 for r in select value from jsonb_array_elements(p_routes) loop
  v_target:=(r->>'target')::uuid;v_cost:=(r->>'cost')::integer;
  if v_target=p_location or v_target=any(v_seen) or v_cost not between 1 and 500 or not exists(
   select 1 from public.game_locations a join public.game_locations b on a.sector_id=b.sector_id
   where a.id=p_location and b.id=v_target
  ) then raise exception 'Invalid or cross-sector route';end if;
  v_seen:=array_append(v_seen,v_target);
 end loop;
 delete from public.game_location_actions where location_id=p_location;
 insert into public.game_location_actions(location_id,action_id)
 select p_location,u.id from unnest(p_actions) u(id) on conflict do nothing;
 delete from public.game_routes where origin_id=p_location or destination_id=p_location;
 for r in select value from jsonb_array_elements(p_routes) loop
  v_target:=(r->>'target')::uuid;v_cost:=(r->>'cost')::integer;
  insert into public.game_routes(origin_id,destination_id,energy_cost,is_published)
  values(least(p_location,v_target),greatest(p_location,v_target),v_cost,true);
 end loop;
end $$;

-- Atomic server-owned drag placement; no client may update an unrelated parent.
create function private.save_world_map_positions_impl(p_level text,p_parent uuid,p_nodes jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_item jsonb;v_id uuid;v_x integer;v_y integer;v_seen uuid[]:='{}'::uuid[];v_rows integer;v_count integer:=0;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';
 end if;
 if p_level not in ('galaxy','quadrant','sector') or jsonb_typeof(p_nodes) is distinct from 'array'
    or jsonb_array_length(p_nodes)>150 then raise exception 'Invalid map payload';end if;
 for v_item in select value from jsonb_array_elements(p_nodes) loop
  v_id:=(v_item->>'id')::uuid;
  v_x:=(v_item->>'x')::integer;v_y:=(v_item->>'y')::integer;
  if v_id is null or v_id=any(v_seen) or v_x not between 7 and 93 or v_y not between 7 and 93 then
   raise exception 'Invalid coordinates or repeated node';
  end if;
  v_seen:=array_append(v_seen,v_id);
  if p_level='galaxy' then
   update public.game_quadrants set x=v_x,y=v_y where id=v_id and galaxy_id=p_parent;
  elsif p_level='quadrant' then
   update public.game_sectors set x=v_x,y=v_y where id=v_id and quadrant_id=p_parent;
  else
   update public.game_locations set x=v_x,y=v_y where id=v_id and sector_id=p_parent;
  end if;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'Map item not found in selected parent';end if;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;
revoke all on function private.save_world_map_positions_impl(text,uuid,jsonb) from public,anon;
grant execute on function private.save_world_map_positions_impl(text,uuid,jsonb) to authenticated;
create function public.save_world_map_positions(p_level text,p_parent uuid,p_nodes jsonb)
returns integer language sql security invoker set search_path=''
as $$select private.save_world_map_positions_impl(p_level,p_parent,p_nodes)$$;
revoke all on function public.save_world_map_positions(text,uuid,jsonb) from public,anon;
grant execute on function public.save_world_map_positions(text,uuid,jsonb) to authenticated;