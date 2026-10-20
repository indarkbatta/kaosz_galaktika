// Native mouse drags against the production component; the RPC boundary is an in-memory fixture.
// No player account, credentials, remote API, or initialData write bypass is used.
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {resolve,join} from "node:path";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {createServer} from "node:http";
import {build} from "esbuild";

const require=createRequire(join(resolve(process.env.SHIP_BROWSER_TOOLS),"package.json"));
const {chromium,firefox}=require("playwright");
const scratch=await mkdtemp(join(tmpdir(),"ship-dnd-"));
const baselineRef="099870474b7c7260397469a5e15ec1526d8062b2";
let baselineSource;

async function bundle(baseline=false){
  if(baseline && !baselineSource){
    const response=await fetch("https://raw.githubusercontent.com/indarkbatta/kaosz_galaktika/"+baselineRef+"/src/ShipLoadout.tsx");
    if(!response.ok)throw Error("Cannot fetch pinned baseline: "+response.status);
    baselineSource=await response.text();
  }
  const result=await build({
    entryPoints:["tools/qa/ship-dnd-fixture.tsx"],bundle:true,write:false,
    outdir:scratch,format:"iife",jsx:"automatic",define:{"import.meta.env":"{}"},
    plugins:[{
      name:"local-rpc-fixture",
      setup(b){
        b.onResolve({filter:/\/lib\/supabase$/},()=>({path:"fixture-rpc",namespace:"qa"}));
        b.onLoad({filter:/.*/,namespace:"qa"},()=>({contents:
          "export const supabase={rpc:(...args)=>window.__fixtureRpc(...args)};"}));
        if(baseline)b.onLoad({filter:/[\\/]src[\\/]ShipLoadout\.tsx$/},args=>({
          contents:baselineSource,
          loader:"tsx",resolveDir:resolve("src"),
        }));
      },
    }],
  });
  const js=result.outputFiles.find(f=>f.path.endsWith(".js")).text;
  const css=result.outputFiles.find(f=>f.path.endsWith(".css"))?.text||"";
  return '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#09141b}#root{width:1380px;height:800px;display:flex}'+css+'</style><div id="root"></div><script>'+js.replaceAll("</script","<\\/script")+'</script>';
}
let html=await bundle();
const server=createServer((req,res)=>{res.setHeader("Content-Type","text/html; charset=utf-8");res.end(html)});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url="http://127.0.0.1:"+server.address().port;
const reports=[];
async function ready(page){
  await page.goto(url);
  await page.getByRole("button",{name:"Engine A: engine",exact:true}).waitFor();
}
async function idle(page){
  await page.waitForFunction(()=>document.querySelector(".sh-root")?.getAttribute("aria-busy")==="false");
}
async function callCount(page){return page.evaluate(()=>window.__calls.length)}
async function drag(page,source,target,expected,position){
  const before=await callCount(page);
  await source.dragTo(target,position?{targetPosition:position}:{});
  await page.waitForFunction(n=>window.__calls.length===n+1,before,{timeout:5000});
  await idle(page);
  const calls=await page.evaluate(()=>window.__calls);
  assert.equal(calls.length,before+1,"one mutation per native drop");
  assert.deepEqual(calls.at(-1),expected);
}
for(const [browserName,browserType] of [["chromium",chromium],["firefox",firefox]]){
  const browser=await browserType.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1450,height:900}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  try{
    await ready(page);
    const cargo=page.locator(".sh-stock-panel").nth(0), reserve=page.locator(".sh-stock-panel").nth(1);
    const station=name=>page.getByRole("button",{name,exact:true});
    // Both destination inventories start completely empty: the original failure.
    await drag(page,station("Engine A: engine"),cargo.getByRole("button",{name:"Empty module slot",exact:true}).first(),
      {rpc:"set_ship_module",args:{p_slot:"Engine A",p_item:null}});
    await station("Engine A: Empty").waitFor();
    await drag(page,cargo.getByRole("button",{name:"engine ×1",exact:true}),station("Engine A: Empty"),
      {rpc:"set_ship_module",args:{p_slot:"Engine A",p_item:"engine"}});
    await drag(page,station("Pilot A: Mara"),reserve.getByRole("button",{name:"Empty crew slot",exact:true}).first(),
      {rpc:"assign_ship_crew",args:{p_slot:"Pilot A",p_crew:null}});
    await station("Pilot A: Empty").waitFor();
    await drag(page,reserve.getByRole("button",{name:"Mara",exact:true}),station("Pilot A: Empty"),
      {rpc:"assign_ship_crew",args:{p_slot:"Pilot A",p_crew:"mara"}});
    // The whole panel accepts returns, including its header and padding.
    await drag(page,station("Engine A: engine"),cargo.locator("header"),
      {rpc:"set_ship_module",args:{p_slot:"Engine A",p_item:null}});
    await drag(page,cargo.getByRole("button",{name:"engine ×1",exact:true}),station("Engine A: Empty"),
      {rpc:"set_ship_module",args:{p_slot:"Engine A",p_item:"engine"}});
    // Move modules and crew directly between compatible ship slots.
    await drag(page,station("Engine A: engine"),station("Engine B: Empty"),
      {rpc:"move_ship_module",args:{p_from_slot:"Engine A",p_to_slot:"Engine B"}});
    await drag(page,station("Pilot A: Mara"),station("Pilot B: Empty"),
      {rpc:"assign_ship_crew",args:{p_slot:"Pilot B",p_crew:"mara"}});
    // Incompatible destinations and a cancelled drag must never mutate.
    const before=await callCount(page);
    await station("Engine B: engine").dragTo(station("Shield: Empty"));
    await station("Pilot B: Mara").dragTo(cargo.getByRole("button",{name:"Empty module slot",exact:true}).first());
    await station("Engine B: engine").dragTo(page.locator(".sh-summary"));
    assert.equal(await callCount(page),before);
    assert.equal(await page.locator(".sh-stock-panel.compatible").count(),0,"cancel clears highlight");
    // Filled cells are valid return destinations too.
    await page.evaluate(()=>{
      const state=window.__snapshot;
      state.modules.find(m=>m.item_id==="shield").quantity=1;
      state.crew.push({...state.crew[0],id:"reserve",name:"Reserve"});
    });
    // Refresh through a real successful mutation.
    await drag(page,station("Engine B: engine"),station("Engine A: Empty"),
      {rpc:"move_ship_module",args:{p_from_slot:"Engine B",p_to_slot:"Engine A"}});
    await drag(page,station("Pilot B: Mara"),reserve.getByRole("button",{name:"Reserve",exact:true}),
      {rpc:"assign_ship_crew",args:{p_slot:"Pilot B",p_crew:null}});
    await drag(page,station("Engine A: engine"),cargo.getByRole("button",{name:"shield ×1",exact:true}),
      {rpc:"set_ship_module",args:{p_slot:"Engine A",p_item:null}});
    // Server rejection preserves the fitted module and clears busy/drag state.
    await drag(page,cargo.getByRole("button",{name:"engine ×1",exact:true}),station("Engine A: Empty"),
      {rpc:"set_ship_module",args:{p_slot:"Engine A",p_item:"engine"}});
    await page.evaluate(()=>{window.__reject=true});
    await drag(page,station("Engine A: engine"),cargo.getByRole("button",{name:"Empty module slot",exact:true}).first(),
      {rpc:"set_ship_module",args:{p_slot:"Engine A",p_item:null}});
    await station("Engine A: engine").waitFor();
    assert.equal(await page.locator(".sh-stock-panel.compatible").count(),0);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:join(scratch,browserName+".png")});
    reports.push(browserName+": PASS native module/crew return to empty and occupied cells, equip, move, panel return, invalid/cancel, server rejection");
  }finally{await browser.close()}
}
// Demonstrate that the regression specifically catches the old disabled-empty-cell bug.
html=await bundle(true);
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1450,height:900}});
  await ready(page);
  const target=page.getByRole("button",{name:"Empty module slot",exact:true}).first();
  assert.equal(await target.isDisabled(),true,"baseline has a disabled empty target");
  await page.getByRole("button",{name:"Engine A: engine",exact:true}).dragTo(target);
  assert.equal(await callCount(page),0,"baseline native drop on empty cell is lost");
  reports.push("baseline: REPRODUCED lost drop on disabled empty cargo cell");
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(scratch,{recursive:true,force:true})}
reports.forEach(line=>console.log(line));
