# Határvilág character combat — M82–M87

## What is delivered

A real server-authoritative, turn-based captain-versus-one-enemy PvE slice, integrated into the existing dashboard's **Harc / Combat** tab. Power, Talent and Enemy/Combat editors reuse EditorFrame, EditorNavigation and EditorTabs. Item Editor's **Harci statok** tab saves combat metadata in the same transaction as the existing item, manufacturer, translations and recipe.

The base is M81 (`c8cb76a`), not the older main branch. PR #9 targets `feature/galaxy-quadrant-sector-locations` (PR #8's branch). No main merge and no Vercel publishing are performed by this work.

## Reference and adaptations

DarkPlanet `indarkbatta/darkside/main` GAME_VISION.md, DEVELOPMENT_PLAN.md, ARCHITECTURE, DEVELOPMENT, HANDOFF and its recursive source/migration inventory were inspected. That repository currently contains the M3 expedition slice, not the detailed October 4 combat engine. The supplied handoff and recovered original discussion supply the combat decisions; this implementation does not pretend to reuse nonexistent combat code.

Preserved: Határvilág's 25 existing skills/UUIDs, five attributes, character creation values, base pip snapshots, skill upgrade points, equipment/inventory/recipes, world, factions and manufacturers. There is one SQL rule engine; React never rolls a combat result or evaluates author-supplied code.

* Three pips are one die. Attack skill pools inherit attributes, initial skill bonuses, earned upgrades, passive modifiers and injuries.
* Initiative once per fight: level D6, plain; monster adds flat Danger. Ties favor the controlled captain. The order stays fixed.
* Player skill attacks explode each die on six, with unlimited continuation chains. Plain initiative, Defense, damage, healing, ongoing effects and all monster rolls never explode. Existing Activity/Challenge Space D6 Wild Die rules remain unchanged. Combat does not silently add the Wild-1 penalty to the distinct DarkPlanet attack mode.
* Hit requires Attack **strictly greater** than Defense. Separate authoritative attack and Defense events are recorded.
* Basic attack is a power. One active power or wait advances one own turn. Cooldown 1 is ready on the next own turn; cooldown 3 becomes available three own turns after use. Misses consume cooldown/use count.
* A battle limit resets each battle. An operation limit persists in `combat_operations` across encounters and retreats. Explicit return at Frontier Station ends the operation. This is a synchronous operation context, not an implementation of the planned asynchronous eight-hour expeditions.
* Defense is independent of base attributes. Species and class each have exactly 1 primary, 2 secondary, 2 tertiary category; their contributions add. Provisional editable curves (pips): primary `3 + 2*(rank-1)`, secondary `2 + (rank-1)`, tertiary `1 + (rank-1)`. Original numeric curves were not found. Monster authored Defense codes are separate from human progression; Danger adds one combat pip per point, and a flat point to initiative.
* Max Health = sum of each base attribute's complete dice + species-rank HP + class-rank HP. The recovered Human 5 HP/rank and Psion 4 HP/rank are applied to Ember and Pszion. Other profiles use explicit, editable provisional defaults.
* Formula data supports `dice`, `pips`, `weapon`, `attribute`, `attribute_scale`. Constants are expressed as canonical D6 pips; `[W]` reads the equipped main weapon, then sidearm, otherwise 1D unarmed. Item Tier is metadata from 1–5. `damage_types: ["weapon"]` uses the equipped weapon's types.
* Thirteen concrete damage types: kinetic, heat, cold, electric, radiation, sonic, psionic, soul, vacuum, void, acid, biological, poison. No type automatically adds a status.
* Positive SFE reduces the damage **code in pips before one plain roll**; negative SFE is vulnerability. All armor/profile/passive contributions combine once. Hybrid damage uses the minimum relevant SFE and one shared roll. Example: 4D − (1D+1) = 2D+2. Fully blocked damage is zero; there is no soak roll or minimum damage.
* A hit reducing positive Health to zero does not immediately inflict an attribute injury. Subsequent positive-damage effects at zero inflict exactly 3 injury pips on the targeted Defense attribute; zero damage does not. Reaching zero effective attribute causes extraction/defeat. Health and injuries persist between battles.
* Recovery at Frontier Station costs 8 energy by default. Injury recovery additionally waits 8 energy ticks, snapshotted as a server deadline when injured combat ends. Healing powers restore Health, not injury penalties. Both recovery settings are editable. Returning without recovery does not heal.
* Modifiers use the same evaluator for talents, passive powers, gear and active statuses. Across groups they add; within the same group/stat/key/sign the strongest magnitude applies. A weaker timed effect cannot refresh a stronger one. Ongoing effects use strongest formula code within their group/type. Timed effects age after their affected actor's own turn; self-effects are not consumed on the activation turn. Cleanse removes matching timed groups, never permanent passives.

## Progression

