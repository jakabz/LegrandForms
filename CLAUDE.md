# CLAUDE.md

Guidance for Claude Code working in this repository. Read this first; details live in `docs/`.

## Project in one paragraph

A **generic SPFx Form Customizer** (SharePoint Online only) that renders list item forms at runtime from **Nintex Forms (classic, v101.x) XML exports**. It parses the XML into a typed model, evaluates Nintex formulas and rules (hide / disable / formatting / validation), lays controls out like the original Nintex canvas, and saves the item with PnPjs. One XML per content type, configured through `ClientSideComponentProperties` (`formDefinitionUrl`, …). **No form-specific code**: everything form-specific comes from the XML or config.

- System design (Hungarian): `docs/Rendszerterv.md` — the source of truth for semantics.
- Developer guide (Hungarian): `docs/Fejlesztoi-leiras.md` — setup, commands, deployment.
- Sample XMLs / test fixtures: `samples/*.xml` (AJ = audit report, AT = audit plan, MU = work instruction, Ny = printed form, Form = generic). **Never edit them**; add new cases under `samples/edge-cases/`.

## Stack (do not change without asking)

- SPFx **1.23.x** (latest stable at scaffold time), **Heft** toolchain (no gulp), **Node 22**, TypeScript 5.8, `strict`.
- **React 17.0.1** — pinned by SPFx. Never upgrade React or add libraries that require React 18 (`@testing-library/react` must stay ^12).
- UI: **Fluent UI v8** (`@fluentui/react`, path imports like `@fluentui/react/lib/TextField`) + `@pnp/spfx-controls-react` (version matched to SPFx). Do not add Fluent v9.
- Data: `@pnp/sp` v4. XML: `fast-xml-parser` (works in browser and Node). HTML sanitizing: `dompurify`.
- Tests: Jest via Heft.

## Commands

Use the scripts generated in `package.json` (they call Heft). Typical:

- `npm run build` — build + tests
- `npm start` — serve against SharePoint using `config/serve.json` (`PageType` 8 = New, 6 = Edit, 4 = Display)
- `npm test` — unit tests (`npm test -- -u` updates snapshots: review the diff before committing)
- `npm run analyze -- samples/*.xml` — offline analyzer (runs via `tsx`): dumps parsed model + `report.md` (diagnostics, bound fields) to `temp/analysis/`
- `npm run package` — production `.sppkg`

If a script is missing, check `package.json` before inventing one; propose additions instead of silently changing the toolchain.

## Architecture map

```
src/extensions/nintexForm/   SPFx entry (BaseFormCustomizer), manifest, loc (hu-hu default)
src/nintex/                  PURE CORE – no React, no @microsoft/*, no @pnp/*, no window/document
  model/                     FormDefinition, ControlDefinition union, RuleDefinition, Diagnostic
  parser/                    XML → FormDefinition (controlParsers/ keyed by i:type and FormControlTypeUniqueId), normalize.ts
  expression/                lexer → Pratt parser → AST → evaluator; functions/ registry; references.ts
  rules/                     RuleEngine + dependency graph (incremental re-evaluation)
  layout/                    absolute layout, responsive stacking, hidden-band collapse
  css/                       CSS parser, cleaner + scoper
  analysis/                  inventory helpers (bound fields, ItemProperty refs, lookups, groups) for analyzer + loader
src/services/                ConfigResolver, FormDefinitionProvider (cache by URL+ETag), SpDataService (PnPjs), ValueMapper
src/state/                   FormStore (values, dirty set, rule state, errors) + useControlState hook
src/components/              NintexForm, FormCanvas, ControlHost, DiagnosticsPanel, controls/ (one file per type)
scripts/analyze-nintex.ts    offline analyzer, reuses src/nintex
deploy/                      forms.json + Set-NintexForms.ps1 (content type assignment, PnP PowerShell)
```

Use Node 22 (`nvm use`, `.nvmrc`). Tests run compiled code from `lib-commonjs`; `@pnp/*` packages are ESM-only, so code that Jest loads must reach PnP only through interfaces or `jest.mock` (placed above the imports). PnP controls are lazy-loaded (`components/controls/lazyPnpControls.tsx`) to keep the main bundle small.

Dependency direction: `components → state → services → nintex`. `src/nintex` must stay runnable in plain Node (it is unit-tested there and used by the analyzer).

## Nintex semantics you must preserve

These are easy to get wrong; tests exist (or must exist) for each.

