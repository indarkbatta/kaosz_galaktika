-- M76: A location editor must not delete starmap links when only saving location data/actions.
-- Passing p_routes = SQL NULL preserves every route. Explicit JSON [] intentionally removes all.
-- This keeps the existing public RPC name and supports both legacy and updated editors.
create or replace function private.replace_sector_links_impl(p_location uuid,p_actions uuid[],p_routes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  r jsonb;
  v_target uuid;
  v_cost integer;
  v_seen uuid[]:='{}'::uuid[];
  v_kept uuid[]:='{}'::uuid[];
  v_route_id uuid;
  v_sector uuid;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';
 end if;

 select sector_id into v_sector from public.game_locations where id=p_location;
 if v_sector is null then raise exception 'Location not found' using errcode='P0002'; end if;

 -- Serialise with the whole-system Starmap editor which locks this same sector.
 perform 1 from public.game_sectors where id=v_sector for update;
 if p_actions is null or cardinality(p_actions)>40 then
  raise exception 'Invalid action collection' using errcode='22023';
 end if;
 if exists(select 1 from unnest(p_actions) u(id)
   where not exists(select 1 from public.game_actions a where a.id=u.id)) then
  raise exception 'Unknown action id' using errcode='22023';
 end if;

 if p_routes is not null then
  if jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes)>40 then
   raise exception 'Invalid route collection' using errcode='22023';
  end if;
  for r in select value from jsonb_array_elements(p_routes) loop
   v_target:=(r->>'target')::uuid;
   v_cost:=(r->>'cost')::integer;
   if v_target is null or v_target=p_location or v_target=any(v_seen)
      or v_cost not between 1 and 500
      or not exists(select 1 from public.game_locations l
         where l.id=v_target and l.sector_id=v_sector) then
    raise exception 'Invalid or cross-sector route' using errcode='22023';
   end if;
   v_seen:=array_append(v_seen,v_target);
  end loop;
 end if;

 delete from public.game_location_actions where location_id=p_location;
 insert into public.game_location_actions(location_id,action_id)
 select p_location,u.id from unnest(p_actions) u(id) on conflict do nothing;

 -- p_routes IS NULL: route edits were NOT requested. Leave them fully untouched.
 if p_routes is not null then
  for r in select value from jsonb_array_elements(p_routes) loop
   v_target:=(r->>'target')::uuid;v_cost:=(r->>'cost')::integer;
   -- Preserve route identifiers, when possible.
   select id into v_route_id from public.game_routes
    where (origin_id=p_location and destination_id=v_target)
       or (destination_id=p_location and origin_id=v_target)
    order by id limit 1 for update;
   if v_route_id is null then
    insert into public.game_routes(origin_id,destination_id,energy_cost,is_published)
    values(least(p_location,v_target),greatest(p_location,v_target),v_cost,true)
    returning id into v_route_id;
   else
    update public.game_routes set energy_cost=v_cost where id=v_route_id;
   end if;
   v_kept:=array_append(v_kept,v_route_id);
   v_route_id:=null;
  end loop;

  delete from public.game_routes r
   where (r.origin_id=p_location or r.destination_id=p_location)
   and not (r.id=any(v_kept));
 end if;
end $$;
