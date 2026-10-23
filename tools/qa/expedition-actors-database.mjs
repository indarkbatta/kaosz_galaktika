import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {setupActorDatabase, actorMigration} from './expedition-actors-db-fixture.mjs';

const require = createRequire(resolve(process.env.WORLD_BROWSER_TOOLS, 'package.json'));
const {PGlite} = require('@electric-sql/pglite');
const db = new PGlite();
try {
  await setupActorDatabase(db);
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await q(sql, args))[0];
  const cid = (await one('select id from public.characters limit 1')).id;
  // An ordinary noncombat skill must be available in the full character sheet.
  await db.exec("insert into game_skills(slug,attribute,is_combat) values('engineering','mind',false)");
  // Compare non-default legacy state before/after the migration, with no fixture leakage.
  const grownCaptain = async () => {
    await db.exec('begin');
    try {
      await db.exec(`update character_progress set level=6;
        update character_combat_progress set species_rank=2,class_rank=2,health=3,injuries='{"body":1}';
        insert into character_skill_upgrades(character_id,skill_id,bonus_pips)
          select c.id,s.id,2 from characters c cross join game_skills s where s.slug='body';
        insert into game_talent_trees(species_id) select species_id from characters;
        insert into character_tree_nodes(character_id,node_id,tree_id,branch,snapshot)
          select c.id,gen_random_uuid(),t.id,'species','{"effects":[{"type":"modifier","stat":"defense","key":"body","amount":2}]}'
          from characters c join game_talent_trees t on t.species_id=c.species_id cross join generate_series(1,2);`);
      return await one(`select private.combat_hero_before_loadout($1) hero,
        private.combat_hero($1) prepared,private.tree_points($1) points`,[cid]);
    } finally { await db.exec('rollback'); }
  };
  const grownBaseline = await grownCaptain();
  const baseline = (await one('select private.combat_hero_before_loadout($1) s', [cid])).s;
  const oldPoints = (await one('select private.tree_points($1) p', [cid])).p;
  await db.exec(await readFile(actorMigration, 'utf8'));
  assert.deepEqual((await one('select private.combat_hero_before_loadout($1) s', [cid])).s, baseline,
    'Complete legacy captain result is unchanged, including powers, equipment and AP');
  assert.deepEqual((await one('select private.tree_points($1) p', [cid])).p, oldPoints);
  assert.deepEqual(await grownCaptain(),grownBaseline,'Grown legacy ranks, learned nodes, injuries, upgrades and prepared powers are unchanged');
  assert.equal((await one('select count(*)::int n from private.expedition_actors')).n, 1,
    'Only a captain identity is registered; no crew conversion');

  const aid = crypto.randomUUID();
  await db.query(`insert into private.expedition_actors(id,character_id,kind,name,species_id,class_id,attribute_pips,skill_bonus_pips)
    select $1,id,'companion',captain_name,species_id,class_id,attribute_pips,skill_bonus_pips from public.characters where id=$2`, [aid,cid]);
  await db.query(`insert into private.expedition_actor_equipment(actor_id,slot,item_id)
    select $1,slot,item_id from character_equipment where character_id=$2 and crew_id is null`, [aid,cid]);
  const sheet = async id => (await one('select public.get_expedition_actor($1) s', [id])).s;
  let captain = await sheet(cid), companion = await sheet(aid);
  for (const key of ['max_health','defenses','skills','skill_attributes','effective_skills','effective_defenses','resistances','weapon_pips','powers','effects','points']) {
    assert.deepEqual(companion[key],captain[key],key+' uses identical captain/companion rules');
  }
  assert.equal(companion.action_points,undefined,'Full character sheet does not impose the old action budget');
  assert.equal(Object.keys(companion.skills).length,11,'All combat, defense and noncombat skills are exposed');
  assert.deepEqual(companion.points,{species:1,class:1,shared:0});

  const species = companion.species_id, klass = companion.class_id;
  const tree = (await one('insert into game_talent_trees(species_id) values($1) returning id',[species])).id;
  const effects = [{type:'modifier',stat:'defense',key:'mind',amount:2},
    {type:'modifier',stat:'attribute',key:'body',amount:2}];
  const classTree = (await one('insert into game_talent_trees(class_id) values($1) returning id',[klass])).id;
  const node = async branch => db.query(`insert into private.expedition_actor_nodes(actor_id,node_id,tree_id,branch,snapshot)
    values($1,gen_random_uuid(),$2,$3,$4)`,[aid,branch==='species'?tree:classTree,branch,JSON.stringify({effects})]);
  await node('species'); await node('class');
  companion = await sheet(aid);
  assert.equal(companion.max_health,captain.max_health,'First point in each branch grants no duplicate base HP');
  assert.deepEqual(companion.points,{species:0,class:0,shared:0});
  await db.query('update private.expedition_actors set level=3 where id=$1',[aid]);
  assert.equal((await sheet(aid)).points.shared,2);
  await node('species');
  companion = await sheet(aid);
  const growth = (await one('select private.expedition_branch_hp($1,$2,1,0) h',[species,klass])).h;
  assert.equal(companion.max_health,growth.max_health);
  assert.equal(companion.points.shared,1);
  assert.equal(companion.effective_defenses.mind,companion.defenses.mind+2,'Existing strongest-in-group stacking is preserved');
  await node('class');
  assert.equal((await sheet(aid)).points.shared,0);
  assert.deepEqual((await sheet(aid)).defenses,(await one('select private.expedition_branch_defenses($1,$2,1,1) d',[species,klass])).d);
  const skill = (await one("select id from game_skills where slug='body'")).id;
  await db.query('insert into private.expedition_actor_skills values($1,$2,3)',[aid,skill]);
  await db.query(`update private.expedition_actors set health=2,injuries='{"body":1}' where id=$1`,[aid]);
  companion = await sheet(aid);
  assert.equal(companion.health,2);
  assert.equal(companion.skills[skill],captain.skills[skill]+3);
  assert.equal(companion.effective_skills[skill],companion.skills[skill]+2-1,'Skill growth, passive attributes and injuries combine');
  const unavailable = (await one("insert into game_powers(slug,kind,skill_id,defense,effects,is_published) select 'qa_actor_learned',kind,$1,defense,effects,true from game_powers where slug='basic_body' returning id",[skill])).id;
  assert.ok(!(await sheet(aid)).powers.some(p=>p.id===unavailable));
  await db.query('insert into private.expedition_actor_powers values($1,$2)',[aid,unavailable]);
  assert.ok((await sheet(aid)).powers.some(p=>p.id===unavailable));
  assert.ok(!(await sheet(cid)).powers.some(p=>p.id===unavailable),'Learning does not leak between actors');
  await assert.rejects(db.query("update private.expedition_actors set kind='captain' where id=$1",[aid]),/identity is immutable/);
  await assert.rejects(db.query("update private.expedition_actors set attribute_pips='{}' where id=$1",[aid]),/Invalid actor attributes/);
  await assert.rejects(db.query('update private.expedition_actors set injuries=$2 where id=$1',[aid,JSON.stringify({unknown:1})]),/Invalid actor injury/);
  await assert.rejects(db.query('update private.expedition_actors set skill_bonus_pips=$2 where id=$1',[aid,JSON.stringify({unknown:1})]),/Invalid actor skill/);
  assert.deepEqual((await one('select private.combat_hero_before_loadout($1) s',[cid])).s,baseline,'Companion mutations never alter captain');

  const other = crypto.randomUUID();
  await db.query(`insert into characters(user_id,captain_name,species_id,class_id,attribute_pips,skill_bonus_pips)
    select $1,'Other',species_id,class_id,attribute_pips,skill_bonus_pips from characters where id=$2`,[other,cid]);
  const otherCid = (await one('select id from characters where user_id=$1',[other])).id;
  await db.query('insert into character_progress(character_id) values($1)',[otherCid]);
  assert.equal((await one('select count(*)::int n from private.expedition_actors where id=$1',[otherCid])).n,1,'New captain trigger');
  await db.exec('set role authenticated');
  assert.equal((await one('select public.get_expedition_roster() r')).r.actors.length,2);
  await assert.rejects(sheet(otherCid),/Actor not found/);
  await assert.rejects(db.query('select private.expedition_actor_context($1)',[aid]),/permission denied/);
  await assert.rejects(db.query('select * from private.expedition_actors'),/permission denied/);
  await assert.rejects(db.query('delete from private.expedition_actor_equipment'),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  assert.equal((await one('select public.get_expedition_roster() r')).r.actors.length,1);
  await assert.rejects(sheet(aid),/Actor not found/);
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(db.query('select public.get_expedition_roster()'),/Login required/);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select public.get_expedition_roster()'),/permission denied/);
  await db.exec('reset role');
  assert.equal((await one("select bool_and(relrowsecurity) p from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r' and c.relname like 'expedition_actor%'")).p,true);
  assert.equal((await one("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'expedition_%' and has_function_privilege('authenticated',p.oid,'execute')")).n,0);
  await db.query('delete from characters where id=$1',[cid]);
  assert.equal((await one('select count(*)::int n from private.expedition_actor_nodes')).n,0);
  assert.equal((await one('select count(*)::int n from private.expedition_actor_equipment')).n,0);
  assert.equal((await one('select count(*)::int n from private.expedition_actors')).n,1);
  console.log('PASS actor SQL: exact legacy captain parity; shared HP/defense/skills/powers/equipment; branch growth; injuries; ownership, grants, RLS, new-captain registration and isolated cascade.');
} catch (error) {
  console.error(error.stack, error.detail ?? '', error.where ?? '');
  process.exitCode = 1;
} finally {
  await db.close();
}
