# Telepítés és kipróbálás – lépésről lépésre

Ez a leírás egy SharePoint Online teszt-site-on viszi végig a megoldás telepítését és első kipróbálását. A legegyszerűbb mintával (`samples/Form.xml`, 6 mező) kezd, utána leírja, hogyan lehet a többi űrlapot is bekötni. A részletes háttér: [Fejlesztői leírás](Fejlesztoi-leiras.md), a mezőlisták: [Teszt-listák](test-lists.md).

**Két út van:**

- **A) Telepítés az App Catalogba** (1–6. lépés). Ez a valódi működés: a `.sppkg` felkerül, a tartalomtípus a customizerre mutat, és a lista „Új elem / Szerkesztés / Megtekintés” gombjai már az új űrlapot nyitják.
- **B) Helyi hibakeresés telepítés nélkül** (7. lépés). A kód a saját gépről fut (`npm start`), és csak egy speciális URL-lel jelenik meg. Fejlesztés közben ez a gyorsabb.

---

## 0. Előfeltételek

| Mi kell | Megjegyzés |
|---|---|
| SharePoint Online tenant | A Form Customizer csak SPO-ban működik (K-01). |
| Jogosultság | App Catalog: SharePoint-adminisztrátor vagy App Catalog-tulajdonos. Teszt-site: site-tulajdonos. |
| Node.js 22 | `nvm install 22` → a repóban `nvm use` (az `.nvmrc` alapján). Újabb Node-dal a build nem támogatott. |
| Git | A repó klónozásához. |
| PowerShell 7 + PnP.PowerShell | `Install-Module PnP.PowerShell -Scope CurrentUser` (2.x vagy újabb). |
| Entra ID alkalmazás a PnP.PowerShellhez | 2024 óta kötelező saját app regisztráció. Egyszer, adminként: `Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP PowerShell" -Tenant <tenant>.onmicrosoft.com` → a kapott **Client ID** kell a lenti parancsokhoz. |

A példákban: `<tenant>` = a tenant neve (pl. `legrand`), `<site>` = a teszt-site URL-neve (pl. `nintex-teszt`), `<clientId>` = az Entra app Client ID-ja.

---

## 1. A csomag elkészítése

```bash
git clone https://github.com/jakabz/LegrandForms.git
cd LegrandForms
nvm use                 # Node 22
npm ci                  # függőségek a package-lock.json szerint
npm run build           # production build + lint + tesztek + csomag
```

Eredmény: `sharepoint/solution/nintex-form-customizer.sppkg`. A build végén a tesztösszesítőben `Failures: 0` kell, hogy álljon.

Opcionális ellenőrzés, hogy a minták hiba nélkül feldolgozhatók:

```bash
npm run analyze -- samples/*.xml     # minden sorban "error 0" kell legyen; részletek: temp/analysis/report.md
```

---

## 2. Telepítés a tenant App Catalogba

**Böngészőből:**

1. SharePoint felügyeleti központ → **További funkciók → Alkalmazások → Megnyitás** (App Catalog).
2. **Alkalmazások a SharePointhoz → Feltöltés** → `nintex-form-customizer.sppkg`.
3. A felugró ablakban **„Engedélyezés minden webhely számára”** (a csomag `skipFeatureDeployment: true`, így site-onként nem kell külön hozzáadni) → **Telepítés**.

**Vagy PowerShellből:**

```powershell
Connect-PnPOnline -Url "https://<tenant>-admin.sharepoint.com" -Interactive -ClientId <clientId>
Add-PnPApp -Path ./sharepoint/solution/nintex-form-customizer.sppkg -Scope Tenant -Publish -Overwrite
```

A customizer azonosítója (ezt kapja majd a tartalomtípus): `3dfda748-218b-4cd1-8967-537b5d9c49ef`.

---

## 3. A teszt-site előkészítése

Hozz létre egy teszt-site-ot (pl. csoportwebhely `nintex-teszt` néven), majd PowerShellből készítsd el a definíciós tárat és az első tesztlistát a `Form.xml` mezőivel:

