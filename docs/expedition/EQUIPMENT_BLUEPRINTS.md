# HV-081 — Blueprint és komponens editor

Szerkesztők → Felszerelés és gazdaság → Blueprint editor. Önálló EditorFrame, kereshető, négyesével lapozott tárgylista; a Tárgyeditor Komponensek füle megszűnt. A tárgy alapadatait előbb a szokásos editorban kell létrehozni; a besorolás külön atomi, verziózott mentés. Nincs új inventory- vagy craftingmechanika.

## Besorolás

Szerep: kész felszerelés / komponens / blueprint. Család: fegyver / oldalfegyver / páncél / sisak. Komponensnél külön fajta: cső, keret/tok, előágy, markolat, tus, csőszájfék, tár, energiaforrás, szereléksín, optika, lámpa, pointer, burkolat, bélés és rostély. Az Új komponensfajta fülön új kód és HU/EN név vehető fel; az alkatrészek listája nincs beégetve a kliensbe. A szerep/család nem módosítja hallgatólagosan a meglévő equip_slot értéket, faji/kaszt használati tilalmat nem vezet be.

## Blueprint

Legfeljebb 32 rendezhető komponenshely. Egy hely típusa a komponensfajta; több azonos fajtájú hely is megadható (pl. két optika). Opcionális/kötelező jelölés. A kompatibilitási lista helyenként legfeljebb 100 különálló létező komponens, azonos családdal és típussal. Egy csőhely tehát öt különböző csövet engedhet. Nem recept: a választható alternatívák nem öt egyszerre szükséges alapanyag.

## Összeállító

Helyenként egy kompatibilis komponens választható; a kiválasztás, X/Y, méretarány és forgatás a blueprint szerkesztői mintaösszeállításaként megmarad. Rétegsorrend a helyek sorrendje. Az előnézet a komponens külön harci képét használja, ennek hiányában a meglévő tárgyképet. Az illesztés középpont-alapú, a közös négyzetes vászon százalékában. A hiányzó kötelező helyek száma látszik; a befejezetlen blueprint szerkesztői tervként elmenthető. Ez nem ad felszerelt játékosfegyvert, nem fogyaszt készletet és nem összegez statisztikát.

## Biztonság / QA

RLS, közvetlen kliens-táblajog nélkül; authenticated editor/admin RPC. Atomi revízióellenőrzés és zárolás, valódi tárgy/fajta FK, kompatibilitás és kiválasztás ellenőrzése, tartományvalidálás, ismétlődő hely/alkatrész elutasítása. Hivatkozott komponens átsorolása tiltott, amíg ki nem veszik minden blueprintből; nincs csendes törés.

EditorTemplate/editor.css mezők és gombok, geometriai modul CSS, Lucide ikonok, HU/EN, egyhelyes szerkesztés és lapozott komponenslista. A Blueprint editor közös elvetés-modalja védi a mentetlen szerkesztést rekordváltáskor és kilépéskor. Mentés közben a navigáció tiltott.

Izolált authenticated SQL PASS: öt kompatibilis cső, kiválasztás/illesztés tárolása, fordított függőség, hibás és elavult mentés rollback, jogosultságok, új fajta. Chromium headless-shell PASS: React→HTTP→SQL authoring, lapozott ötcsöves kompatibilitás, mentés/újratöltés, képletöltés és közös mező computed style; HU/EN 1920×1080, 1366×768, 1280×720 overflow nélkül. Firefox helyben nem igazolt; CI mindkét böngészőt futtatja.

Migráció: 20261025123052_equipment_blueprints.sql; előfeltétel a combat_visual_authoring migráció. Mindkettő és a power_action_cost migráció már éles. Az önálló editorra szervezés nem igényel adatbázis-migrációt. Ebben az átszervezési blokkban nincs deploy/main merge/harci renderer-bekötés.
