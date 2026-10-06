import { ExprValue, isEmptyValue, toNumber, toText } from '../values';
import { aliasFunction, registerFunction } from './registry';

/** Flattens array arguments (multi-value fields) into individual numbers; empty values are skipped. */
function numbers(args: ExprValue[]): number[] {
  const result: number[] = [];
  args.forEach((arg) => {
    if (Array.isArray(arg)) {
      arg.forEach((item) => result.push(toNumber(toText(item as ExprValue))));
    } else if (!isEmptyValue(arg)) {
      result.push(toNumber(arg));
    }
  });
  return result;
}

registerFunction(
  'sum',
  (args) => numbers(args).reduce((acc, n) => acc + (isNaN(n) ? 0 : n), 0),
  { pure: true }
);
aliasFunction('sum', 'fn-Sum');

registerFunction(
  'average',
  (args) => {
    const values = numbers(args).filter((n) => !isNaN(n));
    return values.length ? values.reduce((acc, n) => acc + n, 0) / values.length : null;
  },
  { pure: true }
);
aliasFunction('average', 'fn-Average', 'avg');

registerFunction(
  'count',
  (args) =>
    args.reduce<number>((acc, arg) => acc + (Array.isArray(arg) ? arg.length : isEmptyValue(arg) ? 0 : 1), 0),
  { pure: true }
);
aliasFunction('count', 'fn-Count');

registerFunction(
  'min',
  (args) => {
    const values = numbers(args).filter((n) => !isNaN(n));
    return values.length ? Math.min.apply(Math, values) : null;
  },
  { pure: true, minArgs: 1 }
);
aliasFunction('min', 'fn-Min');

registerFunction(
  'max',
  (args) => {
    const values = numbers(args).filter((n) => !isNaN(n));
    return values.length ? Math.max.apply(Math, values) : null;
  },
  { pure: true, minArgs: 1 }
);
aliasFunction('max', 'fn-Max');

registerFunction(
  'round',
  (args) => {
    const value = toNumber(args[0]);
    if (isNaN(value)) return null;
    const decimals = args.length > 1 ? Math.max(0, Math.min(15, Math.trunc(toNumber(args[1])) || 0)) : 0;
    // Round half away from zero (.NET MidpointRounding.AwayFromZero, as used by Nintex). Shifting via the
    // exponent notation avoids binary floating point artefacts (1.005 * 100 = 100.49999…).
    const abs = Math.abs(value);
    const text = String(abs);
    if (text.indexOf('e') >= 0) {
      const factor = Math.pow(10, decimals);
      return (Math.sign(value) * Math.round(abs * factor)) / factor;
    }
    const shifted = Math.round(Number(`${text}e${decimals}`));
    return Math.sign(value) * Number(`${shifted}e-${decimals}`);
  },
  { pure: true, minArgs: 1, maxArgs: 2 }
);
aliasFunction('round', 'fn-Round');

registerFunction('abs', (args) => Math.abs(toNumber(args[0])), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('abs', 'fn-Abs');

registerFunction('floor', (args) => Math.floor(toNumber(args[0])), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('floor', 'fn-Floor');

registerFunction('ceiling', (args) => Math.ceil(toNumber(args[0])), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('ceiling', 'fn-Ceiling', 'ceil');

registerFunction('power', (args) => Math.pow(toNumber(args[0]), toNumber(args[1])), {
  pure: true,
  minArgs: 2,
  maxArgs: 2
});
aliasFunction('power', 'fn-Power', 'pow');

registerFunction('convertToNumber', (args) => toNumber(args[0]), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('convertToNumber', 'toNumber', 'fn-ToNumber');
