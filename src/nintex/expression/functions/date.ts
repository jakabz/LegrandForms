import { ExprValue, toDate, toNumber, toText } from '../values';
import { aliasFunction, registerFunction } from './registry';

const DEFAULT_LOCALE: string = 'hu-HU';
const DAY_MS: number = 24 * 60 * 60 * 1000;

function pad(value: number, length: number): string {
  let text = String(value);
  while (text.length < length) text = '0' + text;
  return text;
}

function intlPart(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
}

/** Expansion of .NET standard (single-letter) date formats. */
function standardFormat(format: string, locale: string): string | undefined {
  const hungarian = locale.toLowerCase().indexOf('hu') === 0;
  const shortDate = hungarian ? 'yyyy. MM. dd.' : 'M/d/yyyy';
  switch (format) {
    case 'd':
      return shortDate;
    case 't':
      return hungarian ? 'H:mm' : 'h:mm tt';
    case 'T':
      return hungarian ? 'H:mm:ss' : 'h:mm:ss tt';
    case 'g':
      return `${shortDate} ${hungarian ? 'H:mm' : 'h:mm tt'}`;
    case 'G':
      return `${shortDate} ${hungarian ? 'H:mm:ss' : 'h:mm:ss tt'}`;
    case 's':
      return "yyyy-MM-dd'T'HH:mm:ss";
    case 'u':
      return "yyyy-MM-dd HH:mm:ss'Z'";
    default:
      return undefined;
  }
}

/**
 * Formats a date with a .NET-style custom format (`yyyy`, `yy`, `MMMM`, `MMM`, `MM`, `M`, `dddd`, `ddd`, `dd`, `d`,
 * `HH`, `H`, `hh`, `h`, `mm`, `m`, `ss`, `s`, `tt`, `'literal'`, `\x`). Single-letter standard formats are expanded.
 */
export function formatDateValue(date: Date, format: string, locale: string = DEFAULT_LOCALE): string {
  if (format === 'D') {
    return intlPart(date, locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  }
  const pattern = standardFormat(format, locale) || format;
  let result = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern.charAt(i);
    if (ch === "'" || ch === '"') {
      const end = pattern.indexOf(ch, i + 1);
      const stop = end < 0 ? pattern.length : end;
      result += pattern.substring(i + 1, stop);
      i = stop + 1;
      continue;
    }
    if (ch === '\\' && i + 1 < pattern.length) {
      result += pattern.charAt(i + 1);
      i += 2;
      continue;
    }
    let run = 1;
    while (pattern.charAt(i + run) === ch) run++;
    switch (ch) {
      case 'y':
        result += run <= 2 ? pad(date.getFullYear() % 100, run) : pad(date.getFullYear(), run);
        break;
      case 'M':
        if (run >= 4) result += intlPart(date, locale, { month: 'long' });
        else if (run === 3) result += intlPart(date, locale, { month: 'short' });
        else result += pad(date.getMonth() + 1, run);
        break;
      case 'd':
        if (run >= 4) result += intlPart(date, locale, { weekday: 'long' });
        else if (run === 3) result += intlPart(date, locale, { weekday: 'short' });
        else result += pad(date.getDate(), run);
        break;
      case 'H':
        result += pad(date.getHours(), Math.min(run, 2));
        break;
      case 'h':
        result += pad(date.getHours() % 12 || 12, Math.min(run, 2));
        break;
      case 'm':
        result += pad(date.getMinutes(), Math.min(run, 2));
        break;
      case 's':
        result += pad(date.getSeconds(), Math.min(run, 2));
        break;
      case 'f':
        result += pad(date.getMilliseconds(), 3).substring(0, run);
        break;
      case 't':
        result += (date.getHours() < 12 ? 'AM' : 'PM').substring(0, run === 1 ? 1 : 2);
        break;
      default:
        result += pattern.substr(i, run);
        break;
    }
    i += run;
  }
  return result;
}

registerFunction(
  'formatDate',
  (args, ctx) => {
    const date = toDate(args[0]);
    if (!date) return '';
    const format = args.length > 1 ? toText(args[1]) : 'd';
    return formatDateValue(date, format || 'd', ctx.locale || DEFAULT_LOCALE);
  },
  { minArgs: 1, maxArgs: 2 }
);
aliasFunction('formatDate', 'fn-FormatDate');

function addTo(args: ExprValue[], unitMs: number): ExprValue {
  const date = toDate(args[0]);
  const amount = toNumber(args[1]);
  if (!date || isNaN(amount)) return null;
  return new Date(date.getTime() + amount * unitMs);
}

registerFunction(
  'addDays',
  (args) => {
    const date = toDate(args[0]);
    const amount = toNumber(args[1]);
    if (!date || isNaN(amount)) return null;
    // Calendar arithmetic keeps the local time across DST changes.
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + Math.trunc(amount));
    return result;
  },
  { pure: true, minArgs: 2, maxArgs: 2 }
);
aliasFunction('addDays', 'fn-AddDays');
registerFunction('addHours', (args) => addTo(args, 60 * 60 * 1000), { pure: true, minArgs: 2, maxArgs: 2 });
aliasFunction('addHours', 'fn-AddHours');
registerFunction('addMinutes', (args) => addTo(args, 60 * 1000), { pure: true, minArgs: 2, maxArgs: 2 });
aliasFunction('addMinutes', 'fn-AddMinutes');

function diff(args: ExprValue[], unitMs: number): ExprValue {
  const start = toDate(args[0]);
  const end = toDate(args[1]);
  if (!start || !end) return null;
  return (end.getTime() - start.getTime()) / unitMs;
}

/** Days from the first date to the second (end − start); DST-safe for date-only values. */
registerFunction(
  'dateDiffDays',
  (args) => {
    const start = toDate(args[0]);
    const end = toDate(args[1]);
    if (!start || !end) return null;
    const utcStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes(), start.getSeconds());
    const utcEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes(), end.getSeconds());
    return (utcEnd - utcStart) / DAY_MS;
  },
  { pure: true, minArgs: 2, maxArgs: 2 }
);
aliasFunction('dateDiffDays', 'fn-DateDiffDays');
registerFunction('dateDiffHours', (args) => diff(args, 60 * 60 * 1000), { pure: true, minArgs: 2, maxArgs: 2 });
aliasFunction('dateDiffHours', 'fn-DateDiffHours');
registerFunction('dateDiffMinutes', (args) => diff(args, 60 * 1000), { pure: true, minArgs: 2, maxArgs: 2 });
aliasFunction('dateDiffMinutes', 'fn-DateDiffMinutes');
registerFunction('dateDiffSeconds', (args) => diff(args, 1000), { pure: true, minArgs: 2, maxArgs: 2 });
aliasFunction('dateDiffSeconds', 'fn-DateDiffSeconds');

registerFunction('now', (args, ctx) => ctx.now(), { minArgs: 0, maxArgs: 0 });
registerFunction(
  'today',
  (args, ctx) => {
    const now = ctx.now();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  },
  { minArgs: 0, maxArgs: 0 }
);

registerFunction('toDate', (args) => toDate(args[0]), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('toDate', 'parseDate');
