-- M85: item metadata, manufacturer, recipes, translations and combat stats save atomically.
create function public.save_game_item_with_combat(
 p_id uuid,p_slug text,p_category text,p_rarity text,p_published boolean,p_translations jsonb,p_ingredients jsonb,p_image_path text,
 p_equip_owner text,p_equip_slot text,p_bonus integer,p_manufacturer_faction_id uuid,p_manufacturer_company_id uuid,p_combat jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$declare result jsonb;item uuid;rev integer;begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor permission required';end if;
 result:=public.save_game_item_manufacturer(p_id,p_slug,p_category,p_rarity,p_published,p_translations,p_ingredients,p_image_path,p_equip_owner,p_equip_slot,p_bonus,p_manufacturer_faction_id,p_manufacturer_company_id);item:=(result->>'id')::uuid;
 if p_combat is null then delete from public.game_item_combat where item_id=item;
 else
  rev:=(p_combat->>'revision')::int;
  perform private.save_combat_content('items',item,(p_combat-'revision'-'item_id')||jsonb_build_object('item_id',item),'[]','[]',rev);
 end if;return result;
end $$;
revoke all on function public.save_game_item_with_combat(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer,uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_game_item_with_combat(uuid,text,text,text,boolean,jsonb,jsonb,text,text,text,integer,uuid,uuid,jsonb) to authenticated;

create policy published_item_combat_read on public.game_item_combat for select to authenticated using(exists(select 1 from public.game_items i where i.id=item_id and i.is_published));

-- Extend the existing storage snapshot without changing its ownership/capacity implementation.
create function private.get_storage_inventory_combat_impl() returns jsonb language plpgsql stable security definer set search_path='' as $$declare snapshot jsonb;items jsonb;begin
 snapshot:=private.get_storage_inventory_impl();
 select coalesce(jsonb_agg(i||jsonb_build_object('game_item_combat',(select to_jsonb(c) from public.game_item_combat c where c.item_id=(i->>'id')::uuid))),'[]') into items from jsonb_array_elements(snapshot->'items')i;
 return jsonb_set(snapshot,'{items}',items);
end $$;
revoke all on function private.get_storage_inventory_combat_impl() from public,anon;
grant execute on function private.get_storage_inventory_combat_impl() to authenticated;
create or replace function public.get_storage_inventory() returns jsonb language sql security invoker set search_path='' as $$select private.get_storage_inventory_combat_impl()$$;
