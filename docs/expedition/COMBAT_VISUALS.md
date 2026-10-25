# HV-080 — Harci megjelenítés szerkesztése

Felhasználói pontosítás: a clipping pont **illesztési pont**, nem takarási maszk.

Harc → Harci megjelenítés: egy faj–kaszt kombinációhoz legfeljebb 64 rendezett kép, 1–30 FPS és ciklikus előnézet. Képkockánként hozzáadás, törlés és sorrendcsere; közös vászonra igazított, azonos méretű transzparens képek ajánlottak. Ez az első változat egyetlen képsort tárol kombinációnként, nem külön támadás/idle/halál állapotokat.

Tárgyeditor → Harci kép: az inventory képtől független harci kép. Kasztonként egy illesztés: X/Y a közös négyzetes vászon százalékában; tárgyorigó X/Y a tárgy saját képének százalékában; méretarány a vászon szélességéhez képest; forgatás fokban. Pozíció kattintással és numerikus mezőkkel állítható; külön Origó tab. Az előnézeti faj csak a háttérhez kell; a mentett illesztés kaszthoz kötött. A hiányzó illesztés nem tárgyhasználati tiltás.

Külön Megjelenítés mentése gomb. Új tárgyat előbb létre kell hozni. Mentetlen változásokra közös editor-modal figyelmeztet; ablakelhagyáskor beforeunload. Vezérlők: EditorTemplate + editor.css (ed-general-grid és ed-secondary-button); modul CSS kizárólag geometria. Lucide ikonok. Lapozott roster és egyképkockás szerkesztés, nincs hosszú képlista.

Tárolás: game_combat_appearances; game_item_combat_visuals; game_item_combat_anchors. Editor/admin ellenőrzött RPC; közvetlen kliens-táblajog nincs, RLS aktív. Atomi mentés, első létrehozásra is kiterjedő zárolás, revision konfliktus, valódi faj/kaszt/tárgy FK, koordináta/forgatás/skála/FPS ellenőrzés. A mentés a tárgy teljes illesztéslistáját atomian cseréli.

Migráció: 20261025120121_combat_visual_authoring.sql. Nincs éles migráció/deploy és nincs harci renderer-átkapcsolás ebben a blokkban. Production továbbra a slotképes 2feba641. A korábbi 44248c4 standard/partial editor migrációja is kiadásra vár.

QA: tools/qa/combat-visuals-database.mjs; tools/qa/combat-visuals-browser.mjs. Izolált authenticated SQL PASS: képsorrend, módosítás/visszaolvasás, verzióütközés, invalid koordináta/FPS, FK, duplikált illesztés, hibás mentés rollback, törlés és jogosultságok. Kapcsolt adatbázis rollback-próba MCP requestState hibát adott; production táblák továbbra nem léteznek (visszaellenőrizve), ezért kapcsolt PASS nincs. Böngészős eredmény a board/CI legfrissebb kommentjében.

Chromium headless-shell PASS: React → HTTP → valódi migrációval felépített izolált PostgreSQL, képkockasor mentés/visszatöltés, külön tárgykép és kaszthoz tartozó pozíció/forgatás visszaolvasása; HU/EN × 1920×1080 / 1366×768 / 1280×720. Valódi képletöltés/naturalWidth, ed-general-grid mezők computed background/border-radius és form overflow ellenőrizve. 1280×720 képernyőkép vizuálisan átnézve. Firefox még nincs helyben igazolva; CI mindkét böngészőre felkészítve.
