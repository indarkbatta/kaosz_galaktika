import {createRoot} from 'react-dom/client';
import SkillChallengePanel from '../../src/SkillChallengePanel';
import '../../src/styles.css';
import '../../src/editor.css';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
'33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const names=['Elemzés','Navigáció','Műszaki ismeretek','Diplomácia'];
const slugs=['analysis','navigation','engineering','diplomacy'];
const skills=ids.map((id,i)=>({id,slug:slugs[i],attribute:i===3?'social':'mind',icon_path:null,
game_skills_i18n:[{locale:'hu',name:names[i]}]}));
createRoot(document.getElementById('root')!).render(
 <SkillChallengePanel locale="hu" characterId="captain" locationId="station" energy={100}
  skills={skills} attributePips={{mind:9,social:9}} skillBonusPips={{}} upgrades={[]} onProgress={()=>{}}/>
);
