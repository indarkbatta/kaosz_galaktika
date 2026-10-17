export type Attribute='body'|'mind'|'soul'|'morale'|'social';
export const attributes:Attribute[]=['body','mind','soul','morale','social'];
export function toDice(pips:number){const d=Math.floor(pips/3),r=pips%3;return String(d)+'D'+(r?'+'+r:'');}
export type Bonuses={primary_attribute:Attribute;secondary_attribute:Attribute};
export function calculateAttributes(base:number,free:Record<string,number>,species:Bonuses,klass:Bonuses){
 const result:Record<string,number>={};
 for(const a of attributes){
  result[a]=base+(free[a]||0)+(species.primary_attribute===a?3:0)+(species.secondary_attribute===a?1:0)
   +(klass.primary_attribute===a?3:0)+(klass.secondary_attribute===a?1:0);
 }
 return result;
}
export function remainingPoints(total:number,spent:Record<string,number>){
 return total-Object.values(spent).reduce((s,n)=>s+n,0);
}
