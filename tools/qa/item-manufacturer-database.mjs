import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {resolve} from 'node:path';
import {setupManufacturerDatabase,saveManufacturer} from './item-manufacturer-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
try{
 await setupManufacturerDatabase(db);const q=async(s,args)=>(await db.query(s,args)).rows;
 const factions=await q('select * from game_factions order by slug'),plants=await q('select * from game_faction_companies');
 const first=plants.find(p=>p.faction_id===factions[0].id),second=plants.find(p=>p.faction_id===factions[1].id),item=(await q('select * from game_items'))[0];
 const a={p_id:item.id,p_slug:item.slug,p_category:'material',p_rarity:'common',p_published:true,p_translations:[],p_ingredients:[],p_image_path:null,p_equip_owner:null,p_equip_slot:null,p_bonus:0,p_manufacturer_faction_id:first.faction_id,p_manufacturer_company_id:first.id};
 await saveManufacturer(db,a);assert.equal((await q('select manufacturer_company_id from game_items where id=$1',[item.id]))[0].manufacturer_company_id,first.id);
 await assert.rejects(saveManufacturer(db,{...a,p_slug:'must_rollback',p_manufacturer_company_id:second.id}),/foreign key/);assert.equal((await q('select slug from game_items where id=$1',[item.id]))[0].slug,item.slug);
 await assert.rejects(q('update game_items set manufacturer_faction_id=null where id=$1',[item.id]),/check constraint/);
 await assert.rejects(q('delete from game_faction_companies where id=$1',[first.id]),/foreign key/);
 await saveManufacturer(db,{...a,p_manufacturer_company_id:null});await q('delete from game_faction_companies where id=$1',[first.id]);
 await saveManufacturer(db,{...a,p_manufacturer_faction_id:null,p_manufacturer_company_id:null});
 await db.exec("reset role;select set_config('qa.editor','no',false);set role authenticated");await assert.rejects(saveManufacturer(db,a),/Editor permission/);
 console.log('PASS M81: valid manufacturer, cross-faction rejection and transaction rollback, direct-write invariant, referenced plant deletion blocked, faction-only and clear, editor authorization (legacy save boundary fixture)');
}finally{await db.close();}
