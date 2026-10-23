import '../combat.css';
import {combatAttributes,combatLabel} from '../lib/combat';
import {NumberField} from './CombatFields';
export type BranchCombat={hp_per_rank:number;passive_defenses:Record<string,string>;combat_resistances:Record<string,number>};
export const defaultBranchCombat=():BranchCombat=>({hp_per_rank:5,passive_defenses:{body:'primary',mind:'secondary',soul:'secondary',morale:'tertiary',social:'tertiary'},combat_resistances:{}});
export function BranchCombatFields({locale,value,onChange}:{locale:string;value:BranchCombat;onChange:(p:Partial<BranchCombat>)=>void}){
 const en=locale==='en',tr=(hu:string,eng:string)=>en?eng:hu;
 return <section className="ed-branch-combat" aria-label={tr('Harci fejlődés','Combat progression')}><h3>{tr('HP és passzív védelmi célszámok','HP and passive defense targets')}</h3>
 <NumberField min={1} max={100} label={tr('Kezdő HP és HP / további pont','Starting HP and HP / later point')} value={value.hp_per_rank} onChange={hp_per_rank=>onChange({hp_per_rank})}/>
 <p>{tr('1. szinten a faj és kaszt értékei összeadódnak. Utána az elköltött pont a választott ág HP-ját és védelmi növekményét adja.','At level 1, species and class values add together. Later points grant the HP and defense growth of the chosen branch.')}</p>
 <p>{tr('Áganként 1 elsődleges, 2 másodlagos és 2 harmadlagos védelem. A kezdőértékek és növekmények a Harci szabályok alatt állíthatók.','Each branch has 1 primary, 2 secondary and 2 tertiary defenses. Starting values and growth are configured under Combat rules.')}</p>
 <div className="cb-stat-grid">{combatAttributes.map(a=><label key={a}>{combatLabel(a,locale)} · {tr('passzív védelem','passive defense')}<select value={value.passive_defenses[a]} onChange={e=>onChange({passive_defenses:{...value.passive_defenses,[a]:e.target.value}})}>{(['primary','secondary','tertiary'] as const).map((rank,i)=><option key={rank} value={rank}>{[tr('Elsődleges','Primary'),tr('Másodlagos','Secondary'),tr('Harmadlagos','Tertiary')][i]}</option>)}</select></label>)}</div>

 </section>;
}
