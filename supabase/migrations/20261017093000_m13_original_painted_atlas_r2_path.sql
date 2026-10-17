-- Határvilág M1.3: assistant-created and R2-hosted painted art atlas.
-- Original 25 skill scenes + 5 attribute portraits + 3 painted spaceships.
ALTER TABLE public.game_skills DROP CONSTRAINT IF EXISTS game_skills_icon_path_check;
ALTER TABLE public.game_skills ADD CONSTRAINT game_skills_icon_path_check
  CHECK (icon_path IS NULL OR icon_path ~ '^hatarvilag/(skills|art)/[a-z0-9_-]+[.](webp|png|jpg|avif)$');
UPDATE public.game_skills
 SET icon_path = 'hatarvilag/art/game-atlas-v3.avif'
 WHERE icon_path = 'hatarvilag/skills/story-atlas.webp'
    OR icon_path = 'hatarvilag/skills/' || slug || '.jpg';