```powershell
Connect-PnPOnline -Url "https://<tenant>.sharepoint.com/sites/<site>" -Interactive -ClientId <clientId>

# 3.1 Űrlap-definíciók tára + a Form.xml feltöltése
New-PnPList -Title "FormDefinitions" -Template DocumentLibrary -Url "FormDefinitions"
Add-PnPFile -Path ./samples/Form.xml -Folder "FormDefinitions"

# 3.2 Tesztlista a Form.xml-hez (belső nevek = az XML DataField értékei)
New-PnPList -Title "Dokumentumok teszt" -Template GenericList -Url "Lists/DokumentumokTeszt"
$list = "Dokumentumok teszt"
Add-PnPFieldFromXml -List $list -FieldXml '<Field Type="Note" Name="Body" StaticName="Body" DisplayName="Szövegtörzs" RichText="TRUE" RichTextMode="FullHtml" NumLines="6" />'
Add-PnPFieldFromXml -List $list -FieldXml '<Field Type="Choice" Name="Categories" StaticName="Categories" DisplayName="Kategória" FillInChoice="TRUE" Format="Dropdown"><CHOICES><CHOICE>Audittervek</CHOICE><CHOICE>BVQI auditok</CHOICE><CHOICE>Egyéb projektek</CHOICE><CHOICE>Előadások</CHOICE></CHOICES></Field>'
Add-PnPFieldFromXml -List $list -FieldXml '<Field Type="DateTime" Name="DiaryDate" StaticName="DiaryDate" DisplayName="Esedékesség" Format="DateOnly" />'
Add-PnPFieldFromXml -List $list -FieldXml '<Field Type="DateTime" Name="TimeCreated" StaticName="TimeCreated" DisplayName="Készítés dátuma" Format="DateOnly" />'
Add-PnPFieldFromXml -List $list -FieldXml '<Field Type="DateTime" Name="TimeModified" StaticName="TimeModified" DisplayName="Módosítva" Format="DateOnly" />'
```

Ellenőrzés: `Get-PnPField -List $list | Select InternalName, TypeAsString` – a belső neveknek pontosan egyezniük kell a fentiekkel. Ha valamelyik mező hiányzik vagy más a belső neve, az űrlapon a hozzá tartozó vezérlő csak olvasható lesz, és a diagnosztikai panelen `MissingField` jelenik meg (K-02).

A Kategória mező a mintában 49 választási lehetőséget tartalmaz. Itt elég néhány, mert a mező saját érték megadását is engedi (`FillInChoice`), az űrlap pedig az XML-ben felsorolt összes értéket felkínálja.

---

## 4. A customizer hozzárendelése a lista tartalomtípusához

1. Nézd meg a lista tartalomtípusának nevét (magyar site-on általában `Elem`, angolon `Item`):

   ```powershell
   Get-PnPContentType -List "Dokumentumok teszt" | Select Name, Id
   ```

2. Töltsd ki a `deploy/forms.json`-t a teszthez. A `DEV.siteUrl` legyen a teszt-site, a `forms` tömbben pedig első körben elég egyetlen sor:

   ```json
   "forms": [
     { "list": "Dokumentumok teszt", "contentType": "Elem", "definition": "Form.xml" }
   ]
   ```

   A DEV környezetben a `debug: true` alapból be van kapcsolva; ez az űrlap tetején megjeleníti a **Diagnosztika** gombot.

3. Futtasd a hozzárendelést (először próbaképp `-WhatIf`-fel):

   ```powershell
   ./deploy/Set-NintexForms.ps1 -Environment DEV -ClientId <clientId> -WhatIf
   ./deploy/Set-NintexForms.ps1 -Environment DEV -ClientId <clientId>
   ```

   A `-UploadDefinitions` kapcsolóval a szkript a `forms.json`-ban felsorolt XML-eket is feltölti a `FormDefinitions` tárba (ha a 3.1-es lépést kihagytad).

A szkript a tartalomtípus `New/Edit/DisplayFormClientSideComponentId` mezőit a customizerre állítja. A `…Properties` mezőkbe ez a JSON kerül:

```json
{"formDefinitionUrl":"/sites/<site>/FormDefinitions/Form.xml","layoutName":"Desktop","responsiveBreakpoint":640,"collapseHiddenRows":true,"emptyRuleBehavior":"warn","debug":true,"urlRewrites":{…}}
```

---

## 5. Kipróbálás

