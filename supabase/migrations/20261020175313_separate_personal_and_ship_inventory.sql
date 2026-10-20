-- Existing character_inventory remains ship cargo. No existing stock is moved or discarded.
create table public.character_personal_inventory(
 character_id uuid not null references public.characters(id) on delete cascade,
 item_id uuid not null references public.game_items(id),
 quantity bigint not null check(quantity between 0 and 1000000000),
 updated_at timestamptz not null default clock_timestamp(),primary key(character_id,item_id)
);
create index personal_inventory_item_fk on public.character_personal_inventory(item_id);
alter table public.character_personal_inventory enable row level security;
create policy personal_inventory_owner_read on public.character_personal_inventory for select to authenticated using(
 exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.character_personal_inventory from public,anon,authenticated;
grant select on public.character_personal_inventory to authenticated;

create or replace function private.inventory_capacity(p_c uuid) returns integer
language sql stable security definer set search_path='' as $$
 select coalesce((private.ship_status(p_c)->>'cargo')::integer,0)
$$;
create function private.personal_inventory_capacity(p_c uuid) returns integer
language sql stable security definer set search_path='' as $$
 select 6+coalesce((select i.capacity_bonus from public.character_equipment e join public.game_items i on i.id=e.item_id
 where e.character_id=p_c and e.crew_id is null and e.slot='backpack'),0)
$$;
revoke all on function private.personal_inventory_capacity(uuid) from public,anon,authenticated;
create function private.assert_storage_capacity(p_c uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.character_personal_inventory where character_id=p_c and quantity>0)>private.personal_inventory_capacity(p_c)
 then raise exception 'Personal inventory capacity exceeded';end if;
 if (select count(*) from public.character_inventory where character_id=p_c and quantity>0)>private.inventory_capacity(p_c)
 then raise exception 'Ship cargo capacity exceeded';end if;
end $$;
revoke all on function private.assert_storage_capacity(uuid) from public,anon,authenticated;
create function private.storage_capacity_final_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 cid:=case when tg_op='DELETE' then old.character_id else new.character_id end;
 perform 1 from public.character_progress where character_id=cid for update;
 perform private.assert_storage_capacity(cid);return null;
end $$;
revoke all on function private.storage_capacity_final_guard() from public,anon,authenticated;
create constraint trigger personal_capacity_committed after insert or update of quantity on public.character_personal_inventory
 deferrable initially deferred for each row execute function private.storage_capacity_final_guard();
create constraint trigger equipment_storage_capacity_committed after insert or update or delete on public.character_equipment
 deferrable initially deferred for each row execute function private.storage_capacity_final_guard();
create constraint trigger ship_module_storage_capacity_committed after insert or update or delete on public.character_ship_equipment
 deferrable initially deferred for each row execute function private.storage_capacity_final_guard();

create function private.get_storage_inventory_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();if cid is null then raise exception 'Captain required';end if;
 return jsonb_build_object('cargo_capacity',private.inventory_capacity(cid),'personal_capacity',private.personal_inventory_capacity(cid),
 'cargo',(select coalesce(jsonb_agg(to_jsonb(x) order by x.item_id),'[]'::jsonb) from public.character_inventory x where character_id=cid and quantity>0),
 'personal',(select coalesce(jsonb_agg(to_jsonb(x) order by x.item_id),'[]'::jsonb) from public.character_personal_inventory x where character_id=cid and quantity>0),
 'equipped',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.character_equipment x where character_id=cid),
 'ship',(select to_jsonb(s)||jsonb_build_object('translations',(select jsonb_agg(to_jsonb(t)) from public.game_starter_ships_i18n t where t.ship_id=s.id)) from public.game_starter_ships s join public.characters c on c.starter_ship_id=s.id where c.id=cid),
 'items',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('game_items_i18n',(select jsonb_agg(to_jsonb(t)) from public.game_items_i18n t where t.item_id=i.id)) order by i.slug),'[]'::jsonb) from public.game_items i where i.is_published or
 exists(select 1 from public.character_inventory v where v.character_id=cid and v.item_id=i.id and v.quantity>0) or
 exists(select 1 from public.character_personal_inventory v where v.character_id=cid and v.item_id=i.id and v.quantity>0) or
 exists(select 1 from public.character_equipment e where e.character_id=cid and e.item_id=i.id)));
