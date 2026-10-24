# Négyfős expedíciós Loadout — HV-070

2026-10-24: implementálva a `feature/expedition-transition` ágon, PR #25. **Nincs élesítve.** A migráció csak izolált adatbázisban és a kapcsolt PostgreSQL-en visszagörgetett tranzakcióban futott. A frontend és a migráció együtt adandó ki, külön kért release-ben.

## Viselkedés

- Loadout → Társak: kapitány és legfeljebb három teljes expedíciós társ. Az 1. pozíció elöl, a kapitány bármelyik helyen állhat. Nyilak és drag-and-drop rendezés; kiválasztott helyre társ betehető, társ kivehető. A részben feltöltött csapat is menthető, üres helyek a sor végén. A kapitány nem cserélhető ki tartalék társra és nem távolítható el. Négy fő bevetési követelménye a későbbi runindítás feladata.
- A tartalék lapozható; az aktív csapat és a 24-es tartalékkeret külön fogalom. A hajós személyzet nem jelenik meg az expedíciós választóban.
- Felszerelés: minden saját teljes karakter ugyanazt a nyolc fizikai slotot használja. Közös személyes készlet és hajóraktér, nem négy másolat. Mindkét tárolóból felszerelhető, mindkettőbe visszatehető, kompatibilis slotok és karakterek között atomi csere lehetséges. Meglévő item tooltip, paperdoll, cellák, rács, tárolópozíciók és publikált UI-geometria maradnak.
- Powerek: külön karakterválasztó és legfeljebb öt különböző, elérhető aktív power karakterenként. Alaptámadás is helyet foglal. Explicit üres lista érvényes; mentés nélküli karakternél az első öt elérhető aktív power az alapérték. A piszkozat karakterváltáskor megmarad; a mentés csak a kiválasztott karaktert írja.
- HU/EN, lapozás, azonos `LoadoutLayoutSurface` / `GamePanelFrame`. Új editorkontroll nem készült. A felületszerkesztő a korábbi közös komponenst használja.

## Tárolás és védelmek

`private.expedition_parties`: rendezett actor UUID-lista és revision. `private.expedition_power_loadouts`: actoronkénti lista. Mindkettő RLS, közvetlen kliensjog nélkül. Íráskor a meglévő `combat_owned_character()` a saját játékállást választja és a `character_progress` sort zárolja. Ez sorosítja a party-, power-, gear- és meglévő készletírásokat.

A kapitány felszerelésének hiteles forrása továbbra is `character_equipment` (`crew_id is null`); a társaké a HV-067 `expedition_actor_equipment` táblája. A közös kiértékelő ezeket már kezeli. Nincs új statképlet, felszerelésmásolat vagy automatikus karakterkonverzió. Az előkészített kapitánypowerek a régi harci adapterben is szinkronban maradnak a motor HV-045-ös cseréjéig.

Minden actor UUID-t a szerver ellenőriz a saját álláshoz. A szerver elutasítja a duplikált, hiányzó kapitányos, négy fő feletti vagy idegen szereplős csapatot, az elavult revisiont, az elérhetetlen/hatodik/duplikált powert és a fizikailag inkompatibilis felszerelést. Valódi aktív harc vagy skill challenge alatt minden új party/power/gear írás tiltott. Az editor-szimuláció nem zárol. A későbbi expedíciós runzárolás HV-074 feladata.

Új public invoker RPC-k:

- `get_expedition_team_loadout()`
- `save_expedition_party(p_actors uuid[], p_revision bigint)`
- `save_expedition_actor_powers(p_actor uuid, p_powers uuid[])`
- `get_expedition_storage()`
- `equip_expedition_actor(p_actor uuid, p_slot text, p_item uuid, p_storage text, p_position integer default null)`
- `move_expedition_equipment(p_from_actor uuid, p_from_slot text, p_to_actor uuid, p_to_slot text)`

A belső segédfüggvények tiltottak; csak a saját tulajdont ellenőrző privát belépési pontok kapnak authenticated EXECUTE jogot. Nincs prefix alapú jogosultság-visszavonás.

## Kivezetés és változatlan döntések

A régi `CrewRosterPanel` és fel nem használt játékos-CSS törölve. A `set_salvage_party(uuid[])` és a kapitány-only `save_expedition_powers(uuid[])` public és private írási végpontjai elveszítik a kliensjogot a migrációval. A legacy gear adapter csak a kapitányt kezeli, hajós crew felszerelése tiltott. Régi rekordot a migráció nem töröl; a további történeti táblák, egyszerű crew-katalógus és a régi 1v1 motor végleges kivezetése HV-075/HV-045.

**Kapacitás nem változik:** a közös személyes készlet a meglévő 6 + kapitányi hátizsák keretet használja, a hajóraktér a hajóét. Társ hátizsákja nem szorozza vagy bővíti hallgatólagosan a közös keretet. A végleges csapatkapacitás továbbra is HV-077 nyitott döntése. Nincs új faj/kaszt alapú viselési korlátozás.

## Bizonyíték és korlát

- `tools/qa/expedition-party-database.mjs`: PASS. Valódi új migráció és meglévő készlet/pozíció függvények izolált PostgreSQL-ben; authenticated publikus RPC, csapat/revision/ownership, külön powerlista, darabszámmérleg, csere, készletpozíció, idegen létező actor, régi write-path tiltás, valódi harc/challenge lock és szimuláció-kivétel, anon/helper/table tiltás.
- `tools/qa/expedition-loadout-browser.mjs`: Chromium PASS. React → HTTP → SQL csapatválasztás, valódi húzásos kapitányátrendezés, mentés/újratöltés, külön társ-powerlista, nyolc gear slot, készlet→társ→közös készlet→társ húzás és újratöltés. HU/EN × 1920×1080, 1366×768, 1280×720; nincs panel- vagy dokumentumgörgetés.
- `tools/qa/ui-layout-browser.mjs`: PASS. Publikált szerkesztő/játék geometria, három méret, mentés/publikálás/visszaállítás regresszió.
- `tools/qa/crew-progression-browser.mjs`: Chromium PASS; a régi játékos-party teszt helyett most az új expedíciós teszt ellenőrzi a csapatot.
- Meglévő actor/recruit SQL regresszió és `npm run build`: PASS. A build korábbi chunk-size figyelmeztetése megmarad.
- `supabase/tests/expedition_party.sql`: kapcsolt PostgreSQL PASS, tényleges authenticated public party/power/storage/equip/move RPC-k és tárgymérleg; minden QA-adat és a migráció DDL-je ROLLBACK. A teszt nem használ éles játékosklónt.
- Security advisor a jelenlegi éles alapállapotot ellenőrizte: a már meglévő private, közvetlenül tiltott RLS-táblák policy nélküli INFO jelzései és a korábbi leaked-password WARN. A nem alkalmazott HV-070 objektumokra ez nem advisor-minősítés; a tranzakcióban külön ACL/RLS ellenőrzés történt.

**Még nem igazolt:** két valós PostgreSQL-kapcsolatos konkurens felszereléspróba (a PGlite soros teszt ezt nem helyettesíti), Firefox és bejelentkezett production böngészős E2E. HV-070 Review; a teljes átállás nincs kész. HV-069 újállás/kezdő szolgálati crew integráció és HV-076 végső release kapui nyitottak.
