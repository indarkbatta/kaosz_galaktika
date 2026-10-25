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
