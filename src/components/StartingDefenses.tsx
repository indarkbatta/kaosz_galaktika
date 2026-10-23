import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {combatAttributes,combatLabel,combatError} from '../lib/combat';
type Preview={passive_defenses:Record<string,number>;hp:{max_health:number}};
export function StartingDefenses({locale,speciesId,classId,choices,onReady}:{locale:string;speciesId:string;classId:string;choices:{species:string;class:string};onReady:(ready:boolean)=>void}){
 const en=locale==='en';
 const [data,setData]=useState<Preview|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');onReady(false);
 void Promise.resolve(supabase.rpc('preview_character_defenses',{p_species:speciesId,p_class:classId,p_species_node:choices.species||null,p_class_node:choices.class||null})).then(({data,error})=>{if(!active)return;if(error){setError(combatError(error.message,locale));return;}setData(data as Preview);onReady(true);}).catch(()=>{if(active)setError(en?'Could not calculate defenses.':'Nem sikerült kiszámítani a védelmeket.');});
 return()=>{active=false;};},[speciesId,classId,choices.species,choices.class,locale,onReady]);
 return <section className="ch-starting-defenses" aria-label={en?'Starting passive defenses':'Kezdő passzív védelmek'}><h3>{en?'Passive defense · Target numbers':'Passzív védelem · Célszámok'}</h3><p>{en?'Species + class + chosen passive talents. Active defense is a separate combat action.':'Faj + kaszt + kiválasztott passzív talentek. Az aktív védelem külön harci akció.'}</p>{error?<p role="alert">{error}</p>:data?<><div>{combatAttributes.map(a=><div key={a}><span>{combatLabel(a,locale)}</span><b>{data.passive_defenses[a]}</b></div>)}</div><p>{en?'Starting health':'Kezdő életerő'}: <strong>{data.hp.max_health} HP</strong></p></>:<p role="status">{en?'Calculating defenses…':'Védelmek számítása…'}</p>}</section>;
}