Nyisd meg a listát: `https://<tenant>.sharepoint.com/sites/<site>/Lists/DokumentumokTeszt`. A változás néhány perc késéssel érvényesülhet; ha még a régi űrlap jön, frissíts (Ctrl+F5).

**5.1 Új elem (New mód)**

1. **+ Új** → a Nintex-elrendezésű űrlap nyílik meg: 700 px széles vászon, a mezők a Nintex szerinti helyen, de SharePoint (Fluent) megjelenéssel – nincs szürke háttér, és a fejléckép elmarad, a helye összecsukódik (`styleMode: "fluent"`, lásd 5.6).
2. A „Készítési dátum (Notes)” sor **nem látszik**: a `HideCreationDate` szabály elrejti, amíg a mentett elemen nincs `TimeCreated` érték, és a sor helye összecsukódik.
3. A Kategória alapértéke **Audittervek**.
4. Kattints a **Mentés** gombra üres **Téma** mezővel → a mező alatt „Kötelező mező.” jelenik meg, felül pedig egy összesítő üzenet.
5. Töltsd ki a Témát és a „Módosítva” dátumot, csatolj egy fájlt („Csatolt dokumentumok”), majd ments → az űrlap bezárul, az elem a melléklettel együtt megjelenik a listában.

> **A minta sajátossága:** az „Utolsó módosítás” sorban a `Form.xml` két vezérlőt köt ugyanarra a `TimeModified` mezőre: egy kötelező dátumválasztót és egy fölé helyezett (ZIndex 504) szövegmezőt. Ez a szövegmező egérrel teljesen eltakarja a dátumválasztót. A dátumot a billentyűzettel lehet megadni: az „Esedékesség” mezőből **Tab**-bal tovább lépve, `2026. 10. 07.` formában. A megoldás pontosan az XML-t követi. Ha az eredeti on-prem űrlapon ez másként működött (pl. a szövegmező csak megjelenítésre szolgált), az XML-t kell javítani, vagy egy szabállyal elrejteni a szövegmezőt.

**5.2 Szerkesztés (Edit mód)**

1. Nyisd meg az elemet szerkesztésre → a mentett értékek és a melléklet betöltődnek.
2. A „Készítési dátum” sor továbbra is rejtett: a mezőt az űrlap nem írja (nem szerkeszthető, régen a workflow töltötte). A szabály kipróbálásához töltsd ki a `Készítés dátuma` oszlopot a lista nézetében (Szerkesztés rácsnézetben), majd nyisd meg újra az elemet → a sor megjelenik, csak olvasható dátummal.
3. Módosíts egyetlen mezőt, és ments. Csak a módosított mező íródik vissza; ez a lista verzióelőzményeiben ellenőrizhető (a többi mező verziója nem változik).

**5.3 Megtekintés (Display mód)**

Az elemre kattintva minden érték csak olvasható szövegként jelenik meg, a gombok helyén **Bezárás** áll.

**5.4 Diagnosztika**

Az űrlap tetején a **Diagnosztika** gomb (mert `debug: true`) egy oldalpanelt nyit:

- **Diagnosztikák:** a feldolgozás figyelmeztetései (pl. `MissingField`, `OrphanReference`).
- **Szabály-nyomkövetés:** melyik szabály mikor, milyen eredménnyel futott le.
- **Vezérlő-azonosítók megjelenítése:** minden vezérlő sarkában megjelenik a GUID-ja. Ez az XML-lel való összevetéshez hasznos.

Fejlesztői buildben az URL-be írt `?nfDebug=1` is bekapcsolja a diagnosztikát (éles buildben ez szándékosan nem működik).

**5.5 Keskeny nézet**

Szűkítsd a böngészőablakot 640 px alá (vagy nyisd meg mobilon) → az űrlap egyoszlopos elrendezésre vált.

**5.6 Megjelenés: Fluent vagy Nintex, egyedi CSS**

Alapból (`styleMode: "fluent"`) csak az elrendezés jön az XML-ből; a színek, betűk, keretek, az űrlap CSS-e és a képek elmaradnak. Összehasonlításhoz – mivel DEV-ben `debug: true` van – fűzd az URL végéhez:

