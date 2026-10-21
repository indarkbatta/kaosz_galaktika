// Real React -> HTTP fixture API -> PostgreSQL functions -> fresh read -> React.
// Uses an isolated PGlite database; never writes to the user's Supabase project.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const require=createRequire(join(resolve(process.env.WORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const {PGlite}=require('@electric-sql/pglite');
const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
const sector='dddddddd-dddd-4ddd-8ddd-dddddddddddd',other='dddddddd-dddd-4ddd-8ddd-ddddddddddde';
const galaxy='11111111-1111-4111-8111-111111111111',quadrant='22222222-2222-4222-8222-222222222222';
const doc={name_hu:'Teszt',name_en:'Test',description_hu:'',description_en:'',image_path:null,is_published:true,x:50,y:50};
const seed={game_galaxies:[{...doc,id:galaxy,slug:'galaxy'}],game_quadrants:[{...doc,id:quadrant,slug:'quadrant',galaxy_id:galaxy}],
 game_sectors:[{...doc,id:sector,slug:'a_system',quadrant_id:quadrant},{...doc,id:other,slug:'z_other',quadrant_id:quadrant}],
 game_locations:ids.map((id,i)=>({id,slug:['alpha','beta','gamma'][i],sector_id:sector,kind:'station',x:25+i*20,y:40+i*10,image_path:null,is_published:true,
 game_locations_i18n:[{locale:'hu',name:['Alfa','Béta','Gamma'][i],description:'Leírás'},{locale:'en',name:['Alpha','Beta','Gamma'][i],description:'Description'}]})),
 game_routes:[{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',origin_id:ids[0],destination_id:ids[1],energy_cost:8,is_published:true}],
 game_actions:[],game_location_actions:[],game_locales:[{code:'hu',native_name:'Magyar',is_enabled:true},{code:'en',native_name:'English',is_enabled:true}]};
const mock=`const request=async(url,body)=>{const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);return r.json();};
export const supabase={from(table){let body=null,filter=null,one=false;
 const q={select(){return q},order(){return q},eq(k,v){filter=[k,v];return q},single(){one=true;return q},update(b){body=b;return q},upsert(b){body=b;return q},
 then(res,rej){return request('/api/table/'+table,body?{body,filter}:undefined).then(r=>({...r,data:one?r.data?.[0]:r.data})).then(res,rej)}};return q;},
 rpc(name,args){return request('/api/rpc',{name,args});}};`;
const baseline=process.env.ROUTE_REPRO_BASELINE?execFileSync('git',['show','9d70d8f:src/GalaxyEditor.tsx'],{encoding:'utf8'}):null;
const baselineMap=baseline?execFileSync('git',['show','9d70d8f:src/WorldMapEditor.tsx'],{encoding:'utf8'}):null;
const out=await build({entryPoints:['tools/qa/atlas-route-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:'/tmp/atlas-route-qa',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'mock',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:mock,loader:'js'}));
 if(baseline)b.onLoad({filter:/[\\/]GalaxyEditor\.tsx$/},()=>({contents:baseline,loader:'tsx'}));
 if(baselineMap)b.onLoad({filter:/[\\/]WorldMapEditor\.tsx$/},()=>({contents:baselineMap,loader:'tsx'}));
}}]});
const js=out.outputFiles.find(f=>f.path.endsWith('.js')).text,css=out.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
const html='<!doctype html><meta charset="utf-8"><style>html,body,#root{margin:0;height:100%;background:#050910}.ed-layout{height:100vh}.ed-shell{height:95vh}'+css+'</style><div id="root"></div><script>'+js+'</script>';
let db,failRead=false;const calls=[];
const server=createServer(async(req,res)=>{
 const send=x=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(x));};
 try{
 if(!req.url.startsWith('/api/')){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
 let raw='';for await(const chunk of req)raw+=chunk;const args=raw?JSON.parse(raw):null;
 if(req.url==='/api/fail-read'){failRead=true;send({data:null,error:null});return;}
 if(req.url==='/api/rpc'){
  calls.push(args);const a=args.args;let result;
  if(args.name==='save_sector_starmap')result=await db.query('select public.save_sector_starmap($1::uuid,$2::jsonb,$3::jsonb) result',[a.p_sector,JSON.stringify(a.p_nodes),JSON.stringify(a.p_routes)]);
  else if(args.name==='replace_sector_links')result=await db.query('select private.replace_sector_links_impl($1::uuid,$2::uuid[],$3::jsonb) result',[a.p_location,a.p_actions,a.p_routes===null?null:JSON.stringify(a.p_routes)]);
  else throw Error('Unexpected RPC '+args.name);
  send({data:result.rows[0].result,error:null});return;
 }
 const table=req.url.slice('/api/table/'.length);if(table==='game_locations_i18n'){send({data:[],error:null});return;}
 if(!Object.hasOwn(seed,table))throw Error('Unexpected table '+table);
 if(table==='game_routes'&&failRead){failRead=false;throw Error('Fixture route read failed');}
 let result;
 if(args){const columns=Object.keys(args.body);if(columns.some(x=>!/^\w+$/.test(x)))throw Error('Invalid field');
 result=await db.query('update public.'+table+' set '+columns.map((c,i)=>'"'+c+'"=$'+(i+1)).join(',')+' where id=$'+(columns.length+1)+'::uuid returning id',[...Object.values(args.body),args.filter[1]]);
 }else result=await db.query('select * from public.'+table);
 send({data:result.rows,error:null});
 }catch(e){send({data:null,error:{message:e.message}});}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
try{for(const [name,driver] of (process.env.ROUTE_LOCAL_CHROMIUM?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox]])){
 db=new PGlite();calls.length=0;
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select '${galaxy}'::uuid$$;
 create function private.can_edit_content() returns boolean language sql as $$select true$$;
 create table game_galaxies(id uuid primary key,slug text,name_hu text,name_en text,description_hu text,description_en text,image_path text,is_published boolean,x integer,y integer);
 create table game_quadrants(like game_galaxies including all,galaxy_id uuid);
 create table game_sectors(like game_galaxies including all,quadrant_id uuid);
 create table game_locations(id uuid primary key,slug text,sector_id uuid,kind text,x integer,y integer,image_path text,is_published boolean,game_locations_i18n jsonb);
 create table game_routes(id uuid primary key default gen_random_uuid(),origin_id uuid,destination_id uuid,energy_cost integer,is_published boolean);
 create table game_actions(id uuid primary key,slug text);
 create table game_location_actions(location_id uuid,action_id uuid,primary key(location_id,action_id));
 create table game_locales(code text,native_name text,is_enabled boolean);`);
 for(const [table,rows] of Object.entries(seed))if(rows.length)await db.query('insert into '+table+' select * from jsonb_populate_recordset(null::'+table+',$1::jsonb)',[JSON.stringify(rows)]);
 for(const path of ['20261021002500_m72_sector_starmap_routes.sql','20261021091000_m73_world_map_grid_snap.sql','20261021114500_m76_preserve_location_routes.sql'])await db.exec(await readFile('supabase/migrations/'+path,'utf8'));
 const browser=await driver.launch(process.env.ROUTE_LOCAL_CHROMIUM?{headless:true,executablePath:process.env.ROUTE_LOCAL_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const openAtlas=async()=>{
  await page.getByRole('navigation',{name:'Világszintek'}).getByRole('button',{name:'Szektor',exact:true}).click();
  await page.getByRole('navigation',{name:'Szerkesztőfülek'}).getByRole('button',{name:'Csillagtérkép',exact:true}).click();
  await page.getByRole('button',{name:'Nagy csillagtérkép szerkesztése'}).click();
 };
 const modal=page.getByRole('dialog',{name:'Csillagtérkép szerkesztő'});
 await page.goto(url+'/?editor=galaxy');await openAtlas();await modal.waitFor();
 assert.equal(await modal.locator('.wm-line').count(),1,'Atlas entry MUST load the existing route');
 await modal.getByRole('button',{name:'Összeköttetés',exact:true}).click();
 await modal.locator('.wm-node').nth(1).click();await modal.locator('.wm-node').nth(2).click();
 await modal.getByRole('button',{name:'Térkép mentése'}).click();await modal.waitFor({state:'detached'});
 assert.equal(await page.locator('.wa-map-links line').count(),2,'Inline preview must display the saved routes');
 let rows=(await db.query('select * from game_routes order by id')).rows;assert.equal(rows.length,2);const original=rows.find(r=>r.origin_id===ids[0]);assert.equal(original.id,seed.game_routes[0].id);
 await page.reload();await openAtlas();await modal.waitFor();assert.equal(await modal.locator('.wm-line').count(),2,'Full reload must preserve both saved links');
 await modal.getByLabel('X',{exact:true}).fill('30');await modal.getByRole('button',{name:'Térkép mentése'}).click();await modal.waitFor({state:'detached'});
 assert.equal((await db.query('select count(*)::int n from game_routes')).rows[0].n,2,'Coordinate-only save must preserve every link');
 // Readback failure must keep the map open, rather than falsely reporting completion.
 await page.getByRole('button',{name:'Nagy csillagtérkép szerkesztése'}).click();await modal.getByLabel('X',{exact:true}).fill('35');
 await page.request.post(url+'/api/fail-read');await modal.getByRole('button',{name:'Térkép mentése'}).click();
 await modal.getByRole('button',{name:'Térkép mentése'}).waitFor();assert.equal(await modal.count(),1);
 await modal.getByRole('button',{name:'Térkép mentése'}).click();await modal.waitFor({state:'detached'});
 // Second editor reads the same PostgreSQL graph, then saves unrelated location data.
 await page.goto(url+'/?editor=location');await page.getByRole('button',{name:/^Csillagtérkép/}).click();await modal.waitFor();assert.equal(await modal.locator('.wm-line').count(),2);
 await modal.getByRole('button',{name:'Mégse',exact:true}).click();await page.getByRole('button',{name:'MENTÉS',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('button.ed-submit:disabled'));
 assert.equal(calls.filter(c=>c.name==='replace_sector_links').at(-1).args.p_routes,null);
 assert.equal((await db.query('select count(*)::int n from game_routes')).rows[0].n,2);
 await page.goto(url+'/?editor=galaxy');await openAtlas();await modal.waitFor();assert.equal(await modal.locator('.wm-line').count(),2,'Switching editors and reload must preserve graph');
 assert.deepEqual(errors,[]);console.log(name+': PASS real PostgreSQL routes from BOTH editors, add/save/reload, stable IDs, coordinate-only save, location save, failed readback stays open');
 }finally{await browser.close();await db.close();db=null;}
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(db)await db.close();}
