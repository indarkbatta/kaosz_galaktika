-- HV-069 linked integration. A new QA account calls the real player RPCs.
-- All writes are rolled back. Moving the QA captain to the station is fixture
-- setup; travel and an actual browser login are deliberately separate coverage.
begin;
do $$declare uid uuid:=gen_random_uuid();t private.expedition_templates%rowtype;begin
 insert into auth.users(id,email,raw_user_meta_data) values(uid,'hv069-'||uid||'@example.invalid','{}');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 select * into strict t from private.expedition_templates where is_published order by (species_node is not null and class_node is not null) desc,slug limit 1;
 perform set_config('qa.fresh.template',to_jsonb(t)::text,true);
 perform set_config('qa.fresh.ship',(select id::text from public.game_starter_ships where is_published and slug='sparrow'),true);
 perform set_config('qa.fresh.catalogs',jsonb_build_object('items',(select count(*) from public.game_items),'locations',(select count(*) from public.game_locations),'templates',(select count(*) from private.expedition_templates),'layouts',(select count(*) from private.ui_layouts))::text,true);
end $$;
set local role authenticated;
do $$declare t jsonb:=current_setting('qa.fresh.template')::jsonb;cid uuid;d jsonb;begin
 cid:=public.create_captain_with_talents('QA HV069',(t->>'species_id')::uuid,(t->>'class_id')::uuid,current_setting('qa.fresh.ship')::uuid,t->'attribute_points',t->'skill_points',(t->>'species_node')::uuid,(t->>'class_node')::uuid);
 perform set_config('qa.fresh.captain',cid::text,true);
 d:=public.get_ship_loadout();assert (d->'stats'->>'ready')::boolean,'New starter ship must be ready';
 assert (select count(*)=2 from public.character_crew where character_id=cid),'Two starter service crew';
 assert (select count(*)=2 from public.character_ship_crew where character_id=cid),'Starter crew assigned';
 d:=public.get_expedition_team_loadout();assert jsonb_array_length(d->'actors')=1,'No automatic expedition companions';
 assert d->'party'=jsonb_build_array(cid),'New party contains captain only';
 assert (select count(*) from public.character_tree_nodes where character_id=cid)=((t->>'species_node' is not null)::int+(t->>'class_node' is not null)::int),'Real starting talent selections persisted';
