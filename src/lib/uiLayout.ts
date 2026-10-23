import type {CSSProperties} from 'react';
import {supabase} from './supabase';
import {worldImageUrl} from './worldImages';
export type Rect={x:number;y:number;w:number;h:number};
export type LayoutNode={rect?:Rect;background?:string;opacity?:number;fit?:'cover'|'contain'|'repeat';label?:{hu:string;en:string};fontSize?:number;color?:string;locked?:boolean;hidden?:boolean;group?:string;columns?:number;cellSize?:number;z?:number};
export type Extra=LayoutNode&{id:string;type:'text'|'image'};
export type LayoutProfile={nodes:Record<string,LayoutNode>;extras:Extra[]};
export type UILayout={version:1;desktop:LayoutProfile;laptop:LayoutProfile};
export type Profile='desktop'|'laptop';
export type LayoutRecord={revision:number;draft:UILayout;published:UILayout|null;previous:UILayout|null};
export const emptyLayout=():UILayout=>({version:1,desktop:{nodes:{},extras:[]},laptop:{nodes:{},extras:[]}});
export const layoutElements=[
 {id:'frame',hu:'Loadout ablak',en:'Loadout window',selector:':scope',parent:null},
 {id:'titlebar',hu:'Címsor',en:'Title bar',selector:'.cmd-title',parent:'frame'},
 {id:'title',hu:'Ablakcím',en:'Window title',selector:'.cmd-title h2',parent:'titlebar',text:true},
 {id:'tabs',hu:'Belső fülek',en:'Inner tabs',selector:'.exp-tabs',parent:'titlebar'},
 {id:'equipment',hu:'Felszerelési munkatér',en:'Equipment workspace',selector:'.eq-root',parent:'frame'},
 {id:'selector',hu:'Karakterválasztó',en:'Character selector',selector:'.eq-tabs',parent:'equipment'},
 {id:'paperdoll',hu:'Felszerelés',en:'Equipment',selector:'.eq-paperdoll',parent:'equipment'},
 {id:'equipment_title',hu:'Felszerelés felirata',en:'Equipment label',selector:'.eq-paperdoll .eq-pane-head strong',parent:'paperdoll',text:true},
 {id:'figure',hu:'Papírbaba',en:'Paperdoll',selector:'.eq-figure-wrap',parent:'paperdoll',anchor:'.eq-doll-grid'},
 {id:'personal',hu:'Karakter inventory',en:'Personal inventory',selector:'.eq-personal',parent:'equipment'},
 {id:'personal_title',hu:'Inventory felirata',en:'Inventory label',selector:'.eq-personal .eq-pane-head strong',parent:'personal',text:true},
 {id:'base_title',hu:'Alaphelyek felirata',en:'Base slots label',selector:'.eq-personal .eq-grid-label:not(.eq-bonus-label)',parent:'personal',text:true},
 {id:'bag_title',hu:'Hátizsák felirata',en:'Backpack label',selector:'.eq-bonus-label',parent:'personal',text:true},
 {id:'cargo',hu:'Hajó raktere',en:'Ship cargo',selector:'.eq-cargo',parent:'equipment'},
 {id:'cargo_title',hu:'Raktér felirata',en:'Cargo label',selector:'.eq-cargo .eq-pane-head strong',parent:'cargo',text:true},
 {id:'detail',hu:'Tárgyinformáció',en:'Item information',selector:'.eq-detail',parent:'cargo'},
 {id:'detail_title',hu:'Tárgyinformáció felirata',en:'Item information label',selector:'.eq-detail>header',parent:'detail',text:true},
 ...['relic','body_armor','main_weapon','sidearm','utility1','utility2','belt','backpack','weapon','armor','utility'].map(id=>({id:'slot_'+id,hu:'Slot · '+id,en:'Slot · '+id,selector:'.eq-slot-wrap.slot-'+id,parent:'paperdoll',anchor:'.eq-doll-grid'})),
] as const;
export type ElementDef=typeof layoutElements[number];
export function layoutElement(root:HTMLElement,id:string):HTMLElement|null{const d=layoutElements.find(d=>d.id===id);return !d?root.querySelector(`[data-ui-extra="${id}"]`):d.selector===':scope'?root:root.querySelector(d.selector);}
export function layoutParent(root:HTMLElement,id:string):HTMLElement{const d=layoutElements.find(d=>d.id===id);if(id==='frame')return root.parentElement||root;if(!d||!d.parent)return root;return ('anchor'in d&&d.anchor?root.querySelector<HTMLElement>(d.anchor):layoutElement(root,d.parent))||root;}
export function measureLayout(root:HTMLElement):Record<string,LayoutNode>{const out:Record<string,LayoutNode>={};for(const d of layoutElements){const el=layoutElement(root,d.id);if(!el||d.id==='frame'||('text'in d&&d.text))continue;const r=el.getBoundingClientRect(),p=layoutParent(root,d.id).getBoundingClientRect();if(!p.width||!p.height)continue;out[d.id]={rect:clampRect({x:(r.left-p.left)*100/p.width,y:(r.top-p.top)*100/p.height,w:r.width*100/p.width,h:r.height*100/p.height})};}return out;}
export function clampRect(r:Rect):Rect{const w=Math.max(2,Math.min(100,r.w)),h=Math.max(2,Math.min(100,r.h));return {x:Math.max(0,Math.min(100-w,r.x)),y:Math.max(0,Math.min(100-h,r.y)),w,h};}
export function artUrl(path?:string){return path?.startsWith('uploads/')?supabase.storage.from('ui-layout-art').getPublicUrl(path).data.publicUrl:worldImageUrl(path);}
export function nodeStyle(n:LayoutNode):CSSProperties{return {...(n.rect?{position:'absolute',left:n.rect.x+'%',top:n.rect.y+'%',width:n.rect.w+'%',height:n.rect.h+'%',margin:0,flex:'none'}:{}),...(n.hidden?{display:'none'}:{}),...(n.fontSize?{fontSize:n.fontSize}:{}),...(n.color?{color:n.color}:{}),...(n.z!==undefined?{zIndex:n.z}:{}),'--ui-panel-image':n.background?`url("${artUrl(n.background)}")`:'none','--ui-panel-opacity':n.opacity??.2,'--ui-panel-fit':n.fit==='contain'?'contain':'cover','--ui-panel-repeat':n.fit==='repeat'?'repeat':'no-repeat'} as CSSProperties;}
export function defaultLayoutGeometry(root:HTMLElement):Record<string,LayoutNode>{const copy=root.cloneNode(true) as HTMLElement;copy.classList.remove('ui-layout-applied');copy.querySelectorAll('[data-ui-extra]').forEach(e=>e.remove());for(const e of [copy,...Array.from(copy.querySelectorAll<HTMLElement>('.ui-layout-node'))]){e.classList.remove('ui-layout-node','ui-layout-label','ui-layout-background');e.removeAttribute('style');}Object.assign(copy.style,{position:'fixed',left:'-20000px',top:'0',width:root.clientWidth+'px',height:root.clientHeight+'px',visibility:'hidden'});document.body.append(copy);const result=measureLayout(copy);copy.remove();return result;}
