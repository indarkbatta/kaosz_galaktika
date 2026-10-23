import '../../src/styles.css';
import {createRoot} from 'react-dom/client';
import PlayerTalents from '../../src/PlayerTalents';
import CharacterPage from '../../src/CharacterPage';
const play=new URLSearchParams(location.search).has('play');
createRoot(document.getElementById('root')!).render(<div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene"><section className={play?'in-game':'ch-v2-mount'}>{play?<div style={{height:'min(800px,calc(100dvh - 210px))',minHeight:0}}><PlayerTalents locale="hu"/></div>:<CharacterPage locale={new URLSearchParams(location.search).get('lang')||'hu'}/>}</section></main><footer className="footer">HATÁRVILÁG</footer></div>);
