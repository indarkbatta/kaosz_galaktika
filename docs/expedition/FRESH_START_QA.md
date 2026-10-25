# HV-069 új állás és HV-070 konkurencia — 2026-10-24

## Kiadás

HV-079 saját készlet/hátizsák javítás éles: `9eadfe9ab1e8eb086af6b4fd50c3116980efb5f4`, Vercel `dpl_3hWJS3KLRaGKYSkKxJuaNs2cNK9D` READY, `hatarvilag.vercel.app`, bundle `index-CZNi02xz.js`. Az `expedition_actor_backpacks` migráció alkalmazva. A post-release authenticated hátizsák-/tárgyátadás-/kapacitás-/mérlegteszt PASS, a tesztadatok visszagörgetve. Main merge nincs.

## Valódi új karakter, kapcsolt PostgreSQL

`supabase/tests/expedition_fresh_start.sql`: PASS. Új, tranzakciós QA-account; a tényleges `public.create_captain_with_talents` végpontot használja a publikált sablon faj/kaszt/kiosztás/kezdő node adataival. Nem másol játékosállást és nem szúr be kézzel kapitányt.

Igazolt: kezdő talentek; üzemkész Sparrow a két valódi induló szolgálati crew-val és beosztásaikkal; induláskor egyetlen captain actor; három publikus hire, azonos request újrahívásának egyszeri actor-/energiahatása; a szolgálati crew változatlansága; négy rendezett pozíció mentése és visszaolvasása; actoronkénti powerbekészítés; egyetlen induló fegyver és hátizsák szabad mozgatása mind a négy karakterre; karakterenként megfelelő saját kapacitás; szabad készletátadás; szolgálati crew felszerelésének elutasítása; pontos fegyvermérleg; világ/katalógus/layout adatok változatlansága.

A valós induló felszerelés **oldalfegyver**, nem kötelező főfegyver: a teszt a valódi tárgy fizikai slotját használja. Az állomási pozicionálás kizárólag a frissen létrehozott QA-kapitány fixture-beállítása. A teszt nem igazol utazási útvonalat vagy production böngészős bejelentkezést; az utóbbi HV-023 külön feladata. Minden QA-account és adat teljes ROLLBACK-ban marad.

## Két valódi PostgreSQL-kapcsolat

`tools/qa/expedition-concurrency.mjs` elkülönített, rövid életű PostgreSQL 17 clustert indít a self-hosted runneren. Véletlen lokális port/jelszó, csak 127.0.0.1, saját ideiglenes könyvtár/adatbázis; nem fogad el production adatbázis-URL-t és nem hoz létre operációsrendszer-felhasználót. Két külön backend PID és egy observer igazolja a tényleges átfedést: `pg_blocking_pids` szerint B megvárja A zárolását, majd A commitja után szerveroldali elutasítást kap.

Esetek: egyetlen raktári tárgy konkurens felvétele két társra; egyetlen készlettárgy konkurens átadása két címzettnek; azonos party revision konkurens mentése; hetedik készletstack bepakolása és a hátizsák egyidejű levétele. Minden esetben pontos darabszámmérleg és érvényes végállapot szükséges.

A root-only munkakörnyezet nem futtathat PostgreSQL-t más felhasználóként (csak UID/GID 0 van leképezve), ezért a teszt ott világosan hibával leáll. Nem használ PGlite-helyettesítést és nem állít helyi PASS-t. A valódi eredményt a Windows self-hosted CI adja.

## CI-fixture javítások

- Toborzó böngészőteszt: browserenként rollbackelt adatállapot; Firefox nem örökli a Chromium mentett szövegét, lemásolt sablonját és fejlődött társát. A mentési input browserenként külön szöveg, ezért valódi módosítást ellenőriz.
- Homeworld teszt: pontos kasztmenü-választás; a „Kasztok” és „Legénységi kasztok” nem keverhető össze.
- Hídteszt: a valódi shell/scene/`ch-v2-mount` környezetben fut, így a kartotékfülek viewportja megfelel a játéknak. Nincs force-click vagy kikapcsolt láthatóság-ellenőrzés.

A javítások tesztkódot érintenek, a már kiadott frontend működését nem módosítják. A helyi Chromium toborzás/híd regresszió sikeres. Teljes CI és a valódi PostgreSQL konkurencia eredménye a commit workflow-jához tartozik; sikert csak a tényleges lefutás után szabad rögzíteni.
