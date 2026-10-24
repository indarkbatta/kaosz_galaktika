import '../../src/styles.css';
import '../../src/combat.css';
import '../../src/captain-dashboard.css';
import {createRoot} from 'react-dom/client';
import ExpeditionLoadout from '../../src/ExpeditionLoadout';
import GamePanelFrame from '../../src/components/GamePanelFrame';
const locale=new URLSearchParams(location.search).get('lang')||'hu';
createRoot(document.getElementById('root')!).render(<div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene"><div className="ch-v2-mount"><GamePanelFrame compact><section className="cmd-shell"><main className="cmd-body"><ExpeditionLoadout characterId={(window as unknown as {captain:string}).captain} captainName="QA" locale={locale} onChanged={async()=>{}}/></main></section></GamePanelFrame></div></main><footer className="footer">HATÁRVILÁG</footer></div>);
