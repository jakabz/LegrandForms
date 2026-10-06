/**
 * Text normalization applied after XML parsing (Rendszerterv §2.4, §5.4, §8.1).
 *
 * The Nintex export double-encodes some entities (`&amp;lt;típus&amp;gt;`) and puts `&amp;nbsp;` into
 * expressions and CSS. The XML parser decodes the first level; these helpers decode exactly one more level.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  divide: '÷',
  euro: '€',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  sect: '§',
  para: '¶',
  shy: '­',
  Aacute: 'Á',
  aacute: 'á',
  Eacute: 'É',
  eacute: 'é',
  Iacute: 'Í',
  iacute: 'í',
  Oacute: 'Ó',
  oacute: 'ó',
  Ouml: 'Ö',
  ouml: 'ö',
  Odblac: 'Ő',
  odblac: 'ő',
  Uacute: 'Ú',
  uacute: 'ú',
  Uuml: 'Ü',
  uuml: 'ü',
  Udblac: 'Ű',
  udblac: 'ű',
  Auml: 'Ä',
  auml: 'ä',
  szlig: 'ß'
};

const ENTITY_PATTERN: RegExp = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g;

/** Decodes one level of HTML entities. Unknown named entities are left untouched. */
export function decodeHtmlEntities(input: string): string {
  if (input.indexOf('&') < 0) {
    return input;
  }
  return input.replace(ENTITY_PATTERN, (match: string, body: string) => {
    if (body.charAt(0) === '#') {
      const isHex = body.charAt(1) === 'x' || body.charAt(1) === 'X';
      const code = isHex ? parseInt(body.substring(2), 16) : parseInt(body.substring(1), 10);
      if (isNaN(code) || code <= 0 || code > 0x10ffff) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    const decoded = NAMED_ENTITIES[body];
    return decoded !== undefined ? decoded : match;
  });
}

/** Replaces non-breaking spaces (U+00A0) with regular spaces. */
export function replaceNbsp(input: string): string {
  return input.replace(/ /g, ' ');
}

/**
 * Normalizes a Nintex expression source (`ExpressionValue`, `Formula`, `DefaultValue`, …):
 * one more entity-decoding pass, NBSP → space, trimmed.
 */
export function normalizeExpressionSource(raw: string | undefined | null): string {
  if (!raw) {
    return '';
  }
  return replaceNbsp(decodeHtmlEntities(raw)).trim();
}

/** Normalizes a plain text value (choice, message, default value): entities decoded, NBSP → space, trimmed. */
export function normalizeTextValue(raw: string | undefined | null): string {
  return normalizeExpressionSource(raw);
}

const GUID_PATTERN: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lower-case guid without braces/whitespace. Returns the trimmed lower-cased input even when it is not a guid. */
export function normalizeGuid(raw: string | undefined | null): string {
  if (!raw) {
    return '';
  }
  return raw.trim().replace(/^\{/, '').replace(/\}$/, '').toLowerCase();
}

export function isGuid(value: string): boolean {
  return GUID_PATTERN.test(value);
}

export const EMPTY_GUID: string = '00000000-0000-0000-0000-000000000000';
