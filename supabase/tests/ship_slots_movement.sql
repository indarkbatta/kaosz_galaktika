-- Independent movement, power and route-cost regression; fixtures always roll back.
begin;
do $test$
declare u uuid:=gen_random_uuid();cid uuid;sp uuid;species uuid;class_id uuid;skill uuid;
 engine uuid;reactor uuid;boost uuid;target uuid;origin uuid;base_cost integer;result jsonb;status jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'ship-movement-'||u||'@example.invalid','{}');
 perform set_config('request.jwt.claim.sub',u::text,true);
 select id into species from public.game_species where is_published limit 1;
 select id into class_id from public.game_classes where is_published limit 1;
 select id into skill from public.game_skills limit 1;
 select id into sp from public.game_starter_ships where slug='bastion';
 select item_id into engine from public.game_ship_modules where module_kind='engine' and is_starter;
 select item_id into reactor from public.game_ship_modules where module_kind='reactor' and is_starter;
 select id into boost from public.game_items where slug='ship_drive_boost';
 execute 'set local role authenticated';
 cid:=public.create_captain('Ship movement test',species,class_id,sp,'{"body":6}',jsonb_build_object(skill::text,6));
 perform public.move_ship_module('engine_1','engine_2');
 if(select count(*) from public.character_ship_equipment where character_id=cid and item_id=engine)<>2 then raise exception 'Swap lost an engine';end if;
 perform public.set_ship_module('engine_2',null);
 perform public.move_ship_module('engine_1','engine_2');
 if exists(select 1 from public.character_ship_equipment where character_id=cid and slot_key='engine_1') then raise exception 'Move duplicated source';end if;
 perform public.set_ship_module('engine_1',engine);
 perform public.set_ship_module('reactor_1',null);
 status:=public.get_ship_loadout()->'stats';
 if(status->>'ready')::boolean or(status->>'power_output')::integer<>0 then raise exception 'Missing reactor allowed departure';end if;
 perform public.set_ship_module('reactor_1',reactor);
 execute 'set local role postgres';
 insert into public.character_inventory(character_id,item_id,quantity) values(cid,boost,1);
 execute 'set local role authenticated';
 perform public.set_ship_module('engine_1',boost);
 select location_id into origin from public.character_positions where character_id=cid;
 select case when origin_id=origin then destination_id else origin_id end,energy_cost into target,base_cost from public.game_routes where is_published and origin in(origin_id,destination_id) order by energy_cost limit 1;
 if target is null then raise exception 'No test route';end if;
 result:=public.travel_to_location(target);status:=public.get_ship_loadout()->'stats';
 if(result->>'energy_spent')::integer<>greatest(1,ceil(base_cost::numeric*(status->>'base_speed')::numeric/(status->>'speed')::numeric)::integer) then raise exception 'Speed ignored by travel';end if;
end $test$;
rollback;
