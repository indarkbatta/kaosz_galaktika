// Cross-browser frame geometry and photo-crop checks on the actual player star chart.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const require=createRequire(join(resolve(process.env.WORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const testArt='iVBORw0KGgoAAAANSUhEUgAAAFAAAAAoCAIAAADmAupWAAAAYUlEQVR4nO3PMQ0AIRQEUUAEVrBwPtCFDzRRI+A8fGiYzOs32cm71RRV+wxvT6zxhbfl4o8nGExnMJ3BdAbTGUxnMJ3BdAbTGUxnMJ3BdAbTGUxnMJ3BdD+sgASRbACx1AAAAABJRU5ErkJggg==';
const temp=await mkdtemp(join(tmpdir(),'hatarvilag-player-map-'));
let server;
try{
 const result=await build({entryPoints:['tools/qa/player-map-art-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:temp,jsx:'automatic',define:{'import.meta.env':'{}'}});
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
 const html='<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;background:#050910;color:#dce7f0}'+css+'</style><div id="root"></div><script>'+js.replaceAll('</script','<\\/script')+'</script>';
 server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 for(const [name,engine] of [['chromium',chromium],['firefox',firefox]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.route('https://assets.voidnoir.net/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from(testArt,'base64')}));
   await page.goto('http://127.0.0.1:'+server.address().port);
   const field=page.locator('.sector-field');
   const testNode=async(label,expectedX,expectedY)=>{
    const node=field.locator('.sector-node.world-map-node').first();
    const frame=node.locator('.sector-node-icon.world-map-frame');
    const image=frame.locator('img');
    await image.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('.sector-node-icon.world-map-frame img')?.naturalWidth===80);
    const [f,box]=await Promise.all([field.boundingBox(),frame.boundingBox()]);
    assert.ok(f&&box,'Field and image present');
    const styles=await frame.evaluate(el=>{
      const image=el.querySelector('img');
      return {radius:getComputedStyle(el).borderTopLeftRadius,crop:getComputedStyle(image).objectFit,
        width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height,
        naturalW:image.naturalWidth,naturalH:image.naturalHeight};
    });
    assert.ok(Math.abs(box.width-box.height)<1,label+' has square outer frame');
    assert.ok(parseFloat(styles.radius)<8,label+' has squared corners');
    assert.equal(styles.crop,'cover',label+' crops wide source');
    assert.equal(styles.naturalW,80);assert.equal(styles.naturalH,40);
    assert.ok(Math.abs(styles.width-styles.height)<1,label+' shows square image');
    assert.ok(Math.abs((box.x+box.width/2)-(f.x+f.width*expectedX/100))<2,label+' marker X center at map coordinate');
    assert.ok(Math.abs((box.y+box.height/2)-(f.y+f.height*expectedY/100))<2,label+' marker Y center at map coordinate');
   };
   await testNode('Player location',45,55);
   assert.equal(await field.locator('.sector-node.world-map-node.undiscovered img').count(),0,'Unexplored location image remains hidden');
   await page.locator('.sector-world-crumbs button').nth(1).click();
   await testNode('Player quadrant-level system',65,45);
   await page.locator('.sector-world-crumbs button').first().click();
   await testNode('Player galaxy-level quadrant',35,55);
   assert.deepEqual(errors,[],'No browser errors');
   console.log(name+': PASS square framed 2:1 artwork cropping, centered nodes on all three player map levels, hidden undiscovered art');
  }finally{await browser.close();}
 }
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(temp,{recursive:true,force:true});
}
