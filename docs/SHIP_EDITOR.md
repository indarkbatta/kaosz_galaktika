# Hajószerkesztő — 2026-10-20

Az editor bal menüjének Hajószerkesztő pontja nyitja meg. Az új hajó gomb alapmodulhelyeket és pilótaállást készít; a Másolat új hajóként a kijelölt hajó teljes profilját másolja piszkozatként. A hajó képe az R2-beli `hatarvilag/` útvonalról jön, és a játék hajóválasztója, összegzése és felszerelési nézete is ezt használja. A hajóválasztó három hajónként lapozható.

A négy fül: Alapadatok (azonosító, burkolat, raktér, sebesség, kép, publikálás), Modulhelyek (típus, S/M/L méret, kötelező jelölés, HU/EN név, sorrend), Legénység (szakterület, 1–5 jártasság, kötelező jelölés, HU/EN név, sorrend), Szótár (engedélyezett nyelvek; HU/EN név kötelező). Szakterületenként egy állás és legfeljebb 32 modulhely engedélyezett.

Mentés előtt a szerver ellenőrzi az editor/admin jogosultságot és a teljes adatcsomagot. Az alapadatok, fordítások és slotok egy tranzakcióban mentődnek. A revision mező elavult szerkesztésnél ütközést jelez; a felhasználó az újratöltés gombbal kérheti a szerverváltozatot. A fő szerkesztőn belüli hajóváltás, másolás és visszalépés a nem mentett módosítások elvetésére külön ablakot mutat.

Publikáláshoz kötelező hajtómű-, reaktor-, burkolat- és pilótahely kell; a kötelező modulhelyeken kompatibilis alapmodul és elegendő kezdő reaktorteljesítmény szükséges. A kezdő személyzet jártassága követi a hajó kötelező állásainak követelményeit. Egy már használt slot nem törölhető és nem tehető inkompatibilissé felszerelt moduljával vagy beosztott tagjával. Új hely hozzáadásakor a meglévő hajók ott üres helyet kapnak; az alapadatok változásai az összes ilyen hajóra érvényesek. Publikálás visszavonása után a hajó új karakternek nem választható, a tulajdonos viszont továbbra is hozzáfér.

## Adatbázis

- `20261020084551_ship_editor.sql`: alkalmazva a Supabase-projekten. Az előző hajóslot-migrációkra épül.
- `get_ship_editor_catalog`: csak editor/admin részére, a piszkozatokkal, fordításokkal és slotokkal együtt.
- `save_game_ship`: ellenőrzött atomi mentés, kizárólag editor/admin; a táblákra nem ad kliens írásjogot.
- A hajószerkesztő kizárólag a hajót és a slotjait szerkeszti; a hajómodul-tárgyak statjait nem módosítja.

## Ellenőrzés

A `supabase/tests/ship_editor.sql` valódi authenticated szereppel, visszagörgetett tesztfelhasználókkal ellenőrizte az új hajót, módosítást, elavult revision elutasítását, duplikált slot elutasítását és az elutasított mentés atomikusságát; a normál játékos szerkesztésének tiltását; új hajóval kapitánygenerálást és 5-ös pilótakövetelményt; foglalt slot törlésének tiltását; üres slot törlését; publikálás visszavonását, tulajdonos hozzáférését és másik játékos elől a piszkozat rejtését. Az anon RPC-hívási jog és a kliens közvetlen táblaírás hiányát is ellenőrizte. Sikeres.

TypeScript/Vite build sikeres. Bejelentkezett böngészős felületteszt nincs igazolva. A funkció a `feature/ship-slots` ágra épülő `feature/ship-editor` ágban van; production kiadás nem történt.
