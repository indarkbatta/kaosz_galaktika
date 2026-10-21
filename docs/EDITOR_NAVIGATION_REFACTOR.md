# Editor navigation – grouped menu (2026-10-21)

Implementation branch: `feature/character-combat-powers`.

Six accordion categories appear in the shared `EditorNavigation`. A category only expands/collapses its children. Selecting a child routes to an existing editor. The selected section's group opens automatically on a page change. The sidebar's own scroll area is bounded; the roster and editor content remain in the existing three-column shell.

- Characters: species, classes, skills, crew.
- World: galaxy/quadrants, sectors/locations, factions.
- Equipment & economy: items, ships/modules.
- Gameplay: activities/loot, skill challenges.
- Combat: encounters, enemies, powers, talents, defense profiles, combat rules.
- System: energy/XP global settings (existing GameplayEditor balance tab), dictionary/languages (existing species Editor dictionary/languages tab).

The CombatEditor no longer shows its four-way internal `Combat Content` selector. Each combat kind uses a separate menu route and the existing `get_combat_editor_catalog` / `save_combat_content` RPCs. Existing unsaved-change modal behavior remains in CombatEditor and species/classes Editor; no Supabase schema was changed.

This change does not create independent recipes, ship AI, or dictionary administration pages. The System > Dictionary link currently deep-links into the existing species dictionary tab where languages can be created; it is not a standalone global translation management editor.

Verify on the same branch: `npm ci && npm run build`; browser-test accordion, route switching, and unsaved-change confirmation. No automatic Vercel deployment.
