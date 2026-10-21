// Read-only route/geometry fixture: the map calls an in-memory RPC substitute only.
import {createRoot} from 'react-dom/client';
import WorldMapEditor from '../../src/WorldMapEditor';
import '../../src/styles.css';
import '../../src/editor.css';
const nodes=[
 {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',slug:'alpha',name_hu:'Alfa állomás',name_en:'Alpha station',image_path:'hatarvilag/worlds/alpha.webp',x:23,y:50},
 {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',slug:'beta',name_hu:'Béta bolygó',name_en:'Beta planet',x:55,y:25},
 {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',slug:'gamma',name_hu:'Gamma roncs',name_en:'Gamma wreck',x:79,y:69}
];
const routes=[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',origin_id:nodes[0].id,destination_id:nodes[1].id,energy_cost:8,is_published:true}];
createRoot(document.getElementById('root')!).render(
 <WorldMapEditor locale="hu" level="sector" parentId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" parentName="Határvidéki rendszer"
  nodes={nodes} routes={routes} onClose={()=>{}} onSaved={()=>{}}/>
);
