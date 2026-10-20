import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorTabs,EditorRoster,EditorHeader,EditorFooter} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import WorldMapEditor,{type WorldMapLevel,type WorldMapNode} from './WorldMapEditor';
import './world-atlas-editor.css';

type Level='galaxies'|'quadrants'|'sectors';
type WorldDoc={
 id:string;slug:string;name_hu:string;name_en:string;description_hu:string;description_en:string;
 galaxy_id?:string;quadrant_id?:string;x?:number;y?:number;is_published:boolean;
};
type LocationNode=WorldMapNode&{sector_id:string};
const makeBlank=(level:Level,parent?:string):WorldDoc=>({
 id:'',slug:'',name_hu:'',name_en:'',description_hu:'',description_en:'',
 is_published:false,x:50,y:50,
 ...(level==='quadrants'?{galaxy_id:parent||''}:level==='sectors'?{quadrant_id:parent||''}:{})
});
export default function GalaxyEditor({locale,onBack,onSectionSelect}:{
 locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void;
}){
 const en=locale==='en',tr=(hu:string,english:string)=>en?english:hu;
 const [galaxies,setGalaxies]=useState<WorldDoc[]>([]);
 const [quadrants,setQuadrants]=useState<WorldDoc[]>([]);
 const [sectors,setSectors]=useState<WorldDoc[]>([]);
 const [locations,setLocations]=useState<LocationNode[]>([]);
 const [level,setLevel]=useState<Level>('galaxies');
 const [draft,setDraft]=useState<WorldDoc>(makeBlank('galaxies'));
 const [tab,setTab]=useState<'general'|'map'>('general');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
 const [mapOpen,setMapOpen]=useState(false),[discard,setDiscard]=useState(false);
 const pending=useRef<null|(()=>void)>(null);
 const selectDoc=(row:WorldDoc)=>{setDraft({...row});setDirty(false);setTab('general');};
 const navigate=(next:()=>void)=>{if(dirty){pending.current=next;setDiscard(true);}else next();};
 const list=(which=level):WorldDoc[]=>which==='galaxies'?galaxies:which==='quadrants'?quadrants:sectors;
 const name=(row:WorldDoc|WorldMapNode)=>en?row.name_en:row.name_hu;
 const load=useCallback(async(keepLevel:Level='galaxies',keepId?:string)=>{
  setLoading(true);
  try{
   const [g,q,s,l]=await Promise.all([
    supabase.from('game_galaxies').select('*').order('slug'),
    supabase.from('game_quadrants').select('*').order('slug'),
    supabase.from('game_sectors').select('*').order('slug'),
    supabase.from('game_locations').select('id,slug,sector_id,x,y,game_locations_i18n(locale,name)')
   ]);
   if(g.error||q.error||s.error||l.error)throw new Error((g.error||q.error||s.error||l.error)!.message);
   const galaxies=(g.data||[]) as WorldDoc[],quadrants=(q.data||[]) as WorldDoc[],sectors=(s.data||[]) as WorldDoc[];
   setGalaxies(galaxies);setQuadrants(quadrants);setSectors(sectors);
   setLocations((l.data||[]).map((row:any)=>({
    id:row.id,slug:row.slug,sector_id:row.sector_id,x:row.x,y:row.y,
    name_hu:row.game_locations_i18n?.find((t:{locale:string;name:string})=>t.locale==='hu')?.name||row.slug,
    name_en:row.game_locations_i18n?.find((t:{locale:string;name:string})=>t.locale==='en')?.name||row.slug
   })));
   const current=keepLevel==='galaxies'?galaxies:keepLevel==='quadrants'?quadrants:sectors;
   const selected=current.find(row=>row.id===keepId)||current[0];
   setDraft(selected||makeBlank(keepLevel,keepLevel==='quadrants'?galaxies[0]?.id:quadrants[0]?.id));
   setDirty(false);
  }catch(e){notify(e instanceof Error?e.message:String(e),'error');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!dirty)return;
  const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  window.addEventListener('beforeunload',prevent);
  return()=>window.removeEventListener('beforeunload',prevent);
 },[dirty]);
 const patch=(p:Partial<WorldDoc>)=>{setDraft(old=>({...old,...p}));setDirty(true);};
 const changeLevel=(v:Level)=>navigate(()=>{
  setLevel(v);setTab('general');setDraft(list(v)[0]||makeBlank(v,v==='quadrants'?galaxies[0]?.id:quadrants[0]?.id));setDirty(false);
 });
 const create=()=>navigate(()=>{
  setDraft(makeBlank(level,level==='quadrants'?galaxies[0]?.id:quadrants[0]?.id));
  setTab('general');setDirty(false);
 });
 const save=async(e:FormEvent)=>{e.preventDefault();if(busy)return;
  if(!/^[a-z][a-z0-9_]*$/.test(draft.slug)||!draft.name_hu.trim()||!draft.name_en.trim()){
   notify(tr('Érvényes azonosító, magyar és angol név szükséges.','Valid slug, Hungarian and English names are required.'),'error');return;
  }
  if(level==='quadrants'&&!draft.galaxy_id||level==='sectors'&&!draft.quadrant_id){
   notify(tr('Válassz szülőt!','Choose a parent!'),'error');return;
  }
  setBusy(true);
  try{
   const body={
    slug:draft.slug,name_hu:draft.name_hu.trim(),name_en:draft.name_en.trim(),
    description_hu:draft.description_hu,description_en:draft.description_en,
    is_published:draft.is_published,
    ...(level==='quadrants'?{galaxy_id:draft.galaxy_id,x:draft.x,y:draft.y}:{}),
    ...(level==='sectors'?{quadrant_id:draft.quadrant_id,x:draft.x,y:draft.y}:{})
   };
   const result=draft.id
     ?await supabase.from('game_'+level).update(body).eq('id',draft.id).select('id').single()
     :await supabase.from('game_'+level).insert(body).select('id').single();
   if(result.error)throw result.error;
   await load(level,result.data.id);
   notify(tr('Mentve.','Saved.'),'success');
  }catch(e){notify(e instanceof Error?e.message:String(e),'error');}
  finally{setBusy(false);}
 };
 const children:WorldMapNode[]=level==='galaxies'
   ?quadrants.filter(x=>x.galaxy_id===draft.id).map(x=>({id:x.id,slug:x.slug,name_hu:x.name_hu,name_en:x.name_en,x:x.x||50,y:x.y||50}))
   :level==='quadrants'
   ?sectors.filter(x=>x.quadrant_id===draft.id).map(x=>({id:x.id,slug:x.slug,name_hu:x.name_hu,name_en:x.name_en,x:x.x||50,y:x.y||50}))
   :locations.filter(x=>x.sector_id===draft.id);
 const mapLevel:WorldMapLevel=level==='galaxies'?'galaxy':level==='quadrants'?'quadrant':'sector';
 const levelLabels={galaxies:tr('Galaxisok','Galaxies'),quadrants:tr('Kvadránsok','Quadrants'),sectors:tr('Szektorok / naprendszerek','Sectors / star systems')};
 return <EditorFrame>
  <EditorNavigation locale={locale} active="galaxy" onBack={()=>navigate(onBack)} onSelect={section=>navigate(()=>onSectionSelect(section))}/>
  <EditorRoster>
   <div className="ed-roster-top"><strong>{levelLabels[level]}</strong><button type="button" disabled={busy} onClick={create}>＋ {tr('Új','New')}</button></div>
   <EditorTabs variant="catalog" label={tr('Világszintek','World levels')} selected={level} onSelect={id=>changeLevel(id as Level)} items={[
    {id:'galaxies',name:tr('Galaxis','Galaxy')},{id:'quadrants',name:tr('Kvadráns','Quadrant')},{id:'sectors',name:tr('Szektor','Sector')}
   ]}/>
   <div className="ed-roster-list">{list().map(row=><button type="button" key={row.id} className={'ed-record '+(draft.id===row.id?'selected':'')} onClick={()=>navigate(()=>selectDoc(row))}>
    <span className="ed-thumbnail">✧</span><span className="ed-record-name"><strong>{name(row)}</strong><small>{row.slug}</small></span>
   </button>)}
    {list().length===0&&<p>{tr('Még nincsenek bejegyzések.','No entries yet.')}</p>}
   </div>
  </EditorRoster>
  <section className="ed-editor">
   <EditorHeader><strong>{draft.id?name(draft):tr('Új bejegyzés','New record')}</strong><span>{levelLabels[level]}</span></EditorHeader>
   <EditorTabs label={tr('Szerkesztőfülek','Editor tabs')} selected={tab} onSelect={id=>setTab(id as typeof tab)} items={[
    {id:'general',name:tr('Alapadatok','General')},{id:'map',name:tr('Csillagtérkép','Starmap')}
   ]}/>
   <form className="ed-form wa-form" id="galaxy-editor-form" onSubmit={save}>
    {tab==='general'?<div className="ed-tab-pane wa-fields">
     <label>{tr('Technikai azonosító','Slug')}<input required value={draft.slug} onChange={e=>patch({slug:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')})}/></label>
     {level==='quadrants'&&<label>{tr('Szülőgalaxis','Parent galaxy')}
      <select value={draft.galaxy_id||''} onChange={e=>patch({galaxy_id:e.target.value})}>{galaxies.map(g=><option key={g.id} value={g.id}>{name(g)}</option>)}</select></label>}
     {level==='sectors'&&<label>{tr('Szülőkvadráns','Parent quadrant')}
      <select value={draft.quadrant_id||''} onChange={e=>patch({quadrant_id:e.target.value})}>{quadrants.map(q=><option key={q.id} value={q.id}>{name(q)}</option>)}</select></label>}
     <div className="wa-two"><label>{tr('Magyar név','Hungarian name')}<input required maxLength={120} value={draft.name_hu} onChange={e=>patch({name_hu:e.target.value})}/></label>
      <label>{tr('Angol név','English name')}<input required maxLength={120} value={draft.name_en} onChange={e=>patch({name_en:e.target.value})}/></label></div>
     <div className="wa-two"><label>{tr('Magyar leírás','Hungarian description')}<textarea rows={4} value={draft.description_hu} onChange={e=>patch({description_hu:e.target.value})}/></label>
      <label>{tr('Angol leírás','English description')}<textarea rows={4} value={draft.description_en} onChange={e=>patch({description_en:e.target.value})}/></label></div>
     {level!=='galaxies'&&<div className="wa-two"><label>X<input type="number" min={7} max={93} value={draft.x||50} onChange={e=>patch({x:Number(e.target.value)})}/></label>
      <label>Y<input type="number" min={7} max={93} value={draft.y||50} onChange={e=>patch({y:Number(e.target.value)})}/></label></div>}
     <label className="wa-published"><input type="checkbox" checked={draft.is_published} onChange={e=>patch({is_published:e.target.checked})}/>{tr('Publikált','Published')}</label>
     <p className="ed-tab-help">{tr('Egy galaxis kvadránsokat, egy kvadráns szektorokat, egy szektor különálló helyszíneket tartalmaz.','A galaxy contains quadrants, a quadrant contains sectors, and a sector contains distinct locations.')}</p>
    </div>:<div className="ed-tab-pane wa-map-preview">
     <h3>{tr('Csillagtérkép','Starmap')} · {name(draft)||'—'}</h3>
     <p className="ed-tab-help">{level==='galaxies'?tr('Kvadránsok elhelyezése','Place quadrants'):level==='quadrants'?tr('Szektorok elhelyezése','Place sectors'):tr('Helyszínek elhelyezése','Place locations')} · {children.length}</p>
     <div className="wa-map-mini">{children.map(node=><span key={node.id} title={en?node.name_en:node.name_hu} style={{left:node.x+'%',top:node.y+'%'}}>✦</span>)}</div>
     <button type="button" className="ed-submit wa-open-map" disabled={!draft.id||dirty||loading} onClick={()=>setMapOpen(true)}>{tr('Nagy csillagtérkép szerkesztése','Open large starmap editor')}</button>
     {dirty&&<p>{tr('Előbb mentsd az alapadatokat.','Save changes to this record first.')}</p>}
     {!draft.id&&<p>{tr('Előbb hozd létre a bejegyzést.','Create the record first.')}</p>}
    </div>}
   </form>
   <EditorFooter><span className={dirty?'ed-unsaved':'ed-fine'}>{dirty?tr('● Nem mentett változások','● Unsaved changes'):'HU / EN · RLS'}</span>
    <button type="submit" form="galaxy-editor-form" className="ed-submit" disabled={busy||loading}>{busy?tr('Mentés…','Saving…'):tr('Mentés','Save')}</button>
   </EditorFooter>
  </section>
  {mapOpen&&!!draft.id&&<WorldMapEditor locale={locale} level={mapLevel} parentId={draft.id} parentName={name(draft)}
    nodes={children} onClose={()=>setMapOpen(false)} onSaved={()=>{void load(level,draft.id);}}/>}
  {discard&&<div className="ed-modal-mask"><section className="ed-modal" role="alertdialog" aria-modal="true">
   <h3>{tr('Nem mentett módosítások','Unsaved changes')}</h3><p>{tr('Elveted a változtatásokat?','Discard your changes?')}</p>
   <div><button type="button" onClick={()=>{setDiscard(false);pending.current=null;}}>{tr('Folytatom','Keep editing')}</button>
    <button type="button" className="ed-danger" onClick={()=>{setDiscard(false);setDirty(false);const fn=pending.current;pending.current=null;fn?.();}}>{tr('Elvetés','Discard')}</button></div>
  </section></div>}
 </EditorFrame>;
}
