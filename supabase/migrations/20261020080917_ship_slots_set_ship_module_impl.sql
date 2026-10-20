create function private.set_ship_module_impl(p_slot text,p_item uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare cid uuid;sid uuid;s public.game_ship_slots%rowtype;m public.game_ship_modules%rowtype;old_item uuid;stock bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id,starter_ship_id into cid,sid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 if not found then raise exception 'Progress required';end if;
 select * into s from public.game_ship_slots where ship_id=sid and slot_key=p_slot and kind='module';
 if not found then raise exception 'Invalid ship module slot';end if;
 select item_id into old_item from public.character_ship_equipment where character_id=cid and ship_id=sid and slot_key=p_slot;
 if old_item is not distinct from p_item then return jsonb_build_object('unchanged',true);end if;
 if p_item is not null then
  select sm.* into m from public.game_ship_modules sm join public.game_items i on i.id=sm.item_id where sm.item_id=p_item and i.is_published;
  if not found or m.module_kind<>s.module_kind or m.size>s.size then raise exception 'Module incompatible with ship slot';end if;
  select quantity into stock from public.character_inventory where character_id=cid and item_id=p_item for update;
  if coalesce(stock,0)<1 then raise exception 'Module is not in cargo';end if;
 end if;
 delete from public.character_ship_equipment where character_id=cid and ship_id=sid and slot_key=p_slot;
 if old_item is not null then
  insert into public.character_inventory(character_id,item_id,quantity) values(cid,old_item,1)
  on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1,updated_at=clock_timestamp();
 end if;
 if p_item is not null then
  update public.character_inventory set quantity=quantity-1,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;
  insert into public.character_ship_equipment(character_id,ship_id,slot_key,item_id) values(cid,sid,p_slot,p_item);
 end if;
 if (select count(*) from public.character_inventory where character_id=cid and quantity>0)>private.inventory_capacity(cid) then
  raise exception 'Inventory capacity exceeded after equipment change';end if;
 return private.ship_status(cid);
end $fn$;
revoke all on function private.set_ship_module_impl(text,uuid) from public,anon;
grant execute on function private.set_ship_module_impl(text,uuid) to authenticated;
create function public.set_ship_module(p_slot text,p_item uuid) returns jsonb language sql security invoker set search_path='' as $fn$select private.set_ship_module_impl(p_slot,p_item)$fn$;
revoke all on function public.set_ship_module(text,uuid) from public,anon;
grant execute on function public.set_ship_module(text,uuid) to authenticated;

