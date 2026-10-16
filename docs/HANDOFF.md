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
