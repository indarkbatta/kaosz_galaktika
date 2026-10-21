import {useState} from 'react';
import {normalizeWorldImage,validWorldImage,worldImageUrl} from '../lib/worldImages';
import '../world-image.css';

export function WorldArtwork({path,alt='',fallback='✦',className='',fit='cover'}:{
 path?:string|null;alt?:string;fallback?:string;className?:string;fit?:'cover'|'contain';
}){
 const src=worldImageUrl(path);
 const [broken,setBroken]=useState<string|null>(null);
 return <span className={'world-art world-art--'+fit+' '+className}>
  {src&&broken!==src?<img src={src} alt={alt} loading="lazy" onError={()=>setBroken(src)}/>:<span className="world-art-fallback" aria-hidden="true">{fallback}</span>}
 </span>;
}
/** Reused by the small atlas, large editable starmap and player map. */
export function WorldMapIcon({path,alt='',fallback='✦',className=''}:{
 path?:string|null;alt?:string;fallback?:string;className?:string;
}){
 return <span className={'world-map-frame '+className}>
  <WorldArtwork path={path} alt={alt} fallback={fallback} className="world-map-crop" fit="cover"/>
 </span>;
}
export function WorldImageField({locale,value,onChange,placeholder='hatarvilag/worlds/… .webp'}:{
 locale:string;value:string|null;onChange:(path:string|null)=>void;placeholder?:string;
}){
 const en=locale==='en';
 const path=value||'';
 return <section className="world-image-editor" aria-label={en?'Artwork':'Kép'}>
   <WorldArtwork className="world-image-editor-preview" path={path} alt={en?'Artwork preview':'Képelőnézet'} fallback="✦"/>
   <div className="world-image-editor-controls">
    <label>{en?'Cloudflare R2 artwork path or assets.voidnoir.net link':'Cloudflare R2 képútvonal vagy assets.voidnoir.net hivatkozás'}
     <input aria-label={en?'Artwork path':'Kép útvonala'} type="text" maxLength={400} value={path}
       placeholder={placeholder} onChange={event=>onChange(normalizeWorldImage(event.target.value)||null)}/>
    </label>
    {!validWorldImage(path)&&<p className="world-image-error" role="alert">
     {en?'Use a hatarvilag/… image key (.webp, .avif, .png or .jpg), max 300 characters.':'hatarvilag/… képútvonal szükséges (.webp, .avif, .png vagy .jpg), legfeljebb 300 karakter.'}
    </p>}
    <button className="world-image-clear" type="button" disabled={!path} onClick={()=>onChange(null)}>{en?'Remove artwork':'Kép eltávolítása'}</button>
    <p className="world-image-help">{en?'Paste an existing R2 object key or its public URL. Image replacement takes effect on Save.':'Adj meg egy meglévő R2 objektumútvonalat vagy nyilvános képlinket. A kép a Mentés után frissül.'}</p>
   </div>
  </section>;
}
