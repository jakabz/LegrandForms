import { createStaticContext, StaticContextOptions } from '../context';
import { evaluate, evaluateCondition } from '../evaluator';
import { defaultRegistry } from '../functions';
import { parseExpression } from '../parser';
import type { Diagnostic } from '../../model/Diagnostic';
import { normalizeExpressionSource } from '../../parser/normalize';
import type { ExprValue, PersonValue } from '../values';

function run(source: string, options: StaticContextOptions = {}): ExprValue {
  const parsed = parseExpression(normalizeExpressionSource(source));
  if (parsed.error) {
    throw new Error(`Test expression does not parse: ${parsed.error.message}`);
  }
  return evaluate(parsed.ast, createStaticContext(options));
}

const ALICE: PersonValue = { kind: 'person', id: 7, loginName: 'i:0#.f|membership|alice@contoso.com', email: 'alice@contoso.com', displayName: 'Alice' };

describe('evaluate – operators', () => {
  it('null == "" is true (Nintex empty semantics)', () => {
    expect(run('{ItemProperty:Missing} == ""')).toBe(true);
    expect(run('{ItemProperty:Missing} != ""')).toBe(false);
    expect(run('{ItemProperty:Empty} == ""', { item: { Empty: [] } })).toBe(true);
  });

  it('compares as strings when one operand is a string', () => {
    expect(run('5 == "5"')).toBe(true);
    expect(run('"5.0" == 5')).toBe(false);
    expect(run('true == "true"')).toBe(true);
  });

  it('string comparison is case-sensitive', () => {
    expect(run('"Érvényes" == "érvényes"')).toBe(false);
  });

  it('+ concatenates when either operand is a string, adds numbers otherwise', () => {
    expect(run('"2024" + ". évre"')).toBe('2024. évre');
    expect(run('1 + "1"')).toBe('11');
    expect(run('1 + 2')).toBe(3);
    expect(run('{ItemProperty:Missing} + 2')).toBe(2);
  });

  it('arithmetic and relational operators', () => {
    expect(run('10 - 4 * 2 / 4 % 3')).toBe(8);
    expect(run('-(2 + 3)')).toBe(-5);
    expect(run('3 > 2 && 2 >= 2 && 1 < 2 && 2 <= 2')).toBe(true);
    expect(run('"10" > "9"')).toBe(true); // numeric strings compare numerically
    expect(run('"b" > "a"')).toBe(true);
    expect(run('1 / 0')).toBe(null);
  });

  it('logical operators short-circuit and coerce', () => {
    expect(run('"" || 0 || "x"')).toBe(true);
    expect(run('!""')).toBe(true);
    expect(run('!"false"')).toBe(true);
    expect(run('fn-unknown() && true')).toBe(false);
  });
});

describe('evaluate – references', () => {
  it('resolves {Common:*} from the form mode', () => {
    expect(run('{Common:IsNewMode}', { mode: 'New' })).toBe(true);
    expect(run('{Common:IsEditMode}', { mode: 'New' })).toBe(false);
    expect(run('or({Common:IsDisplayMode},{Common:IsEditMode})', { mode: 'Display' })).toBe(true);
    expect(run('or({Common:IsDisplayMode},{Common:IsEditMode})', { mode: 'New' })).toBe(false);
  });

  it('{Common:CurrentUser} is a person value whose text is the display name', () => {
    expect(run('{Common:CurrentUser}', { currentUser: ALICE })).toEqual([ALICE]);
    expect(run('{Common:CurrentUser} == "Alice"', { currentUser: ALICE })).toBe(true);
    expect(run('{Common:CurrentUser}', { currentUser: null })).toBe(null);
  });

  it('{Control:guid} reads the live value; unknown guid → null + OrphanReference', () => {
    const diagnostics: Diagnostic[] = [];
    const options: StaticContextOptions = {
      controls: { 'da0feb7e-3f91-4a71-926c-58707634f39e': 'Jóváhagyott audit' },
      report: (d) => diagnostics.push(d)
    };
    expect(run('{Control:da0feb7e-3f91-4a71-926c-58707634f39e}=="Jóváhagyott audit"', options)).toBe(true);
    expect(run('{Control:291a341c-3058-4f1c-bf7e-a776d8d4e512}=="&lt;típus&gt;"', options)).toBe(false);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'OrphanReference', source: '{Control:291a341c-3058-4f1c-bf7e-a776d8d4e512}' })
    ]);
  });

  it('{ItemProperty:X} reads the item snapshot', () => {
    const item = { Status: 'Készítés alatt' };
    expect(run('{ItemProperty:Status}&nbsp;== "Készítés alatt" || {ItemProperty:Status}&nbsp;== "Szöveg kész"', { item })).toBe(true);
    expect(run('{ItemProperty:Status}=="Érvényes"', { item })).toBe(false);
  });

  it('{Self} and variables', () => {
    expect(run('{Self} == "x"', { selfValue: 'x' })).toBe(true);
    expect(run('{FormVariable:selectedFormType}', { variables: { selectedFormType: 'MU' } })).toBe('MU');
  });

  it('unknown namespaces resolve to null with UnsupportedReference', () => {
    const diagnostics: Diagnostic[] = [];
    expect(run('{WorkflowVariable:X}', { report: (d) => diagnostics.push(d) })).toBe(null);
    expect(run('{Common:Bogus}', { report: (d) => diagnostics.push(d) })).toBe(null);
    expect(diagnostics.map((d) => d.code)).toEqual(['UnsupportedReference', 'UnsupportedReference']);
  });
});

