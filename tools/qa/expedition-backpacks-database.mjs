import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {setupPartyDatabase} from './expedition-party-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json')),{PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
try{
 const {cid,companions:[a,b]}=await setupPartyDatabase(db),one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 await db.exec('reset role');
 const backpack=(await one("insert into game_items(slug,equip_owner,equip_slot,capacity_bonus) values('qa_backpack','captain','backpack',12) returning id")).id;
 const rifle=(await one("select id from game_items where equip_slot='main_weapon' limit 1")).id;
 const items=[];for(let i=0;i<8;i++)items.push((await one("insert into game_items(slug,category) values($1,'material') returning id",['qa_supply_'+i])).id);
 await db.query('insert into character_inventory values($1,$2,1,now())',[cid,backpack]);
 for(const item of items)await db.query('insert into character_inventory values($1,$2,3,now())',[cid,item]);
 const balance=async()=> (await db.query(`select item_id,sum(n)::int quantity from (
 select item_id,quantity n from character_inventory where character_id=$1 union all
 select item_id,quantity from character_personal_inventory where character_id=$1 union all
 select item_id,quantity from private.expedition_actor_inventory i join private.expedition_actors a on a.id=i.actor_id where a.character_id=$1 union all
 select item_id,1 from character_equipment where character_id=$1 union all
 select item_id,1 from private.expedition_actor_equipment i join private.expedition_actors a on a.id=i.actor_id where a.character_id=$1) q group by item_id order by item_id`,[cid])).rows;
 const baseline=await balance();await db.exec('set role authenticated');
 const snapshot=async()=>(await one('select get_expedition_storage() r')).r;
 const bag=(d,aid)=>d.personal_inventories.find(b=>b.actor_id===aid);
 const equip=async(aid,item,s='cargo',source=aid,slot='backpack')=>(await one('select equip_expedition_actor_from($1,$2,$3,$4,$5) r',[aid,slot,item,s,source])).r;
 const move=async(item,n,from,fromActor,to,toActor,pos=null)=>(await one('select transfer_expedition_item($1,$2,$3,$4,$5,$6,$7) r',[item,n,from,fromActor,to,toActor,pos])).r;
 let d=await snapshot();assert.equal(bag(d,a).capacity,6);assert.equal(bag(d,b).capacity,6);
 d=await equip(a,backpack);assert.equal(bag(d,a).capacity,18);assert.equal(bag(d,cid).capacity,6);assert.equal(bag(d,b).capacity,6);
 d=await move(items[0],2,'cargo',cid,'personal',a,14);assert.equal(bag(d,a).items.find(i=>i.item_id===items[0]).position,14);assert.equal(bag(d,cid).items.length,0);
 d=await move(items[0],1,'personal',a,'personal',b,4);assert.equal(bag(d,a).items[0].quantity,1);assert.equal(bag(d,b).items[0].quantity,1);
 d=await move(items[0],1,'personal',a,'personal',a,16);assert.equal(bag(d,a).items[0].position,16);
 for(let i=1;i<7;i++)await move(items[i],1,'cargo',cid,'personal',a,6+i);
 await assert.rejects(equip(a,null),/Personal inventory capacity exceeded/);
 await assert.rejects(one('select equip_expedition_actor($1,$2,null,$3)',[a,'backpack','cargo']),/Personal inventory capacity exceeded/);
 await assert.rejects(one('select move_expedition_equipment($1,$2,$3,$4)',[a,'backpack',b,'backpack']),/Personal inventory capacity exceeded/);
 await db.exec('reset role;begin');await db.query('update game_items set capacity_bonus=0 where id=$1',[backpack]);
 await assert.rejects(db.exec('set constraints all immediate'),/Personal inventory capacity exceeded/);await db.exec('rollback;set role authenticated');
 assert.equal(bag(await snapshot(),a).capacity,18,'Catalog reduction rolled back');
 // Cargo/captain cannot consume another character bag by guessing its item UUID.
 await assert.rejects(move(items[0],3,'personal',b,'personal',cid),/Not enough/);
 await assert.rejects(move(items[0],1,'personal',crypto.randomUUID(),'personal',cid),/Actor not found/);
 await assert.rejects(move(items[0],1,'personal',a,'personal',crypto.randomUUID()),/Actor not found/);
 await assert.rejects(move(items[0],1,'personal',a,'personal',b,6),/Invalid storage position/);
 await assert.rejects(move(items[0],0,'personal',a,'cargo',cid),/Invalid storage transfer/);
 // Existing equipped rifle -> a's bag -> b's equipment uses the same physical item.
 d=(await one('select transfer_expedition_item($1,1,$2,$3,$4,$5,0,$6) r',[rifle,'gear',cid,'personal',a,'main_weapon'])).r;
 await equip(b,rifle,'personal',a,'main_weapon');assert.ok((await snapshot()).equipped.some(e=>e.crew_id===b&&e.item_id===rifle));
 await move(items[1],1,'personal',a,'cargo',cid);await equip(a,null);
 d=await snapshot();assert.equal(bag(d,a).capacity,6);assert.ok(bag(d,a).items.every(i=>i.position<6),'Positions normalize after removing bag');
 await db.exec('reset role');assert.deepEqual(await balance(),baseline,'All transfers/equip/rejections preserve exact total');
 await db.exec(`insert into character_skill_challenge_runs values('${cid}','active');set role authenticated`);
 await assert.rejects(move(items[0],1,'personal',b,'cargo',cid),/Finish active/);await assert.rejects(equip(a,backpack),/Finish active/);
 await assert.rejects(db.query('select * from private.expedition_actor_inventory'),/permission denied/);
 await assert.rejects(db.query('select private.expedition_stock_delta($1,$2,$3,$4,1)',[cid,a,'personal',items[0]]),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(snapshot(),/permission denied/);
 console.log('PASS actor backpacks: independent 6+bag capacity, persisted slots, free partial transfers, gear from another bag, exact balance, full-bag removal/swap/catalog rollback, ownership/encounter/ACL.');
}finally{await db.close();}
