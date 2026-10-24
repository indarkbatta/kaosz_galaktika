# Expedíciós átállás — HV-066

Állapot: végrehajtási leltár és tervezett szerződések; **nem élesített funkció**.
Forrás: 2026-10-23-i beszélgetés, repository és kapcsolt Supabase read-only leltár.
Kódalap: `26b33b3d28d6f704381881155165ff5125db64d0`.
A HV-067 karakteralapját az `ACTOR_FOUNDATION.md`, a HV-068 társ editor/toborzás/fejlődés lépését a `COMPANION_RECRUITMENT.md` írja le; a további célobjektumok tervekként szerepelnek. Éles adatbázis-migráció nem történt.

## Felhasználói döntések

- Külön expedíciós csapat és külön hajós szolgálati legénység.
- Expedíció: kapitány + három teljes értékű karakter; faj, kaszt, öt tulajdonság, skillek, két talentfa, HP, öt passzív védelmi célszám, powerek, fejlődés.
- Oldalanként négy harci pozíció; az 1. van elöl. Mozgás helycserével; karakterenként egy akció a saját körében.
- Kasztpowerek: DPS, Tank, Controller, Leader szerepek. A meglévő statok és dobásképletek változatlanok.
- Minden kiváltott rendszer eltűnik a játékból, editorból és aktív backendből.
- **Legutóbbi pontosítás felülírja a karakterkonverziós tervet:** a felhasználó törli a régi kapitányt és társakat. Tiszta új állásra készülünk. Ez nem felhatalmazás agent által végzett tömeges törlésre.
- Az expedíciós felszerelés közös csapatkészlet: bármely expedíciós karakter használhatja. A hajós crew egyelőre nem felszerelhető.
- Világ, katalógusok, rajzolt térképek, képek és UI-elrendezések nem törlendők.

## Igazolt kiinduló állapot

A pillanatkép változhat; kiadás előtt újra kell futtatni az `audit.sql` fájlt.

| Elem | Darab |
| --- | ---: |
| Kapitány | 1 |
| Crew / hajós beosztás | 2 / 2 |
| Mentett expedíciós társ | 2 |
| Expedícióra kijelölt és hajón is beosztott ugyanazon crew | 2 |
| Felszerelés / ebből crew felszerelés | 3 / 0 |
| Hajóraktér / személyes készlet sor | 6 / 1 |
| Tanult node / külön tanult power | 2 / 1 |
| Külön mentett power-loadout | 0 |
| Crew XP > 0 | 0 |
| Valódi aktív harc / összes történeti harc | 0 / 1 |
| Crew-kaszt / power definíció | 6 / 30 |

Mindkét crew rendelkezik feloldható faji és rendes kaszthivatkozással, de a jelenlegi `class_id` portré-metaadat: nem bizonyít teljes karakterépítést. Ezért ezekből nem készül automatikus teljes karakter.

## Miért nem lehet csak 2-ről 3-ra emelni a társlimitet?

- `characters.user_id` UNIQUE, a tábla egyben a hajó, energia, helyszín, készletek és runok tulajdonosa.
- `private.combat_owned_character()` userből egyetlen kapitányt választ és annak progress sorát zárolja. Társakat nem szabad további account-kapitányként ide beszúrni.
- `character_salvage_party.slot` csak 1/2 lehet, `crew_id` pedig közvetlenül `character_crew` rekordra mutat.
- `character_equipment` tulajdonosa a kapitány; `crew_id` esetén külön FK és azonos kapitányhoz kötő összetett FK van. Törlés kaszkádolhatja a felszerelést.
- A társaknak most három slotjuk van; saját attribútumuk, tanult powerük és teljes talentfejlődésük nincs.
- `combat_act`: csak `current=0` a játékos köre; `combat_auto`: actor 1 az ellenfél; `combat_initial`: két aktor; `combat_next_turn`: aktor 0/1 győzelmi vizsgálat és 3 AP. Mindet át kell írni, nem elég több portrét kirajzolni.

