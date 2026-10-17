-- Transactional sector-link editor for editor/admin only.
create function private.replace_sector_links_impl(p_location uuid,p_actions uuid[],p_routes jsonb)
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
 if jsonb_typeof(p_routes) is distinct from 'array' or jsonb_array_length(p_routes)>40 then raise exception 'Invalid route collection'; end if;
 for r in select value from jsonb_array_elements(p_routes) loop
   v_target:=(r->>'target')::uuid;
   v_cost:=(r->>'cost')::integer;
   if v_target=p_location or v_target=any(v_seen) or not exists(select 1 from public.game_locations where id=v_target)
      or v_cost not between 1 and 500 then raise exception 'Invalid route';end if;
   v_seen:=array_append(v_seen,v_target);
 end loop;
 delete from public.game_location_actions where location_id=p_location;
 insert into public.game_location_actions(location_id,action_id)
 select p_location,u.id from unnest(p_actions) u(id) on conflict do nothing;
 delete from public.game_routes where origin_id=p_location or destination_id=p_location;
 for r in select value from jsonb_array_elements(p_routes) loop
   v_target:=(r->>'target')::uuid;
   v_cost:=(r->>'cost')::integer;
   insert into public.game_routes(origin_id,destination_id,energy_cost,is_published)
    values(least(p_location,v_target),greatest(p_location,v_target),v_cost,true);
 end loop;
end $$;
revoke all on function private.replace_sector_links_impl(uuid,uuid[],jsonb) from public,anon;
grant execute on function private.replace_sector_links_impl(uuid,uuid[],jsonb) to authenticated;
create function public.replace_sector_links(p_location uuid,p_actions uuid[],p_routes jsonb)
returns void language sql security invoker set search_path='' as $$
 select private.replace_sector_links_impl(p_location,p_actions,p_routes)
$$;
revoke all on function public.replace_sector_links(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.replace_sector_links(uuid,uuid[],jsonb) to authenticated;