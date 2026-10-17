
-- M5.1 editor-only, atomic action loot configuration.
create function private.replace_action_loot_impl(p_action uuid,p_drops jsonb) returns void
 language plpgsql security definer set search_path='' as $$
declare d jsonb;v_item uuid;v_chance integer;v_min integer;v_max integer;v_seen uuid[]:='{}';
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';
 end if;
 if not exists(select 1 from public.game_actions where id=p_action) then raise exception 'Unknown action';end if;
 if jsonb_typeof(p_drops) is distinct from 'array' or jsonb_array_length(p_drops)>50 then
  raise exception 'Invalid loot rules';
 end if;
 for d in select value from jsonb_array_elements(p_drops) loop
  v_item:=(d->>'item_id')::uuid;
  v_chance:=(d->>'chance_percent')::integer;
  v_min:=(d->>'min_qty')::integer;
  v_max:=(d->>'max_qty')::integer;
  if v_item=any(v_seen) or not exists(select 1 from public.game_items where id=v_item)
   or v_chance not between 0 and 100 or v_min not between 1 and 100
   or v_max not between v_min and 100 then raise exception 'Invalid loot item or rule';end if;
  v_seen:=array_append(v_seen,v_item);
 end loop;
 delete from public.game_action_loot where action_id=p_action;
 for d in select value from jsonb_array_elements(p_drops) loop
  insert into public.game_action_loot(action_id,item_id,chance_percent,min_qty,max_qty)
  values(p_action,(d->>'item_id')::uuid,(d->>'chance_percent')::integer,(d->>'min_qty')::integer,(d->>'max_qty')::integer);
 end loop;
end $$;
revoke all on function private.replace_action_loot_impl(uuid,jsonb) from public,anon;
grant execute on function private.replace_action_loot_impl(uuid,jsonb) to authenticated;
create function public.replace_action_loot(p_action uuid,p_drops jsonb) returns void
 language sql security invoker set search_path='' as $$
 select private.replace_action_loot_impl(p_action,p_drops)
$$;
revoke all on function public.replace_action_loot(uuid,jsonb) from public,anon;
grant execute on function public.replace_action_loot(uuid,jsonb) to authenticated;