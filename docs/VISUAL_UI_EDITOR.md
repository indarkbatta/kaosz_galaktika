# Visual UI editor — HV-065

Editor → System → Felületszerkesztő edits the Loadout equipment screen using the real inventory components and a read-only sample. Game inventory contents, equipment rules and dynamic values remain server controlled.

Select elements in the hierarchy or canvas. Drag or resize handles; optionally snap to an 8 px grid. Shift-select siblings or assign a shared group. Arrow keys nudge; Shift increases the step. Undo/redo keeps 50 changes. Desktop and laptop profiles store relative positions independently. Panel visibility, locks, layers, inventory columns/cell size, HU/EN labels, type and artwork can be configured. Extra image/text panels are supported.

Save writes an editor-only draft. Publish atomically saves and exposes that snapshot to authenticated players. Restore previous published version reverses publication. Revision checks prevent concurrent overwrites. New sessions load published configuration; missing configuration preserves the built-in layout. The first scope is equipment; party and powers tabs retain their existing layout.

Migration: `20261023164315_visual_ui_layout_editor.sql`. Apply before deploying the editor. Private layout/history tables have RLS and no player table access. RPCs require editor authorization; players can only fetch the published document. Server validates node identifiers, geometry and image paths. Artwork uploads are immutable, editor-only, at most 1 MB, restricted to PNG/JPEG/WebP/AVIF; published artwork is public. Reset does not delete uploaded files.

Verification: production build, isolated PostgreSQL authorization/publication tests, real React → HTTP → PostgreSQL browser tests (drag, resize, undo, image upload policy, save/reload, publish, restore; 1920×1080, 1366×768, 1280×720). The editor deliberately permits overlapping elements. Small mobile layouts and other game screens are outside this first scope.

## Editor/game size parity fix

The editor and game share `layoutSizes` and `layoutProfileForWidth`: desktop is 1200×680, laptop is 960×600; browser viewports below 1400 px select laptop. The editor defaults to Game viewport (automatic), with explicit profile overrides for authoring. Both render the same logical canvas and panel chrome. The game fits the entire canvas uniformly into its available area, preserving aspect ratio, font/icon sizes relative to panels, and container-query behavior. Editor zoom only scales the preview. Editor control styles explicitly exclude the game surface. Existing saved layouts retain their coordinates and do not need a database migration.

The browser test compares editor and player logical geometry (header, tabs, equipment, paperdoll, inventory, cargo, details, equipment slot, inventory grid), typography and automatic profiles at 1920×1080, 1366×768 and 1280×720, with a 1 px tolerance, using the game shell/body/footer around the player surface.

## Outer game frame

On every main game tab, `GamePanelFrame` measures available mount space and the real body padding, shell border and footer. It fits the outer frame directly around the scaled canvas. Edge tabs remain anchored to that frame. All nine main game tabs use identical outer dimensions and the same anchored navigation. Tests assert that Loadout has only the normal 14 px body padding around the canvas at all three desktop sizes, fits the viewport, and asserts identical outer dimensions and no body overflow across all nine main tabs.
