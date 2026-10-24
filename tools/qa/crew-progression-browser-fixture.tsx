import '../../src/styles.css';
import '../../src/combat.css';
import {createRoot} from 'react-dom/client';
import CrewProgressionEditor from '../../src/CrewProgressionEditor';
const locale=new URLSearchParams(location.search).get('lang')||'hu';
createRoot(document.getElementById('root')!).render(<div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene"><CrewProgressionEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/></main><footer className="footer">HATÁRVILÁG</footer></div>);
