import {Users,Orbit,Package,Gamepad2,Swords,Settings,Dna,Shield,Sparkles,UserRound,Globe,MapPin,Flag,Box,Rocket,ListChecks,Dices,Crosshair,Skull,Zap,GitBranch,SlidersHorizontal,Gauge,Languages,ChevronRight,type LucideIcon} from 'lucide-react';
import {useEffect,useState} from 'react';

export type EditorSection=
 'combat-visuals'|'expedition-companions'|'species'|'classes'|'skills'|'crew'|'crew-classes'|'galaxy'|'sector'|'factions'|'items'|'ships'|
 'gameplay'|'challenges'|'powers'|'talents'|'enemies'|'encounters'|
 'ui-layout'|'combat-rules'|'balance'|'languages'|'combat'|'salvage'|'talent-trees';

type GroupId='characters'|'world'|'equipment'|'gameplay'|'combat'|'system';
type MenuItem={id:EditorSection;icon:string;hu:string;en:string};
type MenuGroup={id:GroupId;icon:string;hu:string;en:string;items:MenuItem[]};

const groups:MenuGroup[]=[
 {id:'characters',icon:'users',hu:'Karakterek',en:'Characters',items:[
  {id:'species',icon:'dna',hu:'Fajok',en:'Species'},
  {id:'classes',icon:'shield',hu:'Kasztok',en:'Classes'},
  {id:'skills',icon:'sparkles',hu:'Skillek',en:'Skills'},
  {id:'talent-trees',icon:'git-branch',hu:'Talentfák',en:'Talent trees'},
  {id:'expedition-companions',icon:'users',hu:'Expedíciós társak',en:'Expedition companions'},
  {id:'crew-classes',icon:'shield',hu:'Legénységi kasztok',en:'Crew classes'},
  {id:'crew',icon:'user-round',hu:'Legénységi sablonok',en:'Crew templates'}]},
 {id:'world',icon:'orbit',hu:'Világ',en:'World',items:[
  {id:'galaxy',icon:'globe',hu:'Galaxis és quadránsok',en:'Galaxy & quadrants'},
  {id:'sector',icon:'map-pin',hu:'Szektorok és helyszínek',en:'Sectors & locations'},
  {id:'factions',icon:'flag',hu:'Frakciók',en:'Factions'}]},
 {id:'equipment',icon:'package',hu:'Felszerelés és gazdaság',en:'Equipment & economy',items:[
  {id:'items',icon:'box',hu:'Tárgyak',en:'Items'},
  {id:'ships',icon:'rocket',hu:'Hajók és modulok',en:'Ships & modules'}]},
 {id:'gameplay',icon:'gamepad',hu:'Játékmenet',en:'Gameplay',items:[
  {id:'gameplay',icon:'list-checks',hu:'Aktivitások és zsákmány',en:'Activities & loot'},
  {id:'challenges',icon:'dice',hu:'Skill challenge-ek',en:'Skill challenges'},
  {id:'salvage',icon:'map-pin',hu:'Roncskutatás',en:'Salvage exploration'}]},
 {id:'combat',icon:'swords',hu:'Harc',en:'Combat',items:[
  {id:'combat-visuals',icon:'users',hu:'Harci megjelenítés',en:'Combat appearance'},
  {id:'encounters',icon:'crosshair',hu:'Encounterek',en:'Encounters'},
  {id:'enemies',icon:'skull',hu:'Ellenségek',en:'Enemies'},
  {id:'powers',icon:'zap',hu:'Powerek',en:'Powers'},
  {id:'talents',icon:'git-branch',hu:'Talentek',en:'Talents'},
  {id:'combat-rules',icon:'sliders',hu:'Harci szabályok',en:'Combat rules'}]},
 {id:'system',icon:'settings',hu:'Rendszer',en:'System',items:[
  {id:'ui-layout',icon:'sliders',hu:'Felületszerkesztő',en:'UI layout editor'},
  {id:'balance',icon:'gauge',hu:'Globális beállítások (energia / XP)',en:'Global settings (energy / XP)'},
  {id:'languages',icon:'languages',hu:'Szótár és nyelvek',en:'Dictionary & languages'}]}
];

const icons:Record<string,LucideIcon>={users:Users,orbit:Orbit,package:Package,gamepad:Gamepad2,swords:Swords,settings:Settings,dna:Dna,shield:Shield,sparkles:Sparkles,'user-round':UserRound,globe:Globe,'map-pin':MapPin,flag:Flag,box:Box,rocket:Rocket,'list-checks':ListChecks,dice:Dices,crosshair:Crosshair,skull:Skull,zap:Zap,'git-branch':GitBranch,sliders:SlidersHorizontal,gauge:Gauge,languages:Languages};
function NavIcon({name}:{name:string}){const Icon=icons[name];return <Icon size={18} strokeWidth={1.8} aria-hidden="true"/>}
function groupOf(section:EditorSection):GroupId{return groups.find(group=>group.items.some(item=>item.id===section))?.id??'combat';}

/** Shared two-level navigation. Group headers ONLY expand; leaf buttons navigate. */
export function EditorNavigation({locale,active,onSelect,onBack,counts}:{
 locale:string;active:EditorSection;onSelect:(section:EditorSection)=>void;
 onBack:()=>void;counts?:Partial<Record<EditorSection,number>>;
}){
 const isEn=locale==='en';
 const [expanded,setExpanded]=useState<GroupId|null>(()=>groupOf(active));
 useEffect(()=>{setExpanded(groupOf(active));},[active]);
 return <nav className="ed-nav" aria-label={isEn?'Editor sections':'Szerkesztők'}>
  <h2>{isEn?'Editor dashboard':'Szerkesztői vezérlőpult'}</h2>
  <button type="button" className="ed-nav-exit" onClick={onBack}><NavIcon name="globe"/><span>{isEn?'Return to game':'Vissza a játékhoz'}</span></button>
  <div className="ed-nav-groups">
   {groups.map(group=>{
    const opened=expanded===group.id;
    const selected=group.items.some(item=>item.id===active);
    return <section className={'ed-nav-group'+(selected?' is-selected':'')} key={group.id}>
     <button type="button" className="ed-nav-group-trigger" aria-expanded={opened} aria-controls={'ed-group-'+group.id} onClick={()=>setExpanded(opened?null:group.id)}>
      <NavIcon name={group.icon}/><span>{isEn?group.en:group.hu}</span><ChevronRight className={'ed-nav-chevron'+(opened?' open':'')} size={16} aria-hidden="true"/>
     </button>
     <div className="ed-nav-children" id={'ed-group-'+group.id} hidden={!opened}>
      {group.items.map(item=><button key={item.id} type="button" className={'ed-nav-leaf'+(active===item.id?' active':'')} aria-current={active===item.id?'page':undefined} onClick={()=>{if(active!==item.id)onSelect(item.id);}}>
       <span className="ed-nav-icon"><NavIcon name={item.icon}/></span>
       <span className="ed-nav-label">{isEn?item.en:item.hu}</span>
       {counts?.[item.id]!==undefined&&<span className="ed-nav-count">{counts[item.id]}</span>}
      </button>)}
     </div>
    </section>;
   })}
  </div>
  <div className="ed-nav-bottom"><span className="ed-online"/> EDITOR <p>SPACE D6 FREE</p></div>
 </nav>;
}
