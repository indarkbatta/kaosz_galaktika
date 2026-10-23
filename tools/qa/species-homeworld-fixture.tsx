import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Editor from '../../src/Editor';
import '../../src/styles.css';
import '../../src/editor.css';
function Fixture(){const [kind,setKind]=useState<'species'|'classes'>('species');return <div className="shell"><header className="topbar">HATÁRVILÁG</header><main className="scene"><Editor locale="hu" kind={kind} onBack={()=>{}} onKindChange={setKind} onSectionSelect={()=>{}}/></main><footer className="footer">HATÁRVILÁG</footer></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
