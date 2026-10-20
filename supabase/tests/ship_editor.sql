-- Test-only users and ships. All mutations are rolled back.
begin;
do $test$
declare editor_id uuid:=gen_random_uuid();player_id uuid:=gen_random_uuid();viewer_id uuid:=gen_random_uuid();
 template jsonb;ship jsonb;slots jsonb;texts jsonb;result jsonb;sid uuid;cid uuid;species uuid;class_id uuid;skill uuid;broken jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values
 (editor_id,'ship-editor-'||editor_id||'@example.invalid','{}'),(player_id,'ship-editor-'||player_id||'@example.invalid','{}'),(viewer_id,'ship-editor-'||viewer_id||'@example.invalid','{}');
 update public.user_roles set role='editor' where user_id=editor_id;
 perform set_config('request.jwt.claim.sub',editor_id::text,true);
 execute 'set local role authenticated';
 select x into template from jsonb_array_elements(public.get_ship_editor_catalog()->'ships')x where x->>'slug'='sparrow';
 ship:=template||jsonb_build_object('slug','test_ship_'||replace(editor_id::text,'-',''),'hull',120);
 slots:=template->'slots';texts:=template->'translations';
 select jsonb_agg(case when x->>'crew_role'='pilot' then x||'{"min_aptitude":5}'::jsonb else x end) into slots from jsonb_array_elements(slots)x;
 result:=public.save_game_ship(null,ship,texts,slots,null);sid:=(result->>'id')::uuid;
 if(result->>'revision')::integer<>1 or not exists(select 1 from public.game_starter_ships where id=sid and hull=120) then raise exception 'Ship creation failed';end if;
 result:=public.save_game_ship(sid,ship||'{"hull":130}',texts,slots,1);
 if(result->>'revision')::integer<>2 then raise exception 'Ship update failed';end if;
 begin
  perform public.save_game_ship(sid,ship,texts,slots,1);
  raise exception 'TEST: stale save accepted';
 exception when serialization_failure then null;
 end;
 broken:=slots||jsonb_build_array(slots->0);
 begin
  perform public.save_game_ship(sid,ship,texts,broken,2);
  raise exception 'TEST: duplicate slot accepted';
 exception when raise_exception then if sqlerrm<>'Duplicate slots or crew roles' then raise;end if;end;
 if not exists(select 1 from public.game_starter_ships where id=sid and hull=130 and revision=2) then raise exception 'Failed save changed ship';end if;
 perform set_config('request.jwt.claim.sub',player_id::text,true);
 begin
  perform public.save_game_ship(sid,ship,texts,slots,2);
  raise exception 'TEST: normal player saved catalog';
 exception when insufficient_privilege then null;end;
 select id into species from public.game_species where is_published order by slug limit 1;
 select id into class_id from public.game_classes where is_published order by slug limit 1;
 select id into skill from public.game_skills order by slug limit 1;
 cid:=public.create_captain('Ship editor regression',species,class_id,sid,'{"body":6}',jsonb_build_object(skill::text,6));
 if not(public.get_ship_loadout()->'stats'->>'ready')::boolean then raise exception 'Custom starter not ready';end if;
 if not exists(select 1 from public.character_crew where character_id=cid and specialty='pilot' and aptitude=5) then raise exception 'Custom pilot aptitude ignored';end if;
 perform set_config('request.jwt.claim.sub',editor_id::text,true);
 select jsonb_agg(x) into broken from jsonb_array_elements(slots)x where x->>'slot_key'<>'weapon_1';
 begin
  perform public.save_game_ship(sid,ship,texts,broken,2);
  raise exception 'TEST: occupied module slot removed';
 exception when raise_exception then if sqlerrm<>'Occupied slots cannot be removed or made incompatible' then raise;end if;end;
 select jsonb_agg(x) into slots from jsonb_array_elements(slots)x where x->>'slot_key'<>'utility_1';
 result:=public.save_game_ship(sid,ship||'{"is_published":false}',texts,slots,2);
 if(result->>'revision')::integer<>3 then raise exception 'Empty slot removal/unpublish failed';end if;
 perform set_config('request.jwt.claim.sub',player_id::text,true);
 if not exists(select 1 from public.game_starter_ships where id=sid) or not exists(select 1 from public.game_ship_slots where ship_id=sid) then raise exception 'Owner lost access to unpublished ship';end if;
 if not(public.get_ship_loadout()->'stats'->>'ready')::boolean then raise exception 'Unpublishing disabled owned ship';end if;
 perform set_config('request.jwt.claim.sub',viewer_id::text,true);
 if exists(select 1 from public.game_starter_ships where id=sid) or exists(select 1 from public.game_ship_slots where ship_id=sid) then raise exception 'Draft ship leaked to another player';end if;
 begin
  perform public.get_ship_editor_catalog();raise exception 'TEST: editor catalog leaked';
 exception when insufficient_privilege then null;end;
 execute 'set local role postgres';
 if has_function_privilege('anon','public.save_game_ship(uuid,jsonb,jsonb,jsonb,integer)','execute') or has_table_privilege('authenticated','public.game_starter_ships','update') then raise exception 'Unsafe direct write grants';end if;
end $test$;
rollback;
