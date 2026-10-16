# HATÁRVILÁG

Böngészős, interaktív sci-fi játék HU alapnyelvvel és EN választható nyelvvel. A GitHub-repó technikai neve kaosz_galaktika, a termék neve **Határvilág**.

## Fejlesztés
Node 22 szükséges. Futtatás: npm install, npm run dev, npm run build. A webes felület React/TypeScript/Vite + Supabase Auth. A publikus Supabase konfiguráció a .env.example fájlban van. A fájlban kizárólag publishable kulcs szerepelhet.

A kétnyelvű, bővíthető szótár a src/i18n könyvtárban található. Az auth és jogosultságok szerveroldalon érvényesítettek (Supabase RLS). A részletes projektállapot a docs/HANDOFF.md fájlban olvasható.

**R2 runtime asset origin:** https://assets.voidnoir.net; meglévő bucket: `voidnoir`, kulcsprefix `hatarvilag/`. A bejelentkező háttér az első körös kisfelbontású változat. Cloudflare tárhelystruktúra és további lépések: [docs/HANDOFF.md](docs/HANDOFF.md).
