import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorHeader,EditorTabs,EditorRoster,EditorFooter} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import './skill-challenge-editor.css';

type Step={name_hu:string;name_en:string;description_hu:string;description_en:string;skill_ids:string[];base_tn:number;energy_cost:number};
type Challenge={id:string;slug:string;location_id:string;name_hu:string;name_en:string;
 description_hu:string;description_en:string;steps:Step[];xp_full:number;xp_partial:number;xp_failure:number;
 reward_item_id:string|null;reward_qty:number;repeatable:boolean;cooldown_hours:number;is_published:boolean;sort_order:number};
type Skill={id:string;slug:string;attribute:string;game_skills_i18n:{locale:string;name:string}[]};
type Location={id:string;slug:string;game_locations_i18n:{locale:string;name:string}[]};
type Item={id:string;slug:string;game_items_i18n:{locale:string;name:string}[]};
const fresh=(location_id='',skill_id=''):Challenge=>({id:'',slug:'',location_id,name_hu:'',name_en:'',description_hu:'',
 description_en:'',steps:[0,1,2].map((_,i)=>({name_hu:'',name_en:'',description_hu:'',description_en:'',
 skill_ids:skill_id?[skill_id]:[],base_tn:9+i,energy_cost:7})),
 xp_full:75,xp_partial:30,xp_failure:10,reward_item_id:null,reward_qty:1,repeatable:false,cooldown_hours:24,
 is_published:false,sort_order:0});