- `&nfStyle=nintex` → a Nintex-hű megjelenés (szürke háttér, eredeti betűk és színek, fejléckép);
- `&nfStyle=nintex&nfHideImages=1` → Nintex-megjelenés kép nélkül.

Végleges beállítás a `deploy/forms.json`-ban (alapértelmezésként a `defaults`-ban vagy egy űrlap sorában), majd a 4. lépés újrafuttatása:

```json
{ "list": "Dokumentumok teszt", "contentType": "Elem", "definition": "Form.xml", "customCss": "Form.custom.css" }
```

Egyedi CSS kipróbálása:

1. Hozz létre egy `Form.custom.css` fájlt, például:
   ```css
   .nf-ctl-label .nf-control-content { color: #0078d4; }
   [data-control-name="Title"] .ms-TextField-fieldGroup { border-color: #0078d4; }
   ```
2. Töltsd fel a `FormDefinitions` tárba (vagy tedd a `samples` mellé egy saját mappába, és futtasd a szkriptet `-UploadDefinitions -DefinitionsPath <mappa>` kapcsolóval).
3. Vedd fel a `"customCss": "Form.custom.css"` beállítást a `forms.json` sorába, és futtasd újra a `Set-NintexForms.ps1`-et.
4. Frissítsd az űrlapot. A CSS későbbi módosításához elég a fájlt felülírni a tárban – sem szkript, sem új csomag nem kell.

