# Starting and later talent choices

The captain wizard has a Talents step before the ship selection. Each available published species/class tree requires exactly one level-1 root choice. Changing species/class clears both selections. Trees not authored yet retain their reserved point for later use.

Each node costs one point, can be learned once, and requires its `min_level` plus **all** incoming prerequisite nodes. Level 1 provides one reserved species point and one reserved class point. Later levels provide one shared point per level; no XP curve or skill-point budget is changed. Existing characters receive the same reserved choices. Existing legacy talent spending is deducted from the shared pool; both learning endpoints consume the same authoritative budget.

`get_player_talent_trees` exposes published content for creation, or the authenticated captain's own trees after creation. `create_captain_with_talents` creates the captain and both choices atomically. The old creation RPC cannot bypass required choices. `learn_talent_tree_node` locks the character progress and tree, verifies revision, ownership, level, prerequisites, publication and points, then stores a reward snapshot. Active battles/challenges block learning. Players cannot directly mutate learned rows. Snapshots preserve learned passive rewards when authors edit a tree; a removed node is no longer offered, but its reward remains. There is no respec.

Selected powers persist in `character_powers` and appear in combat. Passive effects join the combat actor's effects. Passive skill/attribute bonuses also participate in action and skill-challenge dice pools without rewriting base stats. Draft-only damage modifiers remain explicitly unavailable for learning until their evaluator is implemented. Existing starter power grants and legacy talent ranks remain compatible.

The editor now stores `min_level`. Human/Mercenary authored content is activated by stable content keys during the migration. Other drafts remain drafts. The browser player view presents levels in rows and the three branches in columns; prerequisite names and point balances are visible.

## Verification

- `npm run build`.
- `supabase/tests/talent_tree_learning.sql`: linked real PostgreSQL test, all writes rolled back; atomic creation, missing/wrong choices, two reserved starters, level 2/3 either-tree spending, duplicate/overspend/level/revision rejection, real rewards, RLS and execute grants.
- `tools/qa/talent-learning-browser.mjs`: actual CharacterPage and PlayerTalents with a controlled API boundary fixture; both choices required, state preserved across wizard steps and atomic RPC payload. CI runs Chromium and Firefox. This browser fixture is not a production database test.

## Release order

Migration `20261022162724_talent_tree_learning.sql` must be applied together with the frontend release. It changes the old creation contract for published trees, so do not apply it alone while the old wizard is live. It has been tested against the linked schema in a rollback transaction; no permanent schema change is made until release. Then deploy the same tested frontend commit, check published trees and create a test captain in the intended environment. Do not merge the stacked branches implicitly.
