-- HV-079: per-actor bags. Existing captain stock and positions stay in place.
create table private.expedition_actor_inventory(
 actor_id uuid not null references private.expedition_actors(id) on delete cascade,
 item_id uuid not null references public.game_items(id) on delete restrict,
 quantity bigint not null check(quantity between 0 and 1000000000),
 position integer check(position>=0),
 primary key(actor_id,item_id),unique(actor_id,position) deferrable initially deferred
);
create index expedition_actor_inventory_item on private.expedition_actor_inventory(item_id);
alter table private.expedition_actor_inventory enable row level security;
revoke all on private.expedition_actor_inventory from public,anon,authenticated;

create function private.expedition_bag_capacity(aid uuid) returns integer language sql stable set search_path='' as $$
 select 6+coalesce((select capacity_bonus from public.game_items where id=private.expedition_gear(aid,'backpack')),0)
$$;
alter function private.assert_storage_capacity(uuid) rename to assert_storage_capacity_before_actor_bags;
create function private.assert_storage_capacity(p_c uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.assert_storage_capacity_before_actor_bags(p_c);
 if exists(select 1 from private.expedition_actors a where a.character_id=p_c and a.kind='companion'
 and (select count(*) from private.expedition_actor_inventory i where i.actor_id=a.id and i.quantity>0)>private.expedition_bag_capacity(a.id))
 then raise exception 'Personal inventory capacity exceeded';end if;
end $$;

-- Caller holds the game-state lock. Resolve ownership even for an explicitly
-- supplied actor on cargo operations; an arbitrary UUID is never authorization.
create function private.expedition_storage_actor(cid uuid,aid uuid,s text) returns uuid language plpgsql set search_path='' as $$begin
 if s is null or s not in ('cargo','personal') then raise exception 'Invalid storage';end if;
 if aid is not null and not exists(select 1 from private.expedition_actors where id=aid and character_id=cid) then raise exception 'Actor not found' using errcode='42501';end if;
 return case when s='cargo' then cid else coalesce(aid,cid) end;
end $$;
create function private.expedition_stock_delta(cid uuid,aid uuid,s text,item uuid,delta bigint) returns void language plpgsql set search_path='' as $$
declare stock bigint;tab text;begin
 if s='personal' and aid<>cid then
  select quantity into stock from private.expedition_actor_inventory where actor_id=aid and item_id=item for update;
  if delta<0 and coalesce(stock,0)<-delta then raise exception 'Not enough item stock';end if;
  insert into private.expedition_actor_inventory(actor_id,item_id,quantity) values(aid,item,coalesce(stock,0)+delta)
  on conflict(actor_id,item_id) do update set quantity=excluded.quantity,position=case when excluded.quantity=0 then null else private.expedition_actor_inventory.position end;
 else
  tab:=case when s='personal' then 'character_personal_inventory' else 'character_inventory' end;
  execute format('select quantity from public.%I where character_id=$1 and item_id=$2 for update',tab) into stock using cid,item;
  if delta<0 and coalesce(stock,0)<-delta then raise exception 'Not enough item stock';end if;
  execute format('insert into public.%I(character_id,item_id,quantity) values($1,$2,$3) on conflict(character_id,item_id) do update set quantity=excluded.quantity,updated_at=clock_timestamp()',tab) using cid,item,coalesce(stock,0)+delta;
 end if;
end $$;
create function private.expedition_stock_quantity(cid uuid,aid uuid,s text,item uuid) returns bigint language plpgsql stable set search_path='' as $$begin
 if s='personal' and aid<>cid then return coalesce((select quantity from private.expedition_actor_inventory where actor_id=aid and item_id=item),0);
 elsif s='personal' then return coalesce((select quantity from public.character_personal_inventory where character_id=cid and item_id=item),0);
 else return coalesce((select quantity from public.character_inventory where character_id=cid and item_id=item),0);end if;
end $$;
create function private.expedition_normalize_bag(aid uuid) returns void language plpgsql set search_path='' as $$
declare cap integer:=private.expedition_bag_capacity(aid);r record;pos integer;begin
 if (select count(*) from private.expedition_actor_inventory where actor_id=aid and quantity>0)>cap then raise exception 'Personal inventory capacity exceeded';end if;
 update private.expedition_actor_inventory set position=null where actor_id=aid and (quantity=0 or position>=cap);
 for r in select item_id from private.expedition_actor_inventory where actor_id=aid and quantity>0 and position is null order by item_id loop
 select n into pos from generate_series(0,cap-1)n where not exists(select 1 from private.expedition_actor_inventory where actor_id=aid and position=n) order by n limit 1;
 if pos is null then raise exception 'Personal inventory capacity exceeded';end if;
 update private.expedition_actor_inventory set position=pos where actor_id=aid and item_id=r.item_id;
 end loop;
end $$;
create function private.expedition_reposition(cid uuid,aid uuid,s text,item uuid,pos integer) returns void language plpgsql set search_path='' as $$
declare cap integer;oldpos integer;other uuid;begin
 if s='personal' and aid<>cid then
 perform private.expedition_normalize_bag(aid);cap:=private.expedition_bag_capacity(aid);
 if pos is null then return;end if;
 if pos<0 or pos>=cap then raise exception 'Invalid storage position';end if;
 select position into oldpos from private.expedition_actor_inventory where actor_id=aid and item_id=item and quantity>0;
 if oldpos is null then raise exception 'Not enough item stock';end if;
 select item_id into other from private.expedition_actor_inventory where actor_id=aid and position=pos and quantity>0;
 update private.expedition_actor_inventory set position=oldpos where actor_id=aid and item_id=other;
 update private.expedition_actor_inventory set position=pos where actor_id=aid and item_id=item;
 else
 perform private.normalize_inventory_positions(cid,s);
 if pos is not null then perform private.drop_inventory_item(item,1,s,s,pos,null,null);end if;
 end if;
end $$;

alter function private.expedition_storage() rename to expedition_storage_before_actor_bags;
create function private.expedition_storage() returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;d jsonb;aid uuid;bags jsonb;begin
 cid:=private.combat_owned_character();d:=private.expedition_storage_before_actor_bags();
 for aid in select id from private.expedition_actors where character_id=cid and kind='companion' order by id loop perform private.expedition_normalize_bag(aid);end loop;
 select coalesce(jsonb_agg(jsonb_build_object('actor_id',a.id,'capacity',private.expedition_bag_capacity(a.id),'items',
 case when a.kind='captain' then d->'personal' else coalesce((select jsonb_agg(jsonb_build_object('item_id',i.item_id,'quantity',i.quantity,'position',i.position) order by i.position) from private.expedition_actor_inventory i where i.actor_id=a.id and i.quantity>0),'[]') end) order by a.kind,a.id),'[]') into bags
 from private.expedition_actors a where a.character_id=cid;
 -- Archived items carried by companions still need labels and combat tooltips.
 d:=jsonb_set(d,'{items}',(d->'items')||coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('game_items_i18n',(select jsonb_agg(t) from public.game_items_i18n t where t.item_id=i.id),'game_item_combat',(select to_jsonb(c) from public.game_item_combat c where c.item_id=i.id))) from public.game_items i where exists(select 1 from private.expedition_actor_inventory inv join private.expedition_actors a on a.id=inv.actor_id where a.character_id=cid and inv.item_id=i.id and inv.quantity>0) and not exists(select 1 from jsonb_array_elements(d->'items')x where (x->>'id')::uuid=i.id)),'[]'));
 return d||jsonb_build_object('personal_inventories',bags);
