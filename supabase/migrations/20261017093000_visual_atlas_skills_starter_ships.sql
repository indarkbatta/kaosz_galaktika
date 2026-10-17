-- Határvilág M1.3 artwork atlas: 5 columns by 7 rows, 25 skills, five attributes, three starter ships.
update public.game_skills set icon_path='hatarvilag/skills/story-atlas.webp'
where icon_path is null or icon_path='hatarvilag/skills/'||slug||'.jpg';
update public.game_starter_ships set image_path='hatarvilag/skills/story-atlas.webp'
where slug in ('vagabond','sparrow','bastion') and image_path is null;
