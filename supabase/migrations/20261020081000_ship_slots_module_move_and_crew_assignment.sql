create function private.move_ship_module_impl(p_from_slot text,p_to_slot text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare cid uuid;sid uuid;source_id uuid;target_id uuid;s public.game_ship_slots%rowtype;t public.game_ship_slots%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id,starter_ship_id into cid,sid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 if not found then raise exception 'Progress required';end if;
 select * into s from public.game_ship_slots where ship_id=sid and slot_key=p_from_slot and kind='module';
 if not found then raise exception 'Invalid source ship slot';end if;
 select * into t from public.game_ship_slots where ship_id=sid and slot_key=p_to_slot and kind='module';
 if not found then raise exception 'Invalid destination ship slot';end if;
 if p_from_slot=p_to_slot then return jsonb_build_object('unchanged',true);end if;
 select item_id into source_id from public.character_ship_equipment where character_id=cid and ship_id=sid and slot_key=p_from_slot;
 select item_id into target_id from public.character_ship_equipment where character_id=cid and ship_id=sid and slot_key=p_to_slot;
 if source_id is null then raise exception 'Source module missing';end if;
 if not exists(select 1 from public.game_ship_modules m where m.item_id=source_id and m.module_kind=t.module_kind and m.size<=t.size)
 or (target_id is not null and not exists(select 1 from public.game_ship_modules m where m.item_id=target_id and m.module_kind=s.module_kind and m.size<=s.size))
 then raise exception 'Module incompatible with ship slot';end if;
 delete from public.character_ship_equipment where character_id=cid and ship_id=sid and slot_key in (p_from_slot,p_to_slot);
 insert into public.character_ship_equipment(character_id,ship_id,slot_key,item_id) values(cid,sid,p_to_slot,source_id);
 if target_id is not null then insert into public.character_ship_equipment(character_id,ship_id,slot_key,item_id) values(cid,sid,p_from_slot,target_id);end if;
 return private.ship_status(cid);
end $fn$;
revoke all on function private.move_ship_module_impl(text,text) from public,anon;
grant execute on function private.move_ship_module_impl(text,text) to authenticated;
create function public.move_ship_module(p_from_slot text,p_to_slot text) returns jsonb language sql security invoker set search_path='' as $fn$select private.move_ship_module_impl(p_from_slot,p_to_slot)$fn$;
revoke all on function public.move_ship_module(text,text) from public,anon;
grant execute on function public.move_ship_module(text,text) to authenticated;

create function private.assign_ship_crew_impl(p_slot text,p_crew uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare cid uuid;sid uuid;s public.game_ship_slots%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id,starter_ship_id into cid,sid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 if not found then raise exception 'Progress required';end if;
 select * into s from public.game_ship_slots where ship_id=sid and slot_key=p_slot and kind='crew';
 if not found then raise exception 'Invalid ship crew station';end if;
 if p_crew is not null and not exists(select 1 from public.character_crew where id=p_crew and character_id=cid and specialty=s.crew_role and aptitude>=s.min_aptitude)
 then raise exception 'Crew member is not qualified for this station';end if;
 delete from public.character_ship_crew where character_id=cid and ((ship_id=sid and slot_key=p_slot) or crew_id=p_crew);
 if p_crew is not null then insert into public.character_ship_crew(character_id,ship_id,slot_key,crew_id) values(cid,sid,p_slot,p_crew);end if;
 return private.ship_status(cid);
end $fn$;
revoke all on function private.assign_ship_crew_impl(text,uuid) from public,anon;
grant execute on function private.assign_ship_crew_impl(text,uuid) to authenticated;
create function public.assign_ship_crew(p_slot text,p_crew uuid) returns jsonb language sql security invoker set search_path='' as $fn$select private.assign_ship_crew_impl(p_slot,p_crew)$fn$;
revoke all on function public.assign_ship_crew(text,uuid) from public,anon;
grant execute on function public.assign_ship_crew(text,uuid) to authenticated;

create function private.sync_ship_crew_station() returns trigger language plpgsql security definer set search_path='' as $fn$
declare sid uuid;target text;
begin
 select starter_ship_id into sid from public.characters where id=new.character_id;
 delete from public.character_ship_crew a using public.game_ship_slots s where a.character_id=new.character_id and a.crew_id=new.id
 and s.ship_id=a.ship_id and s.slot_key=a.slot_key and (s.crew_role<>new.specialty or new.aptitude<s.min_aptitude or a.ship_id<>sid);
 if not exists(select 1 from public.character_ship_crew where character_id=new.character_id and crew_id=new.id) then
 select s.slot_key into target from public.game_ship_slots s where s.ship_id=sid and s.kind='crew' and s.crew_role=new.specialty and s.min_aptitude<=new.aptitude
 and not exists(select 1 from public.character_ship_crew a where a.character_id=new.character_id and a.ship_id=sid and a.slot_key=s.slot_key)
 order by s.required desc,s.sort_order limit 1;
 if target is not null then insert into public.character_ship_crew(character_id,ship_id,slot_key,crew_id) values(new.character_id,sid,target,new.id);end if;
 end if;
 return new;
end $fn$;
revoke all on function private.sync_ship_crew_station() from public,anon,authenticated;
create trigger sync_ship_crew_station after insert or update of specialty,aptitude on public.character_crew for each row execute function private.sync_ship_crew_station();

create function private.initialize_ship_loadout() returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 insert into public.character_ship_equipment(character_id,ship_id,slot_key,item_id)
 select new.id,new.starter_ship_id,s.slot_key,m.item_id from public.game_ship_slots s join public.game_ship_modules m on m.module_kind=s.module_kind and m.is_starter and m.size<=s.size
 where s.ship_id=new.starter_ship_id and s.kind='module';
 -- Existing captain creation supplies pilot and navigator after character triggers.
 insert into public.character_crew(character_id,position,name,specialty,aptitude)
 select new.id,s.crew_role,s.name_en,s.crew_role,s.min_aptitude from public.game_ship_slots s
 where s.ship_id=new.starter_ship_id and s.kind='crew' and s.required and s.crew_role not in ('pilot','navigator');
 return new;
end $fn$;
revoke all on function private.initialize_ship_loadout() from public,anon,authenticated;
create trigger initialize_ship_loadout after insert on public.characters for each row execute function private.initialize_ship_loadout();

