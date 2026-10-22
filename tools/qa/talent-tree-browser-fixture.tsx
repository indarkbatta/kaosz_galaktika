import {useState} from 'react';import {createRoot} from 'react-dom/client';import TalentTreeEditor from '../../src/TalentTreeEditor';import ToastViewport from '../../src/components/ToastViewport';import '../../src/styles.css';import '../../src/editor.css';
function Fixture(){const [locale,setLocale]=useState('hu');return <><button onClick={()=>setLocale(locale==='hu'?'en':'hu')}>Language</button><div className="scene"><TalentTreeEditor locale={locale} onBack={()=>{}} onSectionSelect={()=>{}}/></div><ToastViewport/></>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
