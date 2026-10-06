/**
 * Runtime value model of the expression language and its coercion rules (Rendszerterv §8.4).
 */

export interface PersonValue {
  kind: 'person';
  /** SharePoint user id (site-specific), when known. */
  id?: number;
  loginName?: string;
  email?: string;
  displayName: string;
  /** `User`, `SecGroup`, `SPGroup`. */
  principalType?: string;
}

export interface LookupValue {
  kind: 'lookup';
  id: number;
  title: string;
}

export type ExprArrayItem = string | PersonValue | LookupValue;

export type ExprValue = string | number | boolean | Date | null | ReadonlyArray<ExprArrayItem>;

export const MULTI_VALUE_SEPARATOR: string = ';';

export function isPersonValue(value: unknown): value is PersonValue {
  return typeof value === 'object' && value !== null && (value as PersonValue).kind === 'person';
}

export function isLookupValue(value: unknown): value is LookupValue {
  return typeof value === 'object' && value !== null && (value as LookupValue).kind === 'lookup';
}

export function isDateValue(value: unknown): value is Date {
  return value instanceof Date || Object.prototype.toString.call(value) === '[object Date]';
}

export function isValidDate(value: unknown): value is Date {
  return isDateValue(value) && !isNaN(value.getTime());
}

function pad(value: number, length: number = 2): string {
  let text = String(value);
  while (text.length < length) text = '0' + text;
  return text;
}

/** Local-time `yyyy-MM-dd` (or `yyyy-MM-dd HH:mm` when the time part is not midnight). */
export function dateToText(date: Date): string {
  if (isNaN(date.getTime())) {
    return '';
  }
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
    return datePart;
  }
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function itemToText(item: ExprArrayItem): string {
  if (typeof item === 'string') return item;
  if (isPersonValue(item)) return item.displayName || item.loginName || item.email || '';
  if (isLookupValue(item)) return item.title;
  return '';
}

/** Text form of a value: People → display name, Lookup → title, arrays joined with `;`. */
export function toText(value: ExprValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return isNaN(value) ? '' : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (isDateValue(value)) return dateToText(value);
  if (Array.isArray(value)) {
    return (value as ReadonlyArray<ExprArrayItem>).map(itemToText).join(MULTI_VALUE_SEPARATOR);
  }
  return '';
}

/** True for null, `""`, empty arrays and invalid dates. */
export function isEmptyValue(value: ExprValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (typeof value === 'number') return isNaN(value);
  if (isDateValue(value)) return isNaN(value.getTime());
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Parses numbers written with `.` or `,` as decimal separator and optional thousand separators/spaces. */
export function parseNumber(text: string): number {
  const trimmed = text.replace(/[\s ]/g, '');
  if (!trimmed) return NaN;
  let normalized = trimmed;
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // The later separator is the decimal one.
    normalized =
      lastComma > lastDot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = normalized.replace(',', '.');
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?$/i.test(normalized)) {
    return NaN;
  }
  return parseFloat(normalized.replace('%', ''));
}

/** Numeric form of a value. null/empty → 0 is NOT applied here (see `toNumberOrZero`). */
export function toNumber(value: ExprValue | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return parseNumber(value);
  if (isDateValue(value)) return value.getTime();
  if (Array.isArray(value)) return value.length === 1 ? toNumber(itemToText(value[0])) : NaN;
  return NaN;
}

/** Arithmetic operand: empty → 0. */
export function toNumberOrZero(value: ExprValue | undefined): number {
  if (isEmptyValue(value)) return 0;
  return toNumber(value);
}

/** Truthiness in a boolean context: `""`, null, 0, false, `"false"`, empty array → false. */
export function toBoolean(value: ExprValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !isNaN(value);
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    return lower !== '' && lower !== 'false' && lower !== '0';
  }
  if (isDateValue(value)) return !isNaN(value.getTime());
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

const ISO_DATE: RegExp = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const HU_DATE: RegExp = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/** Converts a value to a valid Date, or null. Accepts Date, ISO strings and Hungarian `yyyy. MM. dd.` strings. */
export function toDate(value: ExprValue | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (isDateValue(value)) return isNaN(value.getTime()) ? null : value;
  if (Array.isArray(value)) return value.length === 1 ? toDate(itemToText(value[0])) : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const iso = ISO_DATE.exec(text);
  if (iso) {
    if (iso[7]) {
      const parsed = new Date(text.replace(' ', 'T'));
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    return buildLocalDate(iso);
  }
  const hu = HU_DATE.exec(text);
  if (hu) {
    return buildLocalDate(hu);
  }
  return null;
}

function buildLocalDate(match: RegExpExecArray): Date | null {
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const hours = match[4] ? parseInt(match[4], 10) : 0;
  const minutes = match[5] ? parseInt(match[5], 10) : 0;
  const seconds = match[6] ? parseInt(match[6], 10) : 0;
  const date = new Date(year, month, day, hours, minutes, seconds);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Nintex `==`: null equals `""`; when either operand is a string (or anything non-primitive) the comparison is
 * done on the text forms; numbers/booleans/dates compare by value.
 */
export function looseEquals(left: ExprValue | undefined, right: ExprValue | undefined): boolean {
  if (isEmptyValue(left) && isEmptyValue(right)) return true;
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return left === right;
  if (isDateValue(left) && isDateValue(right)) return left.getTime() === right.getTime();
  return toText(left) === toText(right);
}

/**
 * Relational comparison. Returns negative/zero/positive, or NaN when the operands are not comparable.
 * Dates compare chronologically, numbers (or numeric strings) numerically, other strings ordinally.
 */
export function compareValues(left: ExprValue | undefined, right: ExprValue | undefined): number {
  if (isDateValue(left) || isDateValue(right)) {
    const l = toDate(left);
    const r = toDate(right);
    if (!l || !r) return NaN;
    return l.getTime() - r.getTime();
  }
  const ln = toNumber(left);
  const rn = toNumber(right);
  if (!isNaN(ln) && !isNaN(rn)) {
    return ln - rn;
  }
  const lt = toText(left);
  const rt = toText(right);
  if (lt === rt) return 0;
  return lt < rt ? -1 : 1;
}

/** Nintex `+`: string concatenation when either operand is text-like, numeric addition otherwise. */
export function addValues(left: ExprValue | undefined, right: ExprValue | undefined): ExprValue {
  const textual = (v: ExprValue | undefined): boolean =>
    typeof v === 'string' || Array.isArray(v) || isDateValue(v);
  if (textual(left) || textual(right)) {
    return toText(left) + toText(right);
  }
  return toNumberOrZero(left) + toNumberOrZero(right);
}
