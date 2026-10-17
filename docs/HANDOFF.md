# HATÁRVILÁG — Handoff (2026-10-16)

## Alapelvek
- Terméknév **Határvilág**, a kaosz_galaktika csak a technikai GitHub és Supabase-projekt neve.
- **Minden UI, szerkesztő, játékszöveg és rendszerüzenet lokalizált**: magyar az alapértelmezett, angol választható. Új nyelvek később hozzáadhatók a fordítási szótárak és adatmodell bővítésével. Soha ne égesd feliratként bele a képekbe a UI-szöveget.
- Stílus: ipari-gótikus sci-fi, sötét grafit, acél, visszafogott vörös, szögletes formák, saját komponensek és keretek.
- Játékmenet: **nem levelezős**; a játékos konkrét műveleteket hajt végre. Később idővel regenerálódó energia limitálja az akciókat; mindent szerveroldalon kell hitelesíteni.
## Infrastruktúra
- GitHub: indarkbatta/kaosz_galaktika; self-hosted runner rendelkezésre áll a felhasználó szerint.
- Supabase: kaosz_galaktika — lsodhqokudnfriosqqfe, URL https://lsodhqokudnfriosqqfe.supabase.co. Frontend csak publishable API keyt tartalmazhat.
- Cloudflare: meglévő R2 **voidnoir** bucket. Virtuális mappa prefix: **hatarvilag/**.
  - hatarvilag/backgrounds/ (fő háttérképek)
  - hatarvilag/branding/ (logó, embléma)
  - hatarvilag/ui/ (UI grafikák)
  - hatarvilag/mockups/ (mockupok)
  - hatarvilag/README.txt (prefixjelölő)
- A React frontend a VITE_ASSET_BASE_URL konfiguráció alapján kér be publikus, read-only R2 asseteket. Nincs publikus R2 API token.
## M0: auth, role, i18n
- Supabase Auth e-mail/jelszó, regisztráció, elfelejtett jelszó, session és kijelentkezés.
- public.profiles: megjelenített név + preferred_locale; public.user_roles: user/editor/admin. Mindkét táblán RLS.
- Auth trigger minden új felhasználónál profilt és **user** szerepet készít; user_metadata alapján nem lehet szerepkört emelni.
- User olvashatja szerepkörét; admin a listát; szerepkört a publikus kliens nem módosíthat. Admin/editor felületek role-guard alatt.
- A web UI szótára: src/i18n/{hu,en}.ts; nyelvi beállítás mentése localStorage + profil.
## Következő lépések
1. Regisztráció, jelszó-visszaállítás és email-confirm redirect éles integrációs tesztje (engedélyezett URL-ek és SMTP konfiguráció).
2. R2 grafika import + read-only asset endpoint, VITE_ASSET_BASE_URL; ne mutass kitalált online számokat.
3. Lockfile készítése, telepítés és build vizsgálat self-hosted runneren; CI/deployment konfigurálás.
4. Bővíthető lokalizált játéktartalom-táblák és editor CRUD szigorú RLS-sel.
5. Szerver-autoritatív, tranzakciós energiarendszer, naplózás és exploitvédelem.

## M0.1 — 2026-10-16 igazolt R2 integráció
- A `voidnoir` R2 bucket eredeti, működő custom domainje: **https://assets.voidnoir.net** (a bucket managed r2.dev domainje ki van kapcsolva).
- Feltöltve: `hatarvilag/backgrounds/login-scene.webp` (kezdeti 320×180 optimalizált WebP; később jobb minőségű master assetre cserélendő), `hatarvilag/branding/crest.svg`, `hatarvilag/asset-manifest.json`, `hatarvilag/README.txt`.
- A frontend az asset domaint alapértelmezetten használja, `VITE_ASSET_BASE_URL` felülírhatja.
- A képernyőn megjelenő szövegek továbbra is runtime HU/EN szótárból jönnek, nem kerülnek bele a hátterekbe.
- A jelszóhelyreállítás `PASSWORD_RECOVERY` eseményre áll át és Supabase `updateUser` segítségével cseréli a jelszót.

## Vercel publikációs szabály (2026-10-16)
- Vercel Hobby csapat: `inDarkBatta` (`team_zmK4WGB5jWmDxT9SpRTUqNWa`).
- A gyökérben lévő `vercel.json` beállítja: `git.deploymentEnabled: false` — **nincs automatikus preview/production telepítés egyetlen Git push után sem**.
- Gyakori commitok ellenőrzése kizárólag a helyi Windows self-hosted GitHub Actions runnerrel; a Vercelre csak külön, kifejezett publikálási kérésre küldünk új buildet.
- Vite statikus output: `dist`; SPA fallback rewrite az `index.html` fájlra.
- Supabase Auth-ben a publikált Vercel URL-t hozzá kell adni az engedélyezett `Redirect URLs` listához (és a `Site URL`-t beállítani). Az automatikus auth e-mail megerősítést éles fiókkal tesztelni kell.
- Vercel publishable Supabase key nem titok; secret/service_role kulcs **soha** nem kerülhet frontendbe.

## Vercel deployment status / blocker (2026-10-16 23:xx Europe/Budapest)
- The **inDarkBatta** Hobby team and GitHub repository `indarkbatta/kaosz_galaktika` are both visible through the Vercel connector.
- Requested new project: `hatarvilag`; exact production deployment target: current main.
- **NOT DEPLOYED:** Vercel project creation via both Git-project integration and POST /v11/projects returned **HTTP 403 forbidden** ("You don't have permission to create the project"). There is currently NO known production deployment or public Vercel URL.
- No deployment/build quota was used by these unsuccessful create attempts; no new Vercel project was created.
- `vercel.json` is already committed with `git.deploymentEnabled:false` to prevent automatic deployment consumption. This should remain set; publish manually for authorized milestones.
- To unblock: in the Vercel account/team `inDarkBatta`, authorize project creation for the connected app or manually **Import Git Repository** `indarkbatta/kaosz_galaktika` as `hatarvilag` with Vite, root `.`, build `npm run build`, output `dist`; then publish production once (verify no automatic repeated builds). Do not add untrusted credentials to repo.
- Once a public URL exists, configure Supabase Authentication URL settings (Site URL + allowed Redirect URLs), and verify registration/confirmation and password reset against that exact origin.

## M1 – faj- és kasztszerkesztő (2026-10-17)
- Valódi kétnyelvű CRUD editor: src/Editor.tsx + src/editor.css. Fajok és kasztok készítése/módosítása/publikálása/törlése, saját törlési decision modal, tulajdonságbónuszok + HU/EN mezők, teljes attribútum/skill áttekintés.
- Editor/admin belépés után automatikusan a szerkesztői dashboard jelenik meg; az adatbázis RLS-je ellenőrzi az írási jogokat.
- Supabase applied migration: hatarvilag_species_classes_skills_editor. Táblák: game_species, game_classes, game_species_i18n, game_classes_i18n, game_skills, game_skills_i18n. 7 faj, 7 kaszt, 25 skill HU/EN fordításokkal.
- 5 attribútum: body, mind, soul, morale, social. Mindegyikhez 4 egyedi általános skill és 1 külön harci skill. Elsődleges faji/kaszt bónusz +1D; másodlagos +1 pip. A valódi karaktergenerálás/dice engine következő mérföldkő.
- Az egyetlen meglévő usert editor role-ra állítottuk át. A regisztráció továbbra is biztonságosan user role-t ad.
- Cloudflare R2 voidnoir prefix hatarvilag/: háttér backgrounds/login-space-v2.jpg, 7 db species/<slug>.jpg, 7 db classes/<slug>.jpg. Publikus origin: https://assets.voidnoir.net. Az image_path mezők már összekapcsolva a seedekkel.
- A grafikák Cloudflare Workers AI képgenerálásból kerültek közvetlenül a meglévő R2 bucketbe. Az assetek nyelvfüggetlenek, a megjelenített szöveg kétnyelvű.
- Az editor jelenleg az R2 objektum útvonalát szerkeszti, közvetlen böngészős image upload még nincs. Nincs külön admin szerepkör kezelés ezen a mérföldkövön.
- Vercel Hobby szabály: git.deploymentEnabled=false; GitHub commit nem publikálhat önmagától. Csak külön ellenőrzött mérföldkő-publikálás indokolt.
- Következő: admin role kezelés, skill editor, kétnyelvű további játékadatok, karaktergenerálás és server-authoritative Space D6 játékmag.

## M1 editor completed / verified (2026-10-17)
- Az editor most valódi, jogosultságvédett adatbázis CRUD (faj + kaszt), HU/EN leírásokkal; publikálás, szerkesztés, törlés custom decision modalban, R2 képútvonal, attribútumbónuszok.
- Faj extra mezők: localized passives, strukturált resistances (array of code/value). Kaszt extra mezők: localized starting_equipment, traits, gameplay_role.
- Kiegészítő Supabase migration: hatarvilag_editor_species_class_details. Commitolva: supabase/migrations/20261016224000_hatarvilag_editor_species_class_details.sql.
- Az eredeti catalog migration is GitHubban van: supabase/migrations/20261016220000_hatarvilag_species_classes_skills_editor.sql.
- A Space D6-alapú 5 tulajdonsághoz DB ellenőrzéssel bizonyított: minden attribútumnál 4 általános + 1 harci skill. Faj és kaszt primary +1D és secondary +1 pip bónusz.
- R2 (voidnoir) ténylegesen ellenőrzött tartalom: 1 új login-space-v2.jpg háttér, 7 species/<slug>.jpg, 7 classes/<slug>.jpg, összesen 15 friss játékillusztráció. Manifest: hatarvilag/asset-manifest.json.
- A belépett első és egyetlen felhasználó szerepkörét editorra emeltük. Admin rangot nem adtunk és nem tettük nyilvánosan állíthatóvá.
- GitHub Windows self-hosted runner: TypeScript és production Vite build SIKERES a 2a86d50f5c commiton, run 38974779442.
- Egyszeri, tudatos Vercel production deployment elindítva és READY: dpl_8nLk76btwy6vwSYiocg7k8Yzc5uF, a frontend verziója 2a86d50f5c, https://hatarvilag.vercel.app. A git.deploymentEnabled=false változatlan, tehát új GitHub commitok nem publikálnak automatikusan.
- Nyitott: hitelesített felhasználóval kattintgatós regisztráció+editor CRUD E2E; Supabase Auth leaked password protection beállításához adminisztráció, R2 belső image uploader és játékbeli karaktergenerálás. UI kétdimenziós illusztrált változat, nem a mockup pixelenkénti másolata.

## M1.1 — Egységes, kompakt editor: Skillek és Szótár (2026-10-17)
- Követelmény: faj- és kasztszerkesztő ~60%-os képernyőszélességben, középre igazítva; portrék teljes egészében a kereten belül; skillek és szótár külön tabon.
- Frontend sablon: src/components/EditorTemplate.tsx → EditorFrame + EditorTabs; az új tartalomszerkesztők ugyanazt az elrendezést és tabkomponenst használják.
- src/Editor.tsx ugyanazzal a template-tel szolgálja ki a faj- és kasztadatokat. Három tab: Alapadatok (slug, tulajdonságbónusz, R2 képfájl, fajellenállás, publikálás), Skillek (egyedi bónuszok), Szótár (valamennyi lokalizált mező).
- src/editor.css: 62vw max 1100px, centered, responsive breakpoint; a képek object-fit: contain módban illeszkednek a portré- és listaképkockákba. Szögletes ipari HUD, belső görgetés.
- A skillbónuszok a faji/kaszt tulajdonságbónuszokon felül járnak; 1D = 3 pip: +1, +2, +1D (=3), +1D+1 (=4), +2D (=6) ... +4D (=12). Minden egyes skillhez külön választható érték, a nulla = nincs külön bónusz.
- DB változások (alkalmazva): editor_tabs_languages_skill_bonuses migration. Táblák: public.game_locales, public.game_species_skill_bonuses, public.game_classes_skill_bonuses. Szerverfüggvény: public.replace_catalog_skill_bonuses(kind,entity_id,bonuses), SECURITY INVOKER + explicit editor/admin authorization + RLS, a bónusz-lista atomikus mentésével.
- Második migration alkalmazva: editor_dictionary_locale_foreign_keys. A faj/kaszt/skill fordítások locale mezője FK a game_locales táblára.
- A Szótár tab nem puszta hardcoded HU/EN kapcsoló: dinamikusan olvassa game_locales táblát, editor felvehet új kétbetűs nyelvkódot. A magyar és angol név kötelező, további nyelvek neve és szövege később tölthető fel. Játék runtime UI jelenleg HU/EN, későbbi UI nyelveknél új React szótár és profilséma-bővítés kell.
- Faji lokalizált mezők: név, leírás, passzív sajátosságok. Kaszt lokalizált mezők: név, leírás, kezdő felszerelés, sajátosságok, játékbeli szerep.
- Eltávolítás és mentetlen változások eldobása kizárólag saját editor decision modalban; a tabváltás önmagában nem törli a formot.
- Jogosultság: az editor/admin írhatja a lokális és skillbónusz-adatokat; user nem. Szerveroldali RLS megmarad.
- Vercel Hobby: a git.deploymentEnabled:false beállítás érvényben. Kód commit után csak GitHub self-hosted runner build; nincs automatikus Vercel production telepítés. Ez a verzió a következő tudatos release-ig nem látható a korábbi live Vercel linken.
- Következő QA: valós auth felhasználóval faji/kaszt CRUD teszt, +pip/+D mentés/visszatöltés, új locale, R2 képek kereten belüli megjelenés, mobil breakpoint.

## M1.2 — Skill Editor, karaktergenerálás, Cloudflare skillikonok (2026-10-17)
- Bővebben: [M1.2 implementációs dokumentáció](M12_IMPLEMENTATION.md).
- 25 külön R2 skillikon a voidnoir/hatarvilag/skills/ prefix alatt; a Skill Editorban élő ikon-előnézet és R2-útvonal-mező, plusz galériás kiválasztás.
- A Skill Editor HU/EN és későbbi locale-képes név- és leírásmezőkkel, rule editorral működik; közös EditorFrame/EditorTabs sablonból.
- A karaktergeneráló faj→kaszt→név→5 attribútum pipkiosztás→25 skill kiosztás→3 kezdő hajó→összegzés; karakterlap, 2 legénységi seed.
- Space D6 saját konfigurálható pipszámítás: 3 pip = 1D, faj +1D/+1, kaszt +1D/+1, skillek a faji/kasztból plusz kiosztásból épülnek.
- SQL migration hármas alkalmazva, minden karakterlétrehozási és bónuszszámítási szabályt a Supabase szerveroldal is ellenőriz.
- A definer jogosultságú karakterépítő private sémában él, public RPC csak SECURITY INVOKER, így a Supabase linterből kikerült a public definer-executable figyelmeztetés.
- Vercel Hobby: M1.2 verziót még nem telepítettük, a commitok automatikus buildje tiltva.
- Cloudflare Workers AI napi ingyenes kerete a 25 ikon után elfogyott; ezért a három hajó új illusztrációja egyelőre hiányzik. Nem kapcsoltunk be fizetős opciót.
- QA: self-hosted CI, majd felhasználóval valós böngészős CRUD / karaktergenerálási E2E teszt, továbbá képek méretre optimalizálása szükséges.

## 2026-10-17 — Game art atlas bekötése
- Cloudflare R2 új objektum: `voidnoir/hatarvilag/skills/story-atlas.webp` (640×896, 160170 B), 5×7 festett sci-fi jellegű kártyacsempe: 25 skill mikro-jelenet, 5 tulajdonságjelenet, 3 űrhajó-illusztrációs kompozit (+2 tartalék).
- `src/components/GameArt.tsx` a közös atlaszból CSS background-position módszerrel rendereli a skill, tulajdonság és hajóképeket. A mikro-jelenetek a saját R2 assetjeinkből kompozitként készültek; új WoW-képet vagy idegen védett játékassetet nem használunk.
- Minden skill `game_skills.icon_path` értékét az új atlasz kulcsára cseréljük, miközben a Skill Editorban különálló, saját `hatarvilag/skills/*.webp|jpg` képútvonal is megadható. A három hajó az atlasz saját csempéjét használja.
- Ezek még első generációs kompozit hajóképek. A 256+ px méretű dedikált, festett hajóillusztrációkhoz további szabad képgenerálási keret kell, fizetős kvótát nem kapcsoltunk be.
- App: fix karakterkészítő panel, nem weboldalszerű dashboard; kapitány az első lépés, 5 tulajdonság szerint váltott skillkártyák. A Vercel Hobby-on NINCS automatikus deploy.

## M1.3 — Kötelező képi stílus és görgetésmentes kliens (2026-10-17)
- **Vizuális master referencia:** a felhasználó által jóváhagyott, borostás, középkorú sci-fi kapitány portréja. Követendő stílus: karakterközpontú, stilizált realizmus, kézzel festett digitális game-art, markáns tiszta sziluett, szelektív részletezés és lágyan festett anyagok, ipari grafit/acélkék, visszafogott rozsda-narancs/piros fedélzeti műszerfény. A háttér másodlagos, a történetet az előtér karaktere és akciója meséli. Kerülendő: fotórealista CGI, túlrészletezett filmszerű poszter, neon/arcade, vékony flat/webes piktogram. A stílus KÖTELEZŐ a fajok, kasztok, skillikonok, tulajdonságképek és hajóportrék esetén.
- **Narratív ikonkövetelmény:** a 25 skill egy-egy akciót/szituációt ábrázoló, jól olvasható minifestmény (WoW-hoz hasonlóan egyszerű, de a Határvilág egyedi festett vizuális stílusával). Nincs szükség feliratokra vagy külső márkák grafikáira; semmilyen WoW-védett képet nem használunk.
- **Jelenlegi assetek:** a valóban R2-be feltöltött, közös `hatarvilag/skills/story-atlas.webp` (640×896px, 160170 byte) 5 oszlop × 7 sor képlap: 0–24 skillmikrojelenet, 25–29 tulajdonság, 30–32 hajó, 33–34 tartalék. Minden képet CSS sprite slicing jelenít meg `src/components/GameArt.tsx` alatt. A `game_skills.icon_path` mező mind a 25 rekordnál az új atlaszra mutat; a három induló űrhajó képhivatkozása szintén az atlaszra lett állítva.
- **R2 asset-manifest frissítve:** `hatarvilag/asset-manifest.json` (m1.3): atlasz pozíciók, faj-, kaszt-, hátterek és legacy skillikonok; publikus origin `https://assets.voidnoir.net`.
- **Karakteralkotó UX:** első lépés a kapitány és neve, majd Faj → Kaszt → Tulajdonságok → Skillek → Űrhajó → Véglegesítés. Egy képernyős, fix magasságú ablak az editorok arányaival; nincs hosszú weboldalszerű dokumentumgörgetés. Egyidejűleg csak az aktuális lépés látszik; a skilleknél az öt tulajdonság közötti váltó, a karakterlapon külön lapok. A globális app keret + a v2 készítő komponens CSS-e kezeli a fix viewportot.
- **Kódkomponensek:** `src/CharacterPage.tsx`, `src/character-v2.css`, `src/components/GameArt.tsx`, `src/components/game-art.css`, az `src/App.tsx` különálló, editoroktól független játékos UI-ra irányít. Szerkesztőkben a grafikus SkillArt komponens az új atlaszból dolgozik.
- **Minőségkorlát:** az atlasz 128×128-as csempéi jelenleg első generációs, kézzel szerkesztett kompozitok. A három hajó nagy képernyős nagyfelbontású önálló illusztrációval később helyettesíthető. A frontend maga teljes, de pixelpontos, bejelentkezett böngészős E2E ellenőrzése még hátravan.
- **CI:** a Windowsos GitHub self-hosted runner sikeresen fordította az m1.3-as verziót (run `39012761643`). Vercel Hobby: az automatikus deploy változatlanul tiltva van; a commitok önmagukban NEM publikálnak.

## M1.3 ART REPLACEMENT — saját generálás, Cloudflare kizárólag tárhely (2026-10-17, aktuális forrás)
**Ez a szakasz felülírja a fentebb említett korábbi `hatarvilag/skills/story-atlas.webp` hivatkozásokat. Az az atlasz legacy.**
- A grafikai fájlok az asszisztens saját képgenerálásával készültek; NEM Cloudflare Workers AI generált grafika. A Cloudflare itt csak R2 objektumtár.
- Jelenleg aktív R2 kép: `voidnoir/hatarvilag/art/game-atlas-v3.avif`, public read URL: `https://assets.voidnoir.net/hatarvilag/art/game-atlas-v3.avif`.
- Tényleges R2 ellenőrzés: 480x500 AVIF, 6893 byte, ETag/MD5 `ccc0485bf2bfe5417222255a13ccc488`; korábbi képből generált 25 narratív skilljelenet, 5 festett tulajdonságportré, 3 hajófestmény; saját készítésű, nem WoW asset.
- Atlasz kompozíció: 0–24: 5x5 db 64x64 képszelet (0<=x<320, 0<=y<320); 25–29: 5 db 80x80 attribútum (x=0,80,...320, y=320); 30–32: 3 db 160x100 űrhajó (x=0,160,320, y=400). `GameArt.tsx` tile(x,y,w,h) precíz háttérpozícióval vágja ki őket.
- Az aktív art-ot minden játékképernyő a `SkillArt`, `AttributeArt`, `ShipArt` komponenseken keresztül használja; a skill editor ikon galériája és faj/kaszt-editor skill-bónusz listája is.
- Supabase: mind a 25 `game_skills.icon_path` és mind a 3 `game_starter_ships.image_path` az új atlaszra mutat. SQL migráció: `20261017093000_m13_original_painted_atlas_r2_path.sql`; a skill ikonmező AVIF-et és art/ útvonalat is támogat, editor személyre szabott képe továbbra is beállítható.
- 10 köztes átviteli chunkot eltávolítottunk az R2-ből, a kész atlasz megmaradt. Számlázható AI modell futtatását a Cloudflare-en NEM végeztük ebben a körben.
- UI UX: kapitány → faj → kaszt → tulajdonságok → skillek → hajó → véglegesítés; tulajdonság szerinti skill panel; fix alkalmazás-magasság és scroll nélküli nézet, nem régi széthúzott dashboard.
- M1.3 CI: self-hosted `tsc --noEmit && vite build` sikeresen ellenőrizve; a legutolsó dokumentációs/migrációs commit build eredményét mindig ellenőrizni kell.
- Vercel: HOBBY, korábbi elv érvényben — nincs automatikus deploy; az aktuális új művészeti irány csak a GitHub/DB/R2 forrásokban van, publikálást külön felhasználói kérésre végezzünk.


## M1.4 — High-resolution R2 asset upgrade (2026-10-17)

**User request:** 33 illustrations are blurry. Root cause: the previous M1.3 `game-atlas-v3.avif` is only 480×500 pixels, with skill crops 64×64, attribute crops 80×80 and ship crops 160×100. Rendering these in larger card panels caused resampling blur. Upscaling the old atlas would not recover source detail.

**Implemented:**
- The original high-resolution generated source artwork already existed. Re-exported from the original images, *not* resized from the previously compressed low-resolution atlas.
- 25 individually stored skill illustrations: `voidnoir/hatarvilag/skills/<slug>-hd-v4.avif`, approximately 245×245 pixels from the original 1254×1254 / 5×5 grid.
- 5 individually stored attribute illustrations: `voidnoir/hatarvilag/attributes/<attribute>-hd-v4.avif`, approx 390–470 pixels per source crop.
- 3 individually stored starter ship paintings: `voidnoir/hatarvilag/ships/<ship>-hd-v4.avif`, **1448×1086** pixels, original image dimensions.
- Total **33 new image objects, about 1.1 MB**. Cloudflare R2 list with pagination verified 25/25 skill images, 5/5 attributes and 3/3 ships.
- `src/components/GameArt.tsx` now maps directly to **individual high-resolution Cloudflare R2 files**, supports per-skill custom `icon_path`, and retains legacy fallbacks to HD defaults. `background-size: contain` prevents cropping/overstretch.
- Supabase applied migration `m14_hd_individual_cloudflare_game_assets` changes published `game_skills.icon_path` and `game_starter_ships.image_path` from the legacy atlas to their dedicated files without overwriting custom image assignments.
- Canonical HD manifest: `https://assets.voidnoir.net/hatarvilag/art/manifest-hd-v4.json`. The 480×500 atlas is **DEPRECATED**, must not be reused for any new game art.
- Artwork preserves the approved dramatic digitally painted dark industrial sci-fi art direction, with each skill as a narrative scene, five evocative attribute paintings, and three clearly identifiable spacecraft.
- Vercel Hobby discipline: only one intentional production deploy after verified build when needed; GitHub commits remain disconnected from automatic Vercel deploy.
- Follow-up validation: inspect images at common display sizes and high-DPI; test logged-in CharacterPage/SkillEditor after production deployment.

**Asset pipeline rule:** For new content, upload individual files at native source resolution (or at least 256×256 for skill cards; 400×400 for attribute cards; 1200px+ for ships). Prefer AVIF/WebP with quality sufficient to retain painted details. Do not pack images into tiny atlases merely to minimize byte size. Use versioned keys to avoid stale Cloudflare/browser caches.
