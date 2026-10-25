-- Run after expedition_party_loadouts in a test transaction. No real player clones.
begin;
do $$declare uid uuid:=gen_random_uuid();cid uuid;sid uuid;kid uuid;ship uuid;aid uuid;item uuid;begin
 insert into auth.users(id) values(uid);perform set_config('request.jwt.claim.sub',uid::text,true);
 select id into sid from public.game_species where is_published limit 1;
 select id into kid from public.game_classes where is_published limit 1;
 select id into ship from public.game_starter_ships where is_published limit 1;
 insert into public.characters(user_id,captain_name,species_id,class_id,starter_ship_id,attribute_pips,skill_bonus_pips)
 values(uid,'QA HV070',sid,kid,ship,'{"body":3,"mind":3,"soul":3,"morale":3,"social":3}','{}') returning id into cid;
 insert into public.character_progress(character_id) values(cid) on conflict do nothing;
 insert into private.expedition_actors(character_id,kind,name,species_id,class_id,attribute_pips,skill_bonus_pips)
 select cid,'companion','QA Társ '||n,sid,kid,'{"body":3,"mind":3,"soul":3,"morale":3,"social":3}','{}' from generate_series(1,3)n;
 perform set_config('qa.hv070.captain',cid::text,true);
 perform set_config('qa.hv070.actors',(select array_agg(id order by kind,id)::text from private.expedition_actors where character_id=cid),true);
 select id into item from public.game_items where is_published and equip_owner='captain' and equip_slot='main_weapon' limit 1;
 assert item is not null,'Test needs a published main weapon';
 insert into public.character_inventory(character_id,item_id,quantity) values(cid,item,1);
 perform set_config('qa.hv070.item',item::text,true);
end $$;
set local role authenticated;
do $$declare d jsonb;cid uuid:=current_setting('qa.hv070.captain')::uuid;aid uuid;item uuid:=current_setting('qa.hv070.item')::uuid;begin
 d:=public.get_expedition_team_loadout();assert jsonb_array_length(d->'actors')=4;
 d:=public.save_expedition_party(current_setting('qa.hv070.actors')::uuid[],0);assert jsonb_array_length(d->'party')=4;
 aid:=(d->'actors'->1->>'id')::uuid;
 d:=public.save_expedition_actor_powers(aid,'{}');assert d->'actors'->1->'prepared'='[]'::jsonb;
 d:=public.equip_expedition_actor(aid,'main_weapon',item,'cargo');
 assert exists(select 1 from jsonb_array_elements(d->'equipped')e where e->>'crew_id'=aid::text and e->>'item_id'=item::text);
 d:=public.move_expedition_equipment(aid,'main_weapon',cid,'main_weapon');
 d:=public.equip_expedition_actor(cid,'main_weapon',null,'personal',3);
 assert exists(select 1 from jsonb_array_elements(d->'personal')e where e->>'item_id'=item::text and (e->>'quantity')::int=1 and (e->>'position')::int=3);
 assert not has_function_privilege('authenticated','public.save_expedition_powers(uuid[])','execute');
 assert not has_function_privilege('authenticated','private.expedition_write_gear(uuid,text,uuid)','execute');
 assert not has_function_privilege('anon','public.get_expedition_team_loadout()','execute');
end $$;
reset role;
do $$declare cid uuid:=current_setting('qa.hv070.captain')::uuid;item uuid:=current_setting('qa.hv070.item')::uuid;total bigint;begin
 select coalesce((select sum(quantity) from public.character_inventory where character_id=cid and item_id=item),0)
 +coalesce((select sum(quantity) from public.character_personal_inventory where character_id=cid and item_id=item),0)
 +(select count(*) from public.character_equipment where character_id=cid and item_id=item)
 +(select count(*) from private.expedition_actor_equipment e join private.expedition_actors a on a.id=e.actor_id where a.character_id=cid and e.item_id=item) into total;
 assert total=1,'Shared item conservation failed';
end $$;
rollback;
select 'PASS: authenticated party/powers/storage/gear round trip and exact grants; all QA data rolled back' result;
