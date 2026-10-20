export type EditorSection='species'|'classes'|'skills'|'gameplay'|'sector'|'items'|'crew'|'ships';
const sections:{id:EditorSection;icon:string;hu:string;en:string}[]=[
{id:'species',icon:'◈',hu:'Fajok',en:'Species'},
{id:'classes',icon:'✥',hu:'Kasztok',en:'Classes'},
{id:'skills',icon:'✧',hu:'Képességek',en:'Skills'},
{id:'gameplay',icon:'⚙',hu:'Akciók és szabályok',en:'Actions & rules'},
{id:'sector',icon:'✦',hu:'Szektorok',en:'Sectors'},
{id:'items',icon:'⚒',hu:'Tárgyak',en:'Items'},
{id:'crew',icon:'♟',hu:'Legénység',en:'Crew'},
{id:'ships',icon:'◇',hu:'Hajók',en:'Ships'}];
/** Top-level editor navigation; detail navigation belongs to EditorTabs. */
export function EditorNavigation({locale,active,onSelect,onBack,counts}:{
 locale:string; active:EditorSection; onSelect:(section:EditorSection)=>void;
 onBack:()=>void; counts?:Partial<Record<EditorSection,number>>;
}){
 const isEn=locale==='en';
 return <nav className="ed-nav" aria-label={isEn?'Editor sections':'Szerkesztők'}>
  <h2>{isEn?'Editor dashboard':'Szerkesztői vezérlőpult'}</h2>
  <button type="button" className="ed-nav-exit" onClick={onBack}>⌂ <span>{isEn?'Return to game':'Vissza a játékhoz'}</span></button>
  <div className="ed-nav-section-label">{isEn?'EDITORS':'SZERKESZTŐK'}</div>
  {sections.map(({id,icon,hu,en})=><button key={id} type="button"
    aria-current={active===id?'page':undefined} className={active===id?'active':''}
    onClick={()=>{if(active!==id)onSelect(id);}}>
    <span className="ed-nav-icon" aria-hidden="true">{icon}</span>
    <span className="ed-nav-label">{isEn?en:hu}</span>
    {counts?.[id]!==undefined&&<span className="ed-nav-count">{counts[id]}</span>}
  </button>)}
  <div className="ed-nav-bottom"><span className="ed-online"/> EDITOR <p>SPACE D6 FREE</p></div>
 </nav>;
}
