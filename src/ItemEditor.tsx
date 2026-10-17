import {useEffect,useState,type FormEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {EditorFrame,EditorTabs} from './components/EditorTemplate';
import {LucidePlus,LucideMinus} from './components/LucideSigns';
import './item-editor.css';

type I18n={locale:string;name:string;description:string};
type Item={id:string;slug:string;category:string;rarity:string;is_published:boolean;image_path:string|null;equip_owner:string|null;equip_slot:string|null;capacity_bonus:number;game_items_i18n:I18n[]};
type Ingredient={item_id:string;quantity:number};
type RecipeRow={output_item_id:string;ingredient_item_id:string;quantity:number};
type Lang={code:string;native_name:string};
const empty:Item={id:'',slug:'',category:'material',rarity:'common',is_published:false,image_path:null,equip_owner:null,equip_slot:null,capacity_bonus:0,game_items_i18n:[]};
export default function ItemEditor({locale,onBack}:{locale:string;onBack:()=>void}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [items,setItems]=useState<Item[]>([]),[recipes,setRecipes]=useState<RecipeRow[]>([]);
 const [languages,setLanguages]=useState<Lang[]>([]),[language,setLanguage]=useState('hu');
 const [draft,setDraft]=useState<Item>(empty),[text,setText]=useState<Record<string,{name:string;description:string}>>({});
 const [ingredients,setIngredients]=useState<Ingredient[]>([]);
 const [tab,setTab]=useState('general'),[busy,setBusy]=useState(false);
 const itemName=(item:Item)=>item.game_items_i18n.find(x=>x.locale===locale)?.name||
 item.game_items_i18n.find(x=>x.locale==='hu')?.name||item.slug;
 function choose(item:Item,allRecipes:RecipeRow[]){
  setDraft({...item});
  setText(Object.fromEntries(item.game_items_i18n.map(x=>[x.locale,{name:x.name,description:x.description}])));
  setIngredients(allRecipes.filter(x=>x.output_item_id===item.id).map(x=>({item_id:x.ingredient_item_id,quantity:x.quantity})));
  setTab('general');
 }
 async function load(id?:string){
  const [i,r,l]=await Promise.all([
   supabase.from('game_items').select('id,slug,category,rarity,is_published,image_path,equip_owner,equip_slot,capacity_bonus,game_items_i18n(locale,name,description)').order('slug'),
   supabase.from('game_item_recipes').select('output_item_id,ingredient_item_id,quantity'),
   supabase.from('game_locales').select('code,native_name').eq('is_enabled',true).order('sort_order')
  ]);
  const error=i.error||r.error||l.error;if(error){notify(error.message,'error');return;}
  const arr=(i.data||[]) as unknown as Item[],all=(r.data||[]) as RecipeRow[];
  setItems(arr);setRecipes(all);setLanguages((l.data||[]) as Lang[]);
  const selected=arr.find(x=>x.id===(id||draft.id))||arr[0];
  if(selected)choose(selected,all);
 }
 useEffect(()=>{void load();},[]);
 const available=items.filter(x=>x.category==='material'&&x.is_published&&x.id!==draft.id);
 const local=text[language]||{name:'',description:''};
 const patch=(key:'name'|'description',value:string)=>setText(prev=>({...prev,[language]:{...local,[key]:value}}));
 const modify=(index:number,patch:Partial<Ingredient>)=>setIngredients(prev=>prev.map((v,j)=>j===index?{...v,...patch}:v));
 const addIngredient=()=>{
  if(ingredients.length>=5)return;
  const first=available.find(x=>!ingredients.some(y=>y.item_id===x.id));
  if(first)setIngredients(p=>[...p,{item_id:first.id,quantity:1}]);
 };
 const newItem=()=>{setDraft({...empty});setText({});setIngredients([]);setTab('general');};
 async function save(e:FormEvent){e.preventDefault();if(busy)return;
  if(!text.hu?.name?.trim()||!text.en?.name?.trim()){notify(tr('A magyar és angol név kötelező.','Hungarian and English names are required.'),'error');return;}
  if(draft.category==='material'&&ingredients.length>0){notify(tr('Az alapanyagoknak nincs receptjük.','Raw materials cannot have recipes.'),'error');return;}
  if(['equipment','consumable'].includes(draft.category)&&ingredients.length===0){notify(tr('A készíthető tárgynak legalább egy alapanyag kell.','Craftable items require at least one ingredient.'),'error');setTab('recipe');return;}
  if(ingredients.length>5||new Set(ingredients.map(x=>x.item_id)).size!==ingredients.length||ingredients.some(x=>!x.item_id||x.quantity<1||x.quantity>10000)){notify(tr('1–5 eltérő alapanyag és érvényes mennyiségek szükségesek.','Choose 1–5 distinct materials and valid quantities.'),'error');return;}
  setBusy(true);
  const values=Object.entries(text).filter(([,v])=>v.name.trim()).map(([code,v])=>({locale:code,name:v.name.trim(),description:v.description.trim()}));
  const r=await supabase.rpc('save_game_item',{p_id:draft.id||null,p_slug:draft.slug,p_category:draft.category,p_rarity:draft.rarity,
    p_published:draft.is_published,p_translations:values,p_ingredients:ingredients});
  if(r.error)notify(r.error.message,'error');
  else{
   const id=(r.data as {id:string}).id;
   const meta=await supabase.rpc('set_item_presentation',{p_item:id,p_image_path:draft.image_path||null,p_equip_owner:draft.equip_owner,p_equip_slot:draft.equip_slot,p_bonus:draft.capacity_bonus});
   if(meta.error)notify(meta.error.message,'error');else notify(tr('Tárgy, kép és felszerelési slot mentve.','Item, artwork and slot saved.'),'success');
   await load(id);
  }
  setBusy(false);
 }
 return <EditorFrame>
  <nav className="ed-nav"><h2>{tr('Tárgyszerkesztő','Item Editor')}</h2>
   <button type="button" onClick={onBack}>⌂　{tr('Vissza','Back')}</button>
   <button className={tab==='general'?'active':''} onClick={()=>setTab('general')}>◈　{tr('Alapadatok','General')}</button>
   <button className={tab==='recipe'?'active':''} onClick={()=>setTab('recipe')}>⚒　{tr('Recept','Recipe')}</button>
   <button className={tab==='dictionary'?'active':''} onClick={()=>setTab('dictionary')}>⊞　{tr('Szótár','Dictionary')}</button>
   <div className="ed-nav-bottom">M5.2 // CRAFTING</div>
  </nav>
  <aside className="ed-roster"><div className="ed-roster-top"><strong>{tr('Tárgyak','Items')} ({items.length})</strong><button type="button" onClick={newItem} title={tr('Új tárgy','New item')}><LucidePlus/></button></div>
   <div className="ed-roster-list">{items.map(item=><button type="button" className={'ed-record '+(draft.id===item.id?'selected':'')} key={item.id} onClick={()=>choose(item,recipes)}>
    <span className="ed-thumbnail item-editor-symbol">{item.image_path?<img src={'https://assets.voidnoir.net/'+item.image_path} alt="" style={{width:'100%',height:'100%',objectFit:'contain'}}/>:({material:'◈',data:'⌁',trade:'✦',equipment:'⚒',consumable:'◆'} as Record<string,string>)[item.category]}</span>
    <span className="ed-record-name"><strong>{itemName(item)}</strong><small>{item.slug} · {item.category}</small></span></button>)}</div>
  </aside>
  <section className="ed-editor">
   <header className="ed-editor-head"><strong>{draft.id?itemName(items.find(x=>x.id===draft.id)||draft):tr('ÚJ TÁRGY','NEW ITEM')}</strong><span>M5.2</span></header>
   <EditorTabs label="Item editor" selected={tab} onSelect={setTab} items={[{id:'general',name:tr('Alapadatok','General')},{id:'recipe',name:tr('Recept / alapanyagok','Recipe / Materials')},{id:'dictionary',name:tr('Szótár','Dictionary')}]}/>
   <form id="item-editor-form" className="ed-form item-editor-form" onSubmit={save}>
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
   </form>
   <footer className="ed-footer"><span className="ed-fine">1–5 · HU/EN · RLS</span><button type="submit" form="item-editor-form" className="ed-submit" disabled={busy}>{tr('MENTÉS','SAVE')}</button></footer>
  </section>
 </EditorFrame>;
}
