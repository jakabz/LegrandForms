import { collectBoundFields, countControlsByType } from '../../analysis/inventory';
import type { ChoiceControl, LookupControl } from '../../model/controls';
import { parseNintexFormBytes } from '../NintexXmlParser';
import { parseSample, readSampleBytes, SAMPLE_FILES } from '../../__tests__/helpers/samples';

/** Rendszerterv §2.1 */
const EXPECTED: Record<string, { formType: string; width: number; height: number; controls: number; rules: number }> = {
  'AJForm.xml': { formType: 'ListForm', width: 700, height: 1500, controls: 51, rules: 3 },
  'ATForm.xml': { formType: 'ListForm', width: 700, height: 1500, controls: 40, rules: 6 },
  'Form.xml': { formType: 'ListForm', width: 700, height: 700, controls: 18, rules: 1 },
  'MUForm.xml': { formType: 'Global', width: 700, height: 2000, controls: 59, rules: 9 },
  'NyForm.xml': { formType: 'Global', width: 700, height: 1800, controls: 55, rules: 12 }
};

describe.each(SAMPLE_FILES)('sample %s', (fileName) => {
  const result = parseNintexFormBytes(readSampleBytes(fileName));
  const definition = result.definition!;

  it('parses without error diagnostics', () => {
    expect(definition).not.toBeNull();
    expect(result.diagnostics.filter((d) => d.level === 'error')).toEqual([]);
  });

  it('matches the inventory in Rendszerterv §2.1', () => {
    const expected = EXPECTED[fileName];
    expect(definition.formType).toBe(expected.formType);
    expect(definition.layouts[0].name).toBe('Desktop');
    expect(definition.layouts[0].width).toBe(expected.width);
    expect(definition.layouts[0].height).toBe(expected.height);
    expect(Object.keys(definition.controls)).toHaveLength(expected.controls);
    expect(definition.rules).toHaveLength(expected.rules);
  });

  it('uses lower-case guids everywhere', () => {
    const guids = [
      definition.id,
      ...Object.keys(definition.controls),
      ...definition.rules.map((r) => r.id),
      ...definition.rules.reduce<string[]>((acc, r) => acc.concat(r.controlIds), []),
      ...definition.layouts[0].items.map((i) => i.controlId)
    ];
    guids.forEach((g) => expect(g).toBe(g.toLowerCase()));
  });

  it('cleans the CSS', () => {
    expect(definition.css).not.toMatch(/&nbsp;| |uiDesignerSurface/);
    expect(definition.css).toContain('.nf-form-label');
  });

  it('round-trips through JSON (sessionStorage cache)', () => {
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });

  it('matches the model snapshot', () => {
    expect(definition).toMatchSnapshot();
  });
});

describe('sample specifics', () => {
  it('AJForm: overlapping "Készítette" people picker and calculated value share one rectangle', () => {
    const def = parseSample('AJForm.xml');
    const at = (type: string): { left: number; top: number; width: number; height: number }[] =>
      def.layouts[0].items
        .filter((i) => def.controls[i.controlId].type === type && i.left === 110 && i.top === 630)
        .map((i) => ({ left: i.left, top: i.top, width: i.width, height: i.height }));
    expect(at('PeoplePicker')).toEqual([{ left: 110, top: 630, width: 240, height: 50 }]);
    expect(at('Calculation')).toEqual(at('PeoplePicker'));
  });

  it('ATForm: multi-value lookups by list title', () => {
    const def = parseSample('ATForm.xml');
    const lookups = ['c9712357-9d20-4a19-9f95-5674cd34cd2a', 'f6e4cd13-1967-48d3-b0da-f958cc23635a'].map(
      (id) => def.controls[id] as LookupControl
    );
    expect(lookups.map((l) => [l.type, l.lookupList, l.lookupField, l.allowMultipleValues])).toEqual([
      ['Lookup', 'Rendszerelemek', 'Title', true],
      ['Lookup', 'Szervezetek', 'Title', true]
    ]);
    expect(collectBoundFields(def).filter((f) => f.internalName === 'AuditOrg')[0].suggestedType).toBe('LookupMulti');
  });

  it('NyForm: IsEnabled bound to fn-IsMemberOfGroup', () => {
    const def = parseSample('NyForm.xml');
    const bound = Object.keys(def.controls)
      .map((id) => def.controls[id])
      .filter((c) => c.bindings.length > 0);
    expect(bound).toHaveLength(1);
    expect(bound[0].bindings[0].property).toBe('IsEnabled');
    expect(bound[0].bindings[0].value).toEqual(expect.objectContaining({ kind: 'expression', source: 'fn-IsMemberOfGroup("Hungary Owners")' }));
  });

  it('MUForm: custom validation and expression error message', () => {
    const def = parseSample('MUForm.xml');
    const typeOfDoc = def.controls[def.controlsByName.typeofdoc] as ChoiceControl;
    expect(typeOfDoc.customValidation && typeOfDoc.customValidation.source).toBe('{ItemProperty:TypeofDoc}=="<típus>"');
    expect(typeOfDoc.customValidation && typeOfDoc.customValidation.message && typeOfDoc.customValidation.message.kind).toBe(
      'expression'
    );
    expect(def.variables).toEqual([
      expect.objectContaining({ id: '7a35cd91-008b-4ad5-97bc-40793ec89234', name: 'selectedFormType', type: 'String2' })
    ]);
  });

  it('AJForm: choices built from {ItemProperty:…} tokens', () => {
    const def = parseSample('AJForm.xml');
    const docOrg = def.controls[def.controlsByName.docorg] as ChoiceControl;
    expect(docOrg.choices).toEqual([
      { kind: 'expression', source: '{ItemProperty:AuditOrg}', ast: { kind: 'Reference', namespace: 'ItemProperty', name: 'AuditOrg' } }
    ]);
  });

  it('control type counts across all samples match Rendszerterv §2.2', () => {
    const totals: Record<string, number> = {};
    SAMPLE_FILES.forEach((file) => {
      const counts = countControlsByType(parseSample(file));
      Object.keys(counts).forEach((k) => (totals[k] = (totals[k] || 0) + counts[k]));
    });
    expect(totals).toEqual({
      Label: 104,
      TextBox: 29,
      MultiLineTextBox: 23,
      DateTime: 15,
      PeoplePicker: 14,
      Button: 14,
      Choice: 9,
      Image: 5,
      Attachment: 5,
      Calculation: 3,
      Lookup: 2
    });
  });
});
