import {useState,type ReactNode} from 'react';
import {ResistanceFields} from './CombatFields';
export function OriginResistances({locale,value,onChange,environment}:{locale:string;value:Record<string,number>;onChange:(v:Record<string,number>)=>void;environment?:ReactNode}){
 const en=locale==='en',[tab,setTab]=useState('combat');
 return <section className="ed-origin-resistances"><nav className="ed-origin-subtabs" aria-label={en?'Resistance types':'Ellenállás típusok'}><button type="button" aria-pressed={tab==='combat'} onClick={()=>setTab('combat')}>{en?'Combat · SFE':'Harci · SFE'}</button>{environment&&<button type="button" aria-pressed={tab==='environment'} onClick={()=>setTab('environment')}>{en?'Environmental · %':'Környezeti · %'}</button>}</nav>{tab==='combat'?<><h3>{en?'Damage resistance':'Sebzéstípusok elleni ellenállás'}</h3><ResistanceFields locale={locale} value={value} onChange={onChange}/></>:environment}</section>;
}
