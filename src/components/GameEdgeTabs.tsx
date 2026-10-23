import {Radar,Swords,Map,UserRound,Rocket,Beer,Package,BookOpen,Backpack,type LucideIcon} from 'lucide-react';
import {useRef,type KeyboardEvent} from 'react';

/** Main player navigation: the tabs deliberately protrude OUTSIDE the game window. */
export type GameTab='bridge'|'combat'|'map'|'character'|'ship'|'cantina'|'inventory'|'loadout'|'log';
type TabDefinition={id:GameTab;hu:string;en:string;symbol:string};
export const gameTabs:readonly TabDefinition[]=[
 {id:'bridge',hu:'Híd',en:'Bridge',symbol:'bridge'},
 {id:'combat',hu:'Harc',en:'Combat',symbol:'combat'},
 {id:'map',hu:'Térkép',en:'Map',symbol:'map'},
 {id:'character',hu:'Karakter',en:'Character',symbol:'character'},
 {id:'ship',hu:'Hajó',en:'Ship',symbol:'ship'},
 {id:'cantina',hu:'Kantin',en:'Cantina',symbol:'cantina'},
 {id:'loadout',hu:'Loadout',en:'Loadout',symbol:'loadout'},
 {id:'inventory',hu:'Raktér',en:'Cargo',symbol:'inventory'},
 {id:'log',hu:'Napló',en:'Log',symbol:'log'}
];
const icons:Record<string,LucideIcon>={bridge:Radar,combat:Swords,map:Map,character:UserRound,ship:Rocket,cantina:Beer,inventory:Package,log:BookOpen,loadout:Backpack};
function TabIcon({type}:{type:string}){const Icon=icons[type];return <Icon size={22} strokeWidth={1.75} aria-hidden="true"/>}
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
