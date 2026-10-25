import {assertEditorRosterLayout} from './editor-roster-layout.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {setupBlueprintDatabase} from './equipment-blueprints-database.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json')),{PGlite}=require('@electric-sql/pglite'),{chromium,firefox}=require('playwright');
const db=new PGlite();let server;
try{
 await setupBlueprintDatabase(db);
 await db.exec(`alter table game_items add column rarity text default 'common',add column capacity_bonus integer default 0,add column manufacturer_faction_id uuid,add column manufacturer_company_id uuid;create table game_item_recipes(output_item_id uuid,ingredient_item_id uuid,quantity int);create table game_faction_companies(id uuid,faction_id uuid,name_hu text,name_en text);`);
 for(let n=0;n<23;n++){
  const id=(await db.query("insert into game_items(slug,image_path) values($1,'hatarvilag/item.png') returning id",['qa_part_'+n])).rows[0].id;
  await db.query('insert into game_items_i18n values($1,$2,$3,$4),($1,$5,$6,$4)',[id,'hu','Alkatrész '+n,'','en','Part '+n]);
  await db.query('select public.save_equipment_blueprint($1,$2,null)',[id,{kind:'component',family:n===6?'helmet':'weapon',type_code:n===6?'visor':n===5?'grip':'barrel',slots:[]}]);
 }
 const mock=`export const supabase={from(table){const q={select(){return q},order(){return q},eq(){return q},then(resolve,reject){return fetch('/data',{method:'POST',body:JSON.stringify({table})}).then(r=>r.json()).then(resolve,reject)}};return q},rpc(method,args={}){return fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})}).then(r=>r.json())}};`;
 const out=await build({entryPoints:['tools/qa/components-browser-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:'/tmp/component-qa',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'mock',setup(b){b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'mock',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:mock,loader:'js'}));}}]});
 const js=out.outputFiles.find(f=>f.path.endsWith('.js')).text,css=out.outputFiles.find(f=>f.path.endsWith('.css')).text;
 server=createServer(async(req,res)=>{
  if(req.url==='/data'||req.url==='/rpc'){
   let body='';for await(const c of req)body+=c;const args=JSON.parse(body);
   try{let data;if(req.url==='/data'){
    assert.ok(['game_items','game_item_recipes','game_locales','game_factions','game_faction_companies','game_skills'].includes(args.table));
    data=(await db.query(args.table==='game_items'?`select i.*,coalesce((select jsonb_agg(t) from game_items_i18n t where t.item_id=i.id),'[]') game_items_i18n from game_items i order by slug`:'select * from '+args.table)).rows;
   }else{assert.ok(['get_equipment_blueprint_catalog','save_equipment_blueprint'].includes(args.method));data=args.method==='get_equipment_blueprint_catalog'?(await db.query('select public.get_equipment_blueprint_catalog() r')).rows[0].r:(await db.query('select public.save_equipment_blueprint($1,$2,$3) r',[args.args.p_item,args.args.p_document,args.args.p_revision])).rows[0].r;}
   res.end(JSON.stringify({data,error:null}));}catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}return;
  }
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<style>'+css+'</style><div id="root"></div><script>'+js+'</script>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 for(const [name,driver] of process.env.COMBAT_LOCAL_CHROMIUM?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox]]){
  const browser=await driver.launch(process.env.COMBAT_LOCAL_CHROMIUM?{executablePath:process.env.COMBAT_LOCAL_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{});
  try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://assets.voidnoir.net/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGOQc4siCTGMahjVMHw1AADIDr4BHZ+22QAAAABJRU5ErkJggg==','base64')}));
   for(const locale of ['hu','en'])for(const [width,height] of [[1920,1080],[1366,768],[1280,720]]){
    const en=locale==='en';await page.setViewportSize({width,height});await page.goto(url+'?locale='+locale);const type=page.getByLabel(en?'Component type':'Komponensfajta',{exact:true});await type.waitFor();await assertEditorRosterLayout(page);assert.equal(await page.locator('.ed-record').count(),23,'Every filtered record is rendered');assert.equal(await page.getByLabel(en?'Item role':'Tárgy szerepe',{exact:true}).inputValue(),'component');assert.equal(await page.getByLabel(en?'Item role':'Tárgy szerepe',{exact:true}).isDisabled(),true);
    assert.equal(await page.locator('.ed-roster').innerText().then(s=>s.includes('captain_rifle')),false);
    assert.equal(await page.locator('.ed-roster .ed-pager').count(),0);const list=page.locator('.ed-roster-list');await list.hover();await page.mouse.wheel(0,1400);await page.waitForFunction(()=>document.querySelector('.ed-roster-list').scrollTop>0);await page.locator('.ed-record').last().scrollIntoViewIfNeeded();const last=await page.locator('.ed-record').last().boundingBox(),bounds=await list.boundingBox();assert.ok(last.y>=bounds.y&&last.y+last.height<=bounds.y+bounds.height+1,'Last record is reachable by scrolling');assert.equal(await page.locator('.ed-editor').evaluate(e=>e.scrollTop),0);
    const family=page.getByLabel(en?'Family filter':'Család szűrő',{exact:true}),kind=page.getByLabel(en?'Type filter':'Fajta szűrő',{exact:true}),search=page.getByLabel(en?'Search components':'Komponens keresése',{exact:true});
    await family.selectOption('helmet');assert.equal(await page.locator('.ed-record').count(),1);await kind.selectOption('barrel');assert.equal(await page.locator('.ed-record').count(),0);await kind.selectOption('visor');assert.equal(await page.locator('.ed-record').count(),1);await search.fill('NOT_FOUND');assert.equal(await page.locator('.ed-record').count(),0);await search.fill('qa_part_6');assert.equal(await page.locator('.ed-record').count(),1);await page.locator('.ed-record').click();await page.waitForFunction(()=>document.querySelector('select[aria-label="Komponensfajta"],select[aria-label="Component type"]')?.value==='visor');
    await type.selectOption('shell');await page.getByRole('button',{name:en?'Items':'Tárgyak',exact:true}).click();await page.getByRole('button',{name:en?'Back to editing':'Vissza a szerkesztéshez',exact:true}).click();assert.equal(await type.inputValue(),'shell');
    for(const sel of ['.ed-roster','.ed-roster-list','.bp-form'])assert.equal(await page.locator(sel).evaluate(e=>e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1),false,sel+' '+locale+' '+width);
    await page.getByRole('button',{name:en?'Items':'Tárgyak',exact:true}).click();await page.getByRole('button',{name:en?'Discard changes':'Módosítások elvetése',exact:true}).click();await page.locator('.ed-record').filter({hasText:'captain_rifle'}).waitFor();assert.ok((await page.locator('.ed-record').count())>23);assert.ok((await page.locator('.ed-record').filter({hasText:'qa_part_6'}).count())===1);
   }
   await page.setViewportSize({width:1280,height:720});
   await page.goto(url+'?locale=hu');await page.getByLabel('Komponensfajta',{exact:true}).waitFor();await page.getByLabel('Komponens keresése',{exact:true}).fill('qa_part_6');await page.locator('.ed-record').click();await page.waitForFunction(()=>document.querySelector('select[aria-label="Komponensfajta"]')?.value==='visor');await page.getByLabel('Komponensfajta',{exact:true}).selectOption('shell');await page.getByRole('button',{name:'KOMPONENS MENTÉSE',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ed-footer span')?.textContent.includes('Minden módosítás mentve'));assert.equal((await db.query("select d.type_code from game_equipment_definitions d join game_items i on i.id=d.item_id where i.slug='qa_part_6'")).rows[0].type_code,'shell');await page.getByLabel('Fajta szűrő',{exact:true}).selectOption('shell');assert.equal(await page.locator('.ed-record').count(),1);
   await page.getByRole('button',{name:'Új komponens',exact:true}).click();await page.getByLabel('Azonosító',{exact:true}).fill('qa_new_component');assert.equal(await page.getByLabel('Azonosító',{exact:true}).inputValue(),'qa_new_component');assert.equal(await page.getByRole('button',{name:'MENTÉS',exact:true}).isEnabled(),true);
   assert.deepEqual(errors,[]);console.log('PASS '+name+': component-only scrolling list, all 23 records rendered and last record reachable without paging, combined family/type/name/slug filters and empty results, component classification, unsaved cancel/discard, items retain components; HU/EN three desktop sizes without overflow.');
  }finally{await browser.close();}
 }
}finally{server?.close();await db.close();}