A használható szelektorok listája: [Rendszerterv 11.4](Rendszerterv.md#114-stílusmód-és-egyedi-css-stylemode-customcssurl). Nintex módban az XML inline stílusának felülírásához `!important` kell.

---

## 6. A többi minta űrlap bekötése

A többi űrlap ugyanígy köthető be: lista létrehozása a [Teszt-listák](test-lists.md) szerinti mezőkkel → sor a `deploy/forms.json`-ba → `Set-NintexForms.ps1`. Űrlaponként a következőkre kell figyelni:

| Űrlap | Plusz előkészítés |
|---|---|
| AJForm (audit jelentés) | People mezők (`Approvers`, `DocCreatedBy`, `Jegyzokonyvezett_x0020_auditorok`); a „Hungary Members” SP-csoport (a jóváhagyó-választó erre szűr). |
| ATForm (audit terv) | Két lookup-forráslista **pontosan** ezekkel a címekkel: `Rendszerelemek`, `Szervezetek` (néhány elemmel); az `AuditedSystemElement` és `AuditOrg` többértékű lookup mezők ezekre mutatnak (K-06). |
| MUForm (munkautasítás) | 22 mező; a `Status` értékeinek egyezniük kell az XML-lel („Készítés alatt”, „Érvényes”, …). |
| NyForm (nyomtatvány) | A „Hungary Owners” SP-csoport: csak a tagjai szerkeszthetik a Status mezőt. Próbáld ki tagként és nem tagként is. |

Az ellenőrzendő forgatókönyvek űrlaponként: [UAT ellenőrzőlista](uat-checklist.md).

Az XML-ekben lévő on-prem kép-URL-ek (`http://appfrlgs243…`, `http://solutions.grpleg.com…`) SPO-ban csak akkor jelennek meg, ha a képeket átmásolod a site `SiteAssets` tárába, és a `forms.json` `urlRewrites` szakaszában a `<tenant>` helyőrzőt kitöltöd.

---

## 7. Helyi hibakeresés telepítés nélkül (B út)

Ehhez nem kell App Catalog és tartalomtípus-hozzárendelés. A 3. lépés szerinti lista és a `FormDefinitions` tár viszont kell.

1. Egyszer, a fejlesztői tanúsítvány megbízhatóvá tétele: `npx heft trust-dev-cert`
2. A `config/serve.json` **mind a négy** konfigurációjában (`default`, `nintexForm_NewForm`, `nintexForm_EditForm`, `nintexForm_ViewForm`) állítsd be:
   - `pageUrl`: `https://<tenant>.sharepoint.com/sites/<site>/_layouts/15/SPListForm.aspx`
   - `RootFolder`: a **3.2-ben létrehozott lista** szerver-relatív URL-je: `/sites/<site>/Lists/DokumentumokTeszt`. A sablon gyári értéke (`Lists/AuditJelentesek`) az AJ-űrlap listájára mutat; ha azt nem cseréled le, a SharePoint nem létező listára hivatkozó hibát ad.
   - `formDefinitionUrl`: `/sites/<site>/FormDefinitions/Form.xml`
   - Edit/View konfigurációkban az `ID`: egy **létező** elem azonosítója. Ehhez előbb hozz létre egy elemet a listában (akár a SharePoint alap űrlapjával), és nézd meg az ID-ját.

   Kitöltve például így néz ki (New):

   ```json
   "nintexForm_NewForm": {
     "pageUrl": "https://<tenant>.sharepoint.com/sites/<site>/_layouts/15/SPListForm.aspx",
     "formCustomizer": {
       "componentId": "3dfda748-218b-4cd1-8967-537b5d9c49ef",
       "PageType": 8,
       "RootFolder": "/sites/<site>/Lists/DokumentumokTeszt",
       "properties": { "formDefinitionUrl": "/sites/<site>/FormDefinitions/Form.xml", "debug": true }
     }
   }
   ```
3. Indítás:

   ```bash
   npm start                                         # New űrlap (default konfiguráció)
   npm start -- --serve-config nintexForm_EditForm   # Edit
   npm start -- --serve-config nintexForm_ViewForm   # Display
   ```

4. A böngészőben megnyíló oldalon engedélyezd a **„Load debug scripts”** kérdést. Az űrlap a helyi kódból fut, és mentéskor a lista tényleg módosul.

---

## 8. Visszaállítás

```powershell
./deploy/Set-NintexForms.ps1 -Environment DEV -ClientId <clientId> -Remove   # a lista ismét a SharePoint alap űrlapját használja
```

A csomag teljes eltávolítása: App Catalog → az alkalmazás → **Eltávolítás** (előtte a hozzárendeléseket érdemes visszavonni).

---

## 9. Ha valami nem működik

| Tünet | Teendő |
|---|---|
| Továbbra is a SharePoint alap űrlapja jelenik meg | Rossz tartalomtípusra történt a hozzárendelés, vagy a csomag nincs engedélyezve. Ellenőrizd: `Get-PnPContentType -List "<lista>" -Identity "<CT>" \| Select NewFormClientSideComponentId`. Várj néhány percet, majd Ctrl+F5. |
| `npm start` után a SharePoint nem létező listára hivatkozik (pl. `AuditJelentesek`) | A `config/serve.json` `RootFolder` értéke nem a tesztlistára mutat – lásd 7/2. Mind a négy konfigurációban javítani kell. |
| `npm start` Edit/View módban „az elem nem létezik” | A `serve.json`-ban az `ID` nem létező elemre mutat – előbb hozz létre egy elemet. |
| „Az űrlap nem tölthető be” + fájl-hiba | A `formDefinitionUrl` szerver-relatív URL-je nem jó, vagy a felhasználónak nincs olvasási joga a `FormDefinitions` tárhoz. |
| „Az űrlap konfigurációja hibás” | Üres vagy érvénytelen JSON a `…ClientSideComponentProperties` mezőben – futtasd újra a `Set-NintexForms.ps1`-et. |
| Egy mező szürke, nem szerkeszthető | Diagnosztika → `MissingField`: a lista belső mezőneve eltér az XML-től (3. lépés). |
| Mentéskor „A SharePoint elutasította az értéket” | A lista mezőbeállítása szigorúbb az űrlapnál (pl. Choice érték nincs a listában, kötelező mező). A mező alatt megjelenik a SharePoint üzenete. |
| Mentéskor „valaki más módosította” | Párhuzamos szerkesztés: **Újratöltés**, majd a módosítás megismétlése. |
| Az egyedi CSS nem hat | Diagnosztika → `CustomCssError`: a `customCssUrl` rossz vagy nincs olvasási jog. Ha betöltődött: a szelektor a `.nf-root-…` gyökér alá kerül, ezért `html`/`body` helyett az űrlap elemeit célozd; Nintex módban `!important` kell. |
| A People mező lassan jelenik meg először | A PnP vezérlők első használatkor töltődnek le (K-10); ez normális. |

További esetek: [Fejlesztői leírás, 10. fejezet](Fejlesztoi-leiras.md#10-hibaelhárítás).
