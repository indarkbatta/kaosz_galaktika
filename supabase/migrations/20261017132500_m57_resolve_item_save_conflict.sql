CREATE OR REPLACE FUNCTION private.save_game_item_impl(p_id uuid, p_slug text, p_category text, p_rarity text, p_published boolean, p_translations jsonb, p_ingredients jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item_id uuid;row_data record;row_ingredient record;ct integer;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then raise exception 'Editor permission required' using errcode='42501';end if;
 if p_slug is null or p_slug !~ '^[a-z][a-z0-9_]*$' or length(p_slug)>80 then raise exception 'Invalid item slug';end if;
 if p_category not in ('material','data','trade','equipment','consumable')
 or p_rarity not in ('common','uncommon','rare','epic') then raise exception 'Invalid item category or rarity';end if;
 if jsonb_typeof(p_translations) is distinct from 'array'
 or jsonb_typeof(p_ingredients) is distinct from 'array' then raise exception 'Invalid item lists';end if;
 if jsonb_array_length(p_ingredients)>5 then raise exception 'Maximum 5 ingredients';end if;
 if p_category='material' and jsonb_array_length(p_ingredients)>0 then raise exception 'Raw materials cannot have recipes';end if;
 if p_category in ('equipment','consumable') and jsonb_array_length(p_ingredients)<1
 then raise exception 'Craftable items require 1 to 5 ingredients';end if;
 if not exists(select 1 from jsonb_to_recordset(p_translations) t(locale text,name text,description text)
 where locale='hu' and length(trim(name))>0) or not exists(
 select 1 from jsonb_to_recordset(p_translations) t(locale text,name text,description text)
 where locale='en' and length(trim(name))>0) then raise exception 'HU and EN translations required';end if;
 if p_id is null then
   insert into public.game_items(slug,category,rarity,is_published)
   values(p_slug,p_category,p_rarity,false) returning id into item_id;
 else
   select id into item_id from public.game_items where id=p_id for update;
   if item_id is null then raise exception 'Item missing';end if;
   if p_category<>'material' and exists(select 1 from public.game_item_recipes where ingredient_item_id=item_id)
    then raise exception 'Cannot change a material used in other recipes';end if;
   update public.game_items set slug=p_slug,category=p_category,rarity=p_rarity,is_published=false where id=item_id;
 end if;
 for row_data in select * from jsonb_to_recordset(p_translations) t(locale text,name text,description text) loop
  if row_data.locale is null or row_data.name is null or length(trim(row_data.name))=0 then
   raise exception 'Invalid translation';end if;
  insert into public.game_items_i18n(item_id,locale,name,description)
   values(item_id,row_data.locale,trim(row_data.name),coalesce(row_data.description,''))
  on conflict on constraint game_items_i18n_pkey do update set name=excluded.name,description=excluded.description;
 end loop;
 if jsonb_array_length(p_ingredients)>0 then
  if (select count(distinct ing.item_id) from jsonb_to_recordset(p_ingredients) ing(item_id uuid,quantity integer))
    <>jsonb_array_length(p_ingredients) then raise exception 'Ingredients must be distinct';end if;
  if exists(select 1 from jsonb_to_recordset(p_ingredients) ing(item_id uuid,quantity integer)
   left join public.game_items material on material.id=ing.item_id
   where ing.item_id is null or ing.item_id=item_id or material.id is null
   or material.category <> 'material' or not material.is_published
   or ing.quantity not between 1 and 10000)
  then raise exception 'Invalid raw material or quantity';end if;
 end if;
 delete from public.game_item_recipes where output_item_id=item_id;
 for row_ingredient in select * from jsonb_to_recordset(p_ingredients) ing(item_id uuid,quantity integer) loop
  insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity)
  values(item_id,row_ingredient.item_id,row_ingredient.quantity);
 end loop;
 update public.game_items set is_published=p_published where id=item_id;
 return jsonb_build_object('id',item_id,'ingredient_count',jsonb_array_length(p_ingredients),'published',p_published);
end $function$;