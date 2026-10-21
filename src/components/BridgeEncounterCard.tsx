import type {ReactNode} from 'react';
import {WorldArtwork} from './WorldImageField';
import '../bridge-encounter.css';
export function BridgeEncounterCard({kind,title,description,imagePath,meta,action,disabled,onAction}:{
 kind:string;title:string;description?:string;imagePath?:string|null;meta:ReactNode;action:string;disabled?:boolean;onAction:()=>void;
}){
 return <article className="bridge-card" data-encounter={kind}>
  <WorldArtwork path={imagePath} alt={title} fallback="✦" className="bridge-card-image"/>
  <div className="bridge-card-content"><small>{kind}</small><h3>{title}</h3><p title={description}>{description}</p>
   <div className="bridge-card-meta">{meta}</div><button type="button" disabled={disabled} onClick={onAction}>{action} →</button></div>
 </article>;
}
