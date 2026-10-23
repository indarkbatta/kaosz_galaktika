import {useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {layoutProfileForWidth,layoutSizes} from '../lib/uiLayout';

/** Fit every outer game frame to its canvas, including the real body/footer chrome. */
export default function GamePanelFrame({compact=false,children}:{compact?:boolean;children:ReactNode}){
 const frame=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState<CSSProperties>({});
 useLayoutEffect(()=>{
  const el=frame.current,parent=el?.parentElement;
  if(!compact||!el||!parent){setSize({});return;}
  const update=()=>{
   const body=el.querySelector<HTMLElement>('.cmd-body'),shell=el.querySelector<HTMLElement>('.cmd-shell'),footer=el.querySelector<HTMLElement>('.cmd-footer');
   if(!body||!shell)return;
   const outer=getComputedStyle(parent),content=getComputedStyle(body),border=getComputedStyle(shell);
   const px=(v:string)=>Number.parseFloat(v)||0;
   const chromeX=px(content.paddingLeft)+px(content.paddingRight)+px(border.borderLeftWidth)+px(border.borderRightWidth);
   const chromeY=px(content.paddingTop)+px(content.paddingBottom)+px(border.borderTopWidth)+px(border.borderBottomWidth)+(footer?.getBoundingClientRect().height||0);
   const availableW=parent.clientWidth-px(outer.paddingLeft)-px(outer.paddingRight),availableH=parent.clientHeight-px(outer.paddingTop)-px(outer.paddingBottom);
   const logical=layoutSizes[layoutProfileForWidth(window.innerWidth)];
   const fit=Math.max(0,Math.min(1,(availableW-chromeX)/logical.w,(availableH-chromeY)/logical.h));
   setSize({width:logical.w*fit+chromeX,height:logical.h*fit+chromeY});
  };
  const observer=new ResizeObserver(update);observer.observe(parent);
  window.addEventListener('resize',update);update();
  return()=>{observer.disconnect();window.removeEventListener('resize',update);};
 },[compact]);
 return <div ref={frame} className={'cmd-frame'+(compact?' cmd-frame-compact':'')} style={compact?size:undefined}>{children}</div>;
}
