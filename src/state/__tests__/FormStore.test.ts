import { parseSample } from '../../nintex/__tests__/helpers/samples';
import { formOf, textBox, attachment } from '../../nintex/__tests__/helpers/builders';
import type { PersonValue } from '../../nintex/expression/values';
import type { FieldSchema } from '../../services/FieldSchema';
import { IFormPersistence, SaveError, SaveRequest } from '../../services/ItemPersistence';
import { ANY_CHANGE, FormStore, FormStoreOptions } from '../FormStore';
import { buildSaveChanges } from '../saveStrategy';
import { coerceControlValue, valuesEqual } from '../controlValues';

const ALICE: PersonValue = { kind: 'person', id: 11, loginName: 'alice', displayName: 'Alice' };
const BOB: PersonValue = { kind: 'person', id: 12, loginName: 'bob', displayName: 'Bob' };

function field(internalName: string, type: string, extra: Partial<FieldSchema> = {}): FieldSchema {
  return { internalName, title: internalName, type, readOnly: false, required: false, choices: [], allowMultipleValues: false, richText: false, dateOnly: false, ...extra };
}

/** Field schemas for the AJForm sample (the subset the tests touch, plus every bound field as Text). */
function ajFields(): Record<string, FieldSchema> {
  const def = parseSample('AJForm.xml');
  const fields: Record<string, FieldSchema> = {};
  Object.keys(def.controls).forEach((id) => {
    const c = def.controls[id];
    if ('dataField' in c && c.dataField && c.dataField.source === 'List') fields[c.dataField.internalName] = field(c.dataField.internalName, 'Text');
  });
  fields.DocCreatedBy = field('DocCreatedBy', 'User');
  fields.Approvers = field('Approvers', 'UserMulti');
  fields.Jegyzokonyvezett_x0020_auditorok = field('Jegyzokonyvezett_x0020_auditorok', 'UserMulti');
  fields.Author = field('Author', 'User', { readOnly: true });
  fields.AuditDate = field('AuditDate', 'DateTime');
  fields.CreationDate = field('CreationDate', 'DateTime');
  fields.SerialNumber = field('SerialNumber', 'Number');
  fields.Status = field('Status', 'Choice');
  return fields;
}

class FakePersistence implements IFormPersistence {
  public requests: SaveRequest[] = [];
  public failWith?: SaveError;
  public async save(request: SaveRequest): Promise<{ itemId: number; attachmentErrors: string[] }> {
    this.requests.push(request);
    if (this.failWith) throw this.failWith;
    return { itemId: request.itemId || 101, attachmentErrors: [] };
  }
}

function ajStore(options: Partial<FormStoreOptions> = {}): { store: FormStore; persistence: FakePersistence } {
  const persistence = new FakePersistence();
  const store = new FormStore({
    definition: parseSample('AJForm.xml'),
    mode: 'New',
    fields: ajFields(),
    currentUser: ALICE,
    currentUserGroups: [],
    locale: 'hu-HU',
    persistence,
    now: () => new Date(2026, 9, 6, 12, 0),
    ...options
  });
  return { store, persistence };
}

const PLAN_ID = '1f6fd549-bd42-4da6-a5a5-5ddee21d3393';
const TITLE = 'Title';

describe('FormStore – New mode (AJForm)', () => {
  it('initializes defaults (Status, DocCreatedBy = current user)', () => {
    const { store } = ajStore();
    const def = store.definition;
    expect(store.getValue(def.controlsByName.status)).toBe('Készítés alatt');
    expect(store.getValue(def.controlsByName.doccreatedby)).toEqual([ALICE]);
    expect(store.isDirty).toBe(false);
  });

  it('blocks saving while invalid and shows errors', async () => {
    const { store, persistence } = ajStore();
    const outcome = await store.submit({ command: 'Save', causesValidation: true });
    expect(outcome).toEqual({ kind: 'invalid' });
    expect(persistence.requests).toHaveLength(0);
    expect(store.getErrors(PLAN_ID).map((e) => e.code)).toEqual(['required', 'rule']);
    expect(store.submitAttempted).toBe(true);
  });

  it('revalidates live after the first submit attempt', async () => {
    const { store } = ajStore();
    await store.submit({ command: 'Save', causesValidation: true });
    store.setValue(PLAN_ID, '42');
    expect(store.getErrors(PLAN_ID)).toEqual([]);
  });

  it('saves all bound non-empty values incl. defaults (rule 11)', async () => {
    const { store, persistence } = ajStore();
    const def = store.definition;
    store.setValue(PLAN_ID, '42');
    store.setValue(def.controlsByName[TITLE.toLowerCase()], 'Jelentés');
    const outcome = await store.submit({ command: 'SaveAndSubmit', causesValidation: true });
    expect(outcome).toEqual({ kind: 'saved', itemId: 101, attachmentErrors: [] });
    const written = persistence.requests[0].changes.map((c) => [c.field.internalName, c.value]);
    expect(written).toEqual(
      expect.arrayContaining([
        ['Title', 'Jelentés'],
        ['auditPlanID', '42'],
        ['Status', 'Készítés alatt'],
        ['DocCreatedBy', [ALICE]]
      ])
    );
    expect(persistence.requests[0].mode).toBe('New');
  });

  it('Cancel closes without saving', async () => {
    const { store, persistence } = ajStore();
    expect(await store.submit({ command: 'Cancel', causesValidation: false })).toEqual({ kind: 'closed' });
    expect(persistence.requests).toHaveLength(0);
  });
});

