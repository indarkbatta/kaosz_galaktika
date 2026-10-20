import type {ReactNode} from 'react';
/** Single visual and structural template for all Határvilág editors. */
export function EditorFrame({children}:{children:ReactNode}){
 return <div className="ed-layout"><div className="ed-shell">{children}</div></div>;
}
export function EditorRoster({children,className=''}:{children:ReactNode;className?:string}){
 return <aside className={['ed-roster',className].filter(Boolean).join(' ')}>{children}</aside>;
}
export function EditorHeader({children}:{children:ReactNode}){
 return <header className="ed-editor-head">{children}</header>;
}
export function EditorFooter({children}:{children:ReactNode}){
 return <footer className="ed-footer">{children}</footer>;
}
export type EditorTabId='general'|'skills'|'dictionary'|string;
export function EditorTabs({items,selected,onSelect,label,variant='detail'}:{
 items:{id:string;name:string}[];selected:string;onSelect:(id:string)=>void;
 label:string;variant?:'detail'|'catalog';
}){
 return <nav className={'ed-tabs ed-tabs-'+variant} aria-label={label}>
  {items.map(item=><button key={item.id} type="button" className={selected===item.id?'active':''}
   aria-current={selected===item.id?'page':undefined} onClick={()=>onSelect(item.id)}>{item.name}</button>)}
 </nav>;
}
