import type { PersonValue } from '../../../expression/values';
import { createTestStore } from '../../../__tests__/helpers/testStore';
import { parseSample } from '../../../__tests__/helpers/samples';

const ALICE: PersonValue = { kind: 'person', id: 11, loginName: 'alice', displayName: 'Alice' };
const BOB: PersonValue = { kind: 'person', id: 12, loginName: 'bob', displayName: 'Bob' };

describe('ATForm (audit plan)', () => {
  const def = parseSample('ATForm.xml');
  const LOOKUPS = ['c9712357-9d20-4a19-9f95-5674cd34cd2a', 'f6e4cd13-1967-48d3-b0da-f958cc23635a'];
  const STATUS = 'da0feb7e-3f91-4a71-926c-58707634f39e';
  const AUDITOR_TXT = '312a41c7-62ee-405b-8887-35d69e7aa497';

  it('AT: jóváhagyott állapotban a lookupok le vannak tiltva', () => {
    const store = createTestStore(def, { mode: 'Edit', item: { Status: 'Jóváhagyott audit' } });
    LOOKUPS.forEach((id) => expect(store.ruleState(id).disabled).toBe(true));
  });

  it('AT: "Audit végrehajtva" also disables the lookups; other states keep them editable', () => {
    expect(createTestStore(def, { mode: 'Edit', item: { Status: 'Audit végrehajtva' } }).ruleState(LOOKUPS[0]).disabled).toBe(true);
    const store = createTestStore(def, { mode: 'Edit', item: { Status: 'Tervezett audit' } });
    LOOKUPS.forEach((id) => expect(store.ruleState(id).disabled).toBe(false));
  });

  it('AT: the rule follows the live {Control:} value of Status', () => {
    const store = createTestStore(def, { mode: 'Edit', item: { Status: 'Tervezett audit' } });
    const changed = store.setValue(STATUS, 'Jóváhagyott audit');
    expect(changed).toEqual(expect.arrayContaining(LOOKUPS));
    expect(store.ruleState(LOOKUPS[1]).disabled).toBe(true);
  });

  it('AT: AuditorTxt is hidden in New mode and when Auditor was saved ({ItemProperty} snapshot)', () => {
    expect(createTestStore(def, { mode: 'New' }).ruleState(AUDITOR_TXT).hidden).toBe(true);
    expect(createTestStore(def, { mode: 'Edit', item: { Auditor: [BOB] } }).ruleState(AUDITOR_TXT).hidden).toBe(true);
    expect(createTestStore(def, { mode: 'Edit', item: { Auditor: [] } }).ruleState(AUDITOR_TXT).hidden).toBe(false);
  });

  it('AT: {ItemProperty:X} does not react to user edits', () => {
    const store = createTestStore(def, { mode: 'Edit', item: { Auditor: [] } });
    const auditorPicker = def.controlsByName.auditor;
    store.setValue(auditorPicker, [BOB]);
    expect(store.ruleState(AUDITOR_TXT).hidden).toBe(false);
  });

  it('AT: imported-only controls are hidden when PlanDate is not a date', () => {
    const imported = 'f23df7c9-b48e-43e5-ad46-3771340b0bbd';
    expect(createTestStore(def, { mode: 'Edit', item: { PlanDate: null } }).ruleState(imported).hidden).toBe(true);
    expect(createTestStore(def, { mode: 'Edit', item: { PlanDate: new Date(2020, 1, 1) } }).ruleState(imported).hidden).toBe(false);
  });

  it('AT: target-less rules (HideWhenNew, HideCreatedBy) have no effect', () => {
    const store = createTestStore(def, { mode: 'New' });
    const imported = def.rules.filter((r) => r.title === 'HideWhenNotImported')[0].controlIds;
    const expected = new Set([AUDITOR_TXT, ...imported, ...Object.keys(def.controls).filter((id) => !def.controls[id].isVisible)]);
    const unexpected = Object.keys(def.controls).filter((id) => store.ruleState(id).hidden && !expected.has(id));
    expect(unexpected).toEqual([]);
  });

  it('AT: viewCategory calculation recalculates live from PlannedDate and AuditType', () => {
    const calc = 'e50d8bfb-9342-4ad0-a873-ed775b96b206';
    const store = createTestStore(def, { mode: 'New' });
    expect(store.value(calc)).toBe('');
    const changed = store.setValue('28bd3236-9559-4aae-b786-610e8dbcdd5a', new Date(2026, 2, 1));
    expect(changed).toContain(calc);
    // AuditType defaults to "Belső környezetvédelmi audit" in New mode
    expect(store.value(calc)).toBe('2026. évre tervezett belső környezetvédelmi audit');
    store.setValue('105d7bc6-5fa0-4469-a7fd-ee39746a0598', '');
    expect(store.value(calc)).toBe('2026. évre tervezett belső minőségügyi audit');
  });

  it('AT: viewCategory is not recalculated in Display mode (RecalculateOnView=false) and shows the stored value', () => {
    const store = createTestStore(def, {
      mode: 'Display',
      item: { viewCategory: 'Tárolt érték', PlannedDate: new Date(2026, 2, 1), AuditType: 'BV audit' }
    });
    expect(store.value('e50d8bfb-9342-4ad0-a873-ed775b96b206')).toBe('Tárolt érték');
  });

  it('AT: Display mode disables everything and never validates', () => {
    const store = createTestStore(def, { mode: 'Display', item: {} });
    Object.keys(def.controls).forEach((id) => expect(store.ruleState(id).disabled).toBe(true));
    expect(store.validate().valid).toBe(true);
  });

  it('AT: required lookups are validated in New mode, but not when disabled', () => {
    const store = createTestStore(def, { mode: 'New', values: { [STATUS]: 'Jóváhagyott audit' } });
    const result = store.validate();
    LOOKUPS.forEach((id) => expect(result.controlErrors[id]).toBeUndefined());
    const editable = createTestStore(def, { mode: 'New' }).validate();
    LOOKUPS.forEach((id) => expect(editable.controlErrors[id]).toEqual([expect.objectContaining({ code: 'required' })]));
  });
});

