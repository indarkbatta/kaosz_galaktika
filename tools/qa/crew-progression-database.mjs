import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {setupCrewDatabase} from './crew-progression-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json')),{PGlite}=require('@electric-sql/pglite');
const db=new PGlite();await setupCrewDatabase(db);
const q=async(sql)=> (await db.query(sql)).rows;
const deny=async(sql,pattern)=>{try{await db.exec(sql);assert.fail('Expected rejection: '+sql);}catch(e){assert.match(String(e),pattern);}};
try{
 const [{id:cid}]=await q('select id from characters limit 1');const [{id:crew}]=await q('select id from character_crew');const [{id:klass}]=await q("select id from game_crew_classes where slug='technician'");
 assert.equal((await q(`select crew_class_id from character_crew where id='${crew}'`))[0].crew_class_id,klass);
 assert.deepEqual((await q('select private.crew_level(0) l1,private.crew_level(99) l99,private.crew_level(100) l2,private.crew_level(300) l3,private.crew_level(122500) l50'))[0],{l1:1,l99:1,l2:2,l3:3,l50:50});
 let sheet=(await q(`select private.crew_sheet('${crew}') s`))[0].s;assert.equal(sheet.stats.health,12);assert.equal(sheet.stats.attack,5);assert.equal(sheet.stats.damage,3);
 const [{id:skill}]=await q("select id from game_skills where slug='engineering'");assert.equal(sheet.skills[skill],4);
 await db.exec(`insert into game_items(slug,equip_owner,equip_slot) values('crew_weapon','crew','weapon');insert into game_item_combat(item_id,weapon_pips,resistances,effects) select id,9,'{"kinetic":2}','[{"type":"modifier","stat":"defense","key":"mind","amount":2,"group":"gear"},{"type":"modifier","stat":"skill","key":"${skill}","amount":2,"group":"gear"}]' from game_items where slug='crew_weapon';insert into character_equipment(character_id,crew_id,slot,item_id) select '${cid}','${crew}','weapon',id from game_items where slug='crew_weapon';`);
 sheet=(await q(`select private.crew_sheet('${crew}') s`))[0].s;assert.equal(sheet.stats.damage,9);assert.equal(sheet.stats.defense,7);assert.equal(sheet.skills[skill],6);assert.equal(sheet.resistances.kinetic,2);
 await db.exec(`select private.award_crew_xp('${cid}',array['${crew}']::uuid[],300,'22222222-2222-4222-8222-222222222222');select private.award_crew_xp('${cid}',array['${crew}']::uuid[],300,'22222222-2222-4222-8222-222222222222');`);
 sheet=(await q(`select private.crew_sheet('${crew}') s`))[0].s;assert.equal(sheet.level,3);assert.equal(sheet.xp,300);assert.equal(sheet.stats.health,16);assert.equal(sheet.stats.attack,5);assert.equal(sheet.stats.defense,8);assert.equal(sheet.skills[skill],7);
 await deny(`select private.award_crew_xp('${cid}',array['${crew}']::uuid[],301,'22222222-2222-4222-8222-222222222222')`,/Reward request mismatch/);
 await db.exec(`insert into character_crew(character_id,name,species_slug,specialty,position) select '${cid}',n,'ember','security','security' from unnest(array['Crew 2','Crew 3'])n;`);
 const ids=(await q(`select id from character_crew where character_id='${cid}' order by name`)).map(x=>x.id);
 await db.exec(`set role authenticated;`);await deny('select private.crew_sheet(null)',/permission denied/);await deny(`select private.award_crew_xp('${cid}','{}',100,gen_random_uuid())`,/permission denied/);
 await db.exec(`select public.set_salvage_party(array['${ids[0]}','${ids[1]}']::uuid[])`);assert.equal((await q('select public.get_simple_crew() s'))[0].s.party.length,2);
 await deny(`select public.set_salvage_party(array['${ids[0]}','${ids[0]}']::uuid[])`,/distinct crew/);await deny(`select public.set_salvage_party(array['${ids[0]}','${ids[1]}','${ids[2]}']::uuid[])`,/at most two/);await deny(`select public.set_salvage_party(array[gen_random_uuid()])`,/Not your crew/);
 await db.exec("select set_config('qa.editor','no',false)");await deny('select public.get_crew_progression_catalog()',/Editor access/);
 await db.exec("select set_config('qa.editor','yes',false)");const cat=(await q('select public.get_crew_progression_catalog() c'))[0].c;let c=cat.classes.find(x=>x.id===klass);c.growth.attack=.75;
 await db.query('select public.save_crew_progression($1,$2,$3,$4,$5)',['class',klass,c.revision,c,[]]);await deny(`select public.save_crew_progression('class','${klass}',1,'{}','[]')`,/changed/);
 await db.exec('reset role');assert.equal((await q(`select private.crew_sheet('${crew}') s`))[0].s.stats.attack,6);
 console.log('PASS crew SQL: class migration/defaults, floor growth, XP thresholds/idempotency, gear/skills/TN/resistance, owner and editor gates, party limit/duplicates, optimistic revisions.');
}finally{await db.close();}
