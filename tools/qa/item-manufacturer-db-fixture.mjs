import {setupFactionDatabase} from './faction-db-fixture.mjs';
import {readFile} from 'node:fs/promises';
export async function setupManufacturerDatabase(db){
 await setupFactionDatabase(db);
 await db.exec(`alter table game_items add column category text default 'material',add column rarity text default 'common',add column image_path text,add column equip_owner text,add column equip_slot text,add column capacity_bonus integer default 0;
 alter table game_items_i18n add column description text default '';
 create table game_item_recipes(output_item_id uuid,ingredient_item_id uuid,quantity integer);
 create table game_locales(code text,native_name text,is_enabled boolean,sort_order integer);
 insert into game_locales values('hu','Magyar',true,0),('en','English',true,1);
 insert into game_items_i18n select id,'en',slug,'' from game_items;
 alter table game_items enable row level security;
 create policy item_read on game_items for select to authenticated using(true);
 create policy item_edit on game_items for all to authenticated using(private.can_edit_content()) with check(private.can_edit_content());
 grant insert,update,delete on game_items to authenticated;grant select on game_item_recipes,game_locales to authenticated;
 -- Boundary fixture for the legacy saver: M81 delegates to this existing API.
 create function public.save_game_item_full(p_id uuid,p_slug text,p_category text,p_rarity text,p_published boolean,p_translations jsonb,p_ingredients jsonb,p_image_path text,p_equip_owner text,p_equip_slot text,p_bonus integer)
 returns jsonb language plpgsql set search_path='' as $$declare v_id uuid:=coalesce(p_id,gen_random_uuid());begin
 insert into public.game_items(id,slug,category,rarity,is_published,image_path,equip_owner,equip_slot,capacity_bonus) values(v_id,p_slug,p_category,p_rarity,p_published,p_image_path,p_equip_owner,p_equip_slot,p_bonus)
 on conflict(id) do update set slug=excluded.slug;return jsonb_build_object('id',v_id);end $$;
 insert into game_factions(slug,name_hu,name_en) values('north','Északi Frakció','North Faction'),('south','Déli Frakció','South Faction');
 insert into game_faction_companies(faction_id,name_hu,name_en) select id,name_hu||' Üzem',name_en||' Plant' from game_factions;
 `);
 await db.exec(await readFile('supabase/migrations/20261021164517_m81_item_manufacturers.sql','utf8'));
 await db.exec('set role authenticated');
}
export async function manufacturerItems(db){return (await db.query("select i.*,coalesce((select jsonb_agg(t) from game_items_i18n t where t.item_id=i.id),'[]') game_items_i18n from game_items i order by slug")).rows;}
export async function saveManufacturer(db,a){return (await db.query('select public.save_game_item_manufacturer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result',[a.p_id,a.p_slug,a.p_category,a.p_rarity,a.p_published,a.p_translations,a.p_ingredients,a.p_image_path,a.p_equip_owner,a.p_equip_slot,a.p_bonus,a.p_manufacturer_faction_id,a.p_manufacturer_company_id])).rows[0].result;}
