-- Határvilág HD-v4: replace low-resolution shared atlas references with per-image R2 objects.
-- Original source assets are used: ~245px skills, ~400px attributes, 1448px ships.
UPDATE public.game_skills
SET icon_path = 'hatarvilag/skills/' || slug || '-hd-v4.avif'
WHERE icon_path = 'hatarvilag/art/game-atlas-v3.avif'
   OR icon_path = 'hatarvilag/skills/story-atlas.webp'
   OR icon_path = 'hatarvilag/skills/' || slug || '.jpg';

UPDATE public.game_starter_ships
SET image_path = 'hatarvilag/ships/' || slug || '-hd-v4.avif'
WHERE image_path = 'hatarvilag/art/game-atlas-v3.avif'
   OR image_path = 'hatarvilag/skills/story-atlas.webp'
   OR image_path IS NULL;
