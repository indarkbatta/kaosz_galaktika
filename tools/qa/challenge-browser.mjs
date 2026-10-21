import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const require=createRequire(join(resolve(process.env.WORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const steps=ids.map((id,i)=>({name_hu:'Lépés '+i,name_en:'Step '+i,description_hu:'Próba',
description_en:'Test',skill_ids:[id],base_tn:9+i,energy_cost:6+i}));
const initial={game_skill_challenges:[{id:'challenge1',slug:'silent_relay',location_id:'station',name_hu:'A néma adóállomás',
name_en:'Silent Relay',description_hu:'Négylépcsős kihívás',description_en:'Mission',
steps,xp_full:75,xp_partial:30,xp_failure:10,repeatable:false,cooldown_hours:24,is_published:true}],
character_skill_challenge_runs:[],character_skill_challenge_rolls:[],energy:100,xp:0,calls:[]};
const mock="const db=window.__fixture;\nconst ok=data=>Promise.resolve({data,error:null});\nexport const supabase={from(table){return {select(){\n const where=[];const q={eq(k,v){where.push([k,v]);return q;},order(){return q;},limit(){return q;},\n then(res,rej){return ok(JSON.parse(JSON.stringify(db[table].filter(row=>where.every(([k,v])=>row[k]===v))))).then(res,rej);}};\n return q;\n}};},\nrpc(method,args){\n db.calls.push({method,args});\n if(method==='start_skill_challenge'){\n  const m=db.game_skill_challenges[0];\n  db.character_skill_challenge_runs.unshift({id:'run1',challenge_id:m.id,character_id:'captain',\n  definition:{steps:m.steps,location_id:m.location_id},difficulty:args.p_difficulty,\n  level_at_start:1,step_index:0,successes:0,status:'active',xp_awarded:0,reward_qty:0,\n  started_at:new Date().toISOString(),finished_at:null});\n  return ok({run_id:'run1'});\n }\n if(method==='roll_skill_challenge'){\n  const r=db.character_skill_challenge_runs[0];if(args.p_step_index!==r.step_index)\n   return Promise.resolve({data:null,error:{message:'Stale step'}});\n  const step=r.definition.steps[r.step_index],target=step.base_tn+3;\n  db.character_skill_challenge_rolls.push({id:r.step_index+1,run_id:r.id,\n  step_index:r.step_index,skill_id:args.p_skill,dice:[6,6,5],pip_bonus:0,\n  roll_total:17,target_number:target,succeeded:true,energy_spent:step.energy_cost});\n  r.step_index++;r.successes++;db.energy-=step.energy_cost;\n  if(r.step_index===4){r.status='success';r.xp_awarded=112;db.xp=112;r.finished_at=new Date().toISOString();}\n  return ok({run_id:r.id,dice:[6,6,5],pip_bonus:0,roll_total:17,target_number:target,\n  succeeded:true,status:r.status,xp_awarded:r.status==='active'?0:r.xp_awarded});\n }\n return Promise.resolve({data:null,error:{message:'Unknown action'}});\n}};";
const temp=await mkdtemp(join(tmpdir(),'challenge-browser-'));let server;
try{
 const out=await build({entryPoints:['tools/qa/challenge-fixture.tsx'],bundle:true,
 write:false,format:'iife',outdir:temp,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{
  name:'mock',setup(b){
   b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'fake-supabase',namespace:'qa'}));
   b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:mock,loader:'js'}));
  }
 }]});
 const js=out.outputFiles.find(x=>x.path.endsWith('.js')).text;
 const css=out.outputFiles.find(x=>x.path.endsWith('.css'))?.text||'';
 const html='<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;background:#08131d;color:#eff4f7}'+css+'</style><div id="root"></div><script>window.__fixture='+JSON.stringify(initial)+'</script><script>'+js+'</script>';
 server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(const [name,driver] of [['chromium',chromium],['firefox',firefox]]){
  const b=await driver.launch({headless:true});
  try{
   const page=await b.newPage({viewport:{width:1350,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.getByRole('button',{name:/Indítás/}).click();
   const modal=page.getByRole('dialog',{name:'Skill Challenge'});await modal.waitFor();
   await modal.getByRole('button',{name:/Nehéz/}).click();
   await modal.getByRole('button',{name:'Kihívás indítása'}).click();
   await modal.getByText('TN 12').waitFor();
   assert.equal(await page.evaluate(()=>window.__fixture.xp),0);
   await modal.locator('.sc-skill-choices button').first().click();
   await modal.getByText('TN 13').waitFor();
   await modal.getByRole('button',{name:'Bezárás'}).click();
   await page.getByRole('button',{name:/Folytatás/}).click();
   await modal.getByText('TN 13').waitFor();
   for(let i=1;i<4;i++){
    await modal.locator('.sc-skill-choices button').first().click();
    if(i<3)await modal.getByText('TN '+(13+i)).waitFor();
   }
   await modal.getByText('TELJES SIKER').waitFor();
   const d=await page.evaluate(()=>window.__fixture);
   assert.equal(d.character_skill_challenge_rolls.length,4);
   assert.equal(d.xp,112);assert.equal(d.energy,70);
   assert.deepEqual(errors,[]);
   console.log(name+': PASS difficulty, 4 persisted steps, resume and end-only XP');
  }finally{await b.close();}
 }
}finally{if(server)await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
