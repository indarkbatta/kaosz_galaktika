import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {readFile} from 'node:fs/promises';import {setupCombatDatabase} from './combat-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
try{
 await setupCombatDatabase(db);
 for(const f of ['20261021174408_m83_combat_state_and_commands.sql','20261021174740_m84_combat_editor_and_starter_content.sql','20261021181303_m86_combat_content_integrity.sql','20261021182023_m87_combat_encounter_revisions.sql']){console.log('Replay',f);await db.exec(await readFile('supabase/migrations/'+f,'utf8'));}
 const q=async(s,args)=>(await db.query(s,args)).rows;
 console.log('Catalog');let cat=(await q('select public.get_combat_state() data'))[0].data;assert.equal(cat.encounters.length,3);assert.equal(cat.hero.powers.length,7);assert.ok(cat.hero.max_health>20);
 const roll=async(pips,mode)=>(await q('select private.combat_roll($1,$2) r',[pips,mode]))[0].r;
 await db.exec('insert into private.qa_dice(n) values(6),(6),(2)');let r=await roll(3,'skill');assert.equal(r.roll_total,14);assert.deepEqual(r.chains,[[6,6,2]]);
 await db.exec('insert into private.qa_dice(n) values(6),(6)');r=await roll(6,'plain');assert.equal(r.roll_total,12);assert.equal(r.chains.length,2);
 const actor={weapon_pips:12,attributes:{body:9},resistances:{kinetic:4,heat:1},effects:[],injuries:{}};
 r=(await q("select private.combat_damage($1,$1,'{\"weapon\":1}','[\"kinetic\"]') r",[actor]))[0].r;assert.equal(r.pool_pips,8);
 r=(await q("select private.combat_damage($1,$1,'{\"weapon\":1}','[\"kinetic\",\"heat\"]') r",[actor]))[0].r;assert.equal(r.sfe_pips,1);
 r=(await q("select private.combat_damage($1,$2,'{\"dice\":1}','[\"kinetic\"]') r",[actor,{...actor,resistances:{kinetic:9}}]))[0].r;assert.equal(r.damage,0);
 let hurt=(await q("select private.combat_hurt($1,0,'body') a",[{...actor,health:0}]))[0].a;assert.deepEqual(hurt.injuries,{});
 hurt=(await q("select private.combat_hurt($1,4,'body') a",[{...actor,health:0}]))[0].a;assert.equal(hurt.injuries.body,3);
 // Same shared state machine used by live encounters and simulations.
 const enc=cat.encounters[0];const startRequest='88888888-8888-4888-8888-888888888888';let run=(await q('select public.begin_combat($1,$2) r',[enc.id,startRequest]))[0].r;assert.equal(run.status,'active');assert.equal(run.state.current,0);
 const power=run.available_powers.find(p=>p.slug==='basic_body');const rid=run.id;const req='22222222-2222-4222-8222-222222222222';
 let next=(await q('select public.combat_action($1,$2,$3,$4,1) r',[rid,run.revision,req,power.id]))[0].r;
 assert.ok(next.state.events.some(e=>e.type==='attack'));assert.ok(next.state.events.some(e=>e.type==='defense'));
 let replay=(await q('select public.combat_action($1,$2,$3,$4,1) r',[rid,run.revision,req,power.id]))[0].r;assert.equal(replay.revision,next.revision);
 await assert.rejects(q('select public.combat_action($1,$2,$3,$4,1)',[rid,run.revision,'33333333-3333-4333-8333-333333333333',power.id]),/state changed/);
 let count=0;while(next.status==='active'&&count++<100){next=(await q('select public.combat_action($1,$2,$3,$4,1) r',[rid,next.revision,crypto.randomUUID(),power.id]))[0].r;}
 assert.notEqual(next.status,'active');assert.equal((await q('select public.begin_combat($1,$2) r',[enc.id,startRequest]))[0].r.id,rid,'Start replay after completion cannot create a new run');console.log('Full combat:',next.status,'round',next.state.round);
 // Strict equality is a miss. Initiative equality favors actor 0. All RNG is server-side.
 await db.exec('delete from private.qa_dice');
 const skill=(await q("select id from game_skills where attribute='body'"))[0].id;
 const base=structuredClone(cat.hero);base.attributes={body:3,mind:3,soul:3,morale:3,social:3};base.skills={[skill]:3};base.defenses={body:3,mind:3,soul:3,morale:3,social:3};base.effects=[];base.injuries={};base.turn=1;base.cooldowns={};base.uses={};
 const opposing={...structuredClone(base),id:'opponent',player:false,danger:0};
 const tied=(await q('select private.combat_initial($1,$2,$3) s',[base,opposing,{}]))[0].s;assert.deepEqual(tied.order,[0,1]);
 let state={...tied,events:[],actors:[base,opposing],current:0,cursor:0,round:1,status:'active'};
 let resolved=(await q('select private.combat_resolve_action($1,$2,1) s',[state,power.id]))[0].s;
 assert.equal(resolved.events.find(e=>e.type==='defense').hit,false,'Attack == Defense misses');assert.ok(!resolved.events.some(e=>e.type==='damage'));
 // Positive/negative modifiers use strongest magnitude per group, not last-write-wins.
 const mod={type:'modifier',stat:'defense',key:'body',amount:-6,duration:3,group:'test'};
 state.actors[1].effects=[{...mod,source:0,remaining:3,applied_sequence:0}];
 resolved=(await q('select private.combat_apply_effect($1,0,1,$2) s',[state,{...mod,amount:-2,duration:9}]))[0].s;
 assert.equal(resolved.actors[1].effects[0].amount,-6);assert.equal(resolved.actors[1].effects[0].remaining,3);
 // Power cooldown uses the actor turn counter, and operation limits survive later encounters.
 const signature=cat.hero.powers.find(p=>p.limit_scope==='operation'&&p.target==='self');
 assert.equal((await q("select private.combat_power_reason($1,$2,$3) reason",[{...base,turn:1,cooldowns:{[signature.id]:3}},signature,{}]))[0].reason,'cooldown');
 assert.equal((await q("select private.combat_power_reason($1,$2,$3) reason",[base,signature,{[signature.id]:2}]))[0].reason,'limit');
 assert.equal((await q("select private.combat_power_reason($1,$2,$3) reason",[{...base,turn:3,cooldowns:{[signature.id]:3}},signature,{}]))[0].reason,null);
 // Healing and ongoing rolls do not explode; injury at zero attribute extracts.
 hurt=(await q("select private.combat_hurt($1,2,'body') a",[{...base,health:0,injuries:{body:0}}]))[0].a;assert.equal(hurt.extracted,true);
 const xpBefore=(await q('select xp_total from character_progress'))[0].xp_total;
 let sim=(await q('select public.simulate_combat($1,$2) r',[cat.encounters[1].enemy_id,cat.encounters[2].enemy_id]))[0].r;assert.equal(sim.simulation,true);
 for(let i=0;i<100&&sim.status==='active';i++){const ready=sim.available_powers.find(p=>!p.blocked_reason);sim=(await q('select public.combat_action($1,$2,$3,$4,$5) r',[sim.id,sim.revision,crypto.randomUUID(),ready?.id||null,ready?.target==='self'?0:1]))[0].r;}
 assert.notEqual(sim.status,'active');assert.equal((await q('select xp_total from character_progress'))[0].xp_total,xpBefore,'Simulation never awards XP');
 // Separate talent points: existing skill points are unchanged; branch rank affects Defense/HP.
 await db.exec('update character_progress set level=3,upgrade_points=4');let before=(await q('select public.get_combat_state() s'))[0].s;
 const talent=before.talents[0];await q('select public.learn_combat_talent($1,0)',[talent.id]);let after=(await q('select public.get_combat_state() s'))[0].s;
 assert.equal(after.talent_points,before.talent_points-1);assert.equal((await q('select upgrade_points from character_progress'))[0].upgrade_points,4);assert.ok(after.hero.max_health>before.hero.max_health);
 await assert.rejects(q('select public.learn_combat_talent($1,0)',[talent.id]),/rank changed/);
 // Editor atomic save/reload and stale revision. Invalid definitions never reach persistence.
 const saved=(await q("select public.save_combat_content('powers',null,$1,$2,'[]',null) r",[{slug:'qa_support',kind:'active',target:'self',range_kind:'self',requires_hit:false,effects:[{type:'heal',formula:{dice:1}}]},[{locale:'hu',name:'Teszt',description:''},{locale:'en',name:'Test',description:''}]]))[0].r;
 assert.equal(saved.slug,'qa_support');
 const preview=(await q('select public.simulate_power($1,$2,null) r',[saved.id,cat.encounters[0].enemy_id]))[0].r;assert.equal(preview.available_powers.length,1);assert.equal(preview.available_powers[0].id,saved.id);assert.equal(preview.simulation,true);
 await assert.rejects(q("select public.save_combat_content('powers',$1,'{\"slug\":\"qa_support\"}',$2,'[]',0)",[saved.id,[{locale:'hu',name:'Teszt'},{locale:'en',name:'Test'}]]),/Content changed/);
 await assert.rejects(q("insert into game_powers(slug,requires_hit,effects) values('invalid_formula',false,$1)",[[{type:'damage',formula:{javascript:'bad'},damage_types:['kinetic']}]]),/Invalid formula/);
 // Ongoing damage is plain, ticks on affected turns, and expires; cleanse never removes passives.
 let timed=structuredClone(tied);timed.status='active';timed.current=1;timed.cursor=1;timed.actors[0]={...structuredClone(base),health:20,max_health:20,resistances:{},effects:[{type:'ongoing_damage',formula:{dice:1},damage_types:['kinetic'],duration:2,remaining:2,source:1,applied_sequence:0,group:'burn'}]};
 await db.exec('delete from private.qa_dice;insert into private.qa_dice(n) values(6),(6)');
 timed=(await q('select private.combat_next_turn($1) s',[timed]))[0].s;assert.equal(timed.actors[0].health,14);assert.equal((await q('select count(*) n from private.qa_dice'))[0].n,1,'Ongoing six does not explode');await db.exec('delete from private.qa_dice');
 timed=(await q('select private.combat_resolve_action($1,null,0) s',[timed]))[0].s;assert.equal(timed.actors[0].effects[0].remaining,1);
 timed=(await q('select private.combat_next_turn(private.combat_next_turn($1)) s',[timed]))[0].s;assert.equal(timed.actors[0].health,11);
 timed=(await q('select private.combat_resolve_action($1,null,0) s',[timed]))[0].s;assert.equal(timed.actors[0].effects.length,0);
 const pass={type:'modifier',stat:'defense',key:'body',amount:1,group:'clean'};timed.actors[0].effects=[pass,{...pass,amount:-3,duration:2,remaining:2}];
 timed=(await q('select private.combat_apply_effect($1,0,0,$2) s',[timed,{type:'cleanse',group:'clean'}]))[0].s;assert.deepEqual(timed.actors[0].effects,[pass]);
 // Two queued concurrent submissions with one expected revision cannot produce two active actions.
 let concurrent=(await q('select public.simulate_combat($1,$2) r',[cat.encounters[0].enemy_id,cat.encounters[0].enemy_id]))[0].r;
 const concurrentPower=concurrent.available_powers.find(p=>!p.blocked_reason);
 const attempts=await Promise.allSettled([0,1].map(()=>q('select public.combat_action($1,$2,$3,$4,1) r',[concurrent.id,concurrent.revision,crypto.randomUUID(),concurrentPower.id])));
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);assert.equal(attempts.filter(x=>x.status==='rejected').length,1);
 assert.equal((await q("select count(*) n from combat_events where run_id=$1 and event->>'type'='power' and event->>'source'='0'",[concurrent.id]))[0].n,1);
 const snapshot=(await q('select state,revision from combat_runs where id=$1',[concurrent.id]))[0];
 if(snapshot.state.status==='active')await assert.rejects(q('select public.combat_action($1,$2,$3,$4,99)',[concurrent.id,snapshot.revision,crypto.randomUUID(),concurrentPower.id]),/Invalid combat action/);
 assert.deepEqual((await q('select state,revision from combat_runs where id=$1',[concurrent.id]))[0],snapshot);
 // Operation use counters persist across retreat/restart, until an explicit base return.
 let limited=(await q('select public.start_combat($1) r',[enc.id]))[0].r;
 const limitedPower=limited.available_powers.find(p=>p.id===signature.id);
 for(let use=0;use<2;use++){
  while(limited.available_powers.find(p=>p.id===limitedPower.id).blocked_reason==='cooldown')limited=(await q('select public.combat_action($1,$2,$3,null,0) r',[limited.id,limited.revision,crypto.randomUUID()]))[0].r;
  limited=(await q('select public.combat_action($1,$2,$3,$4,0) r',[limited.id,limited.revision,crypto.randomUUID(),limitedPower.id]))[0].r;
 }
 assert.equal(limited.state.operation_uses[limitedPower.id],2);
 await q('select public.retreat_combat($1,$2,$3)',[limited.id,limited.revision,crypto.randomUUID()]);
 let resumed=(await q('select public.start_combat($1) r',[enc.id]))[0].r;assert.equal(resumed.available_powers.find(p=>p.id===limitedPower.id).blocked_reason,'limit');
 await q('select public.retreat_combat($1,$2,$3)',[resumed.id,resumed.revision,crypto.randomUUID()]);await q('select public.return_from_combat(false)');
 resumed=(await q('select public.start_combat($1) r',[enc.id]))[0].r;assert.notEqual(resumed.available_powers.find(p=>p.id===limitedPower.id).blocked_reason,'limit');await q('select public.retreat_combat($1,$2,$3)',[resumed.id,resumed.revision,crypto.randomUUID()]);
 // Every editor type roundtrips through the same server authoring function.
 const editor=(await q('select public.get_combat_editor_catalog() c'))[0].c;
 for(const kind of ['profiles','rules','encounters']){
  const doc=structuredClone(kind==='rules'?editor.rules:editor[kind][0]);const id=doc.id,revision=doc.revision;delete doc.id;delete doc.revision;
  if(kind==='profiles')doc.hp_per_rank=9;if(kind==='rules')doc.recovery_energy=7;if(kind==='encounters')doc.energy_cost=3;
  const row=(await q('select public.save_combat_content($1,$2,$3,$4,$5,$6) r',[kind,kind==='rules'?null:id,doc,[],[],revision]))[0].r;assert.equal(row.revision,revision+1,kind+' revision');
 }
 // Healing rolls are also plain and leave injury penalties intact.
 await db.exec('delete from private.qa_dice;insert into private.qa_dice(n) values(6),(6)');let healing=structuredClone(tied);healing.actors[0]={...base,health:0,max_health:20,injuries:{body:3}};
 healing=(await q('select private.combat_apply_effect($1,0,0,$2) s',[healing,{type:'heal',formula:{dice:1}}]))[0].s;assert.equal(healing.actors[0].health,6);assert.equal(healing.actors[0].injuries.body,3);assert.equal((await q('select count(*) n from private.qa_dice'))[0].n,1);await db.exec('delete from private.qa_dice');
 // No account without editor permission can edit or simulate; owner access is enforced separately.
 await db.exec("select set_config('qa.editor','no',false);set role authenticated;");
 await assert.rejects(q('select public.simulate_combat($1,$2)',[cat.encounters[1].enemy_id,null]),/Editor permission/);
 await assert.rejects(q("select public.save_combat_content('powers',null,'{}','[]','[]',null)"),/Editor permission/);
 await assert.rejects(q("update character_combat_progress set health=999"),/permission denied/);
 await db.exec("reset role;insert into auth.users values('99999999-9999-4999-8999-999999999999');select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);set role authenticated;");
 assert.equal((await q('select * from combat_runs')).length,0,'Other account cannot see combat state');
 await assert.rejects(q('select public.combat_action($1,1,$2,null,0)',[rid,crypto.randomUUID()]),/Combat not found/);
 await db.exec('reset role;set role anon');await assert.rejects(q('select public.get_combat_state()'),/permission denied/);
 console.log('PASS combat PostgreSQL: dice chains/plain exceptions, tie rules, SFE/hybrid/zero, injuries/extraction, strongest effects, cooldown/operation limits, complete PvE, idempotency/stale state, separate talents, shared enemy-vs-enemy simulation, editor persistence/validation, RLS and ownership');
}catch(e){console.error(e.stack?.split('\n').slice(0,5).join('\n'));console.error(e.message,'position',e.position,'query',e.internalQuery||'');process.exitCode=1;}finally{await db.close();}
