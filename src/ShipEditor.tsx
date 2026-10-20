import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorTabs} from './components/EditorTemplate';
import {ShipArt} from './components/GameArt';
import {LucidePlus,LucideMinus} from './components/LucideSigns';
import {ShipSystemIcon} from './components/ShipSystemIcon';
import {crewPositionName} from './Cantina';
import './ship-editor.css';

type ModuleKind='engine'|'reactor'|'shield'|'weapon'|'hull'|'sensor'|'utility';
type Role='pilot'|'navigator'|'engineer'|'security'|'medic';
type Slot={slot_key:string;kind:'module'|'crew';module_kind:ModuleKind|null;crew_role:Role|null;size:number;min_aptitude:number;required:boolean;sort_order:number;name_hu:string;name_en:string};
type Translation={locale:string;name:string;description:string};
type Ship={id:string;slug:string;image_path:string|null;hull:number;cargo:number;speed:number;is_published:boolean;revision:number;translations:Translation[];slots:Slot[]};
type Starter={module_kind:ModuleKind;size:number;power_draw:number;power_output:number};
type Catalog={ships:Ship[];starters:Starter[]};
type Tab='general'|'modules'|'crew'|'dictionary';
const kinds:ModuleKind[]=['engine','reactor','shield','weapon','hull','sensor','utility'];
const roles:Role[]=['pilot','navigator','engineer','security','medic'];
const kindLabels:Record<ModuleKind,[string,string]>={engine:['Hajtómű','Engine'],reactor:['Reaktor','Reactor'],shield:['Pajzs','Shield'],weapon:['Fegyverzet','Weapon'],hull:['Burkolat','Hull'],sensor:['Szenzor','Sensor'],utility:['Segédrendszer','Utility']};
const blank=():Ship=>({id:'',slug:'',image_path:null,hull:100,cargo:60,speed:5,is_published:false,revision:0,translations:[{locale:'hu',name:'',description:''},{locale:'en',name:'',description:''}],slots:[
 ...(['engine','reactor','hull'] as ModuleKind[]).map((k,i)=>({slot_key:k+'_1',kind:'module' as const,module_kind:k,crew_role:null,size:1,min_aptitude:1,required:true,sort_order:i,name_hu:kindLabels[k][0],name_en:kindLabels[k][1]})),
 {slot_key:'crew_pilot',kind:'crew',module_kind:null,crew_role:'pilot',size:1,min_aptitude:2,required:true,sort_order:3,name_hu:'Pilóta',name_en:'Pilot'}]});
