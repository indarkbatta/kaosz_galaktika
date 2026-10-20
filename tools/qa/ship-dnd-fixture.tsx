import {createRoot} from "react-dom/client";
import ShipLoadout from "../../src/ShipLoadout";
const module = (id, kind, quantity) => ({
  item_id:id, slug:id, image_path:"hatarvilag/qa/"+id+".webp", rarity:"common", module_kind:kind,
  size:1, quantity, is_published:true, power_draw:0, power_output:0,
  hull_bonus:0, shield_bonus:0, damage_bonus:0, speed_bonus:0, cargo_bonus:0,
  translations:[{locale:"en",name:id,description:""}],
});
const slot = (key, kind, moduleKind, role, item, crew) => ({
  slot_key:key,kind,module_kind:moduleKind,crew_role:role,size:1,min_aptitude:1,
  required:false,name_hu:key,name_en:key,item_id:item,crew_id:crew,
});
window.__calls=[];
window.__changed=0;
window.__snapshot={
  ship_id:"fixture",
  stats:{hull:100,shield:0,damage:0,speed:1,cargo:50,power_draw:0,power_output:10,missing_required:0,ready:true},
  modules:[module("engine","engine",0),module("shield","shield",0)],
  crew:[{id:"mara",name:"Mara",specialty:"pilot",aptitude:4,rarity:"rare",portrait_path:"hatarvilag/qa/mara.webp"}],
  slots:[
    slot("Engine A","module","engine",null,"engine",null),
    slot("Engine B","module","engine",null,null,null),
    slot("Shield","module","shield",null,null,null),
    slot("Pilot A","crew",null,"pilot",null,"mara"),
    slot("Pilot B","crew",null,"pilot",null,null),
  ],
};
window.__fixtureRpc=async (rpc,args={})=>{
  const state=window.__snapshot;
  if(rpc==="get_ship_loadout")return {data:structuredClone(state),error:null};
  window.__calls.push({rpc,args});
  if(window.__reject)return {error:{message:"Ship cargo capacity exceeded"},data:null};
  if(window.__hold)await new Promise(resolve=>window.__release=resolve);
  const target=state.slots.find(s=>s.slot_key===args.p_slot);
  if(rpc==="set_ship_module"){
    if(target.item_id)state.modules.find(m=>m.item_id===target.item_id).quantity++;
    if(args.p_item)state.modules.find(m=>m.item_id===args.p_item).quantity--;
    target.item_id=args.p_item;
  }else if(rpc==="assign_ship_crew"){
    if(args.p_crew)state.slots.filter(s=>s.crew_id===args.p_crew).forEach(s=>s.crew_id=null);
    target.crew_id=args.p_crew;
  }else if(rpc==="move_ship_module"){
    const from=state.slots.find(s=>s.slot_key===args.p_from_slot);
    const to=state.slots.find(s=>s.slot_key===args.p_to_slot);
    [from.item_id,to.item_id]=[to.item_id,from.item_id];
  }else throw Error("Unexpected RPC: "+rpc);
  return {data:{},error:null};
};
createRoot(document.getElementById("root")).render(
  <ShipLoadout characterId="fixture" shipSlug="fixture" shipName="Fixture" locale="en"
    onChanged={async()=>{window.__changed++}}/>
);
