import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {setupPartyDatabase} from './expedition-party-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json')),{PGlite}=require('@electric-sql/pglite'),{chromium,firefox}=require('playwright');
const db=new PGlite();let server;
try{
 const {cid,companions}=await setupPartyDatabase(db);
 await db.exec(`reset role;update game_items set image_path='hatarvilag/items/qa.webp';
 insert into character_inventory select c.id,i.id,1,now() from characters c cross join game_items i where i.equip_slot='main_weapon';
 set role authenticated;`);
 const result=await build({entryPoints:['tools/qa/expedition-party-browser-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:'/tmp/expedition-team-ui',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'rpc-boundary',setup(b){b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'rpc',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export const supabase={rpc:async(method,args)=>fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})}).then(r=>r.json())};`,loader:'js'}));}}]});
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const methods={get_expedition_team_loadout:[],save_expedition_party:['p_actors','p_revision'],save_expedition_actor_powers:['p_actor','p_powers'],get_expedition_storage:[],equip_expedition_actor:['p_actor','p_slot','p_item','p_storage','p_position'],move_expedition_equipment:['p_from_actor','p_from_slot','p_to_actor','p_to_slot'],drop_inventory_item:['p_item','p_quantity','p_from','p_to','p_position','p_slot','p_crew'],move_storage_item:['p_item','p_quantity','p_to']};
 server=createServer(async(req,res)=>{if(req.url==='/rpc'){let body='';for await(const c of req)body+=c;const {method,args={}}=JSON.parse(body);if(method==='get_published_ui_layout'){res.end(JSON.stringify({data:null,error:null}));return;}try{assert.ok(method in methods,method);const keys=methods[method],r=await db.query('select public.'+method+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') result',keys.map(k=>args[k]??null));res.end(JSON.stringify({data:r.rows[0].result,error:null}));}catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}return;}res.setHeader('content-type','text/html; charset=utf-8');res.end('<meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script>window.captain='+JSON.stringify(cid)+';</script><script>'+js+'</script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 for(const [name,driver] of process.env.TREE_LOCAL_CHROMIUM?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox]]){
 const browser=await driver.launch(process.env.TREE_LOCAL_CHROMIUM?{executablePath:process.env.TREE_LOCAL_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{});
 try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.__toasts=[];window.addEventListener('hatarvilag:toast',e=>window.__toasts.push(e.detail));});
 await page.route('https://**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#263c46"/></svg>'}));
 await page.goto(url);await page.locator('.eq-root').waitFor();
 await page.getByRole('button',{name:'Társak',exact:true}).click();
 for(const [i,actor] of ['Vaskéz','Nyx','Tessel'].entries()){await page.locator('.exp-party-positions>div>button').nth(i+1).click();await page.locator('.exp-party-roster button').filter({hasText:actor}).click();}
 await page.locator('.exp-party-positions>div>button').nth(0).dragTo(page.locator('.exp-party-positions>div>button').nth(2));
 await page.getByRole('button',{name:'CSAPAT MENTÉSE'}).click();await page.waitForFunction(()=>document.querySelector('button:disabled')!==null);
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(e=>e.textContent.includes('CSAPAT MENTÉSE'))?.disabled);
 let saved=(await db.query('select get_expedition_team_loadout() r')).rows[0].r;assert.equal(saved.party.length,4);assert.equal(saved.party[2],cid);
 await page.reload();await page.getByRole('button',{name:'Társak',exact:true}).click();assert.ok((await page.locator('.exp-party-positions>div>button').nth(2).innerText()).includes('QA'));
 await page.getByRole('button',{name:'Powerek',exact:true}).click();await page.getByRole('navigation',{name:'Power karakter'}).getByRole('button',{name:'Vaskéz',exact:true}).click();
 const captainPrepared=saved.actors.find(a=>a.id===cid).prepared;
 await page.locator('.exp-order button').filter({hasText:'Eltávolítás'}).click();await page.getByRole('button',{name:'POWEREK MENTÉSE'}).click();await page.getByRole('button',{name:'POWEREK MENTÉSE'}).isDisabled();
 await page.waitForFunction(()=>document.querySelector('.exp-order button:last-child')?.disabled);
 saved=(await db.query('select get_expedition_team_loadout() r')).rows[0].r;assert.deepEqual(saved.actors.find(a=>a.id===cid).prepared,captainPrepared);assert.equal(saved.actors.find(a=>a.id===companions[0]).prepared.length,Math.max(0,captainPrepared.length-1));
 await page.getByRole('button',{name:'Felszerelés',exact:true}).first().click();await page.locator('.eq-tabs button').filter({hasText:'Vaskéz'}).click();assert.equal(await page.locator('.eq-slot').count(),8);
 await page.locator('[data-storage=cargo].filled').first().dragTo(page.locator('.slot-main_weapon .eq-slot'));
 await page.waitForFunction(()=>document.querySelector('.slot-main_weapon .eq-slot')?.getAttribute('aria-label')?.includes('captain_rifle')&&document.querySelector('.eq-root')?.getAttribute('aria-busy')==='false');
 await page.locator('.slot-main_weapon .eq-slot').dragTo(page.locator('[data-storage=personal][data-position="3"]'));
 await page.waitForFunction(()=>document.querySelector('[data-storage=personal][data-position="3"]')?.classList.contains('filled')&&document.querySelector('.eq-root')?.getAttribute('aria-busy')==='false');
 await page.locator('[data-storage=personal][data-position="3"]').dragTo(page.locator('.slot-main_weapon .eq-slot'));
 await page.waitForFunction(()=>document.querySelector('.slot-main_weapon .eq-slot')?.getAttribute('aria-label')?.includes('captain_rifle')&&document.querySelector('.eq-root')?.getAttribute('aria-busy')==='false');
 await page.reload();await page.locator('.eq-tabs button').filter({hasText:'Vaskéz'}).click();await page.waitForFunction(()=>document.querySelector('.slot-main_weapon .eq-slot')?.getAttribute('aria-label')?.includes('captain_rifle'));
 for(const lang of ['hu','en']){
 await page.goto(url+'/?lang='+lang);await page.locator('.eq-root').waitFor();
 for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:1280,height:720}]){
 await page.setViewportSize(size);
 for(const tab of lang==='hu'?['Felszerelés','Társak','Powerek']:['Equipment','Companions','Powers']){
 await page.locator('.exp-tabs').first().getByRole('button',{name:tab,exact:true}).click();
 for(const selector of ['.exp-loadout',...(tab==='Felszerelés'||tab==='Equipment'?['.eq-root','.eq-tabs']:[])])assert.ok(await page.locator(selector).evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),`${name} ${lang} ${tab} ${selector} ${JSON.stringify(size)}`);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),'No document scroll');
 }
 }
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/expedition-team-loadout.png'});console.log('PASS '+name+': React→HTTP→SQL party drag/save/reload, independent powers, eight gear slots and real inventory DnD round trip, HU/EN × three viewport sizes.');
 }finally{await browser.close();}
 }
}finally{server?.close();await db.close();}
