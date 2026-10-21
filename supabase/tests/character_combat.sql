-- Actual linked PostgreSQL integration. All accounts/content/commands are ROLLBACK-only.
begin;
do $test$
declare uid uuid:=gen_random_uuid();other_uid uuid:=gen_random_uuid();species uuid;klass uuid;ship uuid;skill uuid;cid uuid;
 enemy uuid;enc uuid;basic uuid;run jsonb;after_run jsonb;request uuid;start_request uuid:=gen_random_uuid();sim jsonb;weapon record;hero jsonb;cfg public.game_rules%rowtype;
 name_slug text:='qa_combat_'||replace(gen_random_uuid()::text,'-','');item jsonb;xp bigint;energy integer;hp jsonb;i integer:=0;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'combat-'||uid||'@example.invalid','{}'),(other_uid,'combat-'||other_uid||'@example.invalid','{}');
 update public.user_roles set role='editor' where user_id=uid;
 perform set_config('request.jwt.claim.sub',uid::text,true);execute 'set local role authenticated';
 select * into cfg from public.game_rules where id=1;
 select id into species from public.game_species where slug='ember';select id into klass from public.game_classes where slug='pszion';select id into ship from public.game_starter_ships where slug='sparrow';select id into skill from public.game_skills order by slug limit 1;
 cid:=public.create_captain('Combat integration',species,klass,ship,jsonb_build_object('body',cfg.free_attribute_pips),jsonb_build_object(skill::text,cfg.free_skill_pips));
 if cid is null then raise exception 'Captain creation failed';end if;
 -- Actual legacy full item saver + manufacturer wrapper + new combat stats, in one transaction.
 item:=public.save_game_item_with_combat(null,name_slug,'material','common',false,
 '[{"locale":"hu","name":"QA anyag","description":"Teszt"},{"locale":"en","name":"QA material","description":"Test"}]','[]',null,null,null,0,null,null,
 '{"tier":4,"weapon_pips":0,"damage_types":["kinetic"],"resistances":{"kinetic":2},"effects":[]}');
 if not exists(select 1 from public.game_item_combat where item_id=(item->>'id')::uuid and tier=4) then raise exception 'Atomic combat item save failed';end if;
 begin
  perform public.save_game_item_with_combat((item->>'id')::uuid,name_slug||'_invalid','material','common',false,
  '[{"locale":"hu","name":"QA anyag","description":"Teszt"},{"locale":"en","name":"QA material","description":"Test"}]','[]',null,null,null,0,null,null,
  '{"tier":9,"weapon_pips":0,"damage_types":["kinetic"],"resistances":{},"effects":[],"revision":1}');
  raise exception 'TEST: invalid item stats accepted';
 exception when check_violation then null;end;
 if not exists(select 1 from public.game_items where id=(item->>'id')::uuid and slug=name_slug) then raise exception 'Invalid item save did not roll back metadata';end if;
 select i.id,i.equip_slot,ic.weapon_pips into weapon from public.character_inventory inv join public.game_items i on i.id=inv.item_id join public.game_item_combat ic on ic.item_id=i.id where inv.character_id=cid and inv.quantity>0 and i.equip_owner='captain' and i.equip_slot in ('main_weapon','sidearm') order by case i.equip_slot when 'main_weapon' then 0 else 1 end limit 1;
 if weapon.id is not null then perform public.set_equipment(weapon.equip_slot,weapon.id,null);hero:=public.get_combat_state()->'hero';if (hero->>'weapon_pips')::int<>weapon.weapon_pips then raise exception '[W] ignored the actually equipped weapon';end if;end if;
 if not exists(select 1 from jsonb_array_elements(public.get_storage_inventory()->'items') stored_item where stored_item->'game_item_combat' is not null and stored_item->'game_item_combat'<>'null'::jsonb) then raise exception 'Item combat stats missing from storage snapshot';end if;
 select id into basic from public.game_powers where slug='basic_body';
 insert into public.game_enemies(slug,level,danger,attributes,defenses,health,weapon_pips,power_ids,is_published,reward_xp)
 values(name_slug,1,0,'{"body":0,"mind":0,"soul":0,"morale":0,"social":0}','{"body":0,"mind":0,"soul":0,"morale":0,"social":0}',1,1,array[basic],true,25) returning id into enemy;
 insert into public.game_combat_encounters(slug,location_id,enemy_id,name_hu,name_en,is_published)
 select name_slug,location_id,enemy,'QA harc','QA combat',true from public.character_positions where character_id=cid returning id into enc;
 select xp_total,character_progress.energy into xp,energy from public.character_progress where character_id=cid;
 run:=public.begin_combat(enc,start_request);
 begin
  update public.character_positions set location_id=location_id where character_id=cid; -- Players have no direct write privilege.
  raise exception 'TEST: direct position write accepted';
 exception when insufficient_privilege then null;end;
 if (select character_progress.energy from public.character_progress where character_id=cid)<>energy-2 then raise exception 'Start energy was not charged once';end if;
 if (public.start_combat(enc)->>'id') is distinct from (run->>'id') then raise exception 'Duplicate start created a second run';end if;
 request:=gen_random_uuid();after_run:=public.combat_action((run->>'id')::uuid,(run->>'revision')::int,request,basic,1);
 if public.combat_action((run->>'id')::uuid,(run->>'revision')::int,request,basic,1) is distinct from after_run then raise exception 'Request replay was not idempotent';end if;
 while after_run->>'status'='active' and i<10 loop
  i:=i+1;after_run:=public.combat_action((after_run->>'id')::uuid,(after_run->>'revision')::int,gen_random_uuid(),basic,1);
 end loop;
 if (public.begin_combat(enc,start_request)->>'id') is distinct from (run->>'id') then raise exception 'Completed start retry opened a new run';end if;
 if after_run->>'status'<>'victory' or not (after_run->>'rewarded')::boolean then raise exception 'Deterministic weak enemy did not complete';end if;
 if (select xp_total from public.character_progress where character_id=cid)<>xp+25 then raise exception 'Combat XP incorrect';end if;
 if not exists(select 1 from public.combat_events where run_id=(run->>'id')::uuid and event->>'type'='attack') or not exists(select 1 from public.combat_events where run_id=(run->>'id')::uuid and event->>'type'='defense') then raise exception 'Real roll events missing';end if;
 -- Simulations use the same engine while preserving ALL character progress.
 select to_jsonb(p) into hp from public.character_progress p where character_id=cid;
 sim:=public.simulate_combat(enemy,enemy);perform public.retreat_combat((sim->>'id')::uuid,(sim->>'revision')::int,gen_random_uuid());
 if (select to_jsonb(p) from public.character_progress p where character_id=cid) is distinct from hp then raise exception 'Simulation changed character progress';end if;
 -- Another player cannot read or command this run, even with its UUID.
 perform set_config('request.jwt.claim.sub',other_uid::text,true);
 if exists(select 1 from public.combat_runs where id=(run->>'id')::uuid) then raise exception 'Foreign run leaked through RLS';end if;
 begin perform public.combat_action((run->>'id')::uuid,1,gen_random_uuid(),basic,1);raise exception 'TEST: foreign run accepted';exception when raise_exception then if sqlerrm<>'Combat not found' then raise;end if;end;
 execute 'set local role postgres';
 if has_table_privilege('authenticated','public.combat_runs','update') or has_table_privilege('authenticated','public.character_combat_progress','update') or has_function_privilege('anon','public.combat_action(uuid,integer,uuid,uuid,integer)','execute') then raise exception 'Unsafe combat grants';end if;
end $test$;
rollback;