Species and class each start at rank 1. Each character level beyond 1 supplies one separate talent point. Learning a passive talent consumes that derived point, increments its own rank and advances the corresponding species/class branch rank. Server validation checks owner, published talent, matching tree, prerequisites, maximum rank and expected owned rank under the common progress lock. Skill upgrade points are unchanged. Prerequisite cycles and cross-tree prerequisites are rejected.

## Starting content

* Five basic attacks reference the five existing combat skills.
* One signature and one passive Resolve talent per existing species: Ember, Ferron, Noxari, Voxan, Vektorita, Karszid, Mycelion.
* One signature and one passive Resolve talent per existing class: Mérnök, Navigátor, Hangkovács, Hadúr, Árnyügynök, Felderítő, Pszion.
* Two additional enemy powers, for a total of **21 powers, 14 talents and 14 Defense profiles**.
* **Ócskavas őrszem**: aggressive basic attacks. **Javítódrón**: healing priority when below half Health. **Jelvisszhang**: disruptive psionic attack/Defense debuff priority.
* Three published training encounters at `frontier_station`, initially 2 energy each, XP rewards configurable. Any existing item can be selected as an enemy reward.
* Only five existing equippable samples receive stats: `captain_rifle`, `captain_sidearm`, `captain_vest`, `crew_weapon`, `crew_armor`. Weapons 2D; armor kinetic 2 pips/heat 1 pip. No Excel items are assumed imported. Existing character possessions are not replaced or auto-equipped.
* Existing R2 art is reused; no new paid asset generation or upload is implied.

## Player route

On the branch's frontend: create/use an existing captain, equip a weapon through the existing Cargo paperdoll, travel to Frontier Station, open **Harc → Összecsapások**, start a training encounter, choose a power, inspect actual dice/results, then Continue. The result header stays on the resolved action's round while reviewing. Reload restores the latest result. The combat history reads all immutable events. Defeat/retreat preserve injuries; return/recover at the station as needed. **Harc → Talentek** spends the separate species/class growth points after leveling.

## Editors and simulation

* Power: metadata/art, multiple source grants, level/rank requirements, active/passive type, cooldown and battle/operation limits, target/range/count, combat skill/Defense, structured formulas/types/effects, locale dictionary, saved-power test preview.
* Talent: species/class tree, ranks, prerequisites, passive effects, locale dictionary.
* Enemy/Combat: enemy stats, resistances, powers, behavior, XP/item rewards; local encounters; species/class Defense and HP profiles; global curves/recovery/round limit.
* Item: optional Tier, weapon code/types, thirteen SFE values, passive modifiers, integrated atomic item save. The existing item detail/tooltip receives actual combat stats through storage/crafting data.
* Simulation can select two authored enemies, a captain or a sample attacker. A saved power, including a draft, can be tested without granting it to the real character. Both paths call the same combat resolver. Simulation writes only simulation runs/events; it cannot deduct real energy, alter real Health/injuries, award XP/items or spend talents. An editor without a captain can still simulate.

## Security and storage

Gameplay tables: character_combat_progress, character_talents, character_powers, combat_operations, combat_runs, combat_events, combat_commands, combat_start_requests. Owner SELECT only; no direct player mutation. Content is editor/admin-RLS protected; published item combat metadata is player-readable.

Public narrow invoker APIs: get_combat_state, begin_combat, start_combat (legacy-compatible active-run guard), combat_action, retreat_combat, return_from_combat, learn_combat_talent, get_combat_editor_catalog, save_combat_content, simulate_combat, simulate_power, save_game_item_with_combat. Internal private definers authorize auth.uid and real role records, use empty search_path and explicit grants. No service credential exists in client code.

Progress is locked before live run mutation. Commands check run ownership, active status, expected revision and request UUID. Repeated action requests return the committed response; start request UUIDs cannot create another battle after the first has completed. A partial unique index enforces one active live battle per captain. Equipment/location changes during combat are blocked under the same lock. Rewards commit atomically and once. Active runs snapshot combatants/powers; later editor changes do not alter that run.

Events are append-only to browser roles. State and command responses contain the latest command's event chunk with globally increasing sequence numbers, while full history remains in combat_events; this avoids repeatedly copying an ever-growing history into each response. Authoring uses atomic saves and expected revisions, including encounter revisions. Enemy power references prevent invalid deletions/unpublishing.

## Deliberate first-slice limits

This is captain-versus-one-enemy character combat, not full crew/group or ship combat. Range and target-count authoring provide future metadata; the current duel arena has one opponent and no positional grid. Ship AI levels, slots and floppy powers are untouched. Full asynchronous expeditions and faction reputation power unlocks are later integrations; existing operation/source-grant models reserve their boundaries. Legacy species resistance metadata is preserved rather than guessing a conversion into the new pip-based SFE profiles. Numerical defaults and starting signatures need play balancing; they are editable and not represented as recovered exact DarkPlanet curves.
