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

## M2/M3 GAMEPLAY ENGINE — implemented 2026-10-17
- New actual playable loop, not just a UI mockup. Files: `src/CaptainDashboard.tsx`, `src/captain-dashboard.css`, `src/GameplayEditor.tsx`, `src/gameplay-editor.css`, `src/components/LucideSigns.tsx`. Integrated with `src/CharacterPage.tsx`, `src/App.tsx`, and shared Editor sidebar.
- The commander dashboard replaces the static completed-character screen. Four tabs: Bridge/Actions, Character+Skill Upgrades, Ship+Crew, Event Log; HU and EN supported. Fixed height, no page scroll.
- Four seeded playable activities: recon, repair, trade, navigate. Their skill references, energy costs, TN, success/failure XP and HU/EN result texts are database-driven, editable in the new Gameplay Editor.
- Gameplay balance editor edits `gameplay_rules`: energy_max=100, energy_regen_seconds=300, xp_level_base=100, skill_points_per_level=1 by default. Balance updates are server-side, require editor/admin RLS.
- SQL migration applied in Supabase + tracked in GitHub: `supabase/migrations/20261017120000_m20_gameplay_energy_xp_actions.sql` (taken from Supabase recorded migration to guarantee exact parity). Tables: gameplay_rules, game_actions, game_actions_i18n, character_progress, character_skill_upgrades, character_action_log. All RLS enabled.
- `private.perform_game_action_impl` (SECURITY DEFINER) via `public.perform_game_action` (SECURITY INVOKER) locks progress row, computes elapsed regeneration using server clock, enforces energy/skill values, rolls Space D6, awards XP, applies level threshold, atomically saves progress and log. No client-provided dice, XP, or energy accepted.
- `private.upgrade_captain_skill_impl` + public invoker RPC spend earned upgrade points server-side, max +12 bonus pips per skill. Trigger initializes character progression on new captain; existing character creation RPC remains.
- Editor/admin-only `reset_test_captain('RESET')` removes only the caller's OWN captain plus related progress/logs after explicit confirmation, enabling repeated QA; normal users cannot delete.
- QA: actual database transactions with a temporary captain, executed as authenticated role, confirmed real `perform_game_action` roll, energy subtraction, XP reward, level-up with earned pip and spending via `upgrade_captain_skill`; insufficient energy guard raised expected exception. Every test transaction rolled back; final DB counts characters/progress/logs = 0.
- UI character creation: full-bleed vertical species/class images (`object-fit: cover`), attributes background-cover, and Lucide Plus/Minus SVG paths instead of Unicode. New assistant-generated and Cloudflare R2-uploaded tall captain illustration: `hatarvilag/portraits/captain-origin-v1.webp` (353×397; generated portrait cropped from the own concept illustration). Existing HD-v4 race/class/attribute and ship images remain in R2 and fill their bounded cards.
- Image generation output concept reference is not itself a shipped app screenshot; the live source art is the new captain portrait plus prior HD-v4 assets. Future art tasks: replace remaining species/class squares with dedicated high-resolution portrait canvases from the image generator.
- GitHub Windows runner builds must be verified at current head before release. Vercel Hobby policy: **do not automatically deploy**; explicit user authorization for next production release.

## M4.0 — Az első élő szektor (2026-10-17)

