import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {resolve} from 'node:path';import {build} from 'esbuild';import {createServer} from 'node:http';
import {setupManufacturerDatabase,manufacturerItems,saveManufacturer} from './item-manufacturer-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));const {PGlite}=require('@electric-sql/pglite'),{chromium,firefox}=require('playwright');
const mock=`export const supabase={from(table){const q={select(){return q},order(){return q},eq(){return q},then(res,rej){return fetch('/data/'+table).then(r=>r.json()).then(res,rej)}};return q},rpc(method,args){return fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})}).then(r=>r.json())}};`;
const out=await build({entryPoints:['tools/qa/item-manufacturer-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:'/tmp/item-maker',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'mock',setup(b){b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'mock',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:mock,loader:'js'}));}}]});
let db;const js=out.outputFiles.find(f=>f.path.endsWith('.js')).text,css=out.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/data/')){const table=req.url.slice(6);assert.ok(['game_items','game_item_recipes','game_locales','game_factions','game_faction_companies'].includes(table));const data=table==='game_items'?await manufacturerItems(db):(await db.query('select * from '+table)).rows;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;}
 if(req.url==='/rpc'){let body='';for await(const c of req)body+=c;const {method,args}=JSON.parse(body);assert.equal(method,'save_game_item_manufacturer');const data=await saveManufacturer(db,args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script>'+js+'</script>');
 }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{message:e.message}}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{for(const [name,driver] of (process.env.FACTION_LOCAL_CHROMIUM?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox]])){
 db=new PGlite();await setupManufacturerDatabase(db);
 const browser=await driver.launch(process.env.FACTION_LOCAL_CHROMIUM?{headless:true,executablePath:process.env.FACTION_LOCAL_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.getByRole('button',{name:'Gyártó',exact:true}).click();const faction=page.getByLabel('Gyártó frakció',{exact:true}),plant=page.getByLabel('Gyártó üzem / cég',{exact:true});
 const factions=(await db.query('select * from game_factions order by slug')).rows,plants=(await db.query('select * from game_faction_companies')).rows;
 const first=plants.find(p=>p.faction_id===factions[0].id),second=plants.find(p=>p.faction_id===factions[1].id);
 await page.waitForFunction(()=>!document.querySelector('.ed-submit').disabled);assert.equal(await plant.isDisabled(),true);
 await faction.selectOption(first.faction_id);assert.equal(await plant.locator('option').count(),2);await plant.selectOption(first.id);
 await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.getByText('Tárgy és gyártó mentve.',{exact:true}).waitFor();
 await page.reload();await page.getByRole('button',{name:'Gyártó',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.ed-submit').disabled);
 assert.equal(await faction.inputValue(),first.faction_id);assert.equal(await plant.inputValue(),first.id);
 await faction.selectOption(second.faction_id);assert.equal(await plant.inputValue(),'');assert.equal(await plant.locator('option').count(),2);await plant.selectOption(second.id);
 await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.ed-submit').disabled);await page.getByRole('button',{name:'Gyártó',exact:true}).click();
 assert.equal((await manufacturerItems(db))[0].manufacturer_company_id,second.id);
 await faction.selectOption('');assert.equal(await plant.inputValue(),'');assert.equal(await plant.isDisabled(),true);await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.ed-submit').disabled);assert.equal((await manufacturerItems(db))[0].manufacturer_faction_id,null);assert.deepEqual(errors,[]);
 console.log('PASS '+name+': ItemEditor → HTTP → PostgreSQL manufacturer RPC, filtered plants, save/full reload, faction-change reset, clear manufacturer');
 }finally{await browser.close();await db.close();}
}}finally{server.close();}
