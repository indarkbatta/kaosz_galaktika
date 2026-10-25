import {DiscardChangesDialog} from './components/DecisionDialog';
import EquipmentBlueprintEditor from './EquipmentBlueprintEditor';
import CombatVisualEditor from './CombatVisualEditor';
import {useEffect,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorTabs,EditorRoster,EditorHeader,EditorFooter} from './components/EditorTemplate';
import {EditorNavigation,type EditorSection} from './components/EditorNavigation';
import {LucidePlus,LucideMinus} from './components/LucideSigns';
import './item-editor.css';
import './combat.css';
import {ItemCombatFields} from './components/CombatFields';
import type {ItemCombat,Named} from './lib/combat';

type I18n={locale:string;name:string;description:string};
type Item={id:string;slug:string;category:string;rarity:string;is_published:boolean;image_path:string|null;equip_owner:string|null;equip_slot:string|null;capacity_bonus:number;manufacturer_faction_id:string|null;manufacturer_company_id:string|null;game_items_i18n:I18n[];game_item_combat?:ItemCombat|null};
type Ingredient={item_id:string;quantity:number};
type RecipeRow={output_item_id:string;ingredient_item_id:string;quantity:number};
type Manufacturer={id:string;name_hu:string;name_en:string};
type Plant=Manufacturer&{faction_id:string};
type Lang={code:string;native_name:string};
const empty:Item={id:'',slug:'',category:'material',rarity:'common',is_published:false,image_path:null,equip_owner:null,equip_slot:null,capacity_bonus:0,manufacturer_faction_id:null,manufacturer_company_id:null,game_items_i18n:[]};
export default function ItemEditor({locale,onBack,onSectionSelect,componentsOnly=false}:{componentsOnly?:boolean;locale:string;onBack:()=>void;onSectionSelect:(section:EditorSection)=>void}){
 const [componentCatalog,setComponentCatalog]=useState<{definitions:{item_id:string;kind:string;family:string;type_code:string|null}[];types:{code:string;name_hu:string;name_en:string}[]}>({definitions:[],types:[]});
 const [search,setSearch]=useState(''),[familyFilter,setFamilyFilter]=useState(''),[typeFilter,setTypeFilter]=useState('');
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [factions,setFactions]=useState<Manufacturer[]>([]),[plants,setPlants]=useState<Plant[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 const [combat,setCombat]=useState<ItemCombat|null>(null),[combatSkills,setCombatSkills]=useState<Named[]>([]);
 const [items,setItems]=useState<Item[]>([]),[recipes,setRecipes]=useState<RecipeRow[]>([]);
 const [languages,setLanguages]=useState<Lang[]>([]),[language,setLanguage]=useState('hu');
 const [draft,setDraft]=useState<Item>(empty),[text,setText]=useState<Record<string,{name:string;description:string}>>({});
 const [ingredients,setIngredients]=useState<Ingredient[]>([]);
 const [componentBusy,setComponentBusy]=useState(false);
 const [visualDirty,setVisualDirty]=useState(false),[visualPending,setVisualPending]=useState<null|(()=>void)>(null);
 const visualNavigate=(fn:()=>void)=>{if(busy||componentBusy)return;if(visualDirty)setVisualPending(()=>fn);else fn();};
 const [tab,setTab]=useState('general'),[busy,setBusy]=useState(false);
 const itemName=(item:Item)=>item.game_items_i18n.find(x=>x.locale===locale)?.name||
 item.game_items_i18n.find(x=>x.locale==='hu')?.name||item.slug;
 function choose(item:Item,allRecipes:RecipeRow[]){
  setCombat(item.game_item_combat?structuredClone(item.game_item_combat):null);
  setDraft({...item,manufacturer_faction_id:item.manufacturer_faction_id||null,manufacturer_company_id:item.manufacturer_company_id||null});
  setText(Object.fromEntries(item.game_items_i18n.map(x=>[x.locale,{name:x.name,description:x.description}])));
  setIngredients(allRecipes.filter(x=>x.output_item_id===item.id).map(x=>({item_id:x.ingredient_item_id,quantity:x.quantity})));
  setTab(componentsOnly?'component':'general');
 }
 async function load(id?:string,expected?:{faction:string|null;company:string|null}){
  setLoading(true);setLoadError('');
  try{
  const [i,r,l,f,c,sk,components]=await Promise.all([
   supabase.from('game_items').select('id,slug,category,rarity,is_published,image_path,equip_owner,equip_slot,capacity_bonus,manufacturer_faction_id,manufacturer_company_id,game_item_combat(*),game_items_i18n(locale,name,description)').order('slug'),
   supabase.from('game_item_recipes').select('output_item_id,ingredient_item_id,quantity'),
   supabase.from('game_locales').select('code,native_name').eq('is_enabled',true).order('sort_order'),
   supabase.from('game_factions').select('id,name_hu,name_en').order('slug'),
   supabase.from('game_faction_companies').select('id,faction_id,name_hu,name_en').order('sort_order'),
   supabase.from('game_skills').select('id,slug,game_skills_i18n(locale,name)').eq('is_combat',true),
   componentsOnly?supabase.rpc('get_equipment_blueprint_catalog'):Promise.resolve({data:null,error:null})
  ]);
  const error=i.error||r.error||l.error||f.error||c.error||sk.error||components.error;if(error)throw new Error(error.message);
  setCombatSkills((sk.data||[]).map(s=>({id:s.id,slug:s.slug,texts:s.game_skills_i18n} as Named)));
  setFactions((f.data||[]) as Manufacturer[]);setPlants((c.data||[]) as Plant[]);
  const arr=(i.data||[]) as unknown as Item[],all=(r.data||[]) as RecipeRow[];
  const catalog=components.data as typeof componentCatalog|null;
  if(catalog)setComponentCatalog(catalog);
  const selectable=componentsOnly?arr.filter(x=>catalog?.definitions.some(d=>d.item_id===x.id&&d.kind==='component')):arr;
  setItems(arr);setRecipes(all);setLanguages((l.data||[]) as Lang[]);
  const saved=arr.find(x=>x.id===id);
  if(expected&&(!saved||saved.manufacturer_faction_id!==expected.faction||saved.manufacturer_company_id!==expected.company))throw new Error(tr('A mentett gyártó visszaellenőrzése sikertelen.','Saved manufacturer verification failed.'));
  const selected=selectable.find(x=>x.id===id)||selectable.find(x=>x.id===draft.id)||selectable[0];
  if(selected)choose(selected,all);else{setDraft({...empty});setCombat(null);setText({});setIngredients([]);}
  return true;
  }catch(e){const message=e instanceof Error?e.message:'Loading failed';setLoadError(message);notify(message,'error');return false;}finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 const componentItems=items.filter(i=>componentCatalog.definitions.some(d=>d.item_id===i.id&&d.kind==='component'));
 const visibleItems=componentsOnly?componentItems.filter(i=>{const d=componentCatalog.definitions.find(d=>d.item_id===i.id);return (!familyFilter||d?.family===familyFilter)&&(!typeFilter||d?.type_code===typeFilter)&&(itemName(i)+' '+i.slug).toLocaleLowerCase().includes(search.toLocaleLowerCase());}):items;
 const available=items.filter(x=>x.category==='material'&&x.is_published&&x.id!==draft.id);
 const local=text[language]||{name:'',description:''};
 const patch=(key:'name'|'description',value:string)=>setText(prev=>({...prev,[language]:{...local,[key]:value}}));
 const modify=(index:number,patch:Partial<Ingredient>)=>setIngredients(prev=>prev.map((v,j)=>j===index?{...v,...patch}:v));
 const addIngredient=()=>{
  if(ingredients.length>=5)return;
  const first=available.find(x=>!ingredients.some(y=>y.item_id===x.id));
  if(first)setIngredients(p=>[...p,{item_id:first.id,quantity:1}]);
 };
 const newItem=()=>{setCombat(null);setDraft({...empty});setText({});setIngredients([]);setTab('general');};
 async function save(e:FormEvent){e.preventDefault();if(busy||loading||loadError)return;
  if(draft.manufacturer_company_id&&!plants.some(p=>p.id===draft.manufacturer_company_id&&p.faction_id===draft.manufacturer_faction_id)){notify(tr('Az üzemnek a kiválasztott frakcióhoz kell tartoznia.','The plant must belong to the selected faction.'),'error');setTab('manufacturer');return;}
  if(!text.hu?.name?.trim()||!text.en?.name?.trim()){notify(tr('A magyar és angol név kötelező.','Hungarian and English names are required.'),'error');return;}
  if(draft.category==='material'&&ingredients.length>0){notify(tr('Az alapanyagoknak nincs receptjük.','Raw materials cannot have recipes.'),'error');return;}
  const preexistingRecipeLessGear=!!draft.id&&draft.category==='equipment'&&!recipes.some(r=>r.output_item_id===draft.id);
  if(['equipment','consumable'].includes(draft.category)&&ingredients.length===0&&!preexistingRecipeLessGear){notify(tr('A készíthető tárgynak legalább egy alapanyag kell.','Craftable items require at least one ingredient.'),'error');setTab('recipe');return;}
  if(ingredients.length>5||new Set(ingredients.map(x=>x.item_id)).size!==ingredients.length||ingredients.some(x=>!x.item_id||x.quantity<1||x.quantity>10000)){notify(tr('1–5 eltérő alapanyag és érvényes mennyiségek szükségesek.','Choose 1–5 distinct materials and valid quantities.'),'error');return;}
  setBusy(true);
  try{
  const values=Object.entries(text).filter(([,v])=>v.name.trim()).map(([code,v])=>({locale:code,name:v.name.trim(),description:v.description.trim()}));
  const r=await supabase.rpc('save_game_item_with_combat',{p_id:draft.id||null,p_slug:draft.slug,p_category:draft.category,p_rarity:draft.rarity,
    p_published:draft.is_published,p_translations:values,p_ingredients:ingredients,
    p_image_path:draft.image_path||null,p_equip_owner:draft.equip_owner,p_equip_slot:draft.equip_slot,p_bonus:draft.capacity_bonus,p_manufacturer_faction_id:draft.manufacturer_faction_id,p_manufacturer_company_id:draft.manufacturer_company_id,p_combat:combat});
  if(r.error)notify(r.error.message,'error');
  else{
   const id=(r.data as {id:string}).id;
   setDraft(d=>({...d,id}));
   if(await load(id,{faction:draft.manufacturer_faction_id,company:draft.manufacturer_company_id}))notify(tr('Tárgy és gyártó mentve.','Item and manufacturer saved.'),'success');
  }
  }catch(e){notify(e instanceof Error?e.message:tr('Mentési hiba.','Save failed.'),'error');}finally{setBusy(false);}
 }
 return <EditorFrame>
  <EditorNavigation locale={locale} active={componentsOnly?'components':'items'} onBack={()=>visualNavigate(onBack)} onSelect={s=>visualNavigate(()=>onSectionSelect(s))}/>
  <EditorRoster><div className="ed-roster-top"><strong>{componentsOnly?tr('Komponensek','Components'):tr('Tárgyak','Items')} ({componentsOnly?visibleItems.length+' / '+componentItems.length:items.length})</strong><button type="button" disabled={busy||loading} onClick={()=>visualNavigate(componentsOnly?()=>onSectionSelect('items'):newItem)} title={componentsOnly?tr('Új tárgy a Tárgyeditorban','New item in Item editor'):tr('Új tárgy','New item')}><LucidePlus/></button></div>
   {componentsOnly&&<div className="ed-roster-filters ed-general-grid">
    <label>{tr('Keresés','Search')}<input aria-label={tr('Komponens keresése','Search components')} value={search} placeholder={tr('Név vagy azonosító…','Name or slug…')} onChange={e=>{setSearch(e.target.value);}}/></label>
    <label>{tr('Felszereléscsalád','Equipment family')}<select aria-label={tr('Család szűrő','Family filter')} value={familyFilter} onChange={e=>{setFamilyFilter(e.target.value);}}><option value="">{tr('Minden család','All families')}</option>{[['weapon',tr('Fegyver','Weapon')],['sidearm',tr('Oldalfegyver','Sidearm')],['armor',tr('Páncél','Armor')],['helmet',tr('Sisak','Helmet')]].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    <label>{tr('Komponensfajta','Component type')}<select aria-label={tr('Fajta szűrő','Type filter')} value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);}}><option value="">{tr('Minden fajta','All types')}</option>{componentCatalog.types.map(t=><option key={t.code} value={t.code}>{en?t.name_en:t.name_hu}</option>)}</select></label>
   </div>}
   <div className="ed-roster-list">{visibleItems.map(item=><button type="button" disabled={busy||loading} className={'ed-record '+(draft.id===item.id?'selected':'')} key={item.id} onClick={()=>visualNavigate(()=>choose(item,recipes))}>
    <span className="ed-thumbnail item-editor-symbol">{item.image_path?<img src={'https://assets.voidnoir.net/'+item.image_path} alt="" style={{width:'100%',height:'100%',objectFit:'contain'}}/>:({material:'◈',data:'⌁',trade:'✦',equipment:'⚒',consumable:'◆'} as Record<string,string>)[item.category]}</span>
    <span className="ed-record-name"><strong>{itemName(item)}</strong><small>{item.slug} · {componentsOnly?componentCatalog.types.find(t=>t.code===componentCatalog.definitions.find(d=>d.item_id===item.id)?.type_code)?.[en?'name_en':'name_hu']||item.category:item.category}</small></span></button>)}</div>
   {componentsOnly&&<>{!loading&&!visibleItems.length&&<p className="ed-helper">{tr('Nincs a szűrésnek megfelelő komponens.','No components match these filters.')}</p>}</>}
  </EditorRoster>
  <section className="ed-editor">
   <EditorHeader><strong>{draft.id?itemName(items.find(x=>x.id===draft.id)||draft):tr('ÚJ TÁRGY','NEW ITEM')}</strong><span>M5.4</span></EditorHeader>
   <EditorTabs label="Item editor" selected={tab} onSelect={t=>visualNavigate(()=>setTab(t))} items={[...(componentsOnly?[{id:'component',name:tr('Komponens','Component')}]:[{id:'classification',name:tr('Besorolás','Classification')}]),{id:'visuals',name:tr('Harci kép','Combat artwork')},{id:'general',name:tr('Alapadatok','General')},{id:'combat',name:tr('Harci statok','Combat stats')},{id:'manufacturer',name:tr('Gyártó','Manufacturer')},{id:'recipe',name:tr('Recept / alapanyagok','Recipe / Materials')},{id:'dictionary',name:tr('Szótár','Dictionary')}]}/>
   {loadError&&<div role="alert" className="item-editor-load-error">{loadError}<button type="button" disabled={loading||busy} onClick={()=>void load(draft.id||undefined)}>{tr('Újratöltés','Reload')}</button></div>}
   {componentsOnly&&!draft.id?<div className="ed-empty-state">{tr('Még nincs komponens. A Blueprint editor Besorolás fülén jelöld meg a tárgyat komponensként.','No components yet. Classify an item as a component in the Blueprint editor.')}</div>:(tab==='component'||tab==='classification')?<EquipmentBlueprintEditor key={draft.id} itemId={draft.id} locale={locale} componentOnly={componentsOnly} classificationOnly={!componentsOnly} onBusyChange={setComponentBusy} onDirtyChange={setVisualDirty} onSaved={()=>void load(draft.id)}/>:tab==='visuals'?<CombatVisualEditor key={draft.id} locale={locale} embeddedItemId={draft.id} onDirtyChange={setVisualDirty}/>:<form id="item-editor-form" className="ed-form item-editor-form" onSubmit={save}>
    {tab==='general'&&<>
     <label>{tr('Azonosító','Slug')}<input required value={draft.slug} maxLength={80} onChange={e=>setDraft(x=>({...x,slug:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'')}))}/></label>
     <div className="item-editor-fields"><label>{tr('Kategória','Category')}<select value={draft.category} onChange={e=>{const category=e.target.value;setDraft(x=>({...x,category}));if(category==='material')setIngredients([]);}}>
      {(['material','data','trade','equipment','consumable'] as const).map(x=><option key={x} value={x}>{{material:tr('Alapanyag','Raw material'),data:tr('Adat','Data'),trade:tr('Kereskedelmi','Trade'),equipment:tr('Felszerelés','Equipment'),consumable:tr('Fogyóeszköz','Consumable')}[x]}</option>)}
     </select></label><label>{tr('Ritkaság','Rarity')}<select value={draft.rarity} onChange={e=>setDraft(x=>({...x,rarity:e.target.value}))}>{['common','uncommon','rare','epic'].map(x=><option value={x} key={x}>{x}</option>)}</select></label></div>
     <div className="item-presentation"><div className="item-presentation-art">{draft.image_path?<img src={'https://assets.voidnoir.net/'+draft.image_path} alt=""/>:<span>◈</span>}</div><label>{tr('Cloudflare R2 kép útvonala','Cloudflare R2 image path')}<input value={draft.image_path||''} placeholder="hatarvilag/items/item-v2.webp" onChange={e=>setDraft(x=>({...x,image_path:e.target.value||null}))}/></label></div>
     <div className="item-editor-fields"><label>{tr('Felszerelés tulajdonosa','Equipment owner')}<select value={draft.equip_owner||''} onChange={e=>setDraft(x=>({...x,equip_owner:e.target.value||null,equip_slot:null,capacity_bonus:0}))}><option value="">{tr('Nem felszerelhető','Not equippable')}</option><option value="captain">{tr('Kapitány','Captain')}</option><option value="crew">{tr('Legénység','Crew')}</option></select></label>
     {draft.equip_owner&&<label>{tr('Felszerelési hely','Equipment slot')}<select value={draft.equip_slot||''} onChange={e=>setDraft(x=>({...x,equip_slot:e.target.value||null,capacity_bonus:e.target.value==='backpack'?x.capacity_bonus:0}))}><option value="">{tr('Válassz helyet','Choose slot')}</option>
      {(draft.equip_owner==='captain'?['main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic']:['armor','weapon','utility']).map(slot=><option key={slot} value={slot}>{slot.replaceAll('_',' ')}</option>)}</select></label>}
     </div>
     {draft.equip_slot==='backpack'&&<label>{tr('Plusz inventárhelyek','Bonus inventory slots')}<input type="number" min="0" max="100" value={draft.capacity_bonus} onChange={e=>setDraft(x=>({...x,capacity_bonus:Number(e.target.value)}))}/></label>}
     <label className="item-editor-checkbox"><input type="checkbox" checked={draft.is_published} onChange={e=>setDraft(x=>({...x,is_published:e.target.checked}))}/>{tr('Publikált','Published')}</label>
     <p>{tr('Az új alapanyagok mentés után automatikusan bekerülnek a receptválasztóba.','New raw materials automatically appear in the recipe selector after saving.')}</p>
    </>}
    {tab==='combat'&&<ItemCombatFields locale={locale} value={combat} onChange={setCombat} skills={combatSkills}/>}
    {tab==='manufacturer'&&<>
     <label>{tr('Gyártó frakció','Manufacturer faction')}<select aria-label={tr('Gyártó frakció','Manufacturer faction')} disabled={loading||busy} value={draft.manufacturer_faction_id||''} onChange={e=>setDraft(d=>({...d,manufacturer_faction_id:e.target.value||null,manufacturer_company_id:null}))}><option value="">{tr('Nincs megadva','Not specified')}</option>{factions.map(f=><option key={f.id} value={f.id}>{en?f.name_en:f.name_hu}</option>)}</select></label>
     <label>{tr('Gyártó üzem / cég','Manufacturing plant / company')}<select aria-label={tr('Gyártó üzem / cég','Manufacturing plant / company')} disabled={loading||busy||!draft.manufacturer_faction_id} value={draft.manufacturer_company_id||''} onChange={e=>setDraft(d=>({...d,manufacturer_company_id:e.target.value||null}))}><option value="">{tr('Nincs megadva','Not specified')}</option>{plants.filter(p=>p.faction_id===draft.manufacturer_faction_id).map(p=><option key={p.id} value={p.id}>{en?p.name_en:p.name_hu}</option>)}</select></label>
     <p>{tr('Az üzemeket a Frakció editor Cégek fülén veheted fel. Frakcióváltáskor az üzem kiválasztása törlődik. A gyártó megadása opcionális.','Add plants in the Faction editor’s Companies tab. Changing faction clears the selected plant. Manufacturer attribution is optional.')}</p>
     {draft.manufacturer_faction_id&&!plants.some(p=>p.faction_id===draft.manufacturer_faction_id)&&<p>{tr('Ehhez a frakcióhoz még nincs felvett üzem / cég.','This faction has no plants / companies yet.')}</p>}
    </>}
    {tab==='recipe'&&<>
     <div className="item-editor-rule"><strong>{tr('ÖSSZETÉTEL','CRAFTING RECIPE')}</strong><span>{ingredients.length} / 5</span></div>
     {draft.category==='material'?<p>{tr('Ez alapanyag: más tárgyak készítéséhez használható, nem igényel saját receptet.','Raw materials are used to craft other items and have no recipe of their own.')}</p>:<>
      {ingredients.map((ingredient,index)=><div className="item-editor-ingredient" key={index}><label>{tr('Alapanyag','Material')}<select value={ingredient.item_id} onChange={e=>modify(index,{item_id:e.target.value})}>
       {available.filter(x=>x.id===ingredient.item_id||!ingredients.some(i=>i.item_id===x.id)).map(item=><option key={item.id} value={item.id}>{itemName(item)}</option>)}
      </select></label><label>{tr('Mennyiség','Quantity')}<input type="number" min="1" max="10000" required value={ingredient.quantity} onChange={e=>modify(index,{quantity:Number(e.target.value)})}/></label>
      <button type="button" className="item-remove" title={tr('Alapanyag eltávolítása','Remove material')} onClick={()=>setIngredients(x=>x.filter((_,j)=>j!==index))}><LucideMinus/></button></div>)}
      <button type="button" className="item-add" disabled={ingredients.length>=5||available.every(x=>ingredients.some(y=>y.item_id===x.id))} onClick={addIngredient}><LucidePlus/> {tr('Alapanyag hozzáadása','Add material')}</button>
      <p>{tr('A felhasznált mennyiségeket a szerver a készítés előtt ellenőrzi és egyszerre levonja.','The server validates and deducts all required materials atomically when crafting.')}</p>
     </>}
    </>}
    {tab==='dictionary'&&<>
     <div className="ed-language-list">{languages.map(l=><button type="button" key={l.code} className={language===l.code?'active':''} onClick={()=>setLanguage(l.code)}>{l.native_name}</button>)}</div>
     <label>{tr('Név','Name')} ({language.toUpperCase()})<input value={local.name} onChange={e=>patch('name',e.target.value)}/></label>
     <label>{tr('Leírás','Description')} ({language.toUpperCase()})<textarea rows={4} value={local.description} onChange={e=>patch('description',e.target.value)}/></label>
    </>}
   </form>}
   {tab!=='visuals'&&tab!=='component'&&tab!=='classification'&&(!componentsOnly||!!draft.id)&&<EditorFooter><span className="ed-fine">1–5 · HU/EN · RLS</span><button type="submit" form="item-editor-form" className="ed-submit" disabled={busy||loading||!!loadError||componentsOnly&&!draft.id}>{tr('MENTÉS','SAVE')}</button></EditorFooter>}
  </section>
 {visualPending&&<DiscardChangesDialog locale={locale} onCancel={()=>setVisualPending(null)} onDiscard={()=>{setVisualDirty(false);visualPending();setVisualPending(null);}}/>}
 </EditorFrame>;
}
