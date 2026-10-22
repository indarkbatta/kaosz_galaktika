# HV-030 — Visual species/class talent tree authoring

Adds **Karakterek → Talentfák / Characters → Talent trees**. Each existing species and class has one independently saved content draft. The shared editor frame and a grid canvas provide placement, snapped pointer/keyboard movement, directed prerequisite links, zoom/fit, node deletion with link cleanup, undo/redo, validation and unsaved-navigation guards.

Nodes have custom R2 artwork, HU/EN name/description and one reward type: passive effects or an existing power. Power artwork is inherited when no node override exists. The shared structured effect fields are reused. A talent-only damage modifier (`type:modifier, stat:damage, key:all`) can be authored; it is draft metadata, with no new damage evaluation added to live combat. Other passives use the existing combat validator. Ready content drafts require configured passive rewards and published power references.

`20261022135604_talent_tree_authoring.sql` adds normalized game_talent_trees, game_talent_tree_nodes and game_talent_tree_edges. Browser roles have editor-only SELECT RLS and no direct mutation. Narrow public invoker RPCs delegate to private, auth/role checked functions with empty search_path. Saves lock the tree, check revision, reject scope reassignment and atomically replace the graph. Composite foreign keys prevent cross-tree links. Bounds, node overlaps, image paths, reward shape, unique references and cycles are checked on the server. A failed save preserves prior graph/revision.

This is the rank-independent authoring layer. Existing character_talents, character_powers, source grants, progression and gameplay remain intact. There are no point costs, level gates, ANY/ALL selection semantics, exclusion groups or character-learning endpoints invented here. Those still depend on the open HV-028 product decisions. A directed link records prerequisite direction; it does not silently choose an ALL/ANY spending rule.

HV-030 was moved to progress and its overbroad dependency on HV-028 removed with a board note. HV-031/032 remain dependent on approved spending/rank rules. No existing talent content or user character is migrated or seeded into the new trees automatically.

Validation: production build; isolated actual PostgreSQL graph/reward/RLS/revision tests; real React → HTTP adapter → SQL browser tests in Chromium/Firefox through the new workflow. Coverage includes images, bilingual text, effect/power references, cycle rejection, snapping, undo/redo, full reload, species/class separation, dirty guard and delete/restore. The fixture transport is not a production signed-in browser session.

No Vercel deployment or main merge is included. Base is the deployed salvage branch at 9cd9c1f, preserving prior editor and kartoték changes.
