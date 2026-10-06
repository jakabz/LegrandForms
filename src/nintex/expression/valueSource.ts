import type { TemplatePart, ValueSource } from '../model/controls';
import type { EvaluationContext } from './context';
import { evaluate } from './evaluator';
import { createReference, ExpressionParseError, parseExpression } from './parser';
import { resolveReference } from './references';
import { ExprValue, toText } from './values';

const TOKEN_PATTERN: RegExp = /\{[^{}:]+:[^{}]*\}|\{Self\}/i;
const TOKEN_PATTERN_GLOBAL: RegExp = /\{[^{}:]+:[^{}]*\}|\{Self\}/gi;
const CALL_PATTERN: RegExp = /[A-Za-z_][A-Za-z0-9_.-]*\s*\(/;

export interface CompiledValueSource {
  value: ValueSource;
  /** Parse error of the expression attempt, when the text looked like an expression but did not parse. */
  parseError?: ExpressionParseError;
}

function compileTemplate(text: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let last = 0;
  TOKEN_PATTERN_GLOBAL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN_GLOBAL.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ kind: 'text', text: text.substring(last, match.index) });
    }
    parts.push({ kind: 'reference', ref: createReference(match[0].substring(1, match[0].length - 1)) });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: 'text', text: text.substring(last) });
  }
  return parts;
}

/**
 * Classifies a normalized property text (Rendszerterv §8.1):
 * 1. no `{NS:Name}` token and no `ident(` → literal;
 * 2. parses as an expression → expression;
 * 3. contains tokens → text template (tokens substituted as text);
 * 4. otherwise literal.
 */
export function compileValueSource(text: string): CompiledValueSource {
  const hasToken = TOKEN_PATTERN.test(text);
  const hasCall = CALL_PATTERN.test(text);
  if (!hasToken && !hasCall) {
    return { value: { kind: 'literal', text } };
  }
  const parsed = parseExpression(text);
  if (!parsed.error) {
    return { value: { kind: 'expression', source: text, ast: parsed.ast } };
  }
  if (hasToken) {
    return { value: { kind: 'template', source: text, parts: compileTemplate(text) }, parseError: parsed.error };
  }
  return { value: { kind: 'literal', text } };
}

/** Evaluates a value source. Literals return their text; templates return text with tokens substituted. */
export function evaluateValueSource(source: ValueSource | undefined, ctx: EvaluationContext): ExprValue {
  if (!source) return null;
  switch (source.kind) {
    case 'literal':
      return source.text;
    case 'expression':
      return evaluate(source.ast, ctx);
    case 'template':
      return source.parts.map((part) => (part.kind === 'text' ? part.text : toText(resolveReference(part.ref, ctx)))).join('');
  }
}

/** The raw text of a value source (for display in diagnostics). */
export function valueSourceText(source: ValueSource | undefined): string {
  if (!source) return '';
  return source.kind === 'literal' ? source.text : source.source;
}
