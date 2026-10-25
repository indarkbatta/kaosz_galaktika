import '../../src/styles.css';
import '../../src/combat.css';
import '../../src/editor.css';
import '../../src/captain-dashboard.css';
import {Plus,Save} from 'lucide-react';
import {EditorFrame,EditorRoster,EditorHeader,EditorFooter,EditorTabs} from '../../src/components/EditorTemplate';
import {EditorNavigation} from '../../src/components/EditorNavigation';
import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import ExpeditionCompanionEditor from '../../src/ExpeditionCompanionEditor';
import ExpeditionRecruitment from '../../src/ExpeditionRecruitment';
import {supabase} from '../../src/lib/supabase';
import GamePanelFrame from '../../src/components/GamePanelFrame';
const params=new URLSearchParams(location.search),locale=params.get('lang')||'hu';
function Play(){const [skills,setSkills]=useState([]);useEffect(()=>{void supabase.rpc('get_expedition_template_catalog').then(r=>setSkills(r.data.skills.map((s:{id:string;attribute:string;texts:unknown[]})=>({...s,game_skills_i18n:s.texts}))));},[]);return <div className="ch-v2-mount"><GamePanelFrame compact><section className="cmd-shell"><main className="cmd-body"><ExpeditionRecruitment locale={locale} atStation energy={16} skills={skills} onChanged={async()=>{}}/></main></section></GamePanelFrame></div>;}
function Reference(){return <EditorFrame><EditorNavigation locale={locale} active="expedition-companions" onBack={()=>{}} onSelect={()=>{}}/><EditorRoster><header className="ed-roster-top"><strong>Expedíciós társak</strong><button><Plus size={16}/>Új</button></header><input className="ed-roster-search"/><div className="ed-roster-list"><button className="ed-record selected"><span className="ed-thumbnail"/><span className="ed-record-name">Vaskéz</span></button></div><div className="ed-pager"><button>‹</button></div><button className="ed-roster-action">Másolat</button></EditorRoster><section className="ed-editor"><EditorHeader><strong>Vaskéz</strong></EditorHeader><EditorTabs label="Reference tabs" selected="general" onSelect={()=>{}} items={['general','attributes','skills','talents','dictionary','preview'].map(id=>({id,name:id}))}/><form className="ed-form"><fieldset className="ed-form-fields ed-tab-pane"><label>Azonosító<input data-reference="field"/></label><label className="ed-checkbox"><input type="checkbox"/>Publikált</label></fieldset></form><EditorFooter><span>Mentve</span><button className="ed-secondary-button">Újratöltés</button><button className="ed-submit" disabled><Save size={16}/>MENTÉS</button></EditorFooter></section></EditorFrame>;}
createRoot(document.getElementById('root')!).render(<div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene">{params.has('reference')?<Reference/>:params.has('play')?<Play/>:<ExpeditionCompanionEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/>}</main><footer className="footer">HATÁRVILÁG</footer></div>);
