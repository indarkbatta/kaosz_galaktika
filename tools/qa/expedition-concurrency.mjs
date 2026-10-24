// Real PostgreSQL, real independent sessions. Never connects to a supplied DB.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {setupPartyDatabase} from './expedition-party-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));
const EmbeddedPostgres=require('embedded-postgres').default;
if(process.platform!=='win32'&&process.getuid?.()===0)throw new Error('Real PostgreSQL QA requires a non-root user. Use the self-hosted Windows CI; no PGlite fallback.');
const root=await mkdtemp(join(tmpdir(),'hatarvilag-concurrency-'));
const portProbe=createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
const pg=new EmbeddedPostgres({databaseDir:join(root,'db'),user:'postgres',password:randomBytes(24).toString('hex'),authMethod:'scram-sha-256',port,persistent:false,createPostgresUser:false,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
const connections=[];
try{
 await pg.initialise();await pg.start();await pg.createDatabase('hatarvilag_qa');
 const connect=async()=>{const c=pg.getPgClient('hatarvilag_qa','127.0.0.1');await c.connect();connections.push(c);return c;};
 const observer=await connect();
 const {cid,companions:[a,b,c]}=await setupPartyDatabase({exec:sql=>observer.query(sql),query:(sql,args)=>observer.query(sql,args)});
 await observer.query('reset role');
 const uid='11111111-1111-4111-8111-111111111111';
 const A=await connect(),B=await connect();assert.notEqual(A.processID,B.processID,'Independent backend processes');
 const begin=async client=>{await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);};
 async function waitForLock(){const deadline=Date.now()+10000;while(Date.now()<deadline){const {rows}=await observer.query('select pg_blocking_pids($1) p',[B.processID]);if(rows[0].p.includes(A.processID))return;await new Promise(r=>setTimeout(r,20));}throw new Error('Second session never waited on first session: overlap not proven');}
 async function race(first,second,error){await begin(A);await begin(B);await first(A);const pending=second(B).then(value=>({value}),failure=>({failure}));await waitForLock();await A.query('commit');const result=await pending;assert.match(result.failure?.message||'',error);await B.query('rollback');}
 const rifle=(await observer.query("select id from game_items where equip_slot='main_weapon' limit 1")).rows[0].id;
 await observer.query('insert into character_inventory values($1,$2,1,now())',[cid,rifle]);
 const total=async item=>Number((await observer.query(`select coalesce((select sum(quantity) from character_inventory where character_id=$1 and item_id=$2),0)+coalesce((select sum(quantity) from character_personal_inventory where character_id=$1 and item_id=$2),0)+coalesce((select sum(quantity) from private.expedition_actor_inventory i join private.expedition_actors a on a.id=i.actor_id where a.character_id=$1 and i.item_id=$2),0)+(select count(*) from character_equipment where character_id=$1 and item_id=$2)+(select count(*) from private.expedition_actor_equipment i join private.expedition_actors a on a.id=i.actor_id where a.character_id=$1 and i.item_id=$2) n`,[cid,item])).rows[0].n);
 const before=await total(rifle);
 await race(x=>x.query("select equip_expedition_actor_from($1,'main_weapon',$2,'cargo',$1)",[a,rifle]),x=>x.query("select equip_expedition_actor_from($1,'main_weapon',$2,'cargo',$1)",[b,rifle]),/Not enough item stock/);
 assert.equal(await total(rifle),before);assert.equal((await observer.query('select count(*)::int n from private.expedition_actor_equipment where item_id=$1',[rifle])).rows[0].n,1);
 await begin(A);await A.query("select transfer_expedition_item($1,1,'gear',$2,'personal',$2,0,'main_weapon')",[rifle,a]);await A.query('commit');
 await race(x=>x.query("select transfer_expedition_item($1,1,'personal',$2,'personal',$3)",[rifle,a,b]),x=>x.query("select transfer_expedition_item($1,1,'personal',$2,'personal',$3)",[rifle,a,c]),/Not enough item stock/);
 assert.equal(await total(rifle),before);
 await race(x=>x.query('select save_expedition_party($1,0)',[[cid,a,b,c]]),x=>x.query('select save_expedition_party($1,0)',[[a,cid,b,c]]),/Party changed/);
 assert.equal((await observer.query('select revision::int n from private.expedition_parties where character_id=$1',[cid])).rows[0].n,1);
 const bag=(await observer.query("insert into game_items(slug,equip_owner,equip_slot,capacity_bonus) values('qa_race_bag','captain','backpack',12) returning id")).rows[0].id;
 await observer.query('insert into character_inventory values($1,$2,1,now())',[cid,bag]);
 const supplies=[];for(let n=0;n<7;n++){const item=(await observer.query("insert into game_items(slug,category) values($1,'material') returning id",['qa_race_supply_'+n])).rows[0].id;supplies.push(item);await observer.query('insert into character_inventory values($1,$2,1,now())',[cid,item]);}
 await begin(A);await A.query("select equip_expedition_actor_from($1,'backpack',$2,'cargo',$1)",[a,bag]);
 for(const item of supplies.slice(0,6))await A.query("select transfer_expedition_item($1,1,'cargo',$2,'personal',$3)",[item,cid,a]);await A.query('commit');
 await race(x=>x.query("select transfer_expedition_item($1,1,'cargo',$2,'personal',$3)",[supplies[6],cid,a]),x=>x.query("select equip_expedition_actor_from($1,'backpack',null,'cargo',$1)",[a]),/Personal inventory capacity exceeded/);
 assert.equal((await observer.query('select count(*)::int n from private.expedition_actor_inventory where actor_id=$1 and quantity>0',[a])).rows[0].n,7);
 assert.equal(await total(bag),1);for(const item of supplies)assert.equal(await total(item),1);
 console.log('PASS real PostgreSQL: two distinct backend sessions; confirmed blocking in equip/transfer/revision/capacity races; exactly one winner, no copied or lost stock, full backpack preserved.');
}finally{
 for(const c of connections){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}
 await pg.stop().catch(()=>{});await rm(root,{recursive:true,force:true});
}
