// Real Chromium / Firefox layout regression of the production CrewEditor with read-only fixtures.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {resolve,join} from "node:path";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";

const require=createRequire(join(resolve(process.env.EDITOR_BROWSER_TOOLS),"package.json"));
const {chromium,firefox}=require("playwright");
const work=await mkdtemp(join(tmpdir(),"hatarvilag-editor-"));
const htmlPath=join(work,"crew.html");
let server;
try{
 execFileSync(process.execPath,["tools/qa/build-crew-preview.mjs",htmlPath],{stdio:"inherit"});
 const html=await readFile(htmlPath,"utf8");
 server=createServer((_req,res)=>{
   res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
   res.end(html);
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const url="http://127.0.0.1:"+server.address().port;
 for(const [name,browserType] of [["chromium",chromium],["firefox",firefox]]){
   const browser=await browserType.launch({headless:true});
   try{
     const page=await browser.newPage({viewport:{width:1440,height:900}});
     page.on("pageerror",error=>{throw error;});
     await page.route("https://assets.voidnoir.net/**",route=>route.fulfill({
       contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#285"/></svg>'
     }));
     await page.goto(url);
     await page.getByRole("button",{name:"Legénységszerkesztő",exact:true}).click();
     await page.locator(".ed-form-fields input").first().waitFor();
     const verify=async(label)=>{
       const dimensions=await page.evaluate(()=>{
         const find=q=>document.querySelector(q);
         const font=q=>parseFloat(getComputedStyle(find(q)).fontSize);
         const nav=find(".ed-nav"),roster=find(".ed-roster"),content=find(".ed-editor"),shell=find(".ed-shell");
         const ruler=el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth});
         return {nav:ruler(nav),roster:ruler(roster),content:ruler(content),shell:ruler(shell),
           navFont:font(".ed-nav > button"),detailTabFont:font(".ed-tabs-detail button"),
           catalogTabFont:font(".ed-tabs-catalog button"),fieldFont:font(".ed-form-fields input"),
           labelFont:font(".ed-form-fields label"),actionFont:font(".ed-footer button"),
           actionBackground:getComputedStyle(find(".ed-footer .ed-submit")).backgroundColor,
           navCount:document.querySelectorAll(".ed-nav").length,
           catalogCount:document.querySelectorAll(".ed-tabs-catalog").length,
           detailCount:document.querySelectorAll(".ed-tabs-detail").length};
       });
       assert.ok(Math.abs(dimensions.nav.width-208)<2,label+" nav width "+JSON.stringify(dimensions));
       assert.ok(Math.abs(dimensions.roster.width-232)<2,label+" roster width "+JSON.stringify(dimensions));
       assert.ok(dimensions.content.width>350,label+" detail too narrow "+JSON.stringify(dimensions));
       assert.ok(dimensions.content.scroll<=dimensions.content.client+2,label+" horizontal content overflow "+JSON.stringify(dimensions));
       assert.ok(dimensions.navFont>=14&&dimensions.detailTabFont>=14&&dimensions.catalogTabFont>=12,label+" tab/menu font too small "+JSON.stringify(dimensions));
       assert.ok(dimensions.fieldFont>=14&&dimensions.labelFont>=12&&dimensions.actionFont>=13,label+" form font too small "+JSON.stringify(dimensions));
       assert.equal(dimensions.actionBackground,"rgb(171, 48, 36)",label+" submit action must use the shared editor palette");
       assert.equal(dimensions.navCount,1);assert.equal(dimensions.catalogCount,1);assert.equal(dimensions.detailCount,1);
     };
     await verify(name+" desktop");
     const modes=page.getByRole("navigation",{name:"Katalógustípus"});
     await modes.getByRole("button",{name:"Sablonok"}).click();
     assert.equal(await modes.locator("button.active").textContent(),"Sablonok");
     await modes.getByRole("button",{name:"Portrék"}).click();
     assert.equal(await modes.locator("button.active").textContent(),"Portrék");
     assert.equal(await page.getByRole("navigation",{name:"Legénységszerkesztő fülek"}).getByRole("button").count(),2);
     await modes.getByRole("button",{name:"Egyedi"}).click();
     assert.equal(await page.getByRole("navigation",{name:"Legénységszerkesztő fülek"}).getByRole("button").count(),4);
     await page.setViewportSize({width:900,height:900});
     await verify(name+" narrow");
     await page.getByRole("button",{name:"EN",exact:true}).click();
     assert.equal(await page.locator(".ed-nav h2").textContent(),"Editor dashboard");
     console.log(name+": PASS shared template widths, typography, actions, catalog navigation, narrow viewport and HU/EN");
   } finally {await browser.close();}
 }
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(work,{recursive:true,force:true});
}