const PAGE=5;
export default function ShipEditor({locale,onBack}:{locale:string;onBack:()=>void}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [catalog,setCatalog]=useState<Catalog>({ships:[],starters:[]}),[draft,setDraft]=useState<Ship>(blank);
 const [languages,setLanguages]=useState<{code:string;native_name:string}[]>([]),[language,setLanguage]=useState('hu');
 const [tab,setTab]=useState<Tab>('general'),[search,setSearch]=useState(''),[page,setPage]=useState(0),[slotPage,setSlotPage]=useState(0),[selected,setSelected]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false);
 const guard=useRef(false),generation=useRef(0),pending=useRef<(()=>void)|null>(null);
 const choose=useCallback((ship:Ship)=>{setDraft(structuredClone(ship));setDirty(false);setSelected('');setSlotPage(0);setError('');},[]);
 const load=useCallback(async(id?:string)=>{
  const ticket=++generation.current;setLoading(true);
  try{
   const [r,l]=await Promise.all([supabase.rpc('get_ship_editor_catalog'),supabase.from('game_locales').select('code,native_name').eq('is_enabled',true).order('sort_order')]);
   if(ticket!==generation.current)return;
   if(r.error||l.error)throw new Error((r.error||l.error)!.message);
   const data=r.data as Catalog;setCatalog(data);setLanguages(l.data||[]);
   const ship=data.ships.find(s=>s.id===id)||data.ships[0];if(ship)choose(ship);else choose(blank());
  }catch(e){if(ticket===generation.current)setError(e instanceof Error?e.message:'Loading failed');}
  finally{if(ticket===generation.current)setLoading(false);}
 },[choose]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 function navigate(action:()=>void){if(busy)return;if(dirty){pending.current=action;setDiscard(true);}else action();}
 function patch(values:Partial<Ship>){setDraft(d=>({...d,...values}));setDirty(true);}
 const name=(s:Ship)=>s.translations.find(t=>t.locale===locale)?.name||s.translations.find(t=>t.locale==='hu')?.name||s.slug;
 const label=(s:Slot)=>en?s.name_en:s.name_hu;
 const filtered=catalog.ships.filter(s=>(s.slug+' '+s.translations.map(t=>t.name).join(' ')).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE)),safePage=Math.min(page,pages-1);
 const slotKind=tab==='crew'?'crew':'module',slots=draft.slots.filter(s=>s.kind===slotKind),slotPages=Math.max(1,Math.ceil(slots.length/4)),safeSlotPage=Math.min(slotPage,slotPages-1);
 const current=slots.find(s=>s.slot_key===selected)||slots[safeSlotPage*4];
 const content=draft.translations.find(t=>t.locale===language)||{locale:language,name:'',description:''};
 const starterModules=draft.slots.flatMap(s=>s.kind==='module'?catalog.starters.filter(m=>m.module_kind===s.module_kind&&m.size<=s.size):[]);
 const draw=starterModules.reduce((n,m)=>n+m.power_draw,0),output=starterModules.reduce((n,m)=>n+m.power_output,0);
 function editSlot(values:Partial<Slot>){if(current)patch({slots:draft.slots.map(s=>s.slot_key===current.slot_key?{...s,...values}:s)});}
 function addSlot(){
  const role=roles.find(r=>!draft.slots.some(s=>s.crew_role===r));if(slotKind==='crew'&&!role)return;
  if(slotKind==='module'&&slots.length>=32)return;
  let n=1;while(draft.slots.some(s=>s.slot_key===`module_${n}`))n++;
  const slot:Slot={slot_key:slotKind==='module'?`module_${n}`:`crew_${role}`,kind:slotKind,module_kind:slotKind==='module'?'utility':null,crew_role:slotKind==='crew'?role!:null,size:1,min_aptitude:2,required:false,sort_order:draft.slots.length,name_hu:slotKind==='module'?'Új modulhely':crewPositionName(role!,false),name_en:slotKind==='module'?'New module slot':crewPositionName(role!,true)};
  patch({slots:[...draft.slots,slot]});setSelected(slot.slot_key);setSlotPage(Math.floor(slots.length/4));
 }
 function moveSlot(delta:number){if(!current)return;const i=slots.indexOf(current),other=slots[i+delta];if(!other)return;
  const next=[...draft.slots],a=next.indexOf(current),b=next.indexOf(other);[next[a],next[b]]=[next[b],next[a]];patch({slots:next});setSlotPage(Math.floor((i+delta)/4));
 }
 function translation(values:Partial<Translation>){patch({translations:[...draft.translations.filter(t=>t.locale!==language),{...content,...values}]});}
 const errors:Record<string,string>={
  'Occupied slots cannot be removed or made incompatible':tr('Foglalt helyet nem lehet törölni vagy a felszerelésével / legénységével inkompatibilissé tenni.','Occupied slots cannot be removed or made incompatible with their equipment or crew.'),
  'Ship changed since loading; reload before saving':tr('A hajót közben más is módosította. Töltsd újra a szerverváltozatot.','The ship was changed by another editor. Reload the server version.'),
  'Published ships require starter-compatible engine, reactor, hull and pilot stations':tr('Publikáláshoz kötelező hajtómű, reaktor, burkolat és pilóta kell. A kötelező modulhelyhez legyen megfelelő méretű alapmodul.','Publishing requires an engine, reactor, hull and pilot. Required module slots must support starter modules.'),
  'Starter configuration exceeds reactor power':tr('A kezdő felszerelés fogyasztása meghaladja a reaktor teljesítményét.','Starter equipment exceeds reactor output.')
 };
 async function save(e:FormEvent){e.preventDefault();if(guard.current||loading)return;
  if(!draft.translations.find(t=>t.locale==='hu')?.name.trim()||!draft.translations.find(t=>t.locale==='en')?.name.trim()){setTab('dictionary');setError(tr('A magyar és angol név kötelező.','Hungarian and English names are required.'));return;}
  guard.current=true;setBusy(true);setError('');
  try{
   const r=await supabase.rpc('save_game_ship',{p_id:draft.id||null,p_ship:{slug:draft.slug,image_path:draft.image_path,hull:draft.hull,cargo:draft.cargo,speed:draft.speed,is_published:draft.is_published},p_translations:draft.translations.filter(t=>t.name.trim()),p_slots:draft.slots.map((s,i)=>({...s,sort_order:i})),p_expected_revision:draft.id?draft.revision:null});
   if(r.error)throw new Error(errors[r.error.message]||r.error.message);
   await load((r.data as {id:string}).id);notify(tr('Hajó, fordítások és slotok mentve.','Ship, translations and slots saved.'),'success');
  }catch(e){setError(e instanceof Error?e.message:tr('Mentési hiba.','Save failed.'));}
  finally{guard.current=false;setBusy(false);}
 }
 const tabs=[{id:'general',name:tr('Alapadatok','General')},{id:'modules',name:tr('Modulhelyek','Module slots')},{id:'crew',name:tr('Legénység','Crew')},{id:'dictionary',name:tr('Szótár','Dictionary')}];
 return <EditorFrame>
  <nav className="ed-nav"><h2>{tr('Hajószerkesztő','Ship Editor')}</h2><button type="button" disabled={busy} onClick={()=>navigate(onBack)}>⌂　{tr('Vissza','Back')}</button>{tabs.map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>{setTab(t.id as Tab);setSelected('');setSlotPage(0);}}>{t.name}</button>)}<div className="ed-nav-bottom">{tr('HAJÓK ÉS RENDSZEREK','SHIPS AND SYSTEMS')}</div></nav>
  <aside className="ed-roster se-roster"><div className="ed-roster-top"><strong>{tr('Hajók','Ships')} ({catalog.ships.length})</strong><button type="button" disabled={busy||loading} aria-label={tr('Új hajó','New ship')} title={tr('Új hajó','New ship')} onClick={()=>navigate(()=>{choose(blank());setTab('general');})}><LucidePlus/></button></div>
   <input className="se-search" aria-label={tr('Hajó keresése','Search ships')} placeholder={tr('Hajó keresése…','Search ships…')} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>
   <div className="se-ship-list">{filtered.slice(safePage*PAGE,safePage*PAGE+PAGE).map(s=><button type="button" disabled={busy} key={s.id} className={'ed-record '+(draft.id===s.id?'selected':'')} onClick={()=>navigate(()=>choose(s))}><span className="ed-thumbnail"><ShipArt slug={s.slug} path={s.image_path}/></span><span className="ed-record-name"><strong>{name(s)}</strong><small>{s.slots.filter(x=>x.kind==='module').length} / {s.slots.filter(x=>x.kind==='crew').length} · {s.slug}</small></span><span className={s.is_published?'ed-pub':'ed-draft'} aria-label={s.is_published?tr('Publikált','Published'):tr('Piszkozat','Draft')}>{s.is_published?'●':'○'}</span></button>)}{!filtered.length&&!loading&&<p>{tr('Nincs találat.','No matches.')}</p>}{loading&&<p role="status">{tr('Betöltés…','Loading…')}</p>}</div>
   <div className="se-pagination"><button type="button" disabled={safePage===0} onClick={()=>setPage(safePage-1)} aria-label={tr('Előző hajók','Previous ships')}>‹</button><span>{safePage+1} / {pages}</span><button type="button" disabled={safePage===pages-1} onClick={()=>setPage(safePage+1)} aria-label={tr('További hajók','More ships')}>›</button></div>
   <button className="se-clone" type="button" disabled={busy||loading||!draft.id} onClick={()=>navigate(()=>{choose({...structuredClone(draft),id:'',slug:draft.slug+'_copy',revision:0,is_published:false});setDirty(true);setTab('general');})}>{tr('Másolat új hajóként','Duplicate as new ship')}</button>
  </aside>
  <section className="ed-editor"><header className="ed-editor-head"><strong>{draft.id?name(draft):tr('ÚJ HAJÓ','NEW SHIP')}</strong><span>{draft.is_published?tr('Publikált','Published'):tr('Piszkozat','Draft')}</span></header>
   <EditorTabs label={tr('Hajószerkesztő fülek','Ship editor tabs')} items={tabs} selected={tab} onSelect={v=>{setTab(v as Tab);setSelected('');setSlotPage(0);}}/>
   {error&&<div className="se-error" role="alert">{error}<button type="button" disabled={busy} onClick={()=>navigate(()=>void load(draft.id))}>{tr('Újratöltés','Reload')}</button></div>}
   <form className="ed-form se-form" id="ship-editor-form" onSubmit={save}>
    <fieldset disabled={busy||loading} className="se-fieldset">
    {tab==='general'&&<div className="se-general"><div className="se-preview"><ShipArt slug={draft.slug} path={draft.image_path}/></div><div className="se-general-fields">
     <label>{tr('Azonosító','Slug')}<input required pattern="[a-z][a-z0-9_]{1,79}" maxLength={80} value={draft.slug} onChange={e=>patch({slug:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')})}/></label>
     <div className="se-numbers">{(['hull','cargo','speed'] as const).map(k=><label key={k}>{{hull:tr('Burkolat','Hull'),cargo:tr('Raktér','Cargo'),speed:tr('Sebesség','Speed')}[k]}<input type="number" min={k==='cargo'?0:1} max={k==='speed'?1000:100000} value={draft[k]} onChange={e=>patch({[k]:Number(e.target.value)})}/></label>)}</div>
     <label>{tr('Kép R2 útvonala','Artwork R2 path')}<input placeholder="hatarvilag/ships/… .webp" maxLength={300} value={draft.image_path||''} onChange={e=>patch({image_path:e.target.value||null})}/></label>
     <label className="se-check"><input type="checkbox" checked={draft.is_published} onChange={e=>patch({is_published:e.target.checked})}/>{tr('Publikált, választható kezdőhajó','Published, available as starter ship')}</label>
     <p className="se-help">{tr('Az alapadatok és a slotok módosítása a meglévő hajókra is érvényes. Az újonnan hozzáadott helyek náluk üresen maradnak.','Changes to stats and slots also affect existing ships. Newly added slots remain empty on those ships.')}</p>
    </div></div>}
    {(tab==='modules'||tab==='crew')&&<div className="se-slot-pane"><header><strong>{slots.length} {tab==='modules'?tr('modulhely','module slots'):tr('állás','stations')}</strong><button type="button" disabled={tab==='crew'?slots.length>=5:slots.length>=32} onClick={addSlot}><LucidePlus/>{tr('Hozzáadás','Add')}</button></header>
     <div className="se-slot-workspace"><div className="se-slot-list">{slots.slice(safeSlotPage*4,safeSlotPage*4+4).map(s=><button type="button" key={s.slot_key} aria-pressed={current?.slot_key===s.slot_key} className={current?.slot_key===s.slot_key?'selected':''} onClick={()=>setSelected(s.slot_key)}><ShipSystemIcon kind={s.module_kind||'crew'}/><span><strong>{label(s)}</strong><small>{s.kind==='module'?['S','M','L'][s.size-1]:'◆'+s.min_aptitude} · {s.required?tr('Kötelező','Required'):tr('Opcionális','Optional')}</small></span></button>)}
      <div className="se-pagination"><button type="button" disabled={safeSlotPage===0} onClick={()=>{setSlotPage(safeSlotPage-1);setSelected('');}} aria-label={tr('Előző helyek','Previous slots')}>‹</button><span>{safeSlotPage+1}/{slotPages}</span><button type="button" disabled={safeSlotPage===slotPages-1} onClick={()=>{setSlotPage(safeSlotPage+1);setSelected('');}} aria-label={tr('További helyek','More slots')}>›</button></div>
     </div><div className="se-slot-fields">{current?<>
      <label>{tr('Magyar név','Hungarian name')}<input required maxLength={60} value={current.name_hu} onChange={e=>editSlot({name_hu:e.target.value})}/></label><label>{tr('Angol név','English name')}<input required maxLength={60} value={current.name_en} onChange={e=>editSlot({name_en:e.target.value})}/></label>
      {current.kind==='module'?<><label>{tr('Rendszer típusa','System type')}<select value={current.module_kind!} onChange={e=>editSlot({module_kind:e.target.value as ModuleKind})}>{kinds.map(k=><option key={k} value={k}>{kindLabels[k][en?1:0]}</option>)}</select></label><label>{tr('Legnagyobb modul','Maximum module size')}<select value={current.size} onChange={e=>editSlot({size:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n} value={n}>{['S','M','L'][n-1]}</option>)}</select></label></>:<><label>{tr('Szakterület','Specialty')}<select value={current.crew_role!} onChange={e=>editSlot({crew_role:e.target.value as Role})}>{roles.filter(r=>r===current.crew_role||!draft.slots.some(s=>s.crew_role===r)).map(r=><option key={r} value={r}>{crewPositionName(r,en)}</option>)}</select></label><label>{tr('Minimum jártasság','Minimum aptitude')}<input type="number" min={1} max={5} value={current.min_aptitude} onChange={e=>editSlot({min_aptitude:Number(e.target.value)})}/></label></>}
      <label className="se-check se-span"><input type="checkbox" checked={current.required} onChange={e=>editSlot({required:e.target.checked})}/>{tr('Az induláshoz kötelező','Required for departure')}</label>
      <div className="se-slot-actions se-span"><button type="button" disabled={slots.indexOf(current)===0} onClick={()=>moveSlot(-1)} aria-label={tr('Előrébb','Move earlier')}>↑</button><button type="button" disabled={slots.indexOf(current)===slots.length-1} onClick={()=>moveSlot(1)} aria-label={tr('Hátrébb','Move later')}>↓</button><button type="button" onClick={()=>{patch({slots:draft.slots.filter(s=>s.slot_key!==current.slot_key)});setSelected('');}}><LucideMinus/>{tr('Hely törlése','Remove slot')}</button></div>
     </>:<p className="se-help">{tr('Adj hozzá egy új helyet.','Add a new slot.')}</p>}</div></div>
     <p className="se-help">{tab==='modules'?tr(`Kezdő felszerelés energiaigénye: ${draw} / ${output}. Kötelező: hajtómű, reaktor, burkolat és pilóta.`,`Starter power: ${draw} / ${output}. Engine, reactor, hull and pilot are required.`):tr('Szakterületenként egy állás. Az új kapitány kötelező személyzete megkapja az induláshoz szükséges jártasságot.','One station per specialty. A new captain receives required crew with the necessary aptitude.')}</p>
    </div>}
    {tab==='dictionary'&&<div className="se-dictionary"><div className="ed-language-list">{languages.map(l=><button type="button" key={l.code} className={language===l.code?'active':''} onClick={()=>setLanguage(l.code)}>{l.native_name}{['hu','en'].includes(l.code)?' *':''}</button>)}</div><label>{tr('Hajó neve','Ship name')}<input maxLength={100} value={content.name} onChange={e=>translation({name:e.target.value})}/></label><label className="se-description">{tr('Leírás','Description')}<textarea maxLength={4000} value={content.description} onChange={e=>translation({description:e.target.value})}/></label><p className="se-help">{tr('A magyar és angol név kötelező.','Hungarian and English names are required.')}</p></div>}
    </fieldset>
   </form><footer className="ed-footer"><span className={dirty?'ed-unsaved':'ed-fine'}>{dirty?tr('● Nem mentett módosítások','● Unsaved changes'):tr('Minden módosítás mentve','All changes saved')}</span><button type="submit" form="ship-editor-form" disabled={busy||loading||!dirty} className="ed-submit">{busy?'…':tr('MENTÉS','SAVE')}</button></footer>
  </section>
  {discard&&<div className="ed-modal-mask"><div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="ship-discard-title"><h3 id="ship-discard-title">{tr('Nem mentett módosítások','Unsaved changes')}</h3><p>{tr('Elveted a hajó módosításait?','Discard changes to this ship?')}</p><div><button autoFocus type="button" onClick={()=>{setDiscard(false);pending.current=null;}}>{tr('Folytatom a szerkesztést','Keep editing')}</button><button type="button" className="ed-danger" onClick={()=>{setDiscard(false);setDirty(false);pending.current?.();pending.current=null;}}>{tr('Elvetés','Discard')}</button></div></div></div>}
 </EditorFrame>;
}
