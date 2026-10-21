import {createRoot} from 'react-dom/client';
import Editor from '../../src/Editor';
import '../../src/styles.css';
import '../../src/editor.css';
createRoot(document.getElementById('root')!).render(<Editor locale="hu" kind="species" onBack={()=>{}} onKindChange={()=>{}} onSectionSelect={()=>{}}/>);