- **Valódi kódolt rendszer:** `src/SectorMap.tsx` + `src/sector-map.css`, a `CaptainDashboard` Szektortérkép tabján. Négy geometriával elhelyezett célpont, ismert/első alkalommal ismeretlen helyek, navigációs összeköttetések, kijelölt célpont, közvetlen utazás és energiaköltség, nem görgetős fix keretben.
- Az új kapitány **Határvidéki állomáson** indul. A pozíció, felfedezések és utazási napló külön karakterhez kötött adatbázistáblában tárolódik; régebbi karakterre migrációs backfill van.
- Helyszínek: `frontier_station` (Kereskedelem + Műszaki munka), `wreck_field` (Felderítés + Műszaki munka), `cinder_colony` (Felderítés + Kereskedelem), `rift_gate` (Navigáció + Felderítés). Mindegyikhez magyar és angol leírás.
- Kétirányú kapcsolatok: állomás ↔ roncsmező (8 energia), roncsmező ↔ kolónia (10), állomás ↔ kapu (12), kapu ↔ kolónia (9).
- SQL: `supabase/migrations/20261017122000_m40_sector_locations_routes_travel.sql`. Táblák `game_locations`, `game_locations_i18n`, `game_routes`, `game_location_actions`, `character_positions`, `character_location_discoveries`, `character_travel_log`. Mind RLS; a saját karakterpozíció és utazási napló csak a tulajdonos által olvasható.
- A `public.travel_to_location(p_target)` SECURITY INVOKER RPC a jogosultságellenőrzött `private.travel_to_location_impl` függvényt hívja: pozíció/progress lock, szomszédos publikált útvonal, szerveróra szerinti regeneráció, energialevonás, új pozíció, felfedezés és utazási napló egy DB tranzakcióban. Nem lehet kliensparaméterből energiát, koordinátát vagy pozíciót beállítani.
- A `private.enforce_action_location` trigger a korábban létező Space D6 akciónapló mentésekor ellenőrzi, hogy a skill-alapú akció az adott helyszínen engedélyezett-e. Hiba esetén az egész játékakció visszagörgetődik; energiát/XP-t sem von le.
- **Szektorszerkesztő:** `src/SectorEditor.tsx` + `src/sector-editor.css`, a közös `EditorFrame` és `EditorTabs` felülettel. Editor/admin képes meglévő helyszíneket módosítani, új helyszínt felvenni, szerkeszteni a térképi X/Y-t, publikálást, HU/EN (később bővülő) neveket/leírásokat, helyszínakciókat, kétirányú útvonalakat és energiaköltségeiket.
- SQL: `supabase/migrations/20261017122500_m41_editor_sector_links.sql`. A `public.replace_sector_links` invoker RPC privát definer függvénye atomikusan és csak editor/admin szereppel cseréli az akciókat és az útvonalakat; a választható azonosítókat és a költségeket validálja.
- A kapitányi Napló összefűzi az akciókat és az utazásokat (maximum 9 legutóbbi tétel); tartalmazza az utazási energiaköltséget és a célállomást. A parancsnoki híd csak az aktuális helyszínhez rendelt tevékenységeket jeleníti meg.
- Szerveroldali QA végrehajtva **ROLLBACK** tranzakciókkal: ideiglenes kapitány, állomáson kereskedelem, utazás a roncsmezőbe, nem engedélyezett kereskedelem blokkolása, roncsmezői felderítés, továbbutazás a kolóniára, 3/4 felfedezés; editor szerepkörrel két útvonal és két akció atomikus összerendelése. A teszt nem hagyott karaktert, pozíciót, logot.
- Későbbi körben kell vizsgálni: valós böngészős/auth E2E, kisebb felbontású paneltörések, új helyszín publikálási workflow, helyszínen belüli expedíciós jutalmak, küldetés-/erőforrás-logika. **Ez még nem teljes galaktikus gazdaság vagy harcrendszer.**
- A Vercel Hobby-t csak a legutolsó sikeres CI után, egyetlen tudatos production deploymenttel használjuk. A képek továbbra is az eddigi Cloudflare `voidnoir` R2-n vannak; az új térkép dinamikus SVG koordinátás technikai térkép, nem statikus illusztráció.