## Régi → új, megtartás és kivezetés

| Jelenlegi elem | Új felelősség / teendő | Kártya |
| --- | --- | --- |
| `characters`, `character_progress`, helyszín/energia/hajó | Account-játékállás és kapitányi horgony marad; közös teljes karakter-kiértékelés alá rendezés | HV-067 |
| `character_combat_progress`, `character_tree_nodes`, `character_talents`, `character_powers`, `character_skill_upgrades` | Teljes expedíciós karakterhez rendelt megfelelőik; ugyanaz a HP/defense/talent/power számítás | HV-067 |
| `character_crew`, `character_ship_crew`, `game_crew_templates`, portrék | Hajós szolgálati crew, beosztások és bónuszok maradnak. Expedíciós harci számítás és gear-függés eltűnik | HV-067/075 |
| `game_crew_classes`, `game_crew_skill_bonuses`, `crew_sheet`, `crew_base_stats`, `award_crew_xp`, `private.crew_xp_events` | Az egyszerűsített expedíciós harcmodell kivezetése; a szolgálati működés nem épülhet ezek harci statjaira | HV-075 |
| `character_salvage_party`, `get_simple_crew`, `set_salvage_party` | Teljes karakterekből álló négyhelyes csapat; régi party tábla/RPC megszűnik | HV-070/075 |
| `CrewProgressionEditor.tsx`, `CrewRosterPanel.tsx`, Combat/Crew rész | Régi harci crew editor és statlap megszűnik; szolgálati editor és új teljes társ editor külön | HV-068/075 |
| `EquipmentInventory.tsx`, `character_equipment` | Közös csapatkészlet és karakterhez rendelt viselés; a szolgálati `crew_id` gear útvonal megszűnik | HV-069/070 |
| `character_inventory`, `character_personal_inventory`, `private.inventory_positions` | Hajóraktér + közös expedíciós készlet; nem négy külön tárgymásolat | HV-070 |
| `private.character_power_loadouts`, `get_expedition_loadout`, `save_expedition_powers` | Karakterenként max. öt elérhető aktív power, explicit actor-azonosítóval | HV-070 |
| `combat_hero`, `combat_hero_before_loadout`, `talent_hp`, `branch_defenses` | Egy közös karakterkiértékelő; a wrapperlánc feloldása, nem újabb másolt szabályimplementáció | HV-067 |
| `combat_initial`, `combat_next_turn`, `combat_auto`, `combat_resolve_action`, `combat_act`, `combat_commit/view/start` | Pozíciós csapatharc, egy akció, több vezérelhető társ és több ellenfél | HV-045 |
| `combat_runs/commands/events`, `combat_start_requests`, `combat_operations` | Ownership/revision/idempotencia és egyszeri reward megtartása; állapotséma verziózása | HV-045/076 |
| `activate_combat_defense`, régi AP számláló és feliratok | Új akciómodellhez igazított védelem; 3 AP útvonal eltávolítása | HV-045/073/075 |
| `CombatPanel.tsx`, `src/lib/combat.ts` | Oldalnézet, karakter/pozíció célzás, actionbar és új történeti olvasó | HV-073 |
| `game_powers`, `game_power_grants`, talentfa node hivatkozások | Megmaradó katalógusazonosítók, pozíciós séma, szerepek; elavult konfiguráció kivezetve | HV-071/072 |
| `UILayoutEditor`, `LoadoutLayoutSurface`, `GamePanelFrame` | Négy karakter választója, közös készlet, öt power/karakter; azonos keret és editor/játék geometria megőrzése | HV-070/073 |

## HV-067 adatszerződés és további célállapot

