import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {setupFactionDatabase,factionCatalog} from './faction-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));
const {PGlite}=require('@electric-sql/pglite'),{chromium,firefox}=require('playwright');
const mock=`export const supabase={from(table){const q={select(){return q},order(){return q},then(resolve,reject){return fetch('/data/'+table).then(r=>r.json()).then(resolve,reject)}};return q},rpc(method,args){return fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})}).then(r=>r.json())}};`;
const out=await build({entryPoints:['tools/qa/faction-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:'/tmp/faction-test',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'mock',setup(b){b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'mock',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:mock,loader:'js'}));}}]});
const js=out.outputFiles.find(x=>x.path.endsWith('.js')).text,css=out.outputFiles.find(x=>x.path.endsWith('.css'))?.text||'';
let db,readFailure=false;
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/flags'){let body='';for await(const chunk of req)body+=chunk;const flags=JSON.parse(body);readFailure=!!flags.readFailure;res.end('{}');return;}
  if(req.url.startsWith('/data/')){
   const table=req.url.slice(6);let data;
   if(table==='game_factions'){if(readFailure){readFailure=false;throw new Error('Readback unavailable');}data=await factionCatalog(db);}
   else if(table==='game_quadrants')data=(await db.query('select q.*,row_to_json(g) game_galaxies from game_quadrants q join game_galaxies g on g.id=q.galaxy_id')).rows;
   else if(table==='game_items')data=(await db.query("select i.*,coalesce((select jsonb_agg(t) from game_items_i18n t where t.item_id=i.id),'[]') game_items_i18n from game_items i")).rows;
   else throw new Error('Unknown table');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;
  }
  if(req.url==='/rpc'){
   let body='';for await(const chunk of req)body+=chunk;const {method,args:a}=JSON.parse(body);assert.equal(method,'save_game_faction');
   const data=(await db.query('select public.save_game_faction($1,$2,$3,$4,$5) result',[a.p_faction,a.p_presence,a.p_companies,a.p_tiers,a.p_expected_revision])).rows[0].result;
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}));return;
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script>'+js+'</script>');
 }catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{message:e.message}}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,driver] of (process.env.FACTION_LOCAL_CHROMIUM?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox]])){
  db=new PGlite();await setupFactionDatabase(db);await db.exec('set role authenticated');
  const browser=await driver.launch(process.env.FACTION_LOCAL_CHROMIUM?{headless:true,executablePath:process.env.FACTION_LOCAL_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await page.getByText('Még nincs frakció. Hozz létre egyet.').waitFor();
   await page.getByLabel('Azonosító',{exact:true}).fill('nova_faction');await page.getByLabel('Frakció neve (HU)',{exact:true}).fill('Nova Szövetség');
   await page.getByRole('button',{name:'English',exact:true}).click();await page.getByLabel('Frakció neve (EN)',{exact:true}).fill('Nova Alliance');
   await page.getByLabel('Publikált frakció',{exact:true}).check();await page.getByRole('button',{name:'MENTÉS',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'Publikáláshoz válassz home quadránst.'}).waitFor();assert.equal((await factionCatalog(db)).length,0);
   const quadrants=(await db.query('select * from game_quadrants order by name_en')).rows;
   await page.getByLabel('Home quadráns',{exact:true}).selectOption(quadrants[0].id);await page.getByLabel('Jelenlét — Észak',{exact:true}).selectOption('dominant');await page.getByLabel('Jelenlét — Dél',{exact:true}).selectOption('covert');
   await page.getByRole('button',{name:'Cégek',exact:true}).click();await page.getByRole('button',{name:'Cég hozzáadása'}).click();
   await page.getByLabel('Cég neve (EN)',{exact:true}).fill('Nova Mining');await page.getByLabel('Tevékenység / iparág (EN)',{exact:true}).fill('Mining');await page.getByRole('button',{name:'Magyar',exact:true}).click();await page.getByLabel('Cég neve (HU)',{exact:true}).fill('Nova Bányászat');
   await page.getByRole('button',{name:'Reputáció és jutalmak',exact:true}).click();await page.getByRole('button',{name:'Mérföldkő hozzáadása'}).click();await page.getByLabel('Pontküszöb',{exact:true}).fill('100');await page.getByLabel('Rang neve (HU)',{exact:true}).fill('Partner');await page.getByLabel('Credit jutalom',{exact:true}).fill('250');await page.getByRole('button',{name:'Tárgy hozzáadása'}).click();await page.getByLabel('Mennyiség',{exact:true}).fill('3');
   await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.getByText('Nincs mentetlen módosítás',{exact:true}).waitFor();
   let saved=(await factionCatalog(db))[0];assert.equal(saved.tiers[0].credits,250);assert.equal(saved.tiers[0].items[0].quantity,3);assert.equal(saved.companies[0].name_en,'Nova Mining');assert.equal(saved.presence.length,2);const companyId=saved.companies[0].id,tierId=saved.tiers[0].id;
   await page.reload();await page.getByLabel('Azonosító',{exact:true}).waitFor();assert.equal(await page.getByLabel('Frakció neve (HU)',{exact:true}).inputValue(),'Nova Szövetség');
   await page.getByRole('button',{name:'Reputáció és jutalmak',exact:true}).click();assert.equal(await page.getByLabel('Credit jutalom',{exact:true}).inputValue(),'250');
   // Lost readback is visible, retains dirty state, and the returned ID avoids duplicate insertion on retry.
   await page.getByLabel('Credit jutalom',{exact:true}).fill('300');await fetch(origin+'/flags',{method:'POST',body:JSON.stringify({readFailure:true})});await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.getByRole('alert').filter({hasText:'Readback unavailable'}).waitFor();await page.getByText('● Nem mentett módosítások',{exact:true}).waitFor();await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.getByText('Nincs mentetlen módosítás',{exact:true}).waitFor();
   saved=(await factionCatalog(db))[0];assert.equal(saved.tiers[0].id,tierId);assert.equal(saved.companies[0].id,companyId);assert.equal(saved.revision,3);assert.equal((await factionCatalog(db)).length,1);
   await page.getByRole('button',{name:'Cégek',exact:true}).click();await page.getByRole('button',{name:'Cég törlése',exact:true}).click();
   await page.getByRole('button',{name:'Új frakció',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Folytatom a szerkesztést'}).click();assert.equal(await page.getByRole('button',{name:'Cég törlése',exact:true}).count(),0);
   await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.getByText('Nincs mentetlen módosítás',{exact:true}).waitFor();assert.equal((await factionCatalog(db))[0].companies.length,0);
   await page.getByRole('button',{name:'Language',exact:true}).click();await page.getByRole('button',{name:'Reputation & rewards',exact:true}).click();await page.getByLabel('Credit reward',{exact:true}).waitFor();assert.equal(await page.getByLabel('Credit reward',{exact:true}).inputValue(),'300');
   const bounds=await page.locator('.ed-shell').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));assert.ok(bounds.scroll<=bounds.width+1,'No horizontal overflow');assert.deepEqual(errors,[]);
   if(process.env.FACTION_LOCAL_CHROMIUM)await page.screenshot({path:'/tmp/faction-editor.png'});
   console.log('PASS '+name+': actual editor → HTTP → PostgreSQL, validation, bilingual names, quadrants, company, reward credit/item, full reload, readback failure/retry, stable IDs, company removal, unsaved guard, English UI');
  }finally{await browser.close();await db.close();}
 }
}finally{server.close();}
