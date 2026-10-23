import {useEffect,useState,type ReactNode} from 'react';

export type EditorSection=
 'species'|'classes'|'skills'|'crew'|'crew-classes'|'galaxy'|'sector'|'factions'|'items'|'ships'|
 'gameplay'|'challenges'|'powers'|'talents'|'enemies'|'encounters'|
 'combat-rules'|'balance'|'languages'|'combat'|'salvage'|'talent-trees';

type GroupId='characters'|'world'|'equipment'|'gameplay'|'combat'|'system';
type MenuItem={id:EditorSection;icon:string;hu:string;en:string};
type MenuGroup={id:GroupId;icon:string;hu:string;en:string;items:MenuItem[]};

const groups:MenuGroup[]=[
 {id:'characters',icon:'users',hu:'Karakterek',en:'Characters',items:[
  {id:'species',icon:'dna',hu:'Fajok',en:'Species'},
  {id:'classes',icon:'shield',hu:'Kasztok',en:'Classes'},
  {id:'skills',icon:'sparkles',hu:'Skillek',en:'Skills'},
  {id:'talent-trees',icon:'git-branch',hu:'Talentfák',en:'Talent trees'},
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
  {id:'encounters',icon:'crosshair',hu:'Encounterek',en:'Encounters'},
  {id:'enemies',icon:'skull',hu:'Ellenségek',en:'Enemies'},
  {id:'powers',icon:'zap',hu:'Powerek',en:'Powers'},
  {id:'talents',icon:'git-branch',hu:'Talentek',en:'Talents'},
  {id:'combat-rules',icon:'sliders',hu:'Harci szabályok',en:'Combat rules'}]},
 {id:'system',icon:'settings',hu:'Rendszer',en:'System',items:[
  {id:'balance',icon:'gauge',hu:'Globális beállítások (energia / XP)',en:'Global settings (energy / XP)'},
  {id:'languages',icon:'languages',hu:'Szótár és nyelvek',en:'Dictionary & languages'}]}
];

const art:Record<string,ReactNode>={
 users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
 orbit:<><circle cx="12" cy="12" r="3"/><path d="M3 12c0-4.4 4-8 9-8s9 3.6 9 8-4 8-9 8-9-3.6-9-8Z"/><path d="M4.4 4.4c-3.2 3.2-1.4 9.8 4 15.2s12 7.2 15.2 4"/></>,
 package:<><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9"/></>,
 gamepad:<><path d="M6.4 9h11.2a4 4 0 0 1 3.8 2.7l1.2 5A3 3 0 0 1 17.8 20l-2.7-2H8.9l-2.7 2a3 3 0 0 1-4.8-3.3l1.2-5A4 4 0 0 1 6.4 9Z"/><path d="M7 12v5m-2.5-2.5h5M15.5 13h.01M18 15h.01"/></>,
 swords:<><path d="m14.5 17.5 3-3L4 1 1 4l13.5 13.5ZM13 19l6 4 4-4-4-6M10 15l-5 6-3-3 6-5M12 4l4-3 7 7-3 4"/></>,
 settings:<><path d="M12 8v8M8 12h8"/><circle cx="12" cy="12" r="9"/></>,
 dna:<><path d="M2 3c7 0 13 18 20 18M22 3C15 3 9 21 2 21M4 7h16M5 17h14M9 12h6"/></>,
 shield:<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/>,
 sparkles:<><path d="m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7ZM19 2v4M17 4h4"/></>,
 'user-round':<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
 globe:<><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a17 17 0 0 1 0 20M12 2a17 17 0 0 0 0 20"/></>,
 'map-pin':<><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
 flag:<><path d="M4 22V4m0 0c6-4 10 4 16 0v12c-6 4-10-4-16 0"/></>,
 box:<><path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9"/></>,
 rocket:<><path d="M4.5 16.5c-2 1.5-2 4-2 4s2.5 0 4-2M9 15l-4-4c2.5-6 8-9 16-9 0 8-3 13.5-9 16l-4-4ZM14 10l-4 4"/><circle cx="16" cy="8" r="2"/></>,
 'list-checks':<><path d="m3 7 2 2 4-4M12 7h9M3 17l2 2 4-4M12 17h9"/></>,
 dice:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r=".8"/><circle cx="16" cy="16" r=".8"/><circle cx="12" cy="12" r=".8"/></>,
 crosshair:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/></>,
 skull:<><path d="M12 2a8 8 0 0 0-8 8v4l2 3v4h12v-4l2-3v-4a8 8 0 0 0-8-8Z"/><path d="M9 21v-3m6 3v-3"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/></>,
 zap:<path d="m13 2-3 8H3l8 12 3-8h7L13 2Z"/>,
 'git-branch':<><circle cx="6" cy="3" r="2"/><circle cx="6" cy="21" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 5v14M18 8a9 9 0 0 1-9 9H6"/></>,
 sliders:<><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></>,
 gauge:<><path d="M4 17a9 9 0 1 1 16 0M12 14l4-5"/><circle cx="12" cy="14" r="1"/></>,
 languages:<><path d="m5 8 6 10M4 17l7-9M2 12h12M8 3v4M16 20l3-8 3 8m-5-3h4"/></>
};
function NavIcon({name}:{name:string}){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{art[name]}</svg>}
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
      <NavIcon name={group.icon}/><span>{isEn?group.en:group.hu}</span><svg className={'ed-nav-chevron'+(opened?' open':'')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
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
