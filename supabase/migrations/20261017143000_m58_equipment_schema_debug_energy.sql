
alter table public.game_items add column if not exists image_path text;
alter table public.game_items add column if not exists equip_owner text;
alter table public.game_items add column if not exists equip_slot text;
alter table public.game_items add column if not exists capacity_bonus integer not null default 0 check(capacity_bonus between 0 and 100);
alter table public.game_items add constraint equip_item_slots_check check (
(equip_owner is null and equip_slot is null and capacity_bonus=0) or
(equip_owner='captain' and equip_slot in ('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic') and (capacity_bonus=0 or equip_slot='backpack')) or
(equip_owner='crew' and equip_slot in ('armor','weapon','utility') and capacity_bonus=0));
create table public.character_equipment(
id uuid primary key default gen_random_uuid(),
character_id uuid not null references public.characters(id) on delete cascade,
crew_id uuid references public.character_crew(id) on delete cascade,
slot text not null,item_id uuid not null references public.game_items(id),
created_at timestamptz not null default clock_timestamp());
create unique index equipment_per_slot on public.character_equipment(character_id,coalesce(crew_id,'00000000-0000-0000-0000-000000000000'::uuid),slot);
alter table public.character_equipment enable row level security;
create policy own_equipment_read on public.character_equipment for select to authenticated using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.character_equipment from public,anon,authenticated;
grant select on public.character_equipment to authenticated;

create function private.inventory_capacity(p_c uuid) returns integer
language sql stable security definer set search_path='' as $$
select 24+coalesce((select i.capacity_bonus from public.character_equipment e join public.game_items i on i.id=e.item_id
where e.character_id=p_c and e.crew_id is null and e.slot='backpack'),0) $$;
create function public.get_inventory_capacity() returns integer language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
select id into c from public.characters where user_id=auth.uid();
if c is null then raise exception 'Captain required';end if;
return private.inventory_capacity(c);
end $$;
revoke all on function public.get_inventory_capacity() from public,anon;
grant execute on function public.get_inventory_capacity() to authenticated;
create function private.inventory_capacity_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;
begin
if new.quantity<=0 then return new;end if;
if tg_op='INSERT' then
select count(*) into n from public.character_inventory where character_id=new.character_id and quantity>0;
if n>=private.inventory_capacity(new.character_id) then raise exception 'Inventory capacity exceeded';end if;
end if;
return new;
end $$;
create trigger capacity_on_new_stacks before insert on public.character_inventory for each row execute function private.inventory_capacity_guard();

create function private.debug_refill_impl() returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid;v integer;
begin
if auth.uid() is null or not (select private.can_edit_content()) then raise exception 'Editor permission required' using errcode='42501';end if;
select id into c from public.characters where user_id=auth.uid();
if c is null then raise exception 'Captain required';end if;
select energy_max into v from public.gameplay_rules where id=1;
update public.character_progress set energy=v,energy_at=clock_timestamp(),updated_at=clock_timestamp() where character_id=c;
return jsonb_build_object('energy',v,'test_only',true);
end $$;
revoke all on function private.debug_refill_impl() from public,anon;
grant execute on function private.debug_refill_impl() to authenticated;
create function public.debug_refill_energy() returns jsonb language sql security invoker set search_path='' as $$select private.debug_refill_impl()$$;
revoke all on function public.debug_refill_energy() from public,anon;
grant execute on function public.debug_refill_energy() to authenticated;
