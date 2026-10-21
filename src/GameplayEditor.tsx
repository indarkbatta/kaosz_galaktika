import {useEffect,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorTabs,EditorRoster,EditorHeader,EditorFooter} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import {SkillArt} from './components/GameArt';
import './gameplay-editor.css';
import {WorldImageField} from './components/WorldImageField';
import {validWorldImage} from './lib/worldImages';
type Lang={code:string;native_name:string};
type Local={locale:string;name:string;description:string;success_message:string;failure_message:string};
type Action={image_path:string|null;id:string;slug:string;energy_cost:number;target_number:number;xp_success:number;xp_failure:number;skill_id:string;is_published:boolean;game_actions_i18n:Local[]};
type Rules={energy_per_tick:number;energy_max:number;energy_regen_seconds:number;xp_level_base:number;skill_points_per_level:number};
type Skill={id:string;slug:string;icon_path:string|null;game_skills_i18n:{locale:string;name:string}[]};
type Item={id:string;slug:string;rarity:string;game_items_i18n:{locale:string;name:string}[]};
type Drop={action_id:string;item_id:string;chance_percent:number;min_qty:number;max_qty:number};
type LootConfig={enabled:boolean;chance_percent:number;min_qty:number;max_qty:number};
export default function GameplayEditor({locale,onBack,onSectionSelect,initialTab='actions',activeSection='gameplay'}:{locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void;initialTab?:'actions'|'balance';activeSection?:'gameplay'|'balance'}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [actions,setActions]=useState<Action[]>([]),[skills,setSkills]=useState<Skill[]>([]);
 const [locales,setLocales]=useState<Lang[]>([]),[chosen,setChosen]=useState(''),[lang,setLang]=useState('hu');
 const [tab,setTab]=useState<string>(initialTab),[rules,setRules]=useState<Rules>({energy_per_tick:1,energy_max:16,energy_regen_seconds:3600,xp_level_base:100,skill_points_per_level:1});
 const [edit,setEdit]=useState<Action|null>(null),[translations,setTranslations]=useState<Record<string,Local>>({});
 const [busy,setBusy]=useState(false);
 const [items,setItems]=useState<Item[]>([]),[drops,setDrops]=useState<Drop[]>([]);
 const [lootRules,setLootRules]=useState<Record<string,LootConfig>>({});
 async function load(keep?:string){
  const [a,s,l,r,i,d]=await Promise.all([
   supabase.from('game_actions').select('id,slug,image_path,energy_cost,target_number,xp_success,xp_failure,skill_id,is_published,game_actions_i18n(locale,name,description,success_message,failure_message)').order('sort_order'),
   supabase.from('game_skills').select('id,slug,icon_path,game_skills_i18n(locale,name)').order('slug'),
   supabase.from('game_locales').select('code,native_name').eq('is_enabled',true).order('sort_order'),
   supabase.from('gameplay_rules').select('energy_per_tick,energy_max,energy_regen_seconds,xp_level_base,skill_points_per_level').eq('id',1).single(),
   supabase.from('game_items').select('id,slug,rarity,game_items_i18n(locale,name)').eq('is_published',true).order('slug'),
   supabase.from('game_action_loot').select('action_id,item_id,chance_percent,min_qty,max_qty')
  ]);
  const problem=a.error||s.error||l.error||r.error||i.error||d.error;
  if(problem){notify(problem.message,'error');return;}
  const arr=a.data as unknown as Action[];
  setActions(arr);setSkills(s.data as Skill[]);setLocales(l.data as Lang[]);setRules(r.data as Rules);
  setItems((i.data||[]) as Item[]);setDrops((d.data||[]) as Drop[]);
  const first=arr.find(x=>x.id===(keep||chosen))||arr[0];if(first)pick(first,(d.data||[]) as Drop[]);
 }
 function pick(a:Action,loadedDrops:Drop[]=drops){setChosen(a.id);setEdit({...a});setTranslations(Object.fromEntries(a.game_actions_i18n.map(v=>[v.locale,v])));
  setLootRules(Object.fromEntries(loadedDrops.filter(x=>x.action_id===a.id).map(x=>[x.item_id,{enabled:true,chance_percent:x.chance_percent,min_qty:x.min_qty,max_qty:x.max_qty}])));
 }
 useEffect(()=>{void load();},[]);
 const localized=(a:Action)=>a.game_actions_i18n.find(t=>t.locale===locale)?.name||a.game_actions_i18n.find(t=>t.locale==='hu')?.name||a.slug;
 const langValue:Local=translations[lang]||{locale:lang,name:'',description:'',success_message:'',failure_message:''};
 const updateLang=(k:keyof Local,value:string)=>setTranslations(prev=>({...prev,[lang]:{...langValue,[k]:value}}));
 async function save(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);
  try{
   if(tab==='balance'){
    const {error}=await supabase.from('gameplay_rules').update(rules).eq('id',1);if(error)throw error;
   }else if(tab==='loot'){
    if(!edit)throw Error('No action selected');
    const configured=Object.entries(lootRules).filter(([,rule])=>rule.enabled).map(([item_id,rule])=>({item_id,chance_percent:rule.chance_percent,min_qty:rule.min_qty,max_qty:rule.max_qty}));
    const {error}=await supabase.rpc('replace_action_loot',{p_action:edit.id,p_drops:configured});if(error)throw error;
   }else{
    if(!edit)throw Error('No action');
    if(!translations.hu?.name.trim()||!translations.en?.name.trim())throw Error(tr('A magyar és angol név kötelező.','HU and EN names are required.'));
    if(!validWorldImage(edit.image_path))throw Error(tr('Érvénytelen képútvonal.','Invalid artwork path.'));
    const row={image_path:edit.image_path,skill_id:edit.skill_id,energy_cost:edit.energy_cost,target_number:edit.target_number,xp_success:edit.xp_success,xp_failure:edit.xp_failure,is_published:edit.is_published};
    const {error}=await supabase.from('game_actions').update(row).eq('id',edit.id);if(error)throw error;
    const rows=Object.values(translations).filter(x=>x.name.trim()).map(x=>({action_id:edit.id,locale:x.locale,name:x.name.trim(),description:x.description.trim(),success_message:x.success_message.trim(),failure_message:x.failure_message.trim()}));
    const out=await supabase.from('game_actions_i18n').upsert(rows,{onConflict:'action_id,locale'});if(out.error)throw out.error;
   }
   await load(edit?.id);notify(tr('Sikeresen mentve.','Saved.'),'success');
  }catch(e){notify(e instanceof Error?e.message:tr('Mentési hiba','Save error'),'error');}finally{setBusy(false);}
 }
 const patchLoot=(itemId:string,patch:Partial<LootConfig>)=>setLootRules(p=>({...p,[itemId]:{...(p[itemId]??{enabled:false,chance_percent:100,min_qty:1,max_qty:1}),...patch}}));
 const nr=(field:keyof Rules,number:number)=>setRules(prev=>({...prev,[field]:number}));
 const na=(field:keyof Action,value:string|number|boolean)=>setEdit(prev=>prev?{...prev,[field]:value}:prev);
 return <EditorFrame>
  <EditorNavigation locale={locale} active={activeSection} onBack={onBack} onSelect={onSectionSelect}/>
  <EditorRoster><div className="ed-roster-top"><strong>{tr('Játékakciók','Game actions')} ({actions.length})</strong></div><div className="ed-roster-list">{actions.map(a=>{const s=skills.find(x=>x.id===a.skill_id);return <button type="button" className={'ed-record '+(chosen===a.id?'selected':'')} onClick={()=>{pick(a);setTab('actions');}} key={a.id}><span className="ed-thumbnail">{s&&<SkillArt slug={s.slug} path={s.icon_path}/>}</span><span className="ed-record-name"><strong>{localized(a)}</strong><small>⚡ {a.energy_cost} · {tr('Célszám (TN)','Target Number (TN)')} {a.target_number}</small></span></button>})}</div></EditorRoster>
  <section className="ed-editor"><EditorHeader><strong>{tab==='balance'?tr('Játékszabályok','Game rules'):edit?localized(actions.find(a=>a.id===edit.id)||actions[0]):'—'}</strong><span>M2 / M3</span></EditorHeader>
   <EditorTabs label="Gameplay Editor" selected={tab} onSelect={setTab} items={[{id:'actions',name:tr('Akciók és szótár','Actions & dictionary')},{id:'balance',name:tr('Energia és XP','Energy & XP')},{id:'loot',name:tr('Zsákmány','Loot')}]}/>

   <form className="ed-form ge-form" onSubmit={save} id="gameplay-form">
    {tab==='balance'&&<><label>{tr('Tick időtartama (perc)','Tick duration (minutes)')}<input aria-label={tr('Tick időtartama (perc)','Tick duration (minutes)')} required type="number" min={.5} max={1440} step={.5} value={rules.energy_regen_seconds/60} onChange={e=>nr('energy_regen_seconds',Math.round(Number(e.target.value)*60))}/></label><p>{tr('Az értékek szerveroldalon érvényesülnek, Vercel deploy nélkül.','Changes take effect on the server without a Vercel deploy.')}</p>
     {([['energy_max',tr('Maximális energiatartalék','Maximum energy reserve'),1,1000],['energy_per_tick',tr('Visszatérő energia / tick','Energy restored / tick'),1,1000],['xp_level_base',tr('Szintlépési XP-alap','Level XP base'),20,100000],['skill_points_per_level',tr('Skillpip / szint','Skill pips per level'),1,10]] as const).map(([field,label,min,max])=><label key={field}>{label}<input required type="number" min={min} max={max} value={rules[field]} onChange={e=>nr(field,Number(e.target.value))}/></label>)}
     <p>{tr('1 tick = ','1 tick = ')}{rules.energy_regen_seconds/60} {tr('perc','minutes')} · +{rules.energy_per_tick} {tr('energia','energy')} · {tr('maximum','maximum')} {rules.energy_max}. {tr('A kihívások CD-je ugyanezt a tickidőt használja.','Challenge cooldowns use this same tick duration.')}</p>
    </>}
    {tab==='loot'&&edit&&<><p>{tr('Sikeres akció után a szerver itt megadott eséllyel osztja ki a jutalmat.','On a successful action, the server awards loot using these probabilities.')}</p><div className="ge-loot-list">{items.map(item=>{const rule=lootRules[item.id]||{enabled:false,chance_percent:100,min_qty:1,max_qty:1};const label=item.game_items_i18n.find(x=>x.locale===locale)?.name||item.game_items_i18n.find(x=>x.locale==='hu')?.name||item.slug;return <div className="ge-loot-row" key={item.id}><label className="ge-checkbox"><input type="checkbox" checked={rule.enabled} onChange={e=>patchLoot(item.id,{enabled:e.target.checked})}/><span>{label}</span></label><label>{tr('Esély %','Chance %')}<input type="number" min="0" max="100" disabled={!rule.enabled} value={rule.chance_percent} onChange={e=>patchLoot(item.id,{chance_percent:Number(e.target.value)})}/></label><label>{tr('Min.','Min.')}<input type="number" min="1" max="100" disabled={!rule.enabled} value={rule.min_qty} onChange={e=>patchLoot(item.id,{min_qty:Number(e.target.value)})}/></label><label>{tr('Max.','Max.')}<input type="number" min="1" max="100" disabled={!rule.enabled} value={rule.max_qty} onChange={e=>patchLoot(item.id,{max_qty:Number(e.target.value)})}/></label></div>})}</div></>}
    {tab==='actions'&&edit&&<><WorldImageField locale={locale} value={edit.image_path} onChange={image_path=>setEdit({...edit,image_path})}/><div className="ge-grid">{([['energy_cost',tr('Energiaköltség','Energy cost'),1,500],['target_number',tr('Célszám (TN)','Target Number (TN)'),2,100],['xp_success',tr('XP siker esetén','XP on success'),0,10000],['xp_failure',tr('XP kudarc esetén','XP on failure'),0,10000]] as const).map(([key,label,min,max])=><label key={key}>{label}<input required type="number" min={min} max={max} value={edit[key]} onChange={e=>na(key,Number(e.target.value))}/></label>)}</div>
      <label>{tr('Használt képesség','Skill used')}<select value={edit.skill_id} onChange={e=>na('skill_id',e.target.value)}>{skills.map(s=><option key={s.id} value={s.id}>{s.game_skills_i18n.find(t=>t.locale===locale)?.name||s.slug}</option>)}</select></label>
      <label className="ge-checkbox"><input type="checkbox" checked={edit.is_published} onChange={e=>na('is_published',e.target.checked)}/>{tr('Publikált','Published')}</label>
      <div className="ed-language-list">{locales.map(x=><button type="button" key={x.code} className={lang===x.code?'active':''} onClick={()=>setLang(x.code)}>{x.native_name}</button>)}</div>
      {([['name',tr('Akciónév','Action name')],['description',tr('Leírás','Description')],['success_message',tr('Siker szövege','Success text')],['failure_message',tr('Kudarc szövege','Failure text')]] as const).map(([key,label])=><label key={key}>{label} ({lang.toUpperCase()}){key==='name'?<input value={langValue[key]} onChange={e=>updateLang(key,e.target.value)}/>:<textarea rows={2} value={langValue[key]} onChange={e=>updateLang(key,e.target.value)}/>}</label>)}
     </>}
   </form>
   <EditorFooter><span className="ed-fine">HU / EN</span><button className="ed-submit" type="submit" form="gameplay-form" disabled={busy}>{tr('MENTÉS','SAVE')}</button></EditorFooter>
  </section>
 </EditorFrame>;
}
