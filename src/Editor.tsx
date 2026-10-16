import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import './editor.css';

export type Attr='body'|'mind'|'soul'|'morale'|'social';
type Kind='species'|'classes';
type Base={id:string;slug:string;primary_attribute:Attr;secondary_attribute:Attr;image_path:string|null;is_published:boolean;resistances?:Resist[];created_at:string};
type Local={locale:string;name:string;description:string;passives?:string;starting_equipment?:string;traits?:string;gameplay_role?:string};
type Resist={code:string;value:number};
type RecordRow=Base&{game_species_i18n?:Local[];game_classes_i18n?:Local[]};
type Skill={id:string;slug:string;attribute:Attr;is_combat:boolean;position:number;game_skills_i18n:{locale:string;name:string}[]};
type FormData={id?:string;slug:string;primary_attribute:Attr;secondary_attribute:Attr;image_path:string;is_published:boolean;resistances:Resist[];translations:Record<string,{name:string;description:string;passives:string;starting_equipment:string;traits:string;gameplay_role:string}>};
const attrs:Attr[]=['body','mind','soul','morale','social'];
const languages=['hu','en'] as const;
const resistanceCodes=['kinetic','thermal','psionic','occult','sonic','chemical','fear','terror'] as const;
const resistanceNames={hu:{kinetic:'Kinetikus',thermal:'Hő',psionic:'Pszionikus',occult:'Okkult',sonic:'Hang',chemical:'Vegyi',fear:'Félelem',terror:'Terror'},en:{kinetic:'Kinetic',thermal:'Thermal',psionic:'Psionic',occult:'Occult',sonic:'Sonic',chemical:'Chemical',fear:'Fear',terror:'Terror'}};
const attrText:Record<string,Record<Attr,string>>={
 hu:{body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'},
 en:{body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'}
};
const labels={
 hu:{dashboard:'Szerkesztői vezérlőpult',species:'Fajok',classes:'Kasztok',translations:'Fordítások',settings:'Beállítások',newSpecies:'Új faj',newClass:'Új kaszt',name:'Név',description:'Leírás',slug:'Azonosító (slug)',primary:'Elsődleges bónusz',secondary:'Másodlagos bónusz',image:'R2 képfájl útvonala',published:'Publikált',draft:'Vázlat',save:'Mentés',delete:'Törlés',cancel:'Mégse',create:'Létrehozás',confirm:'Biztosan törlöd ezt a bejegyzést?',required:'Mindkét nyelven kötelező a név.',different:'A két bónusz nem lehet ugyanazon a tulajdonságon.',saved:'Sikeres mentés.',deleted:'A bejegyzés törölve.',loading:'Adatok betöltése…',empty:'Nincs ilyen tartalom. Készíts újat.',skills:'Tulajdonságok és képességek',combat:'Harci skill',noncombat:'Képességek',overview:'Áttekintés',hint:'Egy faj és egy kaszt egyaránt +1D-t ad az elsődleges, és +1 pipet a másodlagos tulajdonsághoz.',portrait:'Előnézet',missing:'Még nincs kép',back:'Vissza a játékhoz',security:'A mentési jogokat az adatbázis ellenőrzi.',invalidPath:'A kép elérési útja hatarvilag/ kezdetű legyen.',localeInfo:'HU az alap, EN a második nyelv; az adatmodell további nyelvekkel bővíthető.',error:'Nem sikerült betölteni vagy menteni az adatot.',rights:'Szerkesztői hozzáférés',passives:'Passzív sajátosságok (soronként egy)',resistances:'Kezdő ellenállások',addResistance:'Ellenállás hozzáadása',equipment:'Kezdő felszerelés (soronként egy)',traits:'Kezdő sajátosságok (soronként egy)',gameplayRole:'Játékbeli szerep'},
 en:{dashboard:'Editor dashboard',species:'Species',classes:'Classes',translations:'Translations',settings:'Settings',newSpecies:'New species',newClass:'New class',name:'Name',description:'Description',slug:'Identifier (slug)',primary:'Primary bonus',secondary:'Secondary bonus',image:'R2 image path',published:'Published',draft:'Draft',save:'Save',delete:'Delete',cancel:'Cancel',create:'Create',confirm:'Delete this entry permanently?',required:'Both languages require a name.',different:'Primary and secondary bonuses must differ.',saved:'Saved successfully.',deleted:'Entry deleted.',loading:'Loading content…',empty:'No content yet. Create the first entry.',skills:'Attributes and skills',combat:'Combat skill',noncombat:'Skills',overview:'Overview',hint:'Species and classes each grant +1D to the primary attribute and +1 pip to the secondary.',portrait:'Preview',missing:'No image yet',back:'Return to game',security:'Database authorization is enforced on every save.',invalidPath:'Image path must begin with hatarvilag/.',localeInfo:'HU is default, EN is secondary; the data model supports more languages.',error:'Could not load or save content.',rights:'Editor access',passives:'Passive traits (one per line)',resistances:'Starting resistances',addResistance:'Add resistance',equipment:'Starting equipment (one per line)',traits:'Starting traits (one per line)',gameplayRole:'Gameplay role'}
};
const blankTranslation=()=>({name:'',description:'',passives:'',starting_equipment:'',traits:'',gameplay_role:''});
const newForm=():FormData=>({slug:'',primary_attribute:'body',secondary_attribute:'mind',image_path:'',is_published:false,resistances:[],translations:{hu:blankTranslation(),en:blankTranslation()}});
const slugify=(name:string)=>name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45);
const table=(kind:Kind)=>kind==='species'?'game_species':'game_classes';
const i18nTable=(kind:Kind)=>kind==='species'?'game_species_i18n':'game_classes_i18n';
const fk=(kind:Kind)=>kind==='species'?'species_id':'class_id';
function translateItem(r:RecordRow,kind:Kind,locale:string,field:'name'|'description'){
 const all=(kind==='species'?r.game_species_i18n:r.game_classes_i18n)||[];
 return all.find(x=>x.locale===locale)?.[field]||all.find(x=>x.locale==='hu')?.[field]||r.slug;
}
function toForm(r:RecordRow,kind:Kind):FormData{
 const trans=(kind==='species'?r.game_species_i18n:r.game_classes_i18n)||[];
 return {id:r.id,slug:r.slug,primary_attribute:r.primary_attribute,secondary_attribute:r.secondary_attribute,image_path:r.image_path||'',is_published:r.is_published,resistances:Array.isArray(r.resistances)?r.resistances:[],translations:Object.fromEntries(languages.map(l=>[l,{...blankTranslation(),...(trans.find(x=>x.locale===l)||{})}]))};
}
function imageSrc(path:string){return path.startsWith('hatarvilag/')?'https://assets.voidnoir.net/'+path:undefined}
export default function Editor({locale,onBack}:{locale:string;onBack:()=>void}){
 const l=locale==='en'?'en':'hu';const t=labels[l];
 const [kind,setKind]=useState<Kind>('species');
 const [records,setRecords]=useState<RecordRow[]>([]);
 const [counts,setCounts]=useState<{species:number;classes:number}>({species:7,classes:7});
 const [skills,setSkills]=useState<Skill[]>([]);
 const [selection,setSelection]=useState<string|null>(null);
 const [form,setForm]=useState<FormData>(newForm);
 const [editingLocale,setEditingLocale]=useState<string>('hu');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [confirmDelete,setConfirmDelete]=useState(false);
 const [dirty,setDirty]=useState(false);
 const tr=(k:keyof typeof labels.hu)=>t[k];
 const fetchRecords=useCallback(async(currentKind:Kind)=>{
  const tbl=table(currentKind),related=i18nTable(currentKind);
  const fields=currentKind==='species'?'locale,name,description,passives':'locale,name,description,starting_equipment,traits,gameplay_role';
  const {data,error}=await supabase.from(tbl).select('*, '+related+'('+fields+')').order('created_at',{ascending:true});
  if(error)throw error;
  return data as unknown as RecordRow[];
 },[]);
 const reload=useCallback(async(currentKind:Kind,retain?:string)=>{
  setLoading(true);setError('');
  try{
   const other=currentKind==='species'?'classes':'species';
   const [rows,sk,otherTotal]=await Promise.all([fetchRecords(currentKind),supabase.from('game_skills').select('id,slug,attribute,is_combat,position,game_skills_i18n(locale,name)').order('attribute').order('position'),supabase.from(table(other)).select('id',{count:'exact',head:true})]);
   setCounts(prev=>({...prev,[currentKind]:rows.length,[other]:otherTotal.count??prev[other]}));
   if(sk.error)throw sk.error;
   setSkills((sk.data||[]) as Skill[]);
   setRecords(rows);
   const picked=rows.find(x=>x.id===retain)||rows[0];
   if(picked){setSelection(picked.id);setForm(toForm(picked,currentKind));}
   else{setSelection(null);setForm(newForm());}
   setDirty(false);
  }catch(e){setError(e instanceof Error?e.message:t.error);}finally{setLoading(false);}
 },[fetchRecords,t.error]);
 useEffect(()=>{void reload(kind);},[kind,reload]);
 const select=(r:RecordRow)=>{setSelection(r.id);setForm(toForm(r,kind));setError('');setMessage('');setDirty(false);};
 const update=(diff:Partial<FormData>)=>{setForm(p=>({...p,...diff}));setDirty(true);setMessage('');};
 const localized=(field:'name'|'description'|'passives'|'starting_equipment'|'traits'|'gameplay_role',value:string)=>{
  setForm(prev=>({...prev,translations:{...prev.translations,[editingLocale]:{...prev.translations[editingLocale], [field]:value}}}));
  setDirty(true);setMessage('');
 };
 const save=async(e:FormEvent)=>{
  e.preventDefault();if(saving)return;
  setError('');setMessage('');
  if(!form.translations.hu?.name?.trim()||!form.translations.en?.name?.trim()){setError(t.required);return;}
  if(form.primary_attribute===form.secondary_attribute){setError(t.different);return;}
  if(form.image_path&& !form.image_path.startsWith('hatarvilag/')){setError(t.invalidPath);return;}
  const slug=slugify(form.slug||form.translations.hu.name);
  if(!slug){setError(t.required);return;}
  setSaving(true);
  try{
   const payload={slug,primary_attribute:form.primary_attribute,secondary_attribute:form.secondary_attribute,image_path:form.image_path.trim()||null,is_published:form.is_published,...(kind==='species'?{resistances:form.resistances}: {})};
   let id=form.id;
   if(id){
    const {error}=await supabase.from(table(kind)).update(payload).eq('id',id);
    if(error)throw error;
   }else{
    const {data,error}=await supabase.from(table(kind)).insert(payload).select('id').single();
    if(error)throw error;
    id=data.id;
   }
   const updated=languages.map(locale=>({[fk(kind)]:id,locale,name:form.translations[locale].name.trim(),description:form.translations[locale].description.trim(),...(kind==='species'?{passives:form.translations[locale].passives.trim()}:{starting_equipment:form.translations[locale].starting_equipment.trim(),traits:form.translations[locale].traits.trim(),gameplay_role:form.translations[locale].gameplay_role.trim()})}));
   const {error}=await supabase.from(i18nTable(kind)).upsert(updated,{onConflict:fk(kind)+',locale'});
   if(error)throw error;
   await reload(kind,id);
   setMessage(t.saved);
  }catch(e){setError(e instanceof Error?e.message:t.error);}finally{setSaving(false);}
 };
 const del=async()=>{
  if(!form.id||saving)return;
  setSaving(true);setError('');
  const {error}=await supabase.from(table(kind)).delete().eq('id',form.id);
  setSaving(false);setConfirmDelete(false);
  if(error){setError(error.message);return;}
  await reload(kind);setMessage(t.deleted);
 };
 const selectedSkill=useMemo(()=>attrs.map(attr=>({attr,rows:skills.filter(x=>x.attribute===attr).sort((a,b)=>a.position-b.position)})),[skills]);
 return <div className="ed-layout">
  <nav className="ed-nav">
   <div className="ed-nav-title">{t.dashboard}</div>
   <button onClick={onBack}>⌂　{t.back}</button>
   <button className={kind==='species'?'active':''} onClick={()=>{setKind('species');setMessage('');}}>◈　{t.species} <span>{counts.species}</span></button>
   <button className={kind==='classes'?'active':''} onClick={()=>{setKind('classes');setMessage('');}}>✥　{t.classes} <span>{counts.classes}</span></button>
   <div className="ed-menu-muted">◇　{t.translations} · HU / EN</div>
   <div className="ed-nav-bottom"><span className="ed-live-dot"/> {t.rights}<p>{t.security}</p></div>
  </nav>
  <section className="ed-roster">
   <div className="ed-roster-heading"><strong>{kind==='species'?t.species:t.classes} ({records.length})</strong><button onClick={()=>{setSelection(null);setForm(newForm());setDirty(false);setMessage('');setError('');}}>＋ {kind==='species'?t.newSpecies:t.newClass}</button></div>
   <div className="ed-roster-content">
    {loading?<p>{t.loading}</p>:records.length===0?<p>{t.empty}</p>:records.map(r=>
     <button key={r.id} className={'ed-entry '+(selection===r.id?'selected':'')} onClick={()=>select(r)}>
      <span className="ed-entry-image">{r.image_path?<img loading="lazy" decoding="async" src={imageSrc(r.image_path)} alt=""/>:'◈'}</span>
      <span className="ed-entry-name"><strong>{translateItem(r,kind,l,'name')}</strong><small>{attrText[l][r.primary_attribute]} +1D / {attrText[l][r.secondary_attribute]} +1</small></span>
      <span className={'ed-entry-state '+(r.is_published?'':'draft')}>{r.is_published?'●':'○'}</span>
     </button>)}
   </div>
   <div className="ed-roster-footer">Space D6 Free <span>·</span> 5 ATTR / 25 SKILL</div>
  </section>
  <section className="ed-main">
   <div className="ed-title-row"><h2>{kind==='species'?t.species:t.classes} <span>// {form.id?tr('overview'):tr('create')}</span></h2><div className="ed-locale-tabs">{languages.map(locale=><button key={locale} className={editingLocale===locale?'active':''} onClick={()=>setEditingLocale(locale)}>{locale==='hu'?'Magyar':'English'}</button>)}</div></div>
   {error&&<div className="ed-notice ed-error" role="alert">{error}</div>}
   {message&&<div className="ed-notice ed-success" role="status">{message}</div>}
   <form id="ed-form" className="ed-content" onSubmit={save}>
    <div className="ed-main-grid">
     <div className="ed-portrait"><div className="ed-portrait-img">{form.image_path?<img src={imageSrc(form.image_path)} alt=""/>:<div className="ed-portrait-empty"><span>◈</span>{t.missing}</div>}</div><label>{t.image}<input type="text" value={form.image_path} onChange={e=>update({image_path:e.target.value})} placeholder="hatarvilag/species/portrait.webp"/></label></div>
     <div className="ed-fields">
      <div className="ed-fields-two"><label>{t.name} ({editingLocale.toUpperCase()})<input required value={form.translations[editingLocale]?.name||''} onChange={e=>localized('name',e.target.value)} /></label><label>{t.slug}<input required value={form.slug} onChange={e=>update({slug:e.target.value})} placeholder="slug"/></label></div>
      <div className="ed-fields-two"><label>{t.primary} <b>+1D</b><select value={form.primary_attribute} onChange={e=>update({primary_attribute:e.target.value as Attr})}>{attrs.map(a=><option key={a} value={a}>{attrText[l][a]}</option>)}</select></label><label>{t.secondary} <b>+1</b><select value={form.secondary_attribute} onChange={e=>update({secondary_attribute:e.target.value as Attr})}>{attrs.map(a=><option key={a} value={a}>{attrText[l][a]}</option>)}</select></label></div>
      <label>{t.description} ({editingLocale.toUpperCase()})<textarea rows={4} value={form.translations[editingLocale]?.description||''} onChange={e=>localized('description',e.target.value)}/></label>
      {kind==='species'?<>
       <label>{t.passives} ({editingLocale.toUpperCase()})<textarea rows={3} value={form.translations[editingLocale]?.passives||''} onChange={e=>localized('passives',e.target.value)}/></label>
       <div className="ed-resistances"><h4>{t.resistances}</h4>{form.resistances.map((res,index)=><div className="ed-resistance" key={index}>
        <select value={res.code} aria-label={t.resistances} onChange={e=>update({resistances:form.resistances.map((r,i)=>i===index?{...r,code:e.target.value}:r)})}>{resistanceCodes.map(code=><option key={code} value={code}>{resistanceNames[l][code]}</option>)}</select>
        <input type="number" min="-100" max="100" aria-label="%" value={res.value} onChange={e=>update({resistances:form.resistances.map((r,i)=>i===index?{...r,value:Math.max(-100,Math.min(100,Number(e.target.value)))}:r)})}/>
        <span>%</span><button type="button" aria-label="Remove resistance" onClick={()=>update({resistances:form.resistances.filter((_,i)=>i!==index)})}>×</button>
       </div>)}
       <button className="ed-add" type="button" onClick={()=>update({resistances:[...form.resistances,{code:'kinetic',value:10}]})} disabled={form.resistances.length>=12}>＋ {t.addResistance}</button></div>
      </>:<>
       <label>{t.equipment} ({editingLocale.toUpperCase()})<textarea rows={3} value={form.translations[editingLocale]?.starting_equipment||''} onChange={e=>localized('starting_equipment',e.target.value)}/></label>
       <label>{t.traits} ({editingLocale.toUpperCase()})<textarea rows={3} value={form.translations[editingLocale]?.traits||''} onChange={e=>localized('traits',e.target.value)}/></label>
       <label>{t.gameplayRole} ({editingLocale.toUpperCase()})<textarea rows={3} value={form.translations[editingLocale]?.gameplay_role||''} onChange={e=>localized('gameplay_role',e.target.value)}/></label>
      </>}
      <label className="ed-publish"><input type="checkbox" checked={form.is_published} onChange={e=>update({is_published:e.target.checked})}/><span>{form.is_published?t.published:t.draft}</span></label>
     </div>
    </div>
    <section className="ed-skills"><h3>◈　{t.skills}</h3><p>{t.hint}</p><div className="ed-skill-grid">{selectedSkill.map(({attr,rows})=><div className={'ed-skill-col ed-'+attr} key={attr}><h4>{attrText[l][attr]}</h4>{rows.map(skill=><div className={'ed-skill '+(skill.is_combat?'combat':'')} key={skill.id}>{skill.is_combat?'⌖':'□'}　{skill.game_skills_i18n.find(t=>t.locale===l)?.name||skill.game_skills_i18n.find(t=>t.locale==='hu')?.name||skill.slug}</div>)}</div>)}</div></section>
   </form>
   <div className="ed-actions"><span>{dirty?'● '+(l==='hu'?'Nem mentett változások':'Unsaved changes'):t.localeInfo}</span>
    {form.id&&<button type="button" className="ed-danger" onClick={()=>setConfirmDelete(true)}>{t.delete}</button>}
    <button type="submit" form="ed-form" className="ed-submit" disabled={saving}>{saving?'…':t.save}</button>
   </div>
  </section>
  {confirmDelete&&<div className="ed-modal-overlay"><div className="ed-modal" role="dialog" aria-modal="true" aria-label={t.delete}><h3>{t.delete}</h3><p>{t.confirm}</p><div><button onClick={()=>setConfirmDelete(false)}>{t.cancel}</button><button className="ed-danger" disabled={saving} onClick={()=>void del()}>{t.delete}</button></div></div></div>}
 </div>;
}
