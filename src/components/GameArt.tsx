import type {CSSProperties} from 'react';
import './game-art.css';
// Artwork generated for Határvilág, served exclusively from Cloudflare R2.
// 480x500 AVIF atlas: skill scenes [0..319], attributes [320..399], ships [400..499].
const skills=['athletics','endurance','reflexes','stealth','physical_arms','analysis','engineering','navigation','research','psionic_arms','intuition','willpower','attunement','meditation','terror_arms','command','discipline','rally','tactics','fear_arms','diplomacy','deception','trade','networking','sonic_arms'];
const attributes=['body','mind','soul','morale','social'];
const ships=['vagabond','sparrow','bastion'];
const root='https://assets.voidnoir.net/';
export const ATLAS_KEY='hatarvilag/art/game-atlas-v3.avif';
const ATLAS_URL=root+ATLAS_KEY;
function tile(x:number,y:number,w:number,h:number):CSSProperties{
 const imageWidth=480,imageHeight=500;
 return {backgroundImage:'url("'+ATLAS_URL+'")',backgroundSize:(imageWidth/w*100)+'% '+(imageHeight/h*100)+'%',
 backgroundPosition:(x/(imageWidth-w)*100)+'% '+(y/(imageHeight-h)*100)+'%'};
}
export function SkillArt({slug,className='',path}:{slug:string;className?:string;path?:string|null}){
 const i=skills.indexOf(slug);
 if(i<0)return <span className={'ga-skill ga-fallback '+className} aria-hidden="true">◈</span>;
 const standard=path===ATLAS_KEY||path==='hatarvilag/skills/story-atlas.webp'||path==='hatarvilag/skills/'+slug+'.jpg'||!path;
 const style=standard?tile((i%5)*64,Math.floor(i/5)*64,64,64):{backgroundImage:'url("'+root+path+'")',backgroundSize:'cover'} as CSSProperties;
 return <span className={'ga-skill '+className} aria-hidden="true" style={style}/>;
}
export function AttributeArt({attribute,className=''}:{attribute:string;className?:string}){
 const i=attributes.indexOf(attribute);
 return <span className={'ga-attribute '+className} aria-hidden="true" style={i<0?undefined:tile(i*80,320,80,80)}/>;
}
export function ShipArt({slug,className=''}:{slug:string;className?:string}){
 const i=ships.indexOf(slug),safe=i<0?0:i;
 return <span className={'ga-ship '+className} aria-hidden="true" style={tile(safe*160,400,160,100)}/>;
}
