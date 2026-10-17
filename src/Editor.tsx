import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import './editor.css';

type Attr = 'body'|'mind'|'soul'|'morale'|'social';
type Kind = 'species'|'classes';
type Tab = 'general'|'skills'|'dictionary';
type LocaleRow = {code:string;native_name:string;name_en:string;is_enabled:boolean;sort_order:number};
type Translation = {locale:string;name:string;description:string;passives?:string;starting_equipment?:string;traits?:string;gameplay_role?:string};
type BonusRow = {skill_id:string;bonus_pips:number};
type CatalogRecord = {
  id:string;slug:string;primary_attribute:Attr;secondary_attribute:Attr;image_path:string|null;
  is_published:boolean;resistances?:{code:string;value:number}[];
  game_species_i18n?:Translation[];game_classes_i18n?:Translation[];
  game_species_skill_bonuses?:BonusRow[];game_classes_skill_bonuses?:BonusRow[];
};
type Skill = {id:string;slug:string;attribute:Attr;is_combat:boolean;position:number;game_skills_i18n:{locale:string;name:string}[]};
type TranslationBody = {name:string;description:string;passives:string;starting_equipment:string;traits:string;gameplay_role:string};
type FormBody = {
  id?:string;slug:string;primary_attribute:Attr;secondary_attribute:Attr;image_path:string;is_published:boolean;
  resistances:{code:string;value:number}[];translations:Record<string,TranslationBody>;bonuses:Record<string,number>;
};
const attrs:Attr[]=['body','mind','soul','morale','social'];
const bonusOptions=Array.from({length:13},(_,n)=>n);
const attrNames={hu:{body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'},en:{body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'}};
const resistanceCodes=['kinetic','thermal','psionic','occult','sonic','chemical','fear','terror'];
const resistanceNames={hu:['Kinetikus','Hő','Pszionikus','Okkult','Hang','Vegyi','Félelem','Terror'],en:['Kinetic','Thermal','Psionic','Occult','Sonic','Chemical','Fear','Terror']};
const ui={
hu:{
  title:'Szerkesztői vezérlőpult',back:'Vissza a játékhoz',species:'Fajok',classes:'Kasztok',newSpecies:'Új faj',newClass:'Új kaszt',
  general:'Alapadatok',skills:'Skillek',dictionary:'Szótár',name:'Megnevezés',slug:'Technikai azonosító (slug)',
  primary:'Elsődleges tulajdonság',secondary:'Másodlagos tulajdonság',image:'R2 kép útvonala',published:'Publikált',draft:'Vázlat',
  description:'Leírás',passives:'Passzív sajátosságok',resistances:'Kezdő ellenállások',equipment:'Kezdő felszerelés',
  traits:'Kezdő sajátosságok',role:'Játékbeli szerep',addResistance:'Ellenállás hozzáadása',
  save:'Mentés',delete:'Törlés',cancel:'Mégse',create:'Új bejegyzés',loading:'Betöltés…',saving:'Mentés…',missing:'Nincs még kép',
  bonusInfo:'Minden faj és kaszt +1D-t ad az elsődleges, +1 pipet a másodlagos tulajdonságra. Az alábbi skillbónuszok ezen felül járnak.',
  bonusLabel:'Kezdő bónusz',bonusNone:'Nincs',combat:'Harci',skillTotal:'Beállított skillbónuszok',skillEmpty:'Nincs külön skillbónusz.',
  langInfo:'A magyar és angol kötelező. Új nyelvek külön sorban vehetők fel, minden új editor ugyanebből a nyelvlistából dolgozik.',
  addLanguage:'Nyelv hozzáadása',newLangCode:'Nyelvkód (pl. de)',newLangName:'A nyelv saját neve',newLangEnglish:'Angol elnevezés',
  add:'Hozzáadás',dictionaryMissing:'Nincs fordítás',language:'Nyelv',edited:'Nem mentett módosítások',
  saved:'Mentés sikeres.',deleted:'A bejegyzés törölve.',required:'Magyar és angol név kötelező.',different:'A két tulajdonság különböző legyen.',
  imageError:'Csak hatarvilag/ kezdetű képútvonal használható.',loadError:'A szerkesztő nem tölthető be.',saveError:'Nem sikerült menteni.',
  confirmDelete:'Biztosan véglegesen törlöd a kiválasztott bejegyzést?',confirmLeave:'Nem mentett változásaid vannak. Elveted őket?',
  unsaved:'Nem mentett módosítás',discard:'Elvetés',complete:'Teljes',localeError:'Nem sikerült hozzáadni a nyelvet.',
  localeInvalid:'Kétbetűs nyelvkódot adj meg (pl. de vagy fr).',noRecords:'Nincs még bejegyzés. Hozz létre egyet.',
  portrait:'Portré',localizedFields:'Fordítható tartalom',noSkill:'Nincs képességadat.',close:'Bezárás'
},
en:{
  title:'Editor dashboard',back:'Return to game',species:'Species',classes:'Classes',newSpecies:'New species',newClass:'New class',
  general:'General',skills:'Skills',dictionary:'Dictionary',name:'Name',slug:'Technical identifier (slug)',
  primary:'Primary attribute',secondary:'Secondary attribute',image:'R2 image key',published:'Published',draft:'Draft',
  description:'Description',passives:'Passive traits',resistances:'Starting resistances',equipment:'Starting equipment',
  traits:'Starting traits',role:'Gameplay role',addResistance:'Add resistance',
  save:'Save',delete:'Delete',cancel:'Cancel',create:'New entry',loading:'Loading…',saving:'Saving…',missing:'No picture yet',
  bonusInfo:'Each species and class adds +1D to its primary and +1 pip to its secondary attribute. Additional skill bonuses are set below.',
  bonusLabel:'Starting bonus',bonusNone:'None',combat:'Combat',skillTotal:'Configured skill bonuses',skillEmpty:'No additional skill bonus.',
  langInfo:'Hungarian and English are required. More languages can be added here and reused by future editors.',
  addLanguage:'Add language',newLangCode:'Language code (e.g. de)',newLangName:'Native language name',newLangEnglish:'English name',
  add:'Add',dictionaryMissing:'Missing translation',language:'Language',edited:'Unsaved changes',
  saved:'Saved successfully.',deleted:'Entry deleted.',required:'Hungarian and English names are required.',different:'Attributes must be different.',
  imageError:'Image key must start with hatarvilag/.',loadError:'Could not load editor data.',saveError:'Failed to save.',
  confirmDelete:'Permanently delete this entry?',confirmLeave:'You have unsaved changes. Discard them?',
  unsaved:'Unsaved changes',discard:'Discard',complete:'Complete',localeError:'Could not add language.',
  localeInvalid:'Enter a two-letter language code (e.g. de or fr).',noRecords:'No entries yet. Create one.',
  portrait:'Portrait',localizedFields:'Localised content',noSkill:'No skill data.',close:'Close'
}};
type UiKey=keyof typeof ui.hu;
const emptyTranslation=():TranslationBody=>({name:'',description:'',passives:'',starting_equipment:'',traits:'',gameplay_role:''});
const emptyForm=():FormBody=>({slug:'',primary_attribute:'body',secondary_attribute:'mind',image_path:'',is_published:false,resistances:[],translations:{hu:emptyTranslation(),en:emptyTranslation()},bonuses:{}});
const table=(k:Kind)=>k==='species'?'game_species':'game_classes';
const i18nTable=(k:Kind)=>k==='species'?'game_species_i18n':'game_classes_i18n';
const bonusTable=(k:Kind)=>k==='species'?'game_species_skill_bonuses':'game_classes_skill_bonuses';
const foreignKey=(k:Kind)=>k==='species'?'species_id':'class_id';
const slugify=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48);
const picture=(key:string|null|undefined)=>key?.startsWith('hatarvilag/')?'https://assets.voidnoir.net/'+key:undefined;
function asDice(pips:number){if(!pips)return '—';const dice=Math.floor(pips/3),extra=pips%3;return (dice?'+'+dice+'D':'')+(extra?'+'+extra:'');}
function transList(item:CatalogRecord,k:Kind){return (k==='species'?item.game_species_i18n:item.game_classes_i18n)||[];}
function bonusList(item:CatalogRecord,k:Kind){return (k==='species'?item.game_species_skill_bonuses:item.game_classes_skill_bonuses)||[];}
function translated(item:CatalogRecord,k:Kind,lang:string){return transList(item,k).find(t=>t.locale===lang)?.name||transList(item,k).find(t=>t.locale==='hu')?.name||item.slug;}
function hydrate(item:CatalogRecord,k:Kind):FormBody{
 const translations=Object.fromEntries(transList(item,k).map(x=>[x.locale,{...emptyTranslation(),...x}]));
 if(!translations.hu)translations.hu=emptyTranslation();
 if(!translations.en)translations.en=emptyTranslation();
 return {id:item.id,slug:item.slug,primary_attribute:item.primary_attribute,secondary_attribute:item.secondary_attribute,
  image_path:item.image_path||'',is_published:item.is_published,resistances:item.resistances||[],
  translations,bonuses:Object.fromEntries(bonusList(item,k).map(b=>[b.skill_id,b.bonus_pips]))};
}
function editorSelect(k:Kind){
 const trans=k==='species'?'game_species_i18n(locale,name,description,passives)':'game_classes_i18n(locale,name,description,starting_equipment,traits,gameplay_role)';
 return '*, '+trans+', '+bonusTable(k)+'(skill_id,bonus_pips)';
}
export default function Editor({locale,onBack}:{locale:string;onBack:()=>void}){
 const l=locale==='en'?'en':'hu',dict=ui[l],t=(key:UiKey)=>dict[key];
 const [kind,setKind]=useState<Kind>('species'),[tab,setTab]=useState<Tab>('general');
 const [records,setRecords]=useState<CatalogRecord[]>([]);
 const [counts,setCounts]=useState({species:0,classes:0});
 const [skills,setSkills]=useState<Skill[]>([]);
 const [locales,setLocales]=useState<LocaleRow[]>([{code:'hu',native_name:'Magyar',name_en:'Hungarian',is_enabled:true,sort_order:0},{code:'en',native_name:'English',name_en:'English',is_enabled:true,sort_order:1}]);
 const [editLocale,setEditLocale]=useState('hu');
 const [form,setForm]=useState<FormBody>(emptyForm);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [modal,setModal]=useState<'delete'|'discard'|null>(null);
 const pending=useRef<(()=>void)|null>(null);
 const [languageForm,setLanguageForm]=useState({code:'',native_name:'',name_en:''});
 const [showAddLanguage,setShowAddLanguage]=useState(false);
 const refresh=useCallback(async(k:Kind,keep?:string)=>{
   setLoading(true);setError('');
   const other=k==='species'?'classes':'species';
   const [cat,sk,lang,otherCount]=await Promise.all([
     supabase.from(table(k)).select(editorSelect(k)).order('created_at'),
     supabase.from('game_skills').select('id,slug,attribute,is_combat,position,game_skills_i18n(locale,name)').order('attribute').order('position'),
     supabase.from('game_locales').select('code,native_name,name_en,is_enabled,sort_order').eq('is_enabled',true).order('sort_order'),
     supabase.from(table(other)).select('id',{head:true,count:'exact'})
   ]);
   if(cat.error||sk.error||lang.error||otherCount.error){
     setError(cat.error?.message||sk.error?.message||lang.error?.message||otherCount.error?.message||t('loadError'));
     setLoading(false);return;
   }
   const items=cat.data as unknown as CatalogRecord[];
   setRecords(items);setSkills(sk.data as unknown as Skill[]);setLocales(lang.data as LocaleRow[]);
   setCounts(v=>({...v,[k]:items.length,[other]:otherCount.count||0}));
   const picked=items.find(x=>x.id===keep)||items[0];
   setForm(picked?hydrate(picked,k):emptyForm());
   setDirty(false);setLoading(false);
 },[l]);
 useEffect(()=>{void refresh(kind);},[kind,refresh]);
 const navigate=(fn:()=>void)=>{if(dirty){pending.current=fn;setModal('discard');}else fn();};
 const chooseKind=(k:Kind)=>{if(k===kind)return;navigate(()=>{setKind(k);setTab('general');setMessage('');setError('');});};
 const chooseRecord=(item:CatalogRecord)=>navigate(()=>{setForm(hydrate(item,kind));setDirty(false);setMessage('');setError('');setTab('general');});
 const createNew=()=>navigate(()=>{setForm(emptyForm());setDirty(false);setMessage('');setError('');setTab('general');});
 const update=(patch:Partial<FormBody>)=>{setForm(prev=>({...prev,...patch}));setDirty(true);setMessage('');};
 const setTranslation=(lang:string,key:keyof TranslationBody,val:string)=>{setForm(prev=>({...prev,translations:{...prev.translations,[lang]:{...emptyTranslation(),...prev.translations[lang],[key]:val}}}));setDirty(true);setMessage('');};
 const updateSkill=(id:string,pips:number)=>{setForm(prev=>{const bonuses={...prev.bonuses};if(!pips)delete bonuses[id];else bonuses[id]=pips;return {...prev,bonuses};});setDirty(true);setMessage('');};
 const save=async(e:FormEvent)=>{e.preventDefault();if(busy)return;setError('');setMessage('');
   if(!form.translations.hu?.name.trim()||!form.translations.en?.name.trim()){setTab('dictionary');setError(t('required'));return;}
   if(form.primary_attribute===form.secondary_attribute){setTab('general');setError(t('different'));return;}
   if(form.image_path.trim()&&!form.image_path.trim().startsWith('hatarvilag/')){setTab('general');setError(t('imageError'));return;}
   const slug=slugify(form.slug||form.translations.hu.name);
   if(!slug){setTab('general');setError(t('required'));return;}
   setBusy(true);
   try{
     let id=form.id;
     const data={slug,primary_attribute:form.primary_attribute,secondary_attribute:form.secondary_attribute,
       image_path:form.image_path.trim()||null,is_published:form.is_published,...(kind==='species'?{resistances:form.resistances}:{})};
     if(id){const result=await supabase.from(table(kind)).update(data).eq('id',id);if(result.error)throw result.error;}
     else {const result=await supabase.from(table(kind)).insert(data).select('id').single();if(result.error)throw result.error;id=result.data.id;}
     const rows=Object.entries(form.translations).filter(([code,value])=>(code==='hu'||code==='en'||value.name.trim())&&value.name.trim()).map(([code,value])=>({
       [foreignKey(kind)]:id,locale:code,name:value.name.trim(),description:value.description.trim(),
       ...(kind==='species'?{passives:value.passives.trim()}:{starting_equipment:value.starting_equipment.trim(),traits:value.traits.trim(),gameplay_role:value.gameplay_role.trim()})
     }));
     const translations=await supabase.from(i18nTable(kind)).upsert(rows,{onConflict:foreignKey(kind)+',locale'});
     if(translations.error)throw translations.error;
     const list=Object.entries(form.bonuses).filter(([,pip])=>pip>0).map(([skill_id,bonus_pips])=>({skill_id,bonus_pips}));
     const replaced=await supabase.rpc('replace_catalog_skill_bonuses',{p_kind:kind,p_entity_id:id,p_bonuses:list});
     if(replaced.error)throw replaced.error;
     await refresh(kind,id);setMessage(t('saved'));
   }catch(err){setError(err instanceof Error?err.message:t('saveError'));}
   finally{setBusy(false);}
 };
 const remove=async()=>{if(!form.id||busy)return;setBusy(true);
   const r=await supabase.from(table(kind)).delete().eq('id',form.id);
   setBusy(false);setModal(null);
   if(r.error){setError(r.error.message);return;}
   await refresh(kind);setMessage(t('deleted'));setTab('general');
 };
 const addLocale=async(e:FormEvent)=>{e.preventDefault();
   const code=languageForm.code.trim().toLowerCase();
   if(!/^[a-z]{2}$/.test(code)){setError(t('localeInvalid'));return;}
   if(!languageForm.native_name.trim()||!languageForm.name_en.trim()){setError(t('localeInvalid'));return;}
   setError('');
   const r=await supabase.from('game_locales').insert({code,native_name:languageForm.native_name.trim(),name_en:languageForm.name_en.trim(),sort_order:locales.length});
   if(r.error){setError(r.error.message||t('localeError'));return;}
   setLocales(prev=>[...prev,{code,native_name:languageForm.native_name.trim(),name_en:languageForm.name_en.trim(),is_enabled:true,sort_order:prev.length}]);
   setEditLocale(code);setLanguageForm({code:'',native_name:'',name_en:''});setShowAddLanguage(false);
 };
 const skillGroups=useMemo(()=>attrs.map(a=>({attr:a,skills:skills.filter(s=>s.attribute===a).sort((a,b)=>a.position-b.position)})),[skills]);
 const countBonuses=Object.values(form.bonuses).filter(n=>n>0).length;
 const selectedLanguage=locales.find(x=>x.code===editLocale);
 const langContent={...emptyTranslation(),...form.translations[editLocale]};
 const translationFields:(keyof TranslationBody)[]=kind==='species'?['name','description','passives']:['name','description','starting_equipment','traits','gameplay_role'];
 const fieldLabels:Record<keyof TranslationBody,string>={name:t('name'),description:t('description'),passives:t('passives'),
   starting_equipment:t('equipment'),traits:t('traits'),gameplay_role:t('role')};
 return <div className="ed-layout"><div className="ed-shell">
   <nav className="ed-nav" aria-label={t('title')}>
     <h2>{t('title')}</h2>
     <button type="button" onClick={()=>navigate(onBack)}>⌂　{t('back')}</button>
     <button type="button" className={kind==='species'?'active':''} onClick={()=>chooseKind('species')}>◈　{t('species')} <span>{counts.species}</span></button>
     <button type="button" className={kind==='classes'?'active':''} onClick={()=>chooseKind('classes')}>✥　{t('classes')} <span>{counts.classes}</span></button>
     <div className="ed-nav-bottom"><span className="ed-online"/> EDITOR <p>SPACE D6 FREE</p></div>
   </nav>
   <aside className="ed-roster">
     <div className="ed-roster-top"><strong>{kind==='species'?t('species'):t('classes')} ({records.length})</strong>
       <button type="button" onClick={createNew}>＋ {kind==='species'?t('newSpecies'):t('newClass')}</button>
     </div>
     <div className="ed-roster-list">{loading?<p>{t('loading')}</p>:records.length===0?<p>{t('noRecords')}</p>:records.map(item=>
       <button type="button" key={item.id} className={'ed-record '+(form.id===item.id?'selected':'')} onClick={()=>chooseRecord(item)}>
         <span className="ed-thumbnail">{item.image_path?<img alt="" loading="lazy" src={picture(item.image_path)}/>:<span>◈</span>}</span>
         <span className="ed-record-name"><strong>{translated(item,kind,l)}</strong><small>{attrNames[l][item.primary_attribute]} +1D / {attrNames[l][item.secondary_attribute]} +1</small></span>
         <span className={item.is_published?'ed-pub':'ed-draft'}>{item.is_published?'●':'○'}</span>
       </button>)}
     </div>
   </aside>
   <section className="ed-editor">
     <header className="ed-editor-head"><strong>{form.id?form.translations[l]?.name||form.translations.hu?.name||form.slug:t('create')}</strong>
       <span>{kind==='species'?t('species'):t('classes')}</span>
     </header>
     <nav className="ed-tabs" aria-label={t('title')}>
       {(['general','skills','dictionary'] as Tab[]).map(x=>
         <button type="button" key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{t(x)}</button>)}
     </nav>
     {error&&<div className="ed-feedback ed-error" role="alert">{error}</div>}
     {message&&<div className="ed-feedback ed-success" role="status">{message}</div>}
     <form className="ed-form" id="ed-form" onSubmit={save}>
       {tab==='general'&&<div className="ed-tab-pane">
         <div className="ed-general-grid">
           <div className="ed-image-area"><div className="ed-image-frame">
             {form.image_path?<img src={picture(form.image_path)} alt={form.translations.hu?.name||t('portrait')}/>:<div className="ed-placeholder">◈<small>{t('missing')}</small></div>}
             </div><label>{t('image')}<input value={form.image_path} onChange={e=>update({image_path:e.target.value})} placeholder="hatarvilag/species/..." /></label>
           </div>
           <div className="ed-general-fields">
             <label>{t('slug')}<input value={form.slug} onChange={e=>update({slug:e.target.value})} placeholder="slug" required/></label>
             <div className="ed-two-fields">
               <label>{t('primary')} <em>+1D</em><select value={form.primary_attribute} onChange={e=>update({primary_attribute:e.target.value as Attr})}>{attrs.map(a=><option value={a} key={a}>{attrNames[l][a]}</option>)}</select></label>
               <label>{t('secondary')} <em>+1</em><select value={form.secondary_attribute} onChange={e=>update({secondary_attribute:e.target.value as Attr})}>{attrs.map(a=><option value={a} key={a}>{attrNames[l][a]}</option>)}</select></label>
             </div>
             {kind==='species'?<div className="ed-resistance-box"><h3>{t('resistances')}</h3>
               {form.resistances.map((row,i)=><div className="ed-resistance-row" key={i}>
                 <select aria-label={t('resistances')} value={row.code} onChange={e=>update({resistances:form.resistances.map((r,j)=>i===j?{...r,code:e.target.value}:r)})}>{resistanceCodes.map((code,n)=><option key={code} value={code}>{resistanceNames[l][n]}</option>)}</select>
                 <input type="number" min={-100} max={100} aria-label="%" value={row.value} onChange={e=>update({resistances:form.resistances.map((r,j)=>i===j?{...r,value:Number(e.target.value)}:r)})}/><span>%</span>
                 <button type="button" aria-label="Remove" onClick={()=>update({resistances:form.resistances.filter((_,j)=>i!==j)})}>×</button>
               </div>)}
               <button type="button" className="ed-secondary-button" disabled={form.resistances.length>=12} onClick={()=>update({resistances:[...form.resistances,{code:'kinetic',value:10}]})}>＋ {t('addResistance')}</button>
             </div>:<div className="ed-general-help">{t('langInfo')}</div>}
             <label className="ed-checkbox"><input type="checkbox" checked={form.is_published} onChange={e=>update({is_published:e.target.checked})}/>{form.is_published?t('published'):t('draft')}</label>
           </div>
         </div>
         <p className="ed-tab-help">{t('langInfo')}</p>
       </div>}
       {tab==='skills'&&<div className="ed-tab-pane">
         <p className="ed-tab-help">{t('bonusInfo')}</p>
         <p className="ed-bonus-summary">{t('skillTotal')}: <strong>{countBonuses}</strong></p>
         <div className="ed-skill-groups">{skillGroups.map(g=><section className={'ed-skill-group ed-attr-'+g.attr} key={g.attr}>
           <h3>{attrNames[l][g.attr]} <span>{form.primary_attribute===g.attr?'+1D':form.secondary_attribute===g.attr?'+1':''}</span></h3>
           {g.skills.length===0?<p>{t('noSkill')}</p>:g.skills.map(s=><div className="ed-skill-row" key={s.id}>
             <label htmlFor={'skill-'+s.id}>{s.game_skills_i18n.find(x=>x.locale===l)?.name||s.game_skills_i18n.find(x=>x.locale==='hu')?.name||s.slug}
               {s.is_combat&&<span className="ed-combat">{t('combat')}</span>}</label>
             <select id={'skill-'+s.id} aria-label={t('bonusLabel')} value={form.bonuses[s.id]||0} onChange={e=>updateSkill(s.id,Number(e.target.value))}>
               {bonusOptions.map(pips=><option key={pips} value={pips}>{pips?asDice(pips):t('bonusNone')}</option>)}
             </select>
           </div>)}
         </section>)}</div>
       </div>}
       {tab==='dictionary'&&<div className="ed-tab-pane">
         <p className="ed-tab-help">{t('langInfo')}</p>
         <div className="ed-language-list" role="tablist" aria-label={t('language')}>
           {locales.map(row=><button key={row.code} type="button" role="tab" aria-selected={editLocale===row.code} className={editLocale===row.code?'active':''} onClick={()=>setEditLocale(row.code)}>
             {row.native_name} <small>{row.code.toUpperCase()}</small>
             {form.translations[row.code]?.name?.trim()?<span className="ed-translated">●</span>:<span className="ed-untranslated">○</span>}
           </button>)}
         </div>
         <div className="ed-dictionary-fields"><div className="ed-dictionary-title"><h3>{selectedLanguage?.native_name||editLocale}</h3><span>{editLocale.toUpperCase()}</span></div>
           {translationFields.map(field=><label key={field}>{fieldLabels[field]} {field==='name'&&<em>*</em>}
             {field==='name'?<input value={langContent[field]} onChange={e=>setTranslation(editLocale,field,e.target.value)}/>:<textarea rows={field==='description'?4:3} value={langContent[field]} onChange={e=>setTranslation(editLocale,field,e.target.value)}/>}
           </label>)}
         </div>
         <div className="ed-new-language">
           <button type="button" className="ed-secondary-button" onClick={()=>setShowAddLanguage(!showAddLanguage)}>＋ {t('addLanguage')}</button>
           {showAddLanguage&&<div className="ed-language-form">
             <label>{t('newLangCode')}<input value={languageForm.code} onChange={e=>setLanguageForm(p=>({...p,code:e.target.value}))} maxLength={2}/></label>
             <label>{t('newLangName')}<input value={languageForm.native_name} onChange={e=>setLanguageForm(p=>({...p,native_name:e.target.value}))}/></label>
             <label>{t('newLangEnglish')}<input value={languageForm.name_en} onChange={e=>setLanguageForm(p=>({...p,name_en:e.target.value}))}/></label>
             <button type="button" className="ed-submit" onClick={()=>void addLocale({preventDefault:()=>{}} as FormEvent)}>{t('add')}</button>
           </div>}
         </div>
       </div>}
     </form>
     <footer className="ed-footer"><span className={dirty?'ed-unsaved':'ed-fine'}>{dirty?'● '+t('edited'):'SPACE D6 FREE · HU / EN'}</span>
       {form.id&&<button type="button" className="ed-danger" disabled={busy} onClick={()=>setModal('delete')}>{t('delete')}</button>}
       <button type="submit" form="ed-form" className="ed-submit" disabled={busy}>{busy?t('saving'):t('save')}</button>
     </footer>
   </section>
   {modal&&<div className="ed-modal-mask"><div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="ed-modal-title">
     <h3 id="ed-modal-title">{modal==='delete'?t('delete'):t('unsaved')}</h3><p>{modal==='delete'?t('confirmDelete'):t('confirmLeave')}</p>
     <div><button type="button" onClick={()=>{setModal(null);pending.current=null;}}>{t('cancel')}</button>
       <button type="button" className="ed-danger" onClick={()=>{if(modal==='delete'){void remove();}else {setModal(null);setDirty(false);pending.current?.();pending.current=null;}}}>{modal==='delete'?t('delete'):t('discard')}</button>
     </div>
   </div></div>}
 </div></div>;
}
