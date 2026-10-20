-- Starter module catalog and craftable upgrades.
insert into public.game_items(slug,category,rarity,is_published) values('ship_drive_standard','equipment','common',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'engine',1,3,0,0,0,0,0,0,true from public.game_items where slug='ship_drive_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Határvidéki hajtómű','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_drive_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Frontier drive','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_drive_standard';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_drive_standard' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,1 from public.game_items a cross join public.game_items b where a.slug='ship_drive_standard' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_reactor_standard','equipment','common',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'reactor',1,0,24,0,0,0,0,0,true from public.game_items where slug='ship_reactor_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Kompakt reaktor','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_reactor_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Compact reactor','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_reactor_standard';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_reactor_standard' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,1 from public.game_items a cross join public.game_items b where a.slug='ship_reactor_standard' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_shield_standard','equipment','common',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'shield',1,2,0,0,20,0,0,0,true from public.game_items where slug='ship_shield_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Deflektorpajzs','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_shield_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Deflector shield','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_shield_standard';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_shield_standard' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,1 from public.game_items a cross join public.game_items b where a.slug='ship_shield_standard' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_weapon_standard','equipment','common',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'weapon',1,2,0,0,0,6,0,0,true from public.game_items where slug='ship_weapon_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Pulzuslöveg','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_weapon_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Pulse cannon','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_weapon_standard';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_weapon_standard' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,1 from public.game_items a cross join public.game_items b where a.slug='ship_weapon_standard' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_hull_standard','equipment','common',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'hull',1,0,0,0,0,0,0,0,true from public.game_items where slug='ship_hull_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Alap burkolat','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_hull_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Standard hull plating','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_hull_standard';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_hull_standard' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,1 from public.game_items a cross join public.game_items b where a.slug='ship_hull_standard' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_sensor_standard','equipment','common',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'sensor',1,1,0,0,0,0,0,0,true from public.game_items where slug='ship_sensor_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Navigációs szenzor','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_sensor_standard';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Navigation sensor','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_sensor_standard';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_sensor_standard' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,1 from public.game_items a cross join public.game_items b where a.slug='ship_sensor_standard' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_cargo_pod','equipment','uncommon',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'utility',1,1,0,0,0,0,0,20,false from public.game_items where slug='ship_cargo_pod';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Külső raktérmodul','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_cargo_pod';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','External cargo pod','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_cargo_pod';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,6 from public.game_items a cross join public.game_items b where a.slug='ship_cargo_pod' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_cargo_pod' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_drive_boost','equipment','uncommon',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'engine',2,6,0,0,0,0,3,0,false from public.game_items where slug='ship_drive_boost';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Túltöltött hajtómű','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_drive_boost';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Boosted drive','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_drive_boost';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,6 from public.game_items a cross join public.game_items b where a.slug='ship_drive_boost' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_drive_boost' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_shield_heavy','equipment','uncommon',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'shield',2,5,0,0,45,0,0,0,false from public.game_items where slug='ship_shield_heavy';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Nehéz pajzsgenerátor','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_shield_heavy';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Heavy shield generator','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_shield_heavy';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,6 from public.game_items a cross join public.game_items b where a.slug='ship_shield_heavy' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_shield_heavy' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_weapon_heavy','equipment','uncommon',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'weapon',2,5,0,0,0,15,0,0,false from public.game_items where slug='ship_weapon_heavy';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Nehéz sugárágyú','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_weapon_heavy';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Heavy beam cannon','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_weapon_heavy';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,6 from public.game_items a cross join public.game_items b where a.slug='ship_weapon_heavy' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_weapon_heavy' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_reactor_high','equipment','uncommon',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'reactor',2,0,40,0,0,0,0,0,false from public.game_items where slug='ship_reactor_high';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Nagy teljesítményű reaktor','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_reactor_high';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','High-output reactor','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_reactor_high';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,6 from public.game_items a cross join public.game_items b where a.slug='ship_reactor_high' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_reactor_high' and b.slug='circuit_core';
insert into public.game_items(slug,category,rarity,is_published) values('ship_hull_reinforced','equipment','uncommon',true);
insert into public.game_ship_modules(item_id,module_kind,size,power_draw,power_output,hull_bonus,shield_bonus,damage_bonus,speed_bonus,cargo_bonus,is_starter) select id,'hull',2,0,0,40,0,0,-1,0,false from public.game_items where slug='ship_hull_reinforced';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'hu','Megerősített burkolat','Űrhajómodul. Csak megfelelő típusú és méretű hajóslotba szerelhető.' from public.game_items where slug='ship_hull_reinforced';
insert into public.game_items_i18n(item_id,locale,name,description) select id,'en','Reinforced hull plating','Starship module. Requires a compatible slot type and size.' from public.game_items where slug='ship_hull_reinforced';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,6 from public.game_items a cross join public.game_items b where a.slug='ship_hull_reinforced' and b.slug='alloy_scrap';
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity) select a.id,b.id,3 from public.game_items a cross join public.game_items b where a.slug='ship_hull_reinforced' and b.slug='circuit_core';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'engine_1','module','engine',1,true,1,'Hajtómű','Engine' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'reactor_1','module','reactor',1,true,2,'Reaktor','Reactor' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'hull_1','module','hull',1,true,3,'Burkolat','Hull' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'shield_1','module','shield',1,false,4,'Pajzs','Shield' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'weapon_1','module','weapon',1,false,5,'Fegyverzet 1','Weapon 1' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'weapon_2','module','weapon',1,false,6,'Fegyverzet 2','Weapon 2' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'sensor_1','module','sensor',1,false,7,'Szenzor','Sensor' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'utility_1','module','utility',1,false,8,'Segédrendszer','Utility' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_pilot','crew','pilot',2,true,9,'Pilóta','Pilot' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_navigator','crew','navigator',2,false,10,'Navigátor','Navigator' from public.game_starter_ships where slug='sparrow';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'engine_1','module','engine',2,true,1,'Hajtómű','Engine' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'reactor_1','module','reactor',2,true,2,'Reaktor','Reactor' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'hull_1','module','hull',2,true,3,'Burkolat','Hull' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'shield_1','module','shield',2,false,4,'Pajzs','Shield' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'weapon_1','module','weapon',2,false,5,'Fegyverzet','Weapon' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'sensor_1','module','sensor',2,false,6,'Szenzor','Sensor' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'utility_1','module','utility',2,false,7,'Segédrendszer 1','Utility 1' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'utility_2','module','utility',2,false,8,'Segédrendszer 2','Utility 2' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_pilot','crew','pilot',2,true,9,'Pilóta','Pilot' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_navigator','crew','navigator',2,true,10,'Navigátor','Navigator' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_engineer','crew','engineer',2,false,11,'Gépész','Engineer' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_medic','crew','medic',2,false,12,'Orvos','Medic' from public.game_starter_ships where slug='vagabond';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'engine_1','module','engine',3,true,1,'Hajtómű 1','Engine 1' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'engine_2','module','engine',3,true,2,'Hajtómű 2','Engine 2' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'reactor_1','module','reactor',3,true,3,'Reaktor','Reactor' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'hull_1','module','hull',3,true,4,'Burkolat','Hull' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'shield_1','module','shield',3,false,5,'Pajzs 1','Shield 1' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'shield_2','module','shield',3,false,6,'Pajzs 2','Shield 2' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'weapon_1','module','weapon',3,false,7,'Fegyverzet 1','Weapon 1' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'weapon_2','module','weapon',3,false,8,'Fegyverzet 2','Weapon 2' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'weapon_3','module','weapon',3,false,9,'Fegyverzet 3','Weapon 3' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'sensor_1','module','sensor',3,false,10,'Szenzor','Sensor' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,module_kind,size,required,sort_order,name_hu,name_en) select id,'utility_1','module','utility',3,false,11,'Segédrendszer','Utility' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_pilot','crew','pilot',2,true,12,'Pilóta','Pilot' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_navigator','crew','navigator',2,true,13,'Navigátor','Navigator' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_engineer','crew','engineer',2,true,14,'Gépész','Engineer' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_security','crew','security',2,false,15,'Biztonsági tiszt','Security' from public.game_starter_ships where slug='bastion';
insert into public.game_ship_slots(ship_id,slot_key,kind,crew_role,min_aptitude,required,sort_order,name_hu,name_en) select id,'crew_medic','crew','medic',2,false,16,'Orvos','Medic' from public.game_starter_ships where slug='bastion';

