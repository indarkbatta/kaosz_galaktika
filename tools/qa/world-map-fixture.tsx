import {createRoot} from 'react-dom/client';
import GalaxyEditor from '../../src/GalaxyEditor';
import '../../src/editor.css';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<GalaxyEditor locale="hu" onBack={()=>{}} onSectionSelect={()=>{}}/>);
