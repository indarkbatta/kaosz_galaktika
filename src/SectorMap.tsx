import {useEffect,useMemo,useState} from 'react';
import './sector-map.css';
export type SectorLocale={locale:string;name:string;description:string};
export type SectorLocation={id:string;slug:string;kind:'station'|'wreck'|'planet'|'anomaly';x:number;y:number;is_published:boolean;game_locations_i18n:SectorLocale[]};
export type SectorRoute={id:string;origin_id:string;destination_id:string;energy_cost:number;is_published:boolean};
export type SectorDiscovery={location_id:string;discovered_at:string};
export default function SectorMap({locale,locations,routes,discovered,currentId,energy,busy,onTravel}:{
 locale:string;locations:SectorLocation[];routes:SectorRoute[];discovered:SectorDiscovery[];
 currentId:string;energy:number;busy:boolean;onTravel:(target:string)=>void
}){
 const en=locale==='en',t=(hu:string,eng:string)=>en?eng:hu;
 const [selected,setSelected]=useState(currentId);
 useEffect(()=>{if(currentId)setSelected(currentId);},[currentId]);
 const current=locations.find(l=>l.id===currentId);
 const chosen=locations.find(l=>l.id===selected)||current;
 const found=useMemo(()=>new Set(discovered.map(x=>x.location_id).concat(currentId)),[discovered,currentId]);
 const paths=useMemo(()=>routes.filter(r=>locations.some(l=>l.id===r.origin_id)&&locations.some(l=>l.id===r.destination_id)),[routes,locations]);
 const connection=paths.find(r=>(r.origin_id===currentId&&r.destination_id===chosen?.id)||(r.destination_id===currentId&&r.origin_id===chosen?.id));
 const name=(loc:SectorLocation|undefined)=>loc?.game_locations_i18n.find(x=>x.locale===(en?'en':'hu'))||loc?.game_locations_i18n.find(x=>x.locale==='hu');
 const known=chosen?found.has(chosen.id):false;
 const canGo=!!connection&&!busy&&energy>=connection.energy_cost;
 const emblem=(kind:SectorLocation['kind'])=>({station:'✦',wreck:'◇',planet:'●',anomaly:'◈'})[kind];
 return <div className="sector-shell">
  <div className="sector-chart">
   <div className="sector-mark"><strong>HATÁRVIDÉK / 001</strong><span>{t('MEGISMERT TÉRSÉGEK','DISCOVERED SITES')}: {found.size}/{locations.length}</span></div>
   <div className="sector-field" role="group" aria-label={t('Interaktív csillagtérkép','Interactive star map')}>
    <svg className="sector-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
     {paths.map(r=>{const a=locations.find(x=>x.id===r.origin_id),b=locations.find(x=>x.id===r.destination_id);if(!a||!b)return null;
      const reachable=r.origin_id===currentId||r.destination_id===currentId;
      return <g key={r.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={reachable?'reachable':''}/><circle cx={(a.x+b.x)/2} cy={(a.y+b.y)/2} r=".6" className={reachable?'reachable':''}/></g>})}
    </svg>
    {locations.map(l=><button type="button" key={l.id} title={found.has(l.id)?name(l)?.name:t('Ismeretlen helyszín','Unknown site')}
     aria-label={found.has(l.id)?name(l)?.name:t('Ismeretlen helyszín','Unknown site')}
     aria-pressed={selected===l.id} onClick={()=>setSelected(l.id)}
     className={'sector-node '+(l.id===currentId?'current ':'')+(selected===l.id?'selected ':'')+(!found.has(l.id)?'undiscovered':'')}
     style={{left:l.x+'%',top:l.y+'%'}}>
      <span className="sector-node-icon">{emblem(l.kind)}</span>
      <span className="sector-node-name">{found.has(l.id)?name(l)?.name:t('Felderítetlen','Uncharted')}</span>
     </button>)}
    <div className="sector-compass"><span>N</span><span>✣</span></div>
   </div>
   <div className="sector-scale"><span>GALAKTIKUS NAVIGÁCIÓ // SX-001</span><span>{t('A vonalak navigációs folyosók','Lines indicate navigable corridors')}</span></div>
  </div>
  <aside className="sector-detail">
   <small className="sector-overline">{t('KIVÁLASZTOTT CÉLPONT','SELECTED TARGET')}</small>
   <div className="sector-location-emblem">{chosen?emblem(chosen.kind):'◈'}</div>
   <h3>{known?name(chosen)?.name:t('Ismeretlen szektor','Unknown sector')}</h3>
   <div className="sector-kind">{chosen?({station:t('ŰRÁLLOMÁS','STATION'),wreck:t('RONCSMEZŐ','WRECK FIELD'),planet:t('BOLYGÓ','PLANET'),anomaly:t('ANOMÁLIA','ANOMALY')})[chosen.kind]:''}</div>
   <p>{known?name(chosen)?.description:t('A célpont részletei az első megérkezés után válnak ismertté.','Detailed readings are available after your first arrival.')}</p>
   <div className="sector-coordinates">X: {chosen?.x??'--'} // Y: {chosen?.y??'--'}</div>
   <div className="sector-distance">{chosen?.id===currentId?t('JELENLEGI POZÍCIÓ','CURRENT LOCATION'):connection?t('UTAZÁSI KÖLTSÉG','TRAVEL COST')+': ⚡ '+connection.energy_cost:t('NINCS KÖZVETLEN ÚTVONAL','NO DIRECT ROUTE')}</div>
   <button type="button" className="sector-travel" disabled={!canGo} onClick={()=>chosen&&onTravel(chosen.id)}>
    {busy?t('NAVIGÁCIÓ…','NAVIGATING…'):chosen?.id===currentId?t('ITT TARTÓZKODSZ','YOU ARE HERE'):connection&&energy<connection.energy_cost?t('NINCS ELÉG ENERGIA','INSUFFICIENT ENERGY'):t('UTAZÁS INDÍTÁSA','INITIATE TRAVEL')} <span>→</span>
   </button>
   <div className="sector-current"><small>{t('AKTUÁLIS HELYSZÍN','CURRENT LOCATION')}</small><strong>{name(current)?.name||'—'}</strong></div>
  </aside>
 </div>;
}