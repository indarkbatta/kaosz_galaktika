// Rebuild the isolated read-only visual fixture: node tools/qa/build-inventory-preview.mjs [output.html] [width]
import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
const output=process.argv[2]||'/tmp/inventory-preview.html';
const width=Number(process.argv[3]||1380);
if(!Number.isFinite(width)||width<320||width>2000)throw new Error('Invalid preview width');
const result=await build({entryPoints:['tools/qa/inventory-preview.tsx'],bundle:true,format:'esm',minify:true,define:{'import.meta.env':'{}'},outfile:'inventory-preview.js',write:false});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
const frame=`html,body,#root{margin:0;height:100%;background:#050a0f}.qa-window{height:min(850px,calc(100vh - 40px));width:min(${width}px,calc(100vw - 40px));margin:20px auto}.cmd-summary{font:12px sans-serif;color:#bac4c7}.cmd-summary p{margin:5px 0}`;
await writeFile(output,'<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Határvilág – Inventory QA</title><style>'+css+frame+'</style><div id="root"></div><script type="module">'+js+'</script></html>');
console.log(output);
