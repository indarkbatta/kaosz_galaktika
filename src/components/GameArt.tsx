import type {CSSProperties} from 'react';
import './game-art.css';

/**
 * Határvilág original painted game art, version HD-v4.
 * Every image lives separately in the Cloudflare R2 voidnoir bucket.
 *
 * Skill: ~245x245px; attributes: ~400x460px; ships: 1448x1086px.
 * Never upscale an atlas thumbnail when the original R2 asset is available.
 */
const root='https://assets.voidnoir.net/';
export const ART_VERSION='hd-v4';
const legacyAtlas='hatarvilag/art/game-atlas-v3.avif';
const legacySkillAtlas='hatarvilag/skills/story-atlas.webp';

const imageStyle=(key:string,size:'cover'|'contain'='contain'):CSSProperties=>({
 backgroundImage:'url("'+root+key+'")',
 backgroundSize:size,
 backgroundPosition:'center center',
 backgroundRepeat:'no-repeat'
});

export function SkillArt({slug,className='',path}: {slug:string;className?:string;path?:string|null}){
 const oldDefault=!path||path===legacyAtlas||path===legacySkillAtlas||path==='hatarvilag/skills/'+slug+'.jpg';
 const key=oldDefault?'hatarvilag/skills/'+slug+'-hd-v4.avif':path;
 return <span className={'ga-skill '+className} aria-hidden="true" style={imageStyle(key,'contain')}/>;
}

export function AttributeArt({attribute,className=''}:{attribute:string;className?:string}){
 const attr=['body','mind','soul','morale','social'].includes(attribute)?attribute:'body';
 return <span className={'ga-attribute '+className} aria-hidden="true" style={imageStyle('hatarvilag/attributes/torchlight-v1/'+attr+'.webp','contain')}/>;
}

export function ShipArt({slug,className=''}:{slug:string;className?:string}){
 const ship=['vagabond','sparrow','bastion'].includes(slug)?slug:'vagabond';
 return <span className={'ga-ship '+className} aria-hidden="true" style={imageStyle('hatarvilag/ships/torchlight-v1/'+ship+'.webp','cover')}/>;
}
