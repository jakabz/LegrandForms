# nintex-form-customizer

Általános SPFx **Form Customizer** (csak SharePoint Online), amely a lista-űrlapokat futásidőben a **Nintex Forms (classic) XML-exportokból** jeleníti meg: elrendezés, szabályok (elrejtés, letiltás, formázás, validáció), számított mezők, mentés PnPjs-sel. Űrlap-specifikus kód nincs – minden az XML-ből és a tartalomtípus konfigurációjából (`ClientSideComponentProperties`) jön.

| | |
|---|---|
| SPFx | 1.23.2 (Heft), Node 22, TypeScript 5.8, React 17.0.1 |
| UI | Fluent UI v8 + PnP SPFx Reusable Controls 3.25 (lusta betöltéssel) |
| Adat | PnPjs v4 |

## Gyors indulás

```bash
nvm use                               # Node 22
npm install
npm test                              # build + lint + unit tesztek
npm run analyze -- samples/*.xml      # offline elemzés → temp/analysis/report.md
npm run build                         # production build + sharepoint/solution/nintex-form-customizer.sppkg
```

Hibakeresés valós listán: `config/serve.json` kitöltése (tenant, site, lista, XML URL), majd `npm start`.
Telepítés és tartalomtípus-hozzárendelés: `deploy/Set-NintexForms.ps1` (leíró: `deploy/forms.json`).

## Dokumentáció

- [Rendszerterv](docs/Rendszerterv.md) – szemantika, architektúra, döntések (20. fejezet: megvalósítási megjegyzések)
- [Telepítés és kipróbálás](docs/Telepites-es-kiprobalas.md) – lépésről lépésre a teszt-site-ig
- [Fejlesztői leírás](docs/Fejlesztoi-leiras.md) – környezet, parancsok, tesztelés, telepítés
- [Teszt-listák](docs/test-lists.md) – a minta űrlapok mezőleltára a teszt-site-hoz
- [UAT ellenőrzőlista](docs/uat-checklist.md)
- [CLAUDE.md](CLAUDE.md) – rövid útmutató a kódbázishoz és a kritikus Nintex-szemantikához

## Szerkezet

```
src/nintex/       tiszta mag (Node-ban is fut): modell, XML-parser, kifejezés-motor, szabálymotor, layout, CSS
src/services/     konfiguráció, definíció-betöltés + cache, PnPjs adatelérés, érték-leképezés, mentés
src/state/        FormStore (értékek, dirty, szabályállapot, hibák) + React hookok
src/components/   NintexForm, FormCanvas, ControlHost, DiagnosticsPanel, controls/
scripts/          offline elemző
deploy/           telepítési leíró és szkript
samples/          Nintex XML minták (teszt fixture-ök – ne szerkeszd)
```
