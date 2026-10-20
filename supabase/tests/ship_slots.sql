-- Run after the migration. Every fixture and player mutation is rolled back.
begin;
do $test$
declare u uuid:=gen_random_uuid();cid uuid;sp record;species uuid;class_id uuid;skill uuid;
 loadout jsonb;engine uuid;shield uuid;boost uuid;pilot uuid;nav uuid;before_total bigint;after_total bigint;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'ship-slots-regression-'||u::text||'@example.invalid','{}');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 select id into species from public.game_species where is_published order by slug limit 1;
 select id into class_id from public.game_classes where is_published order by slug limit 1;
 select id into skill from public.game_skills order by slug limit 1;
 select item_id into engine from public.game_ship_modules where module_kind='engine' and is_starter;
 select item_id into shield from public.game_ship_modules where module_kind='shield' and is_starter;
 select i.id into boost from public.game_items i where slug='ship_drive_boost';
 for sp in select id,slug from public.game_starter_ships where slug in ('sparrow','vagabond','bastion') loop
  execute 'set local role authenticated';
  cid:=public.create_captain('Ship slot regression',species,class_id,sp.id,'{"body":6}',jsonb_build_object(skill::text,6));
  loadout:=public.get_ship_loadout();
  if not (loadout->'stats'->>'ready')::boolean then raise exception 'Starter ship not ready: %',sp.slug;end if;
  if jsonb_array_length(loadout->'slots')<>(case sp.slug when 'sparrow' then 10 when 'vagabond' then 12 else 16 end) then raise exception 'Incorrect slot profile: %',sp.slug;end if;
  select id into pilot from public.character_crew where character_id=cid and specialty='pilot';
  select id into nav from public.character_crew where character_id=cid and specialty='navigator';
  select coalesce((select quantity from public.character_inventory where character_id=cid and item_id=engine),0)
   +(select count(*) from public.character_ship_equipment where character_id=cid and item_id=engine) into before_total;
  perform public.set_ship_module('engine_1',null);
  if (public.get_ship_loadout()->'stats'->>'ready')::boolean then raise exception 'Missing engine must block readiness';end if;
  begin
   perform public.travel_to_location(gen_random_uuid());
   raise exception 'TEST: travel accepted without an engine';
  exception when raise_exception then
   if sqlerrm not like 'Ship is not ready:%' then raise;end if;
  end;
  begin
   perform public.set_ship_module('engine_1',shield);
   raise exception 'TEST: incompatible module accepted';
  exception when raise_exception then
   if sqlerrm<>'Module incompatible with ship slot' then raise;end if;
  end;
  perform public.set_ship_module('engine_1',engine);
  select coalesce((select quantity from public.character_inventory where character_id=cid and item_id=engine),0)
   +(select count(*) from public.character_ship_equipment where character_id=cid and item_id=engine) into after_total;
  if before_total<>after_total then raise exception 'Module duplication/loss';end if;
  perform public.assign_ship_crew('crew_pilot',null);
  if (public.get_ship_loadout()->'stats'->>'ready')::boolean then raise exception 'Missing pilot must block readiness';end if;
  begin
   perform public.assign_ship_crew('crew_pilot',nav);
   raise exception 'TEST: unqualified crew accepted';
  exception when raise_exception then
   if sqlerrm<>'Crew member is not qualified for this station' then raise;end if;
  end;
  perform public.assign_ship_crew('crew_pilot',pilot);
  execute 'set local role postgres';
  insert into public.character_inventory(character_id,item_id,quantity) values(cid,boost,1);
  execute 'set local role authenticated';
  if sp.slug='sparrow' then
   begin
    perform public.set_ship_module('engine_1',boost);
    raise exception 'TEST: oversized module accepted';
   exception when raise_exception then
    if sqlerrm<>'Module incompatible with ship slot' then raise;end if;
   end;
  else
   perform public.set_ship_module('engine_1',boost);
   loadout:=public.get_ship_loadout();
   if (loadout->'stats'->>'speed')::integer <= (loadout->'stats'->>'base_speed')::integer then raise exception 'Speed bonus missing';end if;
  end if;
  begin
   insert into public.character_ship_equipment(character_id,ship_id,slot_key,item_id) values(cid,sp.id,'forged',engine);
   raise exception 'TEST: direct client mutation accepted';
  exception when insufficient_privilege then null;
  end;
  if exists(select 1 from public.character_ship_equipment where character_id<>cid) then raise exception 'RLS exposed another captain';end if;
  execute 'set local role postgres';
  delete from public.characters where id=cid;
 end loop;
end $test$;
rollback;
