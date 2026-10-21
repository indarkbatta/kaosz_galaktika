-- Existing maps retain their geometry; background is optional and defaults to 35% opacity.
alter table public.game_salvage_maps add column background_image text,
 add column background_opacity numeric not null default 0.35 check(background_opacity between 0 and 1),
 add constraint salvage_background_image_valid check(background_image is null or (length(background_image)<=300 and background_image ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$'));
alter table public.game_salvage_maps drop constraint game_salvage_maps_width_check,drop constraint game_salvage_maps_height_check,
 add constraint game_salvage_maps_width_check check(width between 12 and 128),add constraint game_salvage_maps_height_check check(height between 12 and 128);
alter table public.game_salvage_rooms drop constraint game_salvage_rooms_width_check,drop constraint game_salvage_rooms_height_check,
 add constraint game_salvage_rooms_width_check check(width between 2 and 128),add constraint game_salvage_rooms_height_check check(height between 2 and 128);
-- Preserve the tested atomic graph validator as an internal implementation detail.
alter function private.save_salvage_map(uuid,integer,jsonb) rename to save_salvage_map_graph;
revoke all on function private.save_salvage_map_graph(uuid,integer,jsonb) from public,anon,authenticated;
create function private.save_salvage_map(p_id uuid,p_revision integer,p_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb;
begin
 if auth.uid() is null or not private.can_edit_content() then raise exception 'Editor access required' using errcode='42501';end if;
 saved:=private.save_salvage_map_graph(p_id,p_revision,p_document);
 update public.game_salvage_maps set
 background_image=case when p_document ? 'background_image' then nullif(p_document->>'background_image','') else background_image end,
 background_opacity=case when p_document ? 'background_opacity' then (p_document->>'background_opacity')::numeric else background_opacity end
 where id=(saved->>'id')::uuid;
 return saved;
end $$;
revoke all on function private.save_salvage_map(uuid,integer,jsonb) from public,anon;
grant execute on function private.save_salvage_map(uuid,integer,jsonb) to authenticated;
