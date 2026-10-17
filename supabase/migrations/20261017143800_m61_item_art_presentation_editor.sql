
update public.game_items set image_path='hatarvilag/items/'||slug||'-v2.webp'
where slug in ('captain_rifle','captain_sidearm','crew_weapon','captain_vest','crew_armor',
'captain_backpack','captain_belt','captain_toolkit','captain_medkit','captain_relic','crew_utility',
'alloy_scrap','encrypted_fragments','trade_seals','stellar_charts','plasma_cell','circuit_core',
'polymer_fiber','field_scanner','emergency_patch');
create function private.set_item_presentation_impl(p_item uuid,p_image_path text,p_equip_owner text,p_equip_slot text,p_bonus integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (select private.can_edit_content()) then raise exception 'Editor permission required' using errcode='42501';end if;
 if p_image_path is not null and p_image_path <> '' and
  (p_image_path !~ '^hatarvilag/items/[a-z0-9_/-]+\.(webp|avif|png)$' or length(p_image_path)>250)
 then raise exception 'Invalid Cloudflare item path';end if;
 if p_bonus is null or p_bonus not between 0 and 100 then raise exception 'Invalid capacity bonus';end if;
 update public.game_items set
  image_path=nullif(p_image_path,''),
  equip_owner=p_equip_owner,equip_slot=p_equip_slot,capacity_bonus=p_bonus
  where id=p_item;
 if not found then raise exception 'Item not found';end if;
end $$;
revoke all on function private.set_item_presentation_impl(uuid,text,text,text,integer) from public,anon;
grant execute on function private.set_item_presentation_impl(uuid,text,text,text,integer) to authenticated;
create function public.set_item_presentation(p_item uuid,p_image_path text,p_equip_owner text,p_equip_slot text,p_bonus integer)
returns void language sql security invoker set search_path='' as $$
 select private.set_item_presentation_impl(p_item,p_image_path,p_equip_owner,p_equip_slot,p_bonus) $$;
revoke all on function public.set_item_presentation(uuid,text,text,text,integer) from public,anon;
grant execute on function public.set_item_presentation(uuid,text,text,text,integer) to authenticated;
