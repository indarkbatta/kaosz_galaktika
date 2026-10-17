
insert into public.game_items(slug,rarity,category,equip_owner,equip_slot,capacity_bonus) values
('captain_rifle','uncommon','equipment','captain','main_weapon',0),
('captain_sidearm','common','equipment','captain','sidearm',0),
('captain_vest','common','equipment','captain','body_armor',0),
('captain_toolkit','common','equipment','captain','utility1',0),
('captain_medkit','common','equipment','captain','utility2',0),
('captain_belt','common','equipment','captain','belt',0),
('captain_backpack','uncommon','equipment','captain','backpack',12),
('captain_relic','rare','equipment','captain','relic',0),
('crew_armor','common','equipment','crew','armor',0),
('crew_weapon','common','equipment','crew','weapon',0),
('crew_utility','common','equipment','crew','utility',0)
on conflict(slug) do nothing;
insert into public.game_items_i18n(item_id,locale,name,description)
select i.id,v.locale,v.name,v.description from (values
('captain_rifle','hu','Viharpuska','Expedíciós főfegyver.'),('captain_rifle','en','Storm Rifle','Expedition main weapon.'),
('captain_sidearm','hu','Szolgálati pisztoly','Megbízható másodlagos fegyver.'),('captain_sidearm','en','Service Pistol','Reliable sidearm.'),
('captain_vest','hu','Kompozit páncél','Rétegelt ballisztikai védelem.'),('captain_vest','en','Composite Armor','Layered ballistic protection.'),
('captain_toolkit','hu','Műszaki modul','Terepi műszer.'),('captain_toolkit','en','Engineering Module','Field maintenance device.'),
('captain_medkit','hu','Harctéri injektor','Orvosi segédeszköz.'),('captain_medkit','en','Field Injector','Emergency medical utility.'),
('captain_belt','hu','Mágneses öv','Moduláris felszerelésrögzítő.'),('captain_belt','en','Magnetic Belt','Equipment carrier.'),
('captain_backpack','hu','Expedíciós hátizsák','További 12 inventárhely.'),('captain_backpack','en','Expedition Backpack','Adds 12 inventory slots.'),
('captain_relic','hu','Üresség relikviája','Ősi tértorzító ereklye.'),('captain_relic','en','Void Relic','Ancient space-warping artifact.'),
('crew_armor','hu','Legénységi páncél','Kifejezetten legénységi páncélzat.'),('crew_armor','en','Crew Armor','Crew-only armor.'),
('crew_weapon','hu','Legénységi karabély','Legénységi fegyverzet.'),('crew_weapon','en','Crew Carbine','Crew-only weapon.'),
('crew_utility','hu','Legénységi műszer','Legénységi utility modul.'),('crew_utility','en','Crew Device','Crew-only utility module.')
) v(slug,locale,name,description) join public.game_items i on i.slug=v.slug
on conflict(item_id,locale) do nothing;
-- A small initial equipment stock, even for existing characters, to make UI testable.
insert into public.character_inventory(character_id,item_id,quantity)
select c.id,i.id,1 from public.characters c cross join public.game_items i
where i.slug in ('captain_sidearm','captain_vest','captain_backpack','crew_armor','crew_weapon','crew_utility')
on conflict(character_id,item_id) do nothing;
create function private.grant_starter_gear() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.character_inventory(character_id,item_id,quantity)
 select new.id,id,1 from public.game_items
 where slug in ('captain_sidearm','captain_vest','captain_backpack','crew_armor','crew_weapon','crew_utility')
 on conflict do nothing;
 return new;
end $$;
create trigger grant_equipment_on_character after insert on public.characters
 for each row execute function private.grant_starter_gear();
-- A crafted field scanner may be equipped as Utility 1.
update public.game_items set equip_owner='captain',equip_slot='utility1' where slug='field_scanner';