export default function SkillChallengeEditor({locale,onBack,onSectionSelect}:{
 locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void;
}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [challenges,setChallenges]=useState<Challenge[]>([]);
 const [skills,setSkills]=useState<Skill[]>([]),[locations,setLocations]=useState<Location[]>([]),[items,setItems]=useState<Item[]>([]);
 const [draft,setDraft]=useState<Challenge>(fresh());
 const [tab,setTab]=useState('general'),[stepIndex,setStepIndex]=useState(0);
 const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[loading,setLoading]=useState(true);
 const [confirm,setConfirm]=useState(false);
 const pending=useRef<null|(()=>void)>(null);
 const name=(x:{name_hu:string;name_en:string})=>en?x.name_en:x.name_hu;
 const local=(x:{locale:string;name:string}[])=>
  x.find(t=>t.locale===locale)?.name||x.find(t=>t.locale==='hu')?.name||'—';
 const navigate=(next:()=>void)=>{if(dirty){pending.current=next;setConfirm(true);}else next();};
 const choose=(item:Challenge)=>{setDraft({...item,steps:item.steps.map(step=>({...step,skill_ids:[...step.skill_ids]}))});setTab('general');setStepIndex(0);setDirty(false);};
 const load=useCallback(async(keep?:string)=>{
  setLoading(true);
  try{
   const [c,s,l,i]=await Promise.all([
    supabase.from('game_skill_challenges').select('*').order('sort_order'),
    supabase.from('game_skills').select('id,slug,attribute,game_skills_i18n(locale,name)').order('attribute'),
    supabase.from('game_locations').select('id,slug,game_locations_i18n(locale,name)').order('slug'),
    supabase.from('game_items').select('id,slug,game_items_i18n(locale,name)').eq('is_published',true).order('slug')
   ]);
   const e=c.error||s.error||l.error||i.error;if(e)throw e;
   const rows=(c.data||[]) as Challenge[],ss=(s.data||[]) as Skill[],ll=(l.data||[]) as Location[];
   setChallenges(rows);setSkills(ss);setLocations(ll);setItems((i.data||[]) as Item[]);
   const selected=rows.find(x=>x.id===keep)||rows[0];
   setDraft(selected?{...selected,steps:selected.steps.map(step=>({...step,skill_ids:[...step.skill_ids]}))}:fresh(ll[0]?.id,ss[0]?.id));
   setStepIndex(0);setDirty(false);
  }catch(e){notify(e instanceof Error?e.message:String(e),'error');}finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const patch=(p:Partial<Challenge>)=>{setDraft(d=>({...d,...p}));setDirty(true);};
 const stepPatch=(p:Partial<Step>)=>{
  setDraft(d=>({...d,steps:d.steps.map((step,i)=>i===stepIndex?{...step,...p}:step)}));setDirty(true);
 };
 const newStep=()=>{if(draft.steps.length>=8)return;
  patch({steps:[...draft.steps,{name_hu:'',name_en:'',description_hu:'',description_en:'',skill_ids:skills[0]?[skills[0].id]:[],base_tn:10,energy_cost:7}]});
  setStepIndex(draft.steps.length);
 };
 const swap=(delta:number)=>{const other=stepIndex+delta;if(other<0||other>=draft.steps.length)return;
  const steps=[...draft.steps];[steps[stepIndex],steps[other]]=[steps[other],steps[stepIndex]];
  patch({steps});setStepIndex(other);
 };
 const removeStep=()=>{if(draft.steps.length<=2)return;patch({steps:draft.steps.filter((_,i)=>i!==stepIndex)});setStepIndex(Math.max(0,stepIndex-1));};
 const chooseSkill=(position:number,id:string)=>{
  const next=[...draft.steps[stepIndex].skill_ids];next[position]=id;
  stepPatch({skill_ids:[...new Set(next.filter(Boolean))].slice(0,3)});
 };
 const validate=()=>{
  if(!/^[a-z][a-z0-9_]*$/.test(draft.slug)||!draft.location_id||!draft.name_hu.trim()||!draft.name_en.trim())
   throw Error(tr('Azonosító, helyszín és magyar/angol név szükséges.','Slug, location and names required.'));
  if(draft.steps.length<2||draft.steps.length>8||draft.steps.some(x=>!x.name_hu.trim()||!x.name_en.trim()||
    x.skill_ids.length<1||new Set(x.skill_ids).size!==x.skill_ids.length||
    x.base_tn<4||x.base_tn>80||x.energy_cost<1||x.energy_cost>100))
   throw Error(tr('Minden lépéshez név, 1–3 különböző skill, 4–80 TN és 1–100 energia szükséges.','Each step needs names, 1–3 distinct skills, TN 4–80 and 1–100 energy.'));
 };
 const save=async(e:FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);
  try{
   validate();
   const row={slug:draft.slug,location_id:draft.location_id,name_hu:draft.name_hu.trim(),name_en:draft.name_en.trim(),
    description_hu:draft.description_hu,description_en:draft.description_en,steps:draft.steps,xp_full:draft.xp_full,
    xp_partial:draft.xp_partial,xp_failure:draft.xp_failure,reward_item_id:draft.reward_item_id||null,
    reward_qty:draft.reward_qty,repeatable:draft.repeatable,cooldown_hours:draft.cooldown_hours,
    is_published:draft.is_published,sort_order:draft.sort_order};
   const result=draft.id?await supabase.from('game_skill_challenges').update(row).eq('id',draft.id).select('id').single()
    :await supabase.from('game_skill_challenges').insert(row).select('id').single();
   if(result.error)throw result.error;
   await load(result.data.id);notify(tr('Kihívás mentve.','Challenge saved.'),'success');
  }catch(error){notify(error instanceof Error?error.message:String(error),'error');}finally{setBusy(false);}
 };
 const current=draft.steps[stepIndex];
 const skillName=(id:string)=>{const s=skills.find(x=>x.id===id);return s?local(s.game_skills_i18n):'—';};
 return <EditorFrame>
  <EditorNavigation locale={locale} active="challenges" onSelect={section=>navigate(()=>onSectionSelect(section))} onBack={()=>navigate(onBack)}/>
  <EditorRoster>
   <div className="ed-roster-top"><strong>{tr('Skill Challenge-ek','Skill Challenges')} ({challenges.length})</strong>
    <button type="button" onClick={()=>navigate(()=>{setDraft(fresh(locations[0]?.id,skills[0]?.id));setTab('general');setStepIndex(0);setDirty(false);})}>＋</button></div>
   <div className="ed-roster-list">{challenges.map(c=><button type="button" key={c.id}
    className={'ed-record '+(c.id===draft.id?'selected':'')} onClick={()=>navigate(()=>choose(c))}>
    <span className="ed-thumbnail">⚙</span><span className="ed-record-name"><strong>{name(c)}</strong>
    <small>{c.steps.length} {tr('lépés','steps')} · {c.is_published?tr('Aktív','Published'):tr('Piszkozat','Draft')}</small></span>
   </button>)}</div>
  </EditorRoster>
  <section className="ed-editor">
   <EditorHeader><strong>{name(draft)||tr('Új Skill Challenge','New Skill Challenge')}</strong><span>SPACE D6 / MULTI-STEP</span></EditorHeader>
   <EditorTabs label={tr('Kihívásfülek','Challenge editor tabs')} items={[
    {id:'general',name:tr('Alapadatok','General')},{id:'steps',name:tr('Lépések és skillek','Steps & Skills')},
    {id:'reward',name:tr('Jutalmak és nehézség','Rewards & Difficulty')}
   ]} selected={tab} onSelect={setTab}/>
   <form className="ed-form sc-editor-form" id="skill-challenge-form" onSubmit={save}>
    {tab==='general'&&<>
     <label>{tr('Technikai azonosító','Slug')}<input required value={draft.slug} onChange={e=>patch({slug:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')})}/></label>
     <label>{tr('Helyszín (ahol a hídról elérhető)','Location (bridge availability)')}
      <select value={draft.location_id} onChange={e=>patch({location_id:e.target.value})}>{locations.map(l=><option value={l.id} key={l.id}>{local(l.game_locations_i18n)}</option>)}</select>
     </label>
     <div className="sc-two"><label>Magyar név<input required value={draft.name_hu} onChange={e=>patch({name_hu:e.target.value})}/></label>
      <label>English name<input required value={draft.name_en} onChange={e=>patch({name_en:e.target.value})}/></label></div>
     <div className="sc-two"><label>Magyar leírás<textarea rows={3} value={draft.description_hu} onChange={e=>patch({description_hu:e.target.value})}/></label>
      <label>English description<textarea rows={3} value={draft.description_en} onChange={e=>patch({description_en:e.target.value})}/></label></div>
     <label className="sc-check"><input type="checkbox" checked={draft.is_published} onChange={e=>patch({is_published:e.target.checked})}/>{tr('Publikált, játékosoknak látható','Published and visible to players')}</label>
    </>}
    {tab==='steps'&&<div className="sc-steps">
     <div className="sc-step-roster"><strong>{tr('Lépések','Steps')} ({draft.steps.length}/8)</strong>
      {draft.steps.map((s,i)=><button type="button" className={stepIndex===i?'active':''} onClick={()=>setStepIndex(i)} key={i}>
       <b>{i+1}.</b> {name(s)||tr('Névtelen lépés','Unnamed step')}</button>)}
      <button type="button" disabled={draft.steps.length>=8} onClick={newStep}>＋ {tr('Lépés','Step')}</button>
     </div>
     {current&&<div className="sc-step-fields">
      <div className="sc-step-actions"><strong>{tr('Lépés','Step')} {stepIndex+1}</strong>
       <button type="button" disabled={stepIndex===0} onClick={()=>swap(-1)}>↑</button>
       <button type="button" disabled={stepIndex===draft.steps.length-1} onClick={()=>swap(1)}>↓</button>
       <button type="button" disabled={draft.steps.length<=2} onClick={removeStep}>×</button></div>
      <div className="sc-two"><label>Magyar név<input value={current.name_hu} onChange={e=>stepPatch({name_hu:e.target.value})}/></label>
       <label>English name<input value={current.name_en} onChange={e=>stepPatch({name_en:e.target.value})}/></label></div>
      <div className="sc-two"><label>Magyar leírás<textarea rows={2} value={current.description_hu} onChange={e=>stepPatch({description_hu:e.target.value})}/></label>
       <label>English description<textarea rows={2} value={current.description_en} onChange={e=>stepPatch({description_en:e.target.value})}/></label></div>
      <div className="sc-two"><label>{tr('Alap célszám (TN)','Base target number')}<input type="number" min={4} max={80} value={current.base_tn} onChange={e=>stepPatch({base_tn:Number(e.target.value)})}/></label>
       <label>{tr('Energia / próba','Energy / roll')}<input type="number" min={1} max={100} value={current.energy_cost} onChange={e=>stepPatch({energy_cost:Number(e.target.value)})}/></label></div>
      <strong>{tr('Választható skillek (legfeljebb 3)','Selectable skills (up to 3)')}</strong>
      {[0,1,2].map(pos=><label key={pos}>{pos===0?tr('Elsődleges skill','Primary skill'):tr('Alternatív skill','Alternative skill')+' '+pos}
       <select value={current.skill_ids[pos]||''} onChange={e=>chooseSkill(pos,e.target.value)}>
        {pos>0&&<option value="">—</option>}
        {skills.filter(s=>!current.skill_ids.some((v,i)=>v===s.id&&i!==pos)).map(s=><option value={s.id} key={s.id}>{local(s.game_skills_i18n)}</option>)}
       </select></label>)}
      <p>{tr('A játékos egyet választ az adott lépés engedélyezett skilljei közül.','The player chooses one of the allowed skills for each step.')}</p>
     </div>}
    </div>}
    {tab==='reward'&&<>
     <p>{tr('A célszám: alap TN + ⌊(karakterszint−1)/5⌋ + nehézségi módosító.','Target: base TN + floor((character level−1)/5) + difficulty modifier.')}</p>
     <div className="sc-modifiers"><span>Könnyű / Easy −2 · ×0,75 XP</span><span>Normál / Normal 0 · ×1 XP</span>
      <span>Nehéz / Hard +3 · ×1,5 XP</span><span>Extrém / Extreme +6 · ×2 XP</span></div>
     <div className="sc-two"><label>{tr('Teljes siker XP','Full success XP')}<input type="number" min={0} max={10000} value={draft.xp_full} onChange={e=>patch({xp_full:Number(e.target.value)})}/></label>
      <label>{tr('Részleges siker XP','Partial success XP')}<input type="number" min={0} max={10000} value={draft.xp_partial} onChange={e=>patch({xp_partial:Number(e.target.value)})}/></label>
      <label>{tr('Kudarc XP','Failure XP')}<input type="number" min={0} max={10000} value={draft.xp_failure} onChange={e=>patch({xp_failure:Number(e.target.value)})}/></label>
      <label>{tr('Sorrend','Sort order')}<input type="number" value={draft.sort_order} onChange={e=>patch({sort_order:Number(e.target.value)})}/></label></div>
     <label>{tr('Jutalomtárgy teljes sikerért','Full-success reward item')}<select value={draft.reward_item_id||''} onChange={e=>patch({reward_item_id:e.target.value||null})}>
      <option value="">{tr('Nincs tárgyjutalom','No item reward')}</option>{items.map(i=><option key={i.id} value={i.id}>{local(i.game_items_i18n)}</option>)}</select></label>
     {draft.reward_item_id&&<label>{tr('Mennyiség','Quantity')}<input type="number" min={1} max={100} value={draft.reward_qty} onChange={e=>patch({reward_qty:Number(e.target.value)})}/></label>}
     <label className="sc-check"><input type="checkbox" checked={draft.repeatable} onChange={e=>patch({repeatable:e.target.checked})}/>{tr('Megismételhető kihívás','Repeatable challenge')}</label>
     {draft.repeatable&&<label>{tr('Várakozási idő (óra)','Cooldown (hours)')}<input type="number" min={0} max={8760} value={draft.cooldown_hours} onChange={e=>patch({cooldown_hours:Number(e.target.value)})}/></label>}
     <p>{tr('3/4 siker: teljes; 2/4: részleges; különben kudarc. Az XP csak a végén jár.','3/4 successes: full; 2/4: partial; otherwise failure. XP pays out at the end only.')}</p>
    </>}
   </form>
   <EditorFooter><span className={dirty?'ed-unsaved':'ed-fine'}>{dirty?tr('● Nem mentett','● Unsaved'):'HU / EN · RLS'}</span>
    <button type="submit" form="skill-challenge-form" className="ed-submit" disabled={busy||loading}>{busy?tr('Mentés…','Saving…'):tr('MENTÉS','SAVE')}</button>
   </EditorFooter>
  </section>
  {confirm&&<div className="ed-modal-mask"><section className="ed-modal" role="alertdialog" aria-modal="true">
   <h3>{tr('Elveted a módosításokat?','Discard unsaved changes?')}</h3>
   <div><button type="button" onClick={()=>{setConfirm(false);pending.current=null;}}>{tr('Folytatom','Continue editing')}</button>
    <button type="button" className="ed-danger" onClick={()=>{setConfirm(false);setDirty(false);const f=pending.current;pending.current=null;f?.();}}>{tr('Elvetés','Discard')}</button></div>
  </section></div>}
 </EditorFrame>;
}