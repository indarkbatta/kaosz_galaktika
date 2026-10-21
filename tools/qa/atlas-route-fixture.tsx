import {createRoot} from 'react-dom/client';
import GalaxyEditor from '../../src/GalaxyEditor';
import SectorEditor from '../../src/SectorEditor';
import '../../src/styles.css';
import '../../src/editor.css';
const galaxy=new URLSearchParams(location.search).get('editor')==='galaxy';
createRoot(document.getElementById('root')!).render(galaxy
 ?<GalaxyEditor locale="hu" onBack={()=>{}} onSectionSelect={()=>{}}/>
 :<SectorEditor locale="hu" onBack={()=>{}} onSectionSelect={()=>{}}/>);
