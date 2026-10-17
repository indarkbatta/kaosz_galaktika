import {useEffect,useState} from 'react';
import {supabase} from './lib/supabase';
import {notify} from './lib/toast';
import './cantina.css';
export type CrewMember={position:string;name:string;specialty?:string|null;aptitude?:number;species_slug?:string|null};
type Applicant={id:string;name:string;specialty:string;aptitude:number;species_slug:string;portrait_path:string|null};
type Roster={candidates:Applicant[];expires_at:string;hire_energy_cost:number;replace_energy_cost:number};
export const CREW_POSITIONS=['pilot','navigator','engineer','security','medic'] as const;
export function crewPositionName(position:string,en:boolean){
 const titles:Record<string,[string,string]>={pilot:['Pilóta','Pilot'],navigator:['Navigátor','Navigator'],
 engineer:['Gépész','Engineer'],security:['Biztonsági tiszt','Security'],medic:['Orvos','Medic']};
 return (titles[position]||[position,position])[en?1:0];
}
export default function Cantina({locale,atStation,crew,energy,onChanged}:{
 locale:string;atStation:boolean;crew:CrewMember[];energy:number;onChanged:()=>Promise<void>
}){
 const en=locale==='en',tr=(hu:string,english:string)=>en?english:hu;
 const [roster,setRoster]=useState<Roster|null>(null),[busy,setBusy]=useState(false);
 const [positions,setPositions]=useState<Record<string,string>>({});
 const [confirm,setConfirm]=useState<Applicant|null>(null);
 async function load(){
  if(!atStation){setRoster(null);return;}
  const r=await supabase.rpc('get_cantina_roster');
  if(r.error)notify(r.error.message,'error');
  else setRoster(r.data as Roster);
 }
 useEffect(()=>{void load();},[atStation]);
 const position=(a:Applicant)=>positions[a.id]||a.specialty;
 const replace=(a:Applicant)=>crew.find(c=>c.position===position(a));
 const price=(a:Applicant)=>replace(a)?(roster?.replace_energy_cost||25):(roster?.hire_energy_cost||20);
 async function hire(a:Applicant){
  if(!atStation||busy||energy<price(a))return;
  setBusy(true);setConfirm(null);
  const slot=position(a);
  const r=await supabase.rpc('hire_cantina_candidate',{p_candidate:a.id,p_position:slot});
  if(r.error)notify(r.error.message,'error');
  else{
   const data=r.data as {name:string;replaced:string|null;energy_spent:number};
   notify(data.replaced?tr(data.replaced+' helyére '+data.name+' érkezett.','Replaced '+data.replaced+' with '+data.name+'.'):
    tr(data.name+' csatlakozott a legénységhez.',data.name+' joined your crew.'),'success');
   await onChanged();await load();
  }
  setBusy(false);
 }
 return <section className="cantina-root">
  {!atStation?<div className="cantina-away"><strong>{tr('A kantin csak a Határvidéki állomáson érhető el.','The cantina is only available at Frontier Station.')}</strong><p>{tr('Utazz vissza az állomásra, hogy új legénységi tagokat toborozz.','Travel back to the station to recruit crew.')}</p></div>:<>
   <header className="cantina-summary"><span>{tr('JELENTKEZŐK','APPLICANTS')}: {roster?.candidates.length||0} / 3–5</span><span>{roster?.expires_at?tr('Kínálat frissül','Roster refreshes')+': '+new Date(roster.expires_at).toLocaleString(en?'en-GB':'hu-HU'):tr('Kínálat betöltése...','Loading applicants...')}</span></header>
   <div className="cantina-candidates">{roster?.candidates.map(a=>{
    const slot=position(a),old=replace(a),cost=price(a);
    return <article className="cantina-candidate" key={a.id}>
     <div className="cantina-picture">{a.portrait_path?<img alt="" src={'https://assets.voidnoir.net/'+a.portrait_path}/>:<span>✦</span>}</div>
     <div className="cantina-identity"><strong>{a.name}</strong><small>{a.species_slug} · {crewPositionName(a.specialty,en)}</small></div>
     <div className="cantina-ability"><span>{tr('Szaktudás','Aptitude')}</span><strong>{'◆'.repeat(a.aptitude)}{'◇'.repeat(5-a.aptitude)}</strong></div>
     <label>{tr('Beosztás','Position')}<select value={slot} onChange={e=>setPositions(x=>({...x,[a.id]:e.target.value}))}>{CREW_POSITIONS.map(p=><option key={p} value={p}>{crewPositionName(p,en)}</option>)}</select></label>
     <button type="button" disabled={busy||energy<cost} onClick={()=>old?setConfirm(a):void hire(a)}>
      {old?tr('CSERE','REPLACE'):tr('FELVÉTEL','HIRE')} · ⚡ {cost}
     </button>
    </article>
   })}</div>
   <div className="cantina-crew"><strong>{tr('JELENLEGI LEGÉNYSÉG','CURRENT CREW')}</strong><div>{CREW_POSITIONS.map(slot=>{const member=crew.find(c=>c.position===slot);return <span key={slot}>{crewPositionName(slot,en)}: <b>{member?.name||'—'}</b></span>})}</div></div>
  </>}
  {confirm&&<div className="cmd-modal-bg"><div className="cmd-modal" role="dialog" aria-modal="true">
   <h3>{tr('LEGÉNYSÉGI TAG CSERÉJE','REPLACE CREW MEMBER')}</h3>
   <p>{tr((replace(confirm)?.name||'')+' helyére '+confirm.name+' kerül a '+crewPositionName(position(confirm),en)+' beosztásban. A régi tag távozik.','Replace '+(replace(confirm)?.name||'')+' with '+confirm.name+' in the '+crewPositionName(position(confirm),en)+' position. The old member departs.')}</p>
   <div><button type="button" onClick={()=>setConfirm(null)}>{tr('Mégse','Cancel')}</button><button type="button" disabled={busy||energy<price(confirm)} onClick={()=>void hire(confirm)}>{tr('Csere megerősítése','Confirm replacement')} · ⚡ {price(confirm)}</button></div>
  </div></div>}
 </section>;
}
