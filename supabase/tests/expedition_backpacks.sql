-- Run after expedition_actor_backpacks. No player clones or retained QA data.
begin;
do $$declare uid uuid:=gen_random_uuid();cid uuid;sid uuid;kid uuid;ship uuid;bag uuid;items uuid[];begin
 insert into auth.users(id) values(uid);perform set_config('request.jwt.claim.sub',uid::text,true);
 select id into sid from public.game_species where is_published limit 1;
 select id into kid from public.game_classes where is_published limit 1;
 select id into ship from public.game_starter_ships where is_published limit 1;
 insert into public.characters(user_id,captain_name,species_id,class_id,starter_ship_id,attribute_pips,skill_bonus_pips)
 values(uid,'QA HV079',sid,kid,ship,'{"body":3,"mind":3,"soul":3,"morale":3,"social":3}','{}') returning id into cid;
 insert into public.character_progress(character_id) values(cid) on conflict do nothing;
 insert into private.expedition_actors(character_id,kind,name,species_id,class_id,attribute_pips,skill_bonus_pips)
 select cid,'companion','QA Bag '||n,sid,kid,'{"body":3,"mind":3,"soul":3,"morale":3,"social":3}','{}' from generate_series(1,2)n;
 perform set_config('qa.bags.captain',cid::text,true);
 perform set_config('qa.bags.a',(select id::text from private.expedition_actors where character_id=cid and name='QA Bag 1'),true);
 perform set_config('qa.bags.b',(select id::text from private.expedition_actors where character_id=cid and name='QA Bag 2'),true);
 select id into bag from public.game_items where is_published and equip_owner='captain' and equip_slot='backpack' and capacity_bonus>0 limit 1;
 assert bag is not null,'QA needs a published backpack';
 select array_agg(id) into items from (select id from public.game_items where is_published and id<>bag limit 7)x;
 assert cardinality(items)=7,'QA needs seven published item definitions';
 perform set_config('qa.bags.item',bag::text,true);perform set_config('qa.bags.supplies',items::text,true);
 perform set_config('qa.bags.captain_capacity',private.personal_inventory_capacity(cid)::text,true);
 insert into public.character_inventory(character_id,item_id,quantity) values(cid,bag,1) on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1;
 insert into public.character_inventory(character_id,item_id,quantity) select cid,x,2 from unnest(items)x on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+2;
 perform set_config('qa.bags.baseline',(select jsonb_object_agg(item_id::text,total)::text from (select item_id,sum(n) total from (select item_id,quantity n from public.character_inventory where character_id=cid union all select item_id,quantity from public.character_personal_inventory where character_id=cid union all select item_id,1 from public.character_equipment where character_id=cid)q group by item_id)x),true);
end $$;
set local role authenticated;
do $$declare cid uuid:=current_setting('qa.bags.captain')::uuid;a uuid:=current_setting('qa.bags.a')::uuid;b uuid:=current_setting('qa.bags.b')::uuid;
 backpack uuid:=current_setting('qa.bags.item')::uuid;items uuid[]:=current_setting('qa.bags.supplies')::uuid[];item uuid;d jsonb;cap int;begin
 d:=public.equip_expedition_actor_from(a,'backpack',backpack,'cargo',a);
 select (x->>'capacity')::int into cap from jsonb_array_elements(d->'personal_inventories')x where x->>'actor_id'=a::text;
 assert cap>6,'Companion backpack increases its own capacity';
 assert (select (x->>'capacity')::int=current_setting('qa.bags.captain_capacity')::int from jsonb_array_elements(d->'personal_inventories')x where x->>'actor_id'=cid::text),'Captain capacity unaffected';
 foreach item in array items loop d:=public.transfer_expedition_item(item,1,'cargo',cid,'personal',a);end loop;
 begin perform public.equip_expedition_actor_from(a,'backpack',null,'cargo',a);raise exception 'Expected capacity rejection';
 exception when others then if sqlerrm not like '%Personal inventory capacity exceeded%' then raise;end if;end;
 d:=public.transfer_expedition_item(items[1],1,'personal',a,'personal',b,4);
 assert (select jsonb_array_length(x->'items')=1 from jsonb_array_elements(d->'personal_inventories')x where x->>'actor_id'=b::text);
 d:=public.transfer_expedition_item(items[1],1,'personal',b,'personal',cid,3);
 d:=public.equip_expedition_actor_from(a,'backpack',null,'cargo',a);
 assert (select (x->>'capacity')::int=6 from jsonb_array_elements(d->'personal_inventories')x where x->>'actor_id'=a::text);
 begin perform public.transfer_expedition_item(items[1],1,'personal',gen_random_uuid(),'cargo',cid);raise exception 'Expected owner rejection';
 exception when insufficient_privilege then null;end;
 assert not has_function_privilege('authenticated','private.expedition_stock_delta(uuid,uuid,text,uuid,bigint)','execute');
 assert not has_function_privilege('anon','public.transfer_expedition_item(uuid,bigint,text,uuid,text,uuid,integer,text)','execute');
end $$;
reset role;
do $$declare cid uuid:=current_setting('qa.bags.captain')::uuid;items uuid[]:=current_setting('qa.bags.supplies')::uuid[];item uuid;total bigint;begin
 foreach item in array items loop
 select coalesce((select sum(quantity) from public.character_inventory where character_id=cid and item_id=item),0)
 +coalesce((select sum(quantity) from public.character_personal_inventory where character_id=cid and item_id=item),0)
 +(select count(*) from public.character_equipment where character_id=cid and item_id=item)
 +coalesce((select sum(quantity) from private.expedition_actor_inventory i join private.expedition_actors a on a.id=i.actor_id where a.character_id=cid and i.item_id=item),0) into total;
 assert total=(current_setting('qa.bags.baseline')::jsonb->>item::text)::bigint,'Item conservation failed';end loop;
 assert (select relrowsecurity from pg_class where oid='private.expedition_actor_inventory'::regclass);
end $$;
rollback;
select 'PASS: independent actor bags, capacity rollback, free actor/captain transfer, exact item balance and authenticated RPC permissions; QA data rolled back' result;
