# Hajófelszerelés és legénységszerkesztő

A jóváhagyott látványterv alapján a hajó képes felszerelési nézetet kapott. A modulok és a legénységi portrék azonos négyzetes slotokat használnak; a készletrácsok hézaga 2 px. A hajónkénti slotprofil továbbra is a hajószerkesztőből érkezik. A modulokat és embereket oda-vissza lehet húzni, vagy kattintással kijelölni és hozzárendelni.

## Legénység és toborzás

- A névsor önálló személyeket tartalmaz; egy szakterülethez több tag is tartozhat. A `position` kompatibilitási mező maradt, a tényleges hajóállást a `character_ship_crew` kezeli. Minden korábbi tagazonosító és felszerelési kapcsolat megmaradt.
- Egy személy egy állásban lehet; a leváltott tag a tartalékba kerül. A szükséges szakterületet, jártasságot, hajókészültséget és energiaköltséget a szerver ellenőrzi.
- A névsor jelenlegi felső határa 24 fő. A kantin felvételkor új tagot hoz létre, nem írja felül az előző személyt. A felvétel energiaára 20 maradt; a régi RPC aláírása kompatibilis.
- A tartalék tag külön megerősítéssel elbocsátható. Felszerelése atomikusan visszakerül a hajóraktérbe; helyhiánynál a teljes művelet visszagördül.
- A ritkaság és a toborzási súly független. A maximum/kapitány az egyszerre birtokolható példányokat korlátozza; 0 korlátlan, a névsor 24 fős felső határán belül.
- A mintakatalógus 20 generálási sablont és egy nevesített, ritka Kael Ross karaktert tartalmaz. Ha az engedélyezett készlet kifogy, a kantin kevesebb vagy nulla jelöltet mutat, nem hibázik.
- Az állásbónuszok (burkolat, pajzs, tűzerő, sebesség) csak aktív hajóállásban érvényesülnek. A személy portréja, ritkasága, kasztja, leírása és bónuszai toborzáskor rögzülnek; a sablon későbbi szerkesztése nem írja át a már birtokolt embereket.

## Editor

A közös editor menüben új **Legénységszerkesztő** érhető el: Egyedi karakterek, Toborzási sablonok, Portrékészletek. Új bejegyzés, módosítás, másolat, publikálás/visszavonás, HU/EN és további engedélyezett nyelvek fordításai, jártasság, ritkaság, súly, példányszámkorlát és hajóállásbónuszok szerkeszthetők. Mentéskor revízióellenőrzés véd a másik editor módosításának felülírásától. A nem mentett módosításokat saját megerősítő ablak védi.

A portrékészlet fajhoz, kaszthoz, vagy faj–kaszt pároshoz rendelhető, 1–24 R2 képútvonallal. A már meglévő portrék kattintással is hozzáadhatók. A képek feltöltését továbbra is az assettár kezelése végzi; az editor képútvonalakat és készleteket szerkeszt. Portréprioritás: egyedi felülírás, kijelölt/legpontosabb készlet, faji alap. Amikor lehetséges, a szerver a kapitány névsorában még nem szereplő arcot választja.

A kaszt és a hajós szakterület külön mező. A kaszt itt a személy identitásának része; a hajóállás kompatibilitását a szakterület és jártasság határozza meg. Az `Eseményhez fenntartva` forrás kizárja a sablont a kantinból; eseményjutalom-kiosztó rendszer nem része ennek a változásnak.

## Biztonság és migrációk

A hat migráció alkalmazva a kapcsolt adatbázison, a fájlok verziói a szerver nyilvántartásával egyeznek. Az új katalógustáblák RLS-védettek és csak editor számára olvashatók. Az írások jogosultságellenőrzött privát definer függvényeken és publikus invoker RPC-ken át történnek, üres search_path mellett. Játékos nem állíthat saját ritkaságot/bónuszt, nem rendelhet idegen legénységet a hajójára, és közvetlenül nem írhatja a táblákat.

A biztonsági advisor nem jelzett új problémát. A korábbi, ettől független [Leaked Password Protection figyelmeztetés](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) változatlan.

## Ellenőrzés

