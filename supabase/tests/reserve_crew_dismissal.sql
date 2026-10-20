-- Disposable fixture only; transaction always rolls back.
begin;
do $test$
declare uid uuid:=gen_random_uuid();cid uuid;mid uuid;sid uuid;cl uuid;ship uuid;skill uuid;armor uuid;name text:='Dismiss fixture';
begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'dismiss-fixture-'||uid||'@example.invalid','{}');
 select id into sid from public.game_species where is_published limit 1;select id into cl from public.game_classes where is_published limit 1;select id into ship from public.game_starter_ships where slug='sparrow';select id into skill from public.game_skills limit 1;
 perform set_config('request.jwt.claim.sub',uid::text,true);execute 'set local role authenticated';
 cid:=public.create_captain('Dismiss regression',sid,cl,ship,'{"body":6}',jsonb_build_object(skill::text,6));
 execute 'set local role postgres';
 insert into public.character_crew(character_id,position,name,specialty,aptitude) values(cid,'medic',name,'medic',2) returning id into mid;
 select id into armor from public.game_items where equip_owner='crew' and equip_slot='armor' limit 1;
 insert into public.character_inventory(character_id,item_id,quantity) values(cid,armor,1) on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1;
 execute 'set local role authenticated';
 perform public.set_equipment_from_storage('armor',armor,mid,'cargo');
 begin perform public.dismiss_reserve_crew(mid,'WRONG');raise exception 'TEST: missing confirmation accepted';exception when raise_exception then if sqlerrm<>'Crew dismissal confirmation required' then raise;end if;end;
 if not exists(select 1 from public.character_crew where id=mid) then raise exception 'Rejected dismissal lost member';end if;
 perform public.dismiss_reserve_crew(mid,name);
 if exists(select 1 from public.character_crew where id=mid) then raise exception 'Dismissal retained member';end if;
 if not exists(select 1 from public.character_inventory where character_id=cid and item_id=armor and quantity>=1) then raise exception 'Dismissal lost equipment';end if;
 execute 'set local role postgres';set constraints all immediate;
end $test$;
rollback;