end $$;
reset role;
-- Only the new, transaction-local QA character is positioned for recruitment.
update public.character_positions set location_id=(select id from public.game_locations where slug='frontier_station') where character_id=current_setting('qa.fresh.captain')::uuid;
set local role authenticated;
do $$declare cid uuid:=current_setting('qa.fresh.captain')::uuid;offers jsonb;offer jsonb;r jsonb;again jsonb;req uuid;party uuid[];a uuid;sheet jsonb;chosen uuid[];d jsonb;
 before_energy int;cost int:=0;weapon_slot text;weap uuid;backpack uuid;supply uuid;prev uuid;cap int;begin
 select energy into before_energy from public.character_progress where character_id=cid;
 offers:=public.get_expedition_recruitment()->'offers';assert jsonb_array_length(offers)>=3,'Three published recruitable companions required';
 party:=array[cid];
 for offer in select value from jsonb_array_elements(offers) where not (value->>'owned')::boolean limit 3 loop
  req:=gen_random_uuid();r:=public.hire_expedition_companion((offer->>'id')::uuid,(offer->>'revision')::int,req);
  again:=public.hire_expedition_companion((offer->>'id')::uuid,(offer->>'revision')::int,req);
  assert r->>'id'=again->>'id','Hire retry returns same actor';
  party:=array_append(party,(r->>'id')::uuid);cost:=cost+(offer->>'hire_energy')::int;
 end loop;
 assert cardinality(party)=4,'Captain + three companions';
 assert (select energy from public.character_progress where character_id=cid)=before_energy-cost,'No repeated energy debit';
 assert (select count(*)=2 from public.character_crew where character_id=cid),'Recruitment does not copy service crew';
 assert (public.get_ship_loadout()->'stats'->>'ready')::boolean,'Recruitment preserves ship readiness';
 d:=public.save_expedition_party(array[party[4],party[1],party[2],party[3]],0);
 assert public.get_expedition_team_loadout()->'party'=d->'party','Party persists and captain can stand behind a companion';
 foreach a in array party loop
  sheet:=public.get_expedition_actor(a);
  select coalesce(array_agg((p->>'id')::uuid order by p->>'slug'),'{}') into chosen from (select p from jsonb_array_elements(sheet->'powers')p where p->>'kind'='active' order by p->>'slug' limit 5)x;
  perform public.save_expedition_actor_powers(a,chosen);
  assert (select x->'prepared'=to_jsonb(chosen) from jsonb_array_elements(public.get_expedition_team_loadout()->'actors')x where x->>'id'=a::text),'Per-actor prepared powers persist';
 end loop;
 select i.item_id,g.equip_slot into strict weap,weapon_slot from public.character_inventory i join public.game_items g on g.id=i.item_id where i.character_id=cid and i.quantity>0 and g.equip_slot in ('main_weapon','sidearm') order by g.slug limit 1;
 select i.item_id into strict backpack from public.character_inventory i join public.game_items g on g.id=i.item_id where i.character_id=cid and i.quantity>0 and g.equip_slot='backpack' and g.capacity_bonus>0 order by g.slug limit 1;
 select capacity_bonus into cap from public.game_items where id=backpack;
 select item_id into strict supply from public.character_inventory where character_id=cid and quantity>0 and item_id not in(weap,backpack) limit 1;
 perform set_config('qa.fresh.weapon',weap::text,true);
 perform set_config('qa.fresh.weapon_initial',(select quantity::text from public.character_inventory where character_id=cid and item_id=weap),true);
 perform public.equip_expedition_actor_from(party[1],weapon_slot,weap,'cargo',party[1]);
 perform public.equip_expedition_actor_from(party[1],'backpack',backpack,'cargo',party[1]);
 prev:=party[1];
 foreach a in array party loop
  if a<>prev then
   perform public.move_expedition_equipment(prev,weapon_slot,a,weapon_slot);
   perform public.move_expedition_equipment(prev,'backpack',a,'backpack');
  end if;
  d:=public.get_expedition_storage();
  assert (select (x->>'capacity')::int=6+cap from jsonb_array_elements(d->'personal_inventories')x where x->>'actor_id'=a::text),'Each actor uses the backpack capacity';
  assert (public.get_expedition_actor(a)->>'has_weapon')::boolean,'Each actor evaluates the equipped weapon';
  prev:=a;
 end loop;
 perform public.transfer_expedition_item(supply,1,'cargo',cid,'personal',party[1],3);
 prev:=party[1];
 foreach a in array party loop
  if a<>prev then perform public.transfer_expedition_item(supply,1,'personal',prev,'personal',a,3);end if;
  assert exists(select 1 from jsonb_array_elements(public.get_expedition_storage()->'personal_inventories')x cross join lateral jsonb_array_elements(x->'items')i where x->>'actor_id'=a::text and i->>'item_id'=supply::text),'Free item transfer to every actor';
  prev:=a;
 end loop;
 begin perform public.set_equipment_from_storage('weapon',weap,(select id from public.character_crew where character_id=cid limit 1),'cargo');raise exception 'Service equipment accepted';
 exception when raise_exception then if sqlerrm not like '%Service crew cannot equip%' then raise;end if;end;
end $$;
reset role;
do $$declare cid uuid:=current_setting('qa.fresh.captain')::uuid;weapon uuid:=current_setting('qa.fresh.weapon')::uuid;total bigint;before jsonb:=current_setting('qa.fresh.catalogs')::jsonb;begin
 select coalesce((select sum(quantity) from public.character_inventory where character_id=cid and item_id=weapon),0)+(select count(*) from public.character_equipment where character_id=cid and item_id=weapon)+(select count(*) from private.expedition_actor_equipment e join private.expedition_actors a on a.id=e.actor_id where a.character_id=cid and e.item_id=weapon) into total;
 assert total=current_setting('qa.fresh.weapon_initial')::bigint,'One physical weapon is never copied';
 assert (select count(*)=4 from private.expedition_actors where character_id=cid),'Exactly four full actors';
 assert before=jsonb_build_object('items',(select count(*) from public.game_items),'locations',(select count(*) from public.game_locations),'templates',(select count(*) from private.expedition_templates),'layouts',(select count(*) from private.ui_layouts)),'Catalogs, world and layouts preserved';
end $$;
rollback;
select 'PASS HV-069 linked RPC integration: real captain creation/starting talents, ready ship/two service crew, three idempotent hires/energy, four positions, per-actor powers/gear/bags, free transfer and item balance; QA account/state rolled back. Station positioning is fixture setup; this is not a browser-auth/travel test.' result;
