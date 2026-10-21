-- M73: make snap-to-grid a data invariant, not merely a CSS/editor illusion.
-- Existing map identifiers, travel links and character positions are untouched.
create function private.snap_world_grid_coordinates()
returns trigger language plpgsql set search_path='' as $$
begin
 new.x:=greatest(10,least(90,(round(new.x::numeric/5)*5)::integer));
 new.y:=greatest(10,least(90,(round(new.y::numeric/5)*5)::integer));
 return new;
end $$;
create trigger snap_galaxy_quadrant_grid
 before insert or update of x,y on public.game_quadrants
 for each row execute function private.snap_world_grid_coordinates();
create trigger snap_quadrant_sector_grid
 before insert or update of x,y on public.game_sectors
 for each row execute function private.snap_world_grid_coordinates();
create trigger snap_sector_location_grid
 before insert or update of x,y on public.game_locations
 for each row execute function private.snap_world_grid_coordinates();
-- Normalize legacy positions without recreating or deleting any object.
update public.game_quadrants set x=x,y=y
 where x<10 or x>90 or y<10 or y>90 or x%5<>0 or y%5<>0;
update public.game_sectors set x=x,y=y
 where x<10 or x>90 or y<10 or y>90 or x%5<>0 or y%5<>0;
update public.game_locations set x=x,y=y
 where x<10 or x>90 or y<10 or y>90 or x%5<>0 or y%5<>0;
