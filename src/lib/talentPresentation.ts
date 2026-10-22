import {combatLabel,type Effect,type Formula} from './combat';
import type {TreeNode} from './talentTree';
const branches:Record<string,[string,string]>={survival:['Túlélő','Survivor'],resourceful:['Találékony','Resourceful'],social:['Kapcsolatépítő','Diplomat'],weapons:['Fegyvermester','Weapons specialist'],assault:['Rohamkatona','Assault veteran'],tactics:['Taktikus','Tactician']};
const flavors:Record<string,[string,string]>={
 'Hardy Settler':['A határvidék nem kegyelmez. Megtanultál talpon maradni ott is, ahol más már feladná.','The frontier shows no mercy. You learned to stay on your feet where others would give up.'],
 'Common Sense':['Ahol más csak hibát lát, te már a megoldást keresed. Egy apró részlet is elég, hogy összeálljon a kép.','Where others see a problem, you seek a solution. One small detail can bring the whole picture together.'],
 'Common Ground':['Idegen kikötőkben is megtalálod azokat a szavakat, amelyekből megértés és együttműködés születik.','Even in unfamiliar ports, you find the words that build understanding and cooperation.'],
 'Hardened Constitution':['A zord környezet megedzette a szervezeted.','Harsh environments have hardened your constitution.'],
 'Unbroken':['A félelem sem térít le az utadról.','Fear cannot turn you from your path.'],
 'Improviser':['Kevés eszközből is működő megoldást építesz.','Build a working solution with whatever is at hand.'],
 'Danger Sense':['A baj első jelére már mozdulsz.','You move at the first sign of danger.'],
 'Network of Contacts':['Minden kikötőben ismersz valakit.','You know someone in every port.'],
 'Natural Mediator':['Ott is egyezséget teremtesz, ahol más csak vitát lát.','Find agreement where others see only conflict.'],
 'Steady Shot':['Nyugodt kéz. Egyetlen biztos lövés.','A steady hand. One reliable shot.'],
 'Breach Shot':['Megtalálod a leggyengébb pontot a védelemben.','Find the weakest point in their defenses.'],
 'Contract Closed':['A megbízást egyetlen döntő lövéssel zárod le.','Close the contract with one decisive shot.'],
 'Take Cover':['Életben maradni is szakmai tudás.','Staying alive is a professional skill.'],
 'Field Dressing':['Gyors ellátás, és vissza a harcba.','Patch yourself up and return to the fight.'],
 'Hold the Line':['Ezen a ponton senki sem jut át.','No one gets past this position.'],
 'Suppressing Fire':['Nem engeded, hogy az ellenfél szabadon célozzon.','Deny the enemy a clear shot.'],
 'Disrupting Shot':['Egy jó találat az egész tervüket felborítja.','One good hit disrupts their entire plan.'],
 'Tactical Superiority':['Te választod meg az összecsapás ritmusát.','Set the pace of the engagement.']};
export function talentBranch(n:TreeNode,en:boolean){const key=n.description_en.match(/Branch:\s*([a-z]+)/i)?.[1]?.toLowerCase();return key&&branches[key]?branches[key][en?1:0]:en?'Talent branch':'Talentág';}
export function talentFlavor(n:TreeNode,en:boolean){return flavors[n.name_en]?.[en?1:0]||'';}
function formula(f:Formula|undefined,en:boolean){if(!f)return '—';const parts=[f.weapon?(en?'Weapon':'Fegyver')+(f.weapon!==1?' ×'+f.weapon:''):'',f.dice?f.dice+'D':'',f.pips?String(f.pips):'',f.attribute?combatLabel(f.attribute,en?'en':'hu')+(f.attribute_scale?' ×'+f.attribute_scale:''):''].filter(Boolean);return parts.join(' + ')||'0';}
export function effectSummary(e:Effect,en:boolean,skills:Record<string,string>){const locale=en?'en':'hu',duration=e.duration?` · ${e.duration} ${en?'turns':'kör'}`:'';
 if(e.type==='modifier'){const key=skills[e.key||'']||combatLabel(e.key||'',locale),suffix=e.stat==='defense'?(en?' defense target':' védelmi célszám'):e.stat==='resistance'?(en?' resistance':' ellenállás'):'';return `${(e.amount||0)>=0?'+':''}${e.amount||0}${e.stat==='skill'?' pip':e.stat==='resistance'?(en?' pp':' százalékpont'):''} ${key}${suffix}${duration}`;}
 if(e.type==='damage'||e.type==='ongoing_damage')return `${formula(e.formula,en)} ${en?'damage':'sebzés'}${duration}`;
 if(e.type==='heal'||e.type==='ongoing_heal')return `${formula(e.formula,en)} ${en?'healing':'gyógyítás'}${duration}`;
 return (en?'Special effect':'Különleges hatás')+duration;
}

export function talentRules(n:TreeNode,en:boolean){return (en?n.description_en:n.description_hu).replace(/^Planned level: \d+\. Branch: [a-z]+\.\s*/i,'').replace(/^Tervezett szint: \d+\. Ág: [^.]+\.\s*/,'').replace(/Previous branch node is the planned prerequisite\./g,'').replace(/Az ág előző node-ja a tervezett előfeltétel\./g,'').trim();}
