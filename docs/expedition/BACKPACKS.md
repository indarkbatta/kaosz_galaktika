# Karakterenkénti készlet és hátizsák — HV-079

2026-10-24, felhasználó által megerősített pontosítás: minden teljes expedíciós karakter saját személyes készletet és saját hátizsák-slotokat kap. A felszerelés szabadon átadható. A közös hajóraktér megmarad. Ez felülírja a HV-070 ideiglenes, csak kapitányi készletkapacitását.

## Működés

- A kapitány és minden expedíciós társ saját **6 + a saját felszerelt hátizsákjának kapacitása** helyet használ. A kiválasztott karakter neve, saját tartalma és kapacitása jelenik meg. A hátizsák helyei szükség esetén lapozhatók.
- A felszerelési helyek és a hajóraktér változatlanok. A másik karakter fülére dobott készlettárgy az ő készletébe kerül; a viselt felszerelés ugyanígy levehető és átadható. Tárolócellára dobás megőrzi a célpozíciót. Részmennyiség a meglévő mennyiségmezővel a hajóraktérbe/készletbe mozgatható, a fülre húzás a teljes stacket adja át.
- Azonos tárgy összevonódik a fogadó karakter saját stackjével. Azonos karakter készletében a húzás pozíciócsere, nem tárgymásolás. Felszerelésnél explicit forráskarakterrel másik saját karakter készlete is használható.
- Nincs új faj/kaszt korlátozás. A szolgálati crew nem kap személyes készletet vagy felszerelést.
- A hátizsák levétele, kisebbre cseréje, másik karakterre felszerelt hátizsák átmozgatása és a katalógus kapacitáscsökkentése csak érvényes végállapot mellett lehetséges. Túl sok stack esetén az egész művelet visszagördül, nincs elvesző tárgy. Megmaradó tárgyak a kisebb készletben szabad helyre rendeződnek.

## Adatszerződés

A kapitány meglévő `character_personal_inventory` és `private.inventory_positions` adatai változatlan helyen maradnak. A korábbi közös személyes készlet tartalma továbbra is a kapitánynál található; nincs automatikus szétosztás vagy másolás. A társak új `private.expedition_actor_inventory` táblája actoronként tárol mennyiséget és pozíciót. A migráció a már felszerelt társi hátizsákot azonnal beleszámítja a megfelelő saját kapacitásba; nem kell újra felvenni.

A `get_expedition_storage()` a korábbi captain/cargo mezők mellett `personal_inventories: [{actor_id, capacity, items}]` mezőt ad. A régi olvasók kompatibilisek maradnak. Az új frontend két explicit invoker RPC-t használ:

- `equip_expedition_actor_from(p_actor, p_slot, p_item, p_storage, p_storage_actor, p_position)`
- `transfer_expedition_item(p_item, p_quantity, p_from, p_from_actor, p_to, p_to_actor, p_position, p_slot)`

Minden írás a meglévő saját játékállás/progress lock alatt fut, ellenőrzi mindkét actor tulajdonosát, a forráskészletet, a végállapot kapacitásait és az aktív encounter tiltását. Gearből levételkor az elvárt item UUID is ellenőrzött. A belső készlet-/kapacitássegédek kliensből nem hívhatók; a privát táblának RLS-e és teljes közvetlen kliensjog-tiltása van. A régi gear-adapterek is az összes saját készlet végállapotát ellenőrzik. A deferred kapacitásguard a társkészletre, felszerelésre és hátizsák-katalógusra is kiterjed.

## Ellenőrzés

- `tools/qa/expedition-backpacks-database.mjs`: PASS. Külön 6+12/6/6 kapacitás, tartalom és mentett pozíció; részátadás és stack-összevonás; másik karakter készletéből felszerelés; egzakt darabszámmérleg; megtöltött hátizsák levétel/csere/katalóguscsökkentés rollback; ownership, mennyiség, célslot, encounter, anon/direct-table/direct-helper tiltás.
- `tools/qa/expedition-loadout-browser.mjs`: Chromium PASS, React → HTTP → SQL. Társi hátizsák tényleges felvétele, 18 slot a társnál / 6 a kapitánynál és másik társnál, újratöltés, célhely 14, tárgyátadás társ→társ→kapitány, gear ki/be húzás. HU/EN × 1920×1080, 1366×768 és 1280×720, görgetés nélkül.
- Meglévő HV-070 SQL és UI editor/játék geometria regresszió: PASS. `npm run build`: PASS, a korábbi chunk-size figyelmeztetés megmarad.
- `supabase/tests/expedition_backpacks.sql`: kapcsolt PostgreSQL PASS, tényleges authenticated public RPC-k, külön QA-állással és katalógushivatkozásokkal; minden QA-adat és az új migráció DDL-je ROLLBACK. Nincs éles játékosklón vagy tartós tesztadat.

## Kiadás

**HV-079 éles.** A `20261024112854_expedition_actor_backpacks.sql` migráció alkalmazva. Production `9eadfe9` / `dpl_3hWJS3KLRaGKYSkKxJuaNs2cNK9D` READY, bundle `index-CZNi02xz.js`. Post-release authenticated SQL PASS. Újállás- és konkurenciaellenőrzés: [FRESH_START_QA.md](FRESH_START_QA.md).

Új társi készletírások után egy régi frontend nem mutatná a társak külön készletét: a release utáni visszaállítást ennek megfelelően kell kezelni. A HV-070 valós kétkapcsolatos konkurencia- és HV-069 teljes újállásos E2E-kapuja továbbra is nyitott; a HV-077 többi harci javaslata nem vált elfogadott szabállyá. Helyben Firefox nincs igazolva.
