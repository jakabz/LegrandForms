import { ExprValue, isLookupValue, MULTI_VALUE_SEPARATOR, toNumber, toText } from '../values';
import { aliasFunction, registerFunction } from './registry';

function toInt(value: ExprValue | undefined, fallback: number): number {
  const n = toNumber(value === undefined ? null : value);
  return isNaN(n) ? fallback : Math.trunc(n);
}

registerFunction('toLower', (args) => toText(args[0]).toLowerCase(), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('toLower', 'fn-Lower', 'lower');

registerFunction('toUpper', (args) => toText(args[0]).toUpperCase(), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('toUpper', 'fn-Upper', 'upper');

registerFunction('trim', (args) => toText(args[0]).trim(), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('trim', 'fn-Trim');

registerFunction(
  'length',
  (args) => {
    const value = args[0];
    if (Array.isArray(value)) return value.length;
    return toText(value).length;
  },
  { pure: true, minArgs: 1, maxArgs: 1 }
);
aliasFunction('length', 'fn-Length');

registerFunction('contains', (args) => toText(args[0]).indexOf(toText(args[1])) >= 0, {
  pure: true,
  minArgs: 2,
  maxArgs: 2
});
aliasFunction('contains', 'fn-Contains');

registerFunction('startsWith', (args) => toText(args[0]).indexOf(toText(args[1])) === 0, {
  pure: true,
  minArgs: 2,
  maxArgs: 2
});
aliasFunction('startsWith', 'fn-StartsWith');

registerFunction(
  'endsWith',
  (args) => {
    const text = toText(args[0]);
    const suffix = toText(args[1]);
    return text.length >= suffix.length && text.substring(text.length - suffix.length) === suffix;
  },
  { pure: true, minArgs: 2, maxArgs: 2 }
);
aliasFunction('endsWith', 'fn-EndsWith');

registerFunction(
  'replace',
  (args) => {
    const find = toText(args[1]);
    const text = toText(args[0]);
    return find ? text.split(find).join(toText(args[2])) : text;
  },
  { pure: true, minArgs: 3, maxArgs: 3 }
);
aliasFunction('replace', 'fn-Replace');

registerFunction(
  'substring',
  (args) => {
    const text = toText(args[0]);
    const start = Math.max(0, toInt(args[1], 0));
    if (args.length < 3) return text.substring(start);
    const length = Math.max(0, toInt(args[2], text.length));
    return text.substr(start, length);
  },
  { pure: true, minArgs: 2, maxArgs: 3 }
);
aliasFunction('substring', 'fn-SubString', 'fn-Substring');

registerFunction(
  'insert',
  (args) => {
    const text = toText(args[0]);
    const index = Math.min(text.length, Math.max(0, toInt(args[1], 0)));
    return text.substring(0, index) + toText(args[2]) + text.substring(index);
  },
  { pure: true, minArgs: 3, maxArgs: 3 }
);
aliasFunction('insert', 'fn-Insert');

registerFunction(
  'remove',
  (args) => {
    const text = toText(args[0]);
    const index = Math.max(0, toInt(args[1], 0));
    const count = args.length > 2 ? Math.max(0, toInt(args[2], 0)) : text.length;
    return text.substring(0, index) + text.substring(index + count);
  },
  { pure: true, minArgs: 2, maxArgs: 3 }
);
aliasFunction('remove', 'fn-Remove');

function pad(args: ExprValue[], left: boolean): string {
  const text = toText(args[0]);
  const width = toInt(args[1], 0);
  const ch = (args.length > 2 ? toText(args[2]) : ' ').charAt(0) || ' ';
  let result = text;
  while (result.length < width) {
    result = left ? ch + result : result + ch;
  }
  return result;
}

registerFunction('padLeft', (args) => pad(args, true), { pure: true, minArgs: 2, maxArgs: 3 });
aliasFunction('padLeft', 'fn-PadLeft');
registerFunction('padRight', (args) => pad(args, false), { pure: true, minArgs: 2, maxArgs: 3 });
aliasFunction('padRight', 'fn-PadRight');

registerFunction(
  'titleCase',
  (args) =>
    toText(args[0])
      .toLowerCase()
      .replace(/(^|\s)(\S)/g, (m: string, space: string, ch: string) => space + ch.toUpperCase()),
  { pure: true, minArgs: 1, maxArgs: 1 }
);
aliasFunction('titleCase', 'fn-Title');

registerFunction('concat', (args) => args.map((a) => toText(a)).join(''), { pure: true });
aliasFunction('concat', 'fn-Concat');

/** Display text of a lookup value (`parseLookup` in Nintex returns the lookup text). */
registerFunction(
  'parseLookup',
  (args) => {
    const value = args[0];
    if (Array.isArray(value)) {
      return value.map((v) => (isLookupValue(v) ? v.title : toText(v as ExprValue))).join(MULTI_VALUE_SEPARATOR);
    }
    const text = toText(value);
    // SharePoint lookup string format "1;#Title"
    const match = /^\d+;#(.*)$/.exec(text);
    return match ? match[1] : text;
  },
  { pure: true, minArgs: 1, maxArgs: 2 }
);

registerFunction('toText', (args) => toText(args[0]), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('toText', 'toString');
