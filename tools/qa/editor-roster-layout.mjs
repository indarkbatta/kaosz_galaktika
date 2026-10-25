import assert from 'node:assert/strict';
/** All content editors inherit this geometry from editor.css. */
export async function assertEditorRosterLayout(page){
 const nav=await page.locator('.ed-shell > .ed-nav').boundingBox();
 const editor=await page.locator('.ed-shell > .ed-editor').boundingBox();
 const roster=await page.locator('.ed-shell > .ed-roster').boundingBox();
 const shell=await page.locator('.ed-shell').boundingBox();
 assert.ok(nav.x+nav.width<=editor.x+1,'Navigation stays left of editing surface');
 assert.ok(editor.x+editor.width<=roster.x+1,'Roster is right of editing surface');
 assert.ok(Math.abs(roster.width-464)<1,'Roster doubles from 232px to 464px');
 assert.ok(Math.abs(roster.x+roster.width-(shell.x+shell.width-1))<2,'Roster occupies right edge');
 for(const tabs of await page.locator('.ed-editor .ed-tabs').all())assert.equal(await tabs.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'All editor tabs remain visible');
 assert.ok(shell.x>=0&&shell.x+shell.width<=page.viewportSize().width,'Shell stays within viewport');
}
