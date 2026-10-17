import {useEffect,useState} from 'react';
import {listenToasts,type ToastMessage} from '../lib/toast';
import './toast.css';
const SHOW_MS=5500;
export default function ToastViewport(){
 const [messages,setMessages]=useState<ToastMessage[]>([]);
 useEffect(()=>{
  const clear=listenToasts(message=>setMessages(prev=>[...prev.slice(-3),message]));
  return clear;
 },[]);
 useEffect(()=>{
  if(!messages.length)return;
  const timeouts=messages.map(x=>setTimeout(()=>setMessages(prev=>prev.filter(y=>y.id!==x.id)),SHOW_MS));
  return ()=>timeouts.forEach(clearTimeout);
 },[messages]);
 return <aside className="hv-toasts" aria-label="Notifications" aria-live="polite" aria-atomic="false">
  {messages.map(x=><article key={x.id} className={'hv-toast hv-toast-'+x.tone} role={x.tone==='error'?'alert':'status'}>
   <span className="hv-toast-symbol" aria-hidden="true">{({success:'✓',error:'!',info:'i',warning:'!'})[x.tone]}</span>
   <div className="hv-toast-body">{x.title&&<strong>{x.title}</strong>}<p>{x.message}</p></div>
   <button type="button" className="hv-toast-close" title="Close" aria-label="Close notification" onClick={()=>setMessages(prev=>prev.filter(v=>v.id!==x.id))}>×</button>
  </article>)}
 </aside>;
}
