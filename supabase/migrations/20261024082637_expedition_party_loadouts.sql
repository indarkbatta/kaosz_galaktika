-- HV-070. No player reset or crew conversion. Apply with the new frontend.
create table private.expedition_parties(
 character_id uuid primary key references public.characters(id) on delete cascade,
 actors uuid[] not null, revision bigint not null default 1,
 check(cardinality(actors) between 1 and 4 and array_position(actors,null) is null)
);
create table private.expedition_power_loadouts(
 actor_id uuid primary key references private.expedition_actors(id) on delete cascade,
 powers uuid[] not null check(cardinality(powers)<=5 and array_position(powers,null) is null)
);
alter table private.expedition_parties enable row level security;
alter table private.expedition_power_loadouts enable row level security;
revoke all on private.expedition_parties,private.expedition_power_loadouts from public,anon,authenticated;

create function private.expedition_loadout_v2() returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;party uuid[];rev bigint;roster jsonb;begin
 cid:=private.combat_owned_character();
 select actors,revision into party,rev from private.expedition_parties where character_id=cid;
 select coalesce(jsonb_agg(a||jsonb_build_object('prepared',coalesce(
  (select to_jsonb(l.powers) from private.expedition_power_loadouts l where l.actor_id=(a->>'id')::uuid),
  case when a->>'kind'='captain' then (select to_jsonb(powers) from private.character_power_loadouts where character_id=cid) end,
  (select coalesce(jsonb_agg(p->'id' order by p->>'slug'),'[]') from (select p from jsonb_array_elements(a->'powers')p where p->>'kind'='active' order by p->>'slug' limit 5)x)))), '[]') into roster
 from jsonb_array_elements(private.read_expedition_roster()->'actors')a;
 return jsonb_build_object('actors',roster,'party',coalesce(party,array[cid]),'revision',coalesce(rev,0),
 'locked',exists(select 1 from public.combat_runs where character_id=cid and status='active' and not simulation)
 or exists(select 1 from public.character_skill_challenge_runs where character_id=cid and status='active'));
end $$;
create function private.expedition_save_party(p_actors uuid[],p_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;rev bigint;begin
 cid:=private.combat_owned_character();perform private.expedition_assert_idle(cid);
 select revision into rev from private.expedition_parties where character_id=cid;
 if p_revision is distinct from coalesce(rev,0) then raise exception 'Party changed; reload';end if;
 if p_actors is null or array_ndims(p_actors) is distinct from 1 or cardinality(p_actors) not between 1 and 4
 or array_position(p_actors,null) is not null or cardinality(p_actors)<>(select count(distinct a) from unnest(p_actors)a)
 or not cid=any(p_actors) then raise exception 'Choose captain and up to three distinct companions';end if;
 if exists(select 1 from unnest(p_actors)a where not exists(select 1 from private.expedition_actors where id=a and character_id=cid)) then raise exception 'Actor not found' using errcode='42501';end if;
 insert into private.expedition_parties values(cid,p_actors,1) on conflict(character_id) do update set actors=excluded.actors,revision=private.expedition_parties.revision+1;
 return private.expedition_loadout_v2();
end $$;
create function private.expedition_save_actor_powers(p_actor uuid,p_powers uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;sheet jsonb;begin
 cid:=private.combat_owned_character();perform private.expedition_assert_idle(cid);
 sheet:=private.read_expedition_actor(p_actor);
 if p_powers is null or cardinality(p_powers)>5 or (cardinality(p_powers)>0 and array_ndims(p_powers) is distinct from 1)
 or array_position(p_powers,null) is not null or cardinality(p_powers)<>(select count(distinct p) from unnest(p_powers)p) then raise exception 'Choose at most five distinct powers';end if;
 if exists(select 1 from unnest(p_powers)id where not exists(select 1 from jsonb_array_elements(sheet->'powers')p where (p->>'id')::uuid=id and p->>'kind'='active')) then raise exception 'Power unavailable';end if;
 insert into private.expedition_power_loadouts values(p_actor,p_powers) on conflict(actor_id) do update set powers=excluded.powers;
 -- Keep the old combat adapter consistent until HV-045 replaces the engine.
 if p_actor=cid then insert into private.character_power_loadouts values(cid,p_powers) on conflict(character_id) do update set powers=excluded.powers;end if;
 return private.expedition_loadout_v2();
end $$;

-- Shared gear adapters: captain remains in the authoritative legacy table; companions
-- use the foundation's actor equipment, with the same physical slots and evaluator.
create function private.expedition_gear(p_actor uuid,p_slot text) returns uuid language sql stable set search_path='' as $$
 select item_id from public.character_equipment where character_id=p_actor and crew_id is null and slot=p_slot
 union all select e.item_id from private.expedition_actor_equipment e join private.expedition_actors a on a.id=e.actor_id where a.kind='companion' and e.actor_id=p_actor and e.slot=p_slot
$$;
create function private.expedition_write_gear(aid uuid,s text,item uuid) returns void language plpgsql set search_path='' as $$begin
 if exists(select 1 from private.expedition_actors where id=aid and kind='captain') then
 delete from public.character_equipment where character_id=aid and crew_id is null and slot=s;
 if item is not null then insert into public.character_equipment(character_id,slot,item_id) values(aid,s,item);end if;
 else
 delete from private.expedition_actor_equipment where actor_id=aid and slot=s;
 if item is not null then insert into private.expedition_actor_equipment values(aid,s,item);end if;
 end if;
end $$;
create function private.expedition_check_gear(cid uuid,aid uuid,s text) returns void language plpgsql set search_path='' as $$begin
 if not exists(select 1 from private.expedition_actors where id=aid and character_id=cid) then raise exception 'Actor not found' using errcode='42501';end if;
 if s is null or s not in ('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic') then raise exception 'Invalid equipment slot';end if;
end $$;
create function private.expedition_storage() returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;d jsonb;begin
 cid:=private.combat_owned_character();d:=private.get_storage_inventory_impl();
 -- Include retired worn items and combat metadata just like the original storage API.
 d:=jsonb_set(d,'{items}',(d->'items')||coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('game_items_i18n',(select jsonb_agg(t) from public.game_items_i18n t where t.item_id=i.id))) from public.game_items i where exists(select 1 from private.expedition_actor_equipment e join private.expedition_actors a on a.id=e.actor_id where a.character_id=cid and e.item_id=i.id) and not exists(select 1 from jsonb_array_elements(d->'items')x where (x->>'id')::uuid=i.id)),'[]'));
 d:=jsonb_set(d,'{items}',coalesce((select jsonb_agg(i||jsonb_build_object('game_item_combat',(select to_jsonb(c) from public.game_item_combat c where c.item_id=(i->>'id')::uuid))) from jsonb_array_elements(d->'items')i),'[]'));

 return jsonb_set(d,'{equipped}',coalesce((select jsonb_agg(e) from jsonb_array_elements(d->'equipped')e where e->>'crew_id' is null),'[]')||
 coalesce((select jsonb_agg(jsonb_build_object('id',e.actor_id||':'||e.slot,'crew_id',e.actor_id,'slot',e.slot,'item_id',e.item_id)) from private.expedition_actor_equipment e join private.expedition_actors a on a.id=e.actor_id where a.character_id=cid and a.kind='companion'),'[]'));
