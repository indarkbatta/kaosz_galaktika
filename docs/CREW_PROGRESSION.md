# Simplified crew — HV-061

Crew use independent `game_crew_classes`, not captain classes or talent trees. Existing captain-class references remain portrait metadata. Existing crew IDs, names, portraits, equipment and ship-station bonuses are retained. The migration assigns a crew class by specialty; template selection overrides this for future recruits.

## Rules

- Level 1–50; XP threshold for level L: `100 * (L-1) * L / 2` (0, 100, 300, 600…). XP is retained at the cap.
- Each class has HP, attack pips, a single passive defense target number, and a damage bonus. Each grows as `base + floor((level-1)*growth)`.
- Damage = equipped weapon pips (or 3 unarmed) + class damage bonus. Attack equipment modifiers apply through the class's selected attack skill.
- Species and class skill bonuses add together, each with its own floored per-level growth. These are bonuses, not captain attribute pools.
- Equipment uses existing `game_item_combat` definitions: weapon pips, skill modifiers and damage resistances. All attribute-specific defense modifiers map to the single crew target number; existing group/strongest stacking rules apply. Attribute modifiers do not apply because crew have no captain attributes. Combat damage/healing effect definitions are powers, not passive bonuses.
- Initial six classes and their values are editable balance defaults. Medic starts with an Endurance bonus because no medical skill exists in the current 25-slot catalog; editors can change it. No new medical skill or healing action is silently added.
- `private.award_crew_xp(character, crew_ids, amount, event)` is internal only; no player EXECUTE grant. It validates ownership, locks the captain/crew, and deduplicates each event/member grant. Reusing an event with a different amount is rejected. No automatic XP source is introduced; future encounter rewards call this function.

## Editors / UI

Characters → Crew classes: general settings, growth, skill bonuses and HU/EN descriptions. Growth preview supports levels 1–50. Species bonus mode is separate, with its own concurrent-edit token. Class saves use optimistic revisions. Skills are paginated, five per page; records five per page. No new art is generated.

Crew templates: independent crew class selector; old captain-class selector explicitly labeled portrait class. Existing portrait set matching is preserved.

Game → Combat → Crew: three cards per page; combat stats and paginated skill bonuses. A captain can save zero, one or two distinct owned companions. Save is rejected during an active real combat. Foreign crew and duplicate IDs are rejected server-side. Crew dismissal removes the party membership through FK cascade.

## Scope / next steps

The saved party is a preparation roster, not an active salvage run. Existing combat remains 1v1: crew turns, crew health persistence, challenge actor selection and room traversal belong to HV-045/HV-035/HV-036. These must snapshot/lock the party and equipment at run start and use crew XP rewards on completion. No claim that current encounters already use the crew.

## Release

Apply `20261023124155_simplified_crew_progression.sql` with the frontend. The migration is not automatically applied by a source commit. No production release until requested.
