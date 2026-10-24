# Aktuális fejlesztési szerződés — HV-070

A négyfős, actoronkénti Loadout implementációja és pontos kiadási/QA állapota: [TEAM_LOADOUT.md](expedition/TEAM_LOADOUT.md). A HV-063 alábbi leírása történeti; a régi két-crew-s és captain-only írási útvonalat az új migráció lezárja. HV-070 még nincs élesítve.

# Expedition loadout (HV-063)

Loadout is a separate player navigation tab with Equipment, Companions and Powers. Equipment uses the existing authoritative captain and crew equipment records and the inventory slot persistence from HV-062. Only the two saved companions are shown beside the captain; the complete crew remains available in Companions. Cargo now opens crafting, with inventory handled under Loadout.

A captain may prepare zero to five distinct, currently available active powers, including basic attacks. Order is stored per character and used by combat snapshots. Passive effects are unchanged. Characters without an explicit loadout use the first five active powers ordered by slug. Learning a power does not automatically replace a saved loadout slot. Unavailable saved powers cannot be used and must be replaced/removed. Loadout changes apply to newly started encounters; real active encounters lock changes to prepared powers, companion selection and equipment.

The combat action bar has five slots. End turn remains a separate action. Official pinned lucide-react components provide game and editor navigation icons.

This is preparation and existing combat integration; multi-actor salvage encounters remain the separate HV-045/HV-035/HV-036 work.

Validation: TypeScript/Vite build; browser test for five slots, replacement, save/reload and three viewport sizes; linked SQL rollback regression verifies order, empty selection, duplicates, six powers and unlearned powers. Run supabase/tests/expedition_loadout.sql against a migrated test database containing a captain with at least three available powers.

Release order: HV-062 inventory slot migration, then expedition_loadout migration, then application deployment. Neither migration is deployed by implementation alone.
