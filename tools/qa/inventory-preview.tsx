// Isolated read-only fixture for checking the real inventory component, never imported by App.
import React from 'react';
import {createRoot} from 'react-dom/client';
import EquipmentInventory,{type StorageSnapshot} from '../../src/EquipmentInventory';
import '../../src/captain-dashboard.css';
import '../../src/styles.css';
import items from './inventory-items.json';
const bySlug=(slug:string)=>items.find(i=>i.slug===slug)!;
const cargoSlugs=['alloy_scrap','polymer_fiber','circuit_core','encrypted_fragments','ship_reactor_standard','ship_drive_standard','plasma_cell','trade_seals','ship_shield_standard','stellar_charts','ship_cargo_pod','crew_armor'];
const personalSlugs=['captain_medkit','field_scanner','captain_sidearm','emergency_patch','captain_toolkit','plasma_cell'];
const gear=['captain_relic','captain_vest','captain_rifle','captain_sidearm','captain_toolkit','captain_medkit','captain_belt','captain_backpack'];
const slotKeys=['relic','body_armor','main_weapon','sidearm','utility1','utility2','belt','backpack'];
const snapshot:StorageSnapshot={items,cargo:cargoSlugs.filter(s=>bySlug(s)).map((s,i)=>({item_id:bySlug(s).id,quantity:[12,8,3,5,7,2,1,4,6,10,1,3][i]})),personal:personalSlugs.filter(s=>bySlug(s)).map(s=>({item_id:bySlug(s).id,quantity:1})),equipped:gear.filter(s=>bySlug(s)).map((s,i)=>({id:s,crew_id:null,slot:slotKeys[i],item_id:bySlug(s).id})),cargo_capacity:80,personal_capacity:18,ship:{translations:[{locale:'hu',name:'Vándor'},{locale:'en',name:'Wanderer'}]}};
function Preview(){return <div className="qa-window"><div className="cmd-shell"><header className="cmd-head"><div><small>HATÁRVILÁG</small><strong>PARANCSNOKSÁG</strong></div><nav>{['HÍD','TÉRKÉP','KARAKTER','HAJÓ','KANTIN','RAKTÉR','NAPLÓ'].map(x=><button key={x} className={x==='RAKTÉR'?'active':''}>{x}</button>)}</nav></header><div className="cmd-summary"><div><strong>INDARK</strong><p>KAPITÁNY · 1. SZINT</p></div><div><small>ENERGIA</small><p>16 / 16</p></div><div><small>HAJÓ</small><p>Vándor</p></div><div><small>HELYSZÍN</small><p>Határvidéki állomás</p></div></div><main className="cmd-body"><div className="cmd-title"><h2>FELSZERELÉS ÉS RAKTÉR</h2><div className="cmd-cargo-tabs"><button className="active">KÉSZLET</button><button>GYÁRTÁS</button></div></div><EquipmentInventory characterId="fixture" captainName="Indark" locale="hu" crew={[]} onChanged={async()=>{}} initialData={snapshot}/></main><footer className="cmd-footer">HATÁRVILÁG · ELSZIGETELT, CSAK OLVASHATÓ VIZUÁLIS TESZT</footer></div></div>}
createRoot(document.getElementById('root')!).render(<Preview/>);
