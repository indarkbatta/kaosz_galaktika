import '../../src/styles.css';
import '../../src/combat.css';
import {createRoot} from 'react-dom/client';
import CrewProgressionEditor from '../../src/CrewProgressionEditor';
import CrewRosterPanel from '../../src/CrewRosterPanel';
const play=new URLSearchParams(location.search).has('play'),locale=new URLSearchParams(location.search).get('lang')||'hu';
createRoot(document.getElementById('root')!).render(<div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene">{play?<div className="ch-v2-mount"><section className="cb-panel"><nav className="cb-local-tabs"><button>Harc</button><button>Legénység</button></nav><CrewRosterPanel locale={locale}/></section></div>:<CrewProgressionEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/>}</main><footer className="footer">HATÁRVILÁG</footer></div>);
