import {useEffect,useState} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {ItemStatGrid} from './components/ItemDetailView';
import {itemAssetUrl,itemCategory,itemDescription,itemName,itemRarity,type ItemCatalogEntry} from './lib/itemPresentation';
import './crafting-panel.css';

type Part={output_item_id:string;ingredient_item_id:string;quantity:number};
type Stock={item_id:string;quantity:number};
type Filter='all'|'ready'|'missing';
const PAGE_SIZE=6;
export default function CraftingPanel({locale,inventory,onCrafted}:{locale:string;inventory:Stock[];onCrafted:()=>Promise<void>}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [items,setItems]=useState<ItemCatalogEntry[]>([]),[parts,setParts]=useState<Part[]>([]);
 const [amounts,setAmounts]=useState<Record<string,number>>({}),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<Filter>('all'),[category,setCategory]=useState('all');
 const [page,setPage]=useState(0),[selectedId,setSelectedId]=useState<string|null>(null);
 useEffect(()=>{let alive=true;const load=async()=>{
  const [i,r]=await Promise.all([
   supabase.from('game_items').select('id,slug,rarity,category,image_path,equip_owner,equip_slot,capacity_bonus,game_item_combat(*),game_items_i18n(locale,name,description)').eq('is_published',true).order('slug'),
   supabase.from('game_item_recipes').select('output_item_id,ingredient_item_id,quantity')
  ]);
  if(!alive)return;
  if(i.error||r.error){notify((i.error||r.error)?.message||'Failed to load recipes','error');return;}
  setItems((i.data||[]) as unknown as ItemCatalogEntry[]);setParts((r.data||[]) as Part[]);
 };void load();return()=>{alive=false;};},[]);
 const recipes=items.filter(item=>parts.some(part=>part.output_item_id===item.id));
 const owned=(id:string)=>inventory.find(row=>row.item_id===id)?.quantity||0;
 const ingredients=(id:string)=>parts.filter(part=>part.output_item_id===id);
 const maxCraftable=(id:string)=>{
  const recipe=ingredients(id);
  return recipe.length?Math.min(...recipe.map(part=>Math.floor(owned(part.ingredient_item_id)/part.quantity))):0;
 };
 const categoryOptions=[...new Set(recipes.map(x=>x.category))];
 const query=search.trim().toLocaleLowerCase(locale==='en'?'en':'hu');
 const filtered=recipes.filter(item=>{
  if(category!=='all'&&item.category!==category)return false;
  if(filter==='ready'&&maxCraftable(item.id)<1)return false;
  if(filter==='missing'&&maxCraftable(item.id)>0)return false;
  return !query||[itemName(item,locale),item.slug,itemDescription(item,locale)].some(text=>text.toLocaleLowerCase(locale==='en'?'en':'hu').includes(query));
 }).sort((a,b)=>itemName(a,locale).localeCompare(itemName(b,locale),locale==='en'?'en':'hu'));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const displayPage=Math.min(page,pages-1);
 const shown=filtered.slice(displayPage*PAGE_SIZE,(displayPage+1)*PAGE_SIZE);
 const selected=shown.find(x=>x.id===selectedId)||shown[0];
 const amount=selected?amounts[selected.id]||1:1;
 const materials=selected?ingredients(selected.id):[];
 const available=selected?maxCraftable(selected.id):0;
 const possible=!!selected&&materials.length>0&&materials.every(part=>owned(part.ingredient_item_id)>=part.quantity*amount);
 const changeFilters=(f:Filter)=>{setFilter(f);setPage(0);setSelectedId(null);};
 const changeCategory=(c:string)=>{setCategory(c);setPage(0);setSelectedId(null);};
 const changeSearch=(s:string)=>{setSearch(s);setPage(0);setSelectedId(null);};
 const changePage=(n:number)=>{setPage(n);setSelectedId(null);};
 async function craft(id:string,quantity:number){
  if(busy||quantity<1||quantity>20)return;
  setBusy(true);
  try{
   const r=await supabase.rpc('craft_item',{p_item:id,p_amount:quantity});
   if(r.error){notify(r.error.message,'error');return;}
   await onCrafted();
   notify(tr('Sikeres gyártás','Crafting complete')+': '+quantity+' × '+itemName(items.find(x=>x.id===id),locale),'success');
  }catch(err){notify(err instanceof Error?err.message:String(err),'error');}
  finally{setBusy(false);}
 }
 return <section className="crafting-panel">
  <aside className="crafting-browser">
   <header className="crafting-browser-title"><strong>{tr('RECEPTEK','RECIPES')}</strong><small>{filtered.length} / {recipes.length}</small></header>
   <div className="crafting-filters">
    <input type="search" value={search} onChange={e=>changeSearch(e.target.value)}
     placeholder={tr('Recept keresése...','Search recipes...')} aria-label={tr('Recept keresése','Search recipes')}/>
    <div className="crafting-filter-tabs" role="group" aria-label={tr('Alapanyag szűrő','Materials filter')}>
     {(['all','ready','missing'] as const).map(mode=><button type="button" key={mode} className={filter===mode?'active':''}
      aria-pressed={filter===mode} onClick={()=>changeFilters(mode)}>{mode==='all'?tr('Mind','All'):mode==='ready'?tr('Gyártható','Ready'):tr('Hiányos','Missing')}</button>)}
    </div>
    <select aria-label={tr('Recept kategória','Recipe category')} value={category} onChange={e=>changeCategory(e.target.value)}>
     <option value="all">{tr('Minden kategória','All categories')}</option>
     {categoryOptions.map(c=><option key={c} value={c}>{itemCategory(c,locale)}</option>)}
    </select>
   </div>
   <div className="crafting-recipe-list">
    {shown.length?shown.map(item=>{
     const max=maxCraftable(item.id),image=itemAssetUrl(item.image_path);
     return <button type="button" key={item.id} className={'crafting-recipe '+(selected?.id===item.id?'selected':'')}
      onClick={()=>setSelectedId(item.id)} aria-pressed={selected?.id===item.id} title={itemName(item,locale)}>
      <span className="crafting-recipe-icon">{image?<img src={image} alt="" draggable={false}/>:<span>◇</span>}</span>
      <span className="crafting-recipe-text"><strong>{itemName(item,locale)}</strong><small>{itemCategory(item.category,locale)} · {itemRarity(item.rarity,locale)}</small></span>
      <span className={'crafting-ready-mark '+(max?'ready':'missing')}>{max?tr('✓ '+max+' db','✓ '+max+' pcs'):tr('Hiány','Missing')}</span>
     </button>;
    }):<p className="crafting-empty">{recipes.length?tr('A szűrésnek nincs találata.','No recipes match these filters.'):tr('Még nincs megadott recept.','No recipes defined yet.')}</p>}
   </div>
   <nav className="crafting-pager" aria-label={tr('Receptoldalak','Recipe pages')}>
    <button type="button" disabled={displayPage===0} onClick={()=>changePage(displayPage-1)} aria-label={tr('Előző oldal','Previous page')}>‹</button>
    <span>{displayPage+1} / {pages}</span>
    <button type="button" disabled={displayPage>=pages-1} onClick={()=>changePage(displayPage+1)} aria-label={tr('Következő oldal','Next page')}>›</button>
   </nav>
  </aside>
  <section className="crafting-detail" aria-label={tr('Kiválasztott recept','Selected recipe')}>
   {selected?<><header className="crafting-detail-header">
     <span className="crafting-detail-art">{itemAssetUrl(selected.image_path)?<img src={itemAssetUrl(selected.image_path)} alt="" draggable={false}/>:<span>◇</span>}</span>
     <div><small>{tr('GYÁRTÁSI ADATLAP','CRAFTING SCHEMATIC')}</small>
      <h3>{itemName(selected,locale)}</h3>
      <span className={'crafting-rarity '+selected.rarity}>{itemRarity(selected.rarity,locale)}</span>
      <p>{itemDescription(selected,locale)||tr('Nincs megadott tárgyleírás.','No item description yet.')}</p>
     </div>
    </header>
    <div className="crafting-detail-main">
     <section className="crafting-stats"><h4>{tr('TÁRGYADATOK / STATBLOCK','ITEM STATBLOCK')}</h4><ItemStatGrid item={selected} locale={locale}/></section>
     <section className="crafting-components"><header><h4>{tr('ALAPANYAGIGÉNY','REQUIRED MATERIALS')}</h4><span>{tr('Lehetséges mennyiség','Can make')}: <b>{available}</b></span></header>
      <div className="crafting-ingredients">{materials.map(part=>{
       const ingredient=items.find(x=>x.id===part.ingredient_item_id),need=part.quantity*amount,have=owned(part.ingredient_item_id);
       const image=itemAssetUrl(ingredient?.image_path);
       return <div key={part.ingredient_item_id} className="crafting-ingredient">
        <span className="crafting-ingredient-art">{image&&<img src={image} alt=""/>}</span>
        <span className="crafting-ingredient-name">{itemName(ingredient,locale)}</span>
        <b className={have>=need?'enough':'short'}>{have} / {need}</b>
       </div>;
      })}</div>
     </section>
    </div>
    <footer className="crafting-produce">
     <label>{tr('Mennyiség','Quantity')}
      <input type="number" min={1} max={20} value={amount} onChange={e=>{
       const n=Math.max(1,Math.min(20,Math.floor(Number(e.target.value)||1)));
       setAmounts(old=>({...old,[selected.id]:n}));
      }}/>
     </label>
     <span className={possible?'crafting-status-ready':'crafting-status-missing'}>{possible?tr('Van elegendő alapanyag','Materials available'):tr('Nincs elegendő alapanyag','Insufficient materials')}</span>
     <button type="button" disabled={busy||!possible} onClick={()=>void craft(selected.id,amount)}>{busy?tr('GYÁRTÁS...','CRAFTING...'):tr('ELKÉSZÍTÉS','CRAFT')}</button>
    </footer>
   </>:<div className="crafting-no-selection">{tr('Válassz egy receptet a bal oldali listából.','Choose a recipe from the left list.')}</div>}
  </section>
 </section>;
}
