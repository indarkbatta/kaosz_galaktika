import type {CSSProperties} from 'react';
import './game-art.css';

/** Standalone painted assets. Release inventory: docs/art-reborn-manifest.json. */
const root='https://assets.voidnoir.net/';
export const ART_VERSION='reborn';
const imageStyle=(key:string,size:'cover'|'contain'='contain'):CSSProperties=>({
 backgroundImage:'url("'+root+key+'")',backgroundSize:size,
 backgroundPosition:'center center',backgroundRepeat:'no-repeat'
});
export function SkillArt({slug,className='',path}:{slug:string;className?:string;path?:string|null}){
 const key=path||'hatarvilag/skills/reborn-'+slug+'.webp';
 return <span className={'ga-skill '+className} aria-hidden="true" style={imageStyle(key)}/>;
}
export function AttributeArt({attribute,className=''}:{attribute:string;className?:string}){
 const attr=['body','mind','soul','morale','social'].includes(attribute)?attribute:'body';
 const key=attr==='body'?'hatarvilag/attributes/torchlight-v1/body.webp':'hatarvilag/attributes/reborn/'+attr+'.webp';
 return <span className={'ga-attribute '+className} aria-hidden="true" style={imageStyle(key)}/>;
}
export function ShipArt({slug,className=''}:{slug:string;className?:string}){
 const ship=['vagabond','sparrow','bastion'].includes(slug)?slug:'vagabond';
 return <span className={'ga-ship '+className} aria-hidden="true" style={imageStyle('hatarvilag/ships/reborn/'+ship+'.webp')}/>;
}
