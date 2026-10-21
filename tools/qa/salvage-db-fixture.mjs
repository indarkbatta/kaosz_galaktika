import {readFile} from 'node:fs/promises';
import {setupCombatDatabase} from './combat-db-fixture.mjs';
export const salvageMigration='20261021195141_salvage_map_editor.sql';
export async function setupSalvageDatabase(db){
 await setupCombatDatabase(db);
 for(const file of ['20261021174408_m83_combat_state_and_commands.sql','20261021174740_m84_combat_editor_and_starter_content.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.exec(`create table game_skill_challenges(id uuid primary key default gen_random_uuid(),slug text,name_hu text,name_en text,is_published boolean);insert into game_skill_challenges(slug,name_hu,name_en,is_published) values('qa_airlock','Zsilip nyitása','Open airlock',true);`);
 await db.exec(await readFile('supabase/migrations/'+salvageMigration,'utf8'));
}
export function document(catalog){const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');const room=(n,x,kind)=>({id:id(n),x,y:2,width:4,height:3,name_hu:'Szoba '+n,name_en:'Room '+n,description_hu:'HU leírás',description_en:'EN description',kind,is_entry:n===1,challenge_id:kind==='challenge'?catalog.challenges[0].id:null,encounter_id:kind==='combat'?catalog.encounters[0].id:null,credits:kind==='loot'?42:0,loot:kind==='loot'?[{item_id:catalog.items[0].id,quantity:2}]:[]});return {slug:'qa_wreck',name_hu:'R-17 roncs',name_en:'R-17 wreck',description_hu:'Leírás',description_en:'Description',width:32,height:24,location_id:catalog.locations[0].id,is_published:true,rooms:[room(1,1,'empty'),room(2,7,'loot'),room(3,13,'challenge'),room(4,19,'combat')],connections:[{from_room_id:id(1),to_room_id:id(2)},{from_room_id:id(2),to_room_id:id(3)},{from_room_id:id(3),to_room_id:id(4)}]};}