-- Backfill once without touching player cargo or replacing existing crew.
insert into public.character_ship_equipment(character_id,ship_id,slot_key,item_id)
select c.id,c.starter_ship_id,s.slot_key,m.item_id from public.characters c
join public.game_ship_slots s on s.ship_id=c.starter_ship_id and s.kind='module'
join public.game_ship_modules m on m.module_kind=s.module_kind and m.is_starter and m.size<=s.size
on conflict do nothing;
insert into public.character_crew(character_id,position,name,specialty,aptitude)
select c.id,s.crew_role,s.name_en,s.crew_role,s.min_aptitude from public.characters c
join public.game_ship_slots s on s.ship_id=c.starter_ship_id and s.kind='crew' and s.required
where not exists(select 1 from public.character_crew m where m.character_id=c.id and m.position=s.crew_role)
on conflict(character_id,position) do nothing;
insert into public.character_ship_crew(character_id,ship_id,slot_key,crew_id)
select c.id,c.starter_ship_id,s.slot_key,m.id from public.characters c
join public.game_ship_slots s on s.ship_id=c.starter_ship_id and s.kind='crew'
join public.character_crew m on m.character_id=c.id and m.specialty=s.crew_role and m.aptitude>=s.min_aptitude
where not exists(select 1 from public.character_ship_crew a where a.character_id=c.id and a.crew_id=m.id)
on conflict do nothing;

-- Travel checks the same authoritative loadout and uses effective speed for energy cost.
do $patch$
declare d text; anchor text:=E' select * into v_position from public.character_positions where character_id=v_id for update;';
 cost_anchor text:=E' if v_cost is null then raise exception ''No direct route to destination'' using errcode=''P0001'';end if;';
begin
 d:=pg_get_functiondef('private.travel_to_location_impl(uuid)'::regprocedure);
 if strpos(d,anchor)=0 or strpos(d,cost_anchor)=0 then raise exception 'Unexpected travel implementation; refusing overwrite';end if;
 d:=replace(d,anchor,E' if not coalesce((private.ship_status(v_id)->>''ready'')::boolean,false) then raise exception ''Ship is not ready: check required systems, crew and reactor power'';end if;\n'||anchor);
 d:=replace(d,cost_anchor,cost_anchor||E'\n v_cost:=greatest(1,ceil(v_cost::numeric * (private.ship_status(v_id)->>''base_speed'')::numeric / (private.ship_status(v_id)->>''speed'')::numeric)::integer);');
 execute d;
end $patch$;
notify pgrst,'reload schema';
