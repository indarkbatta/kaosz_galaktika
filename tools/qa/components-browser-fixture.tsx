import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ItemEditor from '../../src/ItemEditor';
import '../../src/styles.css';
import '../../src/editor.css';
function Fixture(){const params=new URLSearchParams(location.search),locale=params.get('locale')||'hu';const [section,setSection]=useState('components');return <div className="scene"><ItemEditor key={section} componentsOnly={section==='components'} locale={locale} onBack={()=>{}} onSectionSelect={setSection}/></div>;}
createRoot(document.getElementById('root')!).render(<Fixture/>);
