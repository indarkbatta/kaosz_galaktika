# Visual UI editor — HV-065

Editor → System → Felületszerkesztő edits the Loadout equipment screen using the real inventory components and a read-only sample. Game inventory contents, equipment rules and dynamic values remain server controlled.

Select elements in the hierarchy or canvas. Drag or resize handles; optionally snap to an 8 px grid. Shift-select siblings or assign a shared group. Arrow keys nudge; Shift increases the step. Undo/redo keeps 50 changes. Desktop and laptop profiles store relative positions independently. Panel visibility, locks, layers, inventory columns/cell size, HU/EN labels, type and artwork can be configured. Extra image/text panels are supported.

Save writes an editor-only draft. Publish atomically saves and exposes that snapshot to authenticated players. Restore previous published version reverses publication. Revision checks prevent concurrent overwrites. New sessions load published configuration; missing configuration preserves the built-in layout. The first scope is equipment; party and powers tabs retain their existing layout.

Migration: `20261023164315_visual_ui_layout_editor.sql`. Apply before deploying the editor. Private layout/history tables have RLS and no player table access. RPCs require editor authorization; players can only fetch the published document. Server validates node identifiers, geometry and image paths. Artwork uploads are immutable, editor-only, at most 1 MB, restricted to PNG/JPEG/WebP/AVIF; published artwork is public. Reset does not delete uploaded files.

Verification: production build, isolated PostgreSQL authorization/publication tests, real React → HTTP → PostgreSQL browser tests (drag, resize, undo, image upload policy, save/reload, publish, restore; 1920×1080, 1366×768, 1280×720). The editor deliberately permits overlapping elements. Small mobile layouts and other game screens are outside this first scope.
