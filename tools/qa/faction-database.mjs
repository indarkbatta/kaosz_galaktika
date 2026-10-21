import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {setupFactionDatabase,factionCatalog} from './faction-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));
const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
try{
 await setupFactionDatabase(db);
 const q=(s,args)=>db.query(s,args);const quadrants=(await q('select * from game_quadrants')).rows,items=(await q('select * from game_items')).rows;
 const faction={id:'',slug:'test_faction',name_hu:'Teszt',name_en:'Test',color:'#cc7048',image_path:null,home_quadrant_id:quadrants[0].id,reputation_min:-100,reputation_max:1000,is_published:true};
 const presence=quadrants.map((q,i)=>({quadrant_id:q.id,strength:i?'covert':'dominant',notes_hu:'Jelenlét',notes_en:'Presence'}));
 const companies=[{id:'22222222-2222-4222-8222-222222222222',name_hu:'Cég',name_en:'Company'}];
 const tiers=[{id:'33333333-3333-4333-8333-333333333333',threshold:100,name_hu:'Barát',name_en:'Friend',credits:150,items:[{item_id:items[0].id,quantity:3},{item_id:items[1].id,quantity:2}]},{id:'44444444-4444-4444-8444-444444444444',threshold:500,name_hu:'Szövetséges',name_en:'Ally',credits:500,items:[]}];
 async function save(f=faction,p=presence,c=companies,t=tiers,revision=f.id?1:null){return (await q('select public.save_game_faction($1,$2,$3,$4,$5) result',[f,p,c,t,revision])).rows[0].result;}
 await db.exec('set role authenticated');
 const saved=await save();faction.id=saved.id;
 let rows=await factionCatalog(db);assert.equal(rows.length,1);assert.equal(rows[0].presence.length,2);assert.equal(rows[0].companies[0].id,companies[0].id);assert.equal(rows[0].tiers[0].items.length,2);
 // Existing milestone IDs stay stable, including exchanging thresholds.
 tiers[0].threshold=500;tiers[1].threshold=100;await save();
 assert.equal((await factionCatalog(db))[0].revision,2);
 await assert.rejects(save(),/changed since loading/);
 // Invalid FK, duplicate thresholds/items and cross-faction child IDs roll back the entire document.
 await assert.rejects(save({...faction,name_hu:'Should roll back'},presence,companies,[{...tiers[0],items:[{item_id:'99999999-9999-4999-8999-999999999999',quantity:1}]}],2),/foreign key/);
 assert.equal((await factionCatalog(db))[0].name_hu,'Teszt');assert.equal((await factionCatalog(db))[0].revision,2);
 await assert.rejects(save(faction,presence,companies,[{...tiers[0],threshold:2000}],2),/outside reputation range/);
 await assert.rejects(save(faction,presence,companies,[{...tiers[0],items:[tiers[0].items[0],tiers[0].items[0]]}],2),/duplicate key/);
 await assert.rejects(save(faction,presence,companies,[{...tiers[0],threshold:100},{...tiers[1],threshold:100}],2),/duplicate key/);
 const other={...faction,id:'',slug:'other_faction'};await assert.rejects(save(other,[],companies,[],null),/another faction/);
 await save(faction,[presence[1]],[],[tiers[0]],2);rows=await factionCatalog(db);assert.equal(rows[0].presence.length,1);assert.equal(rows[0].companies.length,0);assert.equal(rows[0].tiers.length,1);assert.equal(rows[0].tiers[0].id,tiers[0].id);
 await db.exec("reset role;select set_config('qa.editor','no',false);set role authenticated;");
 assert.equal((await factionCatalog(db)).length,0);await assert.rejects(save(),/Editor access required/);
 await assert.rejects(q("insert into game_factions(slug,name_hu,name_en) values('bad','bad','bad')"),/row-level security/);
 await db.exec('reset role;set role anon');await assert.rejects(q('select * from game_factions'),/permission denied/);
 console.log('PASS M80 PostgreSQL: atomic save, full readback, stable IDs, threshold exchange, stale revision, FK/duplicate/range rollback, child isolation/removal, editor RLS and anonymous denial');
}finally{await db.close();}
