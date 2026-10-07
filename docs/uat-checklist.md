# UAT ellenőrzőlista – Nintex XML Form Customizer

Kiadás előtt mind az 5 űrlapon (AJ, AT, Form, MU, Ny), mindhárom módban (New / Edit / Display) végig kell menni. Előfeltétel: a teszt-site a `docs/test-lists.md` szerint előkészítve, a tartalomtípusok a `deploy/Set-NintexForms.ps1 -Environment TEST` szkripttel hozzárendelve, `debug: true` a TEST környezetben.

## Minden űrlapon

| # | Ellenőrzés | New | Edit | Display |
|---|---|---|---|---|
| 1 | Az űrlap betölt, nincs hibaüzenet; a diagnosztikai panelen nincs `error` szintű bejegyzés | ☐ | ☐ | ☐ |
| 2 | Elrendezés egyezik a Nintex-űrlappal (pozíciók, méretek, sorrend). `fluent` módban (alapértelmezés) a színek/betűk a SharePoint-témát követik, a fejléckép nincs, és a helye nem marad üresen; `nintex` módban a színek, betűk és a fejléckép is egyeznek | ☐ | ☐ | ☐ |
| 2a | Az egyedi CSS (ha be van állítva) érvényesül, és csak az űrlapra hat | ☐ | ☐ | ☐ |
| 3 | Keskeny ablakban (< 640 px) egyoszlopos, olvasható elrendezés | ☐ | ☐ | ☐ |
| 4 | Címkére kattintva a hozzá tartozó mező kap fókuszt; Tab-sorrend értelmes | ☐ | ☐ | – |
| 5 | Kötelező mezők: üresen mentve hibaüzenet a mező alatt + összesítő üzenet felül | ☐ | ☐ | – |
| 6 | Mentés után a lista nézetben a mezők értéke helyes (People, Lookup, dátum, szám, többértékű mezők) | ☐ | ☐ | – |
| 7 | Edit módban csak a módosított mezők íródnak (a workflow-mezők – `Status`, `ApprovedBy`, `UniHistory` – nem változnak, ha nem nyúltunk hozzájuk) | – | ☐ | – |
| 8 | Mellékletek: feltöltés (New: mentés után), törlés, letöltés | ☐ | ☐ | ☐ |
| 9 | Mégse / Bezárás gomb visszavisz a listára mentés nélkül | ☐ | ☐ | ☐ |
| 10 | Párhuzamos módosítás: két böngészőben szerkesztve a második mentés „Újratöltés” üzenetet ad | – | ☐ | – |
| 11 | A SharePoint oldal többi része (fejléc, navigáció) stílusa nem változik | ☐ | ☐ | ☐ |

## Űrlap-specifikus forgatókönyvek

**AJ – Audit jelentés**
- New: „Készítette” = aktuális felhasználó (nem szerkeszthető); a „Calculated Value” (110/630) nem látszik.
- Edit/Display: a „Készítette” helyén a számított érték látszik (DocCreatedBy, ha üres: Author); nincs elcsúszás alatta.
- Üres „Audit Terv ID”-vel mentés → „Az Audit Terv ID nem lehet üres…” üzenet.

**AT – Audit terv**
- Status = „Jóváhagyott audit” vagy „Audit végrehajtva” → Rendszerelemek/Szervezetek lookupok letiltva.
- „Tervezett dátum” + „Audit típusa” változtatására a viewCategory szöveg azonnal frissül.
- Nem importált elemnél (PlanDate üres) a négy „import” mező rejtett, és a helyük összecsukódik (ha `collapseHiddenRows`).

**Form – Általános dokumentum**
- Új elemnél a „Készítés dátuma” sor rejtett; mentett elemnél látszik.

**MU – Munkautasítás**
- Draft státuszoknál (Készítés alatt / Ellenőrzött / Szöveg kész) a revízió mezők rejtettek.
- „Típus” = `<típus>` értékkel mentve az egyedi validáció üzenete jelenik meg (K-03 szemantika ellenőrzése!).

**Ny – Nyomtatvány**
- A Status csak a „Hungary Owners” csoport tagjainak szerkeszthető.
- Status = „Érvényes” → a „Nem szerkeszthető” szabály 18 mezője letiltva.

## Eredmény

| Űrlap | New | Edit | Display | Megjegyzés |
|---|---|---|---|---|
| AJ | | | | |
| AT | | | | |
| Form | | | | |
| MU | | | | |
| Ny | | | | |
