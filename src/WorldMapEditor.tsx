import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import './world-map-editor.css';
import {WorldArtwork} from './components/WorldImageField';
import {WORLD_MAP_SIZE,snapWorldCoordinate} from './lib/worldMapGeometry';

export type WorldMapNode={id:string;slug:string;name_hu:string;name_en:string;x:number;y:number;image_path?:string|null};
export type WorldMapRoute={
 id?:string;origin_id:string;destination_id:string;energy_cost:number;is_published?:boolean;
};
export type WorldMapLevel='galaxy'|'quadrant'|'sector';
type Interaction={kind:'pan'|'node';id?:string;pointerId:number;x:number;y:number;startX:number;startY:number;panX:number;panY:number};
const MAP_SIZE=WORLD_MAP_SIZE;
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const snap=snapWorldCoordinate;
const linkKey=(a:string,b:string)=>a<b?a+':'+b:b+':'+a;
const aligned=(nodes:WorldMapNode[])=>nodes.map(n=>({...n,x:snap(n.x),y:snap(n.y)}));
const dedup=(routes:WorldMapRoute[])=>{
 const unique=new Map<string,WorldMapRoute>();
 for(const route of routes){const key=linkKey(route.origin_id,route.destination_id);if(!unique.has(key))unique.set(key,{...route});}
 return [...unique.values()];
};

