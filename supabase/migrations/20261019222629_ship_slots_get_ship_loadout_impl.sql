create function private.get_ship_loadout_impl() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare cid uuid; sid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select id,starter_ship_id into cid,sid from public.characters where user_id=auth.uid();
 if cid is null then raise exception 'Captain required'; end if;
 return jsonb_build_object('ship_id',sid,'stats',private.ship_status(cid),
 'slots',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('item_id',e.item_id,'crew_id',a.crew_id) order by s.sort_order),'[]'::jsonb)
 from public.game_ship_slots s left join public.character_ship_equipment e on e.ship_id=s.ship_id and e.slot_key=s.slot_key and e.character_id=cid
 left join public.character_ship_crew a on a.ship_id=s.ship_id and a.slot_key=s.slot_key and a.character_id=cid where s.ship_id=sid),
 'modules',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('slug',i.slug,'image_path',i.image_path,'is_published',i.is_published,
 'translations',(select jsonb_agg(to_jsonb(t)) from public.game_items_i18n t where t.item_id=i.id),
 'quantity',coalesce((select quantity from public.character_inventory v where v.character_id=cid and v.item_id=i.id),0)) order by i.slug),'[]'::jsonb)
 from public.game_ship_modules m join public.game_items i on i.id=m.item_id where i.is_published or exists(select 1 from public.character_ship_equipment e where e.character_id=cid and e.item_id=i.id)),
 'crew',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('portrait_path',s.image_path) order by c.position),'[]'::jsonb)
 from public.character_crew c left join public.game_species s on s.slug=c.species_slug where c.character_id=cid));
end $fn$;
revoke all on function private.get_ship_loadout_impl() from public,anon;
grant execute on function private.get_ship_loadout_impl() to authenticated;
create function public.get_ship_loadout() returns jsonb language sql security invoker set search_path='' as $fn$select private.get_ship_loadout_impl()$fn$;
revoke all on function public.get_ship_loadout() from public,anon;
grant execute on function public.get_ship_loadout() to authenticated;

