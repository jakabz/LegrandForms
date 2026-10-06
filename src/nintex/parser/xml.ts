import { XMLParser, XMLValidator } from 'fast-xml-parser';

/** A parsed XML element as produced by fast-xml-parser (`@_` prefixed attributes, `#text` for mixed content). */
export interface XmlNode {
  [key: string]: XmlValue;
}
export type XmlValue = string | XmlNode | XmlValue[] | undefined;

/** Element names that are always parsed as arrays (collections in the Nintex DataContract). */
const ARRAY_ELEMENTS: ReadonlyArray<string> = [
  'FormControlProperties',
  'FormControlLayout',
  'FormLayout',
  'Rule',
  'string',
  'KeyValueOfstringstring',
  'PeopleEditor.AccountType',
  'UserFormVariable'
];

const parser: XMLParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  isArray: (name: string) => ARRAY_ELEMENTS.indexOf(name) >= 0
});

export interface XmlParseResult {
  root?: XmlNode;
  error?: string;
}

function decodeUtf16(bytes: Uint8Array, offset: number, littleEndian: boolean): string {
  const chunks: string[] = [];
  const CHUNK = 8192;
  let codes: number[] = [];
  for (let i = offset; i + 1 < bytes.length; i += 2) {
    codes.push(littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
    if (codes.length === CHUNK) {
      chunks.push(String.fromCharCode.apply(null, codes));
      codes = [];
    }
  }
  if (codes.length) {
    chunks.push(String.fromCharCode.apply(null, codes));
  }
  return chunks.join('');
}

function decodeUtf8(bytes: Uint8Array, offset: number): string {
  // TextDecoder exists in browsers and Node, but not in every test environment (jsdom).
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes.subarray(offset));
  }
  const chunks: string[] = [];
  let codes: number[] = [];
  let i = offset;
  while (i < bytes.length) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xc0 && b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0 && b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xf0) {
      cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else cp = 0xfffd;
    if (cp > 0xffff) {
      cp -= 0x10000;
      codes.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      codes.push(cp);
    }
    if (codes.length >= 8192) {
      chunks.push(String.fromCharCode.apply(null, codes));
      codes = [];
    }
  }
  if (codes.length) chunks.push(String.fromCharCode.apply(null, codes));
  return chunks.join('');
}

/**
 * Decodes the bytes of a Nintex export. The exports are UTF-16LE (usually without BOM) and declare
 * `encoding="utf-16"`; files re-saved by editors may be UTF-8. Detection: BOM, then the zero-byte pattern of `<`.
 */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeUtf8(bytes, 3);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeUtf16(bytes, 2, true);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16(bytes, 2, false);
  }
  if (bytes.length >= 2 && bytes[0] !== 0 && bytes[1] === 0) {
    return decodeUtf16(bytes, 0, true);
  }
  if (bytes.length >= 2 && bytes[0] === 0 && bytes[1] !== 0) {
    return decodeUtf16(bytes, 0, false);
  }
  return decodeUtf8(bytes, 0);
}

/** Removes a leading BOM character and the XML declaration (its `encoding` no longer applies to a JS string). */
export function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^﻿/, '').replace(/^\s*<\?xml[^?]*\?>/, '');
}

/** Parses an XML document. Returns the document element (`Form`) container or an error message. Never throws. */
export function parseXml(xml: string): XmlParseResult {
  const text = stripXmlDeclaration(xml);
  if (!text.trim()) {
    return { error: 'The document is empty' };
  }
  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    const err = validation.err;
    return { error: `${err.msg} (line ${err.line}, column ${err.col})` };
  }
  try {
    return { root: parser.parse(text) as XmlNode };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Typed readers. `i:nil="true"` elements read as undefined.

export function isNode(value: XmlValue): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNil(value: XmlValue): boolean {
  return isNode(value) && value['@_nil'] === 'true';
}

export function child(node: XmlNode | undefined, key: string): XmlNode | undefined {
  if (!node) return undefined;
  const value = node[key];
  if (isNode(value)) return value;
  if (Array.isArray(value) && value.length && isNode(value[0])) return value[0];
  return undefined;
}

export function children(node: XmlNode | undefined, key: string): XmlNode[] {
  if (!node) return [];
  const value = node[key];
  if (Array.isArray(value)) return value.filter(isNode);
  if (isNode(value)) return [value];
  return [];
}

/** Text content of a child element; undefined when missing or nil. Empty elements read as `""`. */
export function text(node: XmlNode | undefined, key: string): string | undefined {
  if (!node) return undefined;
  const value = node[key];
  if (value === undefined || isNil(value)) return undefined;
  if (typeof value === 'string') return value;
  if (isNode(value)) {
    const inner = value['#text'];
    return typeof inner === 'string' ? inner : '';
  }
  return undefined;
}

/** Text content, with empty strings mapped to undefined. */
export function nonEmptyText(node: XmlNode | undefined, key: string): string | undefined {
  const value = text(node, key);
  return value === undefined || value.trim() === '' ? undefined : value;
}

export function bool(node: XmlNode | undefined, key: string, fallback: boolean): boolean {
  const value = text(node, key);
  if (value === undefined || value === '') return fallback;
  return value.trim().toLowerCase() === 'true';
}

export function int(node: XmlNode | undefined, key: string, fallback: number): number {
  const value = text(node, key);
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/** Reads a DataContract string array (`<Key><d4p1:string>…</d4p1:string></Key>`), dropping empty items. */
export function stringList(node: XmlNode | undefined, key: string, itemKey: string = 'string'): string[] {
  const container = child(node, key);
  if (!container) return [];
  const items = container[itemKey];
  const list: XmlValue[] = Array.isArray(items) ? items : items === undefined ? [] : [items];
  const result: string[] = [];
  list.forEach((item) => {
    if (typeof item === 'string') {
      if (item.trim() !== '') result.push(item);
    } else if (isNode(item) && typeof item['#text'] === 'string' && item['#text'].trim() !== '') {
      result.push(item['#text']);
    }
  });
  return result;
}
