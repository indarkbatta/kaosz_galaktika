import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {EditorFrame,EditorTabs} from './components/EditorTemplate';
import './skill-editor.css';
import {SkillArt} from './components/GameArt';
type Attr='body'|'mind'|'soul'|'morale'|'social';
type Locale={code:string;native_name:string};
type Translation={locale:string;name:string;description:string};
type Skill={id:string;slug:string;attribute:Attr;position:number;is_combat:boolean;icon_path:string|null;game_skills_i18n:Translation[]};
type Rules={id:number;base_attribute_pips:number;free_attribute_pips:number;max_attribute_pips:number;free_skill_pips:number;max_allocated_skill_pips:number};
const attrs:Attr[]=['body','mind','soul','morale','social'];
const attrsHu:Record<Attr,string>={body:'Test',mind:'Elme',soul:'Lélek',morale:'Morál',social:'Szociális'};
const attrsEn:Record<Attr,string>={body:'Body',mind:'Mind',soul:'Soul',morale:'Morale',social:'Social'};
const initialRules:Rules={id:1,base_attribute_pips:3,free_attribute_pips:6,max_attribute_pips:18,free_skill_pips:6,max_allocated_skill_pips:6};
const tx={
 hu:{title:'Skill Editor',back:'Vissza',skills:'Skillek',rules:'Szabályok',description:'Képesség leírása',name:'Név',icon:'Ikon R2 útvonala',slot:'Hozzárendelés',combat:'Harci skill',general:'Általános skill',save:'Mentés',saved:'Mentve.',error:'Mentési hiba.',needNames:'Magyar és angol név kötelező.',iconError:'Csak a hatarvilag/skills/ mappa fájljai használhatók.',noIcon:'Nincs ikon',rulesIntro:'Ezekből az értékekből számítja ki a szerver az új kapitány induló statisztikáit.',base_attribute_pips:'Tulajdonság alap (pip)',free_attribute_pips:'Kiosztható tulajdonságpontok',max_attribute_pips:'Maximum tulajdonság (pip)',free_skill_pips:'Kiosztható skillpontok',max_allocated_skill_pips:'Maximum szabad skillpont / skill',fixed:'A 25 kezdő képesség helye rögzített: tulajdonságonként 4 normál + 1 harci. A nevük, leírásuk és ikonjuk szerkeszthető.',language:'Szótár',preview:'Előnézet',loading:'Betöltés…'},
 en:{title:'Skill Editor',back:'Back',skills:'Skills',rules:'Rules',description:'Skill description',name:'Name',icon:'R2 icon key',slot:'Assignment',combat:'Combat skill',general:'General skill',save:'Save',saved:'Saved.',error:'Could not save.',needNames:'Hungarian and English names are required.',iconError:'Only objects inside hatarvilag/skills/ are supported.',noIcon:'No icon',rulesIntro:'These settings control server-side initial captain generation.',base_attribute_pips:'Base attribute (pips)',free_attribute_pips:'Assignable attribute pips',max_attribute_pips:'Max attribute (pips)',free_skill_pips:'Assignable skill pips',max_allocated_skill_pips:'Max free pips per skill',fixed:'The 25 starting skill slots are fixed: each attribute has four general and one combat skill. Names, descriptions and icons are editable.',language:'Dictionary',preview:'Preview',loading:'Loading…'}
};
const fields:(Exclude<keyof Rules,'id'>)[]=['base_attribute_pips','free_attribute_pips','max_attribute_pips','free_skill_pips','max_allocated_skill_pips'];
export default function SkillEditor({locale,onBack}:{locale:string;onBack:()=>void}){
 const l=locale==='en'?'en':'hu',t=tx[l];
 const [items,setItems]=useState<Skill[]>([]);
 const [allLocales,setAllLocales]=useState<Locale[]>([{code:'hu',native_name:'Magyar'},{code:'en',native_name:'English'}]);
 const [selected,setSelected]=useState('');
 const [tab,setTab]=useState('skills');
 const [lang,setLang]=useState('hu');
 const [names,setNames]=useState<Record<string,{name:string;description:string}>>({});
 const [icon,setIcon]=useState('');
 const [rules,setRules]=useState<Rules>(initialRules);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const read=useCallback(async(keep?:string)=>{
  const [s,localeList,rule]=await Promise.all([
   supabase.from('game_skills').select('id,slug,attribute,position,is_combat,icon_path,game_skills_i18n(locale,name,description)').order('attribute').order('position'),
   supabase.from('game_locales').select('code,native_name').eq('is_enabled',true).order('sort_order'),
   supabase.from('game_rules').select('*').eq('id',1).single()
  ]);
  if(s.error||localeList.error||rule.error){setError(s.error?.message||localeList.error?.message||rule.error?.message||t.error);setLoading(false);return;}
  const result=s.data as unknown as Skill[];
  setItems(result);setAllLocales(localeList.data as Locale[]);setRules(rule.data as Rules);
  const entry=result.find(x=>x.id===(keep||selected))||result[0]; if(entry)pick(entry);
  setLoading(false);
 },[]);
 function pick(entry:Skill){
  setSelected(entry.id);setIcon(entry.icon_path||'');
  setNames(Object.fromEntries(entry.game_skills_i18n.map(x=>[x.locale,{name:x.name,description:x.description||''}])));
  setError('');setMessage('');
 }
 useEffect(()=>{void read();},[read]);
 const active=items.find(i=>i.id===selected);
 const trans=(skill:Skill)=>skill.game_skills_i18n.find(x=>x.locale===l)?.name||skill.game_skills_i18n.find(x=>x.locale==='hu')?.name||skill.slug;
 const group=useMemo(()=>attrs.map(attr=>({attr,items:items.filter(i=>i.attribute===attr)})),[items]);
 const save=async(e:FormEvent)=>{e.preventDefault();setError('');setMessage('');
   if(busy)return;setBusy(true);
   try{
    if(tab==='rules'){
      const data=Object.fromEntries(fields.map(key=>[key,Number(rules[key])]));
      const r=await supabase.from('game_rules').update(data).eq('id',1);
      if(r.error)throw r.error;
    }else{
      if(!active)throw new Error(t.error);
      if(!names.hu?.name?.trim()||!names.en?.name?.trim())throw new Error(t.needNames);
      if(icon&&!/^hatarvilag\/skills\/[a-z0-9_-]+\.(png|jpg|webp)$/.test(icon))throw new Error(t.iconError);
      const r=await supabase.from('game_skills').update({icon_path:icon||null}).eq('id',active.id);
      if(r.error)throw r.error;
      const data=Object.entries(names).filter(([code,x])=>((code==='hu'||code==='en')||x.name.trim())&&x.name.trim()).map(([code,x])=>({skill_id:active.id,locale:code,name:x.name.trim(),description:x.description.trim()}));
      const res=await supabase.from('game_skills_i18n').upsert(data,{onConflict:'skill_id,locale'});
      if(res.error)throw res.error;
    }
    await read(active?.id);setMessage(t.saved);
   }catch(e){setError(e instanceof Error?e.message:t.error);}finally{setBusy(false);}
 };
 const curr={name:names[lang]?.name||'',description:names[lang]?.description||''};
 return <EditorFrame>
   <nav className="ed-nav"><h2>{t.title}</h2><button type="button" onClick={onBack}>⌂　{t.back}</button>
    <button type="button" className={tab==='skills'?'active':''} onClick={()=>setTab('skills')}>◈　{t.skills}</button>
    <button type="button" className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>⚙　{t.rules}</button>
    <div className="ed-nav-bottom">SPACE D6 FREE</div>
   </nav>
   <aside className="ed-roster"><div className="ed-roster-top"><strong>{t.skills} ({items.length})</strong></div>
    <div className="ed-roster-list sk-roster">{loading?<p>{t.loading}</p>:group.map(g=><div key={g.attr} className="sk-group">
     <div className="sk-group-name">{l==='hu'?attrsHu[g.attr]:attrsEn[g.attr]}</div>
     {g.items.map(s=><button type="button" className={'ed-record '+(selected===s.id?'selected':'')} onClick={()=>{pick(s);setTab('skills');}} key={s.id}>
      <span className="ed-thumbnail"><SkillArt slug={s.slug} path={s.icon_path}/></span>
      <span className="ed-record-name"><strong>{trans(s)}</strong><small>{s.is_combat?t.combat:t.general}</small></span>
     </button>)}
    </div>)}</div>
   </aside>
   <section className="ed-editor"><header className="ed-editor-head"><strong>{tab==='rules'?t.rules:active?trans(active):t.skills}</strong><span>SPACE D6</span></header>
    <EditorTabs label={t.title} selected={tab} onSelect={setTab} items={[{id:'skills',name:t.skills},{id:'rules',name:t.rules}]}/>
    {error&&<div className="ed-feedback ed-error" role="alert">{error}</div>}
    {message&&<div className="ed-feedback ed-success" role="status">{message}</div>}
    <form className="ed-form" id="skills-editor-form" onSubmit={save}>
     {tab==='skills'&&active&&<div className="ed-tab-pane sk-editor-fields">
       <div className="sk-icon-row"><div className="sk-large-icon">{icon?<SkillArt slug={active.slug} path={icon}/>:<span>◈</span>}</div>
        <div><strong>{l==='hu'?attrsHu[active.attribute]:attrsEn[active.attribute]}</strong><p>{active.is_combat?t.combat:t.general} · {active.position}/5</p>
         <label>{t.icon}<input value={icon} onChange={e=>setIcon(e.target.value)} placeholder="hatarvilag/skills/example.jpg"/></label>
         <div className="sk-gallery" aria-label={l==='hu'?'Elérhető skillikonok':'Available skill icons'}>{items.filter(s=>s.icon_path).map(s=><button type="button" key={s.id} className={active.slug===s.slug?'selected':''} title={trans(s)} aria-label={trans(s)} onClick={()=>setIcon(s.icon_path||'')}><SkillArt slug={s.slug} path={s.icon_path}/></button>)}</div>
        </div>
       </div>
       <p className="ed-tab-help">{t.fixed}</p>
       <div className="ed-language-list">{allLocales.map(x=><button type="button" key={x.code} className={lang===x.code?'active':''} onClick={()=>setLang(x.code)}>{x.native_name}</button>)}</div>
       <label>{t.name} ({lang.toUpperCase()})<input value={curr.name} onChange={e=>setNames(prev=>({...prev,[lang]:{...curr,name:e.target.value}}))}/></label>
       <label>{t.description} ({lang.toUpperCase()})<textarea rows={5} value={curr.description} onChange={e=>setNames(prev=>({...prev,[lang]:{...curr,description:e.target.value}}))}/></label>
     </div>}
     {tab==='rules'&&<div className="ed-tab-pane sk-editor-fields"><p className="ed-tab-help">{t.rulesIntro}</p>
      {fields.map(field=><label key={field}>{t[field]}<input type="number" min={field==='base_attribute_pips'?3:field==='max_attribute_pips'?9:field==='max_allocated_skill_pips'?1:0} max={field==='base_attribute_pips'?9:field==='max_attribute_pips'?30:field==='max_allocated_skill_pips'?12:field==='free_attribute_pips'?24:30} value={rules[field]} onChange={e=>setRules(v=>({...v,[field]:Number(e.target.value)}))}/></label>)}
     </div>}
    </form>
    <footer className="ed-footer"><span className="ed-fine">{t.title}</span><button disabled={busy||loading} type="submit" className="ed-submit" form="skills-editor-form">{t.save}</button></footer>
   </section>
 </EditorFrame>;
}
