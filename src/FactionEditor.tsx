import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorTabs,EditorRoster,EditorHeader,EditorFooter} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import {WorldArtwork,WorldImageField} from './components/WorldImageField';
import {LucidePlus} from './components/LucideSigns';
import {validWorldImage} from './lib/worldImages';
import './faction-editor.css';

type Texts={name_hu:string;name_en:string;description_hu:string;description_en:string};
type Presence={quadrant_id:string;strength:string;notes_hu:string;notes_en:string};
type Company=Texts&{id:string;activity_hu:string;activity_en:string;sort_order:number};
type Tier={id:string;threshold:number;name_hu:string;name_en:string;credits:number;items:{item_id:string;quantity:number}[]};
type Faction=Texts&{id:string;slug:string;image_path:string|null;color:string;home_quadrant_id:string|null;reputation_min:number;reputation_max:number;is_published:boolean;revision:number;presence:Presence[];companies:Company[];tiers:Tier[]};
type Quadrant={id:string;name_hu:string;name_en:string;is_published:boolean;game_galaxies:{name_hu:string;name_en:string}};
type Item={id:string;slug:string;is_published:boolean;game_items_i18n:{locale:string;name:string}[]};
const texts=():Texts=>({name_hu:'',name_en:'',description_hu:'',description_en:''});
const blank=():Faction=>({...texts(),id:'',slug:'',image_path:null,color:'#cc7048',home_quadrant_id:null,reputation_min:0,reputation_max:1000,is_published:false,revision:0,presence:[],companies:[],tiers:[]});
const strengths=[['none','Nincs jelenlét','No presence'],['covert','Rejtett','Covert'],['minor','Gyenge','Minor'],['established','Jelentős','Established'],['dominant','Domináns','Dominant']];
const query='*,presence:game_faction_presence(*),companies:game_faction_companies(*),tiers:game_faction_tiers(*,items:game_faction_reward_items(item_id,quantity))';
export default function FactionEditor({locale,onBack,onSectionSelect}:{locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [factions,setFactions]=useState<Faction[]>([]),[quadrants,setQuadrants]=useState<Quadrant[]>([]),[items,setItems]=useState<Item[]>([]);
 const [draft,setDraft]=useState<Faction>(blank),[tab,setTab]=useState('general'),[language,setLanguage]=useState<'hu'|'en'>('hu');
 const [search,setSearch]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[discard,setDiscard]=useState(false);
 const pending=useRef<null|(()=>void)>(null),guard=useRef(false),generation=useRef(0);
 const name=(f:{name_hu:string;name_en:string})=>en?f.name_en:f.name_hu;
 const itemName=(i:Item)=>i.game_items_i18n.find(t=>t.locale===locale)?.name||i.game_items_i18n.find(t=>t.locale==='hu')?.name||i.slug;
 const choose=useCallback((f:Faction)=>{setDraft(structuredClone(f));setDirty(false);setError('');},[]);
 const load=useCallback(async(id?:string,revision?:number)=>{
  const ticket=++generation.current;setLoading(true);
  try{
   const [f,q,i]=await Promise.all([supabase.from('game_factions').select(query).order('slug'),supabase.from('game_quadrants').select('id,name_hu,name_en,is_published,game_galaxies(name_hu,name_en)').order('slug'),supabase.from('game_items').select('id,slug,is_published,game_items_i18n(locale,name)').order('slug')]);
   if(f.error||q.error||i.error)throw new Error((f.error||q.error||i.error)!.message);
   if(ticket!==generation.current)return;
   const rows=(f.data||[]) as unknown as Faction[];
   rows.forEach(row=>{row.companies.sort((a,b)=>a.sort_order-b.sort_order);row.tiers.sort((a,b)=>a.threshold-b.threshold);});
   const saved=rows.find(row=>row.id===id);
   if(revision!==undefined&&(!saved||saved.revision!==revision))throw new Error('Saved faction could not be verified; reload.');
   setFactions(rows);setQuadrants((q.data||[]) as unknown as Quadrant[]);setItems((i.data||[]) as Item[]);choose(saved||rows[0]||blank());
  }finally{if(ticket===generation.current)setLoading(false);}
 },[choose]);
 useEffect(()=>{void load().catch(e=>setError(e.message));return()=>{generation.current++;};},[load]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 function navigate(next:()=>void){if(busy||loading)return;if(dirty){pending.current=next;setDiscard(true);}else next();}
 function patch(p:Partial<Faction>){setDraft(d=>({...d,...p}));setDirty(true);}
 function patchTier(id:string,p:Partial<Tier>){patch({tiers:draft.tiers.map(t=>t.id===id?{...t,...p}:t)});}
 function patchCompany(id:string,p:Partial<Company>){patch({companies:draft.companies.map(c=>c.id===id?{...c,...p}:c)});}
 function addTier(){let threshold=draft.reputation_min;while(draft.tiers.some(t=>t.threshold===threshold)&&threshold<=draft.reputation_max)threshold++;if(threshold>draft.reputation_max)return;patch({tiers:[...draft.tiers,{id:crypto.randomUUID(),threshold,name_hu:'Új rang',name_en:'New rank',credits:0,items:[]}]});}
 const sortedTiers=[...draft.tiers].sort((a,b)=>a.threshold-b.threshold);
 function validate(){
  if(!/^[a-z][a-z0-9_]{1,79}$/.test(draft.slug)||!draft.name_hu.trim()||!draft.name_en.trim()||!validWorldImage(draft.image_path)){setTab('general');return tr('Érvényes azonosító, képútvonal és magyar/angol név szükséges.','Valid slug, artwork path and Hungarian/English names are required.');}
  if(draft.is_published&&!draft.home_quadrant_id){setTab('presence');return tr('Publikáláshoz válassz home quadránst.','Choose a home quadrant before publishing.');}
  if(!Number.isInteger(draft.reputation_min)||!Number.isInteger(draft.reputation_max)||draft.reputation_min>=draft.reputation_max||draft.reputation_min< -1000000||draft.reputation_max>1000000||new Set(draft.tiers.map(t=>t.threshold)).size!==draft.tiers.length||draft.tiers.some(t=>!Number.isInteger(t.threshold)||t.threshold<draft.reputation_min||t.threshold>draft.reputation_max||!t.name_hu.trim()||!t.name_en.trim()||!Number.isInteger(t.credits)||t.credits<0||t.credits>1000000000||t.items.some(i=>!i.item_id||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>10000)||new Set(t.items.map(i=>i.item_id)).size!==t.items.length)){
   setTab('reputation');return tr('Ellenőrizd a reputációhatárokat, az egyedi mérföldköveket, a két nyelvű rangneveket és a jutalmakat.','Check reputation bounds, unique milestones, bilingual rank names and rewards.');}
  if(draft.companies.some(c=>!c.name_hu.trim()||!c.name_en.trim())){setTab('companies');return tr('Minden cég magyar és angol neve kötelező.','Each company requires Hungarian and English names.');}
  return '';
 }
 async function save(event:FormEvent){event.preventDefault();if(guard.current||loading)return;const invalid=validate();if(invalid){setError(invalid);return;}
  guard.current=true;setBusy(true);setError('');
  try{
   const {presence,companies,tiers,...faction}=draft;
   const r=await supabase.rpc('save_game_faction',{p_faction:faction,p_presence:presence,p_companies:companies,p_tiers:tiers,p_expected_revision:draft.id?draft.revision:null});
   if(r.error)throw new Error(r.error.message);
   const saved=r.data as {id:string;revision:number};
   // Keep the returned ID/revision even if readback fails: retry updates this record instead of duplicating it.
   setDraft(d=>({...d,id:saved.id,revision:saved.revision}));
   await load(saved.id,saved.revision);notify(tr('Frakció, jelenlét, cégek és jutalmak mentve.','Faction, presence, companies and rewards saved.'),'success');
  }catch(e){const message=e instanceof Error?e.message:'Save failed';setError(message==='Faction changed since loading; reload before saving'?tr('Más szerkesztő módosította a frakciót. Töltsd újra mentés előtt.','Another editor changed this faction. Reload before saving.'):message);}
  finally{guard.current=false;setBusy(false);}
 }
 const langButtons=<div className="ed-language-list">{(['hu','en'] as const).map(l=><button key={l} type="button" className={language===l?'active':''} onClick={()=>setLanguage(l)}>{l==='hu'?'Magyar':'English'}</button>)}</div>;
 const filtered=factions.filter(f=>(f.slug+' '+f.name_hu+' '+f.name_en).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 return <EditorFrame>
  <EditorNavigation locale={locale} active="factions" onBack={()=>navigate(onBack)} onSelect={s=>navigate(()=>onSectionSelect(s))}/>
  <EditorRoster className="fe-roster"><div className="ed-roster-top"><strong>{tr('Frakciók','Factions')} ({factions.length})</strong><button type="button" disabled={busy||loading} aria-label={tr('Új frakció','New faction')} onClick={()=>navigate(()=>{choose(blank());setTab('general');})}><LucidePlus/></button></div>
   <input aria-label={tr('Frakció keresése','Search factions')} placeholder={tr('Frakció keresése…','Search factions…')} value={search} onChange={e=>setSearch(e.target.value)}/>
   <div className="fe-records">{filtered.map(f=><button type="button" key={f.id} disabled={busy||loading} className={'ed-record '+(draft.id===f.id?'selected':'')} onClick={()=>navigate(()=>choose(f))}><span className="ed-thumbnail"><WorldArtwork path={f.image_path} fallback="◈"/></span><span className="ed-record-name"><strong>{name(f)}</strong><small>{f.slug}</small></span><span className={f.is_published?'ed-pub':'ed-draft'}>{f.is_published?'●':'○'}</span></button>)}{!filtered.length&&!loading&&<p>{tr('Még nincs frakció. Hozz létre egyet.','No factions yet. Create one.')}</p>}</div>
  </EditorRoster>
  <section className="ed-editor"><EditorHeader><strong>{name(draft)||tr('ÚJ FRAKCIÓ','NEW FACTION')}</strong><span>{loading?tr('Betöltés…','Loading…'):draft.is_published?tr('Publikált','Published'):tr('Piszkozat','Draft')}</span></EditorHeader>
   <EditorTabs label={tr('Frakciószerkesztő fülek','Faction editor tabs')} selected={tab} onSelect={setTab} items={[{id:'general',name:tr('Alapadatok','General')},{id:'reputation',name:tr('Reputáció és jutalmak','Reputation & rewards')},{id:'presence',name:tr('Quadránsok','Quadrants')},{id:'companies',name:tr('Cégek','Companies')}]}/>
   {error&&<div className="fe-error" role="alert">{error}<button type="button" disabled={busy||loading} onClick={()=>navigate(()=>void load(draft.id||undefined).catch(e=>setError(e.message)))}>{tr('Újratöltés','Reload')}</button></div>}
   <form id="faction-editor-form" className="ed-form fe-form" onSubmit={save}><fieldset disabled={busy||loading}>
    {tab==='general'&&<><div className="fe-grid"><label>{tr('Azonosító','Slug')}<input value={draft.slug} maxLength={80} onChange={e=>patch({slug:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')})}/></label><label>{tr('Frakciószín','Faction color')}<input type="color" value={draft.color} onChange={e=>patch({color:e.target.value})}/></label></div>{langButtons}
     <label>{tr('Frakció neve','Faction name')} ({language.toUpperCase()})<input maxLength={100} value={draft[`name_${language}`]} onChange={e=>patch({[`name_${language}`]:e.target.value})}/></label>
     <label>{tr('Leírás','Description')} ({language.toUpperCase()})<textarea maxLength={4000} rows={4} value={draft[`description_${language}`]} onChange={e=>patch({[`description_${language}`]:e.target.value})}/></label>
     <WorldImageField locale={locale} value={draft.image_path} onChange={image_path=>patch({image_path})} placeholder="hatarvilag/factions/… .webp"/>
     <label className="fe-check"><input type="checkbox" checked={draft.is_published} onChange={e=>patch({is_published:e.target.checked})}/>{tr('Publikált frakció','Published faction')}</label><p className="fe-help">{tr('A magyar és angol név kötelező. A publikálás a frakció definícióját jelöli késznek.','Hungarian and English names are required. Publishing marks the faction definition as ready.')}</p></>}
    {tab==='reputation'&&<><div className="fe-grid"><label>{tr('Minimum reputáció','Minimum reputation')}<input type="number" min={-1000000} max={999999} value={draft.reputation_min} onChange={e=>patch({reputation_min:Number(e.target.value)})}/></label><label>{tr('Maximum reputáció','Maximum reputation')}<input type="number" min={-999999} max={1000000} value={draft.reputation_max} onChange={e=>patch({reputation_max:Number(e.target.value)})}/></label></div>
     <div className="fe-reputation" aria-label={tr('Reputációs sáv előnézete','Reputation track preview')}><div className="fe-track" style={{background:draft.color}}/>{sortedTiers.map(t=><div className="fe-marker" key={t.id} style={{left:`${Math.min(100,Math.max(0,(t.threshold-draft.reputation_min)/Math.max(1,draft.reputation_max-draft.reputation_min)*100))}%`}} title={name(t)+' · '+t.threshold}><span>◆</span><small>{t.threshold}</small></div>)}</div>
     <p className="fe-help">{tr('Mérföldkövenként egyszer megszerezhető jutalmak definíciója. A reputáció szerzését és a játékos általi beváltást külön kapcsoljuk majd a játékmenethez.','Defines rewards earned once per milestone. Reputation earning and player claiming will be connected to gameplay separately.')}</p>
     <button type="button" disabled={draft.tiers.length>=100} onClick={addTier}><LucidePlus/>{tr('Mérföldkő hozzáadása','Add milestone')}</button>{langButtons}
     {draft.tiers.map(t=><section className="fe-card" key={t.id} aria-label={tr('Reputációs mérföldkő','Reputation milestone')}><header><strong>{name(t)||tr('Új rang','New rank')}</strong><button type="button" aria-label={tr('Mérföldkő törlése','Remove milestone')} onClick={()=>patch({tiers:draft.tiers.filter(x=>x.id!==t.id)})}>×</button></header><div className="fe-grid"><label>{tr('Pontküszöb','Threshold')}<input type="number" value={t.threshold} min={draft.reputation_min} max={draft.reputation_max} onChange={e=>patchTier(t.id,{threshold:Number(e.target.value)})}/></label><label>{tr('Rang neve','Rank name')} ({language.toUpperCase()})<input maxLength={100} value={t[`name_${language}`]} onChange={e=>patchTier(t.id,{[`name_${language}`]:e.target.value})}/></label></div>
      <label>{tr('Credit jutalom','Credit reward')}<input type="number" min={0} max={1000000000} value={t.credits} onChange={e=>patchTier(t.id,{credits:Number(e.target.value)})}/></label>
      {t.items.map((reward,index)=><div className="fe-reward" key={index}><label>{tr('Jutalomtárgy','Reward item')}<select aria-label={tr('Jutalomtárgy','Reward item')} value={reward.item_id} onChange={e=>patchTier(t.id,{items:t.items.map((r,i)=>i===index?{...r,item_id:e.target.value}:r)})}>{items.filter(i=>i.id===reward.item_id||!t.items.some(r=>r.item_id===i.id)).map(i=><option key={i.id} value={i.id}>{itemName(i)}{i.is_published?'':tr(' (piszkozat)',' (draft)')}</option>)}</select></label><label>{tr('Mennyiség','Quantity')}<input type="number" min={1} max={10000} value={reward.quantity} onChange={e=>patchTier(t.id,{items:t.items.map((r,i)=>i===index?{...r,quantity:Number(e.target.value)}:r)})}/></label><button type="button" aria-label={tr('Jutalomtárgy törlése','Remove reward item')} onClick={()=>patchTier(t.id,{items:t.items.filter((_,i)=>i!==index)})}>×</button></div>)}
      <button type="button" disabled={t.items.length>=100||!items.some(i=>!t.items.some(r=>r.item_id===i.id))} onClick={()=>{const item=items.find(i=>!t.items.some(r=>r.item_id===i.id));if(item)patchTier(t.id,{items:[...t.items,{item_id:item.id,quantity:1}]});}}><LucidePlus/>{tr('Tárgy hozzáadása','Add item')}</button>
     </section>)}{!draft.tiers.length&&<p className="fe-help">{tr('Adj hozzá pontküszöböket, rangokat és jutalmakat.','Add thresholds, ranks and rewards.')}</p>}</>}
    {tab==='presence'&&<><label>{tr('Home quadráns','Home quadrant')}<select aria-label={tr('Home quadráns','Home quadrant')} value={draft.home_quadrant_id||''} onChange={e=>patch({home_quadrant_id:e.target.value||null})}><option value="">{tr('Nincs kiválasztva','Not selected')}</option>{quadrants.map(q=><option key={q.id} value={q.id}>{name(q.game_galaxies)} / {name(q)}</option>)}</select></label>
     <p className="fe-help">{tr('A home quadráns és a jelenlét külön állítható. A még nem beállított quadránsokban nincs jelenlét.','Home quadrant and presence are independent. Unconfigured quadrants have no presence.')}</p>{langButtons}
     {quadrants.map(q=>{const p=draft.presence.find(p=>p.quadrant_id===q.id)||{quadrant_id:q.id,strength:'none',notes_hu:'',notes_en:''};const update=(values:Partial<Presence>)=>patch({presence:[...draft.presence.filter(p=>p.quadrant_id!==q.id),{...p,...values}]});return <section className="fe-card" key={q.id}><header><strong>{name(q)}{q.id===draft.home_quadrant_id?' ⌂':''}</strong><small>{name(q.game_galaxies)}</small></header><label>{tr('Jelenlét','Presence')} — {name(q)}<select aria-label={tr('Jelenlét','Presence')+' — '+name(q)} value={p.strength} onChange={e=>update({strength:e.target.value})}>{strengths.map(([value,hu,eng])=><option key={value} value={value}>{tr(hu,eng)}</option>)}</select></label><label>{tr('Jelenlét leírása','Presence notes')} ({language.toUpperCase()})<textarea rows={2} maxLength={2000} value={p[`notes_${language}`]} onChange={e=>update({[`notes_${language}`]:e.target.value})}/></label></section>;})}
     {!quadrants.length&&<p>{tr('Előbb hozz létre quadránsokat a Galaxis editorban.','Create quadrants in the Galaxy editor first.')}</p>}</>}
    {tab==='companies'&&<><p className="fe-help">{tr('A frakció által kézben tartott nagyobb cégek. Egyenként felvehetők és eltávolíthatók.','Major companies controlled by the faction. Add or remove them individually.')}</p><button type="button" disabled={draft.companies.length>=100} onClick={()=>patch({companies:[...draft.companies,{...texts(),id:crypto.randomUUID(),activity_hu:'',activity_en:'',sort_order:draft.companies.length}]})}><LucidePlus/>{tr('Cég hozzáadása','Add company')}</button>{langButtons}
     {draft.companies.map(c=><section className="fe-card" key={c.id} aria-label={tr('Frakciócég','Faction company')}><header><strong>{name(c)||tr('Új cég','New company')}</strong><button type="button" aria-label={tr('Cég törlése','Remove company')} onClick={()=>patch({companies:draft.companies.filter(x=>x.id!==c.id)})}>×</button></header><label>{tr('Cég neve','Company name')} ({language.toUpperCase()})<input maxLength={100} value={c[`name_${language}`]} onChange={e=>patchCompany(c.id,{[`name_${language}`]:e.target.value})}/></label><label>{tr('Tevékenység / iparág','Activity / industry')} ({language.toUpperCase()})<input maxLength={200} value={c[`activity_${language}`]} onChange={e=>patchCompany(c.id,{[`activity_${language}`]:e.target.value})}/></label><label>{tr('Cég leírása','Company description')} ({language.toUpperCase()})<textarea maxLength={2000} rows={3} value={c[`description_${language}`]} onChange={e=>patchCompany(c.id,{[`description_${language}`]:e.target.value})}/></label></section>)}</>}
   </fieldset></form>
   <EditorFooter><span className={dirty?'ed-unsaved':'ed-fine'}>{dirty?tr('● Nem mentett módosítások','● Unsaved changes'):tr('Nincs mentetlen módosítás','No unsaved changes')}</span><button type="submit" form="faction-editor-form" disabled={busy||loading||!dirty} className="ed-submit">{busy?'…':tr('MENTÉS','SAVE')}</button></EditorFooter>
  </section>
  {discard&&<div className="ed-modal-mask"><div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="faction-discard-title"><h3 id="faction-discard-title">{tr('Nem mentett módosítások','Unsaved changes')}</h3><p>{tr('Elveted a frakció módosításait?','Discard faction changes?')}</p><div><button autoFocus type="button" onClick={()=>{setDiscard(false);pending.current=null;}}>{tr('Folytatom a szerkesztést','Keep editing')}</button><button type="button" className="ed-danger" onClick={()=>{setDiscard(false);pending.current?.();pending.current=null;}}>{tr('Elvetés','Discard')}</button></div></div></div>}
 </EditorFrame>;
}
