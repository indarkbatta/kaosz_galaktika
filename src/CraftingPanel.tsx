import {useEffect,useState} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import './crafting-panel.css';
type Name={locale:string;name:string;description?:string};
type Item={id:string;slug:string;rarity:string;category:string;image_path:string|null;game_items_i18n:Name[]};
type Part={output_item_id:string;ingredient_item_id:string;quantity:number};
export default function CraftingPanel({locale,inventory,onCrafted}:{locale:string;inventory:{item_id:string;quantity:number}[];onCrafted:()=>Promise<void>}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [items,setItems]=useState<Item[]>([]),[parts,setParts]=useState<Part[]>([]);
 const [amounts,setAmounts]=useState<Record<string,number>>({}),[busy,setBusy]=useState(false);
 const name=(item:Item|undefined)=>item?.game_items_i18n.find(x=>x.locale===locale)?.name||
 item?.game_items_i18n.find(x=>x.locale==='hu')?.name||item?.slug||'—';
 useEffect(()=>{let alive=true;const load=async()=>{
  const [i,r]=await Promise.all([
   supabase.from('game_items').select('id,slug,rarity,category,image_path,game_items_i18n(locale,name,description)').eq('is_published',true).order('slug'),
   supabase.from('game_item_recipes').select('output_item_id,ingredient_item_id,quantity')
  ]);
  if(!alive)return;
  if(i.error||r.error){notify((i.error||r.error)?.message||'Failed to load recipes','error');return;}
  setItems((i.data||[]) as unknown as Item[]);setParts((r.data||[]) as Part[]);
 };void load();return()=>{alive=false;};},[]);
 const craftable=items.filter(i=>parts.some(p=>p.output_item_id===i.id));
 const owned=(id:string)=>inventory.find(row=>row.item_id===id)?.quantity||0;
 async function craft(id:string,amount:number){
  if(busy)return;setBusy(true);
  const r=await supabase.rpc('craft_item',{p_item:id,p_amount:amount});
  if(r.error)notify(r.error.message,'error');
  else{const item=items.find(x=>x.id===id);notify(tr('Sikeres gyártás','Crafting complete')+': '+amount+' × '+name(item),'success');await onCrafted();}
  setBusy(false);
 }
 return <section className="crafting-panel">
  {craftable.length===0?<p className="cmd-empty">{tr('Még nincs elkészíthető tárgy. A receptek a Tárgyszerkesztőben adhatók meg.','No craftable items yet. Define recipes in the Item Editor.')}</p>:
   <div className="crafting-recipes">{craftable.map(item=>{
    const materials=parts.filter(p=>p.output_item_id===item.id),amount=amounts[item.id]||1;
    const possible=materials.every(p=>owned(p.ingredient_item_id)>=p.quantity*amount);
    return <article key={item.id} className="crafting-card"><div className="crafting-card-title"><span className="crafting-card-image">{item.image_path?<img src={'https://assets.voidnoir.net/'+item.image_path} alt=""/>:'⚒'}</span><strong>{name(item)}</strong><small>{item.rarity.toUpperCase()}</small></div>
     <div className="crafting-materials">{materials.map(p=><div key={p.ingredient_item_id}><span>{name(items.find(x=>x.id===p.ingredient_item_id))}</span>
      <b className={owned(p.ingredient_item_id)>=p.quantity*amount?'enough':'short'}>{owned(p.ingredient_item_id)} / {p.quantity*amount}</b></div>)}</div>
     <footer><label>{tr('Db','Qty')}<input type="number" min="1" max="20" value={amount} onChange={e=>setAmounts(s=>({...s,[item.id]:Math.max(1,Math.min(20,Number(e.target.value)||1))}))}/></label>
      <button type="button" disabled={!possible||busy} onClick={()=>void craft(item.id,amount)}>{tr('ELKÉSZÍTÉS','CRAFT')}</button></footer>
    </article>;
   })}</div>}
 </section>;
}