- A `characters` rekord a játékállás horgonya marad. Társ nem kap saját hajót, utazási energiát vagy külön világállást.
- A fejlesztési ág `private.expedition_actors` entitása kezeli a kapitányt és a társakat: `id`, `character_id` (játékállás), `kind` (captain/companion), név, faj, rendes kaszt, portré, attribútum- és skillkiosztás. Pontosan egy captain az account-játékálláson belül. A kapitány sora csak identitás; a build/progress az eddigi táblákban marad, közös kontextusadapterrel.
- Actorhoz kötött progress, sérülés/HP, skill upgrade, megtanult node/talent/power és előkészített loadout; ezek ugyanazt a kiértékelőt hívják.
- A party pozíció és az actor-azonosító külön mező. Mozgáskor az actor nem kap új identitást, és a köre/CD-je nem cserélődik el.
- A hajós crew nem FK-zik teljes karakterként az expedition actorra, és nem birtokol felszerelést.
- Közös készletből explicit actorhoz felszerelt darab; közös hozzáférés, nincs faj/kaszt alapú viselési tiltás. Slot/fegyvertípus fizikai kompatibilitása megmarad. Egy darab egy időben egy viselőn lehet — technikai alapértelmezés, nem tárgyduplázás.
- A csapat közös készletének kapacitása külön termékdöntés; nem szorozzuk meg automatikusan néggyel és nem vezetünk be új súlyszabályt.
- Új autoritatív RPC minden aktorműveletnél ellenőrzi az actor játékállásához tartozást. A kliens UUID-je önmagában nem jogosultság.
- Zárolási sorrend: játékállás/progress → expedíciós run → actorok rendezett UUID szerint → készlet/felszerelés. Minden régi és új írás ugyanazt a sorrendet követi az átállás idején.
- Runinduláskor pillanatkép: actor build, állapot, felszerelés, öt power, kezdő felállás. Futó expedíció alatt a snapshotot érintő átállítás tiltott.

## Harci részletszabályok — javasolt alap, még nem elfogadott döntések

Ezek nem implementálhatók hallgatólagosan a jóváhagyott statok helyett. A karaktermodell elkülönítése nem igényli az összes alábbi részlet lezárását; a HV-045 igen.

1. Kezdeményezés: meglévő `level*3` pip plain dobás, ellenfélnél meglévő danger hozzáadása; szereplőnként, körönként újradobva, döntetlen stabil, szerver által meghatározott sorrenddel. Nincs új Speed stat.
2. Aktív védelem: a saját akció felhasználásával egy tulajdonságra bekapcsolható a következő saját kör kezdetéig; nincs védelem után ingyen támadás. Társ cseréje nem rövidíti az időtartamot.
3. Helycsere: szomszédos élő társ, a kezdeményező akcióját fogyasztja; a másik actor köre nem vész el. Powerbe épített mozgás ugyanannak az akciónak része, nem plusz akció.
4. Kényszermozgás: minden szomszédos lépés konzisztens átrendezés; nincs két actor ugyanazon a helyen. Mozgásgátlás ellenőrizendő használó és célpont oldalon.
5. Kiesés: a jelenlegi 0 HP/sérülés/extraction szabály marad. Extraction után a sor elölre tömörül, nincs új hulla- vagy Death's Door rendszer. A kieső nem kap több kört.
6. CD: az actor saját köreihez kötött, nem globális kör és nem energia tick. Használat T körben, CD=1 esetén T+1-ben tiltott, T+2-ben használható. Stun/kihagyott saját kör számít; a célpont nem befolyásolja a használó CD-jét.
7. A cooldown, ongoing effekt, aktív védelem lejáratának és körkihagyásnak pontos sorrendje külön teszttábla legyen.
8. Toborzás: külön teljes karakter-sablonok. A szolgálati crew toborzása és kezdő hajós beosztások megmaradnak; expedíciós és hajós állomány között nincs rejtett másolás.

## Bevezetési/kivezetési kapuk

