# Expedíciós társ editor és toborzás — HV-068

Állapot: fejlesztési ágon, nem élesítve. Előfeltétel: HV-067 közös karakteralap. Nincs régi karakter/crew konverzió vagy törlés.

## Hol található?

- Editor → Karakterek → **Expedíciós társak**. Saját sablonlista, keresés, lapozás, új bejegyzés, másolat, mentés és újratöltés. Külön fülek: alapadatok, tulajdonságok, skillek tulajdonságcsoportonként, kezdő talentek, szótár, szerveroldali összesítés.
- Kantin → **Expedíciós társak** / **Hajós személyzet**. A szolgálati crew eredeti toborzási és beosztási útvonala megmarad. Az expedíciós karakter nem kerül a hajós crew táblájába.
- Az expedíciós panelen Jelentkezők / Karaktereim választó. A karakterlap fülei: összesítés numerikus passzív védelmi célszámokkal, skillek, talentek, powerek. A kapitány is megjelenik a saját karakterek közt.

## Sablon és toborzás

A sablon első szintű teljes karaktert ír le: HU/EN név és leírás, portré, publikált faj és rendes kaszt, a kapitányéval azonos szabad attribútum-/skillpont-kiosztás, egy kezdő node mindkét elérhető publikált talentfából. Nem hoz létre saját inline talentet, nem használ egyszerűsített crew-kasztot, és nem tartalmaz ingyen felszerelésmásolatot.

A két kezdő node csak első szintű, elérhető és előfeltétel nélküli lehet. Ha egy ághoz még nincs publikált fa, a kezdőpont megmarad. A publikálást és a toborzást a szerver újra ellenőrzi. Közben érvénytelenné vált sablon nem toborozható; az editor javítja az alapjául szolgáló katalógus alapján.

Alapértelmezésként egy névvel rendelkező sablonból játékállásonként egy társ toborozható; az expedíciós tartalék állomány technikai korlátja 24 társ. Ez nem a bevethető csapat mérete: a kapitány + három társ aktív csapata HV-070. Nincs automatikus ritkasági/generált név rendszer ebben a lépésben.

A toborzás a Határvidéki állomáson érhető el. Az alapértelmezett költség **1 energia**, sablononként 0–100 között szerkeszthető. Nincs új credit- vagy pénzrendszer. Az ideiglenes alapérték és az egy-sablon/egy-társ szabály a felületen is látszik. A jelöltek a publikált expedíciós sablonokból jönnek; a szolgálati crew rotációja külön marad.

A társ saját buildet, tanult node-pillanatképeket és powereket kap. HU/EN neve és leírása a toborzáskori pillanatképből származik, ezért egy későbbi sablonmódosítás nem írja át a már csatlakozott társ történetét. Nincs automatikusan publikált kezdő társ-tartalom: azt a világ szerkesztője adja meg.

## Közös szabályok

- `private.expedition_build` a kapitány eredeti pontkiosztását emeli ki közös függvénybe. A kapitány létrehozása is ezt hívja; hajó- és szolgálati inicializálása változatlan. A faji és kaszt skillbónuszok is hozzáadódnak. Ismeretlen attribútumkulcsot mindkét útvonal elutasít.
- `private.expedition_checked_node`, `expedition_learn` és `expedition_tree_view` közös node-ellenőrzést, tanulást és katalógusnézetet ad a kapitánynak és társaknak. A kapitány régi tanulási RPC-je kompatibilis adapter. A talentek kizárólag a harci talentkatalógusból származnak; a node nem saját talent-definíció.
- A HP, a védelmek és a pontok a HV-067 függvényeit használják. Első szinten 1 faji + 1 kaszt kezdőpont, később szintenként 1 közös pont. A két alap-HP összeadódik; később az elköltött pont ága növeli a HP-t és a védelmeket. El nem költött pont nem választ automatikusan ágat.
- `expedition_effective_sheet` közösen alkalmazza a meglévő bónuszcsoport-halmozást és sérüléseket a tényleges skillértékekre és passzív védelmekre; az editor és a jelölt előnézete is ezeket mutatja.
- A társ skillfejlesztése azonos pontköltségű és legfeljebb +12 tanult pipet enged skillenként, a kapitány meglévő szabálya szerint.
- `private.award_expedition_actor_xp` kizárólag belső szerverfüggvény. A meglévő `xp_level_base * level * (level+1) / 2` küszöb, 100-as szintkorlát és `skill_points_per_level` alapján ad fejlődést. Eseményazonosítóval ismételhető, jutalomduplázás nélkül. A későbbi expedíciós/harci reward kapcsolja be (HV-045/074); a kliens nem állíthat szintet vagy XP-t.

