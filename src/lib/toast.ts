export type ToastTone='success'|'error'|'info'|'warning';
export type ToastMessage={id:number;tone:ToastTone;message:string;title?:string};
const EVENT='hatarvilag:toast';
let seq=0;
/** Global client-side event, shared by character flow and editors without a UI dependency. */
export function notify(message:string,tone:ToastTone='info',title?:string){
 if(typeof window==='undefined'||!message.trim())return;
 window.dispatchEvent(new CustomEvent<ToastMessage>(EVENT,{detail:{id:++seq,tone,title,message}}));
}
export function listenToasts(callback:(message:ToastMessage)=>void){
 const listener=(e:Event)=>callback((e as CustomEvent<ToastMessage>).detail);
 window.addEventListener(EVENT,listener);
 return ()=>window.removeEventListener(EVENT,listener);
}