1. HV-066: leltár és szerződések. Ez a dokumentum és audit megvan; a fenti nyitott szabályok Review alatt.
2. HV-067: közös actor- és jogosultsági alap, ugyanazon szabályokkal; implementálva és aranymintával tesztelve a fejlesztési ágon. Részletek: `ACTOR_FOUNDATION.md`.
3. HV-068: új társ editor/toborzás/fejlődés implementálva és tesztelve a fejlesztési ágon (`COMPANION_RECRUITMENT.md`). HV-069: tiszta új állás ellenőrzése. Nem fut régi kapitány/crew konverzió. A felhasználó által végzett reset a meglévő saját-karakter törlési folyamat.
4. HV-070/071: négyfős csapat, közös készlet, viselés, actor-power loadout és pozíciós katalógus. A régi max. kétfős UI/RPC aktív használata megszűnik.
5. HV-045/072/073: teljes csapatharc, tartalom és új megjelenítés; régi 1v1/3 AP végrehajtás megszűnik.
6. HV-074 és HV-035/036/037: meglévő roncs authoringből runok, csapatskillek/harc/jutalom integráció. Nincs párhuzamos roncs- vagy harcmotor.
7. HV-075: dependency scan és grants audit, régi editor/menu/RPC/DTO/CSS/trigger eltávolítása. Katalógusnál FK-ellenőrzés; történeti migrációfájlok megmaradnak.
8. HV-076: teljes újállás-E2E, konkurencia, idempotencia, snapshot és egyszeri reward teszt; külön kért kiadás. Az implementációs commit nem deploy.

## Kiadás és visszaállítás

- Most nem történt játékadat-törlés, DDL vagy deployment. A read-only leltár nem reset.
- Kiadás előtt új leltár: ne a fenti nulla aktív runra hagyatkozzunk. Aktív régi run mellett ne töröljünk motorfüggőséget; előbb annak kezelési szabálya szükséges.
- Minden expand lépés visszafele kompatibilis, amíg a régi kliens él. A régi útvonalak csak a tényleges csere után záródnak; nem marad két választható harcrendszer.
- Az első új írás előtt migrációs checkpoint; szerver és kliens együtt kiadva. Destruktív contract csak ellenőrzött függőséglistával.
- Új actoradatok megjelenése után frontend-rollback önmagában nem elég: a korábbi kliens nem kezelheti félre a több actoros adatot. Vagy kompatibilis szerver-visszaállítás, vagy roll-forward javítás kell.
- Historikus combat események olvasása verziózott, read-only adapterrel; az adapter nem futtatja tovább a régi motort. A felhasználói reset kaszkádolt régi runjainak megőrzését ez nem ígéri.
- Referencia- és katalógusadat nem származhat éles felhasználó klónozásából. Tesztállások külön fixture-adatok.

## Kötelező bizonyítás

- Idegen actor/party/power/equipment UUID írása tiltott; nincs közvetlen kliens táblaírás.
- Azonos item darabszám-mérleg közös készlet → viselő → másik viselő → közös készlet útvonalon; konkurens viselés nem dupláz.
- Hajós crew sem UI-n, sem RPC-n nem felszerelhető; hajóbeosztás és bónusz továbbra is működik.
- Kezdő két talentpont, későbbi egy választott faji/kaszt pont, HP és numerikus védelmek ugyanazon számítása minden actornál.
- Négy egyedi actor, kötelező kapitány, rendezett felállás és öt aktív power/actor; reconnect azonos snapshot.
- Pozíciócsere közben nincs extra kör, akció vagy CD-rövidülés. Nincs actor 0/1-hez kötött csapatgyőzelmi logika.
- Reward és XP parancsismétléssel/dupla kéréssel sem duplázódik. Két valódi DB-kapcsolatos konkurenciateszt is kell; a soros PGlite nem helyettesíti.
- HU/EN, három desktop méret, egységes keret, editor/játék geometria és főablakscroll hiánya.
