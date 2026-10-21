// Cross-browser test of real SectorEditor + WorldMapEditor, with in-memory data only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const require=createRequire(join(resolve(process.env.WORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
const sector='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const locs=ids.map((id,i)=>({
 id,slug:['alpha','beta','gamma'][i],sector_id:sector,kind:'station',x:25+i*20,y:40+i*10,
 image_path:null,is_published:true,
 game_locations_i18n:[{locale:'hu',name:['Alfa','Béta','Gamma'][i],description:'Leírás'},
 {locale:'en',name:['Alpha','Beta','Gamma'][i],description:'Description'}]
}));
const database={
 game_locations:locs,
 game_routes:[{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',origin_id:ids[0],
 destination_id:ids[1],energy_cost:8,is_published:true}],
 game_actions:[],game_location_actions:[],
 game_locales:[{code:'hu',native_name:'Magyar'},{code:'en',native_name:'English'}],
 game_sectors:[{id:sector,slug:'test_system',name_hu:'Teszt naprendszer',name_en:'Test system',quadrant_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'}],
 game_locations_i18n:[]
};
const mock="const db=window.__testDB;\nconst ok=(data)=>Promise.resolve({data,error:null});\nconst rows=(table)=>JSON.parse(JSON.stringify(db[table]||[]));\nexport const supabase={\n from(table){return {\n  select(){const q=ok(rows(table));q.order=()=>q;return q;},\n  update(body){return {eq(key,id){for(const x of db[table]||[])if(x[key]===id)Object.assign(x,body);return ok(null);}};},\n  upsert(list){if(table==='game_locations_i18n')db[table]=list;return ok(null);}\n };},\n rpc(name,args){\n  window.__calls.push({name,args});\n  if(name==='save_sector_starmap'){\n   for(const n of args.p_nodes){const x=db.game_locations.find(v=>v.id===n.id);if(x)Object.assign(x,{x:n.x,y:n.y});}\n   db.game_routes=args.p_routes.map((r,i)=>({\n    ...r,id:db.game_routes.find(x=>(x.origin_id===r.origin_id&&x.destination_id===r.destination_id)||\n      (x.origin_id===r.destination_id&&x.destination_id===r.origin_id))?.id||'generated-'+i\n   }));\n   return ok({locations:args.p_nodes.length,routes:db.game_routes.length});\n  }\n  if(name==='replace_sector_links'){\n   if(args.p_routes!==null){\n    db.game_routes=db.game_routes.filter(r=>r.origin_id!==args.p_location&&r.destination_id!==args.p_location);\n    for(const r of args.p_routes)db.game_routes.push({id:'manual-'+r.target,origin_id:args.p_location,\n      destination_id:r.target,energy_cost:r.cost,is_published:true});\n   }\n   return ok(null);\n  }\n  return Promise.resolve({data:null,error:{message:'Unexpected RPC '+name}});\n }\n};";
const scratch=await mkdtemp(join(tmpdir(),'sector-link-regression-'));
let server;
try{
 const bundle=await build({entryPoints:['tools/qa/sector-link-fixture.tsx'],bundle:true,write:false,
 format:'iife',outdir:scratch,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{
 name:'mock-db',setup(build){
  build.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'fixture-db',namespace:'db-mock'}));
  build.onLoad({filter:/.*/,namespace:'db-mock'},()=>({contents:mock,loader:'js'}));
 }
 }]});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
 const boot='window.__testDB='+JSON.stringify(database)+';window.__calls=[];';
 const html='<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%;background:#050910;color:#dce7f0}.ed-layout{height:100vh}.ed-shell{height:95vh}'+css+'</style><div id="root"></div><script>'+boot+'</script><script>'+js.replaceAll('</script','<\\/script')+'</script>';
 server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 for(const [name,driver] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await driver.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);
   const open=page.getByRole('button',{name:/Csillagtérkép/});
   await open.waitFor();
   await open.click();
   const modal=page.getByRole('dialog',{name:'Csillagtérkép szerkesztő'});
   await modal.waitFor();
   assert.equal(await modal.locator('.wm-line').count(),1,'Existing link');
   await modal.getByRole('button',{name:'Összeköttetés'}).click();
   await modal.locator('.wm-node').nth(1).click();
   await modal.locator('.wm-node').nth(2).click();
   assert.equal(await modal.locator('.wm-line').count(),2,'New link drawn');
   await modal.getByRole('button',{name:'Térkép mentése'}).click();
   await modal.waitFor({state:'detached'});
   let actual=await page.evaluate(()=>window.__testDB.game_routes);
   assert.equal(actual.length,2,'Both routes persisted on Starmap save');
   await open.click();await modal.waitFor();
   assert.equal(await modal.locator('.wm-line').count(),2,'Connections reloaded on reopen');
   await modal.getByRole('button',{name:'Mégse'}).click();
   await page.getByRole('button',{name:'MENTÉS',exact:true}).click();
   await page.waitForFunction(()=>window.__calls.some(x=>x.name==='replace_sector_links'));
   let call=await page.evaluate(()=>window.__calls.find(x=>x.name==='replace_sector_links'));
   assert.equal(call.args.p_routes,null,'Unrelated location save must preserve routes');
   actual=await page.evaluate(()=>window.__testDB.game_routes);
   assert.equal(actual.length,2,'Starmap routes remain after location save');
   await open.click();await modal.waitFor();
   assert.equal(await modal.locator('.wm-line').count(),2,'Both connections remain after full round trip');
   await modal.getByRole('button',{name:'Mégse'}).click();
   await page.getByRole('navigation',{name:'Sector Editor'}).getByRole('button',{name:'Akciók / útvonalak'}).click();
   const cost=page.locator('.sector-route-list input[type=number]').first();
   await cost.fill('23');
   await page.getByRole('button',{name:'MENTÉS',exact:true}).click();
   await page.waitForFunction(()=>window.__calls.filter(x=>x.name==='replace_sector_links').length===2);
   call=await page.evaluate(()=>window.__calls.filter(x=>x.name==='replace_sector_links')[1]);
   assert.ok(Array.isArray(call.args.p_routes),'Explicit route edit still submits edges');
   assert.ok(call.args.p_routes.some(x=>x.cost===23));
   assert.deepEqual(errors,[],'No runtime errors');
   console.log(name+': PASS new link persists, survives map reopen and ordinary location save, explicit route edit works');
  }finally{await browser.close();}
 }
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(scratch,{recursive:true,force:true});
}
