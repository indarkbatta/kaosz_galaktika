import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL || 'https://lsodhqokudnfriosqqfe.supabase.co';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_NHaGQFvjRwaFEPixdJpxGA_ufYio5zk';
export const supabase=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export type Role='user'|'editor'|'admin';
