# Character combat adaptation — 2026-10-21

Base: c8cb76a (M81), feature/character-combat-powers. Main was inspected; it lacks the later working inventory/editor/world changes, so development builds on the working feature branch. No Vercel deployment is authorized by this handoff.

Reference read: darkside/main GAME_VISION.md, DEVELOPMENT_PLAN.md, docs/ARCHITECTURE.md, docs/DEVELOPMENT.md, HANDOFF.md and recursive source/migration/test inventory. That repository implements M3 asynchronous expeditions, not the October 4 detailed combat system. Original conversation retrieval confirms: species and class Defense pools add; SFE subtracts pip codes before a shared hybrid roll (4D−1D+1 = 2D+2); monster initiative adds flat Danger, combat pools add Danger; HP0 hits inflict 3 attribute pips until a targeted attribute reaches zero. Exact curve numbers were not recovered and will be explicitly provisional editable defaults.

Implementation order:
1. Content tables, strict effect/formula validators, shared SQL dice/effect rules.
2. Character growth, source grants, equipment combat stats and persistent health/injuries.
3. Stateful transactional PvE commands, immutable logs, concurrency/idempotency, shared editor simulation.
4. Shared-template Power/Talent/Enemy editors, combat statistics and profile configuration.
5. Integrated playable captain-vs-enemy screen and talent choices; representative content for every existing species/class and three enemies.
6. Deterministic PostgreSQL, browser/API and existing regression tests; migrations, commits, documentation.

Rule decisions: existing Activity/Challenge Wild Die remains unchanged. New player combat skill attacks use exploding chains on EACH die, as the retrieved DarkPlanet rule requires; no Wild-1 cancellation is silently added to that distinct roll mode. Other combat rolls are plain. All dice use existing private.secure_d6. Formula is structured data (weapon multiplier, D6 count, pip bonus, attribute coefficient); no executable text. Defense and modifiers use pips. Different effect groups stack additively; within one group and stat only strongest absolute magnitude survives, positive and negative separately; weaker applications do not refresh stronger duration. Durations count affected actor turns; damage-over-time and healing do not explode. Passive talents and powers use the same modifier evaluator.

Expedition foundation: combat operation context stores expedition-limited power use across chained encounters. The first release exposes a standalone operation with an explicit return-to-base command, and never treats each encounter as a new expedition. No asynchronous expedition system or ship AI is implied.