export default function WorldMapEditor({locale,level,parentId,parentName,nodes,routes=[],onClose,onSaved}:{
 locale:string;level:WorldMapLevel;parentId:string;parentName:string;nodes:WorldMapNode[];
 routes?:WorldMapRoute[];onClose:()=>void;onSaved:()=>void;
}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [positions,setPositions]=useState<WorldMapNode[]>(()=>aligned(nodes));
 const [edges,setEdges]=useState<WorldMapRoute[]>(()=>dedup(routes));
 const [selected,setSelected]=useState(nodes[0]?.id||'');
 const [selectedEdge,setSelectedEdge]=useState('');
 const [mode,setMode]=useState<'move'|'connect'>('move');
 const [from,setFrom]=useState('');
 const [zoom,setZoom]=useState(1);
 const [fit,setFit]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const [busy,setBusy]=useState(false);
 const [dirty,setDirty]=useState(()=>nodes.some(n=>snap(n.x)!==n.x||snap(n.y)!==n.y));
 const [confirmClose,setConfirmClose]=useState(false);
 const viewport=useRef<HTMLDivElement>(null);
 const field=useRef<HTMLDivElement>(null);
 const interaction=useRef<Interaction|null>(null);
 const viewportWidth=useRef(0);
 const viewportHeight=useRef(0);

 useEffect(()=>{
  const v=viewport.current;if(!v)return;
  const resize=()=>{
   const r=v.getBoundingClientRect();
   viewportWidth.current=r.width;viewportHeight.current=r.height;
   setFit(clamp(Math.min((r.width-36)/MAP_SIZE,(r.height-36)/MAP_SIZE),.15,1.5));
  };
  resize();
  const observer=new ResizeObserver(resize);observer.observe(v);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){
    if(from){setFrom('');return;}
    if(dirty)setConfirmClose(true);else onClose();
   }
  };
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[from,dirty,onClose]);
 const changeZoom=(next:number,clientX?:number,clientY?:number)=>{
  const newZoom=clamp(Math.round(next*100)/100,.5,4);
  if(newZoom===zoom)return;
  if(clientX!==undefined&&clientY!==undefined&&viewport.current){
   const r=viewport.current.getBoundingClientRect();
   const dx=clientX-r.left-r.width/2,dy=clientY-r.top-r.height/2;
   const factor=newZoom/zoom;
   setPan(p=>({x:dx-(dx-p.x)*factor,y:dy-(dy-p.y)*factor}));
  }
  setZoom(newZoom);
 };
 useEffect(()=>{
  const v=viewport.current;if(!v)return;
  const wheel=(event:WheelEvent)=>{
   event.preventDefault();
   const next=clamp(zoom*Math.exp(-event.deltaY*.0015),.5,4);
   changeZoom(next,event.clientX,event.clientY);
  };
  v.addEventListener('wheel',wheel,{passive:false});
  return()=>v.removeEventListener('wheel',wheel);
 },[zoom]);
 const coords=(clientX:number,clientY:number)=>{
  const rect=field.current?.getBoundingClientRect();if(!rect||!rect.width||!rect.height)return null;
  return {x:snap((clientX-rect.left)/rect.width*100),y:snap((clientY-rect.top)/rect.height*100)};
 };
 const pick=(id:string)=>{
  setSelected(id);setSelectedEdge('');
  if(mode!=='connect')return;
  if(!from){setFrom(id);return;}
  if(from===id){setFrom('');return;}
  const key=linkKey(from,id);
  if(!edges.some(edge=>linkKey(edge.origin_id,edge.destination_id)===key)){
   setEdges(old=>[...old,{origin_id:from,destination_id:id,energy_cost:10,is_published:true}]);
   setDirty(true);
  }
  setSelectedEdge(key);setFrom('');
 };
 const pointerDown=(event:PointerEvent<HTMLDivElement>)=>{
  if(busy)return;
  const el=event.target as Element;
  const edge=el.closest('[data-link-key]')?.getAttribute('data-link-key');
  if(edge&&event.button===0){setSelectedEdge(edge);setFrom('');return;}
  const id=el.closest('[data-node-id]')?.getAttribute('data-node-id');
  if(id&&event.button===0){pick(id);if(mode==='connect')return;}
  if(event.button!==0&&event.button!==1)return;
  interaction.current={kind:id&&event.button===0?'node':'pan',id:id||undefined,pointerId:event.pointerId,
   x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,panX:pan.x,panY:pan.y};
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
 };
 const pointerMove=(event:PointerEvent<HTMLDivElement>)=>{
  const action=interaction.current;if(!action||action.pointerId!==event.pointerId)return;
  if(action.kind==='pan'){
   setPan({x:action.panX+event.clientX-action.startX,y:action.panY+event.clientY-action.startY});return;
  }
  if(Math.hypot(event.clientX-action.startX,event.clientY-action.startY)<3)return;
  const point=coords(event.clientX,event.clientY);
  if(!point||!action.id)return;
  setPositions(items=>items.map(n=>n.id===action.id?{...n,...point}:n));
  setDirty(true);
 };
 const pointerUp=(event:PointerEvent<HTMLDivElement>)=>{
  if(interaction.current?.pointerId!==event.pointerId)return;
  pointerMove(event);
  interaction.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const selectedRoute=edges.find(e=>linkKey(e.origin_id,e.destination_id)===selectedEdge);
 const active=positions.find(item=>item.id===selected);
 const title=level==='galaxy'?tr('Kvadránsok','Quadrants'):level==='quadrant'?tr('Szektorok','Sectors'):tr('Helyszínek','Locations');
 const display=(node:WorldMapNode|undefined)=>node?(en?node.name_en:node.name_hu):'—';
 const updateCoordinate=(axis:'x'|'y',value:number)=>{
  if(!active||!Number.isFinite(value))return;
  const point=snap(value);
  setPositions(items=>items.map(n=>n.id===active.id?{...n,[axis]:point}:n));
  setDirty(true);
 };
 const updateCost=(cost:number)=>{
  if(!selectedRoute||!Number.isInteger(cost)||cost<1||cost>500)return;
  setEdges(items=>items.map(e=>linkKey(e.origin_id,e.destination_id)===selectedEdge?{...e,energy_cost:cost}:e));
  setDirty(true);
 };
 const deleteRoute=()=>{
  if(!selectedRoute)return;
  setEdges(items=>items.filter(e=>linkKey(e.origin_id,e.destination_id)!==selectedEdge));
  setSelectedEdge('');setDirty(true);
 };
 const save=async()=>{
  if(busy)return;setBusy(true);
  try{
   const p_nodes=positions.map(({id,x,y})=>({id,x,y}));
   const response=level==='sector'
    ?await supabase.rpc('save_sector_starmap',{p_sector:parentId,p_nodes,p_routes:edges.map(({origin_id,destination_id,energy_cost,is_published})=>({origin_id,destination_id,energy_cost,is_published:is_published!==false}))})
    :await supabase.rpc('save_world_map_positions',{p_level:level,p_parent:parentId,p_nodes});
   if(response.error)throw response.error;
   notify(tr('Csillagtérkép és útvonalak mentve.','Starmap saved.'),'success');
   onSaved();onClose();
  }catch(error){notify(error instanceof Error?error.message:String(error),'error');}
  finally{setBusy(false);}
 };
 const stageScale=fit*zoom;
 return <div className="wm-mask" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget){if(dirty)setConfirmClose(true);else onClose();}}}>
  <section className="wm-window" role="dialog" aria-modal="true" aria-label={tr('Csillagtérkép szerkesztő','Starmap editor')}>
   <header className="wm-head"><div><small>HATÁRVILÁG / STARMAP</small><strong>{parentName} <span>· {title}</span></strong></div>
    <button type="button" aria-label={tr('Bezárás','Close')} onClick={()=>dirty?setConfirmClose(true):onClose()}>×</button>
   </header>
   <div className="wm-tools"><span>{mode==='connect'?tr('Válassz két helyszínt az ugrási útvonal megrajzolásához.','Select two locations to draw a travel link.'):tr('Húzd a csomópontokat; üres térképen húzva mozog a nézet.','Drag nodes to reposition; drag empty space to pan.')}</span>
    <div className="wm-tool-group">
     <button type="button" className={mode==='move'?'active':''} aria-pressed={mode==='move'} onClick={()=>{setMode('move');setFrom('');}}>{tr('Mozgatás','Move')}</button>
     {level==='sector'&&<button type="button" className={mode==='connect'?'active':''} aria-pressed={mode==='connect'} onClick={()=>{setMode('connect');setFrom('');}}>{tr('Összeköttetés','Connect')}</button>}
     <button type="button" aria-label={tr('Kicsinyítés','Zoom out')} onClick={()=>changeZoom(zoom/1.25)}>−</button>
     <b>{Math.round(zoom*100)}%</b>
     <button type="button" aria-label={tr('Nagyítás','Zoom in')} onClick={()=>changeZoom(zoom*1.25)}>＋</button>
     <button type="button" aria-label={tr('Nézet visszaállítása','Reset view')} onClick={()=>{setPan({x:0,y:0});setZoom(1);}}>⤢</button>
    </div>
   </div>
   <div className="wm-body">
    <div className={'wm-viewport '+(mode==='connect'?'wm-connecting':'')} ref={viewport}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={event=>{if(interaction.current?.pointerId===event.pointerId)interaction.current=null;}}
      aria-label={tr('Négyzethálós csillagtérkép','Square-grid star map')}>
     <div className="wm-field" ref={field} style={{transform:'translate(-50%, -50%) translate('+pan.x+'px, '+pan.y+'px) scale('+stageScale+')'}}>
      <div className="wm-axis wm-axis-x">X → 100</div><div className="wm-axis wm-axis-y">Y ↓ 100</div>
      {level==='sector'&&<svg className="wm-connections" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-label={tr('Útvonalak','Travel links')}>
       {edges.map(edge=>{
        const a=positions.find(n=>n.id===edge.origin_id),b=positions.find(n=>n.id===edge.destination_id);
        if(!a||!b)return null;
        const key=linkKey(edge.origin_id,edge.destination_id);
        return <g key={key}>
         <line className={'wm-line '+(selectedEdge===key?'selected':'')} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
         <line className="wm-line-hit" data-link-key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>
        </g>;
       })}
      </svg>}
      {positions.map(n=><button key={n.id} type="button" data-node-id={n.id}
       className={'wm-node '+(selected===n.id?'selected ':'')+(from===n.id?'link-start':'')}
       style={{left:n.x+'%',top:n.y+'%'}}
       aria-label={display(n)+' ('+n.x+', '+n.y+')'} aria-pressed={selected===n.id}>
       <span className="wm-node-dot"><WorldArtwork path={n.image_path} fallback="✦" alt=""/></span><span className="wm-node-label">{display(n)}</span>
      </button>)}
      {!positions.length&&<div className="wm-empty">{tr('Még nincs objektum. Hozz létre egyet a szerkesztőben.','No nodes yet. Create one in the editor first.')}</div>}
     </div>
    </div>
    <aside className="wm-inspector">
     <strong>{tr('Kijelölt objektum','Selected object')}</strong>
     {active?<><WorldArtwork className="wm-inspector-image" path={active.image_path} fallback="✦" alt={display(active)}/><h3>{display(active)}</h3><p>{active.slug}</p>
      <div className="wm-coord">
       <label>X<input type="number" min={10} max={90} step={5} value={active.x} onChange={e=>updateCoordinate('x',Number(e.target.value))}/></label>
       <label>Y<input type="number" min={10} max={90} step={5} value={active.y} onChange={e=>updateCoordinate('y',Number(e.target.value))}/></label>
      </div>
     </>:<p>{tr('Válassz egy objektumot.','Select an object.')}</p>}
     {level==='sector'&&<section className="wm-route-editor">
      <strong>{tr('Ugrási útvonalak','Travel links')} ({edges.length})</strong>
      {from&&<p className="wm-link-hint">{tr('Kiindulópont: ','From: ')}{display(positions.find(n=>n.id===from))} → {tr('válassz célpontot','choose destination')}</p>}
      {selectedRoute&&<div className="wm-route-selected">
       <span>{display(positions.find(n=>n.id===selectedRoute.origin_id))} ↔ {display(positions.find(n=>n.id===selectedRoute.destination_id))}</span>
       <label>{tr('Energiaköltség','Energy cost')}<input aria-label={tr('Útvonal energiaköltsége','Route energy cost')} type="number" min={1} max={500} value={selectedRoute.energy_cost} onChange={e=>updateCost(Number(e.target.value))}/></label>
       <button type="button" className="wm-delete" onClick={deleteRoute}>{tr('Összeköttetés törlése','Delete link')}</button>
      </div>}
      <div className="wm-route-list">{edges.map(edge=>{
       const key=linkKey(edge.origin_id,edge.destination_id);
       return <button key={key} type="button" className={selectedEdge===key?'active':''} onClick={()=>{setSelectedEdge(key);setFrom('');}}>
        {display(positions.find(n=>n.id===edge.origin_id))} ↔ {display(positions.find(n=>n.id===edge.destination_id))}<small>⚡ {edge.energy_cost}</small>
       </button>;
      })}</div>
     </section>}
     <div className="wm-items"><strong>{title} ({positions.length})</strong>
      {positions.map(n=><button type="button" key={n.id} className={selected===n.id?'active':''} onClick={()=>{setSelected(n.id);setSelectedEdge('');}}>{display(n)}</button>)}
     </div>
    </aside>
   </div>
   <footer className="wm-footer"><span>{dirty?tr('● Nem mentett változások','● Unsaved changes'):tr('Nincs módosítás','No changes')}</span>
    <button type="button" onClick={()=>dirty?setConfirmClose(true):onClose()}>{tr('Mégse','Cancel')}</button>
    <button type="button" className="wm-save" disabled={busy||!dirty} onClick={()=>void save()}>{busy?tr('Mentés…','Saving…'):tr('Térkép mentése','Save map')}</button>
   </footer>
   {confirmClose&&<div className="wm-confirm"><section role="alertdialog" aria-modal="true">
    <h3>{tr('Elveted a módosításokat?','Discard changes?')}</h3><p>{tr('A térkép és útvonalváltozások nem kerülnek mentésre.','Map and link changes will not be saved.')}</p>
    <button type="button" onClick={()=>setConfirmClose(false)}>{tr('Folytatom','Continue editing')}</button>
    <button type="button" className="wm-save" onClick={onClose}>{tr('Elvetés','Discard')}</button>
   </section></div>}
  </section>
 </div>;
}
