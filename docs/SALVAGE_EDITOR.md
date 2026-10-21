# Roncskutatás — map and room encounter authoring

Adds **Játékmenet → Roncskutatás / Gameplay → Salvage exploration** to the grouped editor navigation. Based on `fc71a58` of the current combat branch, preserving the editor category refactor and the game's kartoték edge tabs. No player navigation/reward mechanics or Vercel deployment are included in this change.

## Editor

* Map roster/search/new, slug, HU/EN names/descriptions, optional existing world location, grid dimensions 12–128 (default 32×24). Background uses an existing R2 artwork key, is fitted inside the grid with its aspect ratio preserved, and has a persisted 0–100% opacity slider. Background and grid controls are also available in the map tab.
* Rooms snap to whole grid units. Click to place, automatic free-space placement, pointer drag, keyboard arrow movement and numeric position/size fields. Room dimensions 2–128 squares. The selected room has eight side/corner handles for snapped pointer resizing; invalid overlaps roll back the gesture. At most 100 rooms and 300 undirected links.
* Connect tool: select two rooms, or focus each room and press Enter. Reversed/duplicate links cannot be created. Select a passage to delete it; deleting a room also removes its links. Links represent abstract two-way passage connectivity; their orthogonal drawing is not collision-routed corridor geometry or additional room events.
* One entry room. Removing it assigns the next room as entry; the last room cannot be removed.
* One encounter kind per room: empty, loot (0–1,000,000 credits plus up to 30 distinct existing items/quantities), existing skill challenge, existing combat encounter. Changing kind clears incompatible content.
* Independent HU/EN room names/descriptions in the inspector. Content types have distinct colors and icons.
* Fit/zoom controls center on the selected room when changing zoom. The full map remains accessible through Fit. Undo/redo stores up to 30 local edits. Save and document changes reset history. Unsaved navigation has a custom discard dialog and browser unload protection.
* Validation tab lists room summaries and issues. Draft maps may have disconnected rooms. Ready maps require every room reachable from entry and all referenced challenge/combat/enemy/item definitions published. Ready is an authoring status, not deployment or playable availability.
* Shared EditorFrame/Navigation/Tabs; lazy-loaded route. Fixed editor frame, map canvas and an internally scrolling room inspector.

## Persistence and authorization

Migration `20261021195141_salvage_map_editor.sql` adds game_salvage_maps, game_salvage_rooms, game_salvage_connections and game_salvage_room_loot. Normalized foreign keys preserve references to real content. Composite passage foreign keys prevent cross-map links; item and encounter references use delete restriction. All four tables have editor/admin SELECT RLS and no browser INSERT/UPDATE/DELETE grants.

Public invoker RPCs `get_salvage_editor_catalog()` and `save_salvage_map(p_id,p_revision,p_document)` delegate to private functions that explicitly require authenticated editor/admin status, with empty search_path and restricted execute grants. Atomic save locks the map and checks revision, replaces its rooms/links/loot in one transaction and returns the new revision. Any validation/FK failure rolls the entire save back, including revision and deleted children. Plain players cannot read floor plans through these endpoints.

Server checks include integer coordinates, bounds, overlap, exactly one entry, unique room IDs and loot items, valid content kind/reference combinations, positive quantities, no dangling/self/duplicate connections, graph reachability for ready maps and reference publication. A stale editor receives a reload error, preserving its draft for review. There is no client authority to grant loot or start combat/challenge runs.

## Verification

* `npm run build`, `git diff --check`.
* `WORLD_BROWSER_TOOLS=… node tools/qa/salvage-database.mjs`: actual PostgreSQL functions in isolated PGlite; four kinds, exact loot, graph readback, deletion/replacement, revision conflict, 17 invalid updates fully rolled back, draft/ready validation, foreign keys, role/RLS and anonymous denial.
* `WORLD_BROWSER_TOOLS=… node tools/qa/salvage-browser.mjs`: real React → HTTP adapter → actual SQL functions in Chromium/Firefox. Drag snapping, click placement, resize, all room kinds, connection authoring, loot, undo/redo, full browser reload, delete/restore, unsaved navigation guard, stale-editor rejection and HU/EN. Local Chromium passed; CI runs both browsers.
* `supabase/tests/salvage_editor.sql`: executed successfully against the actual linked project, using temporary Auth users and real authenticated editor/player roles. Full map/loot/links readback, overlap rollback, revision conflict, direct-write denial and player rejection. BEGIN/ROLLBACK leaves no QA users/maps behind.
* Security advisor: no new issue; existing leaked-password-protection Auth warning unchanged.

The browser adapter isolates authentication and HTTP transport. It is not a claim of a signed-in production browser test. Player traversal, fog of war, per-run state, energy costs, encounter execution and exactly-once room rewards are future gameplay work; the map content is authored and persistently saved now.

## Background/resize follow-up

Migration `20261021201756_salvage_background_resize.sql` adds optional background_image and background_opacity (default .35), expands bounds to 128 and retains the original graph save validator behind a restricted private wrapper. Background validation failures roll back graph edits/revision too. Old map payloads without these fields preserve existing background values. Browser coverage includes corner resizing/undo and background/opacity/grid-size reload persistence. No external URL is rendered unless it resolves through the existing R2 image-key validation.
