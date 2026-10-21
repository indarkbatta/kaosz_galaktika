import {useEffect,useState} from 'react';
import '../bridge-encounter.css';
export type DiceResult={dice:number[];pip_bonus:number;roll_total:number;target_number:number;succeeded:boolean;
 wild_dice?:number[];wild_cancelled_index?:number|null;wild_penalty?:number;wild_rule?:string};
export function DiceRollPanel({locale,result,rolling=false,onComplete}:{locale:string;result:DiceResult|null;rolling?:boolean;onComplete?:()=>void}){
 const en=locale==='en';
 const [revealed,setRevealed]=useState(false);
 useEffect(()=>{setRevealed(false);if(!result)return;
  const timer=setTimeout(()=>{setRevealed(true);onComplete?.();},window.matchMedia('(prefers-reduced-motion: reduce)').matches?10:850);
  return()=>clearTimeout(timer);
 },[result,onComplete]);
 const spinning=rolling||!revealed;
 const wild=result?.wild_dice||[];
 const dice=result?.dice||[0,0,0];
 return <section className={'dice-panel '+(spinning?'is-rolling':'is-revealed')} aria-label={en?'Dice roll':'Kockadobás'} aria-busy={spinning}>
  <strong>{spinning?(en?'Rolling…':'Dobás…'):(result?.succeeded?(en?'SUCCESS':'SIKER'):(en?'FAILURE':'KUDARC'))}</strong>
  <div className="dice-tray">{dice.map((v,i)=><div key={'d'+i} className={'dice-cell '+(result?.wild_cancelled_index===i?'cancelled':'')}>
   <Die value={v} spinning={spinning}/><small>D6</small></div>)}
   {wild.map((v,i)=><div key={'w'+i} className={'dice-cell wild '+(result?.wild_penalty&&i===0?'cancelled':'')}>
    <Die value={v} spinning={spinning}/><small>{i===0?'Wild Die':'+ Wild'}</small></div>)}
  </div>
  {!spinning&&result&&<div className="dice-result" aria-live="polite">
   <span>{en?'Pip bonus':'Pip bónusz'}: +{result.pip_bonus}</span>
   {!!result.wild_penalty&&<span>{en?'Wild Die: first 1 and highest die removed':'Wild Die: első 1 és legmagasabb kocka kiesik'} (−{result.wild_penalty})</span>}
   <b>{en?'Total':'Végösszeg'}: {result.roll_total}</b><span>{en?'Target Number (TN)':'Célszám (TN)'}: {result.target_number}</span>
  </div>}
 </section>;
}
function Die({value,spinning}:{value:number;spinning:boolean}){
 const spots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
 return <span className="d6-face" aria-label={spinning?'D6…':'D6 '+value}>
  {Array.from({length:9},(_,i)=><i key={i} className={!spinning&&spots[value]?.includes(i)?'pip visible':'pip'}/>)}
  {spinning&&<span className="dice-wait">✦</span>}
 </span>;
}
