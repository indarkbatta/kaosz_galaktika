# Külön személyes készlet és hajóraktér

Az elfogadott látványterv alapján a raktér képernyő három része: felszerelés, személyes készlet és hajóraktér. A felszerelési helyek és a tárolócellák közös négyzetméretet használnak, a tárolórács mindkét irányban 2 px hézaggal. A teljes alakos kapitánygrafika külön, átlátszó WebP asset, a feliratok HU/EN szövegek.

## Tárolási szabályok

- A személyes készlet alapja 6 különböző tárgyat tartalmazó stack; a felszerelt kapitányi hátizsák kizárólag ezt bővíti.
- A meglévő `character_inventory` marad a hajóraktér. Kapacitása a hajó saját raktere és felszerelt raktérmoduljai alapján számolódik.
- Az új `character_personal_inventory` külön, tulajdonoshoz kötött tároló. A migráció nem mozgatja és nem törli a korábbi készletet.
- Áthúzás egész stacket mozgat; kijelölés után a mennyiségmezővel részleges áthelyezés is lehetséges. Mindkét tárolóból lehet felszerelni, és mindkettőbe lehet levenni tárgyat.
- A kapacitásellenőrzés szerveroldali és tranzakciós. A túlcsorduló hátizsák levétele/cseréje és a foglalt kapacitás szerkesztőből történő csökkentése visszagördül.
- A gyártás és a játék során szerzett zsákmány továbbra is a hajóraktér készletét használja.
- A meglévő `set_equipment` RPC kompatibilis marad; alapértelmezett forrása/célja a hajóraktér.

## Ellenőrzés

- `npm run build`: sikeres TypeScript-ellenőrzés és Vite production build.
- `supabase/tests/separate_inventories.sql`: valódi authenticated RPC-k, ideiglenes karakterekkel, teljes BEGIN/ROLLBACK tranzakcióban. Ellenőrzi a 6 alaphelyet, a hátizsák kizárólag személyes bónuszát, a túlcsordulás visszagörgetését, a két tárolóból felszerelést, részleges stacket és összevonást, tárgymennyiség-megőrzést, közvetlen írás tiltását, másik tulajdonos RLS/RPC izolációját, valamint az editor kapacitáscsökkentési védelmét.
- Böngészős mérés a valódi komponensen, külön read-only fixture-ben: 1295 px széles komponensnél minden cella 54,5×54,5 px; 652 px szélességnél 43×43 px. Minden rácsköz 2 px; a három panel egyikénél sincs belső túlcsordulás. Keskeny nézetben 25, nagy nézetben 40 hajóraktércella/lap. Kijelölés, mennyiségmező és lapozás működik.
- A fixture nem bejelentkezett végponttól végpontig teszt: az adatbázis-műveleteket a külön SQL regresszió igazolja. `initialData` esetén nincs RPC-írás; az App nem ad át tesztadatot.
- Reprodukció: `node tools/qa/build-inventory-preview.mjs /tmp/inventory-preview.html [szélesség]`. A fixture csak nyilvános játéktárgyakat tartalmaz. Képernyőkép: `docs/inventory-preview-20261020.jpg`.

## Kiadási állapot

A `20261020175313_separate_personal_and_ship_inventory.sql` migráció alkalmazva a kapcsolt adatbázison. A frontend külön `feature/separate-inventories` ágon készül, a hajószerkesztő ágára építve. A production kiadás külön publikálási lépés. Az automatikus Vercel-telepítés továbbra is kikapcsolva marad.
