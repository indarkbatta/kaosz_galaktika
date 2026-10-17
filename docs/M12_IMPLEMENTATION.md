# HATÁRVILÁG — M1.2 implementáció és tesztjegyzőkönyv

## Állapot: forráskód + adatbázis elkészült; éles Vercel-telepítés szándékosan kihagyva
- 2026-10-17: M1.2 GitHub main alatt. Windows self-hosted runner építi. Csak ellenőrzött mérföldköveknél manuális Vercel production deploy (Hobby tier).
- A faj- és kaszteditor továbbra is a közös EditorFrame/EditorTabs komponenseket használja.

## Skill Editor (`src/SkillEditor.tsx`, `src/skill-editor.css`)
- Editor/admin role megnyithatja a meglévő faj- és kaszteditor oldalsávjáról.
- 25 rögzített képesség (5 attribútum × [4 általános + 1 harci]). Az adatbázis trigger tiltja az eredeti attr/position/is_combat slotok módosítását, authenticated role nem INSERT/DELETE-olhat skillt.
- A skill neve és leírása dinamikus game_locales nyelvlistából választható; HU és EN az alap.
- Minden skill külön icon_path-ot kapott: `hatarvilag/skills/<skill_slug>.jpg`. Lehet az útvonalat szerkeszteni, és van képes választó a már hozzárendelt Cloudflare-ikonokhoz.
- Képek: Cloudflare R2 `voidnoir` bucket, publikus read-only `https://assets.voidnoir.net`. Képek saját generálásúak; WoW-féle vizuális sűrűség az inspiráció, nincs másolt WoW-asset.
- Jelenleg nincs jogosultságkezelt, közvetlen böngészős R2-upload. Saját ikon feltöltése Cloudflare-oldalon lehetséges, majd a teljes objektumkulcsot az editorban kell beírni.

## Szabálykonfiguráció
- `public.game_rules` (egy aktív sor, ID=1); editor/admin update, más authenticated csak olvas.
- Default: `base_attribute_pips=3` (1D), `free_attribute_pips=6`, `max_attribute_pips=18` (6D), `free_skill_pips=6`, `max_allocated_skill_pips=6`.
- Skill kiosztásnál a tulajdonságból származó alapkocka + faji és kasztbónusz + kiosztott pipsumma számít; 3 pip = 1D.
- Módosuló szabályok az új karakterekre vonatkoznak; a karakter statjai mentéskor pillanatfelvételként tárolódnak.

## Karaktergeneráló (`src/CharacterPage.tsx`, `src/lib/d6.ts`, `src/character.css`)
- Belépett user a Dashboardon karaktergenerálót kap, ha még nincs kapitánya; egyébként saját karakterlapot.
- Hét lépés: faj, kaszt, kapitánynév, attribútumpontok, skillpontok, kezdő űrhajó, véglegesítés.
- Faj/kaszt +1D és +1 pip tulajdonságbónusz, faji/kaszt skillpipsumma, felhasználó által kiosztott attribútum- és skillpontok.
- 3 induló hajó: Wanderer/Vándor (100 HP/80 cargo/5 speed), Kestrel/Vércse (70/40/9), Bastion/Bástya (155/55/3). Az indító hajókhoz egyelőre nincs 3D/2D grafika.
- Kezdő személyzet: Astra-7 pilóta, Navi-12 navigátor. Kezdeti fiktív seed nevek, később szerkeszthető NPC/crew editor szükséges.
- Szerver-autoritatív `public.create_captain` invoker RPC a `private.create_captain_impl` SECURITY DEFINER függvényt hívja. Validálja: auth, 1 kapitány / fiók, publikált faj/kaszt/hajó, helyes pip keret, attributum és skill maximum, ismert skillkulcsok. Egy tranzakcióban írja a karaktert + 2 legénységi tagot. Direct INSERT/UPDATE nincs a felhasználóknak.
- RLS: characters/character_crew a saját fiókhoz szűrt SELECT; szerepkörök továbbra is a user_roles táblából.
- Egyetlen felhasználónak sem generáltam tesztkapitányt; valódi bejelentkezett E2E teszt szükséges.

## SQL migrációk (Supabase projekt lsodhqokudnfriosqqfe)
- `20261017080000_m12_skills_rules_characters_ship_and_crew.sql`
- `20261017083000_m12_seed_skill_icons_descriptions_and_lock_catalog.sql` — 25 icon_path, 50 lokalizált leírás
- `20261017084000_m12_private_secure_captain_creation.sql` — security definer a private sémában, pub RPC invoker
- Mindhárom éles Supabase-projektre alkalmazva és a GitHubba rögzítve.

## Cloudflare vizuális állapot
- 25 különálló JPG skillikon feltöltve és R2 paginationnel mind a 25 objektum igazolva.
- `hatarvilag/asset-manifest.json` frissítve a 25 ikon listájával; a korábbi faj/kaszt és login képek változatlanok.
- A 3 további kezdőhajó-illusztráció elkészítése a Cloudflare Workers AI napi **ingyenes neuronkeretének kimerülése** miatt sikertelen volt. Nem indítottam fizetős műveletet; a UI saját szimbólummal működik.

## Következő QA / feladatok
1. Self-hosted runner `npm run build` legyen SUCCESS a végleges commitra.
2. Authenticated E2E: editor skill HU/EN leírás + icon_path megváltoztatása és újranyitása; rules update + RLS ellenőrzés.
3. User character wizard: pozitív és negatív pontkiosztási esetek, ismételt create tiltása, szerver RPC egyediség, crew létrehozása.
4. Később: admin kezeli a kezdő hajók, starter crew, játékos hátterek editorait, valódi R2 signed image upload, balance regression tests.
5. Vercel Hobby: nem automatikus; ne publikáljunk csak fejlesztési commit miatt. Manuális M1.2 release csak külön indokkal/döntéssel.