1. **Use `Rule/ExpressionValue`, never `Rule/Expression`** (the latter contains HTML `<a reftext=…>` markup).
2. **Normalize before parsing**: decode HTML entities once more after XML parsing (`&lt;típus&gt;` → `<típus>`), replace `&nbsp;` / U+00A0 with a space. The exports are **UTF-16LE without BOM**: always load bytes (`getBuffer`) and decode with `decodeXmlBytes`, never `getText()`.
3. **`{ItemProperty:X}` = value saved on the item when the form loaded** (empty in New mode); it does *not* change while the user edits. **`{Control:<guid>}` = live form value.** `{Common:IsNewMode|IsEditMode|IsDisplayMode|CurrentUser}` from context.
4. **Unknown `{Control:guid}`** (orphan, e.g. `291a341c-…` in MU/Ny) → `null` + `OrphanReference` diagnostic. Never throw.
5. **Formatting rule true → apply** (Hide/Disable are OR-ed across rules; style props: last true rule in XML order wins). **Validation rule true → error** with `ValidationMessage`; empty `ControlIds` → form-level error.
6. **Empty `ExpressionValue` → rule is inert; empty `ControlIds` → inert for Formatting rules** (`EmptyRule` diagnostic). A Validation rule with empty `ControlIds` is a form-level validation (rule 5).
7. **Hidden or disabled controls are not validated.** Validation rules don't run in Display mode.
8. `null == ""` is true; `==` with a string operand compares as strings; `+` with a string operand concatenates. Function names are case-insensitive and may contain `-` (`fn-IsMemberOfGroup`).
9. **Literal vs expression**: `DefaultValue`, `Choices/string`, `CustomErrorMessage` may be plain text (`Készítés alatt`), a token template, or an expression – see Rendszerterv §8.1.
10. Label `AssociatedControl` refers to the target control's **`Name`** (case-insensitive), not its UniqueId; it may be null or point nowhere.
11. **Save strategy**: New → all bound non-empty values incl. defaults and bound calculations; Edit → only dirty fields (+ changed bound calculations). Never write back untouched disabled fields (workflows own `Status`, `ApprovedBy`, …).
12. `DataField` is `"List:<InternalName>"`; ignore other sources (`Task:Decision` on buttons). Internal names keep `_x0020_` encoding.
13. `InsertReferences` are property bindings (`IsEnabled = fn-IsMemberOfGroup("Hungary Owners")`), parsed expression-first and overriding the static property. Known keys: IsEnabled, IsVisible, IsRequired, DefaultValue. Others (e.g. `DateOnly = {ItemProperty:Created}`) → `UnknownBinding` diagnostic, ignored.
14. Layout is absolute px on a 700px canvas with `ZIndex`; overlapping controls toggled by rules are normal (AJForm). Large low-z-index background labels must not break hidden-band collapse.
15. `<Script>`, `<ScriptUrls>`, button `ClientClick` are **never executed** – log `ScriptIgnored`.

## Coding rules

- No `eval`, `new Function`, or unsanitized HTML (`dangerouslySetInnerHTML` only with DOMPurify output). All CSS scoped (`.module.scss` or the CSS scoper).
- The core (`src/nintex`) returns `Diagnostic`s for bad input instead of throwing; throw only on programmer errors.
- Expression functions are synchronous; data they need (current user groups, etc.) is preloaded into the evaluation context.
- GUIDs: lowercase, no braces, everywhere.
- Code, identifiers, comments in **English**; user-facing strings in `loc/` (Hungarian default); docs in Hungarian.
- Keep components small; one control type per file; register in `components/controls/registry.ts` and `nintex/parser/controlParsers/index.ts`.
- Conventional Commits (`feat(parser): …`).

## Definition of done for a change

1. `npm run build` passes (lint + type-check + tests).
2. New logic in `src/nintex` has unit tests; parser changes keep all `samples/*.xml` snapshot tests green (reviewed diffs only).
3. `npm run analyze -- samples/*.xml` shows no new `error` diagnostics.
4. If behaviour or semantics changed, update `docs/Rendszerterv.md` (and this file if it affects the rules above).

## Open questions (ask the user before deciding)

- K-01 Target is SharePoint Online only (Form Customizer is not available on SharePoint Server SE).
- K-02 Do SPO list internal field names match the XML `DataField`s, or is a field-mapping layer needed?
- K-03 `CustomValidationFunction` semantics (current assumption: expression true → error).
- K-04 `collapseHiddenRows` default on?
- K-06 Lookup lists are referenced by **title** (`Rendszerelemek`, `Szervezetek`) – same titles in SPO?

## Milestones (see Rendszerterv §19)

M1 scaffold + fixtures → M2 parser + analyzer → M3 expression engine → M4 renderer + basic controls (Display) → M5 rules + validation → M6 People/Lookup/Attachments/Calculation + save → M7 CSS scope, responsive, collapse, diagnostics panel → M8 deployment scripts + UAT.

When starting a session, check which milestone is in progress (git log / open TODOs) and continue from there; implement the pure core (`src/nintex`) test-first.
