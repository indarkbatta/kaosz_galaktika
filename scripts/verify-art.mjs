import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('../docs/art-reborn-manifest.json',import.meta.url)));
const keys=new Set();
for(const asset of manifest.assets){
 if(keys.has(asset.key))throw Error('Duplicate key: '+asset.key);
 keys.add(asset.key);
 const response=await fetch(manifest.origin+'/'+asset.key,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(asset.key+': HTTP '+response.status);
 if(!response.headers.get('content-type')?.includes('image/webp'))throw Error(asset.key+': invalid MIME type');
 const data=Buffer.from(await response.arrayBuffer());
 if(data.length!==asset.bytes||createHash('sha256').update(data).digest('hex')!==asset.sha256)throw Error(asset.key+': checksum mismatch');
}
console.log('Verified '+keys.size+' standalone assets against release manifest.');
