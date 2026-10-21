import type {WorldMapRoute} from '../WorldMapEditor';
/** Both editor entry points must confirm routes against a fresh database read. */
export function verifyWorldMapRoutes(expected:WorldMapRoute[],actual:WorldMapRoute[],en:boolean){
 const signature=(r:WorldMapRoute)=>[r.origin_id<r.destination_id?r.origin_id+':'+r.destination_id:r.destination_id+':'+r.origin_id,
  r.energy_cost,r.is_published!==false?1:0].join('|');
 if(JSON.stringify(expected.map(signature).sort())!==JSON.stringify(actual.map(signature).sort())){
  throw new Error(en?'Saved links did not match the database. Reload the map before further changes.':
   'A mentett összeköttetések visszaellenőrzése nem sikerült. A térképet újra be kell tölteni.');
 }
}