describe('AJForm (audit report)', () => {
  const def = parseSample('AJForm.xml');
  const CREATED_BY_PICKER = '8b0ec417-83e9-466c-b53d-37721cbd8996';
  const CREATED_BY_CALC = '9bda8749-b17f-416c-80c9-2a8f63ca8cfe';
  const PLAN_ID = '1f6fd549-bd42-4da6-a5a5-5ddee21d3393';

  it('AJ: overlapping controls are toggled by mode (picker in New, calculation otherwise)', () => {
    const newStore = createTestStore(def, { mode: 'New', currentUser: ALICE });
    expect(newStore.ruleState(CREATED_BY_PICKER).hidden).toBe(false);
    expect(newStore.ruleState(CREATED_BY_CALC).hidden).toBe(true);
    const editStore = createTestStore(def, { mode: 'Edit', item: { DocCreatedBy: [], Author: [BOB] } });
    expect(editStore.ruleState(CREATED_BY_PICKER).hidden).toBe(true);
    expect(editStore.ruleState(CREATED_BY_CALC).hidden).toBe(false);
  });

  it('AJ: DocCreatedBy defaults to the current user in New mode (disabled control)', () => {
    const store = createTestStore(def, { mode: 'New', currentUser: ALICE });
    expect(store.value(CREATED_BY_PICKER)).toEqual([ALICE]);
    expect(store.ruleState(CREATED_BY_PICKER).disabled).toBe(true);
  });

  it('AJ: the created-by calculation falls back to Author', () => {
    expect(createTestStore(def, { mode: 'Edit', item: { DocCreatedBy: [], Author: [BOB] } }).value(CREATED_BY_CALC)).toEqual([BOB]);
    expect(createTestStore(def, { mode: 'Edit', item: { DocCreatedBy: [ALICE], Author: [BOB] } }).value(CREATED_BY_CALC)).toEqual([ALICE]);
  });

  it('AJ: empty audit plan id → validation rule message (plus required)', () => {
    const result = createTestStore(def, { mode: 'New' }).validate();
    expect(result.valid).toBe(false);
    expect(result.controlErrors[PLAN_ID]).toEqual([
      expect.objectContaining({ code: 'required' }),
      expect.objectContaining({
        code: 'rule',
        message: 'Az Audit Terv ID nem lehet üres. Kérem, jelentés felvitelét az audittervről szíveskedjék elindítani!'
      })
    ]);
  });

  it('AJ: filled audit plan id passes the rule', () => {
    const store = createTestStore(def, { mode: 'New', values: { [PLAN_ID]: '42' } });
    expect(store.validate().controlErrors[PLAN_ID]).toBeUndefined();
  });

  it('AJ: Status defaults to "Készítés alatt"; choice tokens resolve from the item in Edit mode', () => {
    const status = def.controlsByName.status;
    expect(createTestStore(def, { mode: 'New' }).value(status)).toBe('Készítés alatt');
  });
});