## Írási és jogosultsági szerződés

| RPC | Jogosultság / művelet |
| --- | --- |
| `get_expedition_template_catalog` | Editor/admin teljes sablonkatalógus és referenciaadat |
| `save_expedition_template` | Editor/admin, atomi mentés és kötelező meglévő revision |
| `preview_expedition_template` | Editor/admin, szerveroldali teljes validáció és kiértékelés |
| `get_expedition_recruitment` | Saját állás, állomáson elérhető jelöltek és saját roster |
| `hire_expedition_companion` | Saját állás, station/encounter/költség/revision ellenőrzés, request UUID |
| `get_expedition_actor_trees` | Saját actorhoz tartozó publikált fák |
| `learn_expedition_talent` | Saját actor, szint/előfeltétel/pont/revision/encounter ellenőrzés |
| `upgrade_expedition_skill` | Saját actor, szabad skillpont/maximum/encounter ellenőrzés |

A public RPC-k invoker függvények; a privát, jogosultságot ellenőrző belépési pontok kapnak végrehajtási jogot. A táblák RLS-védettek, közvetlen kliensjog nélkül. A pontkiosztó, jutalmazó, kontextus- és node-ellenőrző segédfüggvények nem hívhatók kliensből.

Játékosírásnál először a játékállás progress sora zárolódik, utána az actor; a közös tulajdonosi zárolás sorosítja a konkurens toborzásokat. Ugyanaz a hire request ugyanazt a már létrehozott actort adja vissza, újabb energiafogyasztás nélkül; másik sablonra újrafelhasználva hiba. Aktív valódi harc vagy skill challenge alatt nincs toborzás, talent- vagy skillátállítás. A későbbi roncsrun-zárolást HV-074 integrálja.

A sablon kezdő-node FK-k halasztottak: a meglévő faeditor törlés/újrabeszúrás alapú, azonos node-azonosítókat megtartó mentése működik. Egy sablon által hivatkozott node végleges eltávolítása előtt a sablonhivatkozást rendezni kell. A tanult actor-node pillanatképek ettől függetlenül megmaradnak.

## Ellenőrzés — 2026-10-23

- Izolált PostgreSQL: teljes editor mentés/revision/atomi elutasítás, közös kiosztás és faj/kaszt skillbónusz, station gate, draft kizárás, egyedi hire/idempotencia/egyszeri energia, szolgálati crew elkülönülés, XP eseményduplázás, skillfejlődés, közös kapitány/társ node-tanulás, kezdő node és ágankénti HP, idegen tulajdonos/anon/editorjog/segédfüggvény tiltás: PASS.
- Chromium: valódi React → HTTP → SQL mentés, újratöltés, sablonmásolat, előnézet, nem mentett változás védelme, dupla kattintásos toborzás, roster újratöltés, társ talentlap és skillfejlesztés, HU/EN: PASS. 1920×1080, 1366×768, 1280×720 méreten editorfülek és karakterlap görgetésellenőrzése; a talentfül két nagyobb kártyát és lapozást használ.
- Meglévő kapitánygenerálási böngészős regresszió: PASS (két kezdő választás, wizardban megtartott állapot, véglegesítési RPC).
- Kapcsolt PostgreSQL: ideiglenes QA-kapitány régi/új teljes harci JSON-ja és pontkiosztása egyezik; új sablon mentése, authenticated hire és azonos kérés újrahívása, 2 actor / 1 ajánlat: PASS. Teljes tranzakció ROLLBACK; nincs tartós tesztadat vagy DDL. A hajós crew darabszáma toborzáskor nem változott.
- `npm run build`: PASS. A meglévő bundle-méret figyelmeztetés megmarad.
- Új SQL és böngészős ellenőrzés bekerült a combat workflow-ba. A workflow Chromiumot és Firefoxot futtat; ebben a munkakörnyezetben Chromiumot ellenőriztünk, Firefoxot nem állítunk lefutottnak.

## Ami a következő kártyák feladata

HV-070: négy aktív karakter, sorrend, közös készletből felszerelés és karakterenként öt előkészített power. HV-045/073: pozíciós csapatharc. HV-074: XP/reward/run-integráció. HV-075: régi egyszerűsített expedíciós crew, gear- és party-útvonalak végleges kivezetése. Az új társak most még nem kerülnek a régi két-crew-s salvage partyba és a régi 1v1 harcba.
