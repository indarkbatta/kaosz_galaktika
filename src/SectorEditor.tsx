import {useEffect,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorTabs,EditorRoster,EditorHeader,EditorFooter} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import './sector-editor.css';
import {snapWorldCoordinate} from './lib/worldMapGeometry';
import WorldMapEditor,{type WorldMapRoute} from './WorldMapEditor';
import {WorldArtwork,WorldImageField} from './components/WorldImageField';
import {validWorldImage} from './lib/worldImages';
type Translation={locale:string;name:string;description:string};
type Place={id:string;slug:string;kind:'station'|'wreck'|'planet'|'anomaly';sector_id:string;x:number;y:number;image_path:string|null;is_published:boolean;game_locations_i18n:Translation[]};
type Route=WorldMapRoute&{id:string};
type Action={id:string;slug:string;game_actions_i18n:{locale:string;name:string}[]};
type Local={code:string;native_name:string};
type Link={enabled:boolean;cost:number};
const blank:Place={id:'',slug:'',kind:'station',sector_id:'',x:50,y:50,image_path:null,is_published:false,game_locations_i18n:[]};
export default function SectorEditor({locale,onBack,onSectionSelect}:{locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void}){
 const en=locale==='en',tr=(hu:string,english:string)=>en?english:hu;
 const [places,setPlaces]=useState<Place[]>([]),[routes,setRoutes]=useState<Route[]>([]),[actions,setActions]=useState<Action[]>([]);
 const [placements,setPlacements]=useState<{location_id:string;action_id:string}[]>([]);
 const [languages,setLanguages]=useState<Local[]>([]);
 const [sectors,setSectors]=useState<{id:string;slug:string;name_hu:string;name_en:string;quadrant_id:string}[]>([]);
 const [selectedSector,setSelectedSector]=useState('');
 const [mapOpen,setMapOpen]=useState(false);
 const [draft,setDraft]=useState<Place>(blank),[translations,setTranslations]=useState<Record<string,{name:string;description:string}>>({});
 const [checked,setChecked]=useState<string[]>([]),[links,setLinks]=useState<Record<string,Link>>({});
 const [linksDirty,setLinksDirty]=useState(false);
 const [tab,setTab]=useState('general'),[language,setLanguage]=useState('hu');
 const [busy,setBusy]=useState(false);
 const label=(x:Place)=>x.game_locations_i18n.find(n=>n.locale===locale)?.name||x.game_locations_i18n.find(n=>n.locale==='hu')?.name||x.slug;
 const activeName=(a:Action)=>a.game_actions_i18n.find(n=>n.locale===locale)?.name||a.game_actions_i18n.find(n=>n.locale==='hu')?.name||a.slug;
 function choose(p:Place,allRoutes:Route[],allPlacements:{location_id:string;action_id:string}[]){
  setDraft({...p,x:snapWorldCoordinate(p.x),y:snapWorldCoordinate(p.y)});
  if(p.sector_id)setSelectedSector(p.sector_id);
  setTranslations(Object.fromEntries(p.game_locations_i18n.map(x=>[x.locale,{name:x.name,description:x.description}])));
  setChecked(allPlacements.filter(x=>x.location_id===p.id).map(x=>x.action_id));
  setLinksDirty(false);
  setLinks(Object.fromEntries(allRoutes.filter(x=>x.origin_id===p.id||x.destination_id===p.id)
   .map(x=>[x.origin_id===p.id?x.destination_id:x.origin_id,{enabled:true,cost:x.energy_cost}])));
  
 }
 async function load(keep?:string,verify?:{sectorId:string;routes:WorldMapRoute[]}){
  const [p,r,a,placements,langs,system]=await Promise.all([
   supabase.from('game_locations').select('id,slug,kind,sector_id,x,y,image_path,is_published,game_locations_i18n(locale,name,description)').order('slug'),
   supabase.from('game_routes').select('id,origin_id,destination_id,energy_cost,is_published'),
   supabase.from('game_actions').select('id,slug,game_actions_i18n(locale,name)').order('sort_order'),
   supabase.from('game_location_actions').select('location_id,action_id'),
   supabase.from('game_locales').select('code,native_name').eq('is_enabled',true).order('sort_order'),
   supabase.from('game_sectors').select('id,slug,name_hu,name_en,quadrant_id').order('slug')
  ]);
  const err=p.error||r.error||a.error||placements.error||langs.error||system.error;
  if(err){notify(err.message,'error');if(verify)throw new Error(err.message);return;}
  const rows=p.data as unknown as Place[],rts=(r.data||[]) as Route[],ps=placements.data||[];
  if(verify){
   const ids=new Set(rows.filter(row=>row.sector_id===verify.sectorId).map(row=>row.id));
   const persisted=rts.filter(route=>ids.has(route.origin_id)&&ids.has(route.destination_id));
   const signature=(route:WorldMapRoute)=>
    [route.origin_id<route.destination_id?route.origin_id+':'+route.destination_id:route.destination_id+':'+route.origin_id,
     route.energy_cost,route.is_published!==false?1:0].join('|');
   const expected=verify.routes.map(signature).sort();
   const actual=persisted.map(signature).sort();
   if(JSON.stringify(expected)!==JSON.stringify(actual)){
    throw new Error(tr('A mentett összeköttetések visszaellenőrzése nem sikerült. A térképet újra be kell tölteni.',
      'Saved links did not match the database. Reload the map before further changes.'));
   }
  }
  setPlaces(rows);setRoutes(rts);setActions((a.data||[]) as Action[]);
  setPlacements(ps);setLanguages(langs.data as Local[]);
  setSectors(system.data||[]);
  if(!selectedSector)setSelectedSector(system.data?.[0]?.id||'');
  const chosen=rows.find(x=>x.id===(keep||draft.id))||rows[0];
  if(chosen)choose(chosen,rts,ps);
  else{setDraft({...blank,sector_id:system.data?.[0]?.id||''});setLinks({});setLinksDirty(false);}
 }
 useEffect(()=>{void load();},[]);
 const update=<T extends keyof Place>(key:T,value:Place[T])=>setDraft(p=>({...p,[key]:value}));
 const loc={name:translations[language]?.name||'',description:translations[language]?.description||''};
 const patchLang=(key:'name'|'description',value:string)=>setTranslations(v=>({...v,[language]:{...loc,[key]:value}}));
 const newPlace=()=>{choose({...blank,sector_id:selectedSector||sectors[0]?.id||''},routes,placements);setTab('general');};
 async function save(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);
  try{
   if(!/^[a-z][a-z0-9_]*$/.test(draft.slug))throw Error(tr('Érvénytelen technikai azonosító.','Invalid slug.'));
   if(!translations.hu?.name?.trim()||!translations.en?.name?.trim())throw Error(tr('A magyar és angol név kötelező.','Hungarian and English names required.'));
   if(!draft.sector_id)throw Error(tr('Válassz naprendszer-szektort.','Choose a solar-system sector.'));
   if(!validWorldImage(draft.image_path))throw Error(tr('Érvénytelen R2 képútvonal.','Invalid R2 image path.'));
   if(draft.x<7||draft.x>93||draft.y<7||draft.y>93)throw Error(tr('A koordináták 7 és 93 között lehetnek; mentéskor rácspontra igazítjuk.','Coordinates must be between 7 and 93; saving will snap to the grid.'));
   const body={slug:draft.slug,kind:draft.kind,sector_id:draft.sector_id,x:snapWorldCoordinate(draft.x),y:snapWorldCoordinate(draft.y),image_path:draft.image_path||null,is_published:draft.id?draft.is_published:false};
   let id=draft.id;
   if(id){const update=await supabase.from('game_locations').update(body).eq('id',id);if(update.error)throw update.error;}
   else{const insert=await supabase.from('game_locations').insert(body).select('id').single();if(insert.error)throw insert.error;id=insert.data.id;}
   const rows=Object.entries(translations).filter(([,v])=>v.name.trim()).map(([code,v])=>({location_id:id,locale:code,name:v.name.trim(),description:v.description.trim()}));
   const textSave=await supabase.from('game_locations_i18n').upsert(rows,{onConflict:'location_id,locale'});if(textSave.error)throw textSave.error;
   const associations=Object.entries(links).filter(([target,link])=>link.enabled&&target!==id&&places.some(p=>p.id===target&&p.sector_id===draft.sector_id)).map(([target,link])=>({target,cost:link.cost}));
   // A general/dictionary/action save must NEVER replace routes taken from a stale form.
   const saved=await supabase.rpc('replace_sector_links',{p_location:id,p_actions:checked,p_routes:linksDirty?associations:null});if(saved.error)throw saved.error;
   if(!draft.id&&draft.is_published){const published=await supabase.from('game_locations').update({is_published:true}).eq('id',id);if(published.error)throw published.error;}
   await load(id);notify(tr('Helyszín sikeresen mentve.','Location saved.'),'success');
  }catch(e){notify(e instanceof Error?e.message:tr('Mentési hiba.','Save failed.'),'error');}finally{setBusy(false);}
 }
 return <EditorFrame>
  <EditorNavigation locale={locale} active="sector" onBack={onBack} onSelect={onSectionSelect}/>
  <EditorRoster><div className="ed-roster-top"><strong>{tr('Helyszínek','Locations')} ({places.filter(p=>p.sector_id===selectedSector).length})</strong><button type="button" onClick={newPlace}>＋ {tr('Új','New')}</button></div>
   <select className="ed-roster-search" aria-label={tr('Naprendszer szűrése','Filter solar system')} value={selectedSector} onChange={e=>{setSelectedSector(e.target.value);const x=places.find(p=>p.sector_id===e.target.value);if(x)choose(x,routes,placements);else setDraft({...blank,sector_id:e.target.value});}}>
    {sectors.map(s=><option key={s.id} value={s.id}>{locale==='en'?s.name_en:s.name_hu}</option>)}
   </select>
   <div className="ed-roster-list">{places.filter(p=>p.sector_id===selectedSector).map(p=><button type="button" key={p.id} className={'ed-record '+(draft.id===p.id?'selected':'')} onClick={()=>choose(p,routes,placements)}>
    <span className="ed-thumbnail ge-sector-symbol"><WorldArtwork path={p.image_path} fallback={({station:'✦',wreck:'◇',planet:'●',anomaly:'◈'})[p.kind]} alt=""/></span>
    <span className="ed-record-name"><strong>{label(p)}</strong><small>{p.slug}</small></span>
   </button>)}</div>
  </EditorRoster>
  <section className="ed-editor">
   <EditorHeader><strong>{draft.id?label(places.find(x=>x.id===draft.id)||draft):tr('Új helyszín','New location')}</strong>
    <button type="button" className="sector-map-open" disabled={!selectedSector||busy||linksDirty} title={linksDirty?tr("Mentsd előbb az útvonalváltozásokat.","Save pending route edits first."):undefined} onClick={()=>setMapOpen(true)}>{tr('Csillagtérkép','Starmap')} ↗</button></EditorHeader>
   <EditorTabs label="Sector Editor" selected={tab} onSelect={setTab} items={[{id:'general',name:tr('Alapadatok','General')},{id:'dictionary',name:tr('Szótár','Dictionary')},{id:'routes',name:tr('Akciók / útvonalak','Actions / routes')}]}/>

   <form className="ed-form sector-editor-form" id="sector-editor-form" onSubmit={save}>
    {tab==='general'&&<><label>{tr('Technikai azonosító','Slug')}<input value={draft.slug} onChange={e=>update('slug',e.target.value.toLowerCase())}/></label>
     <label>{tr('Szektor / naprendszer','Sector / solar system')}<select required value={draft.sector_id} onChange={e=>{update('sector_id',e.target.value);setSelectedSector(e.target.value);setLinks({});}}>{sectors.map(s=><option key={s.id} value={s.id}>{locale==='en'?s.name_en:s.name_hu}</option>)}</select></label>
     <WorldImageField locale={locale} value={draft.image_path} onChange={image_path=>update('image_path',image_path)}/>
     <label>{tr('Helyszín típusa','Location type')}<select value={draft.kind} onChange={e=>update('kind',e.target.value as Place['kind'])}>{(['station','wreck','planet','anomaly'] as const).map(x=><option value={x} key={x}>{x}</option>)}</select></label>
     <div className="sector-coord-inputs"><label>X (10–90, 5)<input required type="number" min="10" max="90" step="5" value={draft.x} onChange={e=>update('x',Number(e.target.value))}/></label><label>Y (10–90, 5)<input required type="number" min="10" max="90" step="5" value={draft.y} onChange={e=>update('y',Number(e.target.value))}/></label></div>
     <label className="sector-check"><input type="checkbox" checked={draft.is_published} onChange={e=>update('is_published',e.target.checked)}/>{tr('Publikált','Published')}</label>
     <p>{tr('A koordináták a fix méretű navigációs térképen határozzák meg az elhelyezkedést.','Coordinates define placement on the fixed-size navigation chart.')}</p></>}
    {tab==='dictionary'&&<><div className="ed-language-list">{languages.map(l=><button type="button" key={l.code} className={language===l.code?'active':''} onClick={()=>setLanguage(l.code)}>{l.native_name}</button>)}</div>
     <label>{tr('Név','Name')} ({language.toUpperCase()})<input value={loc.name} onChange={e=>patchLang('name',e.target.value)}/></label>
     <label>{tr('Helyszín leírása','Location description')} ({language.toUpperCase()})<textarea rows={5} value={loc.description} onChange={e=>patchLang('description',e.target.value)}/></label></>}
    {tab==='routes'&&<><h3>{tr('Elérhető tevékenységek','Available activities')}</h3><div className="sector-action-list">{actions.map(a=><label className="sector-check" key={a.id}><input type="checkbox" checked={checked.includes(a.id)} onChange={e=>setChecked(old=>e.target.checked?[...old,a.id]:old.filter(x=>x!==a.id))}/>{activeName(a)}</label>)}</div>
     <h3>{tr('Közvetlen, kétirányú útvonalak','Direct two-way routes')}</h3><div className="sector-route-list">{places.filter(p=>p.id!==draft.id&&p.sector_id===draft.sector_id).map(p=>{const link=links[p.id]||{enabled:false,cost:10};return <div key={p.id}>
      <label className="sector-check"><input type="checkbox" checked={link.enabled} onChange={e=>{setLinksDirty(true);setLinks(old=>({...old,[p.id]:{...link,enabled:e.target.checked}}));}}/>{label(p)}</label>
      <label>⚡<input type="number" min="1" max="500" disabled={!link.enabled} value={link.cost} onChange={e=>{setLinksDirty(true);setLinks(old=>({...old,[p.id]:{...link,cost:Number(e.target.value)}}));}}/></label>
     </div>})}</div></>}
   </form>
   <EditorFooter><span className="ed-fine">HU / EN · RLS</span><button type="submit" form="sector-editor-form" className="ed-submit" disabled={busy}>{tr('MENTÉS','SAVE')}</button></EditorFooter>
  </section>
  {mapOpen&&selectedSector&&<WorldMapEditor locale={locale} level="sector" parentId={selectedSector}
   parentName={locale==='en'?sectors.find(s=>s.id===selectedSector)?.name_en||'—':sectors.find(s=>s.id===selectedSector)?.name_hu||'—'}
   routes={routes.filter(r=>places.some(p=>p.id===r.origin_id&&p.sector_id===selectedSector)&&places.some(p=>p.id===r.destination_id&&p.sector_id===selectedSector))}
   nodes={places.filter(p=>p.sector_id===selectedSector).map(p=>({id:p.id,slug:p.slug,x:p.x,y:p.y,image_path:p.image_path,
    name_hu:p.game_locations_i18n.find(t=>t.locale==='hu')?.name||p.slug,
    name_en:p.game_locations_i18n.find(t=>t.locale==='en')?.name||p.slug}))}
   onClose={()=>setMapOpen(false)}
   onSaved={async savedRoutes=>{await load(draft.id||undefined,{sectorId:selectedSector,routes:savedRoutes||[]});}}/>}
 </EditorFrame>;
}
