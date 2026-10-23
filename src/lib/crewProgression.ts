export type CrewStats={health:number;attack:number;defense:number;damage:number};
export type CrewClass={id:string;slug:string;name_hu:string;name_en:string;description_hu:string;description_en:string;bases:CrewStats;growth:CrewStats;attack_skill_id:string|null;is_published:boolean;revision:number};
export type CrewSkillBonus={skill_id:string;base_pips:number;per_level:number;crew_class_id?:string|null;species_id?:string|null};
export type CrewSheet={id:string;name:string;portrait_path:string|null;species_slug:string;crew_class_id:string;class_name_hu:string;class_name_en:string;level:number;xp:number;next_level_xp:number|null;base:CrewStats;stats:CrewStats;skills:Record<string,number>;resistances:Record<string,number>;equipment:{slot:string;item_id:string;slug:string}[]};
export type CrewSkill={id:string;slug?:string;texts:{locale:string;name:string}[]};
export type CrewRoster={crew:CrewSheet[];party:string[];skills:CrewSkill[]};
export const crewStatKeys=['health','attack','defense','damage'] as const;
export const crewStatLabel=(k:string,en:boolean)=>({health:en?'HP':'HP',attack:en?'Attack':'Támadás',defense:en?'Defense target':'Védelmi célszám',damage:en?'Damage bonus':'Sebzésbónusz'}[k]||k);
export function crewBasePreview(c:Pick<CrewClass,'bases'|'growth'>,level:number):CrewStats{return Object.fromEntries(crewStatKeys.map(k=>[k,c.bases[k]+Math.floor((Math.max(1,Math.min(50,level))-1)*c.growth[k])])) as CrewStats;}
export const crewSkillName=(s:CrewSkill,locale:string)=>s.texts?.find(t=>t.locale===locale)?.name||s.texts?.[0]?.name||s.slug||s.id;
