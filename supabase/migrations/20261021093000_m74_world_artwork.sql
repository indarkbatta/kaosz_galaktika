-- M74: one Cloudflare R2 artwork field on each world-model layer.
-- Keep existing row IDs and all navigation/travel data untouched.
-- Store bucket-relative keys, never arbitrary image hosts or HTML/SVG.
alter table public.game_galaxies add column image_path text;
alter table public.game_quadrants add column image_path text;
alter table public.game_sectors add column image_path text;
alter table public.game_locations add column image_path text;

alter table public.game_galaxies add constraint game_galaxies_image_path_check
 check(image_path is null or (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$'));
alter table public.game_quadrants add constraint game_quadrants_image_path_check
 check(image_path is null or (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$'));
alter table public.game_sectors add constraint game_sectors_image_path_check
 check(image_path is null or (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$'));
alter table public.game_locations add constraint game_locations_image_path_check
 check(image_path is null or (length(image_path)<=300 and image_path ~ '^hatarvilag(/[a-z0-9_-]+)+\.(webp|avif|png|jpg|jpeg)$'));