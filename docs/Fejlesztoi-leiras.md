# Fejlesztői leírás – Nintex-alapú SPFx Form Customizer

Ez a leírás a fejlesztőknek szól: környezet, projekt létrehozása, felépítés, konvenciók, hibakeresés, tesztelés, telepítés. A *miért*-ekhez lásd a [Rendszerterv](./Rendszerterv.md)-et.

---

## 1. Fejlesztői környezet

| Eszköz | Verzió | Megjegyzés |
|---|---|---|
| Node.js | **22.x LTS** | SPFx 1.22+ csak Node 22-t támogat. Ajánlott: `nvm` / `nvm-windows`, a repóban `.nvmrc` = `22` |
| npm | a Node 22-vel érkező | `pnpm`/`yarn` nem támogatott hivatalosan |
| SPFx | **1.23.x** (vagy a scaffold napján legfrissebb stabil) | Heft-alapú toolchain (nincs gulp) |
| TypeScript | 5.8 (a scaffold adja) | ne írd felül kézzel |
| React | **17.0.1** (az SPFx rögzíti) | **ne frissítsd** – a SharePoint futtatókörnyezet ezt adja |
| VS Code | aktuális | bővítmények: ESLint, Prettier, Jest, Claude Code |
| Böngésző | Edge/Chrome | SharePoint Framework Debug Toolbar a hibakereséshez |
| PnP PowerShell vagy CLI for Microsoft 365 | aktuális | tartalomtípus-hozzárendelés, telepítés |

A repó gyökerében lévő `.nvmrc` miatt elég `nvm use` (macOS/Linux) – ha a rendszer Node-ja újabb (pl. 24/26), a Heft build és a tesztek akkor is a 22-es verzióval futtatandók.

Ellenőrzés:

```powershell
node -v          # v22.x
npm -v
npm view @microsoft/generator-sharepoint version   # legfrissebb stabil SPFx
```

> A *Hosted Workbench* 2026. december 1-jén megszűnik; Form Customizert amúgy sem ott, hanem a valós listán, a debug toolbarral / `serve.json` konfigurációval teszteljük.

---

## 2. Projekt létrehozása (egyszeri)

> **Állapot:** a scaffold elkészült (SPFx **1.23.2**, Yeoman generátor, `nintex-form-customizer`, Extension → Form Customizer → React, component id `3dfda748-218b-4cd1-8967-537b5d9c49ef`). Ez a fejezet csak újra-scaffoldoláshoz / frissítéshez kell. A tényleges függőségek: `@pnp/sp` 4.21, `@pnp/spfx-controls-react` **3.25.0** (pontosan rögzítve – ez az SPFx 1.23-hoz tartozó sor), `fast-xml-parser` 5, `dompurify` 3 (saját típusokkal, `@types/dompurify` nem kell), fejlesztéshez `@testing-library/react` 12, `@types/node` 22, `tsx`.

### 2.1 Scaffold

Két út van; az SPFx CLI 1.23-ban preview-ként jelent meg, a Yeoman generátor még támogatott.

**A) Yeoman (stabil út):**

```powershell
npm install -g yo @microsoft/generator-sharepoint@latest
mkdir nintex-form-customizer; cd nintex-form-customizer
yo @microsoft/sharepoint
#  Solution name:          nintex-form-customizer
#  Component type:         Extension
#  Extension type:         Form Customizer
#  Name:                   NintexForm
#  Template:               React
```

**B) SPFx CLI (új út):**

```powershell
npm install -g @microsoft/spfx-cli
spfx create --help          # nézd meg a form customizer sablon nevét
spfx create --template <form-customizer-react> --library-name nintex-form-customizer --component-name "NintexForm"
```

Ha a scaffold után `package.json`-ban az `@microsoft/sp-*` csomagok verziója nem a legfrissebb stabil, azonnal frissítsd:

```powershell
npx -p @pnp/cli-microsoft365@latest m365 spfx project upgrade --output md
```

### 2.2 Függőségek

```powershell
npm install @pnp/sp@^4 @pnp/spfx-controls-react fast-xml-parser dompurify
npm install -D @types/dompurify @testing-library/react@^12
```

