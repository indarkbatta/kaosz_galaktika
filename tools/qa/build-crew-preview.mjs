import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
const output = process.argv[2] || "/tmp/crew-preview.html";
const result = await build({
  entryPoints: ["tools/qa/crew-preview.tsx"],
  bundle: true,
  format: "esm",
  minify: true,
  define: { "import.meta.env": "{}" },
  outfile: "crew-preview.js",
  write: false,
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text,
  css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
const frame =
  "html,body,#root{margin:0;height:100%;background:#050a0f;color:#d9e0e4}.qa-toolbar{height:38px;display:flex;align-items:center;justify-content:center;gap:8px;font:10px sans-serif}.qa-toolbar button{border:1px solid #6b7880;color:#ddd;background:#14242e;padding:5px 10px;cursor:pointer}.qa-window{height:min(850px,calc(100vh - 58px));margin:0 auto}.cmd-summary{font:12px sans-serif;color:#b9c7cf}.qa-editor .ed-layout{height:100%;width:100%}.qa-editor .ed-shell{height:100%;width:100%;grid-template-columns:208px 232px minmax(0,1fr)}";
await writeFile(
  output,
  '<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Határvilág – Ship & Crew QA</title><style>' +
    css +
    frame +
    '</style><div id="root"></div><script type="module">' +
    js +
    "</script></html>",
);
console.log(output);
