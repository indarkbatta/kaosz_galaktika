import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Package} from 'lucide-react';
import EquipmentBlueprintEditor from './EquipmentBlueprintEditor';
import {DiscardChangesDialog} from './components/DecisionDialog';
import {EditorFrame,EditorRoster,EditorHeader} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import {supabase} from './lib/supabase';
import {editorMessage} from './lib/editorMessages';
import {worldImageUrl} from './lib/worldImages';
import './editor.css';

type Item={id:string;slug:string;image_path:string|null;texts:{locale:string;name:string}[]};
export default function BlueprintEditor({locale,onBack,onSectionSelect}:{locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void}){
 const tr=(hu:string,en:string)=>locale==='en'?en:hu;
 const [items,setItems]=useState<Item[]>([]),[selected,setSelected]=useState('');
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[version,setVersion]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<null|(()=>void)>(null);
 useEffect(()=>{
  let alive=true;setLoading(true);setError('');
  void supabase.rpc('get_equipment_blueprint_catalog').then(r=>{
   if(!alive)return;
   if(r.error){setError(editorMessage(r.error.message,locale));setLoading(false);return;}
   const list=(r.data as {items:Item[]}).items;
   setItems(list);setSelected(id=>list.some(i=>i.id===id)?id:list[0]?.id||'');setLoading(false);
  });
  return()=>{alive=false;};
 },[version,locale]);
 function navigate(action:()=>void){if(busy)return;if(dirty)setPending(()=>action);else action();}
 const name=(i:Item)=>i.texts?.find(t=>t.locale===locale)?.name||i.texts?.find(t=>t.locale==='hu')?.name||i.slug;
 const filtered=items.filter(i=>(name(i)+' '+i.slug).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/4)),currentPage=Math.min(page,pages-1);
 const item=items.find(i=>i.id===selected);
 return <EditorFrame>
  <EditorNavigation locale={locale} active="blueprints" onBack={()=>navigate(onBack)} onSelect={s=>navigate(()=>onSectionSelect(s))}/>
  <EditorRoster>
   <div className="ed-roster-top"><strong>{tr('Blueprint editor','Blueprint editor')}</strong><span>{items.length}</span></div>
   <input className="ed-roster-search" aria-label={tr('Tárgy keresése','Search items')} placeholder={tr('Név vagy azonosító…','Name or slug…')} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>
   <div className="ed-roster-list">
    {loading?<p>{tr('Betöltés…','Loading…')}</p>:filtered.slice(currentPage*4,currentPage*4+4).map(i=><button type="button" key={i.id} disabled={busy} className={'ed-record '+(i.id===selected?'selected':'')} onClick={()=>{if(i.id!==selected)navigate(()=>{setDirty(false);setSelected(i.id);});}}>
     <span className="ed-thumbnail">{i.image_path?<img src={worldImageUrl(i.image_path)} alt=""/>:<Package size={24}/>}</span><span className="ed-record-name"><strong>{name(i)}</strong><small>{i.slug}</small></span>
    </button>)}
    {!loading&&!filtered.length&&<p>{tr('Nincs találat. Új tárgyat a Tárgyeditorban hozhatsz létre.','No results. Create new items in the Item editor.')}</p>}
   </div>
   <div className="ed-pager"><button type="button" disabled={!currentPage} aria-label={tr('Előző oldal','Previous page')} onClick={()=>setPage(currentPage-1)}><ChevronLeft size={16}/></button><span>{currentPage+1} / {pages}</span><button type="button" disabled={currentPage>=pages-1} aria-label={tr('Következő oldal','Next page')} onClick={()=>setPage(currentPage+1)}><ChevronRight size={16}/></button></div>
  </EditorRoster>
  <section className="ed-editor">
   <EditorHeader><strong>{tr('Blueprint editor','Blueprint editor')}{item?' · '+name(item):''}</strong></EditorHeader>
   {error?<div className="ed-feedback ed-error" role="alert">{error}<button type="button" className="ed-secondary-button" onClick={()=>setVersion(v=>v+1)}>{tr('Újratöltés','Reload')}</button></div>:selected?<EquipmentBlueprintEditor key={selected} itemId={selected} locale={locale} onDirtyChange={setDirty} onBusyChange={setBusy}/>:<div className="ed-empty-state">{loading?tr('Adatok betöltése…','Loading data…'):tr('Először hozz létre egy tárgyat a Tárgyeditorban.','Create an item in the Item editor first.')}</div>}
  </section>
  {pending&&<DiscardChangesDialog locale={locale} onCancel={()=>setPending(null)} onDiscard={()=>{setDirty(false);pending();setPending(null);}}/>}
 </EditorFrame>;
}
