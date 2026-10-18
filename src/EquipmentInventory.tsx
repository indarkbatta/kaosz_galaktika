import {useCallback,useEffect,useState,type DragEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {crewPositionName,type CrewMember} from './Cantina';
import './equipment-inventory.css';

type Txt={locale:string;name:string;description?:string};
type Item={id:string;slug:string;category:string;rarity:string;image_path:string|null;equip_owner:string|null;equip_slot:string|null;capacity_bonus:number;game_items_i18n:Txt[]};
type Stock={item_id:string;quantity:number};
type Equipped={id:string;crew_id:string|null;slot:string;item_id:string};
type Slot={key:string;hu:string;en:string};
type DragData={kind:'stock';itemId:string}|{kind:'gear';itemId:string;slot:string;crewId:string|null};
const DRAG_TYPE='application/x-hatarvilag-equipment';
const captainSlots:Slot[]=[
 {key:'main_weapon',hu:'Főfegyver',en:'Main weapon'},{key:'sidearm',hu:'Oldalfegyver',en:'Sidearm'},
 {key:'body_armor',hu:'Testpáncél',en:'Body armor'},{key:'utility1',hu:'Utility 1',en:'Utility 1'},
 {key:'utility2',hu:'Utility 2',en:'Utility 2'},{key:'belt',hu:'Öv',en:'Belt'},
 {key:'backpack',hu:'Hátizsák',en:'Backpack'},{key:'relic',hu:'Relikvia',en:'Relic'}];
const crewSlots:Slot[]=[{key:'armor',hu:'Páncélzat',en:'Armor'},{key:'weapon',hu:'Fegyverzet',en:'Weapon'},{key:'utility',hu:'Utility',en:'Utility'}];
const assetUrl=(p:string|null|undefined)=>p&&/^hatarvilag\/items\/[a-z0-9_/-]+\.(webp|avif|png)$/.test(p)?'https://assets.voidnoir.net/'+p:undefined;
function ItemPicture({item,showPlaceholder=true}:{item:Item|undefined;showPlaceholder?:boolean}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[item?.id,item?.image_path]);
 const src=assetUrl(item?.image_path);
 return <span className="eq-art">{src&&!failed?<img src={src} alt="" draggable={false} onError={()=>setFailed(true)}/>:showPlaceholder?<span className="eq-no-art" aria-hidden="true">◇</span>:null}</span>;
}
function DollSilhouette({crew}:{crew:boolean}){
 return <img className="eq-figure" src={'https://assets.voidnoir.net/hatarvilag/paperdolls/reborn/'+(crew?'crew':'captain')+'.webp'}
  alt={crew?'Legénységi felszerelés sziluettje':'Kapitány felszerelési sziluettje'} draggable={false}/>;
}
export default function EquipmentInventory({characterId,captainName,locale,crew,onChanged}:{
 characterId:string;captainName:string;locale:string;crew:CrewMember[];onChanged:()=>Promise<void>
}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [items,setItems]=useState<Item[]>([]),[stock,setStock]=useState<Stock[]>([]),[equipped,setEquipped]=useState<Equipped[]>([]);
 const [target,setTarget]=useState('captain'),[busy,setBusy]=useState(false),[cap,setCap]=useState(24);
 const [selected,setSelected]=useState<{slot:string;crewId:string|null}|null>(null);
 const [dragged,setDragged]=useState<DragData|null>(null),[hover,setHover]=useState<string|null>(null),[page,setPage]=useState(0);
 const name=(item:Item|undefined)=>item?.game_items_i18n.find(x=>x.locale===locale)?.name||item?.game_items_i18n.find(x=>x.locale==='hu')?.name||item?.slug||'—';
 const refresh=useCallback(async()=>{
  const [i,st,eq,capacity]=await Promise.all([
   supabase.from('game_items').select('id,slug,category,rarity,image_path,equip_owner,equip_slot,capacity_bonus,game_items_i18n(locale,name,description)').eq('is_published',true).order('slug'),
   supabase.from('character_inventory').select('item_id,quantity').eq('character_id',characterId),
   supabase.from('character_equipment').select('id,crew_id,slot,item_id').eq('character_id',characterId),
   supabase.rpc('get_inventory_capacity')]);
  const err=i.error||st.error||eq.error||capacity.error;
  if(err){notify(err.message,'error');return;}
  setItems((i.data||[]) as unknown as Item[]);
  setStock((st.data||[]) as Stock[]);
  setEquipped((eq.data||[]) as Equipped[]);
  setCap(Number(capacity.data)||24);
 },[characterId]);
 useEffect(()=>{void refresh();},[refresh]);
 const crewId=target==='captain'?null:target;
 const slots=crewId?crewSlots:captainSlots;
 const current=equipped.filter(e=>e.crew_id===crewId);
 const currentName=target==='captain'?captainName:crew.find(c=>c.id===target)?.name||'—';
 const positive=stock.filter(row=>row.quantity>0);
 const used=positive.length,pages=Math.max(1,Math.ceil(cap/30)),displayPage=Math.min(page,pages-1);
 const itemById=(id:string)=>items.find(x=>x.id===id);
 const fits=(item:Item|undefined,slot:string,member:string|null)=>!!item&&item.equip_owner===(member?'crew':'captain')&&
  (item.equip_slot===slot||(!member&&['utility1','utility2'].includes(item.equip_slot||'')&&['utility1','utility2'].includes(slot)));
 const positionItem=(slot:string,memberId:string|null)=>equipped.find(x=>x.slot===slot&&x.crew_id===memberId);
 const readDrag=(e:DragEvent<HTMLElement>):DragData|null=>{
  try{
   const raw=e.dataTransfer.getData(DRAG_TYPE);
   if(!raw)return dragged;
   const data=JSON.parse(raw) as DragData;
   return data&&(data.kind==='stock'||data.kind==='gear')&&typeof data.itemId==='string'?data:null;
  }catch{return dragged;}
 };
 const startDrag=(e:DragEvent<HTMLElement>,data:DragData)=>{
  if(busy){e.preventDefault();return;}
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData(DRAG_TYPE,JSON.stringify(data));
  e.dataTransfer.setData('text/plain',data.itemId);
  setDragged(data);
 };
 const clearDrag=()=>{setDragged(null);setHover(null);};
 async function perform(rpc:'set_equipment'|'move_equipment',args:Record<string,string|null>,message:string){
  if(busy)return;
  setBusy(true);
  try{
   const result=await supabase.rpc(rpc,args);
   if(result.error){notify(result.error.message,'error');return;}
   if(!(result.data as {unchanged?:boolean}|null)?.unchanged)notify(message,'success');
   await refresh();await onChanged();setSelected(null);
  }catch(err){notify(err instanceof Error?err.message:String(err),'error');}
  finally{setBusy(false);clearDrag();}
 }
 function equip(slot:string,itemId:string|null,memberId:string|null){
  if(itemId&&!fits(itemById(itemId),slot,memberId)){
   notify(tr('A tárgy nem illik ebbe a slotba.','Incompatible equipment slot.'),'error');return;
  }
  void perform('set_equipment',{p_slot:slot,p_item:itemId,p_crew:memberId},
   itemId?tr('Tárgy felszerelve.','Item equipped.'):tr('Tárgy visszakerült a raktérbe.','Item returned to cargo.'));
 }
 function dropOnSlot(e:DragEvent<HTMLElement>,slot:string,memberId:string|null){
  e.preventDefault();e.stopPropagation();
  const data=readDrag(e);clearDrag();if(!data||busy)return;
  const item=itemById(data.itemId);
  if(!fits(item,slot,memberId)){
   notify(tr('Ez a felszerelés nem használható itt.','Equipment incompatible with this slot.'),'error');return;
  }
  if(data.kind==='stock'){equip(slot,data.itemId,memberId);return;}
  if(data.slot===slot&&data.crewId===memberId)return;
  void perform('move_equipment',{p_from_slot:data.slot,p_from_crew:data.crewId,p_to_slot:slot,p_to_crew:memberId},
   tr('Felszerelés áthelyezve.','Equipment moved.'));
 }
 function dropOnStock(e:DragEvent<HTMLElement>){
  e.preventDefault();e.stopPropagation();
  const data=readDrag(e);clearDrag();
  if(!data||busy||data.kind!=='gear')return;
  equip(data.slot,null,data.crewId);
 }
 function slotButton(slot:Slot){
  const worn=positionItem(slot.key,crewId),item=itemById(worn?.item_id||'');
  const active=selected?.slot===slot.key&&selected.crewId===crewId;
  const compatible=!!dragged&&fits(itemById(dragged.itemId),slot.key,crewId);
  return <div key={slot.key} className={'eq-slot-wrap slot-'+slot.key}>
   <span className="eq-slot-label">{en?slot.en:slot.hu}</span>
   <button type="button" className={'eq-slot '+(worn?'occupied ':'')+(item?.rarity||'')+(active?' active':'')+(hover===slot.key?' hover':'')+(compatible?' compatible':'')}
    disabled={busy} title={item?name(item):en?slot.en:slot.hu}
    aria-label={(en?slot.en:slot.hu)+(item?': '+name(item):'')}
    draggable={!!worn&&!busy} onDragStart={e=>worn&&startDrag(e,{kind:'gear',slot:slot.key,crewId,itemId:worn.item_id})}
    onDragEnd={clearDrag}
    onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect=compatible?'move':'none';setHover(slot.key);}}
    onDragLeave={()=>setHover(null)} onDrop={e=>dropOnSlot(e,slot.key,crewId)}
    onClick={()=>setSelected(active?null:{slot:slot.key,crewId})}>
    <ItemPicture item={item}/>
   </button>
  </div>;
 }
 const available=selected?items.filter(i=>fits(i,selected.slot,selected.crewId)&&positive.some(row=>row.item_id===i.id)):[];
 return <section className="eq-root">
  <nav className="eq-tabs" aria-label={tr('Felszerelés kezelése','Equipment character')}>
   <button type="button" className={target==='captain'?'active':''} onClick={()=>{setTarget('captain');setSelected(null);}}>{tr('KAPITÁNY','CAPTAIN')}</button>
   {crew.map(c=><button type="button" key={c.id} className={target===c.id?'active':''} onClick={()=>{setTarget(c.id);setSelected(null);}} title={crewPositionName(c.position,en)}>{c.name}</button>)}
  </nav>
  <div className="eq-workspace">
   <section className="eq-paperdoll" aria-label={tr('Karakter felszerelése','Character equipment')}>
    <header className="eq-pane-head"><span>{tr('FELSZERELÉS','EQUIPMENT')}</span><strong>{currentName}</strong></header>
    <div className={'eq-doll-grid '+(crewId?'eq-crew-doll':'eq-captain-doll')}>
     <div className="eq-figure-wrap"><DollSilhouette crew={!!crewId}/><span className="eq-figure-caption">{crewId?tr('LEGÉNYSÉG','CREW'):tr('KAPITÁNY','CAPTAIN')}</span></div>
     {slots.map(slot=>slotButton(slot))}
    </div>
    <div className="eq-instructions">{tr('Húzd a tárgyakat a megfelelő helyre, vagy vissza a raktérbe.','Drag items onto matching slots, or back into cargo.')}</div>
   </section>
   <section className={'eq-backpack '+(hover==='stock'?'eq-stock-hover':'')} aria-label={tr('Raktér','Cargo')}
    onDragOver={e=>{if(dragged?.kind==='gear'){e.preventDefault();e.dataTransfer.dropEffect='move';setHover('stock');}}}
    onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setHover(null);}}
    onDrop={dropOnStock}>
    <header className="eq-pane-head"><strong>{tr('RAKTÉR','CARGO')}</strong><span>{used} / {cap}</span>
     {pages>1&&<nav className="eq-pager" aria-label={tr('Raktér lapok','Cargo pages')}>
      <button type="button" disabled={displayPage===0} onClick={()=>setPage(n=>Math.max(0,n-1))}>‹</button>
      <span>{displayPage+1}/{pages}</span><button type="button" disabled={displayPage>=pages-1} onClick={()=>setPage(n=>Math.min(pages-1,n+1))}>›</button></nav>}
    </header>
    <div className="eq-grid" title={tr('Ide húzva visszakerül a tárgy a raktérbe.','Drop equipped item here to unequip.')}>
     {Array.from({length:Math.min(30,cap-displayPage*30)},(_,index)=>{
      const row=positive[index+displayPage*30],item=row&&itemById(row.item_id);
      const canEquip=!!item&&!!selected&&fits(item,selected.slot,selected.crewId);
      return <button type="button" key={index} disabled={busy} className={'eq-cell '+(item?'filled ':'')+(item?.rarity||'')+(canEquip?' equippable':'')}
       draggable={!!row&&!busy} onDragStart={e=>row&&startDrag(e,{kind:'stock',itemId:row.item_id})}
       onDragEnd={clearDrag}
       onClick={()=>{if(row&&canEquip&&selected)equip(selected.slot,row.item_id,selected.crewId);}}
       title={item?name(item):''} aria-label={item?name(item)+' ×'+row.quantity:tr('Üres hely','Empty slot')}>
       <ItemPicture item={item} showPlaceholder={false}/>{row&&<small className="eq-quantity">{row.quantity}</small>}
      </button>;
     })}
    </div>
    <div className="eq-picker">
     {selected?<><div className="eq-picker-head">
      <span>{tr('KIVÁLASZTOTT SLOT','SELECTED SLOT')}: {slots.find(x=>x.key===selected.slot)?.[en?'en':'hu']}</span>
      <button type="button" disabled={busy||!positionItem(selected.slot,selected.crewId)} onClick={()=>equip(selected.slot,null,selected.crewId)}>{tr('LEVÉTEL ↓','UNEQUIP ↓')}</button>
     </div><div className="eq-pick-options">{available.length?available.map(item=><button type="button" key={item.id} disabled={busy}
       onClick={()=>equip(selected.slot,item.id,selected.crewId)} title={name(item)}><ItemPicture item={item}/><span>{name(item)}</span></button>):
       <span className="eq-picker-empty">{tr('Nincs kompatibilis tárgy a raktérben.','No matching items in cargo.')}</span>}</div></>:
     <p>{tr('Slot kiválasztása után kattintással is felszerelhetsz. A kétirányú húzás mindig működik.','Select a slot for click-to-equip. Drag and drop works in both directions.')}</p>}
    </div>
   </section>
  </div>
 </section>;
}
