import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import FactionEditor from '../../src/FactionEditor';
import ToastViewport from '../../src/components/ToastViewport';
import '../../src/styles.css';
import '../../src/editor.css';
function Fixture(){const [locale,setLocale]=useState('hu');return <><button onClick={()=>setLocale(locale==='hu'?'en':'hu')}>Language</button><FactionEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/><ToastViewport/></>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
