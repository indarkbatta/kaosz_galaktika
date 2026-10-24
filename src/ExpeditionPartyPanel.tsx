import {useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Save,X,Users} from 'lucide-react';
import {supabase} from './lib/supabase';
import {WorldArtwork} from './components/WorldImageField';
import {expeditionError} from './lib/expeditionActors';
import type {TeamLoadout} from './ExpeditionLoadout';
export default function ExpeditionPartyPanel({data,locale,onSaved}:{data:TeamLoadout;locale:string;onSaved:(d:TeamLoadout)=>void}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const [party,setParty]=useState(data.party),[slot,setSlot]=useState(0),[page,setPage]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),gate=useRef(false);
 const name=(id:string)=>{const a=data.actors.find(x=>x.id===id);return a?(en?a.name_en:a.name_hu):tr('Üres hely','Empty slot');};
 function place(id:string,index:number){setParty(p=>{const next=[...p],old=next.indexOf(id),target=Math.min(index,next.length);if(old>=0){[next[old],next[target]]=[next[target],next[old]];return next.filter(Boolean);}if(target===next.length&&next.length>=4)return p;if(next[target]===data.actors.find(a=>a.kind==='captain')?.id)return p;next[target]=id;return next;});}
 async function save(){if(gate.current)return;gate.current=true;setBusy(true);setError('');try{const r=await supabase.rpc('save_expedition_party',{p_actors:party,p_revision:data.revision});if(r.error)throw new Error(r.error.message);onSaved(r.data);setParty(r.data.party);}catch(e){setError(expeditionError(e instanceof Error?e.message:String(e),locale));}finally{gate.current=false;setBusy(false);}}
 return <section className="exp-party exp-powers" aria-label={tr('Expedíciós csapat','Expedition team')}>
 <p>{tr('Kapitány + legfeljebb 3 társ. Az 1. pozíció van elöl. Húzással vagy a nyilakkal rendezheted a felállást.','Captain + up to 3 companions. Position 1 is the front. Drag or use arrows to reorder.')}</p>
 <div className="exp-party-positions">{Array.from({length:4},(_,i)=>{const a=data.actors.find(a=>a.id===party[i]);return <div key={i} onDragOver={e=>{if(!busy&&!data.locked)e.preventDefault();}} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('application/x-expedition-actor');if(data.actors.some(a=>a.id===id)&&!busy&&!data.locked)place(id,i);}}>
 <button className={slot===i?'active':''} disabled={busy||data.locked} draggable={!!a&&!busy&&!data.locked} onDragStart={e=>a&&e.dataTransfer.setData('application/x-expedition-actor',a.id)} onClick={()=>setSlot(i)} aria-label={`${i+1}. ${name(party[i])}`}><b>{i+1}</b>{a?<WorldArtwork path={a.portrait_path||a.image_path} fallback=""/>:<Users/>}<strong>{name(party[i])}</strong></button>
 <nav className="exp-order"><button aria-label={tr('Előrébb','Move forward')} disabled={busy||data.locked||i===0||!a} onClick={()=>place(a!.id,i-1)}><ChevronLeft size={16}/></button><button aria-label={tr('Hátrébb','Move back')} disabled={busy||data.locked||i>=party.length-1||!a} onClick={()=>place(a!.id,i+1)}><ChevronRight size={16}/></button><button aria-label={tr('Társ kivétele','Remove companion')} disabled={busy||data.locked||!a||a.kind==='captain'} onClick={()=>setParty(p=>p.filter((_,n)=>n!==i))}><X size={16}/></button></nav></div>;})}</div>
 {error&&<p role="alert">{error}</p>}
 <div className="exp-party-roster">{data.actors.slice(page*4,page*4+4).map(a=><button key={a.id} disabled={busy||data.locked||party.includes(a.id)} onClick={()=>place(a.id,slot)} draggable={!busy&&!data.locked} onDragStart={e=>e.dataTransfer.setData('application/x-expedition-actor',a.id)}><WorldArtwork path={a.portrait_path||a.image_path} fallback=""/><strong>{name(a.id)}</strong><span>{tr('Szint','Level')} {a.level}</span></button>)}</div>
 <nav className="exp-order"><button disabled={!page} aria-label={tr('Előző karakterek','Previous characters')} onClick={()=>setPage(page-1)}><ChevronLeft size={16}/></button><span>{page+1}/{Math.max(1,Math.ceil(data.actors.length/4))}</span><button disabled={(page+1)*4>=data.actors.length} aria-label={tr('További karakterek','More characters')} onClick={()=>setPage(page+1)}><ChevronRight size={16}/></button><button disabled={busy||data.locked||JSON.stringify(party)===JSON.stringify(data.party)} onClick={()=>void save()}><Save size={16}/>{tr('CSAPAT MENTÉSE','SAVE TEAM')}</button></nav>
 </section>;
}
