# Közös expedíciós karakteralap — HV-067

Állapot: implementálva a fejlesztési ágon; nincs élesítve. A társak létrehozó felülete és a négyfős loadout következő lépés (HV-068/070).

## Adatok és számítás

A `characters` továbbra is a játékállás tulajdonosi horgonya. A `private.expedition_actors` egy kapitányazonosságot és teljes társakat tartalmaz játékállásonként. Az azonosító, a tulajdonos és a fajta utólag nem írható át.

A kapitány sora csak identitás: az ID megegyezik a `characters.id` értékével. A meglévő kapitány buildje, HP-ja, sérülései, XP-je, skillfejlődése és tanult képességei az eddigi autoritatív táblákban maradnak. Nincs két egymástól eltérő kapitány-build. Új kapitányhoz trigger hozza létre az identitást; meglévőkhöz a migráció csak ezt az identitást regisztrálja.

A társ saját névvel, fajjal, rendes kaszttal, attribútum-/skillkiosztással, szinttel, XP-vel, aktuális HP-val és sérülésekkel rendelkezik. A tanult node-ok pillanatképeit, külön tanult powereket és skillfejlődést actorhoz kötött belső táblák tárolják. A felszereléstábla egyelőre belső kiértékelési bemenet; közös készletből való kiosztása és a darabszámmérleg HV-070-ben készül. Most nincs tárgyat létrehozó vagy felszerelő új RPC.

Mindkét adatformátum kontextusadapterrel jut a **`private.expedition_evaluate(jsonb)`** függvénybe. Ez az egyetlen karakterkiértékelő számítja a HP-t, az öt passzív védelmi célszámot, az összes skillt, az ellenállásokat, a felszerelési hatásokat és az elérhető powereket. A meglévő bónuszcsoportok halmozása változatlan.

A közös `expedition_branch_hp`, `expedition_branch_defenses` és `expedition_points` függvényeket a kapitány korábbi `talent_hp`, `branch_defenses`, `tree_points` belépési pontjai is használják. Első szinten egy faji és egy kasztpont jár; a két alap-HP összeadódik. A további szintek közös pontot adnak, az elköltött ág HP-/defense növekedését kapja a karakter. A kapitány régi rangjai a kompatibilitási időszakban továbbra is beleszámítanak.

## Olvasási szerződés

- `public.get_expedition_roster()` → `{actors: [...]}`, kapitány elöl, utána saját expedíciós társak. Hajós crew nem szerepel benne.
- `public.get_expedition_actor(p_actor uuid)` → egy saját karakter teljes kiértékelt lapja: azonosítók, faj/kaszt, szint/XP, HP-bontás, pontok, attribútumok, nyers és effektív skillek, numerikus nyers/effektív passzív védelmek, powerek, felszerelési hatások.
- A nyers `skills` az attribútum + kiosztott skill + tanult skillfejlődés összege; `effective_skills` a passzív módosítókat és sérüléseket is figyelembe veszi.
- A lap nem ír elő akciókeretet, csapatpozíciót vagy harci CD-szabályt. Ezek a későbbi harcmotor felelősségei.

A public RPC-k invoker függvények, kizárólag bejelentkezett szerepkörnek. A nem kitett privát olvasó minden kérésnél ellenőrzi az `auth.uid()` értékét és a játékállás tulajdonosát. Minden új tábla RLS-védett és közvetlen kliensjog nélküli; a kiértékelők sem hívhatók közvetlenül. Nincs új írási végpont. Az érvényes UUID önmagában nem ad hozzáférést.

## Átmeneti kompatibilitás és kivezetés

A régi `combat_hero_before_loadout` már a közös kiértékelőt hívja, és csak a jelenlegi harci protokoll alakját állítja vissza: harci/aktív védelmi skillek és 3 AP. A meglévő öt-power loadout wrapper tovább működik. Ez nem új 3 AP-s szabály; a régi végrehajtó kivezetése HV-045/075 feladata.

A hajós crew táblákhoz, beosztásokhoz és szolgálati bónuszokhoz a migráció nem nyúl. Nem konvertál crew-t társakká, és nem töröl kapitányt, társat vagy katalógust. A régi egyszerűsített expedíciós crew UI/backend még működik, amíg a HV-068/070 funkciói át nem veszik a helyét. A teljes kivezetést ezért nem szabad ezen alapozó kártya részeként késznek jelölni.

## Bizonyítás

2026-10-23:

- `WORLD_BROWSER_TOOLS=<QA-runtime> node tools/qa/expedition-actors-database.mjs`: PASS. Valós migrációk visszajátszása izolált PostgreSQL-ben; teljes kapitány-JSON aranymintával, fejlődött állapottal, régi rangokkal, node-okkal, sérülésekkel, skillfejlődéssel és előkészített power-wrapperrel. Kapitány/társ szabályegyezés, ágankénti HP/defense/pont, felszerelés, külön tanult power, nem harci skill, más tulajdonos tiltása, anon/direct-helper/direct-table tiltás, RLS, új kapitány trigger, cascade.
- Kapcsolt PostgreSQL: a migrációt visszagörgetett tranzakcióban lefuttattuk. Az aktuális állásban ekkor már 0 kapitány volt, ezért saját QA-nevű, ideiglenes kapitánnyal és külön társsal történt a régi/új teljes JSON és pontok összevetése, valamint az authenticated roster RPC hívása (2 külön actor): PASS. A tranzakció és a QA-adat visszagörgetve; utóellenőrzés: actor tábla nincs, kapitányszám 0. A korábbi audit 1 kapitányos pillanatképe nem aktuális állapot.
- `npm run build`: PASS; meglévő bundle-méret figyelmeztetés.
- A CI combat workflow a külön actor SQL tesztet is futtatja, és figyeli a migráció/QA fájlok változásait.

A fenti tesztek nem bizonyítanak még toborzó UI-t, négyfős csapatot, közös készlet tranzakciókat, többkörös pozíciós harcot vagy konkurens tárgykiosztást: azok külön kártyák elfogadási feltételei.
