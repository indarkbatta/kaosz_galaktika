import {createRoot} from 'react-dom/client';
import ItemEditor from '../../src/ItemEditor';
import ToastViewport from '../../src/components/ToastViewport';
import '../../src/styles.css';import '../../src/editor.css';
createRoot(document.getElementById('root')!).render(<><ItemEditor locale="hu" onBack={()=>{}} onSectionSelect={()=>{}}/><ToastViewport/></>);
