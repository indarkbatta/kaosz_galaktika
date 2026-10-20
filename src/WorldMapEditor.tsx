import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import './world-map-editor.css';
export type WorldMapNode={id:string;slug:string;name_hu:string;name_en:string;x:number;y:number};
export type WorldMapLevel='galaxy'|'quadrant'|'sector';
export default function WorldMapEditor({locale,level,parentId,parentName,nodes,onClose,onSaved}:{
 locale:string;level:WorldMapLevel;parentId:string;parentName:string;nodes:WorldMapNode[];
 onClose:()=>void;onSaved:()=>void;
}){
 const en=locale==='en',tr=(hu:string,english:string)=>en?english:hu;
 const [positions,setPositions]=useState<WorldMapNode[]>(nodes);
 const [selected,setSelected]=useState(nodes[0]?.id||'');
 const [zoom,setZoom]=useState(1);
 const [saving,setSaving]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [confirmClose,setConfirmClose]=useState(false);
 const dragging=useRef<string|null>(null);
 const field=useRef<HTMLDivElement>(null);
 useEffect(()=>{setPositions(nodes);setSelected(nodes[0]?.id||'');setDirty(false);},[nodes,parentId,level]);
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(dirty)setConfirmClose(true);else onClose();}};
  document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);
 },[dirty,onClose]);
 const snap=(value:number)=>Math.max(10,Math.min(90,Math.round(value/5)*5));
 const toCoordinates=(e:PointerEvent)=>{
  const r=field.current?.getBoundingClientRect();if(!r)return null;
  return {x:snap((e.clientX-r.left)/r.width*100),y:snap((e.clientY-r.top)/r.height*100)};
 };
 const move=(e:PointerEvent)=>{
  if(!dragging.current)return;
  const point=toCoordinates(e);if(!point)return;
  const id=dragging.current;
  setPositions(list=>list.map(item=>item.id===id?{...item,...point}:item));
  setDirty(true);
 };
 const stop=(e:PointerEvent)=>{if(!dragging.current)return;move(e);dragging.current=null;};
 const save=async()=>{
  if(saving)return;setSaving(true);
  try{
   const {error}=await supabase.rpc('save_world_map_positions',{
    p_level:level,p_parent:parentId,p_nodes:positions.map(({id,x,y})=>({id,x,y}))
   });
   if(error)throw error;
   notify(tr('Térképpozíciók mentve.','Map positions saved.'),'success');
   onSaved();onClose();
  }catch(e){notify(e instanceof Error?e.message:String(e),'error');}
  finally{setSaving(false);}
 };
 const active=positions.find(item=>item.id===selected);
 const title=level==='galaxy'?tr('Kvadránsok','Quadrants'):level==='quadrant'?tr('Szektorok','Sectors'):tr('Helyszínek','Locations');
 return <div className="wm-mask" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget){if(dirty)setConfirmClose(true);else onClose();}}}>
  <section className="wm-window" role="dialog" aria-modal="true" aria-label={tr('Csillagtérkép szerkesztő','Starmap editor')}>
   <header className="wm-head"><div><small>HATÁRVILÁG / STARMAP</small>
    <strong>{parentName} <span>· {title}</span></strong></div>
    <button type="button" aria-label={tr('Bezárás','Close')} onClick={()=>dirty?setConfirmClose(true):onClose()}>×</button>
   </header>
   <div className="wm-tools"><span>{tr('Húzd a csomópontokat a rácsra. A változások csak mentéskor kerülnek az adatbázisba.','Drag nodes on the grid. Positions are committed only when saved.')}</span>
    <div><button type="button" title="Zoom out" onClick={()=>setZoom(v=>Math.max(.7,Math.round((v-.1)*10)/10))}>−</button><b>{Math.round(zoom*100)}%</b><button type="button" title="Zoom in" onClick={()=>setZoom(v=>Math.min(2,Math.round((v+.1)*10)/10))}>＋</button></div>
   </div>
   <div className="wm-body">
    <div className="wm-viewport">
     <div className="wm-field" ref={field} style={{transform:'scale('+zoom+')'}}>
      <div className="wm-axis wm-axis-x">X → 100</div><div className="wm-axis wm-axis-y">Y ↓ 100</div>
      {positions.map(n=><button key={n.id} type="button"
       className={'wm-node '+(selected===n.id?'selected':'')}
       style={{left:n.x+'%',top:n.y+'%'}}
       onClick={()=>setSelected(n.id)}
       onPointerDown={e=>{if(saving)return;setSelected(n.id);dragging.current=n.id;e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();}}
       onPointerMove={move}
       onPointerUp={stop}
       onPointerCancel={()=>{dragging.current=null;}}
       aria-label={(en?n.name_en:n.name_hu)+' ('+n.x+', '+n.y+')'}>
       <span className="wm-node-dot">✦</span><span className="wm-node-label">{en?n.name_en:n.name_hu}</span>
      </button>)}
      {positions.length===0&&<div className="wm-empty">{tr('Még nincsenek elemek. Hozz létre egyet a szerkesztőben.','No items yet. Create one in the editor first.')}</div>}
     </div>
    </div>
    <aside className="wm-inspector"><strong>{tr('Kijelölt objektum','Selected object')}</strong>
     {active?<><h3>{en?active.name_en:active.name_hu}</h3><p>{active.slug}</p>
      <div className="wm-coord"><label>X<input type="number" min={7} max={93} value={active.x} onChange={e=>{const x=Number(e.target.value);if(x>=7&&x<=93){setPositions(v=>v.map(n=>n.id===active.id?{...n,x}:n));setDirty(true);}}}/></label>
       <label>Y<input type="number" min={7} max={93} value={active.y} onChange={e=>{const y=Number(e.target.value);if(y>=7&&y<=93){setPositions(v=>v.map(n=>n.id===active.id?{...n,y}:n));setDirty(true);}}}/></label></div>
      <p className="wm-help">{tr('Áthelyezéshez húzd az objektumot, vagy add meg a koordinátákat.','Drag the node or edit its coordinates.')}</p>
     </>:<p>{tr('Válassz egy objektumot.','Select an object.')}</p>}
     <div className="wm-items"><strong>{title} ({positions.length})</strong>
      {positions.map(n=><button key={n.id} className={selected===n.id?'active':''} onClick={()=>setSelected(n.id)}>{en?n.name_en:n.name_hu}</button>)}
     </div>
    </aside>
   </div>
   <footer className="wm-footer"><span>{dirty?tr('● Nem mentett változások','● Unsaved changes'):tr('Nincs módosítás','No changes')}</span>
    <button type="button" onClick={()=>dirty?setConfirmClose(true):onClose()}>{tr('Mégse','Cancel')}</button>
    <button type="button" className="wm-save" disabled={saving||!dirty} onClick={()=>void save()}>{saving?tr('Mentés…','Saving…'):tr('Térkép mentése','Save map')}</button>
   </footer>
   {confirmClose&&<div className="wm-confirm"><section role="alertdialog" aria-modal="true"><h3>{tr('Elveted a módosításokat?','Discard changes?')}</h3><p>{tr('A térképpozíciók nem kerülnek mentésre.','Map changes will not be saved.')}</p>
    <button onClick={()=>setConfirmClose(false)}>{tr('Folytatom','Continue editing')}</button>
    <button className="wm-save" onClick={onClose}>{tr('Elvetés','Discard')}</button></section></div>}
  </section>
 </div>;
}
