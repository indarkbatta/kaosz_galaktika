-- Layout belongs to the character, not to the browser or the item catalog order.
create table private.inventory_positions(
 character_id uuid not null references public.characters(id) on delete cascade,
 storage text not null check(storage in ('personal','cargo')),
 item_id uuid not null references public.game_items(id),
 position integer not null check(position>=0),
 primary key(character_id,storage,item_id),
 unique(character_id,storage,position) deferrable initially deferred
);
alter table private.inventory_positions enable row level security;
revoke all on private.inventory_positions from public,anon,authenticated;
create function private.normalize_inventory_positions(cid uuid,s text) returns void
language plpgsql security definer set search_path='' as $$
declare cap integer;r record;pos integer;
begin
 cap:=case when s='personal' then private.personal_inventory_capacity(cid) else private.inventory_capacity(cid) end;
 delete from private.inventory_positions p where p.character_id=cid and p.storage=s and
 (p.position>=cap or not exists(select 1 from public.character_personal_inventory i where s='personal' and i.character_id=cid and i.item_id=p.item_id and i.quantity>0)
 and not exists(select 1 from public.character_inventory i where s='cargo' and i.character_id=cid and i.item_id=p.item_id and i.quantity>0));
 for r in select item_id from (
 select item_id from public.character_personal_inventory where s='personal' and character_id=cid and quantity>0
 union all select item_id from public.character_inventory where s='cargo' and character_id=cid and quantity>0) stock
 where not exists(select 1 from private.inventory_positions p where p.character_id=cid and p.storage=s and p.item_id=stock.item_id) order by item_id loop
 select n into pos from generate_series(0,cap-1)n where not exists(select 1 from private.inventory_positions p where p.character_id=cid and p.storage=s and p.position=n) order by n limit 1;
 if pos is null then raise exception 'Storage capacity exceeded';end if;
 insert into private.inventory_positions values(cid,s,r.item_id,pos);
 end loop;
end $$;
revoke all on function private.normalize_inventory_positions(uuid,text) from public,anon,authenticated;
alter function private.get_storage_inventory_impl() rename to get_storage_inventory_before_positions;
create function private.get_storage_inventory_impl() returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;data jsonb;s text;
begin
 cid:=private.combat_owned_character();
 perform 1 from public.character_progress where character_id=cid for update;
 data:=private.get_storage_inventory_before_positions();
 foreach s in array array['personal','cargo'] loop
 perform private.normalize_inventory_positions(cid,s);
 data:=jsonb_set(data,array[s],coalesce((select jsonb_agg(x||jsonb_build_object('position',p.position) order by p.position) from jsonb_array_elements(data->s)x join private.inventory_positions p on p.character_id=cid and p.storage=s and p.item_id=(x->>'item_id')::uuid),'[]'::jsonb));
 end loop;
 return data;
end $$;
create or replace function public.get_storage_inventory() returns jsonb language sql volatile security invoker set search_path='' as $$select private.get_storage_inventory_impl()$$;
revoke all on function private.get_storage_inventory_impl() from public,anon;
grant execute on function private.get_storage_inventory_impl() to authenticated;
create function private.drop_inventory_item(p_item uuid,p_quantity bigint,p_from text,p_to text,p_position integer,p_slot text,p_crew uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cid uuid;cap integer;oldpos integer;other uuid;worn uuid;
begin
 cid:=private.combat_owned_character();
 perform 1 from public.character_progress where character_id=cid for update;
 if p_to is null or p_to not in ('personal','cargo') or p_from is null or p_from not in ('personal','cargo','gear') or p_item is null then raise exception 'Invalid storage transfer';end if;
 cap:=case when p_to='personal' then private.personal_inventory_capacity(cid) else private.inventory_capacity(cid) end;
 if p_position is null or p_position<0 or p_position>=cap then raise exception 'Invalid storage position';end if;
 perform private.normalize_inventory_positions(cid,p_to);
 if p_from='gear' then
 select item_id into worn from public.character_equipment where character_id=cid and slot=p_slot and crew_id is not distinct from p_crew;
 if worn is distinct from p_item then raise exception 'Equipment changed; reload';end if;
 perform private.set_equipment_from_storage_impl(p_slot,null,p_crew,p_to);
 elsif p_from<>p_to then
 perform private.move_storage_item_impl(p_item,p_quantity,p_to);
 else
 if not exists(select 1 from private.inventory_positions where character_id=cid and storage=p_to and item_id=p_item) then raise exception 'Not enough item stock';end if;
 end if;
 cap:=case when p_to='personal' then private.personal_inventory_capacity(cid) else private.inventory_capacity(cid) end;
 if p_position>=cap then raise exception 'Invalid storage position';end if;
 -- The existing transfer RPCs keep stock, ownership and capacity validation authoritative.
 perform private.normalize_inventory_positions(cid,p_to);
 select position into oldpos from private.inventory_positions where character_id=cid and storage=p_to and item_id=p_item;
 select item_id into other from private.inventory_positions where character_id=cid and storage=p_to and position=p_position;
 update private.inventory_positions set position=oldpos where character_id=cid and storage=p_to and item_id=other;
 update private.inventory_positions set position=p_position where character_id=cid and storage=p_to and item_id=p_item;
 return private.get_storage_inventory_impl();
end $$;
revoke all on function private.drop_inventory_item(uuid,bigint,text,text,integer,text,uuid) from public,anon;
grant execute on function private.drop_inventory_item(uuid,bigint,text,text,integer,text,uuid) to authenticated;
create function public.drop_inventory_item(p_item uuid,p_quantity bigint,p_from text,p_to text,p_position integer,p_slot text default null,p_crew uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select private.drop_inventory_item(p_item,p_quantity,p_from,p_to,p_position,p_slot,p_crew)$$;
revoke all on function public.drop_inventory_item(uuid,bigint,text,text,integer,text,uuid) from public,anon;
grant execute on function public.drop_inventory_item(uuid,bigint,text,text,integer,text,uuid) to authenticated;
