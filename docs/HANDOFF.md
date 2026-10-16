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
