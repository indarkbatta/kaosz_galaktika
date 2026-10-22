import '../../src/styles.css';
import {createRoot} from 'react-dom/client';
import PlayerTalents from '../../src/PlayerTalents';
import CharacterPage from '../../src/CharacterPage';
const play=new URLSearchParams(location.search).has('play');
createRoot(document.getElementById('root')!).render(<div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene"><section className="in-game">{play?<div style={{height:'100%',minHeight:0}}><PlayerTalents locale="hu"/></div>:<CharacterPage locale={new URLSearchParams(location.search).get('lang')||'hu'}/>}</section></main><footer className="footer">HATÁRVILÁG</footer></div>);
