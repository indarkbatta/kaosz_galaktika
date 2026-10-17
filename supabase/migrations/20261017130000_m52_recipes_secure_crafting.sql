
-- M5.2: craftable items have 1..5 DISTINCT raw materials; raw materials have no recipe.
alter table public.game_items drop constraint if exists game_items_category_check;
alter table public.game_items add constraint game_items_category_check
 check(category in ('material','data','trade','equipment','consumable'));

create table public.game_item_recipes(
 output_item_id uuid not null references public.game_items(id) on delete cascade,
 ingredient_item_id uuid not null references public.game_items(id) on delete restrict,
 quantity integer not null check(quantity between 1 and 10000),
 primary key(output_item_id,ingredient_item_id),
 check(output_item_id <> ingredient_item_id)
);
create index game_item_recipes_by_ingredient on public.game_item_recipes(ingredient_item_id);
alter table public.game_item_recipes enable row level security;
create policy recipes_read on public.game_item_recipes for select to authenticated
 using(exists(select 1 from public.game_items i where i.id=output_item_id));
-- Recipe writes ONLY via a guarded RPC. Editors may not bypass 1..5 distinct rules.
revoke all on public.game_item_recipes from public,anon,authenticated;
grant select on public.game_item_recipes to authenticated;

create function private.set_item_recipe_impl(p_output uuid,p_ingredients jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare rec record; v_category text;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';end if;
 select category into v_category from public.game_items where id=p_output for update;
 if not found then raise exception 'Item not found';end if;
 if jsonb_typeof(p_ingredients) is distinct from 'array'
  or jsonb_array_length(p_ingredients) not between 1 and 5 then
  raise exception 'Crafting recipes require 1 to 5 ingredients';end if;
 if v_category='material' then raise exception 'Raw materials cannot have crafting recipes';end if;
 if exists(
  select 1 from jsonb_to_recordset(p_ingredients) as x(item_id uuid,quantity integer)
   left join public.game_items i on i.id=x.item_id
  where x.item_id is null or x.item_id=p_output or i.id is null
    or i.category <> 'material' or not i.is_published
    or x.quantity not between 1 and 10000
 ) then raise exception 'Invalid ingredient, quantity or non-material ingredient'; end if;
 if (select count(distinct x.item_id) from jsonb_to_recordset(p_ingredients) x(item_id uuid,quantity integer))
     <>jsonb_array_length(p_ingredients) then raise exception 'Ingredients must be distinct'; end if;
 delete from public.game_item_recipes where output_item_id=p_output;
 for rec in select * from jsonb_to_recordset(p_ingredients) as x(item_id uuid,quantity integer) loop
  insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity)
  values(p_output,rec.item_id,rec.quantity);
 end loop;
 return jsonb_build_object('item_id',p_output,'ingredient_count',jsonb_array_length(p_ingredients));
end $$;
revoke all on function private.set_item_recipe_impl(uuid,jsonb) from public,anon;
create function public.set_item_recipe(p_output uuid,p_ingredients jsonb) returns jsonb
 language sql security invoker set search_path='' as $$
 select private.set_item_recipe_impl(p_output,p_ingredients)
 $$;
revoke all on function public.set_item_recipe(uuid,jsonb) from public,anon;
grant execute on function public.set_item_recipe(uuid,jsonb) to authenticated;

create table public.character_craft_log(
 id bigint generated always as identity primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 item_id uuid not null references public.game_items(id),
 output_quantity integer not null check(output_quantity between 1 and 20),
 crafted_at timestamptz not null default clock_timestamp()
);
alter table public.character_craft_log enable row level security;
create policy craft_log_own on public.character_craft_log for select to authenticated
 using(exists(select 1 from public.characters c where c.id=character_id and c.user_id=(select auth.uid())));
revoke all on public.character_craft_log from public,anon,authenticated;
grant select on public.character_craft_log to authenticated;

