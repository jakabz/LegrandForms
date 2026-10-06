import type { Ast } from '../expression/ast';
import { parseExpression } from '../expression/parser';
import { compileValueSource } from '../expression/valueSource';
import type { CompiledExpression, ValueSource } from '../model/controls';
import { DiagnosticBag } from '../model/Diagnostic';
import { normalizeExpressionSource, normalizeTextValue } from './normalize';

/** Who owns an expression (for diagnostics and static checks). */
export interface ExpressionOwner {
  controlId?: string;
  ruleId?: string;
  /** Property name, e.g. `Formula`, `DefaultValue`, `ExpressionValue`. */
  property: string;
}

export interface TrackedExpression {
  owner: ExpressionOwner;
  source: string;
  ast: Ast;
}

/** Shared state of one parse run, passed to every control parser. */
export class ParseContext {
  public readonly diagnostics: DiagnosticBag = new DiagnosticBag();
  /** Every compiled AST, for the static checks after all controls are known. */
  public readonly expressions: TrackedExpression[] = [];

  /** Normalizes and parses an expression property. Empty → null. Syntax errors → ErrorNode + diagnostic. */
  public compileExpression(raw: string | undefined, owner: ExpressionOwner): CompiledExpression | null {
    const source = normalizeExpressionSource(raw);
    if (!source) {
      return null;
    }
    const parsed = parseExpression(source);
    if (parsed.error) {
      this.diagnostics.report('error', 'ExpressionParseError', `${owner.property}: ${parsed.error.message}`, {
        controlId: owner.controlId,
        ruleId: owner.ruleId,
        source
      });
    }
    this.expressions.push({ owner, source, ast: parsed.ast });
    return { source, ast: parsed.ast };
  }

  /**
   * Normalizes and classifies a literal/template/expression property (Rendszerterv §8.1). Empty → undefined.
   * `preferExpression` (InsertReferences bindings): any text that parses as an expression is an expression,
   * so `"x"` is the string x and `true` is a boolean.
   */
  public compileValue(raw: string | undefined, owner: ExpressionOwner, preferExpression: boolean = false): ValueSource | undefined {
    const text = normalizeTextValue(raw);
    if (!text) {
      return undefined;
    }
    if (preferExpression) {
      const parsed = parseExpression(text);
      if (!parsed.error) {
        this.expressions.push({ owner, source: text, ast: parsed.ast });
        return { kind: 'expression', source: text, ast: parsed.ast };
      }
    }
    const compiled = compileValueSource(text);
    if (compiled.value.kind === 'expression') {
      this.expressions.push({ owner, source: text, ast: compiled.value.ast });
    } else if (compiled.value.kind === 'template') {
      compiled.value.parts.forEach((part) => {
        if (part.kind === 'reference') {
          this.expressions.push({ owner, source: text, ast: part.ref });
        }
      });
    }
    return compiled.value;
  }
}
