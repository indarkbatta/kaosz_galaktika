create table private.character_power_loadouts(
 character_id uuid primary key references public.characters(id) on delete cascade,
 powers uuid[] not null default '{}',
 check(cardinality(powers)<=5 and array_position(powers,null) is null)
);
alter table private.character_power_loadouts enable row level security;
revoke all on private.character_power_loadouts from public,anon,authenticated;
alter function private.combat_hero(uuid) rename to combat_hero_before_loadout;
create function private.combat_hero(p_character uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare hero jsonb;chosen uuid[];
begin
 hero:=private.combat_hero_before_loadout(p_character);
 select powers into chosen from private.character_power_loadouts where character_id=p_character;
 -- Existing characters start with their first five available active powers.
 if chosen is null then select coalesce(array_agg((p->>'id')::uuid order by n),'{}') into chosen from (select p,row_number() over(order by p->>'slug') n from jsonb_array_elements(hero->'powers')p where p->>'kind'='active' order by p->>'slug' limit 5)x;end if;
 return jsonb_set(hero,'{powers}',coalesce((select jsonb_agg(p order by case when p->>'kind'='active' then array_position(chosen,(p->>'id')::uuid) else 0 end) from jsonb_array_elements(hero->'powers')p where p->>'kind'<>'active' or (p->>'id')::uuid=any(chosen)),'[]'));
end $$;
revoke all on function private.combat_hero(uuid) from public,anon,authenticated;
create function private.expedition_loadout() returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;hero jsonb;chosen uuid[];
begin
 cid:=private.combat_owned_character();hero:=private.combat_hero_before_loadout(cid);
 select powers into chosen from private.character_power_loadouts where character_id=cid;
 if chosen is null then select coalesce(array_agg((p->>'id')::uuid order by n),'{}') into chosen from (select p,row_number() over(order by p->>'slug') n from jsonb_array_elements(hero->'powers')p where p->>'kind'='active' order by p->>'slug' limit 5)x;end if;
 return jsonb_build_object('powers',coalesce((select jsonb_agg(p) from jsonb_array_elements(hero->'powers')p where p->>'kind'='active'),'[]'),'prepared',chosen,'locked',exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation));
end $$;
create function private.save_expedition_powers(p_powers uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;available jsonb;
begin
 cid:=private.combat_owned_character();perform 1 from public.character_progress where character_id=cid for update;
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) then raise exception 'Loadout locked during combat';end if;
 if p_powers is null or cardinality(p_powers)>5 or array_position(p_powers,null) is not null or cardinality(p_powers)<>(select count(distinct x) from unnest(p_powers)x) then raise exception 'Choose at most five distinct powers';end if;
 available:=private.combat_hero_before_loadout(cid)->'powers';
 if exists(select 1 from unnest(p_powers)id where not exists(select 1 from jsonb_array_elements(available)p where (p->>'id')::uuid=id and p->>'kind'='active')) then raise exception 'Power unavailable';end if;
 insert into private.character_power_loadouts values(cid,p_powers) on conflict(character_id) do update set powers=excluded.powers;
 return private.expedition_loadout();
end $$;
revoke all on function private.expedition_loadout(),private.save_expedition_powers(uuid[]) from public,anon;
grant execute on function private.expedition_loadout(),private.save_expedition_powers(uuid[]) to authenticated;
create function public.get_expedition_loadout() returns jsonb language sql security invoker set search_path='' as $$select private.expedition_loadout()$$;
create function public.save_expedition_powers(p_powers uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.save_expedition_powers(p_powers)$$;
revoke all on function public.get_expedition_loadout(),public.save_expedition_powers(uuid[]) from public,anon;
grant execute on function public.get_expedition_loadout(),public.save_expedition_powers(uuid[]) to authenticated;
-- Equipment is the shared authoritative loadout; prevent changes while a real encounter is running.
alter function private.set_equipment_from_storage_impl(text,uuid,uuid,text) rename to set_equipment_before_loadout;
create function private.set_equipment_from_storage_impl(p_slot text,p_item uuid,p_crew uuid,p_storage text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 cid:=private.combat_owned_character();perform 1 from public.character_progress where character_id=cid for update;
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) then raise exception 'Loadout locked during combat';end if;
 return private.set_equipment_before_loadout(p_slot,p_item,p_crew,p_storage);
end $$;
revoke all on function private.set_equipment_before_loadout(text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.set_equipment_from_storage_impl(text,uuid,uuid,text) from public,anon;
grant execute on function private.set_equipment_from_storage_impl(text,uuid,uuid,text) to authenticated;
alter function private.move_equipment_impl(text,uuid,text,uuid) rename to move_equipment_before_loadout;
create function private.move_equipment_impl(p_from_slot text,p_from_crew uuid,p_to_slot text,p_to_crew uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 cid:=private.combat_owned_character();perform 1 from public.character_progress where character_id=cid for update;
 if exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation) then raise exception 'Loadout locked during combat';end if;
 return private.move_equipment_before_loadout(p_from_slot,p_from_crew,p_to_slot,p_to_crew);
end $$;
revoke all on function private.move_equipment_before_loadout(text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function private.move_equipment_impl(text,uuid,text,uuid) from public,anon;
grant execute on function private.move_equipment_impl(text,uuid,text,uuid) to authenticated;
