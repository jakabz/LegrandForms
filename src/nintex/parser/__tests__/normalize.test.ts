import { decodeHtmlEntities, normalizeExpressionSource, normalizeGuid, isGuid, replaceNbsp } from '../normalize';

describe('decodeHtmlEntities', () => {
  it('decodes exactly one level (double-encoded export values)', () => {
    // XML parsing already turned &amp;lt; into &lt;
    expect(decodeHtmlEntities('{Control:x}=="&lt;típus&gt;"')).toBe('{Control:x}=="<típus>"');
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });

  it('decodes numeric and hex entities', () => {
    expect(decodeHtmlEntities('a&#160;b&#x151;')).toBe('a bő');
  });

  it('keeps unknown entities and bare ampersands', () => {
    expect(decodeHtmlEntities('a &unknown; b & c')).toBe('a &unknown; b & c');
  });

  it('decodes Hungarian named entities', () => {
    expect(decodeHtmlEntities('&Eacute;rv&eacute;nyes &odblac;')).toBe('Érvényes ő');
  });
});

describe('normalizeExpressionSource', () => {
  it('turns &nbsp; into a regular space', () => {
    expect(normalizeExpressionSource('{ItemProperty:Status}&nbsp;== "Készítés alatt"')).toBe(
      '{ItemProperty:Status} == "Készítés alatt"'
    );
  });

  it('replaces raw U+00A0 and trims', () => {
    expect(normalizeExpressionSource(' {Common:IsNewMode} || true ')).toBe('{Common:IsNewMode} || true');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeExpressionSource(undefined)).toBe('');
    expect(normalizeExpressionSource(null)).toBe('');
  });

  it('replaceNbsp only touches U+00A0', () => {
    expect(replaceNbsp('a b c')).toBe('a b c');
  });
});

describe('normalizeGuid', () => {
  it('lower-cases and strips braces', () => {
    expect(normalizeGuid(' {291A341C-3058-4F1C-BF7E-A776D8D4E512} ')).toBe('291a341c-3058-4f1c-bf7e-a776d8d4e512');
    expect(isGuid('291a341c-3058-4f1c-bf7e-a776d8d4e512')).toBe(true);
    expect(isGuid('Title')).toBe(false);
    expect(normalizeGuid(undefined)).toBe('');
  });
});
