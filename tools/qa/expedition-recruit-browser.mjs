import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {setupRecruitDatabase,seedRecruitTemplate} from './expedition-recruit-db-fixture.mjs';
const require=createRequire(resolve(process.env.WORLD_BROWSER_TOOLS,'package.json'));
const {PGlite}=require('@electric-sql/pglite'),{chromium,firefox}=require('playwright');
const db=new PGlite();let server;
try{
 await setupRecruitDatabase(db);const {row,doc}=await seedRecruitTemplate(db);
 // A real published tree with a starting passive exercises the embedded talent cards.
 const talent=(await db.query('select id from game_talents where species_id=$1 limit 1',[doc.species_id])).rows[0].id;
 const node=crypto.randomUUID();
 const treeDoc={species_id:doc.species_id,class_id:null,width:32,height:24,is_published:true,nodes:[{id:node,x:0,y:0,name_hu:'Kezdő állhatatosság',name_en:'Starting resolve',description_hu:'Hosszabb leírás a képességről.',description_en:'Description of the ability.',kind:'passive',talent_id:talent,power_id:null,effects:[],min_level:1}],connections:[]};
 for(let i=1;i<3;i++){
  const passive=(await db.query("insert into game_talents(slug,species_id,effects,is_published) select $1,species_id,effects,true from game_talents where id=$2 returning id",['qa_browser_branch_'+i,talent])).rows[0].id;
  treeDoc.nodes.push({...treeDoc.nodes[0],id:crypto.randomUUID(),x:i*6,talent_id:passive,name_hu:i===1?'A túlélés mestersége':'Fegyelmezett ellenállás',name_en:i===1?'Master of survival':'Disciplined resistance'});
 }
 await db.query('select save_talent_tree(null,null,$1)',[JSON.stringify(treeDoc)]);
 await db.query('select save_expedition_template($1,1,$2)',[row.id,JSON.stringify({...doc,species_node:node})]);
 const result=await build({entryPoints:['tools/qa/expedition-recruit-browser-fixture.tsx'],bundle:true,write:false,format:'iife',outdir:'/tmp/expedition-recruit-ui',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'rpc-boundary',setup(b){b.onResolve({filter:/[\\/]lib[\\/]supabase$/},()=>({path:'rpc',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export const supabase={rpc:async(method,args)=>fetch('/rpc',{method:'POST',body:JSON.stringify({method,args})}).then(r=>r.json())};`,loader:'js'}));}}]});
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const methods={get_expedition_template_catalog:[],save_expedition_template:['p_template','p_revision','p_record'],preview_expedition_template:['p_record'],get_expedition_recruitment:[],get_expedition_roster:[],get_expedition_actor_trees:['p_actor'],learn_expedition_talent:['p_actor','p_node','p_revision'],hire_expedition_companion:['p_template','p_revision','p_request'],upgrade_expedition_skill:['p_actor','p_skill']};
 server=createServer(async(req,res)=>{if(req.url==='/rpc'){let body='';for await(const c of req)body+=c;const {method,args={}}=JSON.parse(body);try{assert.ok(method in methods);const keys=methods[method],r=await db.query('select public.'+method+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') result',keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]));res.end(JSON.stringify({data:r.rows[0].result,error:null}));}catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}return;}res.setHeader('content-type','text/html; charset=utf-8');res.end('<meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script>'+js+'</script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 for(const [name,driver] of process.env.TREE_LOCAL_CHROMIUM?[['chromium',chromium]]:[['chromium',chromium],['firefox',firefox]]){
  const browser=await driver.launch(process.env.TREE_LOCAL_CHROMIUM?{executablePath:process.env.TREE_LOCAL_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']}:{});
  try{
   const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://assets.voidnoir.net/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#263c46"/></svg>'}));
   await page.goto(url);await page.getByRole('button',{name:'Vaskéz',exact:false}).waitFor();
   await page.getByRole('button',{name:'Szótár',exact:true}).click();await page.getByLabel('Magyar leírás',{exact:true}).fill('Böngészőből mentett társ.');
   await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ed-footer span')?.textContent==='Mentve');
   await page.reload();await page.getByRole('button',{name:'Szótár',exact:true}).click();await page.getByLabel('Magyar leírás',{exact:true}).waitFor();assert.equal(await page.getByLabel('Magyar leírás',{exact:true}).inputValue(),'Böngészőből mentett társ.');
   const sizes=[{width:1920,height:1080},{width:1366,height:768},{width:1280,height:720}];
   for(const size of sizes){await page.setViewportSize(size);for(const tab of ['Alapadatok','Tulajdonságok','Skillek','Kezdő talentek','Szótár','Összesítés']){await page.getByRole('navigation',{name:'Társ szerkesztőfülek'}).getByRole('button',{name:tab,exact:true}).click();for(const selector of ['.ed-form','.exp-edit-fields','.ed-nav','.ed-nav-groups'])assert.ok(await page.locator(selector).evaluate(e=>e.scrollHeight<=e.clientHeight+1),`${name} ${selector} ${tab} ${JSON.stringify(size)}`);}}
   await page.getByRole('button',{name:'Előnézet számítása',exact:true}).click();await page.locator('.exp-edit-fields h3').filter({hasText:'HP'}).waitFor();
   if(process.env.TREE_LOCAL_CHROMIUM)await page.screenshot({path:'/tmp/expedition-companion-editor.png'});
   await page.getByRole('button',{name:'Másolat',exact:true}).click();
   await page.getByRole('button',{name:'Alapadatok',exact:true}).click();await page.getByLabel('Azonosító',{exact:true}).fill('qa_copy_'+name);
   await page.getByRole('button',{name:'Szótár',exact:true}).click();await page.getByLabel('Magyar név',{exact:true}).fill('Új társ '+name);await page.getByLabel('Angol név',{exact:true}).fill('New companion '+name);
   await page.getByRole('button',{name:'MENTÉS',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ed-footer span')?.textContent==='Mentve');
   await page.reload();await page.getByRole('button',{name:'Új társ '+name,exact:false}).waitFor();await page.getByRole('button',{name:'Vaskéz',exact:false}).click();
   // An unsaved edit cannot be lost by selecting another record.
   await page.getByRole('button',{name:'Alapadatok',exact:true}).click();await page.getByLabel('Azonosító',{exact:true}).fill('unsaved');await page.getByRole('button',{name:'Új',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Mégse',exact:true}).click();assert.equal(await page.getByLabel('Azonosító',{exact:true}).inputValue(),'unsaved');
   await page.goto(url+'/?play=1');await page.locator('.exp-sheet-head button').waitFor();
   const owned=(await db.query('select count(*)::int n from private.expedition_actors where template_id=$1',[row.id])).rows[0].n;
   if(!owned){await page.getByRole('button',{name:/TOBORZÁS/}).dblclick();await page.getByRole('button',{name:'Karaktereim',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.exp-sheet-head h3')?.textContent==='Vaskéz');}
   else{await page.getByRole('button',{name:'Karaktereim',exact:true}).click();await page.getByRole('button',{name:/Vaskéz.*Szint/}).click();}
   await page.reload();await page.getByRole('button',{name:'Karaktereim',exact:true}).click();await page.getByRole('button',{name:/Vaskéz.*Szint/}).click();
   for(const size of sizes){await page.setViewportSize(size);for(const tab of ['Összesítés','Skillek','Talentek','Powerek']){await page.getByRole('button',{name:tab,exact:true}).click();if(tab==='Talentek'){await page.locator('.pt-panel .pt-nodes article').first().waitFor();for(const selector of ['.pt-nodes article','.pt-card-body','.pt-card-actions'])assert.ok(await page.locator(selector).evaluateAll(es=>es.every(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1)),selector+' '+JSON.stringify(size)+' '+JSON.stringify(await page.locator(selector).evaluateAll(es=>es.map(e=>({h:e.clientHeight,sh:e.scrollHeight,w:e.clientWidth,sw:e.scrollWidth})))));if(process.env.TREE_LOCAL_CHROMIUM)await page.screenshot({path:'/tmp/expedition-companion-talents.png'});}for(const selector of ['.exp-recruit','.exp-sheet-content','.cmd-body'])assert.ok(await page.locator(selector).evaluate(e=>e.scrollHeight<=e.clientHeight+1),`${name} ${selector} ${tab} ${JSON.stringify(size)}`);}}
   const actor=(await db.query('select id,character_id,level,xp_total from private.expedition_actors where template_id=$1',[row.id])).rows[0];
   await db.query('select private.award_expedition_actor_xp($1,$2,$3,gen_random_uuid())',[actor.character_id,actor.id,100*actor.level*(actor.level+1)/2-Number(actor.xp_total)]);
   await page.reload();await page.getByRole('button',{name:'Karaktereim',exact:true}).click();await page.getByRole('button',{name:/Vaskéz.*Szint/}).click();await page.getByRole('button',{name:'Skillek',exact:true}).click();await page.locator('.exp-skill-list button:enabled').first().click();await page.waitForFunction(()=>document.querySelector('.exp-sheet-content>p')?.textContent.includes('0'));
   await page.getByRole('button',{name:'Talentek',exact:true}).click();await page.locator('.pt-select:enabled').first().click();await page.waitForFunction(()=>document.querySelector('.pt-points')?.textContent.includes('Közös: 0'));
   await page.goto(url+'/?play=1&lang=en');await page.getByRole('button',{name:'My characters',exact:true}).click();await page.getByRole('button',{name:/Ironhand.*Level/}).waitFor();
   assert.deepEqual(errors,[]);
   console.log('PASS '+name+': editor SQL save/reload, six tabs/three sizes without scroll, preview, dirty guard, double-click hire/reload, actor talent view, real skill growth, HU/EN.');
  }finally{await browser.close();}
 }
}catch(e){console.error(e.message,e.stack);process.exitCode=1;}finally{server?.close();await db.close();}
