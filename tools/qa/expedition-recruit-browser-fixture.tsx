import '../../src/styles.css';
import '../../src/combat.css';
import '../../src/editor.css';
import '../../src/captain-dashboard.css';
import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import ExpeditionCompanionEditor from '../../src/ExpeditionCompanionEditor';
import ExpeditionRecruitment from '../../src/ExpeditionRecruitment';
import {supabase} from '../../src/lib/supabase';
import GamePanelFrame from '../../src/components/GamePanelFrame';
const params=new URLSearchParams(location.search),locale=params.get('lang')||'hu';
function Play(){const [skills,setSkills]=useState([]);useEffect(()=>{void supabase.rpc('get_expedition_template_catalog').then(r=>setSkills(r.data.skills.map((s:{id:string;attribute:string;texts:unknown[]})=>({...s,game_skills_i18n:s.texts}))));},[]);return <div className="ch-v2-mount"><GamePanelFrame compact><section className="cmd-shell"><main className="cmd-body"><ExpeditionRecruitment locale={locale} atStation energy={16} skills={skills} onChanged={async()=>{}}/></main></section></GamePanelFrame></div>;}
createRoot(document.getElementById('root')!).render(<div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene">{params.has('play')?<Play/>:<ExpeditionCompanionEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/>}</main><footer className="footer">HATÁRVILÁG</footer></div>);
