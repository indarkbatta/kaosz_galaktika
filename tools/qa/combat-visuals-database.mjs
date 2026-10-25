import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {setupCombatDatabase} from './combat-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
try{
 await setupCombatDatabase(db);await db.exec(await readFile('supabase/migrations/20261025120121_combat_visual_authoring.sql','utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 await db.exec('set role authenticated');const cat=(await q('select public.get_combat_visual_editor_catalog() c'))[0].c;
 const actor={species_id:cat.species[0].id,class_id:cat.classes[0].id,frames:['hatarvilag/idle1.png','hatarvilag/idle2.png'],fps:12};
 const save=async(kind,doc,revision=null)=>(await q('select public.save_combat_visual($1,$2,$3) v',[kind,doc,revision]))[0].v;
 let a=await save('actor',actor);assert.equal(a.revision,1);assert.deepEqual(a.frames,actor.frames);
 await assert.rejects(save('actor',actor),/Content changed/);await assert.rejects(save('actor',{...actor,fps:0},1),/check constraint/);await assert.rejects(save('actor',{...actor,frames:['']},1),/Invalid frame image/);
 a=await save('actor',{...actor,frames:[...actor.frames].reverse()},1);assert.equal(a.revision,2);
 await db.exec('reset role');const itemid=(await q('select id from game_items limit 1'))[0].id;await db.exec('set role authenticated');
 const anchor={class_id:actor.class_id,x:40,y:55,origin_x:10,origin_y:20,scale:.35,rotation:25};const item={item_id:itemid,image_path:'hatarvilag/rifle.png',anchors:[anchor]};
 let i=await save('item',item);assert.equal(i.revision,1);await assert.rejects(save('item',{...item,anchors:[{...anchor,x:101}]},1),/check constraint/);await assert.rejects(save('item',{...item,anchors:[anchor,anchor]},1),/duplicate key/);await assert.rejects(save('item',{...item,anchors:[{...anchor,class_id:'99999999-9999-4999-8999-999999999999'}]},1),/foreign key/);
 let c=(await q('select public.get_combat_visual_editor_catalog() c'))[0].c;assert.equal(c.items[0].revision,1);assert.equal(c.anchors.length,1);assert.equal(Number(c.anchors[0].x),40);
 i=await save('item',{...item,anchors:[]},1);assert.equal(i.revision,2);assert.equal((await q('select public.get_combat_visual_editor_catalog() c'))[0].c.anchors.length,0);
 await assert.rejects(q('select * from game_combat_appearances'),/permission denied/);
 await db.exec("select set_config('qa.editor','no',false)");await assert.rejects(save('actor',actor,2),/Editor permission/);await assert.rejects(q('select public.get_combat_visual_editor_catalog()'),/Editor permission/);
 await db.exec('reset role;set role anon');await assert.rejects(q('select public.get_combat_visual_editor_catalog()'),/permission denied/);
 console.log('PASS visuals: authenticated create/update/reload, ordered frames, FPS/anchors validation, class FK, stale revisions, atomic rollback, anchor removal, role denial and no direct table access.');
}finally{await db.close();}
