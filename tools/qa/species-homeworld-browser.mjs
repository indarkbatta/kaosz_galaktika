import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const require=createRequire(join(resolve(process.env.HOMEWORLD_BROWSER_TOOLS),'package.json'));
const {chromium,firefox}=require('playwright');
const temp=await mkdtemp(join(tmpdir(),'hatarvilag-homeworld-'));
let server;
const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const g1=id(1),g2=id(2),q1=id(3),q2=id(4),s1=id(5),s2=id(6),s3=id(7),loc1=id(8),loc2=id(9),loc3=id(10),ember=id(11),noxari=id(12);
const db={
 game_species:[
  {id:ember,slug:'ember',primary_attribute:'body',secondary_attribute:'mind',image_path:null,homeworld_location_id:null,is_published:true,resistances:[],game_species_i18n:[{locale:'hu',name:'Ember',description:''},{locale:'en',name:'Ember',description:''}],game_species_skill_bonuses:[]},
  {id:noxari,slug:'noxari',primary_attribute:'soul',secondary_attribute:'mind',image_path:null,homeworld_location_id:loc3,is_published:true,resistances:[],game_species_i18n:[{locale:'hu',name:'Noxari',description:''},{locale:'en',name:'Noxari',description:''}],game_species_skill_bonuses:[]}
 ],
 game_classes:[{id:id(20),slug:'mercenary',primary_attribute:'morale',secondary_attribute:'body',image_path:null,is_published:true,game_classes_i18n:[{locale:'hu',name:'Mercenary',description:''},{locale:'en',name:'Mercenary',description:''}],game_classes_skill_bonuses:[]}],game_skills:[],
 game_locales:[{code:'hu',native_name:'Magyar',name_en:'Hungarian',is_enabled:true,sort_order:0},{code:'en',native_name:'English',name_en:'English',is_enabled:true,sort_order:1}],
 game_galaxies:[{id:g1,slug:'borderworld',name_hu:'Határvilág',name_en:'Borderworld',is_published:true},{id:g2,slug:'andromeda',name_hu:'Androméda',name_en:'Andromeda',is_published:true}],
 game_quadrants:[{id:q1,galaxy_id:g1,slug:'frontier',name_hu:'Határvidék',name_en:'Frontier',is_published:true},{id:q2,galaxy_id:g2,slug:'outer',name_hu:'Külső',name_en:'Outer',is_published:true}],
 game_sectors:[{id:s1,quadrant_id:q1,slug:'alpha',name_hu:'Alfa rendszer',name_en:'Alpha System',is_published:true},{id:s2,quadrant_id:q1,slug:'beta',name_hu:'Béta rendszer',name_en:'Beta System',is_published:true},{id:s3,quadrant_id:q2,slug:'gamma',name_hu:'Gamma rendszer',name_en:'Gamma System',is_published:true}],
 game_locations:[
  {id:loc1,sector_id:s1,slug:'alpha_planet',is_published:true,game_locations_i18n:[{locale:'hu',name:'Alfa bolygó'},{locale:'en',name:'Alpha Planet'}]},
  {id:loc2,sector_id:s2,slug:'beta_station',is_published:true,game_locations_i18n:[{locale:'hu',name:'Béta állomás'},{locale:'en',name:'Beta Station'}]},
  {id:loc3,sector_id:s3,slug:'gamma_planet',is_published:true,game_locations_i18n:[{locale:'hu',name:'Gamma bolygó'},{locale:'en',name:'Gamma Planet'}]}
 ]
};
db.game_skills=['body','mind','soul','morale','social'].flatMap((attribute,a)=>Array.from({length:5},(_,n)=>({id:id(100+a*5+n),slug:attribute+n,attribute,position:n+1,is_combat:n===4,icon_path:null,game_skills_i18n:[{locale:'hu',name:attribute+' képzettség '+(n+1)}]})));
const mocks="const clone=v=>JSON.parse(JSON.stringify(v));\nexport const supabase={\n from(table){\n  return {\n   select(columns,options={}){\n    const data=clone(window.__speciesHomeworld.db[table]||[]);\n    const response=Promise.resolve({data:options.head?null:data,error:null,count:options.head?data.length:null});\n    response.order=()=>response;response.eq=()=>response;\n    return response;\n   },\n   update(value){return {eq(field,id){\n    const row=window.__speciesHomeworld.db[table].find(x=>x[field]===id);\n    if(!row)return Promise.resolve({error:{message:'Missing test record'}});\n    Object.assign(row,value);\n    window.__speciesHomeworld.updates.push({table,value,id});\n    return Promise.resolve({error:null});\n   }};},\n   insert(value){return {select(){return {single(){\n    const id='99999999-9999-4999-8999-999999999999';\n    window.__speciesHomeworld.db[table].push({id,...value});\n    return Promise.resolve({data:{id},error:null});\n   }};}};},\n   upsert(rows){window.__speciesHomeworld.translations.push({table,rows});return Promise.resolve({error:null});},\n   delete(){return {eq(){return Promise.resolve({error:null});}}}\n  };\n },\n rpc(){return Promise.resolve({error:null});}\n};";
try{
 const compiled=await build({entryPoints:['tools/qa/species-homeworld-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:temp,jsx:'automatic',define:{'import.meta.env':'{}'},
  plugins:[{name:'fixture-supabase',setup(b){
   b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'test-supabase',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:mocks}));
  }}]});
 const js=compiled.outputFiles.find(x=>x.path.endsWith('.js')).text;
 const css=compiled.outputFiles.find(x=>x.path.endsWith('.css'))?.text||'';
 const html='<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;height:100%;width:100%;background:#030711;color:#d4dfe8}'+css+'</style><div id="root"></div><script>window.__speciesHomeworld={db:'+JSON.stringify(db)+',updates:[],translations:[]}</script><script>'+js.replaceAll('</script','<\\/script')+'</script>';
 server=createServer((_,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 for(const [name,engine] of (process.env.TREE_LOCAL_CHROMIUM?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox]])){
  const browser=await engine.launch(process.env.TREE_LOCAL_CHROMIUM?{headless:true,executablePath:process.env.TREE_LOCAL_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1450,height:920}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   const fields={
    galaxy:page.getByRole('combobox',{name:'Galaxis'}),
    quadrant:page.getByRole('combobox',{name:'Kvadráns'}),
    sector:page.getByRole('combobox',{name:'Szektor / naprendszer'}),
    location:page.getByRole('combobox',{name:'Kezdőhelyszín'})
   };
   await page.getByRole('button',{name:'Kezdővilág',exact:true}).click();await fields.galaxy.waitFor();
   assert.equal(await fields.galaxy.inputValue(),'','Original Ember has no homeworld');
   assert.equal(await fields.sector.isDisabled(),true);
   await fields.galaxy.selectOption(g1);await fields.quadrant.selectOption(q1);await fields.sector.selectOption(s1);
   assert.equal(await fields.location.locator('option').count(),2,'Only Alpha system sites');
   await fields.location.selectOption(loc1);
   await fields.sector.selectOption(s2);
   assert.equal(await fields.location.inputValue(),'','Other-sector location cleared');
   assert.equal(await fields.location.locator('option').count(),2,'Only Beta system sites');
   await fields.location.selectOption(loc2);
   await page.getByRole('button',{name:'Mentés',exact:true}).click();
   await page.waitForFunction(target=>window.__speciesHomeworld.db.game_species[0].homeworld_location_id===target,loc2);
   await page.waitForFunction(target=>document.querySelector('select[aria-label="Kezdőhelyszín"]')?.value===target,loc2);
   assert.equal(await fields.location.inputValue(),loc2,'Homeworld survives save and refresh');
   const updates=await page.evaluate(()=>window.__speciesHomeworld.updates);
   assert.equal(updates.at(-1).table,'game_species');
   assert.equal(updates.at(-1).value.homeworld_location_id,loc2);
   await page.locator('.ed-roster-list .ed-record').nth(1).click();await page.getByRole('button',{name:'Kezdővilág',exact:true}).click();
   await page.waitForFunction(target=>document.querySelector('select[aria-label="Kezdőhelyszín"]')?.value===target,loc3);
   assert.equal(await fields.galaxy.inputValue(),g2);
   assert.equal(await fields.quadrant.inputValue(),q2);
   assert.equal(await fields.sector.inputValue(),s3);
   assert.equal(await fields.location.inputValue(),loc3);
   const width=await page.locator('.ed-editor').evaluate(el=>({content:el.clientWidth,scroll:el.scrollWidth}));
   assert.ok(width.scroll<=width.content+3,'No editor horizontal overflow '+JSON.stringify(width));
   for(const origin of ['species','classes']){if(origin==='classes'){await page.getByRole('button',{name:/^Kasztok(?:\s+\d+)?$/}).click();await page.getByText('Mercenary',{exact:true}).first().waitFor();}
    for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1280,height:720}]){await page.setViewportSize(viewport);for(const tab of ['Alapadatok','HP / védelem','Ellenállások','Skillek','Szótár']){await page.locator('.ed-editor>.ed-tabs').getByRole('button',{name:tab,exact:true}).click();await page.waitForTimeout(40);const bounds=await page.locator('.ed-form').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,width:el.clientWidth,scrollWidth:el.scrollWidth}));const pane=await page.locator('.ed-form>.ed-tab-pane').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));assert.ok(pane.scroll<=pane.height+2,JSON.stringify({origin,viewport,tab,pane}));assert.ok(bounds.height>100&&bounds.scroll<=bounds.height+2&&bounds.scrollWidth<=bounds.width+2,JSON.stringify({origin,viewport,tab,bounds}));}
    await page.getByRole('button',{name:'HP / védelem',exact:true}).click();assert.equal(await page.locator('.ed-branch-combat select').count(),5);assert.equal(await page.locator('.ed-form').evaluate(el=>getComputedStyle(el.querySelector('.ed-branch-combat')).borderRadius),'0px');}
   }await page.screenshot({path:'/tmp/origin-defense-tabs.png'});
   assert.deepEqual(errors,[],'Browser errors');
   console.log(name+': PASS species homeworld hierarchy, cascade, save, reload and old-world fallback');
  }finally{await browser.close();}
 }
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));
 await rm(temp,{recursive:true,force:true});
}
