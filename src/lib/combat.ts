export const combatAttributes=['body','mind','soul','morale','social'] as const;
export const damageTypes=['kinetic','heat','cold','electric','radiation','sonic','psionic','soul','vacuum','void','acid','biological','poison'] as const;
export const combatLabels:Record<string,[string,string]>={body:['Test','Body'],mind:['Elme','Mind'],soul:['Lélek','Soul'],morale:['Morál','Morale'],social:['Szociális','Social'],kinetic:['Kinetikus','Kinetic'],heat:['Hő','Heat'],cold:['Hideg','Cold'],electric:['Elektromos','Electric'],radiation:['Sugárzás','Radiation'],sonic:['Hang','Sonic'],psionic:['Pszionikus','Psionic'],vacuum:['Vákuum','Vacuum'],void:['Üresség','Void'],acid:['Sav','Acid'],biological:['Biológiai','Biological'],poison:['Méreg','Poison'],weapon:['Fegyver típusa','Weapon type']};
export function combatLabel(key:string,locale:string){return combatLabels[key]?.[locale==='en'?1:0]||key;}
export type CombatText={locale:string;name:string;description:string};
export type Formula={dice?:number;pips?:number;weapon?:number;attribute?:string;attribute_scale?:number};
export type Effect={type:string;target?:string;formula?:Formula;damage_types?:string[];stat?:string;key?:string;amount?:number;duration?:number;group?:string;remaining?:number};
export type Power={id:string;slug:string;image_path:string|null;kind:string;target:string;range_kind:string;target_count:number;cooldown:number;max_uses:number|null;limit_scope:string;min_level:number;requires_weapon:boolean;requires_hit:boolean;skill_id:string|null;defense:string;effects:Effect[];is_published:boolean;revision:number;texts:CombatText[];grants:Grant[];blocked_reason?:string|null;cooldown_remaining?:number;uses_remaining?:number|null};
export type Grant={source:string;species_id?:string|null;class_id?:string|null;item_id?:string|null;faction_id?:string|null;min_level:number;min_rank:number};
export type Named={id:string;slug?:string;image_path?:string|null;texts?:CombatText[]};
export type CombatActor={id:string;name_hu:string;name_en:string;player:boolean;image_path:string|null;level:number;attributes:Record<string,number>;defenses:Record<string,number>;effective_defenses?:Record<string,number>;health:number;max_health:number;injuries:Record<string,number>;effects:Effect[];powers:Power[];turn:number;cooldowns:Record<string,number>;uses:Record<string,number>};
export type CombatRoll={dice:number[];chains:number[][];pip_bonus:number;roll_total:number;mode:string;pool_pips:number;flat_bonus?:number;damage?:number;base_pips?:number;sfe_pips?:number;damage_types?:string[]};
export type CombatEvent={type:string;sequence:number;round:number;source:number;target?:number;power_id?:string;roll?:CombatRoll;hit?:boolean;health?:number;texts?:CombatText[];injuries?:Record<string,number>};
export type CombatRun={id:string;revision:number;status:string;simulation:boolean;state:{actors:CombatActor[];round:number;current:number;order:number[];events:CombatEvent[]};available_powers:Power[];reward_snapshot:{xp?:number};rewarded:boolean};
export type Talent=Named&{species_id:string|null;class_id:string|null;min_rank:number;max_rank:number;prerequisite_id:string|null;prerequisite_rank:number;effects:Effect[];is_published:boolean;revision:number;owned_rank?:number};
export type Enemy=Named&{level:number;danger:number;attributes:Record<string,number>;defenses:Record<string,number>;effective_defenses?:Record<string,number>;health:number;weapon_pips:number;resistances:Record<string,number>;power_ids:string[];behavior:string;reward_xp:number;reward_item_id:string|null;reward_quantity:number;is_published:boolean;revision:number};
export type Encounter={id:string;slug:string;location_id:string;enemy_id:string;name_hu:string;name_en:string;energy_cost:number;is_published:boolean;revision:number;image_path?:string;enemy_level?:number};
export type Profile={id:string;species_id:string|null;class_id:string|null;defenses:Record<string,string>;hp_per_rank:number;resistances:Record<string,number>;revision:number};
export type ItemCombat={item_id:string;tier:number;weapon_pips:number;damage_types:string[];resistances:Record<string,number>;effects:Effect[];revision?:number};
export type CombatRules={id:number;revision:number;defense_curves:Record<string,{base:number;per_rank:number}>;recovery_energy:number;injury_recovery_ticks:number;max_rounds:number};
export type CombatCatalog={powers:Power[];talents:Talent[];enemies:Enemy[];encounters:Encounter[];profiles:Profile[];items:ItemCombat[];rules:CombatRules;species:Named[];classes:Named[];skills:(Named&{attribute:string})[];equipment:Named[];locations:Named[];locales:{code:string;native_name:string}[]};
export const combatName=(row:Named|undefined,locale:string)=>row?.texts?.find(t=>t.locale===locale)?.name||row?.texts?.find(t=>t.locale==='hu')?.name||row?.slug||row?.id||'—';
export const blankTexts=():CombatText[]=>[{locale:'hu',name:'',description:''},{locale:'en',name:'',description:''}];
export const blankItemCombat=(item_id:string):ItemCombat=>({item_id,tier:1,weapon_pips:0,damage_types:['kinetic'],resistances:{},effects:[]});
export function combatError(message:string,locale:string){
 if(locale==='en')return message;
 const messages:Record<string,string>={
 'Login required':'Bejelentkezés szükséges.','Create a captain first':'Előbb hozz létre kapitányt.','Editor permission required':'Szerkesztői jogosultság szükséges.',
 'Combat state changed; reload':'A harci állapot közben megváltozott. Töltsd újra.','Combat not found':'A harc nem található.','Combat has ended':'A harc már lezárult.','Not your turn':'Most nem a te köröd következik.',
 'Wrong target':'Ez a power nem használható erre a célpontra.','Invalid combat action':'Érvénytelen harci művelet.','Insufficient energy':'Nincs elegendő energia.',
 'Combat encounter unavailable':'Ez az összecsapás nem elérhető.','Enemy unavailable':'Az ellenfél nem elérhető.','Travel to the encounter location first':'Előbb utazz az összecsapás helyszínére.',
 'Recover severe injuries first':'Előbb fel kell épülnöd a súlyos sérülésből.','Finish combat first':'Előbb fejezd be a harcot.','Return to Frontier Station first':'Előbb térj vissza a Határvidéki Állomásra.',
 'Severe injuries are still recovering':'A sérülés felépülési ideje még nem telt le.','No talent points available':'Nincs elkölthető talentpont.','Talent unavailable':'A talent nem elérhető.',
 'Talent rank changed or maximum reached':'A talent rangja közben megváltozott, vagy elérted a maximumot.','Talent prerequisites unmet':'A talent előfeltételei nem teljesülnek.',
 'Content changed; reload':'A tartalom közben megváltozott. Töltsd újra mentés előtt.','Hungarian and English names required':'A magyar és az angol név kötelező.',
 'Choose an existing combat skill':'Válassz egy meglévő harci képzettséget.','Passives must target self without an attack':'A passzív power önmagára hat, támadódobás nélkül.',
 'Defense profile requires 1 primary, 2 secondary, 2 tertiary':'Pontosan 1 elsődleges, 2 másodlagos és 2 harmadlagos Defense szükséges.',
 'Talent prerequisite must be in the same tree':'Az előfeltételnek ugyanahhoz a talentfához kell tartoznia.','Talent prerequisite cycle':'A talentek előfeltételei nem alkothatnak kört.',
 'Invalid effects':'Érvénytelen hatáslista.','Invalid modifier':'Érvénytelen módosító.','Invalid formula field':'Érvénytelen sebzésképlet-mező.','Invalid damage types':'Érvénytelen sebzéstípus.',
 'Effect duration must be 1..100':'A hatás időtartama 1–100 kör lehet.','Enemy needs 1..12 valid active powers':'Az ellenfélnek 1–12 érvényes aktív power szükséges.',
 'Finish combat before changing location or equipment':'Utazás vagy felszereléscsere előtt fejezd be a harcot.'};
 if(message.startsWith('Power unavailable: '))return 'A power nem használható: '+({cooldown:'cooldown',limit:'használati limit',weapon:'felszerelt fegyver szükséges',level:'magasabb szint szükséges',unavailable:'nem elérhető'}[message.slice(19)]||message.slice(19));
 return messages[message]||message;
}