end $$;
revoke all on function private.get_storage_inventory_impl() from public,anon;
grant execute on function private.get_storage_inventory_impl() to authenticated;
create function public.get_storage_inventory() returns jsonb language sql security invoker set search_path='' as $$select private.get_storage_inventory_impl()$$;
revoke all on function public.get_storage_inventory() from public,anon;
grant execute on function public.get_storage_inventory() to authenticated;

create function private.move_storage_item_impl(p_item uuid,p_quantity bigint,p_to text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid;stock bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();if cid is null then raise exception 'Captain required';end if;
 if p_to is null or p_to not in('cargo','personal') or p_item is null or p_quantity is null or p_quantity not between 1 and 1000000000 then raise exception 'Invalid storage transfer';end if;
 perform 1 from public.character_progress where character_id=cid for update;if not found then raise exception 'Progress required';end if;
 if p_to='personal' then
  select quantity into stock from public.character_inventory where character_id=cid and item_id=p_item for update;
  if coalesce(stock,0)<p_quantity then raise exception 'Not enough item stock';end if;
  update public.character_inventory set quantity=quantity-p_quantity,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;
  insert into public.character_personal_inventory(character_id,item_id,quantity) values(cid,p_item,p_quantity)
  on conflict(character_id,item_id) do update set quantity=public.character_personal_inventory.quantity+excluded.quantity,updated_at=clock_timestamp();
 else
  select quantity into stock from public.character_personal_inventory where character_id=cid and item_id=p_item for update;
  if coalesce(stock,0)<p_quantity then raise exception 'Not enough item stock';end if;
  update public.character_personal_inventory set quantity=quantity-p_quantity,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;
  insert into public.character_inventory(character_id,item_id,quantity) values(cid,p_item,p_quantity)
  on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+excluded.quantity,updated_at=clock_timestamp();
 end if;
 perform private.assert_storage_capacity(cid);return jsonb_build_object('moved',p_quantity,'to',p_to);
end $$;
revoke all on function private.move_storage_item_impl(uuid,bigint,text) from public,anon;
grant execute on function private.move_storage_item_impl(uuid,bigint,text) to authenticated;
create function public.move_storage_item(p_item uuid,p_quantity bigint,p_to text) returns jsonb language sql security invoker set search_path='' as $$select private.move_storage_item_impl(p_item,p_quantity,p_to)$$;
revoke all on function public.move_storage_item(uuid,bigint,text) from public,anon;
grant execute on function public.move_storage_item(uuid,bigint,text) to authenticated;

create function private.set_equipment_from_storage_impl(p_slot text,p_item uuid,p_crew uuid,p_storage text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid;equiprow record;old_id uuid;stock bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into cid from public.characters where user_id=auth.uid();if cid is null then raise exception 'Captain required';end if;
 if p_storage is null or p_storage not in('cargo','personal') then raise exception 'Invalid storage';end if;
 perform 1 from public.character_progress where character_id=cid for update;if not found then raise exception 'Progress required';end if;
 if p_slot is null then raise exception 'Slot required';end if;
 if p_crew is null then
  if p_slot not in('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic') then raise exception 'Invalid captain slot';end if;
 else
  if p_slot not in('armor','weapon','utility') or not exists(select 1 from public.character_crew where id=p_crew and character_id=cid) then raise exception 'Not your crew member';end if;
 end if;
 select id,item_id into equiprow from public.character_equipment where character_id=cid and slot=p_slot and crew_id is not distinct from p_crew for update;
 if equiprow.item_id is not distinct from p_item then return jsonb_build_object('unchanged',true);end if;
 if p_item is not null then
  if not private.equipment_item_fits(p_item,p_slot,p_crew) then raise exception 'Item incompatible with selected slot';end if;
  if p_storage='cargo' then select quantity into stock from public.character_inventory where character_id=cid and item_id=p_item for update;
  else select quantity into stock from public.character_personal_inventory where character_id=cid and item_id=p_item for update;end if;
  if coalesce(stock,0)<1 then raise exception 'Not enough item stock';end if;
 end if;
 if equiprow.id is not null then
  old_id:=equiprow.item_id;delete from public.character_equipment where id=equiprow.id;
  if p_storage='cargo' then
   insert into public.character_inventory(character_id,item_id,quantity) values(cid,old_id,1) on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1,updated_at=clock_timestamp();
  else
   insert into public.character_personal_inventory(character_id,item_id,quantity) values(cid,old_id,1) on conflict(character_id,item_id) do update set quantity=public.character_personal_inventory.quantity+1,updated_at=clock_timestamp();
  end if;
 end if;
 if p_item is not null then
  if p_storage='cargo' then update public.character_inventory set quantity=quantity-1,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;
  else update public.character_personal_inventory set quantity=quantity-1,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;end if;
  insert into public.character_equipment(character_id,crew_id,slot,item_id) values(cid,p_crew,p_slot,p_item);
 end if;
 perform private.assert_storage_capacity(cid);return jsonb_build_object('slot',p_slot,'item_id',p_item,'previous',old_id,'storage',p_storage);
end $$;
revoke all on function private.set_equipment_from_storage_impl(text,uuid,uuid,text) from public,anon;
grant execute on function private.set_equipment_from_storage_impl(text,uuid,uuid,text) to authenticated;
create function public.set_equipment_from_storage(p_slot text,p_item uuid,p_crew uuid,p_storage text) returns jsonb language sql security invoker set search_path='' as $$select private.set_equipment_from_storage_impl(p_slot,p_item,p_crew,p_storage)$$;
revoke all on function public.set_equipment_from_storage(text,uuid,uuid,text) from public,anon;
grant execute on function public.set_equipment_from_storage(text,uuid,uuid,text) to authenticated;
-- Compatibility for existing clients: their storage source/return destination remains cargo.
create or replace function private.set_equipment_impl(p_slot text,p_item uuid,p_crew uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$begin return private.set_equipment_from_storage_impl(p_slot,p_item,p_crew,'cargo');end$$;

-- Reducing an occupied ship's cargo or an equipped backpack's bonus must also validate final state.
create function private.catalog_storage_capacity_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare c record;
begin
 for c in select distinct x.id from public.characters x where
 (tg_table_name='game_starter_ships' and x.starter_ship_id=new.id) or
 (tg_table_name='game_items' and exists(select 1 from public.character_equipment e where e.character_id=x.id and e.item_id=new.id and e.slot='backpack'))
 order by x.id loop
  perform 1 from public.character_progress where character_id=c.id for update;
  perform private.assert_storage_capacity(c.id);
 end loop;return null;
end $$;
revoke all on function private.catalog_storage_capacity_guard() from public,anon,authenticated;
create constraint trigger ship_catalog_storage_capacity after update of cargo on public.game_starter_ships deferrable initially deferred for each row execute function private.catalog_storage_capacity_guard();
create constraint trigger backpack_catalog_storage_capacity after update of capacity_bonus on public.game_items deferrable initially deferred for each row execute function private.catalog_storage_capacity_guard();
-- Assert rather than trim any pre-existing cargo if a custom ship was configured too small.
do $$declare c record;begin for c in select id from public.characters loop perform private.assert_storage_capacity(c.id);end loop;end$$;
notify pgrst,'reload schema';
