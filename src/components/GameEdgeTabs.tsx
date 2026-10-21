import {useRef,type ReactNode,type KeyboardEvent} from 'react';

/** Main player navigation: the tabs deliberately protrude OUTSIDE the game window. */
export type GameTab='bridge'|'combat'|'map'|'character'|'ship'|'cantina'|'inventory'|'log';
type TabDefinition={id:GameTab;hu:string;en:string;symbol:string};
export const gameTabs:readonly TabDefinition[]=[
 {id:'bridge',hu:'Híd',en:'Bridge',symbol:'bridge'},
 {id:'combat',hu:'Harc',en:'Combat',symbol:'combat'},
 {id:'map',hu:'Térkép',en:'Map',symbol:'map'},
 {id:'character',hu:'Karakter',en:'Character',symbol:'character'},
 {id:'ship',hu:'Hajó',en:'Ship',symbol:'ship'},
 {id:'cantina',hu:'Kantin',en:'Cantina',symbol:'cantina'},
 {id:'inventory',hu:'Raktér',en:'Cargo',symbol:'inventory'},
 {id:'log',hu:'Napló',en:'Log',symbol:'log'}
];
const drawings:Record<string,ReactNode>={
 bridge:<><path d="M4 20h16M7 16h10M12 4v12M9 9h6M8 16l-2 4M16 16l2 4"/><path d="m7 8 5-5 5 5"/></>,
 combat:<><path d="m14.5 17.5 3-3L4 1 1 4l13.5 13.5Z"/><path d="M13 19l6 4 4-4-4-6M10 15l-5 6-3-3 6-5M19 1 5 15"/></>,
 map:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6"/></>,
 character:<><circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
 ship:<><path d="m4 17 3-7 8-8 7 7-8 8-7 3-3-3Z"/><path d="M15 9h.01M7 20l-3 2 1-5M3 13l1-6 5-2M11 21l6-1 2-5"/></>,
 cantina:<><path d="M5 7h13v8a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5V7ZM18 9h2a3 3 0 0 1 0 6h-2M3 22h17M7 3v2M12 2v3M17 3v2"/></>,
 inventory:<><path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/></>,
 log:<><path d="M5 2h11l4 4v16H5V2ZM16 2v5h4M9 11h7M9 15h7M9 19h5"/></>
};
function TabIcon({type}:{type:string}){return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{drawings[type]}</svg>}
export default function GameEdgeTabs({locale,active,onChange}:{locale:string;active:GameTab;onChange:(next:GameTab)=>void}){
 const en=locale==='en';
 const refs=useRef<Array<HTMLButtonElement|null>>([]);
 const keyNav=(e:KeyboardEvent<HTMLButtonElement>,i:number)=>{
  const last=gameTabs.length-1;
  const next=e.key==='ArrowDown'?(i+1)%gameTabs.length:e.key==='ArrowUp'?(i+last)%gameTabs.length:e.key==='Home'?0:e.key==='End'?last:null;
  if(next===null)return;
  e.preventDefault();onChange(gameTabs[next].id);refs.current[next]?.focus();
 };
 return <nav className="cmd-edge-tabs" role="tablist" aria-label={en?'Game navigation':'Játék navigáció'} aria-orientation="vertical">
  {gameTabs.map((item,index)=><button key={item.id} ref={el=>{refs.current[index]=el;}} id={'cmd-tab-'+item.id} className={'cmd-edge-tab'+(active===item.id?' active':'')} role="tab" aria-controls="cmd-tab-panel" aria-selected={active===item.id} tabIndex={active===item.id?0:-1} title={en?item.en:item.hu} type="button" onKeyDown={e=>keyNav(e,index)} onClick={()=>onChange(item.id)}>
   <span className="cmd-edge-icon"><TabIcon type={item.symbol}/></span><span className="cmd-edge-label">{en?item.en:item.hu}</span>
  </button>)}
 </nav>;
}
