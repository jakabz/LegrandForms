import { createStaticContext } from '../context';
import { compileValueSource, evaluateValueSource, valueSourceText } from '../valueSource';

describe('compileValueSource (Rendszerterv §8.1)', () => {
  it('plain text is a literal', () => {
    expect(compileValueSource('Készítés alatt').value).toEqual({ kind: 'literal', text: 'Készítés alatt' });
    expect(compileValueSource('Utolsó módosítás (Notes)').value.kind).toBe('literal');
  });

  it('a lone token is an expression', () => {
    const compiled = compileValueSource('{ItemProperty:AuditOrg}');
    expect(compiled.value).toEqual({
      kind: 'expression',
      source: '{ItemProperty:AuditOrg}',
      ast: { kind: 'Reference', namespace: 'ItemProperty', name: 'AuditOrg' }
    });
  });

  it('a function call is an expression', () => {
    const compiled = compileValueSource(
      'If({ItemProperty:Form}=="Minőségcél","Adjuk meg a minőségcél típusát!","Adjuk meg a munkautasítás típusát!")'
    );
    expect(compiled.value.kind).toBe('expression');
    const ctx = createStaticContext({ item: { Form: 'Minőségcél' } });
    expect(evaluateValueSource(compiled.value, ctx)).toBe('Adjuk meg a minőségcél típusát!');
  });

  it('tokens mixed with free text form a template', () => {
    const compiled = compileValueSource('Készítette: {Common:CurrentUser} ({ItemProperty:Status})');
    expect(compiled.value.kind).toBe('template');
    expect(compiled.parseError).toBeDefined();
    const ctx = createStaticContext({
      currentUser: { kind: 'person', displayName: 'Alice' },
      item: { Status: 'Új' }
    });
    expect(evaluateValueSource(compiled.value, ctx)).toBe('Készítette: Alice (Új)');
  });

  it('evaluates literals and missing sources', () => {
    const ctx = createStaticContext();
    expect(evaluateValueSource({ kind: 'literal', text: 'x' }, ctx)).toBe('x');
    expect(evaluateValueSource(undefined, ctx)).toBe(null);
    expect(valueSourceText(undefined)).toBe('');
    expect(valueSourceText({ kind: 'literal', text: 'x' })).toBe('x');
    expect(valueSourceText(compileValueSource('{Common:IsNewMode}').value)).toBe('{Common:IsNewMode}');
  });
});
