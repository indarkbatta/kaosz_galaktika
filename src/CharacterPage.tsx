import {useEffect,useMemo,useState} from 'react';
import {supabase} from './lib/supabase';
import {attributes,calculateAttributes,remainingPoints,toDice,type Attribute} from './lib/d6';
import './character.css';
type Base={id:string;slug:string;image_path:string|null;primary_attribute:Attribute;secondary_attribute:Attribute;game_species_i18n?:{locale:string;name:string;description:string}[];game_classes_i18n?:{locale:string;name:string;description:string}[];game_species_skill_bonuses?:{skill_id:string;bonus_pips:number}[];game_classes_skill_bonuses?:{skill_id:string;bonus_pips:number}[]};
type Ship={id:string;slug:string;image_path:string|null;hull:number;cargo:number;speed:number;game_starter_ships_i18n:{locale:string;name:string;description:string}[]};
type Skill={id:string;attribute:Attribute;slug:string;icon_path:string|null;game_skills_i18n:{locale:string;name:string}[]};
type Rules={base_attribute_pips:number;free_attribute_pips:number;max_attribute_pips:number;free_skill_pips:number;max_allocated_skill_pips:number};
type Captain={id:string;captain_name:string;species_id:string;class_id:string;starter_ship_id:string;attribute_pips:Record<string,number>;skill_bonus_pips:Record<string,number>};
const names={hu:{body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'},en:{body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'}};
const t=(en:boolean,hu:string,english:string)=>en?english:hu;
const src=(path:string|null)=>path?.startsWith('hatarvilag/')?'https://assets.voidnoir.net/'+path:undefined;
export default function CharacterPage({locale}:{locale:string}){
 const en=locale==='en',l=en?'en':'hu';
 const [species,setSpecies]=useState<Base[]>([]),[classes,setClasses]=useState<Base[]>([]);
 const [ships,setShips]=useState<Ship[]>([]),[skills,setSkills]=useState<Skill[]>([]);
 const [rules,setRules]=useState<Rules|null>(null),[captain,setCaptain]=useState<Captain|null>(null);
 const [crew,setCrew]=useState<{position:string;name:string}[]>([]);
 const [speciesId,setSpeciesId]=useState(''),[classId,setClassId]=useState(''),[shipId,setShipId]=useState('');
 const [name,setName]=useState(''),[attr,setAttr]=useState<Record<string,number>>({}),[skillPts,setSkillPts]=useState<Record<string,number>>({});
 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;const load=async()=>{
  const [s,c,sh,sk,r,ch]=await Promise.all([
   supabase.from('game_species').select('id,slug,image_path,primary_attribute,secondary_attribute,game_species_i18n(locale,name,description),game_species_skill_bonuses(skill_id,bonus_pips)').eq('is_published',true),
   supabase.from('game_classes').select('id,slug,image_path,primary_attribute,secondary_attribute,game_classes_i18n(locale,name,description),game_classes_skill_bonuses(skill_id,bonus_pips)').eq('is_published',true),
   supabase.from('game_starter_ships').select('id,slug,image_path,hull,cargo,speed,game_starter_ships_i18n(locale,name,description)').eq('is_published',true),
   supabase.from('game_skills').select('id,slug,attribute,icon_path,game_skills_i18n(locale,name)').order('attribute').order('position'),
   supabase.from('game_rules').select('*').eq('id',1).single(),
   supabase.from('characters').select('id,captain_name,species_id,class_id,starter_ship_id,attribute_pips,skill_bonus_pips').maybeSingle()
  ]);
  if(!active)return;
  const problem=s.error||c.error||sh.error||sk.error||r.error||ch.error;
  if(problem){setError(problem.message);setLoading(false);return;}
  setSpecies(s.data as unknown as Base[]);setClasses(c.data as unknown as Base[]);
  setShips(sh.data as unknown as Ship[]);setSkills(sk.data as unknown as Skill[]);setRules(r.data as Rules);
  setSpeciesId(s.data?.[0]?.id||'');setClassId(c.data?.[0]?.id||'');setShipId(sh.data?.[0]?.id||'');
  if(ch.data){
   setCaptain(ch.data as Captain);
   const cr=await supabase.from('character_crew').select('position,name').eq('character_id',ch.data.id);
   if(active&&!cr.error)setCrew(cr.data||[]);
  }
  setLoading(false);
 };void load();return()=>{active=false};},[]);
 const speciesSelected=species.find(s=>s.id===speciesId),classSelected=classes.find(c=>c.id===classId);
 const currentStats=useMemo(()=>rules&&speciesSelected&&classSelected?calculateAttributes(rules.base_attribute_pips,attr,speciesSelected,classSelected):{},[rules,speciesSelected,classSelected,attr]);
 const attrRemaining=rules?remainingPoints(rules.free_attribute_pips,attr):0,skillRemaining=rules?remainingPoints(rules.free_skill_pips,skillPts):0;
 const skillBonus=(id:string)=> (speciesSelected?.game_species_skill_bonuses||[]).filter(b=>b.skill_id===id).reduce((n,b)=>n+b.bonus_pips,0)+(classSelected?.game_classes_skill_bonuses||[]).filter(b=>b.skill_id===id).reduce((n,b)=>n+b.bonus_pips,0);
 const localized=(arr:{locale:string;name:string;description?:string}[]|undefined)=>arr?.find(x=>x.locale===l)||arr?.find(x=>x.locale==='hu');
 const chooseStat=(a:string,delta:number)=>{
  if(!rules)return;
  const prev=attr[a]||0,next=prev+delta;if(next<0||next>rules.free_attribute_pips||next>rules.max_attribute_pips)return;
  if(delta>0&&attrRemaining<delta)return;
  const value=currentStats[a]||0;if(delta>0&&value+delta>rules.max_attribute_pips)return;
  setAttr(p=>({...p,[a]:next}));
 };
 const chooseSkill=(id:string,delta:number)=>{
  if(!rules)return;const next=(skillPts[id]||0)+delta;
  if(next<0||next>rules.max_allocated_skill_pips||(delta>0&&skillRemaining<delta))return;
  setSkillPts(p=>({...p,[id]:next}));
 };
 const create=async()=>{
  if(!rules||!speciesSelected||!classSelected||attrRemaining!==0||skillRemaining!==0||name.trim().length<2)return;
  setBusy(true);setError('');
  const {error}=await supabase.rpc('create_captain',{
   p_name:name.trim(),p_species:speciesId,p_class:classId,p_ship:shipId,p_attribute_points:attr,p_skill_points:skillPts
  });
  if(error)setError(error.message);else{
   const {data}=await supabase.from('characters').select('id,captain_name,species_id,class_id,starter_ship_id,attribute_pips,skill_bonus_pips').single();
   if(data){setCaptain(data as Captain);const cr=await supabase.from('character_crew').select('position,name').eq('character_id',data.id);if(!cr.error)setCrew(cr.data||[]);}
  }
  setBusy(false);
 };
 if(loading)return <section className="ch-card">{t(en,'Karakteradatok betöltése…','Loading captain data…')}</section>;
 if(error&&!rules)return <section className="ch-card ch-error">{error}</section>;
 if(captain){const race=species.find(x=>x.id===captain.species_id),klass=classes.find(x=>x.id===captain.class_id),ship=ships.find(x=>x.id===captain.starter_ship_id);
 return <div className="ch-card"><div className="ch-eyebrow">{t(en,'PARANCSNOKI ADATLAP','CAPTAIN RECORD')}</div><h2>{captain.captain_name}</h2>
  <div className="ch-summary">
   <div className="ch-summary-portraits">{[race,klass].map((v,i)=><div key={i}>{v?.image_path&&<img alt="" src={src(v.image_path)}/>}<strong>{v?localized(i===0?v.game_species_i18n:v.game_classes_i18n)?.name:''}</strong></div>)}</div>
   <div>{attributes.map(a=><div className="ch-stat" key={a}><span>{names[l][a]}</span><b>{toDice(captain.attribute_pips[a]||3)}</b></div>)}</div>
  </div>
  <h3>{t(en,'Kezdő űrhajó és legénység','Starter ship & crew')}</h3><p>{ship?localized(ship.game_starter_ships_i18n)?.name:'—'} · {ship?.hull} HP / {ship?.cargo} cargo / {ship?.speed} speed</p>
  {crew.map(c=><p key={c.position}>{c.position==='pilot'?t(en,'Pilóta','Pilot'):t(en,'Navigátor','Navigator')}: {c.name}</p>)}
  <p className="ch-muted">{t(en,'A játék akciói és az energiaregeneráció a következő fejlesztési szakaszban érkeznek.','Gameplay actions and energy regeneration are coming in a future milestone.')}</p>
 </div>}
 const stageNames=en?['Species','Class','Captain','Attributes','Skills','Starship','Confirm']:['Faj','Kaszt','Kapitány','Tulajdonságok','Skillek','Űrhajó','Véglegesítés'];
 const choiceCards=(choices:Base[],picked:string,onPick:(v:string)=>void,isClass:boolean)=><div className="ch-options">{choices.map(item=><button key={item.id} className={'ch-option '+(picked===item.id?'active':'')} onClick={()=>onPick(item.id)}>
   <div className="ch-option-picture">{item.image_path?<img src={src(item.image_path)} alt=""/>:'◈'}</div>
   <strong>{localized(isClass?item.game_classes_i18n:item.game_species_i18n)?.name||item.slug}</strong>
   <small>+1D {names[l][item.primary_attribute]} · +1 {names[l][item.secondary_attribute]}</small>
 </button>)}</div>;
 return <section className="ch-card"><div className="ch-eyebrow">{t(en,'KARAKTERGENERÁLÁS','CHARACTER CREATION')} / SPACE D6</div>
  <h2>{stageNames[step]}</h2>
  <div className="ch-steps">{stageNames.map((s,i)=><button type="button" className={i===step?'active':''} key={s} onClick={()=>setStep(i)}>{i+1}. {s}</button>)}</div>
  {step===0&&choiceCards(species,speciesId,setSpeciesId,false)}
  {step===1&&choiceCards(classes,classId,setClassId,true)}
  {step===2&&<div className="ch-fields"><label>{t(en,'A kapitány neve','Captain name')}<input maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder={t(en,'Adj nevet a karakterednek','Name your captain')}/></label></div>}
  {step===3&&<><p className="ch-muted">{t(en,'Kiosztható pip-pontok','Assignable pips')}: <b>{attrRemaining}</b></p>
   {attributes.map(a=><div key={a} className="ch-stat"><span>{names[l][a]}</span><button onClick={()=>chooseStat(a,-1)} disabled={!(attr[a]||0)}>−</button><b>{toDice(currentStats[a]||3)}</b><button onClick={()=>chooseStat(a,1)} disabled={attrRemaining===0}>＋</button></div>)}</>}
  {step===4&&<><p className="ch-muted">{t(en,'Kiosztható skillpip-ek','Assignable skill pips')}: <b>{skillRemaining}</b></p>
    <div className="ch-skill-grid">{skills.map(s=><div key={s.id} className="ch-skill"><img src={src(s.icon_path)} alt=""/><span>{localized(s.game_skills_i18n.map(x=>({...x,description:''})))?.name||s.slug}</span>
    <button onClick={()=>chooseSkill(s.id,-1)} disabled={!(skillPts[s.id]||0)}>−</button><b>{toDice((skillPts[s.id]||0)+skillBonus(s.id))}</b><button onClick={()=>chooseSkill(s.id,1)} disabled={skillRemaining===0}>＋</button></div>)}</div></>}
  {step===5&&<div className="ch-options">{ships.map(s=><button key={s.id} className={'ch-option '+(shipId===s.id?'active':'')} onClick={()=>setShipId(s.id)}>
    <div className="ch-ship-symbol">✦</div><strong>{localized(s.game_starter_ships_i18n)?.name||s.slug}</strong>
    <small>HP {s.hull} · {t(en,'Raktér','Cargo')} {s.cargo} · {t(en,'Sebesség','Speed')} {s.speed}</small>
    <span>{localized(s.game_starter_ships_i18n)?.description}</span></button>)}</div>}
  {step===6&&<div className="ch-confirm"><h3>{name||'—'}</h3><p>{localized(speciesSelected?.game_species_i18n)?.name} / {localized(classSelected?.game_classes_i18n)?.name}</p>
   <p>{t(en,'Tulajdonságpontok maradéka','Attribute points remaining')}: {attrRemaining}; {t(en,'Skillpontok maradéka','Skill points remaining')}: {skillRemaining}</p>
   {attributes.map(a=><div className="ch-stat" key={a}><span>{names[l][a]}</span><strong>{toDice(currentStats[a]||3)}</strong></div>)}
   {error&&<p className="ch-error" role="alert">{error}</p>}
   <button className="ch-primary" disabled={busy||!speciesId||!classId||!shipId||name.trim().length<2||attrRemaining!==0||skillRemaining!==0} onClick={()=>void create()}>{busy?'…':t(en,'Kapitány létrehozása','Create captain')}</button>
  </div>}
  <div className="ch-buttons"><button disabled={step===0} onClick={()=>setStep(i=>Math.max(0,i-1))}>{t(en,'Vissza','Back')}</button><button disabled={step===6} onClick={()=>setStep(i=>Math.min(6,i+1))}>{t(en,'Tovább','Next')} →</button></div>
 </section>;
}
