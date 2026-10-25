import {useLayoutEffect,useRef,useState} from 'react';

/** Fit complete record cards into the available roster height, without scrolling. */
export function useRosterCapacity(){
 const ref=useRef<HTMLDivElement>(null);
 const [capacity,setCapacity]=useState(1);
 useLayoutEffect(()=>{
  const list=ref.current;if(!list)return;
  const measure=()=>{
   const card=list.querySelector<HTMLElement>('.ed-record');if(!card)return;
   const style=getComputedStyle(list),recordStyle=getComputedStyle(card);
   const height=list.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
   const margin=parseFloat(recordStyle.marginBottom)||0;
   const stride=card.getBoundingClientRect().height+margin;
   if(stride>0)setCapacity(Math.max(1,Math.floor((height+margin)/stride)));
  };
  const resize=new ResizeObserver(measure);resize.observe(list);
  // First load, filtering and translated names can change the measured card height.
  let observedCard:Element|null=null;
  const mutation=new MutationObserver(()=>{const card=list.querySelector('.ed-record');if(card!==observedCard){if(observedCard)resize.unobserve(observedCard);observedCard=card;if(card)resize.observe(card);}measure();});
  mutation.observe(list,{childList:true,subtree:true,characterData:true});measure();
  return()=>{resize.disconnect();mutation.disconnect();};
 },[]);
 return {ref,capacity};
}