describe('FormStore – Edit mode (AJForm)', () => {
  const item = {
    etag: '"5"',
    values: {
      Title: 'Régi cím',
      auditPlanID: '7',
      Status: 'Jóváhagyott',
      ApprovedBy: 'Workflow',
      DocCreatedBy: null,
      Author: { Id: 12, Title: 'Bob', Name: 'bob' },
      SerialNumber: 3.5
    }
  };

  it('writes only dirty fields; untouched disabled workflow fields are never written', async () => {
    const { store, persistence } = ajStore({ mode: 'Edit', item, itemId: 7 });
    store.setValue(store.definition.controlsByName.title, 'Új cím');
    await store.submit({ command: 'Save', causesValidation: true });
    const request = persistence.requests[0];
    expect(request.changes.map((c) => c.field.internalName)).toEqual(['Title']);
    expect(request).toEqual(expect.objectContaining({ mode: 'Edit', itemId: 7, etag: '"5"' }));
  });

  it('shows the stored values; numbers use the Hungarian decimal comma', () => {
    const { store } = ajStore({ mode: 'Edit', item, itemId: 7 });
    expect(store.getValue(store.definition.controlsByName.serialnumber)).toBe('3,5');
    expect(store.getItemProperty('Author')).toEqual([{ kind: 'person', id: 12, displayName: 'Bob', loginName: 'bob' }]);
    // created-by calculation falls back to Author
    expect(store.getValue('9bda8749-b17f-416c-80c9-2a8f63ca8cfe')).toEqual([{ kind: 'person', id: 12, displayName: 'Bob', loginName: 'bob' }]);
  });

  it('reverting a change clears the dirty flag', () => {
    const { store } = ajStore({ mode: 'Edit', item, itemId: 7 });
    const title = store.definition.controlsByName.title;
    store.setValue(title, 'x');
    expect(store.isDirty).toBe(true);
    store.setValue(title, 'Régi cím');
    expect(store.isDirty).toBe(false);
  });

  it('maps server validation errors to the bound control', async () => {
    const { store, persistence } = ajStore({ mode: 'Edit', item, itemId: 7 });
    persistence.failWith = new SaveError('validation', "Field 'Title' is invalid", 'Title');
    store.setValue(store.definition.controlsByName.title, 'Új');
    const outcome = await store.submit({ command: 'Save', causesValidation: true });
    expect(outcome.kind).toBe('error');
    expect(store.getErrors(store.definition.controlsByName.title)).toEqual([{ code: 'server', message: "Field 'Title' is invalid" }]);
    expect(store.busy).toBe(false);
  });
});

