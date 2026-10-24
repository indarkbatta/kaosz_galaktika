import type {Power} from './combat';
import type {TalentTree} from './talentTree';
export type ExpeditionActor={id:string;character_id:string;kind:'captain'|'companion';name_hu:string;name_en:string;species_id:string;class_id:string;portrait_path:string|null;image_path:string|null;level:number;xp_total:number;upgrade_points:number;skill_upgrades:Record<string,number>;health:number;max_health:number;attributes:Record<string,number>;defenses:Record<string,number>;skills:Record<string,number>;effective_defenses:Record<string,number>;effective_skills:Record<string,number>;powers:Power[];points:{species:number;class:number;shared:number};biography?:{description_hu?:string;description_en?:string}};
export type ExpeditionTemplate={id:string;slug:string;name_hu:string;name_en:string;description_hu:string;description_en:string;species_id:string;class_id:string;portrait_path:string|null;attribute_points:Record<string,number>;skill_points:Record<string,number>;species_node:string|null;class_node:string|null;hire_energy:number;is_published:boolean;revision:number};
export type ExpeditionOption={id:string;slug:string;attribute?:string;image_path?:string|null;texts:{locale:string;name:string}[]};
export type ExpeditionTemplateCatalog={templates:ExpeditionTemplate[];species:ExpeditionOption[];classes:ExpeditionOption[];skills:ExpeditionOption[];trees:TalentTree[];rules:{base_attribute_pips:number;free_attribute_pips:number;max_attribute_pips:number;free_skill_pips:number;max_allocated_skill_pips:number}};
export const expeditionLabel=(x:ExpeditionOption,locale:string)=>x.texts.find(t=>t.locale===locale)?.name||x.texts.find(t=>t.locale==='hu')?.name||x.slug;
export const expeditionAttributes={hu:{body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'},en:{body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'}};
export function expeditionError(message:string,locale:string){
 if(locale==='en')return message;
 const hu:Record<string,string>={
  'Editor permission required':'Szerkesztői jogosultság szükséges.',
  'Template changed; reload before saving':'A sablon megváltozott. Mentés előtt töltsd újra.',
  'Template changed; reload before hiring':'A sablon megváltozott. Frissítsd a kínálatot.',
  'Template unavailable':'A sablon már nem toborozható.',
  'Invalid species':'Válassz publikált fajt.',
  'Invalid class':'Válassz publikált kasztot.',
  'Allocations must be JSON objects':'Érvénytelen pontkiosztás.',
  'Unknown attribute key':'Ismeretlen tulajdonság a pontkiosztásban.',
  'Attribute points must be integers':'A tulajdonságpontok egész számok legyenek.',
  'Skill points must be integers':'A skillpontok egész számok legyenek.',
  'Invalid attribute allocation':'Érvénytelen tulajdonságpont-kiosztás.',
  'Attribute above maximum':'Az egyik tulajdonság meghaladja a maximumot.',
  'Assign all available attribute points':'Oszd el az összes tulajdonságpontot.',
  'Invalid skill allocation':'Érvénytelen skillpont-kiosztás.',
  'Unknown skill key':'Ismeretlen skill a pontkiosztásban.',
  'Assign all skill points':'Oszd el az összes skillpontot.',
  'Choose one starting talent in each available tree':'Válassz egy kezdő talentet mindkét elérhető fán.',
  'Wrong starting talent tree':'A kezdő talent nem a megfelelő fához tartozik.',
  'Talent tree unavailable':'A kiválasztott talentfa nem érhető el.',
  'Talent unavailable':'A talent nem érhető el.',
  'Talent prerequisites unmet':'A talent szint- vagy előfeltétel-követelménye nem teljesül.',
  'Party changed; reload':'A csapat megváltozott. Frissítsd az oldalt mentés előtt.',
  'Choose captain and up to three distinct companions':'A kapitány és legfeljebb három különböző társ választható.',
  'Choose at most five distinct powers':'Legfeljebb öt különböző aktív powert készíthetsz be.',
  'Actor not found':'Ez a karakter nem érhető el a saját állományodban.',
  'Service crew cannot equip items':'A hajós személyzet nem felszerelhető.',
  'Power unavailable':'A power nem érhető el.',
  'No upgrade points':'Nincs szabad skillfejlesztési pont.',
  'Skill upgrade limit reached':'A skill elérte a fejlesztési maximumát.',
  'Finish active encounter first':'Előbb fejezd be az aktív encountert.',
  'Insufficient energy':'Nincs elég energia.',
  'Companion already recruited':'Ezt a társat már toboroztad.',
  'Expedition roster full':'Az expedíciós állomány megtelt.',
  'Recruitment requires Frontier Station':'Toborozni a Határvidéki állomáson lehet.'
 };
 return hu[message]||message;
}
