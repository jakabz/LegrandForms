import type { Ast, BinaryOperator, ReferenceNode } from './ast';
import { LexerError, Token, tokenize } from './lexer';

export interface ExpressionParseError {
  message: string;
  pos: number;
}

export interface ParseResult {
  ast: Ast;
  error?: ExpressionParseError;
}

class ParserError extends Error {
  public readonly pos: number;

  public constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
    Object.setPrototypeOf(this, ParserError.prototype);
  }
}

const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6
};
const UNARY_PRECEDENCE: number = 7;

/** Canonical spelling of known reference namespaces (lookup is case-insensitive). */
const KNOWN_NAMESPACES: Record<string, string> = {
  control: 'Control',
  itemproperty: 'ItemProperty',
  common: 'Common',
  self: 'Self',
  formvariable: 'FormVariable',
  variable: 'Variable',
  workflowvariable: 'WorkflowVariable',
  workflowconstant: 'WorkflowConstant',
  itemfield: 'ItemProperty'
};

/** Builds a reference node from the text between `{` and `}`. */
export function createReference(body: string): ReferenceNode {
  const trimmed = body.trim();
  const colon = trimmed.indexOf(':');
  const rawNamespace = colon >= 0 ? trimmed.substring(0, colon).trim() : trimmed;
  let name = colon >= 0 ? trimmed.substring(colon + 1).trim() : '';
  const namespace = KNOWN_NAMESPACES[rawNamespace.toLowerCase()] || rawNamespace;
  if (namespace === 'Control') {
    name = name.replace(/^\{/, '').replace(/\}$/, '').toLowerCase();
  }
  return { kind: 'Reference', namespace, name };
}

class Parser {
  private readonly _tokens: Token[];
  private _index: number = 0;

  public constructor(tokens: Token[]) {
    this._tokens = tokens;
  }

  public parseRoot(): Ast {
    const ast = this._parseExpression(0);
    const next = this._peek();
    if (next.type !== 'eof') {
      throw new ParserError(`Unexpected "${next.value}"`, next.pos);
    }
    return ast;
  }

  private _peek(): Token {
    return this._tokens[this._index];
  }

  private _next(): Token {
    const token = this._tokens[this._index];
    if (token.type !== 'eof') {
      this._index++;
    }
    return token;
  }

  private _expect(type: Token['type'], what: string): Token {
    const token = this._next();
    if (token.type !== type) {
      throw new ParserError(`Expected ${what} but found "${token.value || token.type}"`, token.pos);
    }
    return token;
  }

  private _parseExpression(minPrecedence: number): Ast {
    let left = this._parsePrefix();
    for (;;) {
      const token = this._peek();
      if (token.type !== 'operator') {
        break;
      }
      const precedence = BINARY_PRECEDENCE[token.value];
      if (precedence === undefined || precedence <= minPrecedence) {
        break;
      }
      this._next();
      // All binary operators are left-associative.
      const right = this._parseExpression(precedence);
      left = { kind: 'Binary', operator: token.value as BinaryOperator, left, right };
    }
    return left;
  }

  private _parsePrefix(): Ast {
    const token = this._next();
    switch (token.type) {
      case 'number':
        return { kind: 'Literal', value: parseFloat(token.value) };
      case 'string':
        return { kind: 'Literal', value: token.value };
      case 'reference':
        return createReference(token.value);
      case 'lparen': {
        const inner = this._parseExpression(0);
        this._expect('rparen', '")"');
        return inner;
      }
      case 'operator':
        if (token.value === '!' || token.value === '-') {
          const operand = this._parseExpression(UNARY_PRECEDENCE - 1);
          return { kind: 'Unary', operator: token.value, operand };
        }
        if (token.value === '+') {
          return this._parseExpression(UNARY_PRECEDENCE - 1);
        }
        throw new ParserError(`Unexpected operator "${token.value}"`, token.pos);
      case 'identifier':
        return this._parseIdentifier(token);
      case 'eof':
        throw new ParserError('Unexpected end of expression', token.pos);
      default:
        throw new ParserError(`Unexpected "${token.value}"`, token.pos);
    }
  }

  private _parseIdentifier(token: Token): Ast {
    if (this._peek().type === 'lparen') {
      this._next();
      const args: Ast[] = [];
      if (this._peek().type !== 'rparen') {
        for (;;) {
          args.push(this._parseExpression(0));
          if (this._peek().type === 'comma') {
            this._next();
            continue;
          }
          break;
        }
      }
      this._expect('rparen', '")"');
      return { kind: 'Call', name: token.value, args };
    }
    const lower = token.value.toLowerCase();
    if (lower === 'true') return { kind: 'Literal', value: true };
    if (lower === 'false') return { kind: 'Literal', value: false };
    if (lower === 'null') return { kind: 'Literal', value: null };
    throw new ParserError(`Unknown identifier "${token.value}"`, token.pos);
  }
}

/**
 * Parses a normalized expression. Never throws: syntax errors produce an `ErrorNode` and an `error`.
 * An empty source parses to an `ErrorNode` as well; callers decide whether empty means "inert".
 */
export function parseExpression(source: string): ParseResult {
  if (!source || !source.trim()) {
    const message = 'Empty expression';
    return { ast: { kind: 'Error', message }, error: { message, pos: 0 } };
  }
  try {
    const tokens = tokenize(source);
    const ast = new Parser(tokens).parseRoot();
    return { ast };
  } catch (e) {
    if (e instanceof LexerError || e instanceof ParserError) {
      const message = `${e.message} at position ${e.pos}`;
      return { ast: { kind: 'Error', message }, error: { message, pos: e.pos } };
    }
    throw e;
  }
}
