import {useEffect,useMemo,useState} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {attributes,calculateAttributes,remainingPoints,toDice,type Attribute} from './lib/d6';
import './character.css';
import {SkillArt,AttributeArt,ShipArt} from './components/GameArt';
import {LucidePlus,LucideMinus} from './components/LucideSigns';
import CaptainDashboard from './CaptainDashboard';
import './character-v2.css';
type Base={id:string;slug:string;image_path:string|null;primary_attribute:Attribute;secondary_attribute:Attribute;game_species_i18n?:{locale:string;name:string;description:string}[];game_classes_i18n?:{locale:string;name:string;description:string}[];game_species_skill_bonuses?:{skill_id:string;bonus_pips:number}[];game_classes_skill_bonuses?:{skill_id:string;bonus_pips:number}[]};
type Ship={id:string;slug:string;image_path:string|null;hull:number;cargo:number;speed:number;game_starter_ships_i18n:{locale:string;name:string;description:string}[]};
type Skill={id:string;attribute:Attribute;slug:string;icon_path:string|null;game_skills_i18n:{locale:string;name:string}[]};
type Rules={base_attribute_pips:number;free_attribute_pips:number;max_attribute_pips:number;free_skill_pips:number;max_allocated_skill_pips:number};
type Captain={id:string;captain_name:string;species_id:string;class_id:string;starter_ship_id:string;attribute_pips:Record<string,number>;skill_bonus_pips:Record<string,number>};
const names={hu:{body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'},en:{body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'}};
const t=(en:boolean,hu:string,english:string)=>en?english:hu;
const src=(path:string|null)=>path?.startsWith('hatarvilag/')?'https://assets.voidnoir.net/'+path:undefined;
export default function CharacterPage({locale,isEditor=false}:{locale:string;isEditor?:boolean}){
 const en=locale==='en',l=en?'en':'hu';
 const [species,setSpecies]=useState<Base[]>([]),[classes,setClasses]=useState<Base[]>([]);
 const [ships,setShips]=useState<Ship[]>([]),[skills,setSkills]=useState<Skill[]>([]);
 const [rules,setRules]=useState<Rules|null>(null),[captain,setCaptain]=useState<Captain|null>(null);
 const [crew,setCrew]=useState<{id:string;position:string;name:string}[]>([]);
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
  if(problem){setError(problem.message);notify(problem.message,'error');setLoading(false);return;}
  setSpecies(s.data as unknown as Base[]);setClasses(c.data as unknown as Base[]);
  setShips(sh.data as unknown as Ship[]);setSkills(sk.data as unknown as Skill[]);setRules(r.data as Rules);
  setSpeciesId(s.data?.[0]?.id||'');setClassId(c.data?.[0]?.id||'');setShipId(sh.data?.[0]?.id||'');
  if(ch.data){
   setCaptain(ch.data as Captain);
   const cr=await supabase.from('character_crew').select('id,position,name').eq('character_id',ch.data.id);
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
  if(error){setError(error.message);notify(error.message,'error');}else{
   const {data}=await supabase.from('characters').select('id,captain_name,species_id,class_id,starter_ship_id,attribute_pips,skill_bonus_pips').single();
   if(data){setCaptain(data as Captain);const cr=await supabase.from('character_crew').select('id,position,name').eq('character_id',data.id);if(!cr.error)setCrew(cr.data||[]);}
  }
  setBusy(false);
 };
 const steps=en?['Captain','Species','Class','Attributes','Skills','Starship','Confirm']:['Kapitány','Faj','Kaszt','Tulajdonságok','Skillek','Űrhajó','Véglegesítés'];
 const [activeAttribute,setActiveAttribute]=useState<typeof attributes[number]>('body');
 const selectedSkills=skills.filter(s=>s.attribute===activeAttribute);
 const selectName=(i:Base,k:boolean)=>localized(k?i.game_classes_i18n:i.game_species_i18n)?.name||i.slug;
 const mainActions=<span className="ch-head-actions"><span>SPACE D6 FREE</span></span>;
 if(loading)return <section className="ch-v2"><div className="ch-loading">{t(en,'Karakteradatok betöltése…','Loading characters…')}</div></section>;
 if(error&&!rules)return <section className="ch-v2"><div className="ch-loading ch-error">{error}</div></section>;
 if(captain)return <CaptainDashboard captain={captain} species={species} classes={classes} ships={ships} skills={skills} crew={crew} locale={locale} isEditor={isEditor} onReset={()=>{setCaptain(null);setStep(0);setName('');setAttr({});setSkillPts({});setError('');}}/>;
 const cards=(items:Base[],which:string,set:(id:string)=>void,isClass:boolean)=><div className="ch-v2-cards">{items.map(item=><button type="button" key={item.id} className={'ch-v2-card '+(which===item.id?'selected':'')} onClick={()=>set(item.id)}><div className="ch-v2-card-art">{item.image_path&&<img src={src(item.image_path)} alt=""/>}</div><strong>{selectName(item,isClass)}</strong><small>+1D {names[l][item.primary_attribute]} / +1 {names[l][item.secondary_attribute]}</small></button>)}</div>;
 return <section className="ch-v2"><header className="ch-v2-heading"><div><small>{t(en,'KARAKTERGENERÁLÁS','CHARACTER CREATION')}</small><strong>HATÁRVILÁG</strong></div>{mainActions}</header>
 <nav className="ch-v2-steps">{steps.map((s,i)=><button type="button" key={i} className={step===i?'active':''} onClick={()=>setStep(i)}><b>{i+1}</b>{s}</button>)}</nav>
 <main className="ch-v2-stage">
  {step===0&&<div className="ch-v2-captain"><div className="ch-v2-captain-portrait"><img src="https://assets.voidnoir.net/hatarvilag/portraits/captain-origin-v1.webp" alt=""/></div><div><small>01 / {steps[0]}</small><h2>{t(en,'Nevezd el a kapitányodat','Name your captain')}</h2><p>{t(en,'Egy saját kapitányt alakítasz, akinek a faját, kasztját és képességeit a következő lépésekben választod meg.','Create your captain. Species, class and abilities are selected in the following steps.')}</p><label>{t(en,'A kapitány neve','Captain name')}<input maxLength={40} autoFocus value={name} placeholder={t(en,'Kapitány neve…','Captain name…')} onChange={e=>setName(e.target.value)}/></label></div></div>}
  {step===1&&<>{cards(species,speciesId,setSpeciesId,false)}<p className="ch-v2-info">{localized(speciesSelected?.game_species_i18n)?.description}</p></>}
  {step===2&&<>{cards(classes,classId,setClassId,true)}<p className="ch-v2-info">{localized(classSelected?.game_classes_i18n)?.description}</p></>}
  {step===3&&<><div className="ch-v2-section-heading"><h2>{steps[3]}</h2><span>{t(en,'Szabad pip','Remaining pips')} <b>{attrRemaining}</b></span></div><div className="ch-v2-attributes">{attributes.map(a=><div className="ch-v2-attribute" key={a}><AttributeArt attribute={a}/><strong>{names[l][a]}</strong><div className="ch-v2-controls"><button disabled={!(attr[a]||0)} onClick={()=>chooseStat(a,-1)} aria-label={t(en,'Csökkentés','Decrease')}><LucideMinus/></button><b>{toDice(currentStats[a]||3)}</b><button disabled={attrRemaining===0||((currentStats[a]||3)>=(rules?.max_attribute_pips||18))} onClick={()=>chooseStat(a,1)} aria-label={t(en,'Növelés','Increase')}><LucidePlus/></button></div><small>+{attr[a]||0} pip</small></div>)}</div></>}
  {step===4&&<><div className="ch-v2-section-heading"><h2>{steps[4]}</h2><span>{t(en,'Szabad pip','Remaining pips')} <b>{skillRemaining}</b></span></div><div className="ch-v2-attr-switch">{attributes.map(a=><button type="button" key={a} className={activeAttribute===a?'active':''} onClick={()=>setActiveAttribute(a)}><AttributeArt attribute={a}/>{names[l][a]}</button>)}</div><div className="ch-v2-skills">{selectedSkills.map(s=><div className="ch-v2-skill" key={s.id}><SkillArt slug={s.slug} path={s.icon_path}/><strong>{localized(s.game_skills_i18n.map(x=>({...x,description:''})))?.name||s.slug}</strong><div className="ch-v2-controls"><button disabled={!(skillPts[s.id]||0)} onClick={()=>chooseSkill(s.id,-1)} aria-label={t(en,'Csökkentés','Decrease')}><LucideMinus/></button><b>{toDice((currentStats[s.attribute]||3)+(skillPts[s.id]||0)+skillBonus(s.id))}</b><button disabled={skillRemaining===0||(skillPts[s.id]||0)>=(rules?.max_allocated_skill_pips||6)} onClick={()=>chooseSkill(s.id,1)} aria-label={t(en,'Növelés','Increase')}><LucidePlus/></button></div><small>+{skillPts[s.id]||0} pip</small></div>)}</div></>}
  {step===5&&<div className="ch-v2-ships">{ships.map(s=><button type="button" key={s.id} className={'ch-v2-ship '+(shipId===s.id?'selected':'')} onClick={()=>setShipId(s.id)}><div className="ch-v2-ship-art"><ShipArt slug={s.slug}/></div><strong>{localized(s.game_starter_ships_i18n)?.name||s.slug}</strong><small>HP {s.hull} · CARGO {s.cargo} · SPEED {s.speed}</small><p>{localized(s.game_starter_ships_i18n)?.description}</p></button>)}</div>}
  {step===6&&<div className="ch-v2-confirm"><div><h2>{name||'—'}</h2><div className="ch-v2-confirm-images">{[speciesSelected,classSelected].map((v,i)=><div key={i}>{v?.image_path&&<img src={src(v.image_path)} alt=""/>}<strong>{v?selectName(v,i===1):''}</strong></div>)}</div><p>{localized(ships.find(s=>s.id===shipId)?.game_starter_ships_i18n)?.name}</p></div><div className="ch-v2-confirm-stats">{attributes.map(a=><div key={a}><span>{names[l][a]}</span><b>{toDice(currentStats[a]||3)}</b></div>)}<p>{t(en,'Kiosztatlan pip','Unspent pips')}: {attrRemaining} / {skillRemaining}</p><button className="ch-v2-finalize" disabled={busy||!speciesId||!classId||!shipId||name.trim().length<2||attrRemaining!==0||skillRemaining!==0} onClick={()=>void create()}>{busy?'…':t(en,'Kapitány véglegesítése','Finalize captain')}</button></div></div>}
 </main><footer className="ch-v2-footer"><span>SPACE D6 FREE</span><div><button type="button" disabled={step===0} onClick={()=>setStep(v=>Math.max(0,v-1))}>{t(en,'Vissza','Back')}</button>{step!==6&&<button type="button" className="ch-v2-next" onClick={()=>setStep(v=>Math.min(6,v+1))}>{t(en,'Tovább','Next')} →</button>}</div></footer>
 </section>;
}
