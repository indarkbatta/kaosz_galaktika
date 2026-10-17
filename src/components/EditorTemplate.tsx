import type {ReactNode} from 'react';

/**
 * Universal structural shell for Határvilág content editors.
 * Future ship/item/mission editors should reuse this frame,
 * the same compact centered three-column layout and tab navigation.
 */
export function EditorFrame({children}:{children:ReactNode}){
  return <div className="ed-layout"><div className="ed-shell">{children}</div></div>;
}
export type EditorTabId = 'general'|'skills'|'dictionary'|string;
export function EditorTabs({items,selected,onSelect,label}:{items:{id:string;name:string}[];selected:string;onSelect:(id:string)=>void;label:string}){
  return <nav className="ed-tabs" aria-label={label}>
    {items.map(item=><button key={item.id} type="button" className={selected===item.id?'active':''} onClick={()=>onSelect(item.id)}>{item.name}</button>)}
  </nav>;
}
