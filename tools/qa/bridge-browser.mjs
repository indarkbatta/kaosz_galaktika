import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'node:http';
const require=createRequire(join(resolve(process.env.WORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const initial={game_actions:[{id:'action',slug:'analysis',skill_id:'skill',energy_cost:6,target_number:9,xp_success:10,xp_failure:2,is_published:true,image_path:null,game_actions_i18n:[{locale:'hu',name:'Próba',description:'Tevékenység'},{locale:'en',name:'Test',description:'Activity'}]}],
 game_skill_challenges:[{id:'challenge',slug:'qa',location_id:'station',name_hu:'Kihívás',name_en:'Challenge',description_hu:'Leírás',description_en:'Description',image_path:null,difficulty:'normal',steps:[0,1].map(i=>({name_hu:'Lépés '+i,name_en:'Step '+i,description_hu:'Teszt',description_en:'Test',skill_ids:['skill'],base_tn:9,energy_cost:6})),xp_full:75,xp_partial:30,xp_failure:10,reward_item_id:null,reward_qty:1,repeatable:false,cooldown_hours:24,is_published:true,sort_order:0}],
 game_skills:[{id:'skill',slug:'analysis',icon_path:null,attribute:'mind',game_skills_i18n:[{locale:'hu',name:'Elemzés'}]}],game_locations:[{id:'station',slug:'station',is_published:true,game_locations_i18n:[{locale:'hu',name:'Állomás'}]}],game_locales:[{code:'hu',native_name:'Magyar',is_enabled:true},{code:'en',native_name:'English',is_enabled:true}],gameplay_rules:[{id:1,energy_max:100,energy_regen_seconds:300,xp_level_base:100,skill_points_per_level:1}],character_progress:[{character_id:'captain',level:1,xp_total:0,energy:100,energy_at:new Date().toISOString(),upgrade_points:0}],character_positions:[{character_id:'captain',location_id:'station'}],game_location_actions:[{location_id:'station',action_id:'action'}],calls:[]};
const mock=`const db=window.__fixture;const clone=x=>JSON.parse(JSON.stringify(x));
export const supabase={from(table){let filters=[],patch=null,single=false;
 const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},single(){single=true;return q},update(x){patch=x;return q},upsert(){return q},
 then(res,rej){let rows=(db[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v));if(patch)rows.forEach(r=>Object.assign(r,patch));return Promise.resolve({data:clone(single?rows[0]:rows),error:null}).then(res,rej)}};return q;},
 rpc(method,args){db.calls.push({method,args});if(method==='get_ship_loadout')return Promise.resolve({data:{stats:{ready:true}},error:null});
 if(method==='perform_game_action'){
 const data={log_id:1,action_id:'action',dice:[6,4],wild_dice:[1],wild_cancelled_index:0,wild_penalty:7,wild_rule:'space_d6_remove_highest_v1',pip_bonus:2,roll_total:6,target_number:9,succeeded:false,xp_awarded:2,level_up:false};
 db.character_action_log=[{...data,id:1,character_id:'captain',performed_at:new Date().toISOString()}];db.character_progress[0].energy-=6;
 return new Promise(r=>setTimeout(()=>r({data,error:null}),100));}
 return Promise.resolve({data:null,error:null})}};`;
const out=await build({entryPoints:['tools/qa/bridge-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:'/tmp/bridge-test',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'mock',setup(b){b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'mock',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:mock,loader:'js'}));}}]});
const js=out.outputFiles.find(x=>x.path.endsWith('.js')).text,css=out.outputFiles.find(x=>x.path.endsWith('.css'))?.text||'';
const html='<!doctype html><meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script>window.__fixture='+JSON.stringify(initial)+'</script><script>'+js+'</script>';
const server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const [name,driver] of [['chromium',chromium],['firefox',firefox]]){
 const browser=await driver.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1350,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://assets.voidnoir.net/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')}));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const image=page.getByRole('textbox',{name:'Kép útvonala',exact:true});
 await image.fill('https://assets.voidnoir.net/hatarvilag/worlds/qa.png');
 await page.getByRole('button',{name:'MENTÉS',exact:true}).click();
 await page.waitForFunction(()=>window.__fixture.game_actions[0].image_path==='hatarvilag/worlds/qa.png');
 await page.getByRole('button',{name:'Challenge Editor',exact:true}).click();
 await image.fill('hatarvilag/worlds/challenge.png');
 await page.getByRole('button',{name:'Jutalmak és nehézség'}).click();
 await page.getByLabel('Nehézség',{exact:true}).selectOption('hard');
 await page.getByRole('button',{name:'MENTÉS',exact:true}).click();
 await page.waitForFunction(()=>window.__fixture.game_skill_challenges[0].difficulty==='hard');
 await page.getByRole('button',{name:'Activity Editor',exact:true}).click();await image.waitFor();
 assert.equal(await image.inputValue(),'hatarvilag/worlds/qa.png');
 await page.getByRole('button',{name:'Challenge Editor',exact:true}).click();
 assert.equal(await image.inputValue(),'hatarvilag/worlds/challenge.png');
 await page.getByRole('button',{name:'Bridge',exact:true}).click();await page.locator('.bridge-card').nth(1).waitFor();
 assert.equal(await page.locator('.bridge-card-image img').count(),2);
 const cards=await page.locator('.bridge-card').evaluateAll(xs=>xs.map(x=>({w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height,overflow:x.scrollWidth>x.clientWidth})));
 assert.ok(Math.abs(cards[0].h-cards[1].h)<1);assert.ok(cards.every(x=>!x.overflow));
 await page.getByRole('button',{name:/Végrehajtás/}).dblclick();
 const dialog=page.getByRole('dialog',{name:'Próba'});await dialog.locator('.dice-panel.is-revealed').waitFor();
 assert.equal(await page.evaluate(()=>window.__fixture.calls.filter(x=>x.method==='perform_game_action').length),1);
 assert.equal(await dialog.locator('.wild.cancelled').count(),1);assert.equal(await dialog.locator('.dice-result b').textContent(),'Végösszeg: 6');
 await dialog.getByRole('button',{name:'Vissza a hídra'}).click();
 await page.getByRole('button',{name:'Napló',exact:true}).click();
 await page.getByText('Kockaeredmények',{exact:true}).click();
 await page.locator('.cmd-log .dice-panel.is-revealed').waitFor();assert.equal(await page.locator('.cmd-log .dice-result b').textContent(),'Végösszeg: 6');
 await page.getByRole('button',{name:'Language',exact:true}).click();await page.getByRole('button',{name:'Bridge',exact:true}).last().click();
 await page.getByText('Target Number (TN): 9',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Activity Editor',exact:true}).click();
 await page.getByRole('button',{name:'Remove artwork',exact:true}).click();
 await page.getByRole('button',{name:'SAVE',exact:true}).click();
 await page.waitForFunction(()=>window.__fixture.game_actions[0].image_path===null);
 await page.getByRole('button',{name:'Bridge',exact:true}).click();
 await page.locator('.bridge-card').nth(1).waitFor();
 assert.equal(await page.locator('.bridge-card-image .world-art-fallback').count(),1);
 assert.deepEqual(errors,[]);console.log(name+': PASS both editor artwork save/reload, editor difficulty, shared cards, activity Wild penalty, double click, persisted log and English labels');
 }finally{await browser.close()}}
}finally{await new Promise(r=>server.close(r))}
