// Real Chromium + Firefox tests for a truly square map, wheel zoom, panning,
// snap-to-intersections, connect/edit/delete links, and one atomic RPC save.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const require=createRequire(join(resolve(process.env.WORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const temp=await mkdtemp(join(tmpdir(),'hatarvilag-square-map-'));
let server;
try{
 const result=await build({
  entryPoints:['tools/qa/world-map-direct-fixture.tsx'],
  bundle:true,write:false,format:'iife',outdir:temp,jsx:'automatic',
  define:{'import.meta.env':'{}'},
  plugins:[{name:'mock-atomic-rpc',setup(b){
   b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'mock-world',namespace:'world-qa'}));
   b.onLoad({namespace:'world-qa',filter:/.*/},()=>({loader:'js',
    contents:"export const supabase={rpc:(name,args)=>{window.__worldCalls.push({name,args});return Promise.resolve({data:{},error:null});}};" }));
  }}]
 });
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
 const html='<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;width:100%;height:100%;background:#050910;color:#dce7f0}'+css+'</style><div id="root"></div><script>window.__worldCalls=[]</script><script>'+js.replaceAll('</script','<\\/script')+'</script>';
 server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 for(const [browserName,driver] of [['chromium',chromium],['firefox',firefox]]){
  const b=await driver.launch({headless:true});
  try{
   const page=await b.newPage({viewport:{width:1440,height:900}});
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.route('https://assets.voidnoir.net/**',route=>route.fulfill({
    contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAIAAADmAupWAAAAYUlEQVR4nO3PMQ0AIRQEUUAEVrBwPtCFDzRRI+A8fGiYzOs32cm71RRV+wxvT6zxhbfl4o8nGExnMJ3BdAbTGUxnMJ3BdAbTGUxnMJ3BdAbTGUxnMJ3BdD+sgASRbACx1AAAAABJRU5ErkJggg==','base64')
   }));
   await page.goto(url);
   const modal=page.getByRole('dialog',{name:'Csillagtérkép szerkesztő'});
   await modal.waitFor();
   const viewport=modal.locator('.wm-viewport');
   const field=modal.locator('.wm-field');
   const box=await field.boundingBox(),view=await viewport.boundingBox();
   assert.ok(box&&view&&Math.abs(box.width-box.height)<1,'Square cells and world stage');
   const grid=await field.evaluate(el=>getComputedStyle(el).backgroundSize);
   assert.ok(grid.includes('40px 40px'),'Square grid tile '+grid);
   const nodes=modal.locator('.wm-node');
   assert.equal(await nodes.count(),3);
   const initial=await nodes.evaluateAll(xs=>xs.map(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)})));
   for(const node of initial){assert.equal(node.x%5,0);assert.equal(node.y%5,0);}
   assert.equal(initial[0].x,25,'Legacy position snapped on render');
   assert.equal(await modal.locator('.wm-line').count(),1,'Existing route is drawn');
   // Scroll about a node: pointer anchored wheel zoom should not move the point.
   const first=await nodes.nth(0).boundingBox();assert.ok(first);
   const atGrid=async()=>{
    const star=await nodes.nth(0).locator('.wm-node-dot').boundingBox();
    const stage=await field.boundingBox();
    const point=await nodes.nth(0).evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
    assert.ok(star&&stage);
    assert.ok(Math.abs(star.x+star.width/2-(stage.x+stage.width*point.x/100))<1.7,
      'Marker icon must align to the grid X intersection even when zoomed');
    assert.ok(Math.abs(star.y+star.height/2-(stage.y+stage.height*point.y/100))<1.7,
      'Marker icon must align to the grid Y intersection even when zoomed');
   };
   await atGrid();
   const framed=nodes.first().locator('.wm-node-dot.world-map-frame');
   const portrait=framed.locator('img');
   await portrait.waitFor({state:'visible'});
   const details=await framed.evaluate(el=>{
    const image=el.querySelector('img');
    const frame=getComputedStyle(el);
    const imgStyle=getComputedStyle(image);
    return {width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,
      borderRadius:frame.borderTopLeftRadius,objectFit:imgStyle.objectFit,
      position:imgStyle.objectPosition,naturalW:image.naturalWidth,naturalH:image.naturalHeight,
      imageWidth:image.getBoundingClientRect().width,imageHeight:image.getBoundingClientRect().height};
   });
   assert.ok(Math.abs(details.width-details.height)<1,'Image marker is square');
   assert.ok(parseFloat(details.borderRadius)<8,'Image marker has simple square-corner frame');
   assert.equal(details.objectFit,'cover','Landscape art is center-cropped, not distorted');
   assert.match(details.position,/50%/,'Art crop centered');
   assert.equal(details.naturalW,80);assert.equal(details.naturalH,40);
   assert.ok(Math.abs(details.imageWidth-details.imageHeight)<1,'Image square despite 2:1 source');
   assert.equal(await nodes.nth(1).locator('.wm-node-dot .world-art-fallback').count(),1,
      'Missing photo keeps fallback glyph in the same square frame');
   const mx=first.x+first.width/2,my=first.y+20;
   const anchorBefore=await nodes.nth(0).boundingBox();
   await page.mouse.move(mx,my);await page.mouse.wheel(0,-360);
   await page.waitForFunction(()=>document.querySelector('.wm-field')?.getBoundingClientRect().width>800*.8);
   const afterZoom=await field.boundingBox();
   assert.ok(afterZoom.width>box.width+10,'Wheel zoom enlarges square map');
   assert.ok(Math.abs(afterZoom.width-afterZoom.height)<1,'Grid stays square when zoomed');
   await atGrid();
   const anchorAfter=await nodes.nth(0).boundingBox();
   assert.ok(Math.abs((anchorBefore.x+anchorBefore.width/2)-(anchorAfter.x+anchorAfter.width/2))<8,'Wheel pointer anchored');
   // Pan by dragging empty space outside world square.
   const left=view.x+12,top=view.y+12;
   const beforePan=await field.boundingBox();
   await page.mouse.move(left,top);await page.mouse.down();await page.mouse.move(left+76,top+54,{steps:12});await page.mouse.up();
   const afterPan=await field.boundingBox();
   assert.ok(Math.abs(afterPan.x-beforePan.x-76)<5,'Horizontal pan');
   assert.ok(Math.abs(afterPan.y-beforePan.y-54)<5,'Vertical pan');
   await modal.getByRole('button',{name:'Nézet visszaállítása'}).click();
   const reset=await field.boundingBox();
   assert.ok(Math.abs(reset.width-box.width)<2,'Reset restores camera');
   // Drag Gamma to a non-grid point; coordinates must snap in both axes.
   const from=await nodes.nth(2).boundingBox();assert.ok(from);
   await page.mouse.move(from.x+from.width/2,from.y+18);
   await page.mouse.down();
   await page.mouse.move(reset.x+reset.width*.65,reset.y+reset.height*.55,{steps:16});
   await page.mouse.up();
   const x=Number(await modal.locator('.wm-coord input').nth(0).inputValue());
   const y=Number(await modal.locator('.wm-coord input').nth(1).inputValue());
   assert.equal(x,65,'X snaps to grid intersection');assert.equal(y,55,'Y snaps to grid intersection');
   // Connect B -> C with two clicks; select old A -> B and remove it.
   await modal.getByRole('button',{name:'Összeköttetés'}).click();
   await nodes.nth(1).click();
   await nodes.nth(2).click();
   assert.equal(await modal.locator('.wm-line').count(),2,'New route renders as a line');
   const list=modal.locator('.wm-route-list');
   await list.getByRole('button',{name:/Alfa állomás.*Béta bolygó/}).click();
   await modal.getByRole('button',{name:'Összeköttetés törlése'}).click();
   assert.equal(await modal.locator('.wm-line').count(),1,'Route deletion removes line');
   await list.getByRole('button',{name:/Béta bolygó.*Gamma roncs/}).click();
   await modal.getByRole('spinbutton',{name:'Útvonal energiaköltsége'}).fill('17');
   await modal.getByRole('button',{name:'Térkép mentése'}).click();
   const calls=await page.evaluate(()=>window.__worldCalls);
   assert.equal(calls.length,1,'Only one atomic save RPC');
   assert.equal(calls[0].name,'save_sector_starmap');
   assert.equal(calls[0].args.p_nodes.length,3);
   assert.equal(calls[0].args.p_routes.length,1);
   assert.equal(calls[0].args.p_routes[0].energy_cost,17);
   for(const n of calls[0].args.p_nodes){assert.equal(n.x%5,0);assert.equal(n.y%5,0);}
   assert.deepEqual(errors,[],'No browser exceptions');
   console.log(browserName+': PASS square grid, wheel zoom anchored, pan, snap XY, route add/edit/delete and atomic save');
  }finally{await b.close();}
 }
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(temp,{recursive:true,force:true});
}
