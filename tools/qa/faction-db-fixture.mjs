import {readFile} from 'node:fs/promises';
export async function setupFactionDatabase(db){
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function private.can_edit_content() returns boolean language sql stable as $$select coalesce(current_setting('qa.editor',true),'')='yes'$$;
 grant usage on schema auth,private to authenticated;grant execute on all functions in schema auth,private to authenticated;
 create table game_galaxies(id uuid primary key default gen_random_uuid(),name_hu text,name_en text);
 create table game_quadrants(id uuid primary key default gen_random_uuid(),galaxy_id uuid references game_galaxies(id),name_hu text,name_en text,is_published boolean default true);
 create table game_items(id uuid primary key default gen_random_uuid(),slug text,is_published boolean default true);
 create table game_items_i18n(item_id uuid references game_items(id),locale text,name text);
 grant select on game_galaxies,game_quadrants,game_items,game_items_i18n to authenticated;
 insert into game_galaxies(name_hu,name_en) values('Tesztgalaxis','Test galaxy');
 insert into game_quadrants(galaxy_id,name_hu,name_en) select id,'Észak','North' from game_galaxies;
 insert into game_quadrants(galaxy_id,name_hu,name_en) select id,'Dél','South' from game_galaxies;
 insert into game_items(slug) values('alloy'),('tool');
 insert into game_items_i18n select id,'hu',slug from game_items;
 select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);select set_config('qa.editor','yes',false);`);
 await db.exec(await readFile('supabase/migrations/20261021163134_m80_faction_editor.sql','utf8'));
}
export async function factionCatalog(db){
 return (await db.query(`select f.*,coalesce((select jsonb_agg(p) from game_faction_presence p where p.faction_id=f.id),'[]') presence,
 coalesce((select jsonb_agg(c order by c.sort_order) from game_faction_companies c where c.faction_id=f.id),'[]') companies,
 coalesce((select jsonb_agg(t order by t.threshold) from (select t.*,coalesce((select jsonb_agg(r) from game_faction_reward_items r where r.tier_id=t.id),'[]') items from game_faction_tiers t where t.faction_id=f.id) t),'[]') tiers
 from game_factions f order by slug`)).rows;
}
