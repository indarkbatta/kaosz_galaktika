import {readFile} from 'node:fs/promises';
export async function setupUILayoutDatabase(db){
 const items=JSON.parse(await readFile('tools/qa/inventory-items.json','utf8'));
 const sample={items,cargo:items.slice(0,5).map((i,position)=>({item_id:i.id,quantity:1,position})),personal:[],equipped:[],cargo_capacity:80,personal_capacity:18,ship:{translations:[{locale:'hu',name:'Vándor'}]}};
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create schema storage;create table auth.users(id uuid primary key);insert into auth.users values('11111111-1111-4111-8111-111111111111');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function private.can_edit_content() returns boolean language sql stable as $$select current_setting('qa.editor',true)='yes'$$;grant usage on schema auth,private,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant insert,select on storage.objects to authenticated;
 create table game_items(image_path text);insert into game_items values('hatarvilag/items/test.webp');
 create function private.get_storage_inventory_impl() returns jsonb language sql as $$select current_setting('qa.sample')::jsonb$$;
 `);
 await db.query("select set_config('qa.sample',$1,false)",[JSON.stringify(sample)]);
 await db.exec(await readFile('supabase/migrations/20261023164315_visual_ui_layout_editor.sql','utf8'));
 await db.exec(`set qa.editor='yes';set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';set role authenticated;`);
 return sample;
}
