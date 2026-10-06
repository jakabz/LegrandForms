import { tokenize } from '../lexer';
import { parseExpression } from '../parser';
import { collectControlIds, collectFunctionNames, collectItemProperties } from '../references';
import { normalizeExpressionSource } from '../../parser/normalize';

/** Every ExpressionValue / Formula / binding found in samples/*.xml (after XML parsing, before normalization). */
const SAMPLE_EXPRESSIONS: string[] = [
  '{Common:IsNewMode}',
  'or({Common:IsDisplayMode},{Common:IsEditMode})',
  'length({Control:1f6fd549-bd42-4da6-a5a5-5ddee21d3393}) == 0',
  '{Control:da0feb7e-3f91-4a71-926c-58707634f39e}=="Jóváhagyott audit"',
  '{Control:da0feb7e-3f91-4a71-926c-58707634f39e}=="Audit végrehajtva"',
  '{Common:IsNewMode}&nbsp;|| {ItemProperty:Auditor}&nbsp;!= ""',
  '{ItemProperty:DocCreatedBy}&nbsp;!= ""',
  '!isDate({ItemProperty:PlanDate})',
  '{ItemProperty:TimeCreated}&nbsp;== ""',
  '{Common:IsDisplayMode}',
  '{Common:IsEditMode}',
  '{Control:291a341c-3058-4f1c-bf7e-a776d8d4e512}=="&lt;típus&gt;"',
  '{Control:846db848-9491-4bf1-b574-ab3d67488194}=="Érvényes"',
  '{ItemProperty:Status}=="Készítés alatt" || {ItemProperty:Status}=="Ellenőrzött" || {ItemProperty:Status}=="Szöveg kész"',
  '!isDate({ItemProperty:CreatedDate}) || {ItemProperty:isNewVersion}&nbsp;!=""',
  '{ItemProperty:Status}&nbsp;== "Készítés alatt" || {ItemProperty:Status}&nbsp;== "Szöveg kész"',
  '{ItemProperty:Status}==\"Érvényes\"',
  'If(isNullOrEmpty({ItemProperty:DocCreatedBy}),{ItemProperty:Author},{ItemProperty:DocCreatedBy})',
  '{Control:1f6fd549-bd42-4da6-a5a5-5ddee21d3393}',
  'If(isDate({Control:28bd3236-9559-4aae-b786-610e8dbcdd5a}), formatDate({Control:28bd3236-9559-4aae-b786-610e8dbcdd5a}, "yyyy") +". évre tervezett "+ If({Control:105d7bc6-5fa0-4469-a7fd-ee39746a0598}=="", "belső minőségügyi audit", toLower({Control:105d7bc6-5fa0-4469-a7fd-ee39746a0598})), "")',
  'fn-IsMemberOfGroup("Hungary Owners")',
  '{ItemProperty:TypeofDoc}=="&lt;típus&gt;"',
  'If({ItemProperty:Form}=="Minőségcél","Adjuk meg a minőségcél típusát!","Adjuk meg a munkautasítás típusát!")'
];

describe('lexer', () => {
  it('tokenizes references, strings, operators and dashed identifiers', () => {
    const tokens = tokenize('fn-IsMemberOfGroup("A") || {Control:ABC}!=\'x\'');
    expect(tokens.map((t) => `${t.type}:${t.value}`)).toEqual([
      'identifier:fn-IsMemberOfGroup',
      'lparen:(',
      'string:A',
      'rparen:)',
      'operator:||',
      'reference:Control:ABC',
      'operator:!=',
      'string:x',
      'eof:'
    ]);
  });

  it('treats a dash followed by a digit as minus', () => {
    expect(tokenize('a(1)-2').map((t) => t.value)).toEqual(['a', '(', '1', ')', '-', '2', '']);
  });

  it('accepts lenient operators', () => {
    expect(tokenize('1 = 1 <> 2').map((t) => t.value)).toEqual(['1', '==', '1', '!=', '2', '']);
  });
});

describe('parseExpression', () => {
  it.each(SAMPLE_EXPRESSIONS)('parses sample expression %s', (raw) => {
    const result = parseExpression(normalizeExpressionSource(raw));
    expect(result.error).toBeUndefined();
    expect(result.ast.kind).not.toBe('Error');
  });

  it('honours precedence: || < && < == < + < unary', () => {
    expect(parseExpression('!a() || b() && 1 + 2 * 3 == 7').ast).toEqual({
      kind: 'Binary',
      operator: '||',
      left: { kind: 'Unary', operator: '!', operand: { kind: 'Call', name: 'a', args: [] } },
      right: {
        kind: 'Binary',
        operator: '&&',
        left: { kind: 'Call', name: 'b', args: [] },
        right: {
          kind: 'Binary',
          operator: '==',
          left: {
            kind: 'Binary',
            operator: '+',
            left: { kind: 'Literal', value: 1 },
            right: {
              kind: 'Binary',
              operator: '*',
              left: { kind: 'Literal', value: 2 },
              right: { kind: 'Literal', value: 3 }
            }
          },
          right: { kind: 'Literal', value: 7 }
        }
      }
    });
  });

  it('is left-associative', () => {
    expect(parseExpression('1 - 2 - 3').ast).toEqual({
      kind: 'Binary',
      operator: '-',
      left: {
        kind: 'Binary',
        operator: '-',
        left: { kind: 'Literal', value: 1 },
        right: { kind: 'Literal', value: 2 }
      },
      right: { kind: 'Literal', value: 3 }
    });
  });

  it('lower-cases control guids and canonicalizes namespaces', () => {
    expect(parseExpression('{control:{ABCDEF00-0000-0000-0000-000000000001}}').ast).toEqual({
      kind: 'Reference',
      namespace: 'Control',
      name: 'abcdef00-0000-0000-0000-000000000001'
    });
    expect(parseExpression('{Self}').ast).toEqual({ kind: 'Reference', namespace: 'Self', name: '' });
  });

  it('parses keywords', () => {
    expect(parseExpression('TRUE').ast).toEqual({ kind: 'Literal', value: true });
    expect(parseExpression('null').ast).toEqual({ kind: 'Literal', value: null });
  });

  it.each([
    ['', 'Empty expression'],
    ['{ItemProperty:Status}&nbsp;== "x"', 'Unexpected character "&"'],
    ['If(1,', 'Unexpected end'],
    ['"unterminated', 'Unterminated string'],
    ['a b', 'Unknown identifier'],
    ['1 +', 'Unexpected end'],
    ['(1', 'Expected ")"'],
    ['{Control:abc', 'Unterminated reference']
  ])('returns an ErrorNode for %j', (source, message) => {
    const result = parseExpression(source);
    expect(result.ast.kind).toBe('Error');
    expect(result.error && result.error.message).toContain(message);
  });

  it('collects dependencies statically', () => {
    const ast = parseExpression(
      normalizeExpressionSource(SAMPLE_EXPRESSIONS[19])
    ).ast;
    expect(collectControlIds(ast)).toEqual([
      '28bd3236-9559-4aae-b786-610e8dbcdd5a',
      '105d7bc6-5fa0-4469-a7fd-ee39746a0598'
    ]);
    expect(collectFunctionNames(ast)).toEqual(['If', 'isDate', 'formatDate', 'toLower']);
    expect(collectItemProperties(parseExpression(normalizeExpressionSource(SAMPLE_EXPRESSIONS[17])).ast)).toEqual([
      'DocCreatedBy',
      'Author'
    ]);
  });
});
