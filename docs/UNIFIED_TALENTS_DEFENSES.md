# Talentek és védelem — HV-058

A talentdefiníciók kizárólag a Harc → Talentek katalógusban készülnek. A talentfa passzív node-ja `talent_id` hivatkozást tartalmaz, saját effektet nem. A power node a powerkatalógusra hivatkozik. Új passzív power helyett is talent készül. Szintek és előfeltételek a fában állíthatók; külön rangos talenttanulási útvonal nincs.

A migráció az összes korábbi inline passzívot átvezeti a katalógusba, stabil node-azonosítókkal, két nyelvű szöveggel és hatásokkal. A jelenlegi tartalomban ez kilenc Human-passzív; a Mercenary fa kilenc aktív powere és a katalógusban már meglévő Mercenary talentek megmaradnak. A megtanult node-ok snapshotjai, korábbi talentek/rangok és a közös pontelszámolás megmaradnak. Új tanuláskor a katalógus aktuális hatásai kerülnek az immutable snapshotba; a szerkesztés nem írja át visszamenőleg a már megtanult képességeket.

A `game_combat_profiles` adatai átkerülnek a fajokhoz/kasztokhoz (`hp_per_rank`, `passive_defenses`, `combat_resistances`), majd a régi tábla és editorútvonal megszűnik. A szerver ellenőrzi az 1 elsődleges / 2 másodlagos / 2 harmadlagos tulajdonság kiosztását. Az attribútumok elsődleges/másodlagos bónusza ettől független.

| Prioritás | Kezdő védelem | További elköltött ágpont |
| --- | --- | --- |
| Elsődleges | 3 | +2 |
| Másodlagos | 2 | +1 |
| Harmadlagos | 1 | +1 |

A passzív védelem fix numerikus célszám, nem kockakód és nem védekező dobás. Ezek a meglévő görbék a Harci szabályok alatt továbbra is szerkeszthetők. Első szinten a faj és kaszt alapja összeadódik. Később kizárólag a ténylegesen fejlesztett ág növekménye jár. A két kezdő talent nem számít további pontnak; kiosztatlan pont nem növeli a HP-t/védelmet. A régi ágrangokra már elköltött pontok beleszámítanak.

Öt rögzített skill viseli az aktív védelem jelölést: Reakció, Pszi-védelem, Akaraterő, Fegyelem, Állhatatosság. A skill UUID-k és belső slugok változatlanok, így a korábbi skillbefektetések és hivatkozások megmaradnak. Az aktív védelem 1 AP-ba kerül a saját körönkénti 3-ból. Az adott tulajdonságnál a skill teljes értéke, skill-/attribútummódosítói és sérülése számít a passzív helyett; a többi tulajdonság marad passzív. Skilldobást használ. A következő saját kör kezdetén lejár. Minden power 1 AP, a kör befejezése átadja a maradékot. Cooldownok és állapothatások saját körökben, nem AP-nként mérődnek.

A karaktergenerálás utolsó összesítője hitelesített szerveroldali előnézetből mutatja mind az öt passzív védelmet, a kiválasztott passzívok bónuszaival együtt, valamint a kezdő HP-t. Sikertelen előnézetnél a véglegesítés letiltott.

## Ellenőrzés és kiadás

- `npm run build`
- `WORLD_BROWSER_TOOLS=... node tools/qa/unified-database.mjs`
- `tools/qa/talent-tree-browser.mjs`, `talent-learning-browser.mjs`, `combat-browser.mjs`: Chromium/Firefox, tényleges React felületekkel. A fa- és harci teszt HTTP-n át valódi izolált PostgreSQL-t használ; a teljes karaktervarázsló kontrollált API-fixture-t.
- `supabase/tests/unified_talents_defenses.sql`: valódi kapcsolt adatbázison BEGIN/ROLLBACK, atomikus karakterkészítés, pontok, HP, védelmi növekedés, örökölt rang, sérülés, AP/aktiválás/lejárat, idempotencia és jogosultságok.

Publikáláskor előbb az előző `20261022191143_talent_branch_hp.sql`, utána `20261022194323_unified_talents_defenses.sql`, majd az új frontend szükséges. A tesztek visszagörgetnek: nem élesítik a migrációt. A régi frontendhez nem szabad külön élesíteni a profilokat eltávolító migrációt. A már futó harcok snapshotjai megmaradnak; új karakterstatisztikák az új harcokban jelennek meg.

## HV-059 javítás

A `20261022203736_passive_defense_target.sql` javítja a harcmotort: passzív védelemnél nincs kockadobás, a támadódobás a fix célszámmal kerül összevetésre. A döntetlen továbbra is a védekezőé. Bekapcsolt aktív védelemnél az adott skilldobás számít. A harci esemény passzív esetben `target_number` és `defense_kind=passive` mezőt ad vissza, dobást nem. A meglévő numerikus értékek nem változnak.

A faj/kaszt editor HP-védelem, ellenállások, kezdővilág, skillcsoportok és szótári szövegek külön tabokon lapozhatók. A talent/power kártyák három elemű oldalakat használnak; a gomboknak fenntartott helyük van. A részletek lapozhatók, görgetősáv nélkül. A karakterösszesítő alapnézete a numerikus passzív célszámokat és HP-t mutatja, szögletes keretekkel.

Ellenőrzés valódi app CSS-sel, 1920×1080, 1366×768 és 1280×720 ablakméreten, faj/kaszt és talent/power nézeteken. A panelek teljes tartalmának elférését és a gombok átfedésmentességét külön geometriai állítások ellenőrzik. A `supabase/tests/passive_defense_target.sql` kapcsolt DB-n BEGIN/ROLLBACK-ban futtatható.