end $$;
create function private.expedition_equip(p_actor uuid,p_slot text,p_item uuid,p_storage text,p_position integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;old_item uuid;stock bigint;tab text;begin
 cid:=private.combat_owned_character();perform private.expedition_assert_idle(cid);perform private.expedition_check_gear(cid,p_actor,p_slot);
 if p_storage is null or p_storage not in ('personal','cargo') then raise exception 'Invalid storage';end if;
 old_item:=private.expedition_gear(p_actor,p_slot);
 if old_item is not distinct from p_item then return private.expedition_storage();end if;
 tab:=case p_storage when 'personal' then 'character_personal_inventory' else 'character_inventory' end;
 if p_item is not null then
 if not private.equipment_item_fits(p_item,p_slot,null) then raise exception 'Item incompatible with selected slot';end if;
 execute format('select quantity from public.%I where character_id=$1 and item_id=$2 for update',tab) into stock using cid,p_item;
 if coalesce(stock,0)<1 then raise exception 'Not enough item stock';end if;
 execute format('update public.%I set quantity=quantity-1,updated_at=clock_timestamp() where character_id=$1 and item_id=$2',tab) using cid,p_item;
 end if;
 perform private.expedition_write_gear(p_actor,p_slot,p_item);
 if old_item is not null then
 execute format('insert into public.%I(character_id,item_id,quantity) values($1,$2,1) on conflict(character_id,item_id) do update set quantity=public.%I.quantity+1,updated_at=clock_timestamp()',tab,tab) using cid,old_item;
 end if;
 perform private.assert_storage_capacity(cid);
 if p_position is not null then
 if p_item is not null or old_item is null then raise exception 'Position requires unequip';end if;
 perform private.drop_inventory_item(old_item,1,p_storage,p_storage,p_position,null,null);
 end if;
 return private.expedition_storage();
end $$;
create function private.expedition_move_gear(p_from_actor uuid,p_from_slot text,p_to_actor uuid,p_to_slot text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;src uuid;dst uuid;begin
 cid:=private.combat_owned_character();perform private.expedition_assert_idle(cid);
 perform private.expedition_check_gear(cid,p_from_actor,p_from_slot);perform private.expedition_check_gear(cid,p_to_actor,p_to_slot);
 src:=private.expedition_gear(p_from_actor,p_from_slot);dst:=private.expedition_gear(p_to_actor,p_to_slot);
 if src is null then raise exception 'Source equipment missing';end if;
 if not private.equipment_item_fits(src,p_to_slot,null) or (dst is not null and not private.equipment_item_fits(dst,p_from_slot,null)) then raise exception 'Equipment swap incompatible';end if;
 perform private.expedition_write_gear(p_from_actor,p_from_slot,null);perform private.expedition_write_gear(p_to_actor,p_to_slot,null);
 perform private.expedition_write_gear(p_to_actor,p_to_slot,src);perform private.expedition_write_gear(p_from_actor,p_from_slot,dst);
 perform private.assert_storage_capacity(cid);return private.expedition_storage();
end $$;

create function public.get_expedition_team_loadout() returns jsonb language sql security invoker set search_path='' as $$select private.expedition_loadout_v2()$$;
create function public.save_expedition_party(p_actors uuid[],p_revision bigint) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_save_party(p_actors,p_revision)$$;
create function public.save_expedition_actor_powers(p_actor uuid,p_powers uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_save_actor_powers(p_actor,p_powers)$$;
create function public.get_expedition_storage() returns jsonb language sql security invoker set search_path='' as $$select private.expedition_storage()$$;
create function public.equip_expedition_actor(p_actor uuid,p_slot text,p_item uuid,p_storage text,p_position integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_equip(p_actor,p_slot,p_item,p_storage,p_position)$$;
create function public.move_expedition_equipment(p_from_actor uuid,p_from_slot text,p_to_actor uuid,p_to_slot text) returns jsonb language sql security invoker set search_path='' as $$select private.expedition_move_gear(p_from_actor,p_from_slot,p_to_actor,p_to_slot)$$;
-- Explicit signatures only: never revoke by expedition_% wildcard.
revoke all on function private.expedition_gear(uuid,text),private.expedition_write_gear(uuid,text,uuid),private.expedition_check_gear(uuid,uuid,text) from public,anon,authenticated;
revoke all on function private.expedition_loadout_v2(),private.expedition_save_party(uuid[],bigint),private.expedition_save_actor_powers(uuid,uuid[]),private.expedition_storage(),private.expedition_equip(uuid,text,uuid,text,integer),private.expedition_move_gear(uuid,text,uuid,text) from public,anon;
grant execute on function private.expedition_loadout_v2(),private.expedition_save_party(uuid[],bigint),private.expedition_save_actor_powers(uuid,uuid[]),private.expedition_storage(),private.expedition_equip(uuid,text,uuid,text,integer),private.expedition_move_gear(uuid,text,uuid,text) to authenticated;
revoke all on function public.get_expedition_team_loadout(),public.save_expedition_party(uuid[],bigint),public.save_expedition_actor_powers(uuid,uuid[]),public.get_expedition_storage(),public.equip_expedition_actor(uuid,text,uuid,text,integer),public.move_expedition_equipment(uuid,text,uuid,text) from public,anon;
grant execute on function public.get_expedition_team_loadout(),public.save_expedition_party(uuid[],bigint),public.save_expedition_actor_powers(uuid,uuid[]),public.get_expedition_storage(),public.equip_expedition_actor(uuid,text,uuid,text,integer),public.move_expedition_equipment(uuid,text,uuid,text) to authenticated;

-- Retire replaced player write paths. Keep historical tables/data for HV-075 audit.
do $$declare signature text;f regprocedure;begin
 foreach signature in array array['public.set_salvage_party(uuid[])','private.set_salvage_party(uuid[])','public.save_expedition_powers(uuid[])','private.save_expedition_powers(uuid[])'] loop
 f:=to_regprocedure(signature);if f is not null then execute format('revoke all on function %s from public,anon,authenticated',f);end if;
 end loop;
end $$;
-- The remaining legacy gear adapters may serve inventory/layout callers, but can
-- no longer outfit service crew. All writes use the new guarded captain path.
create or replace function private.set_equipment_from_storage_impl(p_slot text,p_item uuid,p_crew uuid,p_storage text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 cid:=private.combat_owned_character();
 if p_crew is not null then raise exception 'Service crew cannot equip items';end if;
 return private.expedition_equip(cid,p_slot,p_item,p_storage,null);
end $$;
create or replace function private.move_equipment_impl(p_from_slot text,p_from_crew uuid,p_to_slot text,p_to_crew uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 cid:=private.combat_owned_character();
 if p_from_crew is not null or p_to_crew is not null then raise exception 'Service crew cannot equip items';end if;
 return private.expedition_move_gear(cid,p_from_slot,cid,p_to_slot);
end $$;
notify pgrst,'reload schema';
