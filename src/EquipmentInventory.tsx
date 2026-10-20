import {useCallback,useEffect,useRef,useState,type DragEvent,type MouseEvent as ReactMouseEvent,type FocusEvent as ReactFocusEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {crewPositionName,type CrewMember} from './Cantina';
import {ItemHoverTooltip} from './components/ItemDetailView';
import {itemAssetUrl,itemName,itemDescription,type ItemCatalogEntry} from './lib/itemPresentation';
import './equipment-inventory.css';

type Item=ItemCatalogEntry;
type Store='personal'|'cargo';
type Stock={item_id:string;quantity:number};
type Equipped={id:string;crew_id:string|null;slot:string;item_id:string};
type Slot={key:string;hu:string;en:string};
export type StorageSnapshot={cargo:Stock[];personal:Stock[];equipped:Equipped[];items:Item[];cargo_capacity:number;personal_capacity:number;ship:{translations:{locale:string;name:string}[]}};
type DragData={kind:'stock';storage:Store;itemId:string;quantity:number}|{kind:'gear';slot:string;crewId:string|null;itemId:string};
type Selection={storage:Store;itemId:string}|{slot:string;crewId:string|null;itemId:string|null};
const DRAG_TYPE='application/x-hatarvilag-equipment';
const captainSlots:Slot[]=[{key:'relic',hu:'Relikvia',en:'Relic'},{key:'body_armor',hu:'Testpáncél',en:'Body armor'},{key:'main_weapon',hu:'Főfegyver',en:'Main weapon'},{key:'sidearm',hu:'Oldalfegyver',en:'Sidearm'},{key:'utility1',hu:'Utility 1',en:'Utility 1'},{key:'utility2',hu:'Utility 2',en:'Utility 2'},{key:'belt',hu:'Öv',en:'Belt'},{key:'backpack',hu:'Hátizsák',en:'Backpack'}];
const crewSlots:Slot[]=[{key:'armor',hu:'Páncélzat',en:'Armor'},{key:'weapon',hu:'Fegyverzet',en:'Weapon'},{key:'utility',hu:'Utility',en:'Utility'}];
function ItemPicture({item,placeholder=false}:{item:Item|undefined;placeholder?:boolean}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[item?.id,item?.image_path]);
 const src=itemAssetUrl(item?.image_path);
 return <span className="eq-art">{src&&!failed?<img src={src} alt="" draggable={false} onError={()=>setFailed(true)}/>:placeholder?<span className="eq-no-art">◇</span>:null}</span>;
}
export default function EquipmentInventory({characterId,captainName,locale,crew,onChanged,initialData}:{characterId:string;captainName:string;locale:string;crew:CrewMember[];onChanged:()=>Promise<void>;initialData?:StorageSnapshot}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [data,setData]=useState<StorageSnapshot|null>(initialData||null),[error,setError]=useState(''),[target,setTarget]=useState('captain'),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<Selection|null>(null),[dragged,setDragged]=useState<DragData|null>(null),[hover,setHover]=useState(''),[cargoPage,setCargoPage]=useState(0),[bagPage,setBagPage]=useState(0),[quantity,setQuantity]=useState(1);
 const [tip,setTip]=useState<{item:Item;quantity?:number;equipped:boolean;storage?:Store;x:number;y:number}|null>(null);
 const guard=useRef(false),generation=useRef(0),root=useRef<HTMLElement>(null);
 const [compact,setCompact]=useState(false);
 useEffect(()=>{if(!data||!root.current)return;const observer=new ResizeObserver(([entry])=>setCompact(entry.contentRect.width<=700));observer.observe(root.current);return()=>observer.disconnect();},[!!data]);
 const refresh=useCallback(async()=>{const ticket=++generation.current;const r=await supabase.rpc('get_storage_inventory');if(ticket!==generation.current)return;if(r.error){setError(r.error.message);return;}setError('');setData(r.data as StorageSnapshot);},[characterId]);
 useEffect(()=>{if(initialData)return;setData(null);void refresh();return()=>{generation.current++;};},[refresh,initialData]);
 const member=crew.find(c=>c.id===target),crewId=member?.id||null,slots=crewId?crewSlots:captainSlots,currentName=member?.name||captainName;
 const items=data?.items||[],cargo=data?.cargo||[],personal=data?.personal||[],equipped=data?.equipped||[];
 const itemById=(id:string|null)=>items.find(i=>i.id===id),name=(i:Item|undefined)=>itemName(i,locale);
 const positionItem=(slot:string,id:string|null)=>equipped.find(e=>e.slot===slot&&e.crew_id===id);
 const fits=(i:Item|undefined,slot:string,id:string|null)=>!!i&&i.equip_owner===(id?'crew':'captain')&&(i.equip_slot===slot||(!id&&['utility1','utility2'].includes(i.equip_slot||'')&&['utility1','utility2'].includes(slot)));
 const selectedItem=itemById(selected?.itemId||null),selectedStock=selected&&'storage'in selected?(selected.storage==='cargo'?cargo:personal).find(s=>s.item_id===selected.itemId):null;
 const selectedGear=selected&&'slot'in selected?selected:null;
 const errorText=(message:string)=>({
  'Personal inventory capacity exceeded':tr('A karakter tárgyai nem férnek el. Helyezz át tárgyakat a hajó rakterébe, mielőtt leveszed a hátizsákot.','Personal inventory is full. Move items to ship cargo before removing the backpack.'),
  'Ship cargo capacity exceeded':tr('A hajó raktere megtelt.','Ship cargo is full.'),
  'Not enough item stock':tr('Nincs elegendő tárgy a kiválasztott tárolóban.','Not enough stock in the selected storage.'),
  'Item incompatible with selected slot':tr('A tárgy nem illik a kijelölt felszerelési helyre.','Item does not fit this equipment slot.')
 } as Record<string,string>)[message]||message;
 async function perform(rpc:string,args:Record<string,string|number|null>){if(guard.current||initialData)return;guard.current=true;setBusy(true);setTip(null);
  try{const r=await supabase.rpc(rpc,args);if(r.error)throw new Error(errorText(r.error.message));await Promise.all([refresh(),onChanged()]);setSelected(null);notify(tr('Készlet frissítve.','Inventory updated.'),'success');}
  catch(e){notify(e instanceof Error?e.message:String(e),'error');}finally{guard.current=false;setBusy(false);setDragged(null);setHover('');}
 }
 function equip(slot:string,itemId:string|null,id:string|null,storage:Store){void perform('set_equipment_from_storage',{p_slot:slot,p_item:itemId,p_crew:id,p_storage:storage});}
 function transfer(itemId:string,amount:number,to:Store){void perform('move_storage_item',{p_item:itemId,p_quantity:amount,p_to:to});}
 function start(e:DragEvent,payload:DragData){setTip(null);setDragged(payload);e.dataTransfer.setData(DRAG_TYPE,JSON.stringify(payload));e.dataTransfer.effectAllowed='move';}
 function read(e:DragEvent):DragData|null{try{return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as DragData;}catch{return dragged;}}
 const clearDrag=()=>{setDragged(null);setHover('');setTip(null);};
 function dropOnSlot(e:DragEvent,slot:string){e.preventDefault();e.stopPropagation();const d=read(e);clearDrag();if(!d||busy)return;
  if(!fits(itemById(d.itemId),slot,crewId)){notify(tr('Ez a felszerelés nem használható itt.','Equipment incompatible with this slot.'),'error');return;}
  if(d.kind==='stock')equip(slot,d.itemId,crewId,d.storage);
  else if(d.slot!==slot||d.crewId!==crewId)void perform('move_equipment',{p_from_slot:d.slot,p_from_crew:d.crewId,p_to_slot:slot,p_to_crew:crewId});
 }
 function dropOnStorage(e:DragEvent,to:Store){e.preventDefault();e.stopPropagation();const d=read(e);clearDrag();if(!d||busy)return;
  if(d.kind==='gear')equip(d.slot,null,d.crewId,to);else if(d.storage!==to)transfer(d.itemId,d.quantity,to);
 }
 function showTip(e:ReactMouseEvent<HTMLButtonElement>|ReactFocusEvent<HTMLButtonElement>,item:Item|undefined,stock?:number,storage?:Store){if(!item||dragged||busy)return;
  const rect=e.currentTarget.getBoundingClientRect();const mouse='clientX'in e;
  setTip({item,quantity:stock,equipped:storage===undefined,storage,x:Math.max(8,Math.min((mouse?e.clientX:rect.right)+14,window.innerWidth-336)),y:Math.max(8,Math.min(mouse?e.clientY:rect.top,window.innerHeight-325))});
 }
 function stockCell(row:Stock|undefined,storage:Store,key:number){const item=row&&itemById(row.item_id),active=selected&&'storage'in selected&&selected.storage===storage&&selected.itemId===row?.item_id;
  return <button type="button" key={key} className={'eq-cell '+(row?'filled ':'')+(item?.rarity||'')+(active?' active':'')} disabled={busy} draggable={!!row&&!busy}
   onDragStart={e=>row&&start(e,{kind:'stock',itemId:row.item_id,quantity:row.quantity,storage})} onDragEnd={clearDrag}
   onClick={()=>{setTip(null);if(!row)return;if(selectedGear&&fits(item,selectedGear.slot,selectedGear.crewId))equip(selectedGear.slot,row.item_id,selectedGear.crewId,storage);else{setSelected({storage,itemId:row.item_id});setQuantity(row.quantity);}}}
   aria-label={row?name(item)+' ×'+row.quantity:tr('Üres hely','Empty slot')}
   onMouseEnter={e=>showTip(e,item,row?.quantity,storage)} onMouseMove={e=>showTip(e,item,row?.quantity,storage)} onMouseLeave={()=>setTip(null)} onFocus={e=>showTip(e,item,row?.quantity,storage)} onBlur={()=>setTip(null)}>
   <ItemPicture item={item}/>{row&&<small className="eq-quantity">{row.quantity}</small>}
  </button>;
 }
 if(!data)return <div className="eq-loading" role="status">{error||tr('Készletek betöltése…','Loading inventories…')}{error&&<button onClick={()=>void refresh()}>{tr('Újrapróbálás','Retry')}</button>}</div>;
 const cargoPageSize=compact?25:40;
 const cargoPages=Math.max(1,Math.ceil(data.cargo_capacity/cargoPageSize)),cp=Math.min(cargoPage,cargoPages-1),bonus=Math.max(0,data.personal_capacity-6),bagPages=Math.max(1,Math.ceil(bonus/12)),bp=Math.min(bagPage,bagPages-1);
 const base=personal.slice(0,6),bag=personal.slice(6+bp*12,18+bp*12);
 const shipName=data.ship?.translations?.find(t=>t.locale===locale)?.name||data.ship?.translations?.find(t=>t.locale==='hu')?.name||'—';
 const preferredSlot=selectedItem?.equip_slot||'',canEquip=selected&&'storage'in selected&&fits(selectedItem,preferredSlot,crewId);
 return <section ref={root} className="eq-root" aria-busy={busy} aria-label={tr('Felszerelés és raktér','Equipment and cargo')}>
  <nav className="eq-tabs" aria-label={tr('Karakter felszerelése','Character equipment')}><button className={!crewId?'active':''} onClick={()=>{setTarget('captain');setSelected(null);}}>{tr('KAPITÁNY','CAPTAIN')}</button>{crew.map(c=><button key={c.id} className={target===c.id?'active':''} title={crewPositionName(c.position,en)} onClick={()=>{setTarget(c.id);setSelected(null);}}>{c.name}</button>)}</nav>
  {error&&<p role="alert" className="eq-error">{error}</p>}
  <div className="eq-workspace">
   <section className="eq-paperdoll"><header className="eq-pane-head"><strong>{tr('FELSZERELÉS','EQUIPMENT')}</strong><span>{currentName}</span></header>
    <div className={'eq-doll-grid '+(crewId?'eq-crew-doll':'eq-captain-doll')}><div className="eq-figure-wrap"><img className="eq-figure" src="https://assets.voidnoir.net/hatarvilag/paperdolls/inventory-captain-v1.webp" alt={tr('Karakter felszerelési nézete','Character equipment view')} onError={e=>{const image=e.currentTarget;if(!image.dataset.fallback){image.dataset.fallback='1';image.src='/assets/captain-inventory-v1.webp';}}} draggable={false}/></div>
     {slots.map(slot=>{const worn=positionItem(slot.key,crewId),item=itemById(worn?.item_id||null),active=selectedGear?.slot===slot.key&&selectedGear.crewId===crewId;
      return <div key={slot.key} className={'eq-slot-wrap slot-'+slot.key}><span className="eq-slot-label">{en?slot.en:slot.hu}</span><button type="button" className={'eq-slot '+(item?.rarity||'')+(active?' active':'')+(hover===slot.key?' hover':'')} disabled={busy} aria-label={(en?slot.en:slot.hu)+(item?': '+name(item):'')}
       draggable={!!worn&&!busy} onDragStart={e=>worn&&start(e,{kind:'gear',slot:slot.key,crewId,itemId:worn.item_id})} onDragEnd={clearDrag} onDragOver={e=>{if(dragged&&fits(itemById(dragged.itemId),slot.key,crewId)){e.preventDefault();setHover(slot.key);}}} onDragLeave={()=>setHover('')} onDrop={e=>dropOnSlot(e,slot.key)}
       onClick={()=>{setTip(null);setSelected(active?null:{slot:slot.key,crewId,itemId:worn?.item_id||null});}}
       onMouseEnter={e=>showTip(e,item)} onMouseMove={e=>showTip(e,item)} onMouseLeave={()=>setTip(null)} onFocus={e=>showTip(e,item)} onBlur={()=>setTip(null)}><ItemPicture item={item} placeholder/></button></div>;
     })}
    </div><p className="eq-help">{tr('Húzd a tárgyat egy felszerelési helyre.','Drag an item onto an equipment slot.')}</p>
   </section>
   <section className={'eq-personal '+(hover==='personal'?'eq-stock-hover':'')} onDragOver={e=>{if(dragged){e.preventDefault();setHover('personal');}}} onDragLeave={()=>setHover('')} onDrop={e=>dropOnStorage(e,'personal')} aria-label={tr('Karakter inventory','Personal inventory')}>
    <header className="eq-pane-head"><strong>{tr('KARAKTER INVENTORY','PERSONAL INVENTORY')}</strong></header><div className="eq-capacity">{captainName}<br/>{tr('Alap','Base')}: 6 + {tr('hátizsák','backpack')}: {bonus}<span>{personal.length} / {data.personal_capacity}</span></div>
    <h3 className="eq-grid-label">{tr('ALAPHELYEK','BASE SLOTS')} · 6</h3><div className="eq-grid eq-personal-grid">{Array.from({length:6},(_,i)=>stockCell(base[i],'personal',i))}</div>
    <h3 className="eq-grid-label eq-bonus-label">{tr('HÁTIZSÁK','BACKPACK')} · +{bonus}</h3>
    {bonus?<div className="eq-grid eq-personal-grid">{Array.from({length:Math.min(12,bonus-bp*12)},(_,i)=>stockCell(bag[i],'personal',i+6))}</div>:<p className="eq-help">{tr('A felszerelt hátizsák további helyeket ad.','Equip a backpack to add more slots.')}</p>}
    {bagPages>1&&<nav className="eq-pager" aria-label={tr('Hátizsák lapozása','Backpack pages')}><button disabled={bp===0} onClick={()=>setBagPage(bp-1)}>‹</button><span>{bp+1} / {bagPages}</span><button disabled={bp===bagPages-1} onClick={()=>setBagPage(bp+1)}>›</button></nav>}
    <p className="eq-help eq-personal-total">{tr('Külön tároló · a hajó rakterét nem bővíti.','Separate storage · does not expand ship cargo.')}</p>
   </section>
   <section className={'eq-cargo '+(hover==='cargo'?'eq-stock-hover':'')} onDragOver={e=>{if(dragged){e.preventDefault();setHover('cargo');}}} onDragLeave={()=>setHover('')} onDrop={e=>dropOnStorage(e,'cargo')} aria-label={tr('Hajó raktere','Ship cargo')}>
    <header className="eq-pane-head"><strong>{tr('HAJÓ RAKTERE','SHIP CARGO')}</strong><span>{cargo.length} / {data.cargo_capacity}</span></header><div className="eq-capacity">{shipName} · {tr('Kapacitás','Capacity')}: {data.cargo_capacity}</div>
    <div className="eq-grid eq-cargo-grid">{Array.from({length:Math.min(cargoPageSize,Math.max(0,data.cargo_capacity-cp*cargoPageSize))},(_,i)=>stockCell(cargo[cp*cargoPageSize+i],'cargo',i))}</div>
    <nav className="eq-pager" aria-label={tr('Raktér lapozása','Cargo pages')}><button disabled={cp===0} onClick={()=>setCargoPage(cp-1)}>‹</button><span>{cp+1} / {cargoPages}</span><button disabled={cp===cargoPages-1} onClick={()=>setCargoPage(cp+1)}>›</button></nav>
    <div className="eq-detail"><header>{selectedGear&&!selectedItem?tr('KIJELÖLT FELSZERELÉSI HELY','SELECTED EQUIPMENT SLOT'):tr('KIJELÖLT TÁRGY','SELECTED ITEM')}</header>
     {selectedItem?<><div className="eq-detail-item"><ItemPicture item={selectedItem}/><div><strong>{name(selectedItem)}</strong><p>{itemDescription(selectedItem,locale)}</p></div></div>
      <div className="eq-detail-actions">{selected&&'storage'in selected?<><label>{tr('Darab','Qty')}<input type="number" min={1} max={selectedStock?.quantity||1} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><button disabled={busy||!Number.isInteger(quantity)||quantity<1||quantity>(selectedStock?.quantity||0)} onClick={()=>transfer(selected.itemId,quantity,selected.storage==='cargo'?'personal':'cargo')}>{selected.storage==='cargo'?tr('→ Hátizsák','→ Backpack'):tr('→ Hajóraktér','→ Ship cargo')}</button>{canEquip&&<button disabled={busy} onClick={()=>equip(preferredSlot,selected.itemId,crewId,selected.storage)}>{tr('Felszerelés','Equip')}</button>}</>:selectedGear&&<><button disabled={busy} onClick={()=>equip(selectedGear.slot,null,selectedGear.crewId,'personal')}>{tr('→ Hátizsák','→ Backpack')}</button><button disabled={busy} onClick={()=>equip(selectedGear.slot,null,selectedGear.crewId,'cargo')}>{tr('→ Hajóraktér','→ Ship cargo')}</button></>}</div>
     </>:<p className="eq-help">{selectedGear?tr('Kattints egy megfelelő tárgyra, vagy húzd erre a helyre.','Click a matching item or drag it onto this slot.'):tr('Válassz tárgyat. A két tároló között húzással vagy kattintással mozgathatsz.','Select an item. Move between storages by dragging or clicking.')}</p>}
    </div>
   </section>
  </div>
  {tip&&!dragged&&<ItemHoverTooltip {...tip} locale={locale}/>}
 </section>;
}
