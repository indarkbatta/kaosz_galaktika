import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
try{
await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema private;create schema auth;
grant usage on schema public,private,auth to authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function private.can_edit_content() returns boolean language sql stable as $$select current_setting('qa.editor',true)='yes'$$;
create table public.characters(id uuid primary key default gen_random_uuid(),user_id uuid,attribute_pips jsonb,skill_bonus_pips jsonb);
create table public.character_progress(character_id uuid primary key,energy integer,energy_at timestamptz,xp_total bigint,level integer,upgrade_points integer,updated_at timestamptz);
create table public.gameplay_rules(id integer primary key,energy_max integer,energy_regen_seconds integer,xp_level_base integer,skill_points_per_level integer);
create table public.game_locations(id uuid primary key default gen_random_uuid(),slug text);
create table public.character_positions(character_id uuid primary key,location_id uuid);
create table public.game_skills(id uuid primary key default gen_random_uuid(),slug text,attribute text);
create table public.game_items(id uuid primary key default gen_random_uuid(),is_published boolean);
create table public.character_inventory(character_id uuid,item_id uuid,quantity integer,updated_at timestamptz,unique(character_id,item_id));
create table public.character_skill_upgrades(character_id uuid,skill_id uuid,bonus_pips integer);
create table public.game_actions(id uuid primary key default gen_random_uuid(),slug text,skill_id uuid,energy_cost integer,target_number integer,xp_success integer,xp_failure integer,is_published boolean);
create table public.character_action_log(id bigint generated always as identity primary key,character_id uuid,action_id uuid,dice jsonb,roll_total integer,target_number integer,succeeded boolean,xp_awarded integer,energy_spent integer,level_after integer,performed_at timestamptz default now());
create table private.qa_dice(id bigint generated always as identity,n integer);
create function private.secure_d6() returns integer language plpgsql as $$declare x integer;begin
 delete from private.qa_dice where id=(select min(id) from private.qa_dice) returning n into x;
 if x is null then raise exception 'Fixture dice exhausted';end if;return x;end $$;
`);
await db.exec(await readFile('supabase/migrations/20261021140000_m77_skill_challenges.sql','utf8'));
const migration=await readFile('supabase/migrations/20261021150000_m78_bridge_encounters_dice.sql','utf8');
await db.exec(migration);await db.exec(migration);
const query=async(s)=>(await db.query(s)).rows;
assert.equal((await query(`select (private.resolve_space_d6(array[5,4],array[6,6,1],2)->>'roll_total')::int total`))[0].total,24);
assert.equal((await query(`select (private.resolve_space_d6(array[6,4],array[1],2)->>'roll_total')::int total`))[0].total,6);
assert.equal((await query(`select (private.resolve_space_d6(array[]::int[],array[1],2)->>'roll_total')::int total`))[0].total,2);
await db.exec(`
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
insert into characters(user_id,attribute_pips,skill_bonus_pips) values(auth.uid(),'{"mind":11}','{}');
insert into character_progress select id,100,now(),0,11,0,now() from characters;
insert into gameplay_rules values(1,100,300,100,1);
insert into game_locations(slug) values('test');
insert into character_positions select c.id,l.id from characters c cross join game_locations l;
insert into game_skills(slug,attribute) values('analysis','mind');
insert into game_actions(slug,skill_id,energy_cost,target_number,xp_success,xp_failure,is_published)
select 'test',id,6,9,10,2,true from game_skills;
insert into game_skill_challenges(slug,location_id,name_hu,name_en,steps,is_published,difficulty)
select 'qa',l.id,'Teszt','Test',jsonb_build_array(
 jsonb_build_object('name_hu','Első','name_en','First','skill_ids',jsonb_build_array(s.id),'base_tn',9,'energy_cost',6),
 jsonb_build_object('name_hu','Második','name_en','Second','skill_ids',jsonb_build_array(s.id),'base_tn',9,'energy_cost',6)),true,'hard'
from game_locations l cross join game_skills s;
`);
await db.exec(`grant select on public.characters to authenticated;set role authenticated;select public.start_skill_challenge('qa','easy');reset role;`);
assert.equal((await query('select difficulty from character_skill_challenge_runs'))[0].difficulty,'hard');
await db.exec(`update game_skill_challenges set difficulty='easy';insert into private.qa_dice(n) values(5),(4),(6),(6),(1);`);
let roll=(await query(`select public.roll_skill_challenge((select id from character_skill_challenge_runs),0,(select id from game_skills)) r`))[0].r;
assert.equal(roll.target_number,14);assert.equal(roll.roll_total,24);assert.deepEqual(roll.wild_dice,[6,6,1]);
await assert.rejects(query(`select public.roll_skill_challenge((select id from character_skill_challenge_runs),0,(select id from game_skills))`),/stale/);
assert.equal((await query('select energy from character_progress'))[0].energy,94);
assert.equal((await query('select xp_total from character_progress'))[0].xp_total,0);
await db.exec(`set role authenticated;select public.acknowledge_challenge_result((select id from character_skill_challenge_runs),0);reset role;`);
assert.equal((await query('select result_seen_through from character_skill_challenge_runs'))[0].result_seen_through,0);
await db.exec(`insert into private.qa_dice(n) values(5),(4),(6),(6),(1);`);
await query(`select public.roll_skill_challenge((select id from character_skill_challenge_runs),1,(select id from game_skills))`);
assert.equal((await query('select xp_total from character_progress'))[0].xp_total,112);
await assert.rejects(query(`select public.roll_skill_challenge((select id from character_skill_challenge_runs),1,(select id from game_skills))`),/stale/);
await db.exec(`insert into private.qa_dice(n) values(6),(4),(1);`);
roll=(await query(`select public.perform_game_action('test','22222222-2222-4222-8222-222222222222') r`))[0].r;
assert.equal(roll.roll_total,6);assert.equal(roll.wild_penalty,7);assert.equal(roll.wild_cancelled_index,0);
const energy=(await query('select energy from character_progress'))[0].energy;
const repeat=(await query(`select public.perform_game_action('test','22222222-2222-4222-8222-222222222222') r`))[0].r;
assert.equal(repeat.log_id,roll.log_id);assert.equal((await query('select energy from character_progress'))[0].energy,energy);
assert.equal((await query('select count(*)::int n from character_action_log'))[0].n,1);
await db.exec('set role authenticated');
await db.exec(`update game_skill_challenges set difficulty='extreme'`);
assert.equal((await query('select difficulty from game_skill_challenges'))[0].difficulty,'easy');
await assert.rejects(db.exec(`insert into character_skill_challenge_rolls default values`),/permission denied/);
await db.exec('reset role');
await db.exec(`select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);set role authenticated;`);
assert.equal((await query('select count(*)::int n from character_skill_challenge_rolls'))[0].n,0);
await assert.rejects(query(`select public.acknowledge_challenge_result('00000000-0000-4000-8000-000000000000',0)`),/Invalid result/);
console.log('PASS PostgreSQL fixture: migration twice, Wild chains/1D/penalty/pips, editor difficulty, level snapshot, stale-step/reward protection, acknowledgement ownership, activity idempotency and RLS');
}catch(e){console.error(e.message,e.query);process.exitCode=1;}finally{await db.close();}
