-- Real linked PostgreSQL; all temporary users and content roll back.
begin;
do $test$
declare uid uuid:=gen_random_uuid();other_uid uuid:=gen_random_uuid();first_room uuid:=gen_random_uuid();loot_room uuid:=gen_random_uuid();challenge_room uuid:=gen_random_uuid();combat_room uuid:=gen_random_uuid();challenge uuid;encounter uuid;item uuid;doc jsonb;saved jsonb;reread jsonb;before_doc jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'salvage-'||uid||'@example.invalid','{}'),(other_uid,'salvage-'||other_uid||'@example.invalid','{}');
 update public.user_roles set role='editor' where user_id=uid;
 select id into challenge from public.game_skill_challenges where is_published limit 1;select id into encounter from public.game_combat_encounters where is_published limit 1;select id into item from public.game_items where is_published limit 1;
 if challenge is null or encounter is null or item is null then raise exception 'Test requires existing published challenge, encounter and item';end if;
 doc:=jsonb_build_object('slug','qa_salvage_'||replace(uid::text,'-',''),'name_hu','QA roncs','name_en','QA wreck','width',64,'height',48,'background_image','hatarvilag/worlds/qa-wreck.webp','background_opacity',0.42,'is_published',true,
 'rooms',jsonb_build_array(
 jsonb_build_object('id',first_room,'x',1,'y',2,'width',4,'height',3,'name_hu','Beszállás','name_en','Entry','kind','empty','is_entry',true,'credits',0,'loot','[]'::jsonb),
 jsonb_build_object('id',loot_room,'x',7,'y',2,'width',4,'height',3,'name_hu','Raktár','name_en','Cargo','kind','loot','is_entry',false,'credits',50,'loot',jsonb_build_array(jsonb_build_object('item_id',item,'quantity',2))),
 jsonb_build_object('id',challenge_room,'x',13,'y',2,'width',4,'height',3,'name_hu','Zsilip','name_en','Airlock','kind','challenge','is_entry',false,'credits',0,'challenge_id',challenge,'loot','[]'::jsonb),
 jsonb_build_object('id',combat_room,'x',19,'y',2,'width',4,'height',3,'name_hu','Híd','name_en','Bridge','kind','combat','is_entry',false,'credits',0,'encounter_id',encounter,'loot','[]'::jsonb)),
 'connections',jsonb_build_array(jsonb_build_object('from_room_id',first_room,'to_room_id',loot_room),jsonb_build_object('from_room_id',loot_room,'to_room_id',challenge_room),jsonb_build_object('from_room_id',challenge_room,'to_room_id',combat_room)));
 perform set_config('request.jwt.claim.sub',uid::text,true);execute 'set local role authenticated';
 saved:=public.save_salvage_map(null,null,doc);
 select value into reread from jsonb_array_elements(public.get_salvage_editor_catalog()->'maps') where value->>'id'=saved->>'id';
 if jsonb_array_length(reread->'rooms')<>4 or jsonb_array_length(reread->'connections')<>3 then raise exception 'Map graph did not persist';end if;
 if not exists(select 1 from jsonb_array_elements(reread->'rooms') r where r->>'kind'='loot' and (r->>'credits')::int=50 and (r->'loot'->0->>'quantity')::int=2) then raise exception 'Room loot did not persist';end if;
 if reread->>'background_image'<>'hatarvilag/worlds/qa-wreck.webp' or (reread->>'background_opacity')::numeric<>0.42 then raise exception 'Background did not persist';end if;
 before_doc:=reread;
 begin perform public.save_salvage_map((saved->>'id')::uuid,1,jsonb_set(doc,'{rooms,1,x}','2'));raise exception 'TEST overlap accepted';exception when raise_exception then if sqlerrm<>'Rooms overlap' then raise;end if;end;
 select value into reread from jsonb_array_elements(public.get_salvage_editor_catalog()->'maps') where value->>'id'=saved->>'id';if reread is distinct from before_doc then raise exception 'Invalid map save failed to roll back';end if;
 saved:=public.save_salvage_map((saved->>'id')::uuid,1,doc);
 begin perform public.save_salvage_map((saved->>'id')::uuid,1,doc);raise exception 'TEST stale save accepted';exception when serialization_failure then null;end;
 begin update public.game_salvage_maps set slug=slug where id=(saved->>'id')::uuid;raise exception 'TEST direct mutation accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',other_uid::text,true);
 if exists(select 1 from public.game_salvage_maps) then raise exception 'Player read editor maps';end if;
 begin perform public.get_salvage_editor_catalog();raise exception 'TEST player catalog accepted';exception when insufficient_privilege then null;end;
 begin perform public.save_salvage_map(null,null,doc);raise exception 'TEST player save accepted';exception when insufficient_privilege then null;end;
 execute 'set local role postgres';
 if has_function_privilege('anon','public.save_salvage_map(uuid,integer,jsonb)','execute') or has_table_privilege('authenticated','public.game_salvage_rooms','insert') then raise exception 'Unsafe salvage grants';end if;
end $test$;
rollback;