describe('evaluate – functions', () => {
  it('function names are case-insensitive and may contain "-"', () => {
    expect(run('IF(true, "a", "b")')).toBe('a');
    expect(run('if(false, "a", "b")')).toBe('b');
    expect(run('FN-ISMEMBEROFGROUP("hungary owners")', { currentUserGroups: ['Hungary Owners'] })).toBe(true);
    expect(run('fn-IsMemberOfGroup("Hungary Owners")', { currentUserGroups: ['Hungary Members'] })).toBe(false);
  });

  it('If is lazy', () => {
    const diagnostics: Diagnostic[] = [];
    expect(run('If(true, 1, nope())', { report: (d) => diagnostics.push(d) })).toBe(1);
    expect(diagnostics).toHaveLength(0);
  });

  it('unknown functions → null + UnsupportedFunction', () => {
    const diagnostics: Diagnostic[] = [];
    expect(run('userProfileLookup("x", "y")', { report: (d) => diagnostics.push(d) })).toBe(null);
    expect(diagnostics[0]).toEqual(expect.objectContaining({ code: 'UnsupportedFunction' }));
  });

  it('isNullOrEmpty / isDate / length', () => {
    expect(run('isNullOrEmpty({ItemProperty:DocCreatedBy})', { item: { DocCreatedBy: [] } })).toBe(true);
    expect(run('isNullOrEmpty("x")')).toBe(false);
    expect(run('!isDate({ItemProperty:PlanDate})', { item: { PlanDate: new Date(2024, 0, 1) } })).toBe(false);
    expect(run('!isDate({ItemProperty:PlanDate})', { item: { PlanDate: null } })).toBe(true);
    expect(run('isDate("2024-02-30")')).toBe(false);
    expect(run('length({Control:a}) == 0', { controls: { a: '' } })).toBe(true);
    expect(run('length({Control:a})', { controls: { a: ['x', 'y'] } })).toBe(2);
  });

  it('AJ calculation: created-by falls back to Author', () => {
    const formula = 'If(isNullOrEmpty({ItemProperty:DocCreatedBy}),{ItemProperty:Author},{ItemProperty:DocCreatedBy})';
    expect(run(formula, { item: { DocCreatedBy: [], Author: [ALICE] } })).toEqual([ALICE]);
  });

  it('AT calculation: planned audit title', () => {
    const formula =
      'If(isDate({Control:28bd3236-9559-4aae-b786-610e8dbcdd5a}), formatDate({Control:28bd3236-9559-4aae-b786-610e8dbcdd5a}, "yyyy") +". évre tervezett "+ If({Control:105d7bc6-5fa0-4469-a7fd-ee39746a0598}=="", "belső minőségügyi audit", toLower({Control:105d7bc6-5fa0-4469-a7fd-ee39746a0598})), "")';
    const date = new Date(2025, 4, 10);
    expect(
      run(formula, {
        controls: { '28bd3236-9559-4aae-b786-610e8dbcdd5a': date, '105d7bc6-5fa0-4469-a7fd-ee39746a0598': 'Legrand audit' }
      })
    ).toBe('2025. évre tervezett legrand audit');
    expect(
      run(formula, {
        controls: { '28bd3236-9559-4aae-b786-610e8dbcdd5a': date, '105d7bc6-5fa0-4469-a7fd-ee39746a0598': '' }
      })
    ).toBe('2025. évre tervezett belső minőségügyi audit');
    expect(
      run(formula, {
        controls: { '28bd3236-9559-4aae-b786-610e8dbcdd5a': null, '105d7bc6-5fa0-4469-a7fd-ee39746a0598': '' }
      })
    ).toBe('');
  });

  it('text functions', () => {
    expect(run('toUpper(trim("  ab "))')).toBe('AB');
    expect(run('replace("a-b-c", "-", "+")')).toBe('a+b+c');
    expect(run('substring("abcdef", 2, 3)')).toBe('cde');
    expect(run('fn-SubString("abcdef", 2)')).toBe('cdef');
    expect(run('contains("abc", "b") && startsWith("abc", "a") && endsWith("abc", "c")')).toBe(true);
    expect(run('fn-PadLeft("7", 3, "0")')).toBe('007');
    expect(run('fn-Title("hello wORLD")')).toBe('Hello World');
    expect(run('fn-Insert("ac", 1, "b") + fn-Remove("abcd", 1, 2)')).toBe('abcad');
    expect(run('parseLookup("3;#Budapest")')).toBe('Budapest');
    expect(run('parseLookup({Control:x})', { controls: { x: [{ kind: 'lookup', id: 1, title: 'A' }, { kind: 'lookup', id: 2, title: 'B' }] } })).toBe('A;B');
    expect(run('concat("a", 1, true)')).toBe('a1true');
  });

  it('math functions', () => {
    expect(run('sum(1, "2", {Control:x})', { controls: { x: ['3', '4'] } })).toBe(10);
    expect(run('round(2.5)')).toBe(3);
    expect(run('round(-2.5)')).toBe(-3);
    expect(run('round(1.005, 2)')).toBe(1.01);
    expect(run('min(3, 1, 2) + max(3, 1, 2)')).toBe(4);
    expect(run('average(1, 2, 3)')).toBe(2);
    expect(run('count({Control:x}, "", "a")', { controls: { x: ['a', 'b'] } })).toBe(3);
    expect(run('fn-Abs(-3) + power(2, 3) + floor(1.7) + ceiling(1.2)')).toBe(14);
    expect(run('convertToNumber("12,5")')).toBe(12.5);
  });

  it('date functions', () => {
    const now = new Date(2026, 9, 6, 14, 5, 9);
    expect(run('formatDate({Common:CurrentDate}, "yyyy.MM.dd")', { now })).toBe('2026.10.06');
    expect(run('formatDate({Common:CurrentTime}, "HH:mm:ss")', { now })).toBe('14:05:09');
    expect(run('formatDate({Common:CurrentTime}, "d")', { now })).toBe('2026. 10. 06.');
    expect(run('formatDate({Common:CurrentTime}, "d")', { now, locale: 'en-US' })).toBe('10/6/2026');
    expect(run('formatDate({Common:CurrentTime}, "MMMM")', { now, locale: 'en-US' })).toBe('October');
    expect(run('formatDate(now(), "yy\'-\'M-d h tt")', { now })).toBe('26-10-6 2 PM');
    expect(run('dateDiffDays("2024-03-30", "2024-04-02")')).toBe(3);
    expect(run('formatDate(addDays("2024-02-28", 2), "yyyy-MM-dd")')).toBe('2024-03-01');
    expect(run('formatDate(today(), "HH:mm")', { now })).toBe('00:00');
    expect(run('formatDate("not a date", "yyyy")')).toBe('');
  });

  it('runtime errors inside a function are contained', () => {
    defaultRegistry.register('testThrows', () => {
      throw new Error('boom');
    });
    const diagnostics: Diagnostic[] = [];
    expect(run('testThrows()', { report: (d) => diagnostics.push(d) })).toBe(null);
    expect(diagnostics[0]).toEqual(expect.objectContaining({ code: 'ExpressionRuntimeError' }));
  });
});

describe('evaluateCondition', () => {
  it('treats ErrorNode and null as false', () => {
    expect(evaluateCondition(null, createStaticContext())).toBe(false);
    expect(evaluateCondition(parseExpression('1 +').ast, createStaticContext())).toBe(false);
    expect(evaluateCondition(parseExpression('"x"').ast, createStaticContext())).toBe(true);
  });
});
