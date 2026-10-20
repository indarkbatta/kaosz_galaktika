export type ItemLocaleText = {locale:string;name:string;description?:string|null};
export type ItemCatalogEntry = {
 id:string;slug:string;category:string;rarity:string;image_path:string|null;
 equip_owner?:string|null;equip_slot?:string|null;capacity_bonus?:number|null;
 game_items_i18n:ItemLocaleText[];
};
export const itemName=(item:ItemCatalogEntry|undefined,locale:string)=>
 item?.game_items_i18n.find(x=>x.locale===locale)?.name||
 item?.game_items_i18n.find(x=>x.locale==='hu')?.name||item?.slug||'—';
export const itemDescription=(item:ItemCatalogEntry|undefined,locale:string)=>
 item?.game_items_i18n.find(x=>x.locale===locale)?.description||
 item?.game_items_i18n.find(x=>x.locale==='hu')?.description||'';
export const itemAssetUrl=(path:string|null|undefined)=>
 path&&/^hatarvilag\/items\/[a-z0-9_/-]+\.(webp|avif|png)$/.test(path)?'https://assets.voidnoir.net/'+path:undefined;
const lookup=(key:string,locale:string,translations:Record<string,[string,string]>)=>
 (translations[key]||[key,key])[locale==='en'?1:0];
export const itemCategory=(key:string,locale:string)=>lookup(key,locale,{
 material:['Alapanyag','Material'],equipment:['Felszerelés','Equipment'],
 consumable:['Fogyóeszköz','Consumable'],data:['Adat','Data'],trade:['Kereskedelmi áru','Trade good']
});
export const itemRarity=(key:string,locale:string)=>lookup(key,locale,{
 common:['Gyakori','Common'],uncommon:['Nem gyakori','Uncommon'],rare:['Ritka','Rare'],
 epic:['Epikus','Epic'],legendary:['Legendás','Legendary']
});
export const itemSlot=(key:string,locale:string)=>lookup(key,locale,{
 main_weapon:['Főfegyver','Main weapon'],sidearm:['Oldalfegyver','Sidearm'],
 body_armor:['Testpáncél','Body armor'],utility1:['Utility 1','Utility 1'],utility2:['Utility 2','Utility 2'],
 belt:['Öv','Belt'],backpack:['Hátizsák','Backpack'],relic:['Relikvia','Relic'],
 armor:['Páncélzat','Armor'],weapon:['Fegyverzet','Weapon'],utility:['Utility','Utility']
});
export function itemStatRows(item:ItemCatalogEntry,locale:string){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 const rows=[{label:tr('Kategória','Category'),value:itemCategory(item.category,locale)},
  {label:tr('Ritkaság','Rarity'),value:itemRarity(item.rarity,locale)}];
 if(item.equip_owner){
  rows.push({label:tr('Használhatja','Equipped by'),
   value:item.equip_owner==='crew'?tr('Legénység','Crew'):tr('Kapitány','Captain')});
 }
 if(item.equip_slot)rows.push({label:tr('Felszerelési hely','Equipment slot'),value:itemSlot(item.equip_slot,locale)});
 if((item.capacity_bonus||0)>0)rows.push({label:tr('Hátizsákbónusz','Backpack bonus'),value:'+'+item.capacity_bonus});
 return rows;
}
