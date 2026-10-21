-- M71: keep the older production editor able to create a location during UI rollout.
-- New clients explicitly provide sector_id; legacy inserts are assigned to the seeded solar system.
create function private.default_location_sector_impl() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.sector_id is null then
  select id into new.sector_id from public.game_sectors where slug='kezdo_rendszer';
  if new.sector_id is null then raise exception 'Default sector missing'; end if;
 end if;
 return new;
end $$;
create trigger default_location_sector_before_insert
before insert on public.game_locations
for each row execute function private.default_location_sector_impl();
