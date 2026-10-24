import {readFile} from 'node:fs/promises';
import {setupRecruitDatabase} from './expedition-recruit-db-fixture.mjs';
export const bagMigration='supabase/migrations/20261024112854_expedition_actor_backpacks.sql';
export const partyMigration='supabase/migrations/20261024082637_expedition_party_loadouts.sql';
export async function setupPartyDatabase(db){
 await setupRecruitDatabase(db);
 await db.exec(`reset role;alter table game_items add column capacity_bonus int default 0;
 alter table game_starter_ships add column cargo int default 80;
 create table game_starter_ships_i18n(ship_id uuid,locale text,name text);
 update characters set starter_ship_id=(select id from game_starter_ships limit 1);
 create table character_ship_equipment(character_id uuid);
 create function private.ship_status(uuid) returns jsonb language sql as $$select '{"cargo":80}'::jsonb$$;
 drop function private.set_equipment_from_storage_impl(text,uuid,uuid,text);
 `);
 const fits=await readFile('supabase/migrations/20261017153500_m63_bidirectional_paperdoll_equipment.sql','utf8');
 await db.exec(fits.slice(fits.indexOf('create function private.equipment_item_fits'),fits.indexOf('CREATE OR REPLACE FUNCTION private.set_equipment_impl')));
 await db.exec(await readFile('supabase/migrations/20261020175313_separate_personal_and_ship_inventory.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261023130618_inventory_slot_positions.sql','utf8'));
 await db.exec(await readFile(partyMigration,'utf8'));
 await db.exec(await readFile(bagMigration,'utf8'));
 const cid=(await db.query('select id from characters limit 1')).rows[0].id;
 const companions=[];
 for(const name of ['Vaskéz','Nyx','Tessel','Mora']){
  const row=await db.query(`insert into private.expedition_actors(character_id,kind,name,species_id,class_id,attribute_pips,skill_bonus_pips)
   select id,'companion',$1,species_id,class_id,attribute_pips,skill_bonus_pips from characters where id=$2 returning id`,[name,cid]);companions.push(row.rows[0].id);
 }
 await db.exec(`grant usage on schema auth to anon;
 set role authenticated;`);
 return {cid,companions};
}