- `@pnp/spfx-controls-react`: a főverziót az SPFx-verzióhoz igazítsd (lásd a PnP controls kompatibilitási tábláját).
- `@fluentui/react` (v8) már a scaffoldban van; **Fluent v9-et ne keverd be** (bundle-méret, eltérő téma).
- `@testing-library/react@^12` a React 17 miatt (a 13+ React 18-at kér).

### 2.3 Minták és dokumentumok bemásolása

```
samples/AJForm.xml  samples/ATForm.xml  samples/Form.xml  samples/MUForm.xml  samples/NyForm.xml
docs/Rendszerterv.md  docs/Fejlesztoi-leiras.md
CLAUDE.md
.nvmrc   (tartalma: 22)
```

A `samples/` mappa a tesztek fixture-forrása – **ne szerkeszd** a fájlokat; új esetet új fájlként adj hozzá (`samples/edge-cases/*.xml`).

---

## 3. Mappaszerkezet

```
src/
├─ extensions/nintexForm/      SPFx belépési pont + manifest + loc
├─ nintex/                     PLATFORMFÜGGETLEN MAG (Node-ban is fut)
│  ├─ model/                   típusok
│  ├─ parser/                  XML → FormDefinition
│  ├─ expression/              lexer, parser, AST, evaluator, functions/
│  ├─ rules/                   RuleEngine, dependencyGraph
│  ├─ layout/                  absolute, responsive, collapse
│  └─ css/                     cleaner, scoper
├─ services/                   SPFx/PnPjs-függő szolgáltatások
├─ state/                      FormStore + hookok
└─ components/                 React UI (controls/ típusonként egy fájl)
scripts/analyze-nintex.ts      offline XML-elemző
samples/                       Nintex XML minták
```

**Függőségi szabály** (ESLint `no-restricted-imports`-szal kikényszerítve):

```
components → state → services → nintex
                 ↘─────────────→ nintex
nintex  ✗→ (react, @microsoft/*, @pnp/*, window/document)
```

---

## 4. Parancsok

A Heft-alapú projektben a `package.json` scriptjei Heft-parancsokat hívnak. A scaffold által generált neveket használd; a projekt-specifikus kiegészítéseket ide vedd fel:

| Parancs | Mit csinál |
|---|---|
| `npm run build` | production build + lint + tesztek + `.sppkg` (`heft test --clean --production && heft package-solution --production`) |
| `npm start` | helyi kiszolgálás (`config/serve.json`; `--serve-config nintexForm_EditForm` stb.) |
| `npm test` | debug build + lint + Jest (`heft test --clean`) |
| `npm run test:watch` | Jest figyelő módban |
| `npm run analyze -- samples/*.xml` | offline elemző: `temp/analysis/<név>.json` (modell) + `temp/analysis/report.md` (diagnosztika, kötött mezők, külső függőségek); `--fail-on-error` CI-hoz, `--out <mappa>` |
| `npm run package` | ugyanaz, mint a `build` (kiadáshoz) |
| `npm run clean` | build-kimenetek törlése |

Az elemző a `tsx` futtatót használja (`"analyze": "tsx scripts/analyze-nintex.ts"`), mert a `src/nintex` modulok kiterjesztés nélküli TS-importjait a natív `--experimental-strip-types` nem oldja fel. Windows-on a `samples/*.xml` mintát a szkript maga bontja ki.

---

## 5. Hibakeresés valós listán

