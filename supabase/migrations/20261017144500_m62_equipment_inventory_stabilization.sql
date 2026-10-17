-- M5.4 stabilization: server-authoritative final-state inventory, crew ownership, atomic item presentation.
CREATE OR REPLACE FUNCTION private.set_equipment_impl(p_slot text, p_item uuid, p_crew uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid; equiprow record; it record; stock bigint; n integer; old_id uuid; newcap integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select id into cid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required';end if;
 perform 1 from public.character_progress where character_id=cid for update;
 if not found then raise exception 'Progress required';end if;
 if p_crew is null then
   if p_slot not in ('main_weapon','sidearm','body_armor','utility1','utility2','belt','backpack','relic') then raise exception 'Invalid captain slot';end if;
 else
   if p_slot not in ('armor','weapon','utility') then raise exception 'Invalid crew slot';end if;
   if not exists(select 1 from public.character_crew where id=p_crew and character_id=cid) then raise exception 'Not your crew member';end if;
 end if;
 select e.id,e.item_id into equiprow from public.character_equipment e
  where e.character_id=cid and e.crew_id is not distinct from p_crew and e.slot=p_slot for update;
 if equiprow.item_id is not distinct from p_item then return jsonb_build_object('unchanged',true);end if;
 if p_item is not null then
  select id,equip_slot,equip_owner,is_published into it from public.game_items where id=p_item;
  if it.id is null or not it.is_published or it.equip_slot is distinct from p_slot or
   it.equip_owner is distinct from (case when p_crew is null then 'captain' else 'crew' end)
   then raise exception 'Item incompatible with selected slot';end if;
  select quantity into stock from public.character_inventory where character_id=cid and item_id=p_item for update;
  if coalesce(stock,0)<1 then raise exception 'Not enough item stock';end if;
 end if;
 if equiprow.id is not null then
  old_id:=equiprow.item_id;
  delete from public.character_equipment where id=equiprow.id;
  -- Evaluate capacity after the entire swap, not after the temporary removal.
  insert into public.character_inventory(character_id,item_id,quantity) values(cid,old_id,1)
  on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1,updated_at=clock_timestamp();
 end if;
 if p_item is not null then
   update public.character_inventory set quantity=quantity-1,updated_at=clock_timestamp() where character_id=cid and item_id=p_item;
   insert into public.character_equipment(character_id,crew_id,slot,item_id) values(cid,p_crew,p_slot,p_item);
 end if;
 -- The final state includes returned gear, consumed source stacks and new backpack bonus.
 select private.inventory_capacity(cid) into newcap;
 select count(*) into n from public.character_inventory where character_id=cid and quantity>0;
 if n>newcap then raise exception 'Inventory capacity exceeded after equipment change';end if;
 return jsonb_build_object('slot',p_slot,'item_id',p_item,'crew_id',p_crew,'previous',old_id);
end $function$;

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
 -- Previously seeded, recipe-less equipment may be edited without inventing a recipe.
 -- Newly created equipment and consumables still require 1-5 ingredients.
 if p_category in ('equipment','consumable') and jsonb_array_length(p_ingredients)<1
 and not (
  p_id is not null and p_category='equipment' and
  exists(select 1 from public.game_items gi where gi.id=p_id and gi.category='equipment') and
  not exists(select 1 from public.game_item_recipes gr where gr.output_item_id=p_id)
 ) then raise exception 'Craftable items require 1 to 5 ingredients';end if;
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

CREATE OR REPLACE FUNCTION private.on_crew_replacement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare it record;
begin
 -- A successful recruitment replaces the person even when two candidates share a name.
 if tg_op='UPDATE' then
  for it in select id,item_id from public.character_equipment where crew_id=old.id loop
   delete from public.character_equipment where id=it.id;
   insert into public.character_inventory(character_id,item_id,quantity) values(old.character_id,it.item_id,1)
   on conflict(character_id,item_id) do update set quantity=public.character_inventory.quantity+1;
  end loop;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.get_inventory_capacity()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare c uuid;
begin
select id into c from public.characters where user_id=auth.uid();
if c is null then raise exception 'Captain required';end if;
return private.inventory_capacity(c);
end $function$;


-- Check the FINAL committed inventory after all equip/loot/craft stack changes.
-- A deferred trigger is essential: swaps can temporarily exceed capacity while
-- giving back old gear, and ON CONFLICT can resurrect zero-quantity stacks.
drop trigger if exists capacity_on_new_stacks on public.character_inventory;
drop function if exists private.inventory_capacity_guard();

create or replace function private.inventory_capacity_final_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_used integer; v_limit integer;
begin
 select count(*) into v_used from public.character_inventory
  where character_id=new.character_id and quantity>0;
 select private.inventory_capacity(new.character_id) into v_limit;
 if v_used>v_limit then
  raise exception 'Inventory capacity exceeded: % stacks for % slots',v_used,v_limit
   using errcode='23514';
 end if;
 return null;
end $$;
revoke all on function private.inventory_capacity_final_guard() from public,anon,authenticated;
create constraint trigger inventory_capacity_committed
 after insert or update of quantity on public.character_inventory
 deferrable initially deferred
 for each row execute function private.inventory_capacity_final_guard();

-- The crew row is re-used when hiring into an occupied position.
-- Trigger on ANY identity update; name equality is not evidence of same person.
drop trigger if exists crew_recruit_unequip on public.character_crew;
create trigger crew_recruit_unequip before update of name,specialty,aptitude,species_slug
 on public.character_crew for each row execute function private.on_crew_replacement();

-- Physical integrity: a crew assignment cannot reference a crew ID owned by another captain.
alter table public.character_crew
 add constraint character_crew_id_character_unique unique(id,character_id);
alter table public.character_equipment
 add constraint equipment_crew_same_character_fk foreign key(crew_id,character_id)
 references public.character_crew(id,character_id) on delete cascade;


-- Both item-save phases now share ONE RPC transaction, including publication.
create function private.save_game_item_full_impl(
 p_id uuid,p_slug text,p_category text,p_rarity text,p_published boolean,
 p_translations jsonb,p_ingredients jsonb,p_image_path text,
 p_equip_owner text,p_equip_slot text,p_bonus integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_result jsonb;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';
 end if;
 -- Existing save_game_item temporarily unpublishes an item; any failure rolls back both stages.
 v_result:=private.save_game_item_impl(p_id,p_slug,p_category,p_rarity,p_published,p_translations,p_ingredients);
 v_id:=(v_result->>'id')::uuid;
 perform private.set_item_presentation_impl(v_id,p_image_path,p_equip_owner,p_equip_slot,p_bonus);
 return v_result;
end $$;
revoke all on function private.save_game_item_full_impl(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer) from public,anon;
grant execute on function private.save_game_item_full_impl(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer) to authenticated;
create function public.save_game_item_full(
 p_id uuid,p_slug text,p_category text,p_rarity text,p_published boolean,
 p_translations jsonb,p_ingredients jsonb,p_image_path text,
 p_equip_owner text,p_equip_slot text,p_bonus integer
) returns jsonb language sql security invoker set search_path='' as $$
 select private.save_game_item_full_impl(p_id,p_slug,p_category,p_rarity,p_published,
 p_translations,p_ingredients,p_image_path,p_equip_owner,p_equip_slot,p_bonus)
$$;
revoke all on function public.save_game_item_full(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer) from public,anon;
grant execute on function public.save_game_item_full(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer) to authenticated;
