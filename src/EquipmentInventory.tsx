import {useCallback,useEffect,useState} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import {crewPositionName,type CrewMember} from './Cantina';
import './equipment-inventory.css';

type Txt={locale:string;name:string;description?:string};
type Item={id:string;slug:string;category:string;rarity:string;image_path:string|null;equip_owner:string|null;equip_slot:string|null;capacity_bonus:number;game_items_i18n:Txt[]};
type Stock={item_id:string;quantity:number};
type Equipped={id:string;crew_id:string|null;slot:string;item_id:string};
type Slot={key:string;hu:string;en:string};
const captainSlots:Slot[]=[
 {key:'main_weapon',hu:'Főfegyver',en:'Main weapon'},{key:'sidearm',hu:'Oldalfegyver',en:'Sidearm'},
 {key:'body_armor',hu:'Testpáncél',en:'Body armor'},{key:'utility1',hu:'Utility 1',en:'Utility 1'},
 {key:'utility2',hu:'Utility 2',en:'Utility 2'},{key:'belt',hu:'Öv',en:'Belt'},
 {key:'backpack',hu:'Hátizsák',en:'Backpack'},{key:'relic',hu:'Relikvia',en:'Relic'}];
const crewSlots:Slot[]=[{key:'armor',hu:'Páncélzat',en:'Armor'},{key:'weapon',hu:'Fegyverzet',en:'Weapon'},{key:'utility',hu:'Utility',en:'Utility'}];
const url=(p:string|null|undefined)=>p?'https://assets.voidnoir.net/'+p:undefined;
export function ItemPicture({item,className=''}:{item:Item|undefined;className?:string}){
 return item?.image_path?<img className={'eq-item-picture '+className} src={url(item.image_path)} alt=""/>:<span className={'eq-symbol '+className} aria-hidden="true">{item?.category==='equipment'?'⚒':item?.category==='material'?'⬡':'✦'}</span>;
}
export default function EquipmentInventory({characterId,captainName,locale,crew,onChanged}:{
 characterId:string;captainName:string;locale:string;crew:CrewMember[];onChanged:()=>Promise<void>
}){
 const en=locale==='en',tr=(hu:string,english:string)=>en?english:hu;
 const [items,setItems]=useState<Item[]>([]),[stock,setStock]=useState<Stock[]>([]),[equipped,setEquipped]=useState<Equipped[]>([]);
 const [target,setTarget]=useState<string>('captain'),[busy,setBusy]=useState(false),[cap,setCap]=useState(24);
 const [selected,setSelected]=useState<{slot:string;crewId:string|null}|null>(null);
 const [dragged,setDragged]=useState<string|null>(null),[page,setPage]=useState(0);
 const name=(item:Item|undefined)=>item?.game_items_i18n.find(x=>x.locale===locale)?.name||item?.game_items_i18n.find(x=>x.locale==='hu')?.name||item?.slug||'—';
 const refresh=useCallback(async()=>{
  const [i,st,eq,capacity]=await Promise.all([
   supabase.from('game_items').select('id,slug,category,rarity,image_path,equip_owner,equip_slot,capacity_bonus,game_items_i18n(locale,name,description)').eq('is_published',true).order('slug'),
   supabase.from('character_inventory').select('item_id,quantity').eq('character_id',characterId),
   supabase.from('character_equipment').select('id,crew_id,slot,item_id').eq('character_id',characterId),
   supabase.rpc('get_inventory_capacity')
  ]);
  const err=i.error||st.error||eq.error||capacity.error;if(err){notify(err.message,'error');return;}
  setItems((i.data||[]) as unknown as Item[]);setStock((st.data||[]) as Stock[]);
  setEquipped((eq.data||[]) as Equipped[]);setCap(Number(capacity.data)||24);
 },[characterId]);
 useEffect(()=>{void refresh();},[refresh]);
 const crewId=target==='captain'?null:target;
 const slots=crewId?crewSlots:captainSlots;
 const owner=crewId?'crew':'captain';
 const current=equipped.filter(e=>e.crew_id===crewId);
 const avail=(slot:string)=>items.filter(i=>i.equip_owner===owner&&i.equip_slot===slot&&
 (stock.find(row=>row.item_id===i.id)?.quantity||0)>0);
 async function setEquipment(slot:string,itemId:string|null,memberId:string|null){
  if(busy)return;
  // UI rejects accidental incompatible drops; the RPC independently revalidates ownership and stock.
  if(itemId){
   const it=items.find(x=>x.id===itemId);
   if(!it||it.equip_owner!==(memberId?'crew':'captain')||it.equip_slot!==slot){
    notify(tr('Ez a tárgy nem illik a kiválasztott helyre.','That item does not fit this slot.'),'error');return;
   }
  }
  setBusy(true);
  try{
   const r=await supabase.rpc('set_equipment',{p_slot:slot,p_item:itemId,p_crew:memberId});
   if(r.error){notify(r.error.message,'error');return;}
   if((r.data as {unchanged?:boolean}|null)?.unchanged){setSelected(null);return;}
   notify(itemId?tr('Tárgy felszerelve.','Item equipped.'):tr('Tárgy levéve.','Item unequipped.'),'success');
   await refresh();await onChanged();setSelected(null);
  }catch(error){notify(error instanceof Error?error.message:String(error),'error');}
  finally{setBusy(false);}
 }
 const currentName=target==='captain'?captainName:crew.find(c=>c.id===target)?.name||'—';
 const used=stock.filter(x=>x.quantity>0).length;
 const pages=Math.max(1,Math.ceil(cap/36));
 const displayPage=Math.min(page,pages-1);
 return <section className="eq-root">
  <div className="eq-tabs"><button className={target==='captain'?'active':''} onClick={()=>{setTarget('captain');setSelected(null);}}>{tr('KAPITÁNY','CAPTAIN')}</button>
   {crew.map(c=><button key={c.id} className={target===c.id?'active':''} onClick={()=>{setTarget(c.id);setSelected(null);}}>{c.name}</button>)}
  </div>
  <div className="eq-workspace">
   <div className="eq-paperdoll">
    <header><span>{tr('FELSZERELÉS','EQUIPMENT')}</span><strong>{currentName}</strong></header>
    <div className={'eq-slots '+(crewId?'eq-slots-crew':'')}>
     {slots.map(slot=>{const found=current.find(e=>e.slot===slot.key),item=items.find(i=>i.id===found?.item_id);
       const active=selected?.slot===slot.key&&selected.crewId===crewId;
       return <button key={slot.key} type="button" className={'eq-slot '+(found?'occupied ':'')+(active?'active ':'')}
        title={item?name(item):en?slot.en:slot.hu}
        onClick={()=>setSelected(active?null:{slot:slot.key,crewId})}
        onDragOver={e=>{if(dragged)e.preventDefault();}}
        onDrop={e=>{e.preventDefault();const dropped=dragged||e.dataTransfer.getData('text/plain');if(dropped)void setEquipment(slot.key,dropped,crewId);setDragged(null);}}>
        <small>{en?slot.en:slot.hu}</small><ItemPicture item={item}/>{item&&<span className="eq-item-name">{name(item)}</span>}
       </button>})}
    </div>
    <p>{crewId?tr('Csak legénységi tárgyak helyezhetők ide.','Only crew equipment can be assigned here.'):tr('Hátizsák: +12 vagy a tárgyon megadott tárolóhely.','Backpack provides bonus storage slots.')}</p>
   </div>
   <div className="eq-backpack">
    <header><strong>{tr('TÁRGYKÉSZLET','ITEM STASH')}</strong><span>{used} / {cap} {tr('tárgyhely','slots')}</span>{pages>1&&<nav className="eq-pager"><button disabled={displayPage===0} onClick={()=>setPage(x=>Math.max(0,x-1))}>‹</button><span>{displayPage+1}/{pages}</span><button disabled={displayPage>=pages-1} onClick={()=>setPage(x=>Math.min(pages-1,x+1))}>›</button></nav>}</header>
    {selected&&<div className="eq-picker"><span>{tr('Felszerelési hely','Slot')}: {slots.find(x=>x.key===selected.slot)?.[en?'en':'hu']}</span>
     <div>{avail(selected.slot).map(item=><button key={item.id} onClick={()=>void setEquipment(selected.slot,item.id,crewId)} disabled={busy}><ItemPicture item={item}/>{name(item)}</button>)}
     <button onClick={()=>void setEquipment(selected.slot,null,crewId)} disabled={busy}>{tr('LEVÉTEL','UNEQUIP')}</button></div></div>}
    <div className="eq-grid">{Array.from({length:Math.min(36,cap-displayPage*36)},(_,index)=>{const row=stock.filter(x=>x.quantity>0)[index+displayPage*36],item=items.find(i=>i.id===row?.item_id);
     const canEquip=!!item&&!!selected&&item.equip_owner===(selected.crewId?'crew':'captain')&&item.equip_slot===selected.slot;
     return <div key={index} className={'eq-cell '+(item?'filled ':'')+(canEquip?'equippable ':'')+(item?.rarity||'')}
      draggable={!!item&&!busy} onDragStart={e=>{if(row){e.dataTransfer.setData('text/plain',row.item_id);setDragged(row.item_id);}}}
      onDragEnd={()=>setDragged(null)}
      role={canEquip?'button':undefined} tabIndex={canEquip?0:undefined}
      onClick={()=>{if(canEquip&&row)void setEquipment(selected!.slot,row.item_id,selected!.crewId);}}
      onKeyDown={e=>{if(canEquip&&row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();void setEquipment(selected!.slot,row.item_id,selected!.crewId);}}}
      title={item?name(item):''}>
      <ItemPicture item={item}/>{row&&<small>{row.quantity}</small>}
     </div>})}</div>
    <div className="eq-explain">{tr('Felszerelés: válassz slotot, majd tárgyat; vagy húzd az ikont a slotra.','Select a slot then an item, or drag an item onto the slot.')}</div>
   </div>
  </div>
 </section>;
}
