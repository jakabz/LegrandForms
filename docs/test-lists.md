# Teszt-listák – mezőleltár a minta űrlapokhoz

Ez a dokumentum a fejlesztői/teszt SPO-site előkészítéséhez készült (Fejlesztői leírás 5.2). A táblázatokat az offline elemző magja (`src/nintex/analysis/inventory.ts`) állította elő a `samples/*.xml` fájlokból; új XML esetén ugyanígy újragenerálható (`npm run analyze -- <fájl>` → `temp/analysis/report.md`, „Kötött mezők” szakasz).

> **Fontos (K-02):** a „Típus (javaslat)” oszlop a Nintex vezérlő típusából *következtetett* SharePoint mezőtípus. A valódi típus a forrás (on-prem) lista sémájából jön – migrációkor azt kell követni. Ahol a kettő eltér (pl. `AuditOrg` az AJ űrlapon többsoros szöveg, az AT űrlapon többértékű lookup), az eltérő listákat jelent. A belső neveknek (`_x0020_` kódolással együtt) pontosan egyezniük kell, különben a vezérlő csak olvasható lesz (`MissingField` diagnosztika).

Általános teendők a teszt-site-on:

1. `FormDefinitions` dokumentumtár, benne a `samples/*.xml` fájlok (olvasási jog a felhasználóknak).
2. A listák az alábbi mezőkkel (a `Title` minden listán megvan; az `Author`/`Created` rendszermezők).
3. Lookup forráslisták (`Rendszerelemek`, `Szervezetek`) néhány elemmel – a `Title` mező a megjelenített érték (K-06).
4. SharePoint csoportok: `Hungary Members`, `Hungary Owners` (PeoplePicker-szűrés, `fn-IsMemberOfGroup`).
5. Tartalomtípus-hozzárendelés: `deploy/Set-NintexForms.ps1 -Environment DEV …` (lásd Fejlesztői leírás 8.3).

## AJForm.xml – Audit jelentés

| Belső név | Megjelenített név (XML) | Típus (javaslat) | Kötelező (űrlap) | Vezérlő |
|---|---|---|---|---|
| `Title` | Title | Text | igen | TextBox |
| `Status` | Status | Choice | igen | Choice |
| `Approvers` | Jóváhagyók | User |  | PeoplePicker |
| `Auditor` | AuditorTXT | Text |  | TextBox |
| `AuditType` | Audit típusa | Text |  | TextBox |
| `DocumentBody` | DocumentBody | Note |  | MultiLineTextBox |
| `SerialNumber` | SerialNumber | Number |  | TextBox |
| `UniHistory` | Szerkesztések | Note |  | MultiLineTextBox |
| `auditPlanID` | auditPlanID | Text | igen | TextBox |
| `Summary` | Summary | Note |  | MultiLineTextBox |
| `AuditDate` | AuditDate | DateTime |  | DateTime |
| `DateApprove` | DateApprove | Text |  | TextBox |
| `CreationDate` | CreationDate | DateTime |  | DateTime |
| `ApprovedBy` | ApprovedBy | Text |  | TextBox |
| `JelentesAuditaltSzervezet` | Jelentés auditált szervezet | Choice |  | Choice |
| `JelentesAuditaltRendszerelem` | Jelentés auditált rendszerelem | Choice |  | Choice |
| `DocCreatedBy` | Készítette | User |  | PeoplePicker |
| `Comment` | Comment | Note |  | MultiLineTextBox |
| `Jegyzokonyvezett_x0020_auditorok` | Jelentés auditorok | User |  | PeoplePicker |
| `AuditedSystemElement` | Auditált rendszerelem | Note |  | MultiLineTextBox |
| `AuditOrg` | Auditált szervezet | Note |  | MultiLineTextBox |
| `ApproversTxt` | Jóváhagyók TXT | Text |  | TextBox |

Csak `{ItemProperty:…}` hivatkozásban szereplő mezők (a listában létezniük kell, a szabályok olvassák): `Author`.

SharePoint csoportok: Hungary Members.

## ATForm.xml – Audit terv

| Belső név | Megjelenített név (XML) | Típus (javaslat) | Kötelező (űrlap) | Vezérlő |
|---|---|---|---|---|
| `Title` | Title | Text | igen | TextBox |
| `Auditor` | Auditor | User | igen | PeoplePicker |
| `PlanApprover` | PlanApprover | User |  | PeoplePicker |
| `Status` | Állapot | Choice |  | Choice |
| `AuditType` | Audit típusa | Choice | igen | Choice |
| `SerialNumber` | SerialNumber | Number | igen | TextBox |
| `UniHistory` | UniHistory | Note |  | MultiLineTextBox |
| `DocumentBody` | DocumentBody | Note |  | MultiLineTextBox |
| `ApproveDate` | Jóváhagyás dátuma | DateTime |  | DateTime |
| `PlannedDate` | PlannedDate | DateTime |  | DateTime |
| `RealizationDate` | Végrehajtás dátuma | DateTime |  | DateTime |
| `DocApprovedBy` | Jóváhagyta | Text |  | TextBox |
| `AuditedSystemElement` | AuditedSystemElement | LookupMulti | igen | Lookup |
| `AuditOrg` | AuditOrg | LookupMulti | igen | Lookup |
| `AuditorTxt` | AuditorTxt | Text |  | TextBox |
| `viewCategory` | viewCategory | Text |  | Calculation |
| `PlanDate` | Készítés dátuma | DateTime | igen | DateTime |
| `DocCreatedBy` | Készítette | User |  | PeoplePicker |

