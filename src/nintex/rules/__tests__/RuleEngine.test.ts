import { ast, attachment, binding, calculation, choice, dateTime, formOf, people, rule, textBox, value } from '../../__tests__/helpers/builders';
import { createTestStore } from '../../__tests__/helpers/testStore';
import { DependencyGraph } from '../dependencyGraph';

describe('RuleEngine – formatting', () => {
  const def = formOf(
    [textBox('a'), textBox('b'), textBox('c')],
    [
      rule('hideB', '{Control:a} == "x"', ['b'], { hide: true }),
      rule('disableB', '{Control:a} == "y"', ['b'], { disable: true }),
      rule('red', '{Control:a} != ""', ['c'], { format: { fontColor: 'red', bold: true, cssClass: 'warn' } }),
      rule('blue', 'length({Control:a}) > 1', ['c'], { format: { fontColor: 'blue' } })
    ]
  );

  it('true formatting rule applies; false does not', () => {
    const store = createTestStore(def, { mode: 'New', values: { a: 'x' } });
    expect(store.ruleState('b')).toEqual(expect.objectContaining({ hidden: true, disabled: false }));
    store.setValue('a', 'y');
    expect(store.ruleState('b')).toEqual(expect.objectContaining({ hidden: false, disabled: true }));
  });

  it('style properties: last true rule in XML order wins; css classes accumulate', () => {
    const store = createTestStore(def, { mode: 'New', values: { a: 'z' } });
    expect(store.ruleState('c').style).toEqual({ fontColor: 'red', bold: true });
    expect(store.ruleState('c').cssClasses).toEqual(['warn']);
    store.setValue('a', 'zz');
    expect(store.ruleState('c').style).toEqual({ fontColor: 'blue', bold: true });
  });

  it('update() reports only controls whose state changed', () => {
    const store = createTestStore(def, { mode: 'New', values: { a: '' } });
    expect(store.setValue('a', 'q')).toEqual(['c']);
    expect(store.setValue('a', 'r')).toEqual([]);
    // 'r' → 'x': only the hide rule of b flips; c stays red
    expect(store.setValue('a', 'x')).toEqual(['b']);
  });

  it('Hide is OR-ed across rules', () => {
    const two = formOf(
      [textBox('a'), textBox('b')],
      [rule('r1', '{Control:a} == "1"', ['b'], { hide: true }), rule('r2', '{Control:a} == "2"', ['b'], { hide: true })]
    );
    const store = createTestStore(two, { mode: 'New', values: { a: '2' } });
    expect(store.ruleState('b').hidden).toBe(true);
  });

  it('{Self} rules evaluate per target control', () => {
    const selfDef = formOf([textBox('a'), textBox('b')], [rule('empty', '{Self} == ""', ['a', 'b'], { format: { backgroundColor: 'yellow' } })]);
    const store = createTestStore(selfDef, { mode: 'New', values: { a: 'filled', b: '' } });
    expect(store.ruleState('a').style).toEqual({});
    expect(store.ruleState('b').style).toEqual({ backgroundColor: 'yellow' });
    store.setValue('b', 'now filled');
    expect(store.ruleState('b').style).toEqual({});
  });

  it('inert rules never apply', () => {
    const inert = formOf([textBox('a')], [rule('empty', '', ['a'], { hide: true }), rule('noTargets', 'true', [], { hide: true })]);
    expect(createTestStore(inert, { mode: 'New' }).ruleState('a').hidden).toBe(false);
  });

  it('static IsVisible/IsEnabled and ControlMode', () => {
    const statics = formOf([textBox('a', { isVisible: false }), textBox('b', { isEnabled: false }), textBox('c', { controlMode: 'ReadOnly' })]);
    const store = createTestStore(statics, { mode: 'Edit' });
    expect(store.ruleState('a').hidden).toBe(true);
    expect(store.ruleState('b').disabled).toBe(true);
    expect(store.ruleState('c').disabled).toBe(true);
  });

  it('bindings override static properties (IsVisible, IsRequired)', () => {
    const bound = formOf([
      textBox('a'),
      textBox('b', {
        isVisible: true,
        bindings: [
          { property: 'IsVisible', value: binding('{Control:a} != "hide"') },
          { property: 'IsRequired', value: binding('{Control:a} == "req"') }
        ]
      })
    ]);
    const store = createTestStore(bound, { mode: 'New', values: { a: 'req' } });
    expect(store.ruleState('b')).toEqual(expect.objectContaining({ hidden: false, required: true }));
    expect(store.setValue('a', 'hide')).toEqual(['b']);
    expect(store.ruleState('b')).toEqual(expect.objectContaining({ hidden: true, required: false }));
  });

  it('DefaultValue binding wins over the static default', () => {
    const def2 = formOf([textBox('a', { defaultValue: value('static'), bindings: [{ property: 'DefaultValue', value: binding('"bound"') }] })]);
    expect(createTestStore(def2, { mode: 'New' }).value('a')).toBe('bound');
  });
});

