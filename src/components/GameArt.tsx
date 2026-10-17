import type {CSSProperties} from 'react';
import './game-art.css';
const skillOrder=[
'athletics','endurance','reflexes','stealth','physical_arms',
'analysis','engineering','navigation','research','psionic_arms',
'intuition','willpower','attunement','meditation','terror_arms',
'command','discipline','rally','tactics','fear_arms',
'diplomacy','deception','trade','networking','sonic_arms'] as const;
const attributes=['body','mind','soul','morale','social'] as const;
const root='https://assets.voidnoir.net/hatarvilag';
const atlas=root+'/skills/story-atlas.webp';
export const ATLAS_KEY='hatarvilag/skills/story-atlas.webp';
function atlasStyle(index:number,cols:number,rows:number,url:string):CSSProperties{
 return {backgroundImage:'url("'+url+'")',backgroundSize:(cols*100)+'% '+(rows*100)+'%',backgroundPosition:(cols===1?0:index%cols/(cols-1)*100)+'% '+(rows===1?0:Math.floor(index/cols)/(rows-1)*100)+'%'};
}
export function SkillArt({slug,className='',path}: {slug:string;className?:string;path?:string|null}){
 const index=skillOrder.indexOf(slug as typeof skillOrder[number]);
 if(index<0)return <span className={'ga-skill ga-fallback '+className} aria-hidden="true">◈</span>;
 const custom=path&&path!==ATLAS_KEY&&path!==('hatarvilag/skills/'+slug+'.jpg');
 return <span className={'ga-skill '+className} aria-hidden="true" style={custom?{backgroundImage:'url("https://assets.voidnoir.net/'+path+'")',backgroundSize:'cover'}:atlasStyle(index,5,7,atlas)}/>;
}
export function AttributeArt({attribute,className=''}:{attribute:string;className?:string}){
 const index=attributes.indexOf(attribute as typeof attributes[number]);
 return <span className={'ga-attribute '+className} aria-hidden="true" style={index<0?undefined:atlasStyle(index+25,5,7,atlas)}/>;
}
export function ShipArt({slug,className=''}:{slug:string;className?:string}){
 const name=['vagabond','sparrow','bastion'].includes(slug)?slug:'vagabond';
 return <span className={'ga-ship '+className} aria-hidden="true" style={atlasStyle(30+['vagabond','sparrow','bastion'].indexOf(name),5,7,atlas)}/>;
}