Lookup forráslisták (cím alapján, `Title` mező): Rendszerelemek, Szervezetek.

## Form.xml – Általános dokumentum

| Belső név | Megjelenített név (XML) | Típus (javaslat) | Kötelező (űrlap) | Vezérlő |
|---|---|---|---|---|
| `Title` | Title | Text | igen | TextBox |
| `Body` | Szövegtörzs | Note |  | MultiLineTextBox |
| `Categories` | Kategória | Choice |  | Choice |
| `DiaryDate` | Esedékesség | DateTime |  | DateTime |
| `TimeCreated` | Készítés dátuma | DateTime | igen | DateTime |
| `TimeModified` | Módosítva | DateTime | igen | DateTime, TextBox |

## MUForm.xml – Munkautasítás

| Belső név | Megjelenített név (XML) | Típus (javaslat) | Kötelező (űrlap) | Vezérlő |
|---|---|---|---|---|
| `Title` | Title | Text | igen | TextBox |
| `Status` | Status | Choice | igen | Choice |
| `DocumentID` | DocumentID | Text | igen | TextBox |
| `VersionNumber` | VersionNumber | Number | igen | TextBox |
| `Events` | Events | Note |  | MultiLineTextBox |
| `DocOwners` | DocOwners | User |  | PeoplePicker |
| `UniHistory` | UniHistory | Note |  | MultiLineTextBox |
| `Subtype` | Subtype | Choice |  | Choice |
| `RevisionDate` | RevisionDate | DateTime |  | DateTime |
| `ApproveDate` | ApproveDate | DateTime |  | DateTime |
| `Revisioner` | Revisioner | UserMulti | igen | PeoplePicker |
| `RevisionedBy` | RevisionedBy | Text |  | TextBox |
| `DocApprovedBy` | DocApprovedBy | Text |  | TextBox |
| `Links` | Links | Text |  | TextBox |
| `CrosslinkUNID` | CrosslinkUNID | Note |  | MultiLineTextBox |
| `previousURL` | previousURL | Text |  | TextBox |
| `CreatedDate` | CreatedDate | DateTime |  | DateTime |
| `DocumentBody` | DocumentBody | Note |  | MultiLineTextBox |
| `DocCreatedBy` | DocCreatedBy | User |  | PeoplePicker |
| `References` | References | Note |  | MultiLineTextBox |
| `Validator` | Validator | User | igen | PeoplePicker |
| `DocumentCategories` | DocumentCategories | Text |  | TextBox |
| `ChangeBody` | ChangeBody | Note |  | MultiLineTextBox |
| `CrossLinks` | CrossLinks | Note |  | MultiLineTextBox |

Csak `{ItemProperty:…}` hivatkozásban szereplő mezők (a listában létezniük kell, a szabályok olvassák): `isNewVersion`, `TypeofDoc`, `Form`.

## NyForm.xml – Nyomtatvány

| Belső név | Megjelenített név (XML) | Típus (javaslat) | Kötelező (űrlap) | Vezérlő |
|---|---|---|---|---|
| `Title` | Title | Text | igen | TextBox |
| `Status` | Állapot | Choice |  | Choice |
| `DocumentID` | DocumentID | Text | igen | TextBox |
| `DocumentCategories` | DocumentCategories | Note |  | MultiLineTextBox |
| `VersionNumber` | VersionNumber | Number | igen | TextBox |
| `Validator` | Validator | User | igen | PeoplePicker |
| `Events` | Events | Note |  | MultiLineTextBox |
| `DocOwners` | DocOwners | User |  | PeoplePicker |
| `UniHistory` | UniHistory | Note |  | MultiLineTextBox |
| `RevisionDate` | RevisionDate | DateTime |  | DateTime |
| `ApproveDate` | ApproveDate | DateTime |  | DateTime |
| `Revisioner` | Revisioner | UserMulti | igen | PeoplePicker |
| `RevisionedBy` | RevisionedBy | Text |  | TextBox |
| `DocApprovedBy` | DocApprovedBy | Text |  | TextBox |
| `Links` | Links | Text |  | TextBox |
| `CrosslinkUNID` | CrosslinkUNID | Note |  | MultiLineTextBox |
| `previousURL` | previousURL | Text |  | TextBox |
| `CreatedDate` | CreatedDate | DateTime |  | DateTime |
| `DocumentBody` | DocumentBody | Note |  | MultiLineTextBox |
| `DocCreatedBy` | DocCreatedBy | User |  | PeoplePicker |
| `CrossLinks` | CrossLinks | Note |  | MultiLineTextBox |
| `ChangeBody` | ChangeBody | Note |  | MultiLineTextBox |

Csak `{ItemProperty:…}` hivatkozásban szereplő mezők (a listában létezniük kell, a szabályok olvassák): `isNewVersion`.

SharePoint csoportok: Hungary Owners.

