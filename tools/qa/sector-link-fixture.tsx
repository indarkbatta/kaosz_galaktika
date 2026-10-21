import {createRoot} from 'react-dom/client';
import SectorEditor from '../../src/SectorEditor';
import '../../src/styles.css';
import '../../src/editor.css';
createRoot(document.getElementById('root')!).render(<SectorEditor locale="hu" onBack={()=>{}} onSectionSelect={()=>{}}/>);