create function private.craft_item_impl(p_item uuid,p_amount integer) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare v_char uuid;v_need record;v_old bigint;v_output text;v_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_amount is null or p_amount not between 1 and 20 then raise exception 'Invalid craft quantity';end if;
 select id into v_char from public.characters where user_id=auth.uid();
 if v_char is null then raise exception 'Captain required';end if;
 -- One serialization lock for all server-side spending (including crew/energy).
 perform 1 from public.character_progress where character_id=v_char for update;
 if not found then raise exception 'Missing character progress';end if;
 select category into v_output from public.game_items where id=p_item and is_published;
 if not found or v_output='material' then raise exception 'Item is not craftable';end if;
 select count(*) into v_count from public.game_item_recipes where output_item_id=p_item;
 if v_count not between 1 and 5 then raise exception 'Valid recipe with 1 to 5 ingredients required';end if;
 for v_need in
  select ingredient_item_id,quantity::bigint*p_amount as required
  from public.game_item_recipes where output_item_id=p_item order by ingredient_item_id
 loop
  select quantity into v_old from public.character_inventory
   where character_id=v_char and item_id=v_need.ingredient_item_id for update;
  if coalesce(v_old,0)<v_need.required then raise exception 'Not enough crafting materials';end if;
 end loop;
 for v_need in
  select ingredient_item_id,quantity::bigint*p_amount as required
  from public.game_item_recipes where output_item_id=p_item order by ingredient_item_id
 loop
  update public.character_inventory set quantity=quantity-v_need.required,updated_at=clock_timestamp()
   where character_id=v_char and item_id=v_need.ingredient_item_id;
 end loop;
 insert into public.character_inventory(character_id,item_id,quantity)
 values(v_char,p_item,p_amount)
 on conflict(character_id,item_id) do update
  set quantity=public.character_inventory.quantity+excluded.quantity,updated_at=clock_timestamp();
 insert into public.character_craft_log(character_id,item_id,output_quantity) values(v_char,p_item,p_amount);
 return jsonb_build_object('item_id',p_item,'quantity',p_amount,'crafted',true);
end $$;
revoke all on function private.craft_item_impl(uuid,integer) from public,anon;
create function public.craft_item(p_item uuid,p_amount integer default 1) returns jsonb
 language sql security invoker set search_path='' as $$
 select private.craft_item_impl(p_item,p_amount)
 $$;
revoke all on function public.craft_item(uuid,integer) from public,anon;
grant execute on function public.craft_item(uuid,integer) to authenticated;

-- Additional raw materials and two sample craftables.
insert into public.game_items(slug,rarity,category) values
 ('circuit_core','common','material'),
 ('polymer_fiber','common','material'),
 ('plasma_cell','uncommon','material'),
 ('field_scanner','uncommon','equipment'),
 ('emergency_patch','common','consumable')
 on conflict(slug) do nothing;
insert into public.game_items_i18n(item_id,locale,name,description)
select i.id,l.locale,l.name,l.description from (values
 ('circuit_core','hu','Áramköri mag','Összetett elektronikák alapanyaga.'),
 ('circuit_core','en','Circuit Core','Base component for advanced electronics.'),
 ('polymer_fiber','hu','Polimerszál','Könnyű, tartós szintetikus szál.'),
 ('polymer_fiber','en','Polymer Fiber','Lightweight resilient synthetic fiber.'),
 ('plasma_cell','hu','Plazmacella','Sűrített energiát tároló alkatrész.'),
 ('plasma_cell','en','Plasma Cell','A component storing concentrated energy.'),
 ('field_scanner','hu','Terepi szkenner','Kompakt, javítható felderítőberendezés.'),
 ('field_scanner','en','Field Scanner','Compact, serviceable survey instrument.'),
 ('emergency_patch','hu','Vészjavító készlet','Gyors rendszerjavításhoz szükséges felszerelés.'),
 ('emergency_patch','en','Emergency Repair Kit','Equipment for emergency subsystem repairs.')
) l(slug,locale,name,description)
join public.game_items i on i.slug=l.slug
on conflict(item_id,locale) do nothing;
insert into public.game_item_recipes(output_item_id,ingredient_item_id,quantity)
select out_i.id,in_i.id,v.qty from (values
 ('field_scanner','circuit_core',2),('field_scanner','plasma_cell',1),
 ('emergency_patch','polymer_fiber',2),('emergency_patch','circuit_core',1)
) v(output_slug,ingredient_slug,qty)
join public.game_items out_i on out_i.slug=v.output_slug
join public.game_items in_i on in_i.slug=v.ingredient_slug
on conflict(output_item_id,ingredient_item_id) do nothing;
-- Give starting actions a chance to supply recipe materials.
insert into public.game_action_loot(action_id,item_id,chance_percent,min_qty,max_qty)
select a.id,i.id,v.chance,v.min_qty,v.max_qty from (values
 ('repair','circuit_core',55,1,2),
 ('recon','polymer_fiber',55,1,2),
 ('navigate','plasma_cell',35,1,1)
) v(action_slug,item_slug,chance,min_qty,max_qty)
join public.game_actions a on a.slug=v.action_slug
join public.game_items i on i.slug=v.item_slug
on conflict(action_id,item_id) do nothing;
