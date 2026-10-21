-- Item manufacturer definitions reuse the faction's controlled companies as plants.
alter table public.game_faction_companies add constraint faction_company_owner_unique unique(id,faction_id);
alter table public.game_items
 add column manufacturer_faction_id uuid references public.game_factions(id) on delete restrict,
 add column manufacturer_company_id uuid,
 add constraint item_manufacturer_requires_faction check(manufacturer_company_id is null or manufacturer_faction_id is not null),
 add constraint item_manufacturer_company_owner foreign key(manufacturer_company_id,manufacturer_faction_id)
 references public.game_faction_companies(id,faction_id) on delete restrict;
create index game_items_manufacturer_faction_idx on public.game_items(manufacturer_faction_id);
create index game_items_manufacturer_company_idx on public.game_items(manufacturer_company_id,manufacturer_faction_id);
-- Separate name keeps legacy item-save clients compatible; all stages share a transaction.
create function public.save_game_item_manufacturer(
 p_id uuid,p_slug text,p_category text,p_rarity text,p_published boolean,
 p_translations jsonb,p_ingredients jsonb,p_image_path text,
 p_equip_owner text,p_equip_slot text,p_bonus integer,
 p_manufacturer_faction_id uuid,p_manufacturer_company_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not (select private.can_edit_content()) then
  raise exception 'Editor permission required' using errcode='42501';
 end if;
 result:=public.save_game_item_full(p_id,p_slug,p_category,p_rarity,p_published,p_translations,p_ingredients,p_image_path,p_equip_owner,p_equip_slot,p_bonus);
 update public.game_items set manufacturer_faction_id=p_manufacturer_faction_id,manufacturer_company_id=p_manufacturer_company_id where id=(result->>'id')::uuid;
 if not found then raise exception 'Item manufacturer could not be saved'; end if;
 return result;
end $$;
revoke all on function public.save_game_item_manufacturer(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer,uuid,uuid) from public,anon;
grant execute on function public.save_game_item_manufacturer(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer,uuid,uuid) to authenticated;