end $$;

create function private.expedition_equip_from(p_actor uuid,p_slot text,p_item uuid,p_storage text,p_storage_actor uuid,p_position integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;aid uuid;old_item uuid;begin
 cid:=private.combat_owned_character();perform private.expedition_assert_idle(cid);perform private.expedition_check_gear(cid,p_actor,p_slot);
 aid:=private.expedition_storage_actor(cid,p_storage_actor,p_storage);
 old_item:=private.expedition_gear(p_actor,p_slot);
 if old_item is not distinct from p_item then return private.expedition_storage();end if;
 if p_item is not null then
  if p_position is not null then raise exception 'Position requires unequip';end if;
  if not private.equipment_item_fits(p_item,p_slot,null) then raise exception 'Item incompatible with selected slot';end if;
  perform private.expedition_stock_delta(cid,aid,p_storage,p_item,-1);
 end if;
 perform private.expedition_write_gear(p_actor,p_slot,p_item);
 if old_item is not null then perform private.expedition_stock_delta(cid,aid,p_storage,old_item,1);end if;
 perform private.assert_storage_capacity(cid);
 perform private.expedition_reposition(cid,aid,p_storage,old_item,p_position);
 return private.expedition_storage();
end $$;
create function private.expedition_transfer_item(p_item uuid,p_quantity bigint,p_from text,p_from_actor uuid,p_to text,p_to_actor uuid,p_position integer,p_slot text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;src uuid;dst uuid;begin
 cid:=private.combat_owned_character();perform private.expedition_assert_idle(cid);
 dst:=private.expedition_storage_actor(cid,p_to_actor,p_to);
 if p_item is null or p_quantity is null or p_quantity not between 1 and 1000000000 then raise exception 'Invalid storage transfer';end if;
 if p_from='gear' then
  perform private.expedition_check_gear(cid,p_from_actor,p_slot);
  if p_quantity<>1 or private.expedition_gear(p_from_actor,p_slot) is distinct from p_item then raise exception 'Equipment changed; reload';end if;
  perform private.expedition_write_gear(p_from_actor,p_slot,null);
  perform private.expedition_stock_delta(cid,dst,p_to,p_item,1);
 else
  src:=private.expedition_storage_actor(cid,p_from_actor,p_from);
  if p_from<>p_to or src<>dst then
   perform private.expedition_stock_delta(cid,src,p_from,p_item,-p_quantity);
   perform private.expedition_stock_delta(cid,dst,p_to,p_item,p_quantity);
  else
   -- Reordering is not a quantity edit, but still verifies available stock.
   if private.expedition_stock_quantity(cid,src,p_from,p_item)<p_quantity then raise exception 'Not enough item stock';end if;
  end if;
 end if;
 perform private.assert_storage_capacity(cid);
 perform private.expedition_reposition(cid,dst,p_to,p_item,p_position);
 return private.expedition_storage();
end $$;

-- Deferred guards protect catalog edits and every gear adapter, including old
-- clients which may still use the captain-only endpoints during rollout.
create function private.expedition_bag_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;aid uuid;begin
 aid:=case when tg_op='DELETE' then old.actor_id else new.actor_id end;
 select character_id into cid from private.expedition_actors where id=aid;
 if cid is not null then perform 1 from public.character_progress where character_id=cid for update;perform private.assert_storage_capacity(cid);end if;
 return null;
end $$;
create constraint trigger expedition_bag_inventory_capacity after insert or update or delete on private.expedition_actor_inventory deferrable initially deferred for each row execute function private.expedition_bag_guard();
create constraint trigger expedition_bag_gear_capacity after insert or update or delete on private.expedition_actor_equipment deferrable initially deferred for each row execute function private.expedition_bag_guard();
create function private.expedition_backpack_catalog_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 for cid in select distinct a.character_id from private.expedition_actors a join private.expedition_actor_equipment e on e.actor_id=a.id where e.slot='backpack' and e.item_id=new.id order by a.character_id loop
  perform 1 from public.character_progress where character_id=cid for update;perform private.assert_storage_capacity(cid);
 end loop;return null;
end $$;
create constraint trigger expedition_bag_catalog_capacity after update of capacity_bonus on public.game_items deferrable initially deferred for each row execute function private.expedition_backpack_catalog_guard();

create function public.equip_expedition_actor_from(p_actor uuid,p_slot text,p_item uuid,p_storage text,p_storage_actor uuid default null,p_position integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_equip_from(p_actor,p_slot,p_item,p_storage,p_storage_actor,p_position)$$;
create function public.transfer_expedition_item(p_item uuid,p_quantity bigint,p_from text,p_from_actor uuid,p_to text,p_to_actor uuid,p_position integer default null,p_slot text default null) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_transfer_item(p_item,p_quantity,p_from,p_from_actor,p_to,p_to_actor,p_position,p_slot)$$;
revoke all on function private.expedition_stock_quantity(uuid,uuid,text,uuid),private.expedition_bag_capacity(uuid),private.assert_storage_capacity_before_actor_bags(uuid),private.expedition_storage_actor(uuid,uuid,text),private.expedition_stock_delta(uuid,uuid,text,uuid,bigint),private.expedition_normalize_bag(uuid),private.expedition_reposition(uuid,uuid,text,uuid,integer),private.expedition_storage_before_actor_bags(),private.expedition_bag_guard(),private.expedition_backpack_catalog_guard() from public,anon,authenticated;
revoke all on function private.assert_storage_capacity(uuid) from public,anon,authenticated;
revoke all on function private.expedition_storage(),private.expedition_equip_from(uuid,text,uuid,text,uuid,integer),private.expedition_transfer_item(uuid,bigint,text,uuid,text,uuid,integer,text),public.equip_expedition_actor_from(uuid,text,uuid,text,uuid,integer),public.transfer_expedition_item(uuid,bigint,text,uuid,text,uuid,integer,text) from public,anon;
grant execute on function private.expedition_storage(),private.expedition_equip_from(uuid,text,uuid,text,uuid,integer),private.expedition_transfer_item(uuid,bigint,text,uuid,text,uuid,integer,text),public.equip_expedition_actor_from(uuid,text,uuid,text,uuid,integer),public.transfer_expedition_item(uuid,bigint,text,uuid,text,uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