- `npm run build`: TypeScript és Vite build. Az új editor külön, igény szerint töltődő chunk, a fő bundle 500 kB alatt marad.
- `supabase/tests/crew_editor_loadout.sql`: rollbackos temp felhasználók; editor szerepkör és revízió, képútvonal-validálás, named jelöltkorlát, snapshot, adatvesztés nélküli felvétel, felszerelésmegőrzés, aktív/tartalék bónuszok, rossz/idegen állás-hozzárendelés, RLS és közvetlen írás tiltása.
- `supabase/tests/reserve_crew_dismissal.sql`: megerősítés és felszerelés-visszaadás, rollbackos temp fixture.
- `supabase/tests/crew_roster_pool.sql`: egyetlen egyedi jelöltes katalógus, újratöltéskor változatlan jelölt, felvétel után szabályosan kiürülő készlet; minden változás visszagördül.
- A korábbi `ship_slots.sql` és `ship_slots_movement.sql` regressziók sikeresek az új adatmodellen.
- Böngészőben a valódi komponensek read-only fixture-je: 1305 px komponensszélességnél minden hajóslot 64×64 px, 872 px-nél 52×52 px. Mindkét készletrács hézaga 2 px, egyik panel sem csordul túl. HU/EN váltás, kijelölés, portrékészlet-váltás, többsoros képbevitel, lapozás és elvetés/megtartás megerősítés ellenőrizve. Az adatbázisműveleteket a külön SQL regresszió igazolja; ez nem bejelentkezett végponttól végpontig böngészőteszt.
- Fixture reprodukció: `node tools/qa/build-crew-preview.mjs /tmp/crew-preview.html`. Csak nyilvános katalógusadatok és kitalált karakterek; nem része az App útvonalainak, `initialData` mellett nincs RPC-írás.
- Képernyőképek: `crew-editor-preview-20261020.jpg`, `ship-crew-preview-20261020-v2.jpg`.

## Grafikai források

A beépített imagegen eszközzel készült 7 külön átlátszó modulikon és 3 közeli legénységi portré. A WebP-k natív felbontású webes kódolások; az eredeti generált képek változatlanok maradtak. Projektfájlok: `public/assets/ship-modules-v1/{reactor,engine,shield,weapon,hull,sensor,utility}.webp` és `public/assets/crew-portraits-v1/{kael,mara,aren}.webp`. Publikus kulcsok: `hatarvilag/items/ship-loadout-v1/…` és `hatarvilag/crew/portraits-v1/…` az assets.voidnoir.net alatt. A 12 meglévő hajómodul a megfelelő család képét használja; a migráció megőrzi a korábbi egyedi képbeállításokat.

Modulok közös generáló promptja: “A single game inventory icon for Határvilág, dark industrial science-fiction in a European painted comic / Torchlight-like stylized game art direction. One isolated object only. Three-quarter view, clearly readable at 64 pixels, centered square composition with 10% empty padding, entire silhouette inside image. Detailed painterly shading, strong dark outlines, worn gunmetal, subtle copper accents, controlled highlights. Genuinely transparent background, no floor or cast ground shadow, no backdrop, no text, no UI, no frame, no inventory grid, no labels, no watermark. Rich rendered game item illustration, not flat vector, not photorealism.” Tárgyak: hengeres fúziós reaktor, egyfúvókás hajtómű, hatszögmezős pajzsgenerátor, kétcsövű forgó lövegtorony, három réteg páncéllemez, parabolás szenzor, páncélozott külső raktérkonténer.

Portrék közös generáló promptja: “One close-cropped HEAD AND SHOULDERS PORTRAIT for Határvilág dark industrial sci-fi crew inventory. European painted comic / Torchlight-like richly painted illustration, strong dark contours, expressive individual face, stylized proportions but adult, rugged lived-in texture. Three-quarter view looking slightly toward viewer. Head fills upper 60% of frame and shoulders lower 40%, no full body, no hands, no weapons in frame. Face must be extremely readable when square-cropped at 64px. Dark subdued petrol spaceship interior backdrop, restrained warm copper rim lighting, detailed facial structure, painterly shading. Portrait canvas, face entirely inside image with breathing room above hair. No text, no UI, no border, no watermarks, no species/class banners or logos.” Alanyok: Kael Ross (45 éves férfi biztonsági tiszt, rövid őszülő sötét haj, szakáll, taktikai páncél); Mara Voss (35 éves női pilóta, rövid sötét haj, kopott repülős dzseki); Aren Rhett (38 éves férfi navigátor, barna bőr, rövid fekete haj, szakáll nélkül, sötét magas galléros egyenruha).

## Kiadás

Az ág a `feature/separate-inventories` változatra épül. GitHub PR és Vercel preview készül; production/main kiadás külön lépés. A Vercel connector a kifejezett `teamId` paraméterrel téves 403/404 választ adhat: az ismert projekt azonosítójával, a visszaellenőrzött alapértelmezett accounton elérhető. Automatikus Git-alapú deploy továbbra is kikapcsolva.