describe('RuleEngine – validation', () => {
  it('validation rule true → error on targets; empty targets → form-level error', () => {
    const def = formOf(
      [textBox('a'), textBox('b')],
      [
        rule('v1', '{Control:a} == "bad"', ['b'], { type: 'Validation', validationMessage: 'B hibás', inert: false }),
        rule('v2', '{Control:a} == "bad"', [], { type: 'Validation', validationMessage: 'Űrlap hiba', inert: false })
      ]
    );
    const result = createTestStore(def, { mode: 'New', values: { a: 'bad' } }).validate();
    expect(result.controlErrors.b).toEqual([{ code: 'rule', message: 'B hibás', ruleId: 'v1' }]);
    expect(result.formErrors).toEqual([{ code: 'rule', message: 'Űrlap hiba', ruleId: 'v2' }]);
    expect(result.valid).toBe(false);
    expect(createTestStore(def, { mode: 'New', values: { a: 'ok' } }).validate().valid).toBe(true);
  });

  it('live validation (controlIds) skips form-level rules', () => {
    const def = formOf([textBox('a')], [rule('v', 'true', [], { type: 'Validation', inert: false })]);
    expect(createTestStore(def, { mode: 'New' }).engine.validate({ controlIds: ['a'] }).formErrors).toEqual([]);
  });

  it('hidden/disabled controls are skipped; Display mode never validates', () => {
    const def = formOf(
      [textBox('a', { isRequired: true }), textBox('b', { isRequired: true, isEnabled: false }), textBox('c', { isRequired: true })],
      [rule('h', 'true', ['c'], { hide: true })]
    );
    const result = createTestStore(def, { mode: 'New' }).validate();
    expect(Object.keys(result.controlErrors)).toEqual(['a']);
    expect(createTestStore(def, { mode: 'Display' }).validate().valid).toBe(true);
  });

  it('control validators: data type, length, regex, range, compare', () => {
    const def = formOf([
      textBox('num', { dataType: 'Double' }),
      textBox('int', { dataType: 'Integer' }),
      textBox('len', { maxLength: 3 }),
      textBox('re', { validators: { regex: { pattern: '\\d{3}', message: 'Három számjegy' } } }),
      textBox('rng', { dataType: 'Integer', validators: { range: { minimum: '1', maximum: '10', message: '1-10' } } }),
      textBox('cmp', { validators: { compare: { operator: 'Equal', compareTo: 'Control', controlToCompare: 'LEN' } } }),
      dateTime('dt', { validators: { compare: { operator: 'GreaterThan', compareTo: 'Value', valueToCompare: '2024-01-01' } } })
    ]);
    const store = createTestStore(def, {
      mode: 'New',
      values: { num: '12,5', int: '1.5', len: 'abcd', re: '12345', rng: '11', cmp: 'other', dt: new Date(2023, 0, 1) }
    });
    const errors = store.validate().controlErrors;
    expect(errors.num).toBeUndefined();
    expect(errors.int).toEqual([{ code: 'integer' }]);
    expect(errors.len).toEqual([{ code: 'maxLength', params: { maxLength: 3 } }]);
    expect(errors.re).toEqual([{ code: 'regex', message: 'Három számjegy' }]);
    expect(errors.rng).toEqual([expect.objectContaining({ code: 'range', message: '1-10' })]);
    expect(errors.cmp).toEqual([expect.objectContaining({ code: 'compare' })]);
    expect(errors.dt).toEqual([expect.objectContaining({ code: 'compare' })]);
    expect(createTestStore(def, { mode: 'New', values: { num: 'abc' } }).validate().controlErrors.num).toEqual([{ code: 'number' }]);
  });

  it('empty values skip format checks; required uses the custom message', () => {
    const def = formOf([textBox('a', { isRequired: true, requiredErrorMessage: 'Kötelező!', validators: { regex: { pattern: 'x' } } })]);
    expect(createTestStore(def, { mode: 'New', values: { a: '   ' } }).validate().controlErrors.a).toEqual([
      { code: 'required', message: 'Kötelező!' }
    ]);
  });

  it('people picker entity limits and attachments', () => {
    const def = formOf([
      people('single'),
      people('multi', { multiSelect: true, maximumEntities: 2 }),
      attachment('att', { minimumAttachments: 2, maximumAttachments: 3 })
    ]);
    const p = (n: number): { kind: 'person'; displayName: string }[] =>
      Array.from({ length: n }, (_, i) => ({ kind: 'person' as const, displayName: `P${i}` }));
    const errors = createTestStore(def, { mode: 'New', values: { single: p(2), multi: p(3), att: ['a.txt'] } }).validate().controlErrors;
    expect(errors.single).toEqual([{ code: 'maxEntities', params: { maximum: 1 } }]);
    expect(errors.multi).toEqual([{ code: 'maxEntities', params: { maximum: 2 } }]);
    expect(errors.att).toEqual([expect.objectContaining({ code: 'minAttachments', params: { minimum: 2 } })]);
  });

  it('invalid regex patterns are reported, not thrown', () => {
    const def = formOf([textBox('a', { validators: { regex: { pattern: '(' } } })]);
    const store = createTestStore(def, { mode: 'New', values: { a: 'x' } });
    expect(store.validate().valid).toBe(true);
    expect(store.diagnostics).toContainEqual(expect.objectContaining({ code: 'InvalidValue', controlId: 'a' }));
  });

  it('custom validation true → error; message may be an expression', () => {
    const def = formOf([
      choice('a', {
        customValidation: { source: '{Self} == "x"', ast: ast('{Self} == "x"'), message: value('"Rossz: " + {Self}') }
      })
    ]);
    expect(createTestStore(def, { mode: 'New', values: { a: 'x' } }).validate().controlErrors.a).toEqual([{ code: 'custom', message: 'Rossz: x' }]);
    expect(createTestStore(def, { mode: 'New', values: { a: 'y' } }).validate().valid).toBe(true);
  });
});

