import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {setupBridgeDatabase} from './bridge-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));
const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
const q=async(s,args)=>(await db.query(s,args)).rows;
try{
 await setupBridgeDatabase(db);
 await db.exec(`
 create table public.character_cantina_candidates(id uuid,character_id uuid,template_id uuid,name text,specialty text,aptitude integer,species_slug text,class_id uuid,portrait_path text,rarity text,biography text,hull_bonus integer,shield_bonus integer,damage_bonus integer,speed_bonus integer);
 select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 insert into characters(user_id,attribute_pips,skill_bonus_pips) values(auth.uid(),'{"mind":11}','{}');
 insert into character_progress select id,5,now()-interval '450 seconds',0,1,0,now() from characters;
 insert into gameplay_rules(id,energy_max,energy_regen_seconds,xp_level_base,skill_points_per_level) values(1,100,300,100,1);
 insert into game_locations(slug) values('test');
 insert into character_positions select c.id,l.id from characters c cross join game_locations l;
 insert into game_skills(slug,attribute) values('analysis','mind');
 insert into game_actions(slug,skill_id,energy_cost,target_number,xp_success,xp_failure,is_published) select 'test',id,3,9,10,2,true from game_skills;
 insert into game_skill_challenges(slug,location_id,name_hu,name_en,steps,is_published,difficulty)
 select 'qa',l.id,'Teszt','Test',jsonb_build_array(
 jsonb_build_object('name_hu','Első','name_en','First','skill_ids',jsonb_build_array(s.id),'base_tn',9,'energy_cost',6),
 jsonb_build_object('name_hu','Második','name_en','Second','skill_ids',jsonb_build_array(s.id),'base_tn',9,'energy_cost',6)),true,'normal'
 from game_locations l cross join game_skills s;
 `);
 const migration=await readFile('supabase/migrations/20261021160000_m79_energy_ticks_challenge_repetition.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 let cfg=(await q('select * from gameplay_rules'))[0];assert.equal(cfg.energy_max,16);assert.equal(cfg.energy_regen_seconds,3600);assert.equal(cfg.energy_per_tick,1);
 assert.equal((await q('select energy from character_progress'))[0].energy,6,'Changing rules settles OLD regen and resets clock without retroactive refill');
 assert.equal((await q('select repeat_policy from game_skill_challenges'))[0].repeat_policy,'once','Legacy non-repeatable definition stays one-shot');
 const cid=(await q('select id from characters'))[0].id,challenge=(await q('select id from game_skill_challenges'))[0].id;
 const availability=async()=>(await q('select public.get_skill_challenge_availability() a'))[0].a[0];
 const addRun=async status=>q(`insert into character_skill_challenge_runs(character_id,challenge_id,definition,difficulty,level_at_start,step_index,status,finished_at,retry_available_at)
 select $1,$2,jsonb_build_object('steps',steps),'normal',1,2,$3,now()-interval '1 day',now()-interval '1 second' from game_skill_challenges returning id`,[cid,challenge,status]);
 const start=()=>q("select public.start_skill_challenge('qa') r");
 for(const policy of ['once','until_completed','until_success','unlimited']){
  for(const status of ['failure','partial','success']){
   await db.exec('delete from character_skill_challenge_runs');
   await q('update game_skill_challenges set repeat_policy=$1,cooldown_ticks=0',[policy]);await addRun(status);
   const expected=policy==='unlimited'||policy==='until_completed'&&status==='failure'||policy==='until_success'&&status!=='success';
   assert.equal((await availability()).can_start,expected,policy+'/'+status);
   if(expected){await start();await assert.rejects(start(),/current challenge/);}
   else await assert.rejects(start(),/completed/);
  }
 }
 // All history counts, including successes older than the UI's 50 most recent runs.
 await db.exec('delete from character_skill_challenge_runs');await q("update game_skill_challenges set repeat_policy='until_success'");
 await addRun('success');for(let i=0;i<55;i++)await addRun('failure');assert.equal((await availability()).reason,'completed');
 // CD cannot be bypassed by either public start signature.
 await db.exec('delete from character_skill_challenge_runs');await q("update game_skill_challenges set repeat_policy='unlimited',cooldown_ticks=2");await addRun('failure');
 await db.exec("update character_skill_challenge_runs set retry_available_at=clock_timestamp()+interval '1 hour'");
 assert.equal((await availability()).reason,'cooldown');await assert.rejects(start(),/cooldown/);
 await assert.rejects(q("select public.start_skill_challenge('qa','easy')"),/cooldown/);
 await db.exec("update character_skill_challenge_runs set retry_available_at=clock_timestamp()-interval '1 second';update character_progress set energy=16,energy_at=now()");
 await start();
 assert.equal((await q('select definition from character_skill_challenge_runs where status=\'active\''))[0].definition.cooldown_ticks,2);
 await db.exec("update game_skill_challenges set cooldown_ticks=5;insert into private.qa_dice(n) values(5),(4),(6),(6),(1),(5),(4),(6),(6),(1)");
 const rid=(await q("select id from character_skill_challenge_runs where status='active'"))[0].id,skill=(await q('select id from game_skills'))[0].id;
 await q('select public.roll_skill_challenge($1,0,$2)',[rid,skill]);await q('select public.roll_skill_challenge($1,1,$2)',[rid,skill]);
 const cd=(await q('select extract(epoch from (retry_available_at-finished_at))::int secs from character_skill_challenge_runs where id=$1',[rid]))[0].secs;
 assert.equal(cd,7200,'Running challenge keeps cooldown tick COUNT; finishing uses shared tick duration');
 // Every authoritative action uses the configurable regen amount and preserves partial tick time.
 await db.exec("update gameplay_rules set energy_per_tick=2,energy_regen_seconds=1800;update character_progress set energy=1,energy_at=clock_timestamp()-interval '4500 seconds';insert into private.qa_dice(n) values(5),(4),(2)");
 let action=(await q("select public.perform_game_action('test','22222222-2222-4222-8222-222222222222') a"))[0].a;
 assert.equal(action.energy,2,'1 + two ticks*2 - cost 3 = 2');
 assert.ok(Math.abs((await q('select extract(epoch from(clock_timestamp()-energy_at))::int seconds from character_progress'))[0].seconds-900)<5);
 await db.exec("update character_progress set energy=15,energy_at=clock_timestamp()-interval '10 hours';insert into private.qa_dice(n) values(5),(4),(2)");
 action=(await q("select public.perform_game_action('test','33333333-3333-4333-8333-333333333333') a"))[0].a;assert.equal(action.energy,13,'Regeneration caps at 16 before cost');
 await db.exec(`alter table gameplay_rules enable row level security;
 create policy rules_read on gameplay_rules for select to authenticated using(true);
 create policy rules_edit on gameplay_rules for update to authenticated using(private.can_edit_content()) with check(private.can_edit_content());
 grant select on gameplay_rules to authenticated;grant update(energy_max,energy_regen_seconds) on gameplay_rules to authenticated;
 set role authenticated;update gameplay_rules set energy_max=999;reset role;`);
 assert.equal((await q('select energy_max from gameplay_rules'))[0].energy_max,16);
 await db.exec("select set_config('qa.editor','yes',false);set role authenticated;update gameplay_rules set energy_max=12,energy_regen_seconds=900,energy_per_tick=1;reset role;");
 cfg=(await q('select * from gameplay_rules'))[0];assert.equal(cfg.energy_max,12);assert.equal(cfg.energy_regen_seconds,900);
 console.log('PASS M79 PostgreSQL: 16/+1/hour defaults, old-rate settlement, editable amount/tick/cap, partial ticks, all 12 repeat-policy outcomes, full-history gate, CD/legacy-RPC protection, running CD snapshot, editor-only writes');
}catch(e){console.error(e.message,e.position||'');process.exitCode=1;}finally{await db.close();}