## M5.0 / M5.1 — Toast notifications, inventory and action loot (2026-10-17)
- User asked to move ALL normal feedback out of the dashboard/editor content area into lower-right toasts and continue development.
- New global toast event bus: \`src/lib/toast.ts\`, consumer: \`src/components/ToastViewport.tsx\`, style: \`src/components/toast.css\`; mounted once in \`src/App.tsx\`.
- Toast notifications: right-bottom, compact dark/angular, icon + close button, multiple stacked (up to four), ~5.5s auto-dismiss, accessible status/error roles, multiline results. Login/recovery and all current catalogue/skill/gameplay/sector editors now use toasts for normal success/errors. Fatal character load still shows a blocking error screen; actions never add status banners to the game layout.
- Captain dashboard: action success/failure, Space D6 dice, XP, level-up and rewards, ship travel, upgrade-point spend and test reset report through toasts. Station/map action result banners removed. HUD remains the same fixed-height, no-scroll industrial layout.
- **M5 server-backed inventory:** migrations \`supabase/migrations/20261017124500_m50_server_authoritative_loot_inventory.sql\` and \`20261017125000_m51_editor_loot_config.sql\`.
- RLS-enabled tables \`game_items\`, \`game_items_i18n\`, \`game_action_loot\`, \`character_inventory\`, \`character_loot_events\`. Players have select-only rights to OWN inventories/loot events, NO direct insert/update, so clients cannot forge loot.
- Four seeded items in HU/EN: \`alloy_scrap\` (repair), \`encrypted_fragments\` (recon), \`trade_seals\` (trade), \`stellar_charts\` (navigate). Successful actions default to 100% drop, 1–3 or 1–2 units; failure earns none.
- \`private.award_action_loot\` trigger after inserting a \`character_action_log\` row: same DB transaction as existing server-side energy/XP/action result, probability + amount server-calculated, inventory updated with \`ON CONFLICT\`, loot event linked to action log id. Server RPC returns log_id, client reads its specific loot events for the toast.
- Captain's new **Raktér / Cargo** tab displays item names, rarity, description and stack quantity; six-tab navigation remains collision-free.
- GameplayEditor adds **Zsákmány / Loot** tab, allowing editor/admin to set each action's item associations, chance (0–100%) and min/max count. \`public.replace_action_loot\` validates permissions and rule integrity and transactionally swaps definitions; players cannot execute the edit API successfully.
- Database QA: a temporary modified target, successful \`trade\` logged one item event and one inventory unit; a forced failure produced zero items; player has no direct INSERT privilege to inventory or loot events. All tests ROLLBACK, no lasting modification of any real captain.
- Follow-up: own Item Editor (item artwork/icons and craft recipes), currencies and resources spend, encounter-specific loot, expedition steps. The current M5 is the **functional foundation**, not a completed item economy.
- Deploy policy: GitHub Windows self-hosted TypeScript+Vite build must pass at exact commit before ONE Vercel Hobby production deployment. Browser-auth E2E still needs manual verification post-deploy.

## M5.2–M5.3 — Crafting, Item Editor, Cantina, Secure RNG (2026-10-17)

- User requests: 1–5 distinct ingredient materials per craftable item, each with a quantity. New raw materials immediately become selectable in recipes. At the station cantina show 3–5 server-generated NPCs for hire/replacement. All cheating-sensitive calculations/rolls and mutations must be done server-side.
- Item editor implementation: src/ItemEditor.tsx + src/item-editor.css. Uses shared EditorFrame; compact no-scroll General, Recipe and Dictionary tabs. Material CRUD; items with category material are raw inputs without recipe; craftable equipment and consumables require at least 1 and at most 5 distinct published raw materials; other collectible items can optionally have a recipe. Bilingual HU/EN translations with future language extension. Lucide +/- recipe controls. Editor/admin page wired from App/Editor.
- Crafting UI: src/CraftingPanel.tsx + src/crafting-panel.css. Dashboard Cargo has Inventory and Crafting sub-tabs, craft quantity, material counts and server-executed craft button.
- Cantina UI: src/Cantina.tsx + src/cantina.css. Dedicated Cantina game tab (only usable at Frontier Station), five crew positions pilot/navigator/engineer/security/medic. 3–5 candidate cards with randomized name, species portrait, specialty, aptitude 1–5 and slot selector; confirmation dialog required when replacing a crew member. Candidate list and actual crew refresh after recruitment. Seven bounded game tabs maintain no-overlap layout.
- Applied SQL + committed migrations:
  * 20261017130000_m52_recipes_secure_crafting.sql: RLS recipe, secure crafting and log. Seeded circuit_core/polymer_fiber/plasma_cell, field_scanner requiring 2 circuit cores + 1 plasma cell and emergency_patch requiring 2 polymer fibers + 1 circuit core, HU/EN labels and loot sources.
  * 20261017130500_m53_secure_cantina_recruitment.sql: locked persistent per-character random candidates, refreshed on 24-hour server clock, always refilled to 3–5 after hire. Hiring costs 20 energy in vacant slot, replacement 25. Auth UID + station + candidate validation. Five crew slots.
  * 20261017131000_m54_atomic_item_editor.sql: editor-only save_game_item RPC saves item, translations and recipe in one DB transaction with count/category/quantity validation.
  * 20261017131500_m55_private_rpc_execution_grants.sql: correctly grants authenticated execution through public invoker wrappers to secured private implementations.
  * 20261017132000_m56_secure_gameplay_rng.sql: D6 uses cryptographic extensions.gen_random_bytes (rejection sampling); loot probability/quantity also server cryptographic random.
  * 20261017132500_m57_resolve_item_save_conflict.sql: fixes item translations upsert constraint ambiguity.
- Server ownership: clients submit ONLY requested item IDs/amounts or candidate ID/position. Material availability and deductions, resulting items, energy, location, candidate roster, success dice, XP and loot are server-owned, transactionally updated under locking. No direct authenticated INSERT into NPC candidates, UPDATE to character_crew / character_inventory, or UPDATE to recipes. Editors protected by private.can_edit_content.
- Database QA with ROLLBACK: newly created raw item was immediately selectable. Crafting two Field Scanners consumed four circuit cores and two plasma cells. Hiring an engineer took 20 energy. Replacing existing pilot consumed 25, kept 3–5 applicants. Forged candidate UUID and insufficient materials rejected. Successful gameplay action + loot still works with cryptographic D6. No persisted QA mutations.
- Important limitation: crew aptitude is currently informational. It does NOT yet affect rolls, travel, combat, or crafting; that is a future design task.
- Vercel Hobby: only one deliberate production deployment following successful final self-hosted runner TypeScript/Vite build; no auto-deploy. Logged-in visual end-to-end still to test.

## M5.4 — Captain & Crew Equipment, Image Assets, Test Energy (2026-10-17)

**Implemented, not a mockup:**
- Captain equipment: main_weapon, sidearm, body_armor, utility1, utility2, belt, backpack, relic.
- Individual crew equipment: armor, weapon, utility. Crew item metadata has `equip_owner='crew'`; only such items may be equipped in a crew slot. Captain gear similarly restricted.
- New `src/EquipmentInventory.tsx` / `src/equipment-inventory.css`: dark industrial, Diablo-inspired paperdoll and 6-column slot grid in Raktér > Készlet, character tabs (Captain + recruited crew), click-to-equip or drag-to-slot, click to unequip. Zero scrolling in game frame; capacity pagination when needed.
- Character cargo still has Készlet/Gyártás tabs. Crew IDs loaded from Supabase so gear genuinely belongs to a specific `character_crew.id` (not merely a shared role).
- `game_items` metadata: `image_path`, `equip_owner`, `equip_slot`, `capacity_bonus`. Editor configures Cloudflare item paths and slot compatibility. Inventory capacity base 24 distinct positive item stacks; backpack adds configured capacity (+12 starter). Guards on new distinct stacks and backpack removal.
- SQL RLS `character_equipment` is read-only to its owning authenticated captain. `set_equipment(slot,item,crew)` runs via a server-owned, row-locked, atomic RPC; checks authenticated owner, crew ownership, slot compatibility and stock; updates equipment and inventory together. Replacing a crew member returns that member's worn equipment to storage.
- Tiny lightning **test-only refill icon** next to Energy HUD shown to editors/admins; `public.debug_refill_energy()` is a guarded server RPC: auth.uid + `private.can_edit_content()`, updates only caller's captain to configured `gameplay_rules.energy_max`. Other players cannot invoke it.
- Original assistant-generated digital painting item gallery exported into **20 independent square game icons** (128×128 WebP using source illustrations), stored in Cloudflare R2 `voidnoir/hatarvilag/items/<slug>-v2.webp`. 20/20 uploads confirmed by paginated bucket listing. Removed 19 superseded v1 uploads. Cloudflare-backed images referenced from Supabase items and used in Item Editor roster/preview, crafting card and player inventory/equipment. No placeholder UI screenshot used as inventory panel.
- SQL migrations applied and committed: `20261017143000_m58_equipment_schema_debug_energy.sql`, `20261017143200_m59_equipment_secure_rpc.sql`, `20261017143400_m60_seed_equipment_starter_stock.sql`, `20261017143800_m61_item_art_presentation_editor.sql`. Existing captains and future new captains receive six pieces of starter sample gear for functional testing; 11 equipable item types seeded and translated HU/EN.
- Database QA using BEGIN/ROLLBACK: editor refill RPC; backpack 24→36→24 capacity; main/captain/crew equips and unequips; mismatched captain/crew items rejected; authenticated role has no equipment INSERT/UPDATE grants, anon has no refill EXECUTE. All test modifications were rolled back.
- Next progression: persist item effects (attribute/skill modifiers), expand captain backpack weight/grid semantics and portrait artwork, add more uniquely rendered item scenes and item rarity affordances. Equipment currently manages ownership and slotting, without damage bonuses yet.
- Vercel Hobby: deploy ONE production build only after current HEAD self-hosted runner succeeds; logged-in browser E2E still recommended.


## M5.4 stabilizálás — 2026-10-17

**GitHub kód-HEAD:** c0f7ce5cb48bffab1efc145a221bdd2523098982.
**Self-hosted GitHub Actions:** run 39034022059 — SUCCESS (npm run build).
**Supabase migration:** m62_equipment_inventory_stabilization, migrációs DB-verzió 20261017124714, forrás: supabase/migrations/20261017144500_m62_equipment_inventory_stabilization.sql — alkalmazva.
**Vercel:** az előző 70f57ec95a30 production READY; az M62 és az új frontend NINCS publikálva. A projektben tiltva van az automatikus GitHub→Vercel deployment.

### Javítások
- Az inventory kapacitásellenőrzése az összes INSERT és quantity UPDATE után, elhalasztott (commit előtti) constraint triggerrel a végleges állapotot ellenőrzi. Így a 0→pozitív stack újraaktiválása sem kerüli meg a 24/36 slotkorlátot, de a hátizsákcsere tranzakciójának köztes állapota nem okoz téves elutasítást.
- A private.set_equipment_impl csak a teljes felszereléscsere végén ellenőrzi a kapacitást; a célitem levonását, a régi equipment visszarakását és az új hátizsák kapacitását együtt számolja.
- A legénységi csere akkor is visszaadja az equipmentet a raktérbe, ha az új jelölt neve megegyezik a régivel. A crew/character tulajdonjogot adatbázis-szintű összetett idegen kulcs is erősíti.
- A public.get_inventory_capacity() már SECURITY INVOKER; megszűnt az ehhez kapcsolódó Supabase security-definer figyelmeztetés.
- public.save_game_item_full(...) atomikus RPC: itemadatok, HU/EN fordítások, recept, publikálás, képútvonal és felszerelési slot egy műveletben mentődnek. Meglévő, eredetileg recept nélküli equipment is szerkeszthető, miközben új craftolható equipmenthez továbbra is kell recept.
- Az EquipmentInventory kompatibilis inventory-ikonokra kattintva vagy drag-and-droppal is felszerel; a UI az inkompatibilis dropot jelzi, a szerver önállóan validál. Aszinkron mentés esetén a busy-state try/finally kezelést kapott.

### QA
- Élő adatbázison, rollbackelt teszttranzakciókban: kapitányi felszerelés/levétel; hibás captain/crew kompatibilitás elutasítása; +12/-12 backpack slot; azonos nevű recruit equipment-return; recept nélküli gyári equipment szerkesztése az atomi RPC-vel.
- Külön teszt: hátizsákcsere 29 pozitív stack mellett sikeres (átmenetileg 24-es kapacitás ellenére); 0-ról 1-re növeléssel létrehozott 25. stack 24 slotos raktérnél elutasítva. Az összes tesztbeszúrás visszagörgetve.
- Jogosulatlan felhasználó equipment és item editor RPC-hívása elutasítva; az authenticated kliens közvetlen inventory/equipment módosító adatjogai hiányoznak.
- Cloudflare voidnoir/hatarvilag/items/: az adatbázis 20 képútvonalának mindegyike létezik R2-ben, image/webp metaadattal. **Nem 20 különálló kép:** a captain_toolkit-v2.webp és crew_utility-v2.webp tartalma (ETag) azonos, a legénységi utilityhez önálló ábrázolás később szükséges.

### Nyitott
- Valós bejelentkezett browser E2E (különböző monitor- és mobilméretek; drag-and-drop, tooltip, picker, energia debug, képmegjelenés) **nem történt meg**. A sikeres TypeScript/Vite build ezt nem pótolja.
- Párhuzamos crafting/equipment/loot konkurenciatesztek és item-metaadatok visszamenőleges változtatásának (pl. felszerelt backpack kapacitáscsökkenése) végleges termékszabályai további munkát igényelnek.
- auth_leaked_password_protection továbbra is Supabase Auth konfigurációs figyelmeztetés; ez nem az equipment fejlesztés része.
- M5.5 adatvezérelt item-statok és harci módosítók még **nincsenek bevezetve**. Ezeket csak M5.4 valódi böngészős QA után kezdjük el.


## 2026-10-17 — M5.4 paperdoll / saját, külön ikonok / kétirányú DnD

- Felhasználói képernyők alapján a korábbi 4×2 listaszerű EquipmentInventory teljesen át lett építve. Kapitány: középen önálló egész alakos sziluett, körülötte fix 8 ikonméretű slot (főfegyver, oldalfegyver, testpáncél, utility1/2, öv, hátizsák, relikvia). Crew: ugyanilyen paperdoll 3 slotja (armor, weapon, utility). Négyzetes panelek, HTML5 drag-and-drop, saját lapozású 5×6-os raktérrács, üres helyek grafikai tartalom nélkül, pozitív stack számlálóval.
- Drag-drop: raktér→slot felszerelés, slot→raktér levétel (az üres raktárcella is célpont), kompatibilis slot→slot áthelyezés; foglalt Utility 1/2 slot között atomi csere. Kattintásos fallback megmarad. A kliens kizárólag műveleti szándékot küld, a szerver validál.
- Új Supabase M63 migráció: 20261017153500_m63_bidirectional_paperdoll_equipment.sql. private.equipment_item_fits kompatibilitás-ellenőrző, módosított set_equipment_impl a kapitányi utility1/utility2 kereszt-kompatibilitáshoz; public.move_equipment wrapper + private.move_equipment_impl minden crew/tulajdon/slot ellenőrzésével, karakterenként character_progress sorzárolással. Foglalt kompatibilis célslot esetén atomi csere, inkompatibilis cél esetén elutasítás.
- M64 migráció: 20261017162000_m64_original_individual_item_icons.sql, alkalmazva. Az összes 20 eddigi item külön-külön rajzolt, 160×160 px WebP-ikont kapott; **nem az előző nagy képből kivágott** részletek. Objektumok: voidnoir/hatarvilag/items/<slug>-v3.webp. A Cloudflare R2 API szerint mind a 20 fájl létezik, image/webp, 20 különböző ETag. Az adatbázis minden érintett slugját az új képre állítottuk. Eredeti, saját programozott grafikai illusztrációk; **nem** generatív AI festmények, mert a Cloudflare Workers AI napi 10 000 neuron ingyenes kvótája elfogyott. Később további festői részletezéssel cserélhetők.
- SQL QA: crew1→crew2 felszerelésáthelyezés, captain utility1→utility2, foglalt két utility slot atomi megcserélése, slot→inventory visszaadás, inkompatibilis captain→crew áthelyezés elutasítása, itemmennyiségek megőrzése. Valamennyi tesztmódosítás rollbackelt.
- Frontend fájlok: src/EquipmentInventory.tsx, src/equipment-inventory.css; TypeScript/Vite GitHub Actions build SUCCESS a 6e89ef64b81c verzióra, run 39037134678. Production deployment: a következő ellenőrzött release lépés.
- **Nyitott QA:** hitelesített böngészős drag-drop és kisebb képernyők manuális/automatizált tesztje. A Vercel prod build önmagában nem helyettesíti a kattintgatós E2E tesztet.


## 2026-10-18 — M5.4 átadás frissítése és önálló grafikai ág

- Az M58–M61 után az M62, M63 és M64 migrációk is ténylegesen alkalmazva vannak a Supabase-ben. M63: kétirányú drag-and-drop, M64: 20 önálló v3 tárgyikon; a main forráskód ezeket már tartalmazza.
- A 2026-10-18-i fix_starter_crew_specialty migráció él az adatbázisban, és a hiányzó specialty mezőt pótolja a pilot/navigator kezdő legénységnél. A GitHub PR #2 squash merge-dzsel bekerült a main ágba: 8884ae14f277f278d54adaa9d4246b0ab91d3ff3. Ellenőrizve: a private.create_captain_impl új INSERT-je jelen van, a régi nincs.
- Az energiafeltöltő tesztgomb villám karakterét Lucide zap ikonra cseréltük a meglévő LucideSigns komponensben, külső függőség nélkül. Commit: 43b61427b1ac40faee106b7bcf7858c3a90f9f82. Self-hosted GitHub Actions run 39130671092: SUCCESS (TypeScript + Vite). Az előző migration-sync commit CI run 39130541964 szintén SUCCESS.
- Supabase read-only audit (2026-10-18): character_equipment inkompatibilis slotok: 0; nem saját crew equipment: 0; negatív készletstack: 0; üres legénységi specialty: 0. A public set_equipment, move_equipment és debug_refill_energy RPC-kre anon EXECUTE = false, authenticated EXECUTE = true. A private implementációk auth.uid/tulajdon/slot validálását forrásból átnéztük. Ezek nem helyettesítik a bejelentkezett E2E/versenyhelyzet teszteket.
- Cloudflare R2 voidnoir/hatarvilag/ listázás: mind a 72 új reborn objektum létezik, 72 külön ETag, 0 nulla bájtos fájl, 0 hibás content-type. 20 item, 25 skill, 7 faj, 7 kaszt, 5 attribútum, 3 hajó, 2 paperdoll, 1 portré, 1 háttér, 1 embléma. A DB-ben 20/20 item, 25/25 skill, 7/7 faj, 7/7 kaszt már az új assetekre mutat.
- Az új grafikai megjelenítés a különálló art/reborn draft PR #1-ben van, nem része a mai main commitoknak. A review preview Vercel READY (34f5b028ba59aaace4b17e79942969d793af6c23), de az éles frontend továbbra is a korábbi e754803ef57f48d529d95cf2db34e1f227797a9e main állapotot szolgálja ki. A draft grafikai PR kiadásához külön jóváhagyás és bejelentkezett UI-ellenőrzés szükséges; NEM történt új production deploy.
- Nyitott QA: valós böngészős captain/crew inventory kattintásos és oda-vissza DnD, 24/36 capacity vizuális ellenőrzése, gyors konkurens RPC-k és eltérő kijelzőméretek. Supabase security advisor egy figyelmeztetést jelent: auth_leaked_password_protection disabled; Auth-beállítás, nem M5.4 migrációs hiba.


## 2026-10-18 — Gyártási receptböngésző és item tooltip

- Új, kétoszlopos Gyártás UI: a bal oldali receptlista szöveges keresést, kategóriaszűrést és anyagellátottsági szűrőt (Mind/Gyártható/Hiányos) kapott. A lista oldalanként 6 sort mutat, külön előző/következő navigációval; nem hoz létre kívántalan főablak-scrollt.
- A kijelölt recept jobb oldalon saját Cloudflare tárgyképet, lokalizált nevet és leírást, valós item statblockot, alapanyaglistát (készlet / szükséglet), számított anyaglimit szerinti gyártható darabszámot, mennyiségbevitelt és Gyártás gombot mutat. A kliens anyagellátottsági jelzés tájékoztató; a meglévő, tranzakciós public.craft_item RPC változatlanul a szerveroldali jogosultsági és készletellenőrzés végső forrása.
- Az item statblock csak ténylegesen tárolt metaadatokat jelenít meg: kategória, ritkaság, felszerelő szereplő, equipment slot, capacity_bonus. Sebzés/páncél vagy más még nem létező stat nem kerül kitalálásra. A shared HU/EN lokalizáció a src/lib/itemPresentation.ts modulban van; az egységes stat-megjelenítést src/components/ItemDetailView.tsx és item-details.css valósítja meg.
- Inventory tooltip a raktári slotokon, a felszerelt captain/crew slotokon és a click-to-equip tárgyválasztóban: hover + keyboard focus, név, kép, lokalizált tárgyleírás, statblock, készletmennyiség vagy 'felszerelve' állapot. A tooltip react-dom portal használatával megkerüli a görgetés nélküli inventory-panelek levágását, képernyőhatárhoz igazított pozícióval, drag indításakor bezárva. HTML title helyett önálló komponens. Nem módosítja a DnD/RPC folyamatot.
- main feature commitok: adf55b453801b5ec80f5b77f4f80464efe57982e (recipe panel és közös item adatok), b0abbb0ef796d11aaad61a498c4d54e691e28b25 (inventory tooltipek); mindkettő GitHub self-hosted CI build SUCCESS (39139590787, 39139668856).
- A változások az art/reborn grafikai release ágba is beolvasztva a 2101d3873e14bc8ba351ea121fc3cd591c709bce merge commiton, az új WebP paperdoll megtartásával; CI build SUCCESS (39139817386). A #1 art PR továbbra is draft, az automatikus production deploy tiltott.
- További ellenőrzés: valós auth browser E2E hover/pointer/keyboard, no-overlap 720–1440 px és alacsony ablakmagasságokon, full/empty inventory, mennyiség szerinti anyaghiány, lapozás, gyártás utáni automatikus készletfrissítés, R2-image betöltés. Itt csak a build és a read-only séma ellenőrzése igazolt; vizuális E2E-t nem állítunk.


## 2026-10-20 — Hajónként eltérő modulslotok és legénységi állások

- A Hajó fül új `ShipLoadout` felületet használ. Modulok és legénységi állások külön lapokon, saját ikonokkal, kijelölt slot részleteivel és négyesével lapozott kompatibilis készlettel. Kattintásos és kétirányú HTML5 drag-and-drop kezelés; felszerelt modulok kompatibilis helyek között atomi cserével mozgathatók. HU/EN címkék és hibaüzenetek.
- Sparrow: 8 S méretű modulhely, 2 állás; pilóta kötelező, navigátor opcionális. Vagabond: 8 M modulhely (2 segédrendszer), 4 állás; pilóta és navigátor kötelező. Bastion: 11 L modulhely (2 hajtómű, 2 pajzs, 3 fegyver), 5 állás; pilóta, navigátor és gépész kötelező. Minden hajón hajtómű, reaktor és burkolat kötelező.
- 12 új gyártható hajómodul a meglévő recept/inventory rendszerben, külön `game_ship_modules` statokkal. A kisebb modul nagyobb helyre is felszerelhető, a fordítottja és az eltérő rendszertípus tiltott. A kezdő hajók alapmodulokkal és a kötelező személyzettel indulnak; a korábbi karakterekhez egyszeri feltöltés tartozik. A hajó raktér-statisztikája és az inventory különálló 24/+hátizsák stack-korlátja továbbra is külön fogalom.
- A szerver összesíti a burkolat/pajzs/tűzerő/sebesség/raktér/energia statokat. Induláshoz minden kötelező helynek érvényes felszereléssel vagy megfelelő szakterületű és jártasságú taggal kell rendelkeznie, és a reaktorteljesítménynek fedeznie kell a fogyasztást. Utazási költség: max(1, ceil(alapköltség × alapsebesség / tényleges sebesség)); a térkép ugyanazt jelzi.
- RPC-k: `get_ship_loadout`, `set_ship_module`, `move_ship_module`, `assign_ship_crew`. Minden írás tulajdonjogot ellenőriz, a közös character_progress sort zárolja, és nem enged közvetlen kliens táblamódosítást. Crew-csere után a trigger az új szakmának megfelelő állást állítja be; egy tag csak egy helyen dolgozhat.
- Hat migráció ténylegesen alkalmazva a Supabase-ben: 20261019222555, 20261019222627, 20261019222629, 20261020080917, 20261020081000, 20261020081005. A repo ezekkel egyező verziókat tartalmaz; a félbehagyott, nem alkalmazott monolit migrációt eltávolítottuk.
- QA: `supabase/tests/ship_slots.sql` és `ship_slots_movement.sql` az élő DB-n, rollbackelt teszttranzakciókkal sikeresen lefutott. Mindhárom hajó create_captain folyamat, slotprofil, alap üzemképesség, modul visszaadás/újrafelszerelés mennyiségmegőrzése, rossz típus/méret/szakterület elutasítása, engine/pilot hiány miatti utazástiltás, kliens write-jogok hiánya, RLS; külön Bastion atomi csere és üres slotra mozgatás, reaktor levétele és sebességből számított tényleges utazási költség. A tesztadatok nem maradnak meg.
- Supabase advisor: az új táblákra nincs security/performance finding. A korábbi Auth leaked-password warning és régi táblák index/policy észrevételei változatlanok.
- TypeScript/Vite build sikeres. Bejelentkezett böngészős vizuális/DnD ellenőrzés még nincs igazolva; a környezetben nincs helyi böngészőbináris. Production kiadás nem történt.

## 2026-10-21 — M82–M87: character combat, Power Engine and editors

Branch `feature/character-combat-powers`, [PR #9](https://github.com/indarkbatta/kaosz_galaktika/pull/9), based on the working M81 branch behind PR #8, not the older main. The shared server PvE resolver, source-granted powers, passive species/class talents, independent Defense/Health profiles, item combat stats, enemy/encounter authoring and player Combat tab are implemented. 21 powers / 14 talents / 14 profiles cover the seven existing species and seven classes; three training enemies are placed at Frontier Station. Existing skill UUIDs, skill points, inventories, manufacturers, locations and Activity/Challenge rules are preserved. Existing Wild Die and the distinct new exploding combat skill mode are explicitly separated.

M82–M87 are additive migrations. See [combat system and adaptation decisions](combat/COMBAT_SYSTEM.md), [QA evidence and its limits](combat/QA.md), and `supabase/tests/character_combat.sql` for the successful actual authenticated rollback integration. Do not describe the isolated browser/HTTP/PostgreSQL tests as a logged-in production browser session. The final CI checks are attached to PR #9. No main merge or Vercel publication is authorized/performed by this handoff. The previous deployed frontend remains unchanged until a separate release request.

### Roncskutatás térképszerkesztő (2026-10-21)

`feature/salvage-map-editor` starts at `fc71a58` and preserves grouped editor navigation/game edge tabs. Játékmenet → Roncskutatás adds a snapping room/connection editor, four encounter kinds, credit/item loot, HU/EN room/map text, entry, graph validation, undo/redo and atomic revision-checked persistence. Migration `20261021195141_salvage_map_editor.sql` is applied to the linked database; rollback-only real-role integration passes. See `docs/SALVAGE_EDITOR.md` and `.github/workflows/salvage.yml`. This is authoring only; player traversal/reward execution is not added. No Vercel publish or main merge in this task.

Roncskutatás follow-up: optional R2 background + persisted opacity, eight snapped room resize handles, and direct grid-size controls (up to 128×128). Migration `20261021201756_salvage_background_resize.sql`; same editor branch/PR #10. Existing graph safeguards and backward-compatible saves preserved.