describe('RuleEngine – calculations and dependency graph', () => {
  it('recalculates chained calculations in topological order', () => {
    const def = formOf([textBox('a'), calculation('c2', '{Control:c1} + "!"'), calculation('c1', 'toUpper({Control:a})')]);
    const graph = new DependencyGraph(def);
    expect(graph.calculationOrder).toEqual(['c1', 'c2']);
    const store = createTestStore(def, { mode: 'New', values: { a: 'x' } });
    expect(store.value('c2')).toBe('X!');
    expect(store.setValue('a', 'y').sort()).toEqual(['c1', 'c2']);
    expect(store.value('c2')).toBe('Y!');
  });

  it('rules depending on calculations are re-evaluated', () => {
    const def = formOf([textBox('a'), textBox('b'), calculation('c', 'length({Control:a})')], [rule('r', '{Control:c} > 2', ['b'], { hide: true })]);
    const store = createTestStore(def, { mode: 'New', values: { a: 'ab' } });
    expect(store.ruleState('b').hidden).toBe(false);
    expect(store.setValue('a', 'abc')).toEqual(expect.arrayContaining(['c', 'b']));
    expect(store.ruleState('b').hidden).toBe(true);
  });

  it('circular calculations are bounded and reported', () => {
    const def = formOf([calculation('x', '{Control:y} + 1'), calculation('y', '{Control:x} + 1')]);
    const store = createTestStore(def, { mode: 'New' });
    expect(new DependencyGraph(def).cyclicCalculations.sort()).toEqual(['x', 'y']);
    expect(typeof store.value('x')).toBe('number');
    expect(store.diagnostics).toContainEqual(expect.objectContaining({ code: 'CircularDependency' }));
  });

  it('tracing records rule evaluations', () => {
    const def = formOf([textBox('a'), textBox('b')], [rule('r', '{Control:a} == "x"', ['b'], { hide: true })]);
    const store = createTestStore(def, { mode: 'New' });
    store.engine.setTracing(true);
    store.setValue('a', 'x');
    expect(store.engine.trace).toEqual([expect.objectContaining({ ruleId: 'r', result: true })]);
  });
});
