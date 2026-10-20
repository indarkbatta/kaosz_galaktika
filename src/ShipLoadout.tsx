import {useCallback,useEffect,useRef,useState,type DragEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {ShipArt} from './components/GameArt';
import {crewPositionName} from './Cantina';
import './ship-loadout.css';

type ModuleKind='engine'|'reactor'|'shield'|'weapon'|'hull'|'sensor'|'utility';
type Module={item_id:string;slug:string;image_path:string|null;module_kind:ModuleKind;size:number;quantity:number;is_published:boolean;
 power_draw:number;power_output:number;hull_bonus:number;shield_bonus:number;damage_bonus:number;speed_bonus:number;cargo_bonus:number;
 translations:{locale:string;name:string;description:string}[]};
type Member={id:string;name:string;position:string;specialty:string;aptitude:number;portrait_path:string|null};
type Slot={slot_key:string;kind:'module'|'crew';module_kind:ModuleKind|null;crew_role:string|null;size:number;min_aptitude:number;
 required:boolean;name_hu:string;name_en:string;item_id:string|null;crew_id:string|null};
type Stats={hull:number;shield:number;damage:number;speed:number;cargo:number;power_draw:number;power_output:number;missing_required:number;ready:boolean};
type Loadout={ship_id:string;stats:Stats;slots:Slot[];modules:Module[];crew:Member[]};
type Drag={kind:'cargo';item:string}|{kind:'fitted';item:string;slot:string}|{kind:'crew';crew:string};
const DRAG='application/x-hatarvilag-ship';
const PAGE_SIZE=4;
const kindNames:Record<ModuleKind,[string,string]>={engine:['Hajtómű','Engine'],reactor:['Reaktor','Reactor'],shield:['Pajzs','Shield'],weapon:['Fegyverzet','Weapon'],hull:['Burkolat','Hull'],sensor:['Szenzor','Sensor'],utility:['Segédrendszer','Utility']};
export function ShipSystemIcon({kind}:{kind:string}){
 const paths:Record<string,string>={engine:'M8 3h8v11H8z M9 14l-3 6m6-6v7m3-7 3 6',reactor:'M12 2 4 14h7l-1 8 10-13h-8z',shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z',weapon:'M4 20 16 8m-3-3 6 6M3 14l7 7M16 3h5v5',hull:'M4 7 12 3l8 4v10l-8 4-8-4z M4 7l8 4 8-4m-8 4v10',sensor:'M12 12 20 4M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5',utility:'M3 6h18v14H3z M8 6V3h8v3M3 11h18',crew:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-5a8 8 0 0 1 16 0v5'};
 return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]||paths.utility}/></svg>;
}
export default function ShipLoadout({characterId,shipSlug,shipName,locale,onChanged}:{characterId:string;shipSlug:string;shipName:string;locale:string;onChanged:()=>Promise<void>}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [data,setData]=useState<Loadout|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [tab,setTab]=useState<'module'|'crew'>('module'),[selected,setSelected]=useState<string|null>(null),[page,setPage]=useState(0),[drag,setDrag]=useState<Drag|null>(null);
 const generation=useRef(0),mutation=useRef(false);
 const refresh=useCallback(async()=>{
  const ticket=++generation.current;
  const r=await supabase.rpc('get_ship_loadout');
  if(ticket!==generation.current)return;
  if(r.error){setError(r.error.message);return;}
  setError('');setData(r.data as Loadout);
 },[characterId,shipSlug]);
 useEffect(()=>{setData(null);setSelected(null);void refresh();return()=>{generation.current++;};},[refresh]);
 const name=(m:Module)=>m.translations?.find(t=>t.locale===(en?'en':'hu'))?.name||m.slug;
 const description=(m:Module)=>m.translations?.find(t=>t.locale===(en?'en':'hu'))?.description||'';
 const slotName=(s:Slot)=>en?s.name_en:s.name_hu;
 const slots=data?.slots.filter(s=>s.kind===tab)||[];
 const current=slots.find(s=>s.slot_key===selected)||slots[0];
 const fitted=current&&data?.modules.find(m=>m.item_id===current.item_id);
 const assigned=current&&data?.crew.find(c=>c.id===current.crew_id);
 const fits=(m:Module,s:Slot)=>s.kind==='module'&&m.module_kind===s.module_kind&&m.size<=s.size;
 const qualifies=(c:Member,s:Slot)=>s.kind==='crew'&&c.specialty===s.crew_role&&c.aptitude>=s.min_aptitude;
 const candidates=current?(tab==='module'?data?.modules.filter(m=>m.is_published&&m.quantity>0&&fits(m,current)):data?.crew.filter(c=>qualifies(c,current))):[];
 const pages=Math.max(1,Math.ceil((candidates?.length||0)/PAGE_SIZE)),safePage=Math.min(page,pages-1);
 const errorText=(message:string)=>{const messages:Record<string,string>={
  'Module incompatible with ship slot':tr('A modul típusa vagy mérete nem megfelelő.','Module type or size is incompatible.'),
  'Module is not in cargo':tr('Ez a modul nincs a raktérben.','This module is not in cargo.'),
  'Crew member is not qualified for this station':tr('A legénységi tag képzettsége nem megfelelő ehhez az álláshoz.','The crew member is not qualified for this station.'),
  'Inventory capacity exceeded after equipment change':tr('Nincs elég hely a raktérben a levett modulnak.','Not enough cargo slots for the removed module.')
 };return messages[message]||message;};
 async function mutate(rpc:'set_ship_module'|'assign_ship_crew'|'move_ship_module',args:Record<string,string|null>){
  if(mutation.current)return;mutation.current=true;setBusy(true);
  try{
   const r=await supabase.rpc(rpc,args);
   if(r.error){notify(errorText(r.error.message),'error');return;}
   await Promise.all([refresh(),onChanged()]);notify(tr('Hajó konfigurációja mentve.','Ship configuration saved.'),'success');
  }catch(e){notify(e instanceof Error?e.message:tr('Mentési hiba.','Save failed.'),'error');}
  finally{mutation.current=false;setBusy(false);setDrag(null);}
 }
 function start(e:DragEvent,payload:Drag){e.dataTransfer.setData(DRAG,JSON.stringify(payload));e.dataTransfer.effectAllowed='move';setDrag(payload);}
 function compatible(s:Slot){
  if(!drag||!data)return false;
  return drag.kind==='crew'?data.crew.some(c=>c.id===drag.crew&&qualifies(c,s)):data.modules.some(m=>m.item_id===drag.item&&fits(m,s));
 }
 function drop(e:DragEvent,s:Slot){
  e.preventDefault();if(!drag||!compatible(s)||busy)return;
  if(drag.kind==='crew')void mutate('assign_ship_crew',{p_slot:s.slot_key,p_crew:drag.crew});
  else if(drag.kind==='fitted')void mutate('move_ship_module',{p_from_slot:drag.slot,p_to_slot:s.slot_key});
  else void mutate('set_ship_module',{p_slot:s.slot_key,p_item:drag.item});
 }
 function stats(m:Module){return [
  [tr('Méret','Size'),['S','M','L'][m.size-1]],[tr('Energiaigény','Power draw'),m.power_draw],
  ...(m.power_output?[[tr('Reaktorteljesítmény','Reactor output'),m.power_output]]:[]),
  ...(m.hull_bonus?[[tr('Burkolat','Hull'),`+${m.hull_bonus}`]]:[]),...(m.shield_bonus?[[tr('Pajzs','Shield'),`+${m.shield_bonus}`]]:[]),
  ...(m.damage_bonus?[[tr('Tűzerő','Firepower'),`+${m.damage_bonus}`]]:[]),...(m.speed_bonus?[[tr('Sebesség','Speed'),`${m.speed_bonus>0?'+':''}${m.speed_bonus}`]]:[]),
  ...(m.cargo_bonus?[[tr('Raktér','Cargo'),`+${m.cargo_bonus}`]]:[])
 ];}
 if(!data)return <div className="sh-loading" role="status">{error||tr('Hajórendszerek betöltése…','Loading ship systems…')}{error&&<button onClick={()=>void refresh()}>{tr('Újrapróbálás','Retry')}</button>}</div>;
 const status=data.stats;
 return <section className="sh-root" aria-label={tr('Hajó felszerelése','Ship loadout')}>
  <header className="sh-header"><div><strong>{shipName}</strong><small>{tr('RENDSZEREK ÉS ÁLLÁSOK','SYSTEMS AND STATIONS')}</small></div><span className={status.ready?'sh-ready':'sh-warning'}>{status.ready?tr('INDULÁSRA KÉSZ','READY TO DEPART'):tr('NEM ÜZEMKÉPES','NOT OPERATIONAL')}</span></header>
  {error&&<p className="sh-error" role="alert">{errorText(error)}</p>}
  <div className="sh-summary">{[[tr('Burkolat','Hull'),status.hull],[tr('Pajzs','Shield'),status.shield],[tr('Tűzerő','Firepower'),status.damage],[tr('Sebesség','Speed'),status.speed],[tr('Raktér','Cargo'),status.cargo],[tr('Energia','Power'),`${status.power_draw} / ${status.power_output}`]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
  <nav className="sh-tabs" aria-label={tr('Hajó konfiguráció','Ship configuration')}>{(['module','crew'] as const).map(t=><button key={t} aria-pressed={tab===t} className={tab===t?'active':''} onClick={()=>{setTab(t);setSelected(null);setPage(0);setDrag(null);}}>{t==='module'?tr('Modulok','Modules'):tr('Legénységi állások','Crew stations')} <b>{data.slots.filter(s=>s.kind===t).length}</b></button>)}</nav>
  <div className="sh-workspace">
   <div className="sh-slots">{slots.map(s=>{
    const m=data.modules.find(m=>m.item_id===s.item_id),c=data.crew.find(c=>c.id===s.crew_id),filled=!!m||!!c;
    const valid=s.kind==='module'?!!m:!!c&&qualifies(c,s);
    return <button type="button" key={s.slot_key} disabled={busy} title={`${slotName(s)} — ${m?name(m):c?.name||tr('Üres','Empty')}`}
     aria-pressed={current?.slot_key===s.slot_key} className={'sh-slot '+(current?.slot_key===s.slot_key?'selected ':'')+(s.required&&!valid?'missing ':'')+(compatible(s)?'drop-target':'')}
     draggable={filled&&!busy} onDragStart={e=>m?start(e,{kind:'fitted',item:m.item_id,slot:s.slot_key}):c&&start(e,{kind:'crew',crew:c.id})} onDragEnd={()=>setDrag(null)}
     onDragOver={e=>{if(compatible(s)&&!busy)e.preventDefault();}} onDrop={e=>drop(e,s)} onClick={()=>{setSelected(s.slot_key);setPage(0);}}>
      <span className="sh-slot-icon"><ShipSystemIcon kind={s.module_kind||'crew'}/></span><span><strong>{slotName(s)}</strong><small>{m?name(m):c?.name||tr('Üres','Empty')}</small><em>{s.kind==='module'?`${['S','M','L'][s.size-1]} · `:`◆${s.min_aptitude} · `}{s.required?tr('Kötelező','Required'):tr('Opcionális','Optional')}</em></span>
     </button>;
   })}</div>
   <div className="sh-diagram"><div className="sh-ship-art"><ShipArt slug={shipSlug}/></div><div className="sh-readiness">
    <strong>{tr('Indulási feltételek','Departure requirements')}</strong>
    <p className={status.missing_required?'sh-warning':''}>{tr('Hiányzó kötelező helyek','Missing required slots')}: {status.missing_required}</p>
    <p className={status.power_draw>status.power_output?'sh-warning':''}>{tr('Reaktortartalék','Reactor reserve')}: {status.power_output-status.power_draw}</p>
    <small>{tr('Az indulást a szerver ellenőrzi. A hajtómű sebességbónusza csökkenti az út energiaköltségét.','Departure is checked by the server. Engine speed bonuses reduce route energy cost.')}</small>
   </div></div>
   <aside className="sh-detail">{current&&<>
    <header><strong>{slotName(current)}</strong><small>{current.kind==='module'?kindNames[current.module_kind!][en?1:0]:crewPositionName(current.crew_role!,en)}</small></header>
    <div className="sh-fitted"><ShipSystemIcon kind={current.module_kind||'crew'}/><strong>{fitted?name(fitted):assigned?.name||tr('Nincs felszerelve','Unoccupied')}</strong></div>
    {fitted&&<><p className="sh-description">{description(fitted)}</p><dl className="sh-module-stats">{stats(fitted).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></>}
    {assigned&&<p className="sh-description">{crewPositionName(assigned.specialty,en)} · ◆{assigned.aptitude}</p>}
    <button className="sh-remove" disabled={busy||(!fitted&&!assigned)} onClick={()=>void mutate(tab==='module'?'set_ship_module':'assign_ship_crew',tab==='module'?{p_slot:current.slot_key,p_item:null}:{p_slot:current.slot_key,p_crew:null})}>{tr('Levétel / kiürítés','Unequip / clear')}</button>
    <div className="sh-cargo" onDragOver={e=>{if(drag?.kind==='fitted'&&!busy)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(drag?.kind==='fitted'&&!busy)void mutate('set_ship_module',{p_slot:drag.slot,p_item:null});}}>
     <div className="sh-candidate-header"><strong>{tab==='module'?tr('Kompatibilis modulok','Compatible modules'):tr('Képzett legénység','Qualified crew')}</strong><span>{safePage+1}/{pages}</span></div>
     <div className="sh-candidates">{candidates?.slice(safePage*PAGE_SIZE,safePage*PAGE_SIZE+PAGE_SIZE).map(candidate=>{
      if('item_id' in candidate){const m=candidate;return <button disabled={busy} type="button" key={m.item_id} title={`${name(m)}\n${stats(m).map(([k,v])=>`${k}: ${v}`).join('\n')}\n${description(m)}`} draggable={!busy} onDragStart={e=>start(e,{kind:'cargo',item:m.item_id})} onDragEnd={()=>setDrag(null)} onClick={()=>void mutate('set_ship_module',{p_slot:current.slot_key,p_item:m.item_id})}><ShipSystemIcon kind={m.module_kind}/><span>{name(m)}</span><small>×{m.quantity} · {['S','M','L'][m.size-1]}</small></button>;}
      const c=candidate;const station=data.slots.find(s=>s.crew_id===c.id);return <button disabled={busy} type="button" key={c.id} title={c.name+' · '+crewPositionName(c.specialty,en)} draggable={!busy} onDragStart={e=>start(e,{kind:'crew',crew:c.id})} onDragEnd={()=>setDrag(null)} onClick={()=>void mutate('assign_ship_crew',{p_slot:current.slot_key,p_crew:c.id})}>{c.portrait_path?<img src={'https://assets.voidnoir.net/'+c.portrait_path} alt=""/>:<ShipSystemIcon kind="crew"/>}<span>{c.name}</span><small>◆{c.aptitude}{station?' · '+slotName(station):''}</small></button>;
     })}</div>
     {!candidates?.length&&<p className="sh-empty">{tab==='module'?tr('Nincs megfelelő modul a raktérben. A Gyártás menüben készíthetsz továbbiakat.','No compatible module in cargo. Craft more in Crafting.'):tr('Nincs megfelelő képzettségű tag. Toborozz a kantinban.','No qualified crew member. Recruit in the cantina.')}</p>}
     <footer><button disabled={busy||safePage===0} onClick={()=>setPage(safePage-1)} aria-label={tr('Előző oldal','Previous page')}>‹</button><small>{tab==='module'?tr('Ide húzva: vissza a raktérbe','Drop here to return to cargo'):tr('Kattints vagy húzd az állásra','Click or drag onto a station')}</small><button disabled={busy||safePage>=pages-1} onClick={()=>setPage(safePage+1)} aria-label={tr('Következő oldal','Next page')}>›</button></footer>
    </div>
   </>}</aside>
  </div>
 </section>;
}
