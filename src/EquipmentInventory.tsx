import {useCallback,useEffect,useState,type DragEvent,type MouseEvent as ReactMouseEvent,type FocusEvent as ReactFocusEvent} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {crewPositionName,type CrewMember} from './Cantina';
import {ItemHoverTooltip} from './components/ItemDetailView';
import {itemAssetUrl,itemName,type ItemCatalogEntry} from './lib/itemPresentation';
import './equipment-inventory.css';

type Item=ItemCatalogEntry;
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

function ItemPicture({item,showPlaceholder=true}:{item:Item|undefined;showPlaceholder?:boolean}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[item?.id,item?.image_path]);
 const src=itemAssetUrl(item?.image_path);
 return <span className="eq-art">{src&&!failed?<img src={src} alt="" draggable={false} onError={()=>setFailed(true)}/>:showPlaceholder?<span className="eq-no-art" aria-hidden="true">◇</span>:null}</span>;
}
function DollSilhouette({crew}:{crew:boolean}){
 return <svg className="eq-figure" viewBox="0 0 190 440" preserveAspectRatio="xMidYMid meet" role="img" aria-label={crew?'Legénységi felszerelés sziluettje':'Kapitány felszerelési sziluettje'}>
  <defs><linearGradient id="eqArmorMetal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#637180"/><stop offset=".45" stopColor="#24323e"/><stop offset="1" stopColor="#101922"/></linearGradient><linearGradient id="eqVoidMetal" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#263642"/><stop offset="1" stopColor="#080d13"/></linearGradient></defs>
  <path d="M73 44 Q64 30 73 14 Q95 -4 117 14 Q126 30 117 44 L125 59 L151 67 Q168 80 167 115 L158 202 L174 251 L160 267 L144 254 L130 163 L127 198 L132 253 L127 337 L139 416 L122 430 L100 426 L94 314 L88 426 L67 431 L49 416 L59 336 L53 253 L58 195 L49 166 L36 253 L22 267 L8 251 L23 201 L21 116 Q18 80 38 68 L65 59 Z" fill="url(#eqVoidMetal)" stroke="#76818b" strokeWidth="2.2"/>
  <path d="M77 16 Q95 4 113 16 L117 39 L107 55 L83 55 L73 39 Z" fill="url(#eqArmorMetal)" stroke="#a7a59d" strokeWidth="1.3"/>
  <path d="M80 27 L110 27 L107 37 L83 37 Z" fill="#080e14" stroke="#d18b5b" strokeWidth="1.5"/><path d="M85 34 L105 34" stroke="#d97844" strokeWidth="2"/>
  <path d="M69 58 L122 58 L143 87 L127 153 L115 188 L76 188 L61 150 L45 86 Z" fill="url(#eqArmorMetal)" stroke="#87919b" strokeWidth="2"/>
  <path d="M57 80 L95 98 L132 80 L126 128 L95 153 L64 128 Z" fill="#18252e" stroke="#697783"/><path d="M95 98 L95 148 M60 132 L130 132" stroke="#c0784a" strokeWidth="2"/>
  <path d="M48 72 L25 87 L28 116 L54 114 L66 93 Z M142 72 L166 87 L162 116 L137 114 L126 93 Z" fill="url(#eqArmorMetal)" stroke="#89929a" strokeWidth="1.8"/>
  <path d="M33 121 L54 125 L40 190 L20 185 Z M136 125 L157 121 L170 185 L150 190 Z" fill="#2c3945" stroke="#677685"/>
  <path d="M22 192 L42 195 L29 253 L13 245 Z M148 195 L168 192 L178 245 L162 253 Z" fill="#364450" stroke="#8d857c"/>
  <path d="M65 192 L125 192 L128 215 L60 215 Z" fill="#131a21" stroke="#aa805c" strokeWidth="3"/>
  <path d="M63 225 L91 225 L87 313 L55 311 Z M101 225 L129 225 L136 311 L103 313 Z" fill="#2a3947" stroke="#697784" strokeWidth="2"/>
  <path d="M54 313 L88 315 L83 402 L51 408 Z M104 315 L138 313 L140 408 L108 402 Z" fill="#27333d" stroke="#78838c" strokeWidth="2"/>
  <path d="M52 404 L84 400 L86 421 L61 429 L43 423 Z M108 400 L139 404 L148 423 L131 429 L106 421 Z" fill="#222c34" stroke="#989189" strokeWidth="2"/>
  <path d="M56 170 L135 170" stroke="#b8754b" strokeWidth="2" strokeDasharray="3 6"/>
 </svg>;
}
export default function EquipmentInventory({characterId,captainName,locale,crew,onChanged}:{
 characterId:string;captainName:string;locale:string;crew:CrewMember[];onChanged:()=>Promise<void>
}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [items,setItems]=useState<Item[]>([]),[stock,setStock]=useState<Stock[]>([]),[equipped,setEquipped]=useState<Equipped[]>([]);
 const [target,setTarget]=useState('captain'),[busy,setBusy]=useState(false),[cap,setCap]=useState(24);
 const [selected,setSelected]=useState<{slot:string;crewId:string|null}|null>(null);
 const [dragged,setDragged]=useState<DragData|null>(null),[hover,setHover]=useState<string|null>(null),[page,setPage]=useState(0);
 const name=(item:Item|undefined)=>itemName(item,locale);
 const [tip,setTip]=useState<{item:Item;quantity?:number;equipped:boolean;x:number;y:number}|null>(null);
 const showTip=(e:ReactMouseEvent<HTMLButtonElement>,item:Item|undefined,quantity?:number,equipped=false)=>{
  if(!item||dragged||busy)return;
  setTip({item,quantity,equipped,
   x:Math.max(8,Math.min(e.clientX+16,window.innerWidth-336)),
   y:Math.max(8,Math.min(e.clientY+14,window.innerHeight-325))});
 };
 const focusTip=(e:ReactFocusEvent<HTMLButtonElement>,item:Item|undefined,quantity?:number,equipped=false)=>{
  if(!item||dragged||busy)return;
  const rect=e.currentTarget.getBoundingClientRect();
  setTip({item,quantity,equipped,
   x:Math.max(8,Math.min(rect.right+12,window.innerWidth-336)),
   y:Math.max(8,Math.min(rect.top,window.innerHeight-325))});
 };
 
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
  setTip(null);
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData(DRAG_TYPE,JSON.stringify(data));
  e.dataTransfer.setData('text/plain',data.itemId);
  setDragged(data);
 };
 const clearDrag=()=>{setDragged(null);setHover(null);setTip(null);};
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
    disabled={busy} title={item?undefined:en?slot.en:slot.hu}
    onMouseEnter={e=>showTip(e,item,undefined,true)} onMouseMove={e=>showTip(e,item,undefined,true)}
    onMouseLeave={()=>setTip(null)} onFocus={e=>focusTip(e,item,undefined,true)} onBlur={()=>setTip(null)}
    aria-label={(en?slot.en:slot.hu)+(item?': '+name(item):'')}
    draggable={!!worn&&!busy} onDragStart={e=>worn&&startDrag(e,{kind:'gear',slot:slot.key,crewId,itemId:worn.item_id})}
    onDragEnd={clearDrag}
    onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect=compatible?'move':'none';setHover(slot.key);}}
    onDragLeave={()=>setHover(null)} onDrop={e=>dropOnSlot(e,slot.key,crewId)}
    onClick={()=>{setTip(null);setSelected(active?null:{slot:slot.key,crewId});}}>
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
     <div className="eq-figure-wrap">{crewId?<DollSilhouette crew={true}/>:<img className="eq-figure" src="https://assets.voidnoir.net/hatarvilag/inventory/torchlight-v1/captain.webp" alt={tr('Kapitány felszerelési alakja','Captain equipment figure')} draggable={false} style={{objectFit:'contain',objectPosition:'center',opacity:1}}/>}<span className="eq-figure-caption">{crewId?tr('LEGÉNYSÉG','CREW'):tr('KAPITÁNY','CAPTAIN')}</span></div>
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
       aria-label={item?name(item)+' ×'+row.quantity:tr('Üres hely','Empty slot')}
       onMouseEnter={e=>showTip(e,item,row?.quantity)} onMouseMove={e=>showTip(e,item,row?.quantity)}
       onMouseLeave={()=>setTip(null)} onFocus={e=>focusTip(e,item,row?.quantity)} onBlur={()=>setTip(null)}>
       <ItemPicture item={item} showPlaceholder={false}/>{row&&<small className="eq-quantity">{row.quantity}</small>}
      </button>;
     })}
    </div>
    <div className="eq-picker">
     {selected?<><div className="eq-picker-head">
      <span>{tr('KIVÁLASZTOTT SLOT','SELECTED SLOT')}: {slots.find(x=>x.key===selected.slot)?.[en?'en':'hu']}</span>
      <button type="button" disabled={busy||!positionItem(selected.slot,selected.crewId)} onClick={()=>equip(selected.slot,null,selected.crewId)}>{tr('LEVÉTEL ↓','UNEQUIP ↓')}</button>
     </div><div className="eq-pick-options">{available.length?available.map(item=><button type="button" key={item.id} disabled={busy}
       onClick={()=>equip(selected.slot,item.id,selected.crewId)}
       onMouseEnter={e=>showTip(e,item,positive.find(row=>row.item_id===item.id)?.quantity)}
       onMouseMove={e=>showTip(e,item,positive.find(row=>row.item_id===item.id)?.quantity)}
       onMouseLeave={()=>setTip(null)} onFocus={e=>focusTip(e,item,positive.find(row=>row.item_id===item.id)?.quantity)}
       onBlur={()=>setTip(null)}><ItemPicture item={item}/><span>{name(item)}</span></button>):
       <span className="eq-picker-empty">{tr('Nincs kompatibilis tárgy a raktérben.','No matching items in cargo.')}</span>}</div></>:
     <p>{tr('Slot kiválasztása után kattintással is felszerelhetsz. A kétirányú húzás mindig működik.','Select a slot for click-to-equip. Drag and drop works in both directions.')}</p>}
    </div>
   </section>
  </div>
  {tip&&!dragged&&<ItemHoverTooltip item={tip.item} locale={locale} quantity={tip.quantity} equipped={tip.equipped} x={tip.x} y={tip.y}/>}
 </section>;
}
