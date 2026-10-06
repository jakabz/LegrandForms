import { createDiagnostic } from '../model/Diagnostic';
import type { Ast } from './ast';
import type { EvaluationContext } from './context';
import { defaultRegistry, FunctionRegistry } from './functions';
import { resolveReference } from './references';
import { addValues, compareValues, ExprValue, looseEquals, toBoolean, toNumberOrZero } from './values';

function report(ctx: EvaluationContext, code: 'UnsupportedFunction' | 'ExpressionRuntimeError', message: string, source?: string): void {
  if (ctx.report) {
    ctx.report(createDiagnostic('warn', code, message, source ? { source } : undefined));
  }
}

function arithmetic(operator: '-' | '*' | '/' | '%', left: ExprValue, right: ExprValue): ExprValue {
  const l = toNumberOrZero(left);
  const r = toNumberOrZero(right);
  switch (operator) {
    case '-':
      return l - r;
    case '*':
      return l * r;
    case '/':
      return r === 0 ? null : l / r;
    case '%':
      return r === 0 ? null : l % r;
  }
}

/**
 * Evaluates an AST. Never throws for bad expressions: errors evaluate to `null` and are reported through
 * `ctx.report` (`ErrorNode` → null, unknown function → null + `UnsupportedFunction`).
 */
export function evaluate(ast: Ast, ctx: EvaluationContext, registry: FunctionRegistry = defaultRegistry): ExprValue {
  const run = (node: Ast): ExprValue => evaluate(node, ctx, registry);

  switch (ast.kind) {
    case 'Literal':
      return ast.value;

    case 'Reference':
      return resolveReference(ast, ctx);

    case 'Unary': {
      const operand = run(ast.operand);
      return ast.operator === '!' ? !toBoolean(operand) : -toNumberOrZero(operand);
    }

    case 'Binary': {
      if (ast.operator === '&&') {
        return toBoolean(run(ast.left)) && toBoolean(run(ast.right));
      }
      if (ast.operator === '||') {
        return toBoolean(run(ast.left)) || toBoolean(run(ast.right));
      }
      const left = run(ast.left);
      const right = run(ast.right);
      switch (ast.operator) {
        case '==':
          return looseEquals(left, right);
        case '!=':
          return !looseEquals(left, right);
        case '<':
          return compareValues(left, right) < 0;
        case '>':
          return compareValues(left, right) > 0;
        case '<=':
          return compareValues(left, right) <= 0;
        case '>=':
          return compareValues(left, right) >= 0;
        case '+':
          return addValues(left, right);
        default:
          return arithmetic(ast.operator, left, right);
      }
    }

    case 'Call': {
      const fn = registry.get(ast.name);
      if (!fn) {
        report(ctx, 'UnsupportedFunction', `Unsupported function "${ast.name}"`, ast.name);
        return null;
      }
      try {
        if (fn.lazy) {
          return fn.impl(ast.args, ctx, run);
        }
        return fn.impl(ast.args.map(run), ctx);
      } catch (e) {
        report(ctx, 'ExpressionRuntimeError', `Function "${ast.name}" failed: ${(e as Error).message}`, ast.name);
        return null;
      }
    }

    case 'Error':
      return null;
  }
}

/** Evaluates an AST in a boolean context (rules). `ErrorNode`/null → false. */
export function evaluateCondition(ast: Ast | null, ctx: EvaluationContext, registry?: FunctionRegistry): boolean {
  if (!ast) return false;
  return toBoolean(evaluate(ast, ctx, registry));
}
