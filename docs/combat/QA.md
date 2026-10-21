# Combat QA evidence

## Automated

`tools/qa/combat-database.mjs` replays M82/M83/M84/M86/M87 against isolated PGlite PostgreSQL with deterministic fixture RNG. It verifies:

1. Real success/miss and strict Attack/Defense ties; initiative ties favor captain.
2. Multiple exploding sixes and non-exploding plain, healing and ongoing rolls.
3. Pip SFE subtraction, minimum hybrid SFE, zero damage and no zero-damage injury.
4. Post-zero-Health 3-pip injuries and zero-attribute extraction.
5. Strongest modifiers preserve potency/duration, ongoing ticks expire, cleanse preserves passives.
6. Actor cooldown gates, actual operation counters across retreat/new encounters, reset only on explicit return.
7. One active action under duplicate/replayed/stale and two queued competing submissions.
8. Immutable authoritative attack/Defense events and complete rewarded PvE battle.
9. Talent rank/Health progression without spending skill points; rank replay blocked.
10. Enemy-versus-enemy simulation and saved draft power preview without real rewards.
11. Structured definition rejection, Power/Profile/Rule/Encounter save/revision behavior.
12. Editor authorization, own-run RLS, forbidden player mutations and anonymous denial.

`tools/qa/combat-browser.mjs` runs the real React components → local HTTP adapter → the actual combat SQL functions in Chromium and Firefox. It exercises Power/Talent/Enemy/Item editing, bilingual names, source grant, complete reload, two-participant simulation, same-action result/round display and Continue gate, full rewarded PvE, history, separate talent learning and English UI. The old precombat item saver is a boundary fixture; the new combat stat transaction is real. Its integration with the actual existing item saver is separately verified below.

Existing regressions: tools/qa/bridge-database.mjs, energy-database.mjs, and the existing Challenge/Faction browser workflows. CI workflow: `.github/workflows/combat.yml`.

First core commit `61ea29c405990cee5747dbab9cbbd756e994d583`: [Chromium + Firefox, SQL and legacy regressions SUCCESS](https://github.com/indarkbatta/kaosz_galaktika/actions/runs/39649857370), [build SUCCESS](https://github.com/indarkbatta/kaosz_galaktika/actions/runs/39649857198). Final follow-up checks are linked on [PR #9](https://github.com/indarkbatta/kaosz_galaktika/pull/9).

## Actual linked PostgreSQL integration

`supabase/tests/character_combat.sql` creates temporary Auth users and content in BEGIN/ROLLBACK, uses the real authenticated role, actual create_captain, actual existing full item/manufacturer saver plus M85, actual live combat RPCs and secure RNG. It verifies item-stat save and full metadata rollback on invalid stats, captain/encounter start energy, duplicate start, action request replay, an end-to-end victory and exactly-once XP, actual attack/Defense events, simulation preserving character_progress, foreign-owner denial and grants. Executed successfully on the linked project; the entire transaction is rolled back. No real captain is edited for testing and no QA account/content persists.

M82–M87 migrations are forward-only; no resets or player-data deletion. Readback confirms 21 powers, 14 talents, 14 profiles, 3 enemies, 3 encounters and 5 configured sample items. Security advisor found no new issue; the preexisting Auth password-protection configuration warning is unrelated.

## Limits of this evidence

The browser tests use an isolated HTTP/database adapter, not a signed-in real-user session against the deployed app. SQL live integration uses actual Postgres authorization/functions in a rollback transaction. Two competing test submissions run through a queued single PGlite connection; the production row-lock order and revision guards are inspected, but cross-connection production load testing is not claimed. No Vercel publication was authorized, so there is no new live frontend URL. No crew/group/ship combat or asynchronous expedition test is claimed.
