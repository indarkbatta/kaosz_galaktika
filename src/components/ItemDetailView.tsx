import {createPortal} from 'react-dom';
import {itemAssetUrl,itemDescription,itemName,itemStatRows,type ItemCatalogEntry} from '../lib/itemPresentation';
import './item-details.css';

export function ItemStatGrid({item,locale}:{item:ItemCatalogEntry;locale:string}){
 return <dl className="hv-item-stats">{itemStatRows(item,locale).map(stat=>
  <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>;
}

export function ItemHoverTooltip({item,locale,quantity,equipped,x,y}:{
 item:ItemCatalogEntry;locale:string;quantity?:number;equipped?:boolean;x:number;y:number
}){
 const en=locale==='en',image=itemAssetUrl(item.image_path);
 const description=itemDescription(item,locale);
 return createPortal(<aside className="hv-item-tooltip" style={{left:x,top:y}} role="tooltip">
  <header className="hv-tooltip-header">
   <span className="hv-tooltip-icon">{image&&<img src={image} alt="" draggable={false}/>}</span>
   <span className="hv-tooltip-heading"><strong>{itemName(item,locale)}</strong>
    <small className={'hv-rarity '+item.rarity}>{item.rarity==='common'?(en?'Common':'Gyakori'):itemStatRows(item,locale)[1].value}</small></span>
  </header>
  {description&&<p className="hv-tooltip-description">{description}</p>}
  <ItemStatGrid item={item} locale={locale}/>
  <footer>{equipped?(en?'Currently equipped':'Jelenleg felszerelve'):
    (en?'In cargo':'Raktérben')+': '+(quantity??0)}</footer>
 </aside>,document.body);
}
