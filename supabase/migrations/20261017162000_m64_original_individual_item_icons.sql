-- M64: Replace cropped collage icons with twenty individually illustrated WebP assets.
-- Original image content is generated per item, 160x160; Cloudflare R2 upload verified first.
update public.game_items
set image_path='hatarvilag/items/'||slug||'-v3.webp'
where slug in (
 'alloy_scrap','captain_backpack','captain_belt','captain_medkit','captain_relic',
 'captain_rifle','captain_sidearm','captain_toolkit','captain_vest','circuit_core',
 'crew_armor','crew_utility','crew_weapon','emergency_patch','encrypted_fragments',
 'field_scanner','plasma_cell','polymer_fiber','stellar_charts','trade_seals'
);
