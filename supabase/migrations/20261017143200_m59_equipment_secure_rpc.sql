
create function private.set_equipment_impl(p_slot text,p_item uuid,p_crew uuid default null) returns jsonb
 language plpgsql security definer set search_path='' as $$
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
  if it.id is null or not it.is_published or it.equip_slot is distinct from p_slot or
   it.equip_owner is distinct from (case when p_crew is null then 'captain' else 'crew' end)
   then raise exception 'Item incompatible with selected slot';end if;
  select quantity into stock from public.character_inventory where character_id=cid and item_id=p_item for update;
  if coalesce(stock,0)<1 then raise exception 'Not enough item stock';end if;
 end if;
 if equiprow.id is not null then
  old_id:=equiprow.item_id;
  delete from public.character_equipment where id=equiprow.id;
  if p_slot='backpack' and p_crew is null then
   select private.inventory_capacity(cid) into newcap;
   select count(*) into n from public.character_inventory where character_id=cid and quantity>0;
   if n>newcap or (n=newcap and not exists(select 1 from public.character_inventory
    where character_id=cid and item_id=old_id and quantity>0))
    then raise exception 'Backpack removal would exceed capacity';end if;
  end if;
  insert into public.character_inventory(character_id,item_id,quantity) values(cid,old_id,1)
  on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1,updated_at=clock_timestamp();
 end if;
 if p_item is not null then
   update public.character_inventory set quantity=quantity-1,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;
   insert into public.character_equipment(character_id,crew_id,slot,item_id) values(cid,p_crew,p_slot,p_item);
 end if;
 return jsonb_build_object('slot',p_slot,'item_id',p_item,'crew_id',p_crew,'previous',old_id);
end $$;
revoke all on function private.set_equipment_impl(text,uuid,uuid) from public,anon;
grant execute on function private.set_equipment_impl(text,uuid,uuid) to authenticated;
create function public.set_equipment(p_slot text,p_item uuid default null,p_crew uuid default null) returns jsonb
 language sql security invoker set search_path='' as $$
 select private.set_equipment_impl(p_slot,p_item,p_crew)
 $$;
revoke all on function public.set_equipment(text,uuid,uuid) from public,anon;
grant execute on function public.set_equipment(text,uuid,uuid) to authenticated;

-- Gear belongs to individual crew member; when replacing them, return it to inventory.
create function private.on_crew_replacement() returns trigger language plpgsql security definer set search_path='' as $$
declare it record;
begin
 if old.name is distinct from new.name then
  for it in select id,item_id from public.character_equipment where crew_id=old.id loop
   delete from public.character_equipment where id=it.id;
   insert into public.character_inventory(character_id,item_id,quantity) values(old.character_id,it.item_id,1)
   on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1;
  end loop;
 end if;
 return new;
end $$;
create trigger crew_recruit_unequip before update of name on public.character_crew
 for each row execute function private.on_crew_replacement();
