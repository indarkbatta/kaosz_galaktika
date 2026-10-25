# HV-082 — Döntési ablakok és szerkesztői munkafelületek

## Közös döntési ablak

`src/components/DecisionDialog.tsx`, megjelenés a közös `editor.css` fájlban. A faj/kaszt, hajó, legénységi sablon/kaszt, expedíciós társ, frakció, harci tartalom, kihívás, galaxis, roncstérkép, talentfa, világtérkép, tárgy és harci megjelenítés szerkesztők elvetési ablakai ugyanazt a komponenst használják. A saját tesztkapitány törlése is közös ablakban marad, a meglévő RESET megerősítéssel. Nincs új automatikus adat- vagy karaktertörlés.

Cím + olvasható következmény + konkrét műveletnevek. Elvetés: „Kilépsz mentés nélkül?”, „Vissza a szerkesztéshez”, „Módosítások elvetése”; a szöveg külön jelzi, hogy a mentett tartalom megmarad. A törlési ablak végleges törlésre figyelmeztet, a faj/kaszt törlésénél azonosítja a bejegyzést. Nincs általános Igen/Nem pár. Közös Lucide ikonok, négyzetes keret, rendezett header/body/footer, háttérleválasztás.

Biztonságos kezdőfókusz a visszalépésen, Tab-csapda, Escape = visszalépés, fókuszvisszaállítás, `alertdialog`, cím/leírás ARIA-kapcsolat, portal a body alatt. Háttérkattintás nem indít el műveletet. A natív ablakelhagyási figyelmeztetés továbbra a böngésző feladata.

## Editorok

A blueprint editor képes komponenskártyákat, olvasható kiválasztót, konkrét helytípus-fejlécet, közös sakktáblás hátterű, valóban négyzetes előnézetet és húzással mozgatható alkatrészeket kapott. Nyilak: 1% finom mozgatás; Shift+nyíl: 5%. A képre kattintás kijelöli az alkatrész helyét. A mozgatás továbbra a meglévő mentett X/Y adatokat használja, schema/RPC változás nélkül.

A harci megjelenítés editor képkocka-bélyegképekkel, konkrét üres állapotokkal, egyértelmű mentési állapottal, helyes négyzetes vászonnal és olvasható segédszöveggel működik. A korábban mentett párosítást tölti be új üres draft helyett.

`editorMessages.ts`: a két új editorban érthető jogosultsági, hálózati, kompatibilitási, függőségi, validációs és verzióütközési üzenetek; SQL stack/constraint neveket nem írunk ki. Újratöltésnél a mentetlen változtatások csak a közös megerősítés után vesznek el. Mentés közben külön állapot, üres új konfigurációra nem írjuk azt, hogy „Mentve”.

## Ellenőrzés

Build PASS. Chromium headless-shell, HU/EN, 1920×1080 / 1366×768 / 1280×720:

- decision-dialog-browser: biztonságos fókusz, Tab, Escape, fókuszvisszaállítás, typed destructive confirmation;
- equipment-blueprints-browser: meglévő öt alternatívás mentés/visszaolvasás, új pointer drag + billentyűs mozgatás, valós SQL revízióütközés → olvasható üzenet → munka megőrzése → újratöltés megszakítása/elvetése, computed style, square canvas, overflow;
- combat-visuals-browser: frame/anchor roundtrip, képletöltés, közös mezőstílus, square canvas és overflow.

1280×720 screenshot és döntési ablak vizuálisan átnézve. Firefox helyben nem igazolt; CI mindkét böngészőre felkészítve. Az érintett régi tesztek dialog-szerep- és gombnevei a közös komponenshez igazítva.

Nincs migráció vagy deploy ebben a blokkban. A production a korábbi b48523cb kiadás marad, amíg külön élesítés nem történik.

## Rekordlisták jobb oldalon (2026-10-25)

Felhasználói kérésre minden közös EditorFrame-et használó tartalomszerkesztőben a sorrend: bal oldali EditorNavigation, középső ed-editor, jobb oldali EditorRoster. A rekordlista desktopon az eddigi 232 helyett 464 px; az 1150 px alatti régi 222 px helyett 444 px. A teljes ablak felső szélességhatára 232 px-lel nőtt (1632 / 1572 px), 94vw korláttal. A mezők, gombok, tabok közös stílusa változatlan, csak a közös elrendezés és a lista elválasztó oldala módosult. Mobilon a meglévő egymás alatti nézet marad. Az adaptív listakapacitás az új geometriát automatikusan méri.

`tools/qa/editor-roster-layout.mjs`: közös böngészős geometriaellenőrzés a Komponensek, Blueprint és harci megjelenítés tesztjében; menü/szerkesztő/lista sorrend, 464 px listaszélesség és képernyőn belüli ablak HU/EN 1920×1080,1366×768,1280×720.

## Egységes görgethető rekordlisták (2026-10-25)

Új, kifejezett felhasználói döntés felülírja a korábbi fix és automatikus lapozást: minden tartalomszerkesztő rekordlistája görgethető. Faj/kaszt, szolgálati crew-sablonok és portrékatalógusok, crew-kaszt/faji bónusz, expedíciós társ-sablonok, hajók, harci megjelenések, Blueprint és Komponensek rekordlistáiból a slice és a lapozó kikerült. A korábban is teljes listát használó editorok ugyanazt a közös listagörgetést kapják. Keresés, szűrés, kiválasztás, mentetlen védelem megmarad; jobb oldali, kétszeres szélesség változatlan. Csak a rekordlista görget: saját közös scrollbar, a fejlécek/keresők és a szerkesztő helyben maradnak. A useRosterCapacity kivezetve. A belső animációs képkockaválasztó, portréválasztó, skill-lapok és egyéb szerkesztési lépések nem rekordkatalógusok, ez a döntés a listapanelre vonatkozik.

QA a korábbi lapozás helyett a teljes rekordkészletet és a valódi görgetéssel elérhető utolsó sort ellenőrzi; komponensszűrők, mentés/újratöltés és a jobb oldali 464px-es geometria marad.
