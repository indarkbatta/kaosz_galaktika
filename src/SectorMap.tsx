import {useEffect,useMemo,useState} from 'react';
import './sector-map.css';
export type SectorLocale={locale:string;name:string;description:string};
export type WorldGalaxy={id:string;slug:string;name_hu:string;name_en:string};
export type WorldQuadrant={id:string;galaxy_id:string;slug:string;name_hu:string;name_en:string;x:number;y:number};
export type WorldSector={id:string;quadrant_id:string;slug:string;name_hu:string;name_en:string;x:number;y:number};
export type SectorLocation={id:string;sector_id:string;slug:string;kind:'station'|'wreck'|'planet'|'anomaly';x:number;y:number;is_published:boolean;game_locations_i18n:SectorLocale[]};
export type SectorRoute={id:string;origin_id:string;destination_id:string;energy_cost:number;is_published:boolean};
export type SectorDiscovery={location_id:string;discovered_at:string};
type Level='galaxy'|'quadrant'|'sector';
export default function SectorMap({locale,galaxies,quadrants,sectors,locations,routes,discovered,currentId,energy,busy,shipReady=true,onTravel}:{
 locale:string;galaxies:WorldGalaxy[];quadrants:WorldQuadrant[];sectors:WorldSector[];
 locations:SectorLocation[];routes:SectorRoute[];discovered:SectorDiscovery[];
 currentId:string;energy:number;busy:boolean;shipReady?:boolean;onTravel:(target:string)=>void;
}){
 const en=locale==='en',t=(hu:string,eng:string)=>en?eng:hu;
 const current=locations.find(l=>l.id===currentId);
 const homeSector=sectors.find(s=>s.id===current?.sector_id);
 const homeQuadrant=quadrants.find(q=>q.id===homeSector?.quadrant_id);
 const homeGalaxy=galaxies.find(g=>g.id===homeQuadrant?.galaxy_id);
 const [level,setLevel]=useState<Level>('sector');
 const [selected,setSelected]=useState(currentId);
 const [galaxyId,setGalaxyId]=useState(homeGalaxy?.id||galaxies[0]?.id||'');
 const [quadrantId,setQuadrantId]=useState(homeQuadrant?.id||quadrants[0]?.id||'');
 const [sectorId,setSectorId]=useState(homeSector?.id||sectors[0]?.id||'');
 useEffect(()=>{
  if(!currentId)return;
  setSelected(currentId);
  if(homeSector)setSectorId(homeSector.id);
  if(homeQuadrant)setQuadrantId(homeQuadrant.id);
  if(homeGalaxy)setGalaxyId(homeGalaxy.id);
 },[currentId,homeSector?.id,homeQuadrant?.id,homeGalaxy?.id]);
 const chosen=locations.find(l=>l.id===selected);
 const inSector=locations.filter(l=>l.sector_id===sectorId);
 const found=useMemo(()=>new Set(discovered.map(x=>x.location_id).concat(currentId)),[discovered,currentId]);
 const paths=routes.filter(r=>inSector.some(l=>l.id===r.origin_id)&&inSector.some(l=>l.id===r.destination_id));
 const connection=level==='sector'?paths.find(r=>(r.origin_id===currentId&&r.destination_id===chosen?.id)||(r.destination_id===currentId&&r.origin_id===chosen?.id)):undefined;
 const name=(loc:SectorLocation|undefined)=>loc?.game_locations_i18n.find(x=>x.locale===(en?'en':'hu'))||loc?.game_locations_i18n.find(x=>x.locale==='hu');
 const display=(o:WorldGalaxy|WorldQuadrant|WorldSector|undefined)=>o?(en?o.name_en:o.name_hu):'—';
 const emblem=(kind:SectorLocation['kind'])=>({station:'✦',wreck:'◇',planet:'●',anomaly:'◈'})[kind];
 const known=chosen?found.has(chosen.id):false;
 const canGo=!!connection&&!busy&&shipReady&&energy>=connection.energy_cost&&chosen?.id!==currentId;
 const currentQuadrant=quadrants.find(q=>q.id===quadrantId);
 const currentSector=sectors.find(s=>s.id===sectorId);
 const visibleQuadrants=quadrants.filter(q=>q.galaxy_id===galaxyId);
 const visibleSectors=sectors.filter(s=>s.quadrant_id===quadrantId);
 const goGalaxy=(id:string)=>{setGalaxyId(id);setLevel('galaxy');};
 const goQuadrant=(id:string)=>{setQuadrantId(id);setLevel('quadrant');};
 const goSector=(id:string)=>{setSectorId(id);setLevel('sector');setSelected(locations.find(l=>l.sector_id===id)?.id||'');};
 return <div className="sector-shell">
  <div className="sector-chart">
   <div className="sector-mark"><strong>{t('CSILLAGTÉRKÉP','STAR CHART')}</strong>
    <span>{level==='galaxy'?t('KVADRÁNSOK','QUADRANTS'):level==='quadrant'?t('NAPRENDSZEREK','SOLAR SYSTEMS'):t('HELYSZÍNEK','LOCATIONS')}</span></div>
   <div className="sector-world-crumbs">
    <button type="button" className={level==='galaxy'?'active':''} onClick={()=>setLevel('galaxy')}>{display(galaxies.find(g=>g.id===galaxyId))}</button>
    <span>›</span>
    <button type="button" className={level==='quadrant'?'active':''} disabled={!quadrantId} onClick={()=>setLevel('quadrant')}>{display(currentQuadrant)}</button>
    <span>›</span>
    <button type="button" className={level==='sector'?'active':''} disabled={!sectorId} onClick={()=>setLevel('sector')}>{display(currentSector)}</button>
   </div>
   <div className="sector-field" role="group" aria-label={t('Interaktív csillagtérkép','Interactive star map')}>
    {level==='sector'&&<svg className="sector-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
     {paths.map(r=>{const a=inSector.find(x=>x.id===r.origin_id),b=inSector.find(x=>x.id===r.destination_id);if(!a||!b)return null;
      const reachable=r.origin_id===currentId||r.destination_id===currentId;
      return <g key={r.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={reachable?'reachable':''}/><circle cx={(a.x+b.x)/2} cy={(a.y+b.y)/2} r=".6" className={reachable?'reachable':''}/></g>;
     })}
    </svg>}
    {level==='galaxy'&&visibleQuadrants.map(q=><button key={q.id} type="button" title={display(q)} className="sector-node sector-world-node"
      style={{left:q.x+'%',top:q.y+'%'}} onClick={()=>goQuadrant(q.id)}>
      <span className="sector-node-icon">◈</span><span className="sector-node-name">{display(q)}</span></button>)}
    {level==='quadrant'&&visibleSectors.map(s=><button key={s.id} type="button" title={display(s)} className="sector-node sector-world-node"
      style={{left:s.x+'%',top:s.y+'%'}} onClick={()=>goSector(s.id)}>
      <span className="sector-node-icon">✺</span><span className="sector-node-name">{display(s)}</span></button>)}
    {level==='sector'&&inSector.map(l=><button type="button" key={l.id} title={found.has(l.id)?name(l)?.name:t('Ismeretlen helyszín','Unknown site')}
     aria-label={found.has(l.id)?name(l)?.name:t('Ismeretlen helyszín','Unknown site')}
     aria-pressed={selected===l.id} onClick={()=>setSelected(l.id)}
     className={'sector-node '+(l.id===currentId?'current ':'')+(selected===l.id?'selected ':'')+(!found.has(l.id)?'undiscovered':'')}
     style={{left:l.x+'%',top:l.y+'%'}}>
      <span className="sector-node-icon">{emblem(l.kind)}</span>
      <span className="sector-node-name">{found.has(l.id)?name(l)?.name:t('Felderítetlen','Uncharted')}</span>
     </button>)}
    <div className="sector-compass"><span>N</span><span>✣</span></div>
   </div>
   <div className="sector-scale"><span>{level==='galaxy'?t('Válassz kvadránst','Select quadrant'):level==='quadrant'?t('Válassz szektort','Select sector'):t('A vonalak navigációs folyosók','Lines indicate navigable corridors')}</span><span>{level==='sector'?inSector.length:level==='quadrant'?visibleSectors.length:visibleQuadrants.length}</span></div>
  </div>
  <aside className="sector-detail">
   <small className="sector-overline">{level==='sector'?t('KIVÁLASZTOTT HELYSZÍN','SELECTED LOCATION'):t('GALAKTIKUS NAVIGÁCIÓ','GALACTIC NAVIGATION')}</small>
   {level!=='sector'?<>
    <div className="sector-location-emblem">✦</div><h3>{level==='galaxy'?display(galaxies.find(g=>g.id===galaxyId)):display(currentQuadrant)}</h3>
    <p>{level==='galaxy'?t('Válassz egy kvadránst a galaktikus térképen.','Select a quadrant on the galactic chart.'):t('Válassz egy naprendszert. Egy szektorban több különálló helyszín lehet.','Select a star system. A sector can contain several distinct locations.')}</p>
    {level==='galaxy'&&<select className="sector-world-select" aria-label={t('Galaxis','Galaxy')} value={galaxyId} onChange={e=>goGalaxy(e.target.value)}>{galaxies.map(g=><option key={g.id} value={g.id}>{display(g)}</option>)}</select>}
    <p className="sector-jump-note">{t('A jumpgate-es kvadránsváltás egy következő fejlesztési lépés.','Inter-quadrant jumpgate travel is a later feature.')}</p>
   </>:<>
    <div className="sector-location-emblem">{chosen?emblem(chosen.kind):'◈'}</div>
    <h3>{known?name(chosen)?.name:t('Ismeretlen helyszín','Unknown location')}</h3>
    <div className="sector-kind">{chosen?({station:t('ŰRÁLLOMÁS','STATION'),wreck:t('RONCSMEZŐ','WRECK FIELD'),planet:t('BOLYGÓ','PLANET'),anomaly:t('ANOMÁLIA','ANOMALY')})[chosen.kind]:''}</div>
    <p>{known?name(chosen)?.description:t('A célpont részletei az első megérkezés után válnak ismertté.','Details are revealed after your first visit.')}</p>
    <div className="sector-coordinates">X: {chosen?.x??'--'} // Y: {chosen?.y??'--'}</div>
    <div className="sector-distance">{chosen?.id===currentId?t('JELENLEGI POZÍCIÓ','CURRENT LOCATION'):connection?t('UTAZÁSI KÖLTSÉG','TRAVEL COST')+': ⚡ '+connection.energy_cost:t('NINCS KÖZVETLEN ÚTVONAL','NO DIRECT ROUTE')}</div>
    <button type="button" className="sector-travel" disabled={!canGo} onClick={()=>chosen&&onTravel(chosen.id)}>
     {!shipReady?t('A HAJÓ NEM ÜZEMKÉPES','SHIP NOT OPERATIONAL'):busy?t('NAVIGÁCIÓ…','NAVIGATING…'):chosen?.id===currentId?t('ITT TARTÓZKODSZ','YOU ARE HERE'):connection&&energy<connection.energy_cost?t('NINCS ELÉG ENERGIA','INSUFFICIENT ENERGY'):t('UTAZÁS INDÍTÁSA','INITIATE TRAVEL')} <span>→</span>
    </button>
   </>}
   <div className="sector-current"><small>{t('AKTUÁLIS HELYSZÍN','CURRENT LOCATION')}</small><strong>{name(current)?.name||'—'}</strong>
    <small>{display(homeSector)} · {display(homeQuadrant)}</small>
    {level!=='sector'&&<button type="button" className="sector-world-select" onClick={()=>{if(homeGalaxy)setGalaxyId(homeGalaxy.id);if(homeQuadrant)setQuadrantId(homeQuadrant.id);if(homeSector)goSector(homeSector.id);}}>{t('Vissza a jelenlegi naprendszerhez','Return to current system')}</button>}
   </div>
  </aside>
 </div>;
}
