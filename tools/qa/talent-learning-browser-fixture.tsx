import {createRoot} from 'react-dom/client';
import PlayerTalents from '../../src/PlayerTalents';
import CharacterPage from '../../src/CharacterPage';
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('play')?<PlayerTalents locale='hu'/>:<CharacterPage locale={new URLSearchParams(location.search).get('lang')||'hu'}/>);
