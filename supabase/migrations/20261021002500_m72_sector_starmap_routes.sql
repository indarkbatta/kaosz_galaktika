-- M72. Atomic editor-only solar-system map save (positions and bidirectional travel links).
-- Keeps route identifiers for existing links and does not touch per-location actions.
create function private.save_sector_starmap_impl(p_sector uuid,p_nodes jsonb,p_routes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_item jsonb;v_id uuid;v_a uuid;v_b uuid;v_cost integer;v_published boolean;
 v_x integer;v_y integer;v_changed integer;v_node_count integer:=0;v_route_count integer:=0;
 v_seen_nodes uuid[]:='{}'::uuid[];v_seen_pairs text[]:='{}'::text[];
 v_kept uuid[]:='{}'::uuid[];v_existing uuid;v_route_id uuid;v_pair text;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';
 end if;
 perform 1 from public.game_sectors where id=p_sector for update;
 if not found then raise exception 'Solar-system sector not found' using errcode='P0001';end if;
 if jsonb_typeof(p_nodes) is distinct from 'array' or jsonb_array_length(p_nodes)>150
 or jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes)>400 then
  raise exception 'Invalid starmap payload' using errcode='22023';
 end if;
 -- Validate the full location inventory before changing even one coordinate.
 for v_item in select value from jsonb_array_elements(p_nodes) loop
  v_id:=(v_item->>'id')::uuid;
  v_x:=(v_item->>'x')::integer;v_y:=(v_item->>'y')::integer;
  if v_id is null or v_id=any(v_seen_nodes) or v_x not between 10 and 90
     or v_y not between 10 and 90 or v_x%5<>0 or v_y%5<>0
     or not exists (select 1 from public.game_locations where id=v_id and sector_id=p_sector)
  then raise exception 'Invalid location grid point' using errcode='22023';end if;
  v_seen_nodes:=array_append(v_seen_nodes,v_id);
  v_node_count:=v_node_count+1;
 end loop;
 if (select count(*) from public.game_locations where sector_id=p_sector)<>v_node_count then
  raise exception 'Starmap location set is stale; reload before saving' using errcode='P0001';
 end if;
 -- Verify all destinations and duplicate links prior to any writes.
 for v_item in select value from jsonb_array_elements(p_routes) loop
  v_a:=(v_item->>'origin_id')::uuid;
  v_b:=(v_item->>'destination_id')::uuid;
  v_cost:=(v_item->>'energy_cost')::integer;
  v_published:=coalesce((v_item->>'is_published')::boolean,true);
  v_pair:=least(v_a,v_b)::text||':'||greatest(v_a,v_b)::text;
  if v_a is null or v_b is null or v_a=v_b or v_cost not between 1 and 500
  or v_pair=any(v_seen_pairs)
  or not exists(select 1 from public.game_locations where id=v_a and sector_id=p_sector)
  or not exists(select 1 from public.game_locations where id=v_b and sector_id=p_sector)
  then raise exception 'Invalid or duplicate starmap link' using errcode='22023';end if;
  v_seen_pairs:=array_append(v_seen_pairs,v_pair);
 end loop;
 for v_item in select value from jsonb_array_elements(p_nodes) loop
  update public.game_locations set x=(v_item->>'x')::integer,y=(v_item->>'y')::integer
  where id=(v_item->>'id')::uuid and sector_id=p_sector;
 end loop;
 for v_item in select value from jsonb_array_elements(p_routes) loop
  v_a:=(v_item->>'origin_id')::uuid;v_b:=(v_item->>'destination_id')::uuid;
  v_cost:=(v_item->>'energy_cost')::integer;
  v_published:=coalesce((v_item->>'is_published')::boolean,true);
  select id into v_existing from public.game_routes
    where (origin_id=v_a and destination_id=v_b) or (origin_id=v_b and destination_id=v_a)
    order by id limit 1 for update;
  if v_existing is null then
   insert into public.game_routes(origin_id,destination_id,energy_cost,is_published)
   values(least(v_a,v_b),greatest(v_a,v_b),v_cost,v_published)
   returning id into v_route_id;
  else
   update public.game_routes set energy_cost=v_cost,is_published=v_published
   where id=v_existing returning id into v_route_id;
  end if;
  v_kept:=array_append(v_kept,v_route_id);
  v_route_count:=v_route_count+1;
  v_existing:=null;
 end loop;
 delete from public.game_routes r
 where exists(select 1 from public.game_locations a where a.id=r.origin_id and a.sector_id=p_sector)
 and exists(select 1 from public.game_locations b where b.id=r.destination_id and b.sector_id=p_sector)
 and not (r.id=any(v_kept));
 return jsonb_build_object('locations',v_node_count,'routes',v_route_count);
end $$;
revoke all on function private.save_sector_starmap_impl(uuid,jsonb,jsonb) from public,anon;
grant execute on function private.save_sector_starmap_impl(uuid,jsonb,jsonb) to authenticated;
create function public.save_sector_starmap(p_sector uuid,p_nodes jsonb,p_routes jsonb)
returns jsonb language sql security invoker set search_path=''
as $$select private.save_sector_starmap_impl(p_sector,p_nodes,p_routes)$$;
revoke all on function public.save_sector_starmap(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_sector_starmap(uuid,jsonb,jsonb) to authenticated;