# Határvilág art release — reborn (2026-10-18)

Baseline: `e754803ef57f48d529d95cf2db34e1f227797a9e`, `indarkbatta/kaosz_galaktika`.

## Scope and art system

Full replacement of the active image catalog, without using old images as visual references. 72 independently generated assets: 20 item icons, 25 skills, 7 species, 7 classes, 5 attributes, 3 ships, 1 captain portrait, 1 login background, 1 crest and 2 paperdolls. The cantina reuses species portraits; there is no separate crew portrait catalog. Sector locations, links, controls, slot labels and panels are code/CSS graphics, not an undiscovered raster catalog. Functional map links and Lucide controls remain code graphics. Decorative red UI accents have been changed to bronze/amber without layout changes.

Dark European comic-book science fiction: confident outlines, painterly weathered steel, dark petrol fabric, muted bronze, graphite shadows and controlled amber/cyan light. Alien relics use restrained sick-green accents. No old image crops, atlases, stock substitutions or composite icon sheets were used as production assets.

## Storage and naming

Bucket `voidnoir`, public origin `https://assets.voidnoir.net`. Canonical keys: `hatarvilag/<category>/reborn/<slug>.webp`. Skill keys are `hatarvilag/skills/reborn-<slug>.webp` because the existing database check permits only flat filenames under skills. No database constraint was weakened.

The full dimensions, byte counts and hashes are in `art-reborn-manifest.json`. Items are uniformly 256×256; skill/attribute art is 512×512; portraits are 768×1152; ships 1440×1080; paperdolls fit within 512×1536 with their alpha preserved; login art retains its original 1672×941 resolution. No upscaling was used. Total production WebP size: 7,684,366 bytes.

## Integration and validation

`App.tsx`, `CharacterPage.tsx`, `EquipmentInventory.tsx` and `components/GameArt.tsx` use the new standalone art. Old runtime atlas fallback code and the old SVG paperdoll were removed. The item editor example uses the canonical naming pattern. CSS retains the existing slot dimensions and uses `object-fit: contain` for the figures.

`supabase/scripts/art_reborn.sql` is a data-only, guarded, atomic update for 62 catalog image fields. It is idempotent for this release and aborts if a catalog entry has been changed by someone else. `art-reborn-db-before.json` records the exact old paths for rollback. No schema or auth/RLS change was required; immutable historical migration files were preserved.

All 72 local WebPs were decoded and visually reviewed together. Three zero-length exports were detected and re-exported before catalog activation. Every uploaded production object was checked against local byte count and MD5/ETag; evidence is in `art-reborn-r2-checks.json`. The release inventory was independently listed from R2 to check missing and mismatching objects. TypeScript and Vite production builds passed. `scripts/verify-art.mjs` provides an independent public-origin SHA-256 audit for an environment with working outbound access.

Local browser verification was blocked: the installed Playwright package had no Chromium executable, and its browser download returned invalid/truncated archives. No authenticated inventory/drag-and-drop end-to-end pass is claimed. Visual asset review and build verification are complete.

## Retention and cleanup policy

The immediately preceding active set of 70 objects is intentionally retained to support rollback of the previous frontend and catalog snapshot. It is not selected by the new runtime. Older duplicate item-v2 files, old JPG skill icons, discarded atlases/story sheets and the first login placeholder are obsolete. The temporary nested skills staging directory is obsolete after the flat canonical keys were verified. These obsolete objects can be removed after deployment verification. The prior HD-v4 manifest is retained only with that rollback set. Historical documentation records past work and is not a current runtime asset manifest.

Deployment result and final cleanup counts are recorded in the release completion note after publication.
