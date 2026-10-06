import { isEmptyValue, isValidDate, looseEquals, toBoolean, toDate, toNumber } from '../values';
import { aliasFunction, registerFunction, registerLazyFunction } from './registry';

registerLazyFunction(
  'If',
  (args, ctx, evaluate) => {
    const condition = toBoolean(evaluate(args[0]));
    if (condition) {
      return args.length > 1 ? evaluate(args[1]) : null;
    }
    return args.length > 2 ? evaluate(args[2]) : null;
  },
  { minArgs: 2, maxArgs: 3 }
);
aliasFunction('If', 'fn-If');

registerLazyFunction(
  'and',
  (args, ctx, evaluate) => {
    for (const arg of args) {
      if (!toBoolean(evaluate(arg))) return false;
    }
    return args.length > 0;
  },
  { minArgs: 1 }
);
aliasFunction('and', 'fn-And');

registerLazyFunction(
  'or',
  (args, ctx, evaluate) => {
    for (const arg of args) {
      if (toBoolean(evaluate(arg))) return true;
    }
    return false;
  },
  { minArgs: 1 }
);
aliasFunction('or', 'fn-Or');

registerFunction('not', (args) => !toBoolean(args[0]), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('not', 'fn-Not');

registerFunction('isNullOrEmpty', (args) => isEmptyValue(args[0]), { pure: true, minArgs: 1, maxArgs: 1 });
aliasFunction('isNullOrEmpty', 'fn-IsNullOrEmpty', 'isEmpty', 'isNull');

registerFunction('isDate', (args) => isValidDate(args[0]) || toDate(args[0]) !== null, {
  pure: true,
  minArgs: 1,
  maxArgs: 1
});
aliasFunction('isDate', 'fn-IsDate');

registerFunction(
  'isNumber',
  (args) => typeof args[0] === 'number' ? !isNaN(args[0]) : !isNaN(toNumber(args[0])),
  { pure: true, minArgs: 1, maxArgs: 1 }
);
aliasFunction('isNumber', 'isNumeric', 'fn-IsNumeric');

registerFunction('equals', (args) => looseEquals(args[0], args[1]), { pure: true, minArgs: 2, maxArgs: 2 });
aliasFunction('equals', 'fn-Equals');
