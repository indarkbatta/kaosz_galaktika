import hu from './hu';import en from './en';
export type Locale='hu'|'en';export type Key=keyof typeof hu;
export const dictionaries:{hu:Record<Key,string>;en:Record<Key,string>}={hu,en};
export function storedLocale():Locale{try{return localStorage.getItem('hatarvilag.locale')==='en'?'en':'hu';}catch{return 'hu';}}
export function rememberLocale(value:Locale){document.documentElement.lang=value;try{localStorage.setItem('hatarvilag.locale',value);}catch{}}
