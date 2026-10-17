-- M63: server-authoritative two-way equipment DnD with swaps across crew and compatible utility slots.
create function private.equipment_item_fits(p_item uuid,p_slot text,p_crew uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((
  select i.is_published
   and i.equip_owner=(case when p_crew is null then 'captain' else 'crew' end)
   and (i.equip_slot=p_slot or
    (p_crew is null and i.equip_slot in ('utility1','utility2') and p_slot in ('utility1','utility2')))
   from public.game_items i where i.id=p_item
 ),false);
$$;
revoke all on function private.equipment_item_fits(uuid,text,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.set_equipment_impl(p_slot text, p_item uuid, p_crew uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; equiprow record; it record; stock bigint; n integer; old_id uuid; newcap integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select id into cid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 if not found then raise exception 'Progress required';end if;
 if p_crew is null then
   if p_slot not in ('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic') then raise exception 'Invalid captain slot';end if;
 else
   if p_slot not in ('armor','weapon','utility') then raise exception 'Invalid crew slot';end if;
   if not exists(select 1 from public.character_crew where id=p_crew and character_id=cid) then raise exception 'Not your crew member';end if;
 end if;
 select e.id,e.item_id into equiprow from public.character_equipment e
  where e.character_id=cid and e.crew_id is not distinct from p_crew and e.slot=p_slot for update;
 if equiprow.item_id is not distinct from p_item then return jsonb_build_object('unchanged',true);end if;
 if p_item is not null then
  select id,equip_slot,equip_owner,is_published into it from public.game_items where id=p_item;
  if not private.equipment_item_fits(p_item,p_slot,p_crew) then
   raise exception 'Item incompatible with selected slot';end if;
  select quantity into stock from public.character_inventory where character_id=cid and item_id=p_item for update;
  if coalesce(stock,0)<1 then raise exception 'Not enough item stock';end if;
 end if;
 if equiprow.id is not null then
  old_id:=equiprow.item_id;
  delete from public.character_equipment where id=equiprow.id;
  -- Evaluate capacity after the entire swap, not after the temporary removal.
  insert into public.character_inventory(character_id,item_id,quantity) values(cid,old_id,1)
  on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1,updated_at=clock_timestamp();
 end if;
 if p_item is not null then
   update public.character_inventory set quantity=quantity-1,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;
   insert into public.character_equipment(character_id,crew_id,slot,item_id) values(cid,p_crew,p_slot,p_item);
 end if;
 -- The final state includes returned gear, consumed source stacks and new backpack bonus.
 select private.inventory_capacity(cid) into newcap;
 select count(*) into n from public.character_inventory where character_id=cid and quantity>0;
 if n>newcap then raise exception 'Inventory capacity exceeded after equipment change';end if;
 return jsonb_build_object('slot',p_slot,'item_id',p_item,'crew_id',p_crew,'previous',old_id);
end $function$
;

create function private.move_equipment_impl(p_from_slot text,p_from_crew uuid,p_to_slot text,p_to_crew uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid; v_source record; v_target record;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required' using errcode='42501';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 if not found then raise exception 'Progress required';end if;
 if p_from_slot is null or p_to_slot is null then raise exception 'Slot required';end if;
 if p_from_crew is null then
  if p_from_slot not in ('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic') then raise exception 'Invalid source slot';end if;
 else
  if p_from_slot not in ('armor','weapon','utility') or
   not exists(select 1 from public.character_crew where character_id=cid and id=p_from_crew)
  then raise exception 'Invalid source crew slot';end if;
 end if;
 if p_to_crew is null then
  if p_to_slot not in ('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic') then raise exception 'Invalid destination slot';end if;
 else
  if p_to_slot not in ('armor','weapon','utility') or
   not exists(select 1 from public.character_crew where character_id=cid and id=p_to_crew)
  then raise exception 'Invalid destination crew slot';end if;
 end if;
 if p_from_slot=p_to_slot and p_from_crew is not distinct from p_to_crew then return jsonb_build_object('unchanged',true);end if;
 select id,item_id into v_source from public.character_equipment
  where character_id=cid and slot=p_from_slot and crew_id is not distinct from p_from_crew for update;
 if v_source.id is null then raise exception 'Source equipment missing';end if;
 if not private.equipment_item_fits(v_source.item_id,p_to_slot,p_to_crew) then
  raise exception 'Equipment cannot be moved to destination';end if;
 select id,item_id into v_target from public.character_equipment
  where character_id=cid and slot=p_to_slot and crew_id is not distinct from p_to_crew for update;
 if v_target.id is not null and not private.equipment_item_fits(v_target.item_id,p_from_slot,p_from_crew) then
  raise exception 'Equipment swap incompatible';end if;
 -- Delete and insert under the one character_progress serialization lock, protecting the unique slot index.
 delete from public.character_equipment where id in (v_source.id,v_target.id);
 insert into public.character_equipment(character_id,crew_id,slot,item_id)
  values(cid,p_to_crew,p_to_slot,v_source.item_id);
 if v_target.id is not null then
  insert into public.character_equipment(character_id,crew_id,slot,item_id)
  values(cid,p_from_crew,p_from_slot,v_target.item_id);
 end if;
 return jsonb_build_object('moved',true,'swapped',v_target.id is not null);
end $$;
revoke all on function private.move_equipment_impl(text,uuid,text,uuid) from public,anon;
grant execute on function private.move_equipment_impl(text,uuid,text,uuid) to authenticated;
create function public.move_equipment(p_from_slot text,p_from_crew uuid,p_to_slot text,p_to_crew uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select private.move_equipment_impl(p_from_slot,p_from_crew,p_to_slot,p_to_crew) $$;
revoke all on function public.move_equipment(text,uuid,text,uuid) from public,anon;
grant execute on function public.move_equipment(text,uuid,text,uuid) to authenticated;
