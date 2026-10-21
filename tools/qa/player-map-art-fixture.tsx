// Static player-map fixture; none of these nodes or images come from the live database.
import {createRoot} from 'react-dom/client';
import SectorMap from '../../src/SectorMap';
import '../../src/styles.css';
import '../../src/editor.css';
const galaxyId='11111111-1111-4111-8111-111111111111';
const quadrantId='22222222-2222-4222-8222-222222222222';
const sectorId='33333333-3333-4333-8333-333333333333';
const locationId='44444444-4444-4444-8444-444444444444';
const image_path='hatarvilag/worlds/frontier.webp';
createRoot(document.getElementById('root')!).render(
 <div style={{width:'1150px',height:'640px',padding:'12px',display:'flex',boxSizing:'border-box'}}>
  <SectorMap locale="hu"
    galaxies={[{id:galaxyId,slug:'hatarvilag',name_hu:'Határvilág',name_en:'Borderworld',image_path}]}
    quadrants={[{id:quadrantId,galaxy_id:galaxyId,slug:'hatarvidek',name_hu:'Határvidék',name_en:'Frontier',image_path,x:35,y:55}]}
    sectors={[{id:sectorId,quadrant_id:quadrantId,slug:'alpha',name_hu:'Alfa rendszer',name_en:'Alpha System',image_path,x:65,y:45}]}
    locations={[
      {id:locationId,sector_id:sectorId,slug:'station',kind:'station',image_path,x:45,y:55,is_published:true,
       game_locations_i18n:[{locale:'hu',name:'Alfa állomás',description:'Teszt'},{locale:'en',name:'Alpha station',description:'Test'}]},
      {id:'55555555-5555-4555-8555-555555555555',sector_id:sectorId,slug:'unknown',kind:'planet',
       image_path,x:70,y:65,is_published:true,game_locations_i18n:[
        {locale:'hu',name:'Titkos bolygó',description:'Teszt'},{locale:'en',name:'Secret planet',description:'Test'}]}
     ]}
    routes={[]} discovered={[]} currentId={locationId} energy={100} busy={false}
    onTravel={()=>{}}/>
 </div>
);