describe('FormStore – misc', () => {
  it('Display mode: no edits, closes', async () => {
    const { store } = ajStore({ mode: 'Display', item: { values: { Title: 'x' } }, itemId: 1 });
    store.setValue(store.definition.controlsByName.title, 'changed');
    expect(store.getValue(store.definition.controlsByName.title)).toBe('x');
    expect(await store.submit({ command: 'Save', causesValidation: true })).toEqual({ kind: 'closed' });
  });

  it('notifies only the affected controls (and ANY_CHANGE)', () => {
    const { store } = ajStore();
    const calls: string[] = [];
    store.subscribe(PLAN_ID, () => calls.push('plan'));
    store.subscribe(store.definition.controlsByName.title, () => calls.push('title'));
    store.subscribe(ANY_CHANGE, () => calls.push('any'));
    store.setValue(PLAN_ID, '1');
    expect(calls).toEqual(['plan', 'any']);
  });

  it('missing list fields make the control read-only (MissingField)', () => {
    const fields = ajFields();
    delete fields.Summary;
    const { store } = ajStore({ fields });
    const summary = Object.keys(store.definition.controls).filter((id) => {
      const c = store.definition.controls[id];
      return 'dataField' in c && c.dataField && c.dataField.internalName === 'Summary';
    })[0];
    expect(store.getState(summary).disabled).toBe(true);
    expect(store.diagnostics).toContainEqual(expect.objectContaining({ code: 'MissingField', controlId: summary }));
  });

  it('attachments: limits, replace, remove', () => {
    const def = formOf([attachment('att', { maximumFileSize: 10, blockedExtensions: ['exe'], whitelist: [] }), textBox('t')]);
    const store = new FormStore({
      definition: def,
      mode: 'Edit',
      fields: {},
      itemId: 1,
      item: { values: {} },
      attachments: [{ fileName: 'old.txt', serverRelativeUrl: '/a/old.txt' }],
      currentUser: null,
      currentUserGroups: [],
      locale: 'hu-HU'
    });
    const file = (name: string, size: number): File => ({ name, size } as unknown as File);
    const rejected = store.addAttachments('att', [file('big.pdf', 11), file('virus.exe', 1), file('ok.txt', 5), file('old.txt', 3)]);
    expect(rejected.map((r) => [r.fileName, r.issue.code])).toEqual([
      ['big.pdf', 'fileSize'],
      ['virus.exe', 'fileType']
    ]);
    expect(store.getValue('att')).toEqual(['ok.txt', 'old.txt']);
    expect(store.attachments.removed).toEqual(['old.txt']);
    store.removeAttachment('att', 'ok.txt');
    expect(store.attachments.added.map((f) => f.name)).toEqual(['old.txt']);
    expect(store.isDirty).toBe(true);
  });
});

describe('saveStrategy', () => {
  const def = formOf([textBox('a'), textBox('b'), textBox('c', { dataField: { source: 'List', internalName: 'a' } })]);
  const fields = { a: field('a', 'Text'), b: field('b', 'Text') };

  it('dedupes controls bound to the same field (dirty wins)', () => {
    const values: Record<string, string> = { a: 'from-a', b: '', c: 'from-c' };
    const result = buildSaveChanges({
      definition: def,
      mode: 'Edit',
      fields,
      getValue: (id) => values[id],
      dirty: new Set(['c']),
      getOriginalFieldValue: () => null
    });
    expect(result.changes.map((c) => [c.field.internalName, c.value])).toEqual([['a', 'from-c']]);
  });

  it('Display mode writes nothing; New mode skips empty values', () => {
    expect(buildSaveChanges({ definition: def, mode: 'Display', fields, getValue: () => 'x', dirty: new Set(), getOriginalFieldValue: () => null }).changes).toEqual([]);
    const result = buildSaveChanges({ definition: def, mode: 'New', fields, getValue: (id) => (id === 'b' ? 'x' : ''), dirty: new Set(), getOriginalFieldValue: () => null });
    expect(result.changes.map((c) => c.field.internalName)).toEqual(['b']);
  });
});

describe('controlValues', () => {
  const def = parseSample('ATForm.xml');
  it('coerces values to the control representation', () => {
    const choice = def.controls[def.controlsByName.audittype];
    expect(coerceControlValue(choice, ['a', 'b'], undefined, 'hu-HU')).toBe('a');
    expect(coerceControlValue(choice, 'a;#b', field('AuditType', 'MultiChoice'), 'hu-HU')).toEqual(['a', 'b']);
    const lookup = def.controls['c9712357-9d20-4a19-9f95-5674cd34cd2a'];
    expect(coerceControlValue(lookup, '1;#A;#2;#B', undefined, 'hu-HU')).toEqual([
      { kind: 'lookup', id: 1, title: 'A' },
      { kind: 'lookup', id: 2, title: 'B' }
    ]);
    const people = def.controls[def.controlsByName.auditor];
    expect(coerceControlValue(people, 'not a person', undefined, 'hu-HU')).toEqual([]);
  });

  it('valuesEqual compares by identity of people/lookups', () => {
    expect(valuesEqual([ALICE], [{ ...ALICE }])).toBe(true);
    expect(valuesEqual([ALICE], [BOB])).toBe(false);
    expect(valuesEqual(null, '')).toBe(true);
    expect(valuesEqual(new Date(1), new Date(1))).toBe(true);
  });
});
