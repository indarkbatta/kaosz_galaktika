-- M75: Species-specific starting homeworld; no existing character is repositioned.
-- The FK refers to a visitable Location within the 4-tier galaxy hierarchy.
alter table public.game_species
  add column homeworld_location_id uuid references public.game_locations(id) on delete restrict;
create index game_species_homeworld_location_idx
  on public.game_species(homeworld_location_id) where homeworld_location_id is not null;

-- Editors may stage draft homeworlds on unpublished species. A playable,
-- published species must point to a fully published location + ancestor chain.
create function private.validate_species_homeworld()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.is_published and new.homeworld_location_id is not null
  and not exists(
   select 1 from public.game_locations l
   join public.game_sectors s on s.id=l.sector_id
   join public.game_quadrants q on q.id=s.quadrant_id
   join public.game_galaxies g on g.id=q.galaxy_id
   where l.id=new.homeworld_location_id
     and l.is_published and s.is_published and q.is_published and g.is_published
  ) then
  raise exception 'Published species must have a published homeworld and published ancestors'
    using errcode='23514';
 end if;
 return new;
end $$;
create trigger species_valid_homeworld
before insert or update of homeworld_location_id,is_published on public.game_species
for each row execute function private.validate_species_homeworld();

-- Server authoritative spawn: no user-controlled homeworld field in create_captain.
-- Fallback preserves legacy species behavior until a homeworld is assigned.
create or replace function private.initialize_character_position()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_start uuid;
begin
 select s.homeworld_location_id into v_start
 from public.game_species s where s.id=new.species_id;
 if v_start is null then
  select l.id into v_start from public.game_locations l
  where l.slug='frontier_station' and l.is_published;
 end if;
 if v_start is null or not exists(
  select 1 from public.game_locations l
  join public.game_sectors s on s.id=l.sector_id
  join public.game_quadrants q on q.id=s.quadrant_id
  join public.game_galaxies g on g.id=q.galaxy_id
  where l.id=v_start
    and l.is_published and s.is_published and q.is_published and g.is_published
 ) then
  raise exception 'Species homeworld is unavailable or unpublished'
   using errcode='23514';
 end if;
 insert into public.character_positions(character_id,location_id)
 values(new.id,v_start);
 insert into public.character_location_discoveries(character_id,location_id)
 values(new.id,v_start) on conflict do nothing;
 return new;
end $$;
