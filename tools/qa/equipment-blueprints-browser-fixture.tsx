import {createRoot} from 'react-dom/client';
import BlueprintEditor from '../../src/BlueprintEditor';
import '../../src/styles.css';
const p=new URLSearchParams(location.search),locale=p.get('locale')||'hu';
createRoot(document.getElementById('root')!).render(<div className="scene"><BlueprintEditor locale={locale} onBack={()=>{document.body.dataset.destination='dashboard';}} onSectionSelect={section=>{document.body.dataset.destination=section;}}/></div>);
