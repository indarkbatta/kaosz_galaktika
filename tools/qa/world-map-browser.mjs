// Native Chromium / Firefox exercise of the real GalaxyEditor with an isolated in-memory Supabase fixture.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';

const require=createRequire(join(resolve(process.env.WORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const scratch=await mkdtemp(join(tmpdir(),'hatarvilag-world-'));
const db={
 game_galaxies:[{id:'11111111-1111-4111-8111-111111111111',slug:'hatarvilag',name_hu:'Határvilág',name_en:'Borderworld',description_hu:'',description_en:'',is_published:true}],
 game_quadrants:[{id:'22222222-2222-4222-8222-222222222222',slug:'hatarvidek',name_hu:'Határvidék',name_en:'Frontier',description_hu:'',description_en:'',x:53,y:47,galaxy_id:'11111111-1111-4111-8111-111111111111',is_published:true}],
 game_sectors:[{id:'33333333-3333-4333-8333-333333333333',slug:'kezdo_rendszer',name_hu:'Határvidéki naprendszer',name_en:'Frontier System',description_hu:'',description_en:'',x:35,y:60,quadrant_id:'22222222-2222-4222-8222-222222222222',is_published:true}],
 game_locations:[{id:'44444444-4444-4444-8444-444444444444',slug:'frontier_station',sector_id:'33333333-3333-4333-8333-333333333333',x:22,y:40,game_locations_i18n:[{locale:'hu',name:'Határvidéki állomás'},{locale:'en',name:'Frontier Station'}]}]
};
const mock="export const supabase={from(table){return {select(){const q=Promise.resolve({data:JSON.parse(JSON.stringify(window.__worldFixture.db[table]||[])),error:null});q.order=()=>q;return q;},update(body){return {eq(key,id){return {select(){return {single(){const row=window.__worldFixture.db[table].find(v=>v[key]===id);if(!row)return Promise.resolve({data:null,error:{message:'Row missing'}});Object.assign(row,body);return Promise.resolve({data:{id:row.id},error:null});}};}};}};},insert(body){return {select(){return {single(){const id='99999999-9999-4999-8999-999999999999';window.__worldFixture.db[table].push({id,...body});return Promise.resolve({data:{id},error:null});}};}};}};},rpc(name,args){window.__worldFixture.calls.push({name,args});if(name!=='save_world_map_positions')return Promise.resolve({data:null,error:{message:'Unexpected RPC'}});const table=args.p_level==='galaxy'?'game_quadrants':args.p_level==='quadrant'?'game_sectors':'game_locations';for(const node of args.p_nodes){const x=window.__worldFixture.db[table].find(y=>y.id===node.id);if(x)Object.assign(x,{x:node.x,y:node.y});}return Promise.resolve({data:args.p_nodes.length,error:null});}}";
let server;
try{
 const b=await build({entryPoints:['tools/qa/world-map-fixture.tsx'],bundle:true,format:'iife',write:false,outdir:scratch,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{
  name:'world-api-fixture',setup(build){
   build.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'mock-supabase',namespace:'world-qa'}));
   build.onLoad({filter:/.*/,namespace:'world-qa'},()=>({contents:mock,loader:'js'}));
  }
 }]});
 const js=b.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=b.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
 const boot='window.__worldFixture={calls:[],db:'+JSON.stringify(db)+'};';
 const html='<!doctype html><html lang="hu"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%;background:#05090e;color:#dce3ec}.ed-layout{height:100vh}.ed-shell{height:95vh}'+css+'</style><div id="root"></div><script>'+boot+'</script><script>'+js.replaceAll('</script','<\\/script')+'</script>';
 server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 for(const [label,driver] of [['chromium',chromium],['firefox',firefox]]){
  const engine=await driver.launch({headless:true});
  try{
   const page=await engine.newPage({viewport:{width:1440,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://assets.voidnoir.net/**',route=>route.fulfill({
    contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGPUiq9mYGBgYmBgYGBgAAAMCQEI3wjvmgAAAABJRU5ErkJggg==','base64')
   }));
   await page.goto(url);
   const levels=page.getByRole('navigation',{name:'Világszintek'});
   await levels.getByRole('button',{name:'Galaxis',exact:true}).waitFor();
   const tabs=page.getByRole('navigation',{name:'Szerkesztőfülek'});
   await tabs.getByRole('button',{name:'Csillagtérkép'}).click();
   // This is the inline map shown in the user's screenshot, not the modal.
   const mini=page.getByRole('group',{name:'Négyzetes térképelőnézet'});
   const preview=await mini.boundingBox();
   assert.ok(preview&&Math.abs(preview.width-preview.height)<1.25,
    'Inline map must itself be square, not a wide rectangle: '+JSON.stringify(preview));
   assert.ok(preview.width>=250,'Inline map must remain usable');
   const gridSize=await mini.evaluate(el=>getComputedStyle(el).backgroundSize);
   assert.match(gridSize,/5% 5%, 5% 5%/,'Inline grid must have square cell spacing');
   const marker=mini.locator('.wa-map-node').first();
   assert.equal(await marker.getAttribute('style'),'left: 55%; top: 45%;','Preview must snap legacy quadrant coordinates on both axes');
   const markerBox=await mini.locator('.wa-map-node-icon').first().boundingBox();
   assert.ok(markerBox,'Preview star marker visible');
   const mapCenterX=preview.x+1+(preview.width-2)*.55;
   const mapCenterY=preview.y+1+(preview.height-2)*.45;
   assert.ok(Math.abs(markerBox.x+markerBox.width/2-mapCenterX)<1.5,
    'Preview marker visual center must match X grid intersection');
   assert.ok(Math.abs(markerBox.y+markerBox.height/2-mapCenterY)<1.5,
    'Preview marker visual center must match Y grid intersection');
   await page.getByRole('button',{name:'Nagy csillagtérkép szerkesztése'}).click();
   const modal=page.getByRole('dialog',{name:'Csillagtérkép szerkesztő'});
   await modal.waitFor();
   const rect=await modal.boundingBox();assert.ok(rect.width>1200&&rect.height>750,'Large modal '+JSON.stringify(rect));
   const field=modal.locator('.wm-field');
   const node=modal.locator('.wm-node').first();
   const b=await node.boundingBox(),f=await field.boundingBox();
   const star=await node.locator('.wm-node-dot').boundingBox();
   const point=await node.evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
   assert.ok(star&&b&&f,'Star marker and field visible');
   assert.equal(point.x%5,0);assert.equal(point.y%5,0);
   assert.ok(Math.abs(star.x+star.width/2-(f.x+f.width*point.x/100))<1.6,
    'Large modal star icon center must be ON the X grid intersection');
   assert.ok(Math.abs(star.y+star.height/2-(f.y+f.height*point.y/100))<1.6,
    'Large modal star icon center must be ON the Y grid intersection');assert.ok(b&&f,'Draggable node');
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
   await page.mouse.down();
   await page.mouse.move(f.x+f.width*.7,f.y+f.height*.4,{steps:18});
   await page.mouse.up();
   const x=Number(await modal.locator('.wm-coord input').first().inputValue());
   assert.ok(x>=60&&x<=80,'Grid snap after pointer drag: '+x);
   await modal.getByRole('button',{name:'Térkép mentése'}).click();
   await modal.waitFor({state:'detached'});
   const calls=await page.evaluate(()=>window.__worldFixture.calls);
   assert.equal(calls[0].name,'save_world_map_positions');
   assert.equal(calls[0].args.p_level,'galaxy');
   assert.equal(calls[0].args.p_nodes[0].x,x);
   await levels.getByRole('button',{name:'Kvadráns',exact:true}).click();
   await tabs.getByRole('button',{name:'Csillagtérkép'}).click();
   await page.getByRole('button',{name:'Nagy csillagtérkép szerkesztése'}).click();
   assert.equal(await modal.locator('.wm-node').count(),1,'Quadrant contains a system');
   await modal.getByRole('button',{name:'Mégse'}).click();
   await levels.getByRole('button',{name:'Szektor',exact:true}).click();
   await tabs.getByRole('button',{name:'Csillagtérkép'}).click();
   await page.getByRole('button',{name:'Nagy csillagtérkép szerkesztése'}).click();
   assert.equal(await modal.locator('.wm-node').count(),1,'Sector contains a location');
   assert.match(await modal.locator('.wm-node-label').first().textContent(),/állomás/);
   await modal.getByRole('button',{name:'Mégse'}).click();
   // Legacy world coordinates (22,40) are snapped in the modal and make it dirty.
   // Discard that unsaved preview movement before exercising artwork forms.
   const discard=page.getByRole('alertdialog');
   if(await discard.count())await discard.getByRole('button',{name:'Elvetés'}).click();
   // Persist artwork through the real GalaxyEditor form for every catalog level.
   for(const name of ['Szektor','Kvadráns','Galaxis']){
    await levels.getByRole('button',{name,exact:true}).click();
    await tabs.getByRole('button',{name:'Alapadatok'}).click();
    const input=page.getByRole('textbox',{name:'Kép útvonala'});
    const key='hatarvilag/worlds/'+name.toLowerCase()+'.webp';
    await input.fill('https://evil.example.net/not-our-art.jpg');
    assert.equal(await page.getByRole('alert').count(),1,'Reject external image URL');
    await input.fill('https://assets.voidnoir.net/'+key);
    assert.equal(await input.inputValue(),key,'Normalize public R2 link');
    await page.waitForTimeout(250);
    const previewImageDebug=await page.evaluate(()=>({
      html:document.querySelector('.world-image-editor-preview')?.outerHTML,
      input:document.querySelector('input[aria-label="Kép útvonala"]')?.value,
      broken:document.querySelector('.world-image-error')?.textContent
    }));
    assert.equal(await page.locator('.world-image-editor-preview img').count(),1,
      'Live image element must render: '+JSON.stringify(previewImageDebug));
    assert.equal(await page.locator('.world-image-editor-preview img').count(),1,'Live artwork preview');
    await page.getByRole('button',{name:'Mentés',exact:true}).click();
    await page.waitForFunction(k=>Object.values(window.__worldFixture.db).some(rows=>rows.some(row=>row.image_path===k)),key);
    assert.equal(await input.inputValue(),key,'Persisted image survives reload');
    assert.equal(await page.locator('.ed-roster-list .world-art img').count(),1,'Saved roster thumbnail');
   }
   assert.deepEqual(errors,[],'Browser errors');
   console.log(label+': PASS galaxy/quadrant/sector/location maps, drag, snap, save and large modal');
  }finally{await engine.close();}
 }
}finally{
 if(server)await new Promise(r=>server.close(r));
 await rm(scratch,{recursive:true,force:true});
}
