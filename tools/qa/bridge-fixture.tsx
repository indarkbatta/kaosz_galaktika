import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import GameplayEditor from '../../src/GameplayEditor';
import SkillChallengeEditor from '../../src/SkillChallengeEditor';
import CaptainDashboard from '../../src/CaptainDashboard';
import '../../src/styles.css';
import '../../src/editor.css';
const skills=[{id:'skill',slug:'analysis',attribute:'mind',icon_path:null,game_skills_i18n:[{locale:'hu',name:'Elemzés'},{locale:'en',name:'Analysis'}]}];
function Fixture(){
 const [page,setPage]=useState('activity'),[locale,setLocale]=useState('hu');
 return <><nav><button onClick={()=>setPage('activity')}>Activity Editor</button><button onClick={()=>setPage('challenge')}>Challenge Editor</button><button onClick={()=>setPage('bridge')}>Bridge</button><button onClick={()=>setLocale(locale==='hu'?'en':'hu')}>Language</button></nav>
 {page==='activity'?<GameplayEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/>:page==='challenge'?<SkillChallengeEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/>:
 <CaptainDashboard locale={locale} captain={{id:'captain',captain_name:'QA',species_id:'',class_id:'',starter_ship_id:'',attribute_pips:{mind:11},skill_bonus_pips:{}}} species={[]} classes={[]} ships={[]} skills={skills} crew={[]} isEditor={false} onReset={()=>{}}/>}</>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