### 5.1 `config/serve.json`

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/spfx-build/spfx-serve.schema.json",
  "port": 4321,
  "https": true,
  "serveConfigurations": {
    "default": {
      "pageUrl": "https://<tenant>.sharepoint.com/sites/<site>/_layouts/15/SPListForm.aspx",
      "formCustomizer": {
        "componentId": "<NintexForm manifest id>",
        "PageType": 8,
        "RootFolder": "/sites/<site>/Lists/AuditJelentesek",
        "properties": {
          "formDefinitionUrl": "/sites/<site>/FormDefinitions/AJForm.xml",
          "debug": true
        }
      }
    },
    "edit": {
      "pageUrl": "https://<tenant>.sharepoint.com/sites/<site>/_layouts/15/SPListForm.aspx",
      "formCustomizer": {
        "componentId": "<NintexForm manifest id>",
        "PageType": 6,
        "RootFolder": "/sites/<site>/Lists/AuditJelentesek",
        "ID": 1,
        "properties": { "formDefinitionUrl": "/sites/<site>/FormDefinitions/AJForm.xml", "debug": true }
      }
    },
    "display": {
      "pageUrl": "https://<tenant>.sharepoint.com/sites/<site>/_layouts/15/SPListForm.aspx",
      "formCustomizer": {
        "componentId": "<NintexForm manifest id>",
        "PageType": 4,
        "RootFolder": "/sites/<site>/Lists/AuditJelentesek",
        "ID": 1,
        "properties": { "formDefinitionUrl": "/sites/<site>/FormDefinitions/AJForm.xml", "debug": true }
      }
    }
  }
}
```

`PageType`: 8 = New, 6 = Edit, 4 = Display. A scaffold által generált `serve.json` a hiteles formátum – a fenti csak a kitöltendő értékeket mutatja.

### 5.2 Tesztkörnyezet előkészítése (egyszer)
1. Teszt-site SPO-ban, listák a minták sémája szerint (lásd `docs/test-lists.md` – M1-ben elkészítendő PnP provisioning sablon).
2. `FormDefinitions` dokumentumtár, benne a `samples/*.xml`.
3. Lookup-forráslisták (`Rendszerelemek`, `Szervezetek`) néhány elemmel.
4. SP-csoportok: `Hungary Members`, `Hungary Owners`.

### 5.3 Diagnosztikai mód
`properties.debug = true` vagy (csak debug buildben) `?nfDebug=1`: oldalpanel a diagnosztikákkal, szabály-nyomkövetéssel, vezérlő-ID overlay-jel.

### 5.4 Megjelenés kipróbálása
A `serve.json` `properties` részében (vagy a tartalomtípuson) a `styleMode` (`"fluent"` – alapértelmezés, vagy `"nintex"`), a `hideImages` és a `customCssUrl` állítható (Rendszerterv 11.4, 10.5). Gyors váltás URL-paraméterrel, újraindítás nélkül:

| Paraméter | Hatás | Mikor működik |
|---|---|---|
| `?nfStyle=nintex` / `?nfStyle=fluent` | stílusmód | debug build **vagy** `debug: true` a tartalomtípuson |
| `?nfHideImages=0` / `=1` | képek mutatása / elrejtése | debug build **vagy** `debug: true` |
| `?nfCss=/sites/<site>/FormDefinitions/x.css` | egyedi CSS | csak debug build (`npm start`) |

Példa egyedi CSS-re (`AJForm.custom.css`):

```css
/* minden szövegmező kerete */
.nf-ctl-textbox .ms-TextField-fieldGroup { border-color: #0078d4; }
/* egy vezérlő a Nintex-neve alapján */
[data-control-name="Title"] .nf-control-content { font-weight: 600; }
/* csak Nintex módban: az inline XML-stílus felülírásához !important kell */
.nf-style-nintex .nf-ctl-label .nf-filler-control-inner { color: #333 !important; }
```

A szelektorok automatikusan az adott űrlap gyökere (`.nf-root-<formId>`) alá kerülnek; az `@import`, `expression()` és `javascript:` tiltott. Relatív `url(...)` az oldalhoz képest oldódik fel, ezért szerver-relatív URL-t használj.

---

## 6. Hogyan…?

### 6.1 …adjak hozzá új vezérlőtípust
1. `src/nintex/model/controls.ts` – új interfész, felvétel a `ControlDefinition` unióba és a `ControlType` enumba.
2. `src/nintex/parser/controlParsers/<Type>Parser.ts` – `(node: XmlNode, ctx: ParseContext) => <Type>Control`; regisztrálás a `controlParsers/index.ts` térképben az `i:type` név (prefix nélkül) **és** a `FormControlTypeUniqueId` alapján.
3. `src/services/ValueMapper.ts` – ha mezőhöz kötött: olvasás/írás leképezés.
4. `src/components/controls/<Type>Control.tsx` – `IControlProps<TDef>` implementáció; Display módban csak olvasható megjelenítés.
5. `src/components/controls/registry.ts` – regisztrálás.
6. Tesztek: parser unit teszt (XML-részlettel), komponens teszt, ha van mintában: snapshot frissítés (`npm test -- -u`, majd a diffet **átnézni**).

### 6.2 …adjak hozzá új kifejezés-függvényt
```ts
// src/nintex/expression/functions/text.ts
registerFunction('reverse', (args) => toText(args[0]).split('').reverse().join(''), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('reverse', 'fn-Reverse');            // további nevek (a Nintex fn-… változatai)

// vezérlési szerkezet: kiértékeletlen argumentumokat kap
registerLazyFunction('coalesce', (args, ctx, evaluate) => { … });
```
- A függvényfájlokat a `functions/index.ts` importálja (regisztráció mellékhatásként) – új fájlt ott is fel kell venni.
- A `minArgs`/`maxArgs` alapján a parser statikusan ellenőrzi a hívásokat (`ExpressionParseError` diagnosztika).
- Név kis/nagybetű-független; kötőjelet tartalmazhat (`fn-IsMemberOfGroup`).
- Csak **szinkron** függvény lehet. Ha külső adat kell, azt a `EvaluationContext`-be töltsd elő a betöltéskor (`SpDataService` → `FormStore.init`).
- `lazy: true` csak vezérlési szerkezeteknél (`If`, `and`, `or`).
- Teszt: `functions/__tests__/<file>.test.ts`, határesetek: `null`, `""`, tömb, Date.

### 6.3 …kezeljek új hivatkozás-névteret (pl. `{WorkflowVariable:X}`)
`src/nintex/expression/references.ts` – `resolvers[namespace]`; ismeretlen névtér → `null` + `UnsupportedReference` diagnosztika.

### 6.4 …vegyek fel új XML-t éles használatra
1. `npm run analyze -- path/Uj.xml` → nézd át a `warn`/`error` diagnosztikákat.
2. Ha van nem támogatott elem: issue + döntés (megvalósítás vagy elfogadott korlát).
3. XML feltöltése a `FormDefinitions` tárba, tartalomtípus-hozzárendelés (8. fejezet).

---

## 7. Kódolási konvenciók

- **Nyelv:** kód, azonosítók, kommentek angolul; felhasználói szövegek a `loc/` fájlokban (alapértelmezett `hu-hu`). A dokumentáció magyar.
- **TypeScript:** `strict: true`, `noImplicitAny`, `any` helyett `unknown` + szűkítés. Nyilvános API-kra JSDoc.
- **Nincs:** `eval`, `new Function`, `dangerouslySetInnerHTML` DOMPurify nélkül, globális CSS (minden stílus `.module.scss` vagy scope-olt).
- **Immutabilitás:** a `FormDefinition` parse után `Object.freeze`-elt (dev buildben mélyen).
- **GUID-ok:** mindig kisbetűs, kapcsos zárójel nélkül.
- **Fluent UI v8 importok:** `import { TextField } from "@fluentui/react/lib/TextField";` (tree-shaking).
- **React:** függvénykomponensek + hookok; `React.memo` a vezérlőkön; állapot a `FormStore`-ban, nem komponens-state-ben (kivéve tisztán UI-állapot, pl. nyitott legördülő).
- **Hibakezelés:** a `nintex/` mag nem dob kivételt XML/kifejezés-hibára → `Diagnostic`-ot ad vissza. Kivétel csak programozási hibára.
- **Commit:** Conventional Commits (`feat(parser): …`, `fix(rules): …`), magyar vagy angol leírás.
- **Formázás:** Prettier (scaffold ESLint konfig + `eslint-config-prettier`).

---

## 8. Telepítés

### 8.1 Csomag
```powershell
npm run package          # → sharepoint/solution/nintex-form-customizer.sppkg
```
`config/package-solution.json`: `"skipFeatureDeployment": true`, `"includeClientSideAssets": true`, verziószám emelése minden kiadásnál.

### 8.2 App Catalog
Tenant App Catalog → feltöltés → *Enable app* (minden site-on elérhető).

### 8.3 Tartalomtípus-hozzárendelés (PnP PowerShell)

```powershell
Connect-PnPOnline -Url "https://<tenant>.sharepoint.com/sites/<site>" -Interactive -ClientId "<entra-app-id>"

$componentId = "<NintexForm manifest id>"
$props = @{
  formDefinitionUrl     = "/sites/<site>/FormDefinitions/AJForm.xml"
  layoutName            = "Desktop"
  responsiveBreakpoint  = 640
  collapseHiddenRows    = $true
  styleMode             = "fluent"                                   # vagy "nintex"
  # hideImages          = $false                                     # alapból fluent → true, nintex → false
  # customCssUrl        = "/sites/<site>/FormDefinitions/AJForm.custom.css"
  urlRewrites           = @{
    "http://appfrlgs243.eu.dir.grpleg.com/sites/" = "https://<tenant>.sharepoint.com/sites/"
    "http://solutions.grpleg.com/sites/"          = "https://<tenant>.sharepoint.com/sites/"
  }
} | ConvertTo-Json -Compress -Depth 5

$ct = Get-PnPContentType -List "Audit jelentések" -Identity "Elem"   # vagy "Item" / a saját CT neve
$ct.NewFormClientSideComponentId          = $componentId
$ct.EditFormClientSideComponentId         = $componentId
$ct.DisplayFormClientSideComponentId      = $componentId
$ct.NewFormClientSideComponentProperties  = $props
$ct.EditFormClientSideComponentProperties = $props
$ct.DisplayFormClientSideComponentProperties = $props
$ct.Update($false)
Invoke-PnPQuery
```

Visszaállítás: a három `…ClientSideComponentId` és `…Properties` értéket üres stringre állítod, majd `Update($false)` + `Invoke-PnPQuery`.

A hozzárendelések leírója a `deploy/forms.json` (lista, tartalomtípus, XML, környezetenkénti `siteUrl` és `urlRewrites`), és a `deploy/Set-NintexForms.ps1` szkript alkalmazza őket – így a környezetek (DEV/TEST/PROD) reprodukálhatók:

```powershell
./deploy/Set-NintexForms.ps1 -Environment DEV -ClientId <entra-app-id> -UploadDefinitions -DefinitionsPath ./samples
./deploy/Set-NintexForms.ps1 -Environment PROD -ClientId <entra-app-id> -WhatIf     # próbafuttatás
./deploy/Set-NintexForms.ps1 -Environment PROD -ClientId <entra-app-id> -Remove     # visszaállítás
```

A `forms.json` lista- és tartalomtípus-nevei helyőrzők, amíg a K-02/K-06 kérdések nincsenek lezárva.

A megjelenés a `defaults` részben (minden űrlapra) és a `forms` tömb egyes elemeiben (csak arra az űrlapra) állítható; az űrlapszintű érték nyer:

```json
"defaults": { "…": "…", "styleMode": "fluent" },
"forms": [
  { "list": "Audit jelentések", "contentType": "Elem", "definition": "AJForm.xml", "customCss": "AJForm.custom.css" },
  { "list": "Audit tervek", "contentType": "Elem", "definition": "ATForm.xml", "styleMode": "nintex", "hideImages": true }
]
```

- `customCss`: fájlnév a definíciós tárban (a `-UploadDefinitions` a `-DefinitionsPath` mappából ezt is feltölti) vagy `/`-rel kezdődő szerver-relatív URL.
- `hideImages` elhagyva a `styleMode`-ot követi.
- Váltáshoz elég a szkriptet újrafuttatni; új `.sppkg` nem kell. A CSS-fájl módosítása még ennyit sem igényel (minden betöltéskor újra letöltődik).

---

## 9. Tesztelés

| Mit | Hol | Mikor |
|---|---|---|
| Unit (`src/nintex/**`) | `__tests__` mappák a modul mellett | minden változtatásnál |
| Minta-snapshotok | `src/nintex/parser/__tests__/samples.test.ts` | parser-változásnál; snapshot-diffet review-zni |
| Szabály-forgatókönyvek | `src/nintex/rules/__tests__/scenarios/*.test.ts` | szabálymotor-változásnál |
| Komponens | `src/components/**/__tests__` | UI-változásnál |
| Kézi E2E | teszt-site, mind az 5 űrlap × New/Edit/Display | release előtt (checklist: `docs/uat-checklist.md`) |

Forgatókönyv-teszt minta (`src/nintex/rules/__tests__/scenarios/samples.test.ts`):

```ts
it("AT: jóváhagyott állapotban a lookupok le vannak tiltva", () => {
  const def = parseSample("ATForm.xml");
  const store = createTestStore(def, { mode: "Edit", item: { Status: "Jóváhagyott audit" } });
  expect(store.ruleState("c9712357-9d20-4a19-9f95-5674cd34cd2a").disabled).toBe(true);
  expect(store.ruleState("f6e4cd13-1967-48d3-b0da-f958cc23635a").disabled).toBe(true);
});
```

Segédek: `src/nintex/__tests__/helpers/` – `samples.ts` (`parseSample`, `readSampleBytes`), `testStore.ts` (`createTestStore`, keretrendszer nélküli űrlap-munkamenet), `builders.ts` (kis szintetikus definíciók: `textBox`, `rule`, `formOf` …).

Tudnivalók a tesztkörnyezetről:
- A Jest a `lib-commonjs` alól futtatja a lefordított teszteket; a snapshotok a forrás mellé kerülnek (`src/**/__snapshots__`). Snapshot-frissítés: `npm test -- -u`, majd a diff **átnézése**.
- A `@pnp/sp` és a `@pnp/spfx-controls-react` ES-modulként érkezik, CommonJS Jestben nem tölthető be: a PnP-t használó osztályok (pl. `SpDataService`) csak interfészen át (`IFormDataSource`, `IDefinitionSource`, `IFormPersistence`) tesztelhetők, a komponenstesztek a PnP vezérlőket `jest.mock`-kal cserélik (a `jest.mock` hívás a fájl tetején, az importok előtt legyen – a lefordított kódban nincs hoisting).
- A Fluent `MessageBar` szövege késleltetve renderelődik (élő régió) – `findByText`-tel kell várni rá.
- A lokalizációs fájlok AMD-formátumúak; tesztben `define`-shimmel tölthetők be (lásd `components/__tests__/NintexForm.test.tsx`).

Elvárt lefedettség: parser + expression ≥ 90%, rules ≥ 80%.

---

## 10. Hibaelhárítás

| Tünet | Ok / megoldás |
|---|---|
| `Unexpected token` a kifejezés-parse-ban | `&nbsp;` vagy kétszer kódolt entitás maradt → `normalize.ts` |
| Szabály sosem fut | üres `ControlIds` / `ExpressionValue` → diagnosztikai panel `EmptyRule` |
| `{Control:…}` mindig üres | árva hivatkozás (a vezérlő nincs az űrlapon) → `OrphanReference` |
| Mentés `400` hibával | mezőnév eltér az SPO listában (`MissingField`), vagy People mezőnél nem `…Id`-t küldünk |
| Mentés `412` | párhuzamos módosítás (ETag) → újratöltés |
| A SharePoint alap űrlapja jelenik meg | rossz tartalomtípusra történt a hozzárendelés, vagy az app nincs engedélyezve |
| Képek nem töltődnek | on-prem URL → `urlRewrites`, képek migrálása `SiteAssets`-be |
| Stílus „kiszivárog” az oldalra | a CSS-scoper nem kezelt egy szelektort → teszt + javítás `cssScoper.ts`-ben |
| React-verzió hiba | valaki frissítette a React-et → vissza 17.0.1-re |
| `XmlParseError` / „nem érvényes Nintex export” a feltöltött XML-re | a fájlt egy szerkesztő más kódolással mentette, vagy nem teljes; az eredeti UTF-16LE export a jó. Ellenőrzés: `npm run analyze -- <fájl>` |
| Lassú első betöltés szerkesztő módban | a PnP vezérlők chunkjai (PeoplePicker, RichText) első használatkor töltődnek (K-10) |
| A Jest „Cannot use import statement outside a module” hibát ad | a teszt (közvetve) `@pnp/*` modult importál – interfészen át vagy `jest.mock`-kal kell leválasztani |

---

## 11. Hasznos hivatkozások
- SPFx release notes és kompatibilitás: learn.microsoft.com/sharepoint/dev/spfx/compatibility
- Form Customizer oktatóanyag: learn.microsoft.com/sharepoint/dev/spfx/extensions/get-started/building-form-customizer
- Heft toolchain: learn.microsoft.com/sharepoint/dev/spfx/toolchain/customize-heft-toolchain-overview
- PnPjs v4: pnp.github.io/pnpjs
- PnP SPFx Reusable Controls: pnp.github.io/sp-dev-fx-controls-react
- fast-xml-parser: github.com/NaturalIntelligence/fast-xml-parser
