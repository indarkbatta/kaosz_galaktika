import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {setupUnifiedDatabase} from './unified-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json')),{PGlite}=require('@electric-sql/pglite');
const db=new PGlite();try{
 await setupUnifiedDatabase(db);
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const c=(await q('select get_talent_tree_editor_catalog() c')).c,talent=(await q('select get_combat_editor_catalog() c')).c.talents.find(t=>t.species_id===c.species[0].id);
 await assert.rejects(db.exec("update game_powers set kind='passive',target='self',requires_hit=false where slug='basic_body'"),/talent catalog/);
 assert.equal(await q("select to_regclass('game_combat_profiles') r").then(x=>x.r),null);
 const doc={species_id:c.species[0].id,class_id:null,width:32,height:24,is_published:true,nodes:[0,1].map((i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,x:i*7,y:0,name_hu:'Talent '+i,name_en:'Talent '+i,description_hu:'',description_en:'',kind:'passive',power_id:null,talent_id:talent.id,effects:[],min_level:1})),connections:[]};
 // A single catalog definition cannot be purchased twice through duplicated nodes.
 await assert.rejects(db.query('select save_talent_tree(null,null,$1)',[JSON.stringify(doc)]),/already assigned/);doc.nodes.pop();
 const saved=(await q('select save_talent_tree(null,null,$1) t',[JSON.stringify(doc)])).t;
 const preview=(await q('select preview_character_defenses($1,$2,$3,null) p',[c.species[0].id,c.classes[0].id,doc.nodes[0].id])).p;assert.equal(preview.passive_defenses.body,7);
 const before=(await q('select get_talent_tree_editor_catalog() c')).c.trees[0];
 const bad=structuredClone(doc);bad.nodes[0].effects=[{type:'modifier',stat:'defense',key:'body',amount:20}];
 await assert.rejects(db.query('select save_talent_tree($1,$2,$3)',[saved.id,1,JSON.stringify(bad)]),/inline effects/);
 assert.deepEqual((await q('select get_talent_tree_editor_catalog() c')).c.trees[0],before);
 const cid=(await q('select id from characters')).id;
 await db.exec('set role authenticated');
 const learned=(await q('select learn_talent_tree_node($1,1) c',[doc.nodes[0].id])).c;assert.equal(learned.owned.length,1);assert.equal(learned.hp.max_health,14);
 await assert.rejects(db.query('select learn_combat_talent($1,0)',[talent.id]),/talent tree/);
 await db.exec('reset role');
 const actor=(await q('select private.combat_hero($1) a',[cid])).a;
 assert.equal(actor.active_defense_skills.length,5);
 const base=(await q('select private.branch_defenses($1,$2,$3) d',[c.species[0].id,c.classes[0].id,cid])).d;
 // Add another catalog talent, then spend a later shared point in species.
 const effects=[{type:'modifier',stat:'defense',key:'mind',amount:1}];
 const t2=(await q("insert into game_talents(slug,species_id,effects,is_published) values('qa_later',$1,$2,true) returning id",[c.species[0].id,JSON.stringify(effects)])).id;
 doc.nodes.push({...doc.nodes[0],id:'00000000-0000-4000-8000-000000000003',x:7,talent_id:t2});
 await q('select save_talent_tree($1,1,$2)',[saved.id,JSON.stringify(doc)]);await db.exec('update character_progress set level=2');
 await db.exec('set role authenticated');await q('select learn_talent_tree_node($1,2)',[doc.nodes[1].id]);await db.exec('reset role');
 const after=(await q('select private.branch_defenses($1,$2,$3) d',[c.species[0].id,c.classes[0].id,cid])).d;assert.equal(after.body,base.body+2);assert.equal(after.mind,base.mind+1);
 const active={...actor,active_defense:actor.active_defense_skills.find(s=>s.attribute==='body')};
 const activePool=(await q("select private.active_defense_pool($1,'body') p",[JSON.stringify(active)])).p;assert.equal(activePool,actor.skills[active.active_defense.id]);
 assert.equal((await q("select private.active_defense_pool($1,'mind') p",[JSON.stringify(active)])).p,actor.defenses.mind);
 // Real RPC command: authoritative AP cost, idempotent retry and expiry after enemy actions.
 await db.exec("update game_enemies set health=10000,power_ids=array[(select id from game_powers where slug='basic_morale')],attributes='{\"body\":3,\"mind\":3,\"soul\":3,\"morale\":3,\"social\":3}',defenses='{\"body\":0,\"mind\":0,\"soul\":0,\"morale\":0,\"social\":0}'");
 const enemy=(await q('select id from game_enemies limit 1')).id;
 let run=(await q('select simulate_combat($1) r',[enemy])).r;assert.equal(run.state.current,0);
 const skill=run.state.actors[0].active_defense_skills[0],req='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select activate_combat_defense($1,$2,gen_random_uuid(),$3)',[run.id,run.revision,talent.id]),/active defense skill/);
 const result=(await q('select activate_combat_defense($1,$2,$3,$4) r',[run.id,run.revision,req,skill.id])).r;
 assert.equal(result.state.actors[0].action_points,2);assert.equal(result.state.actors[0].active_defense.id,skill.id);
 assert.deepEqual((await q('select activate_combat_defense($1,$2,$3,$4) r',[run.id,run.revision,req,skill.id])).r,result);
 await assert.rejects(db.query('select activate_combat_defense($1,0,gen_random_uuid(),$2)',[run.id,skill.id]),/state changed/);
 const ended=(await q('select combat_action($1,$2,gen_random_uuid(),null,1) r',[run.id,result.revision])).r;
 assert.equal(ended.state.actors[0].action_points,3);assert.equal(ended.state.actors[0].active_defense,null);
 await db.exec('reset role');
 assert.equal((await q("select has_function_privilege('anon','public.activate_combat_defense(uuid,integer,uuid,uuid)','execute') p")).p,false);
 console.log('PASS unified SQL: catalog-only rewards, atomic inline/duplicate rejection, preserved learning, branch growth, skill substitution by attribute, real AP/activation command, idempotency, stale rejection, expiry and grants.');
}finally{await db.close();}
