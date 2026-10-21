/** Bucket-relative Cloudflare R2 artwork keys for all world objects. */
export const WORLD_ART_ORIGIN='https://assets.voidnoir.net/';
export const WORLD_ART_PATTERN=/^hatarvilag(\/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$/;
export function normalizeWorldImage(value:string):string{
 const trimmed=value.trim();
 if(trimmed.startsWith(WORLD_ART_ORIGIN))return trimmed.slice(WORLD_ART_ORIGIN.length);
 return trimmed;
}
export function validWorldImage(value:string|null|undefined):boolean{
 if(!value)return true;
 return value.length<=300&&WORLD_ART_PATTERN.test(value);
}
export function worldImageUrl(value:string|null|undefined):string|undefined{
 if(!value||!validWorldImage(value))return undefined;
 return WORLD_ART_ORIGIN+value;
}