describe('Form.xml (generic document)', () => {
  const def = parseSample('Form.xml');
  it('hides the creation date while TimeCreated is empty', () => {
    expect(createTestStore(def, { mode: 'New' }).ruleState('28ac96b1-8fc6-4001-9d84-870f15f15471').hidden).toBe(true);
    expect(
      createTestStore(def, { mode: 'Edit', item: { TimeCreated: new Date(2020, 0, 1) } }).ruleState('ce68937d-f02a-4d69-8ebf-21b023f9e996').hidden
    ).toBe(false);
  });
});

describe('MUForm (work instruction)', () => {
  const def = parseSample('MUForm.xml');
  const TYPE_OF_DOC = '6bf43326-713f-4e5f-8167-6b48fd6c48ce';

  it('MU: revision fields hidden while the saved status is a draft state', () => {
    ['Készítés alatt', 'Ellenőrzött', 'Szöveg kész'].forEach((status) =>
      expect(createTestStore(def, { mode: 'Edit', item: { Status: status } }).ruleState('721cc6ee-8201-463d-a2ef-5691a653489c').hidden).toBe(true)
    );
    expect(createTestStore(def, { mode: 'Edit', item: { Status: 'Érvényes' } }).ruleState('041eb23d-2aa0-4909-a4c5-79fa1aa8c8c1').hidden).toBe(
      false
    );
  });

  it('MU: the orphan-control validation rule never fires (null != "<típus>")', () => {
    const store = createTestStore(def, { mode: 'Edit', item: { Status: 'Készítés alatt', Title: 'x' } });
    expect(store.validate().formErrors).toEqual([]);
    expect(store.diagnostics.filter((d) => d.code === 'OrphanReference').length).toBeGreaterThan(0);
  });

  it('MU: custom validation true → error with the expression message (K-03)', () => {
    const store = createTestStore(def, { mode: 'Edit', item: { TypeofDoc: '<típus>', Form: 'Minőségcél' } });
    expect(store.validate().controlErrors[TYPE_OF_DOC]).toEqual([{ code: 'custom', message: 'Adjuk meg a minőségcél típusát!' }]);
    const ok = createTestStore(def, { mode: 'Edit', item: { TypeofDoc: 'Logisztikai', Form: 'MU' } });
    expect(ok.validate().controlErrors[TYPE_OF_DOC]).toBeUndefined();
  });
});

describe('NyForm (printed form)', () => {
  const def = parseSample('NyForm.xml');
  const STATUS = '846db848-9491-4bf1-b574-ab3d67488194';

  it('Ny: Status is editable only for "Hungary Owners" (IsEnabled binding)', () => {
    expect(createTestStore(def, { mode: 'Edit', groups: ['Hungary Owners'] }).ruleState(STATUS).disabled).toBe(false);
    expect(createTestStore(def, { mode: 'Edit', groups: ['Hungary Members'] }).ruleState(STATUS).disabled).toBe(true);
  });

  it('Ny: valid documents are not editable ("Nem szerkeszthető")', () => {
    const store = createTestStore(def, { mode: 'Edit', item: { Status: 'Érvényes' }, groups: ['Hungary Owners'] });
    const rule = def.rules.filter((r) => r.title === 'Nem szerkeszthető')[0];
    rule.controlIds.forEach((id) => expect(store.ruleState(id).disabled).toBe(true));
    expect(store.ruleState('1899b3af-bbac-4ceb-96da-6f06fdbd352c').disabled).toBe(true);
    const draft = createTestStore(def, { mode: 'Edit', item: { Status: 'Készítés alatt' }, groups: ['Hungary Owners'] });
    expect(draft.ruleState('1899b3af-bbac-4ceb-96da-6f06fdbd352c').disabled).toBe(false);
  });

  it('Ny: hidden or disabled required controls are not validated', () => {
    const store = createTestStore(def, { mode: 'Edit', item: { Status: 'Érvényes' } });
    expect(store.validate().controlErrors['1899b3af-bbac-4ceb-96da-6f06fdbd352c']).toBeUndefined();
    const draft = createTestStore(def, { mode: 'Edit', item: { Status: 'Készítés alatt' } });
    expect(draft.validate().controlErrors['1899b3af-bbac-4ceb-96da-6f06fdbd352c']).toEqual([expect.objectContaining({ code: 'required' })]);
  });
});
