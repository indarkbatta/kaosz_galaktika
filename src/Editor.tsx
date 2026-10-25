import {editorMessage} from './lib/editorMessages';
import {DecisionDialog,DiscardChangesDialog} from './components/DecisionDialog';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import './editor.css';
import {EditorFrame,EditorTabs,EditorRoster,EditorHeader,EditorFooter} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import {OriginResistances} from './components/OriginResistances';
import {BranchCombatFields,defaultBranchCombat,type BranchCombat} from './components/BranchCombatFields';
import {SkillArt} from './components/GameArt';

type Attr = 'body'|'mind'|'soul'|'morale'|'social';
type Kind = 'species'|'classes';
type Tab = 'general'|'combat'|'resistances'|'homeworld'|'skills'|'dictionary';
type LocaleRow = {code:string;native_name:string;name_en:string;is_enabled:boolean;sort_order:number};
type Translation = {locale:string;name:string;description:string;passives?:string;starting_equipment?:string;traits?:string;gameplay_role?:string};
type BonusRow = {skill_id:string;bonus_pips:number};
type WorldEntry={id:string;slug:string;is_published:boolean;name_hu:string;name_en:string};
type WorldQuadrant=WorldEntry&{galaxy_id:string};
type WorldSector=WorldEntry&{quadrant_id:string};
type WorldLocation={id:string;slug:string;sector_id:string;is_published:boolean;game_locations_i18n:{locale:string;name:string}[]};
type HomeworldPath={galaxy:string;quadrant:string;sector:string};
const emptyWorldPath=():HomeworldPath=>({galaxy:'',quadrant:'',sector:''});
type CatalogRecord = BranchCombat & {
  id:string;slug:string;primary_attribute:Attr;secondary_attribute:Attr;image_path:string|null;homeworld_location_id?:string|null;
  is_published:boolean;resistances?:{code:string;value:number}[];
  game_species_i18n?:Translation[];game_classes_i18n?:Translation[];
  game_species_skill_bonuses?:BonusRow[];game_classes_skill_bonuses?:BonusRow[];
};
type Skill = {id:string;slug:string;attribute:Attr;is_combat:boolean;is_active_defense?:boolean;icon_path:string|null;position:number;game_skills_i18n:{locale:string;name:string}[]};
type TranslationBody = {name:string;description:string;passives:string;starting_equipment:string;traits:string;gameplay_role:string};
type FormBody = BranchCombat & {
  id?:string;slug:string;primary_attribute:Attr;secondary_attribute:Attr;image_path:string;homeworld_location_id:string|null;is_published:boolean;
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
  description:'Leírás',passives:'Faji sajátosságok leírása',resistances:'Környezeti ellenállások (%)',equipment:'Kezdő felszerelés',
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
  portrait:'Portré',localizedFields:'Fordítható tartalom',noSkill:'Nincs képességadat.',close:'Bezárás',
  homeworld:'Homeworld · a faj kezdővilága',homeworldGalaxy:'Galaxis',homeworldQuadrant:'Kvadráns',homeworldSector:'Szektor / naprendszer',homeworldLocation:'Kezdőhelyszín',homeworldChoose:'Válassz…',
  homeworldDefault:'Nincs kijelölve: az új karakter a Határvidéki állomáson kezd.',homeworldSelected:'Az új karakter ezen a helyszínen kezd, és ezt ismeri meg először.',homeworldDraft:'Vázlat helyszín – publikált faj nem kezdhet itt.',homeworldMissing:'A kiválasztott kezdőhelyszín nem található.',homeworldLoadError:'Nem sikerült betölteni a galaktikus helyszíneket.'
},
en:{
  title:'Editor dashboard',back:'Return to game',species:'Species',classes:'Classes',newSpecies:'New species',newClass:'New class',
  general:'General',skills:'Skills',dictionary:'Dictionary',name:'Name',slug:'Technical identifier (slug)',
  primary:'Primary attribute',secondary:'Secondary attribute',image:'R2 image key',published:'Published',draft:'Draft',
  description:'Description',passives:'Species traits description',resistances:'Environmental resistances (%)',equipment:'Starting equipment',
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
  portrait:'Portrait',localizedFields:'Localised content',noSkill:'No skill data.',close:'Close',
  homeworld:'Homeworld · species starting location',homeworldGalaxy:'Galaxy',homeworldQuadrant:'Quadrant',homeworldSector:'Sector / star system',homeworldLocation:'Starting location',homeworldChoose:'Choose…',
  homeworldDefault:'Not set: new captains start at Frontier Station.',homeworldSelected:'New captains spawn here and discover this location first.',homeworldDraft:'Draft location – published species cannot spawn here.',homeworldMissing:'The selected starting location is unavailable.',homeworldLoadError:'Could not load the galactic locations.'
}};
type UiKey=keyof typeof ui.hu;
const emptyTranslation=():TranslationBody=>({name:'',description:'',passives:'',starting_equipment:'',traits:'',gameplay_role:''});
const emptyForm=():FormBody=>({...defaultBranchCombat(),slug:'',primary_attribute:'body',secondary_attribute:'mind',image_path:'',homeworld_location_id:null,is_published:false,resistances:[],translations:{hu:emptyTranslation(),en:emptyTranslation()},bonuses:{}});
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
 const translations:Record<string,TranslationBody>=Object.fromEntries(transList(item,k).map(x=>[x.locale,{...emptyTranslation(),...x}]));
 if(!translations.hu)translations.hu=emptyTranslation();
 if(!translations.en)translations.en=emptyTranslation();
 return {hp_per_rank:item.hp_per_rank??5,passive_defenses:item.passive_defenses??defaultBranchCombat().passive_defenses,combat_resistances:item.combat_resistances??{},id:item.id,slug:item.slug,primary_attribute:item.primary_attribute,secondary_attribute:item.secondary_attribute,
  image_path:item.image_path||'',homeworld_location_id:item.homeworld_location_id||null,is_published:item.is_published,resistances:item.resistances||[],
  translations,bonuses:Object.fromEntries(bonusList(item,k).map(b=>[b.skill_id,b.bonus_pips]))};
}
function editorSelect(k:Kind){
 const trans=k==='species'?'game_species_i18n(locale,name,description,passives)':'game_classes_i18n(locale,name,description,starting_equipment,traits,gameplay_role)';
 return '*, '+trans+', '+bonusTable(k)+'(skill_id,bonus_pips)';
}
export default function Editor({locale,onBack,kind,onKindChange,onSectionSelect,initialTab='general',activeSection}:{locale:string;onBack:()=>void;kind:Kind;onKindChange:(kind:Kind)=>void;onSectionSelect:(section:EditorSection)=>void;initialTab?:Tab;activeSection?:EditorSection}){
 const l=locale==='en'?'en':'hu',dict=ui[l],t=(key:UiKey)=>dict[key];
 const [skillAttribute,setSkillAttribute]=useState<Attr>('body'),[dictionaryField,setDictionaryField]=useState<keyof TranslationBody>('description'),[recordPage,setRecordPage]=useState(0),[resistancePage,setResistancePage]=useState(0);
 const [tab,setTab]=useState<Tab>(initialTab);
 const [records,setRecords]=useState<CatalogRecord[]>([]);
 const [worldGalaxies,setWorldGalaxies]=useState<WorldEntry[]>([]);
 const [worldQuadrants,setWorldQuadrants]=useState<WorldQuadrant[]>([]);
 const [worldSectors,setWorldSectors]=useState<WorldSector[]>([]);
 const [worldLocations,setWorldLocations]=useState<WorldLocation[]>([]);
 const [homeworldPath,setHomeworldPath]=useState<HomeworldPath>(emptyWorldPath);
 const [counts,setCounts]=useState({species:0,classes:0});
 const [skills,setSkills]=useState<Skill[]>([]);
 const [locales,setLocales]=useState<LocaleRow[]>([{code:'hu',native_name:'Magyar',name_en:'Hungarian',is_enabled:true,sort_order:0},{code:'en',native_name:'English',name_en:'English',is_enabled:true,sort_order:1}]);
 const [editLocale,setEditLocale]=useState('hu');
 const [form,setForm]=useState<FormBody>(emptyForm);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{if(error)notify(error,'error');},[error]);
 useEffect(()=>{if(message)notify(message,'success');},[message]);
 const [modal,setModal]=useState<'delete'|'discard'|null>(null);
 const pending=useRef<(()=>void)|null>(null);
 const [languageForm,setLanguageForm]=useState({code:'',native_name:'',name_en:''});
 const [showAddLanguage,setShowAddLanguage]=useState(false);
 // The editor is the only place choosing the spawn point; the trigger determines
 // the real character position at creation, without trusting a client-supplied ID.
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const [galaxies,quadrants,sectors,locations]=await Promise.all([
    supabase.from('game_galaxies').select('id,slug,name_hu,name_en,is_published').order('slug'),
    supabase.from('game_quadrants').select('id,slug,galaxy_id,name_hu,name_en,is_published').order('slug'),
    supabase.from('game_sectors').select('id,slug,quadrant_id,name_hu,name_en,is_published').order('slug'),
    supabase.from('game_locations').select('id,slug,sector_id,is_published,game_locations_i18n(locale,name)').order('slug')
   ]);
   if(!live)return;
   const err=galaxies.error||quadrants.error||sectors.error||locations.error;
   if(err){notify(t('homeworldLoadError')+' '+err.message,'error');return;}
   setWorldGalaxies((galaxies.data||[]) as WorldEntry[]);
   setWorldQuadrants((quadrants.data||[]) as WorldQuadrant[]);
   setWorldSectors((sectors.data||[]) as WorldSector[]);
   setWorldLocations((locations.data||[]) as WorldLocation[]);
  })();
  return()=>{live=false;};
 },[]);
 useEffect(()=>{
  if(kind!=='species'||!form.homeworld_location_id)return;
  const location=worldLocations.find(row=>row.id===form.homeworld_location_id);
  const sector=worldSectors.find(row=>row.id===location?.sector_id);
  const quadrant=worldQuadrants.find(row=>row.id===sector?.quadrant_id);
  if(location&&sector&&quadrant){
   setHomeworldPath({galaxy:quadrant.galaxy_id,quadrant:quadrant.id,sector:sector.id});
  }
 },[kind,form.id,form.homeworld_location_id,worldLocations,worldSectors,worldQuadrants]);
 const refresh=useCallback(async(k:Kind,keep?:string)=>{
   setLoading(true);setError('');
   const other=k==='species'?'classes':'species';
   const [cat,sk,lang,otherCount]=await Promise.all([
     supabase.from(table(k)).select(editorSelect(k)).order('created_at'),
     supabase.from('game_skills').select('id,slug,attribute,is_combat,is_active_defense,position,icon_path,game_skills_i18n(locale,name)').order('attribute').order('position'),
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
   const picked=items.find(x=>x.id===keep)||items[0];setRecordPage(Math.floor(Math.max(0,items.findIndex(x=>x.id===picked?.id))/4));
   // Keep the selected hierarchy when refreshing the same saved Homeworld.
   // A blank/default homeworld explicitly clears the cascade.
   if(!picked?.homeworld_location_id)setHomeworldPath(emptyWorldPath());
   setForm(picked?hydrate(picked,k):emptyForm());
   setDirty(false);setLoading(false);
 },[]);
 useEffect(()=>{void refresh(kind);},[kind,refresh]);
 const navigate=(fn:()=>void)=>{if(dirty){pending.current=fn;setModal('discard');}else fn();};
 const chooseKind=(k:Kind)=>{if(k===kind)return;navigate(()=>{onKindChange(k);setRecordPage(0);setResistancePage(0);setTab('general');setMessage('');setError('');});};
 const chooseRecord=(item:CatalogRecord)=>navigate(()=>{setResistancePage(0);setHomeworldPath(emptyWorldPath());setForm(hydrate(item,kind));setDirty(false);setMessage('');setError('');setTab('general');});
 const createNew=()=>navigate(()=>{setHomeworldPath(emptyWorldPath());setForm(emptyForm());setDirty(false);setMessage('');setError('');setTab('general');});
 const update=(patch:Partial<FormBody>)=>{setForm(prev=>({...prev,...patch}));setDirty(true);setMessage('');};
 const setTranslation=(lang:string,key:keyof TranslationBody,val:string)=>{setForm(prev=>({...prev,translations:{...prev.translations,[lang]:{...emptyTranslation(),...prev.translations[lang],[key]:val}}}));setDirty(true);setMessage('');};
 const updateSkill=(id:string,pips:number)=>{setForm(prev=>{const bonuses={...prev.bonuses};if(!pips)delete bonuses[id];else bonuses[id]=pips;return {...prev,bonuses};});setDirty(true);setMessage('');};
 const save=async(e:FormEvent)=>{e.preventDefault();if(busy)return;setError('');setMessage('');
   if(!form.translations.hu?.name?.trim()||!form.translations.en?.name?.trim()){setTab('dictionary');setError(t('required'));return;}
   if(form.primary_attribute===form.secondary_attribute){setTab('general');setError(t('different'));return;}
   if(form.image_path.trim()&&!form.image_path.trim().startsWith('hatarvilag/')){setTab('general');setError(t('imageError'));return;}
   if(kind==='species'&&form.homeworld_location_id&&!worldLocations.some(loc=>loc.id===form.homeworld_location_id)){
    setTab('general');setError(t('homeworldMissing'));return;
   }
   if(['primary','secondary','tertiary'].some((rank,i)=>Object.values(form.passive_defenses).filter(v=>v===rank).length!==[1,2,2][i])){setTab('combat');setError(l==='hu'?'Áganként 1 elsődleges, 2 másodlagos és 2 harmadlagos passzív védelem szükséges.':'Each branch requires 1 primary, 2 secondary and 2 tertiary passive defenses.');return;}
   const slug=slugify(form.slug||form.translations.hu.name);
   if(!slug){setTab('general');setError(t('required'));return;}
   setBusy(true);
   try{
     let id=form.id;
     const data={hp_per_rank:form.hp_per_rank,passive_defenses:form.passive_defenses,combat_resistances:form.combat_resistances,slug,primary_attribute:form.primary_attribute,secondary_attribute:form.secondary_attribute,
       image_path:form.image_path.trim()||null,is_published:form.is_published,...(kind==='species'?{resistances:form.resistances,homeworld_location_id:form.homeworld_location_id}:{})};
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
   }catch(err){setError(editorMessage(err,locale));}
   finally{setBusy(false);}
 };
 const remove=async()=>{if(!form.id||busy)return;setBusy(true);
   const r=await supabase.from(table(kind)).delete().eq('id',form.id);
   setBusy(false);setModal(null);
   if(r.error){setError(editorMessage(r.error.message,locale));return;}
   await refresh(kind);setMessage(t('deleted'));setTab('general');
 };
 const addLocale=async()=>{
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
 const homeworldQuads=worldQuadrants.filter(q=>q.galaxy_id===homeworldPath.galaxy);
 const homeworldSectors=worldSectors.filter(s=>s.quadrant_id===homeworldPath.quadrant);
 const homeworldLocations=worldLocations.filter(loc=>loc.sector_id===homeworldPath.sector);
 const chosenHomeworld=worldLocations.find(loc=>loc.id===form.homeworld_location_id);
 const chosenSector=worldSectors.find(s=>s.id===homeworldPath.sector);
 const chosenQuadrant=worldQuadrants.find(q=>q.id===homeworldPath.quadrant);
 const chosenGalaxy=worldGalaxies.find(g=>g.id===homeworldPath.galaxy);
 const worldName=(entry:WorldEntry|undefined)=>entry?(l==='en'?entry.name_en:entry.name_hu):'';
 const locationName=(loc:WorldLocation|undefined)=>loc?
  loc.game_locations_i18n?.find(t=>t.locale===l)?.name||loc.game_locations_i18n?.find(t=>t.locale==='hu')?.name||loc.slug:'';
 const homeworldIsDraft=!!chosenHomeworld&&(!chosenHomeworld.is_published||!chosenSector?.is_published||!chosenQuadrant?.is_published||!chosenGalaxy?.is_published);
 const selectedLanguage=locales.find(x=>x.code===editLocale);
 const langContent={...emptyTranslation(),...form.translations[editLocale]};
 const translationFields:(keyof TranslationBody)[]=kind==='species'?['name','description','passives']:['name','description','starting_equipment','traits','gameplay_role'];
 const fieldLabels:Record<keyof TranslationBody,string>={name:t('name'),description:t('description'),passives:t('passives'),
   starting_equipment:t('equipment'),traits:t('traits'),gameplay_role:t('role')};
 return <EditorFrame className="ed-origin-editor">
   <EditorNavigation locale={locale} active={activeSection||kind} counts={counts} onBack={()=>navigate(onBack)}
   onSelect={section=>{if(section==='species'||section==='classes')chooseKind(section);else navigate(()=>onSectionSelect(section));}}/>
   <EditorRoster>
     <div className="ed-roster-top"><strong>{kind==='species'?t('species'):t('classes')} ({records.length})</strong>
       <button type="button" onClick={createNew}>＋ {kind==='species'?t('newSpecies'):t('newClass')}</button>
     </div>
     <div className="ed-roster-list">{loading?<p>{t('loading')}</p>:records.length===0?<p>{t('noRecords')}</p>:records.slice(Math.min(recordPage,Math.max(0,Math.ceil(records.length/4)-1))*4,Math.min(recordPage,Math.max(0,Math.ceil(records.length/4)-1))*4+4).map(item=>
       <button type="button" key={item.id} className={'ed-record '+(form.id===item.id?'selected':'')} onClick={()=>chooseRecord(item)}>
         <span className="ed-thumbnail">{item.image_path?<img alt="" loading="lazy" src={picture(item.image_path)}/>:<span>◈</span>}</span>
         <span className="ed-record-name"><strong>{translated(item,kind,l)}</strong><small>{attrNames[l][item.primary_attribute]} +1D / {attrNames[l][item.secondary_attribute]} +1</small></span>
         <span className={item.is_published?'ed-pub':'ed-draft'}>{item.is_published?'●':'○'}</span>
       </button>)}
     </div>
    {records.length>4&&<div className="ed-pager"><button type="button" disabled={recordPage===0} onClick={()=>setRecordPage(v=>v-1)}>←</button><span>{recordPage+1} / {Math.ceil(records.length/4)}</span><button type="button" disabled={(recordPage+1)*4>=records.length} onClick={()=>setRecordPage(v=>v+1)}>→</button></div>}
   </EditorRoster>
   <section className="ed-editor">
     <EditorHeader><strong>{form.id?form.translations[l]?.name||form.translations.hu?.name||form.slug:t('create')}</strong>
       <span>{kind==='species'?t('species'):t('classes')}</span>
     </EditorHeader>
     <EditorTabs label={t('title')} items={(['general','combat','resistances',...(kind==='species'?['homeworld' as const]:[]),'skills','dictionary'] as Tab[]).map(id=>({id,name:id==='combat'?(l==='hu'?'HP / védelem':'HP / defense'):id==='resistances'?(l==='hu'?'Ellenállások':'Resistances'):id==='homeworld'?(l==='hu'?'Kezdővilág':'Homeworld'):t(id as UiKey)}))} selected={tab} onSelect={id=>setTab(id as Tab)}/>

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
             <label className="ed-checkbox"><input type="checkbox" checked={form.is_published} onChange={e=>update({is_published:e.target.checked})}/>{form.is_published?t('published'):t('draft')}</label>
           </div>
         </div>
       </div>}
       {tab==='combat'&&<div className="ed-tab-pane ed-origin-settings"><BranchCombatFields locale={locale} value={form} onChange={update}/></div>}
       {tab==='homeworld'&&<div className="ed-tab-pane ed-origin-settings">             {kind==='species'&&<section className="ed-homeworld">
               <h3><span aria-hidden="true">✦</span> {t('homeworld')}</h3>
               <div className="ed-homeworld-fields">
                <label>{t('homeworldGalaxy')}
                 <select aria-label={t('homeworldGalaxy')} value={homeworldPath.galaxy}
                  onChange={e=>{setHomeworldPath({galaxy:e.target.value,quadrant:'',sector:''});update({homeworld_location_id:null});}}>
                  <option value="">{t('homeworldChoose')}</option>
                  {worldGalaxies.map(g=><option key={g.id} value={g.id}>{worldName(g)}</option>)}
                 </select>
                </label>
                <label>{t('homeworldQuadrant')}
                 <select aria-label={t('homeworldQuadrant')} value={homeworldPath.quadrant} disabled={!homeworldPath.galaxy}
                  onChange={e=>{setHomeworldPath({galaxy:homeworldPath.galaxy,quadrant:e.target.value,sector:''});update({homeworld_location_id:null});}}>
                  <option value="">{t('homeworldChoose')}</option>
                  {homeworldQuads.map(q=><option key={q.id} value={q.id}>{worldName(q)}</option>)}
                 </select>
                </label>
                <label>{t('homeworldSector')}
                 <select aria-label={t('homeworldSector')} value={homeworldPath.sector} disabled={!homeworldPath.quadrant}
                  onChange={e=>{setHomeworldPath({...homeworldPath,sector:e.target.value});update({homeworld_location_id:null});}}>
                  <option value="">{t('homeworldChoose')}</option>
                  {homeworldSectors.map(s=><option key={s.id} value={s.id}>{worldName(s)}</option>)}
                 </select>
                </label>
                <label>{t('homeworldLocation')}
                 <select aria-label={t('homeworldLocation')} value={form.homeworld_location_id||''} disabled={!homeworldPath.sector}
                  onChange={e=>update({homeworld_location_id:e.target.value||null})}>
                  <option value="">{t('homeworldChoose')}</option>
                  {homeworldLocations.map(loc=><option key={loc.id} value={loc.id}>{locationName(loc)}{!loc.is_published?' ◌':''}</option>)}
                 </select>
                </label>
               </div>
               <p className={homeworldIsDraft?'ed-homeworld-hint ed-homeworld-warning':'ed-homeworld-hint'}>
                {homeworldIsDraft?t('homeworldDraft'):chosenHomeworld?t('homeworldSelected'):t('homeworldDefault')}
               </p>
              </section>}
</div>}
       {tab==='resistances'&&<div className="ed-tab-pane ed-origin-settings"><OriginResistances locale={locale} value={form.combat_resistances} onChange={combat_resistances=>update({combat_resistances})} environment={kind==='species'?<>             {kind==='species'?<div className="ed-resistance-box"><h3>{t('resistances')}</h3>
               {form.resistances.slice(resistancePage*4,resistancePage*4+4).map((row,index)=>{const i=resistancePage*4+index;return <div className="ed-resistance-row" key={i}>
                 <select aria-label={t('resistances')} value={row.code} onChange={e=>update({resistances:form.resistances.map((r,j)=>i===j?{...r,code:e.target.value}:r)})}>{resistanceCodes.map((code,n)=><option key={code} value={code}>{resistanceNames[l][n]}</option>)}</select>
                 <input type="number" min={-100} max={100} aria-label="%" value={row.value} onChange={e=>update({resistances:form.resistances.map((r,j)=>i===j?{...r,value:Number(e.target.value)}:r)})}/><span>%</span>
                 <button type="button" aria-label="Remove" onClick={()=>update({resistances:form.resistances.filter((_,j)=>i!==j)})}>×</button>
               </div>})}
               <button type="button" className="ed-secondary-button" disabled={form.resistances.length>=12} onClick={()=>update({resistances:[...form.resistances,{code:'kinetic',value:10}]})}>＋ {t('addResistance')}</button>
             </div>:<div className="ed-general-help">{t('langInfo')}</div>}
<div className="ed-pager"><button type="button" disabled={resistancePage===0} onClick={()=>setResistancePage(v=>v-1)}>←</button><span>{resistancePage+1} / {Math.max(1,Math.ceil(form.resistances.length/4))}</span><button type="button" disabled={(resistancePage+1)*4>=form.resistances.length} onClick={()=>setResistancePage(v=>v+1)}>→</button></div></>:undefined}/></div>}
       {tab==='skills'&&<div className="ed-tab-pane">
         <p className="ed-tab-help">{t('bonusInfo')}</p>
         <p className="ed-bonus-summary">{t('skillTotal')}: <strong>{countBonuses}</strong></p>
         <nav className="ed-origin-subtabs" aria-label={l==='hu'?'Skillcsoport':'Skill group'}>{attrs.map(a=><button type="button" key={a} aria-pressed={a===skillAttribute} onClick={()=>setSkillAttribute(a)}>{attrNames[l][a]}</button>)}</nav><div className="ed-skill-groups">{skillGroups.filter(g=>g.attr===skillAttribute).map(g=><section className={'ed-skill-group ed-attr-'+g.attr} key={g.attr}>
           <h3>{attrNames[l][g.attr]} <span>{form.primary_attribute===g.attr?'+1D':form.secondary_attribute===g.attr?'+1':''}</span></h3>
           {g.skills.length===0?<p>{t('noSkill')}</p>:g.skills.map(s=><div className="ed-skill-row" key={s.id}>
             <label htmlFor={'skill-'+s.id}>{s.icon_path&&<SkillArt className="ed-skill-icon" slug={s.slug} path={s.icon_path}/>}{s.game_skills_i18n.find(x=>x.locale===l)?.name||s.game_skills_i18n.find(x=>x.locale==='hu')?.name||s.slug}
               {s.is_active_defense&&<span className="ed-combat">{l==='hu'?'Aktív védelem':'Active defense'}</span>}{s.is_combat&&<span className="ed-combat">{t('combat')}</span>}</label>
             <select id={'skill-'+s.id} aria-label={t('bonusLabel')} value={form.bonuses[s.id]||0} onChange={e=>updateSkill(s.id,Number(e.target.value))}>
               {bonusOptions.map(pips=><option key={pips} value={pips}>{pips?asDice(pips):t('bonusNone')}</option>)}
             </select>
           </div>)}
         </section>)}</div>
       </div>}
       {tab==='dictionary'&&<div className="ed-tab-pane">
         <div className="ed-language-list" role="tablist" aria-label={t('language')}>
           {locales.map(row=><button key={row.code} type="button" role="tab" aria-selected={editLocale===row.code} className={editLocale===row.code?'active':''} onClick={()=>setEditLocale(row.code)}>
             {row.native_name} <small>{row.code.toUpperCase()}</small>
             {form.translations[row.code]?.name?.trim()?<span className="ed-translated">●</span>:<span className="ed-untranslated">○</span>}
           </button>)}
         </div>
         <nav className="ed-origin-subtabs" aria-label={l==='hu'?'Szöveges mező':'Text field'}>{translationFields.filter(f=>f!=='name').map(f=><button type="button" key={f} aria-pressed={f===dictionaryField} onClick={()=>setDictionaryField(f)}>{fieldLabels[f]}</button>)}</nav><div className="ed-dictionary-fields"><div className="ed-dictionary-title"><h3>{selectedLanguage?.native_name||editLocale}</h3><span>{editLocale.toUpperCase()}</span></div>
           {translationFields.filter(field=>field==='name'||field===(translationFields.includes(dictionaryField)?dictionaryField:'description')).map(field=><label key={field}>{fieldLabels[field]} {field==='name'&&<em>*</em>}
             {field==='name'?<input value={langContent[field]} onChange={e=>setTranslation(editLocale,field,e.target.value)}/>:<textarea rows={field==='description'?4:3} value={langContent[field]} onChange={e=>setTranslation(editLocale,field,e.target.value)}/>}
           </label>)}
         </div>
         <div className="ed-new-language">
           <button type="button" className="ed-secondary-button" onClick={()=>setShowAddLanguage(!showAddLanguage)}>＋ {t('addLanguage')}</button>
           {showAddLanguage&&<div className="ed-language-form">
             <label>{t('newLangCode')}<input value={languageForm.code} onChange={e=>setLanguageForm(p=>({...p,code:e.target.value}))} maxLength={2}/></label>
             <label>{t('newLangName')}<input value={languageForm.native_name} onChange={e=>setLanguageForm(p=>({...p,native_name:e.target.value}))}/></label>
             <label>{t('newLangEnglish')}<input value={languageForm.name_en} onChange={e=>setLanguageForm(p=>({...p,name_en:e.target.value}))}/></label>
             <button type="button" className="ed-submit" onClick={()=>void addLocale()}>{t('add')}</button>
           </div>}
         </div>
       </div>}
     </form>
     <EditorFooter><span className={dirty?'ed-unsaved':'ed-fine'}>{dirty?'● '+t('edited'):'SPACE D6 FREE · HU / EN'}</span>
       {form.id&&<button type="button" className="ed-danger" disabled={busy} onClick={()=>setModal('delete')}>{t('delete')}</button>}
       <button type="submit" form="ed-form" className="ed-submit" disabled={busy}>{busy?t('saving'):t('save')}</button>
     </EditorFooter>
   </section>
   {modal==='delete'?<DecisionDialog danger title={locale==='en'?`Delete “${form.slug}”?`:`Törlöd ezt: „${form.slug}”?`} description={locale==='en'?'The entry will be permanently removed. This cannot be undone. Existing references may prevent deletion.':'A bejegyzés véglegesen törlődik; ezt nem lehet visszavonni. A rá hivatkozó tartalmak megakadályozhatják a törlést.'} confirmLabel={locale==='en'?'Delete entry':'Bejegyzés törlése'} cancelLabel={locale==='en'?'Keep entry':'Bejegyzés megtartása'} onCancel={()=>{setModal(null);pending.current=null;}} onConfirm={()=>void remove()} disabled={busy}/>:modal&&<DiscardChangesDialog locale={locale} onCancel={()=>{setModal(null);pending.current=null;}} onDiscard={()=>{setModal(null);setDirty(false);pending.current?.();pending.current=null;}}/>}
 </EditorFrame>;
}
