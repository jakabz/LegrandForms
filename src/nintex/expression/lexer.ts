/**
 * Hand-written lexer for the Nintex formula/rule language (Rendszerterv §8.2).
 * Input must already be normalized (entities decoded, NBSP replaced).
 */

export type TokenType = 'number' | 'string' | 'reference' | 'identifier' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'eof';

export interface Token {
  type: TokenType;
  /** Operator text, identifier, string content (unescaped), number text or reference body. */
  value: string;
  /** Zero-based offset in the source. */
  pos: number;
}

export class LexerError extends Error {
  public readonly pos: number;

  public constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
    // Keep instanceof working when compiled to ES5.
    Object.setPrototypeOf(this, LexerError.prototype);
  }
}

const TWO_CHAR_OPERATORS: ReadonlyArray<string> = ['==', '!=', '<=', '>=', '&&', '||', '<>'];
const ONE_CHAR_OPERATORS: string = '+-*/%<>!=';

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch > '\u007f';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === ' ' || ch === '﻿';
}

/**
 * Tokenizes an expression. Throws {@link LexerError} on malformed input; the parser converts it into an
 * `ErrorNode` + diagnostic (the core never lets it escape).
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const length = source.length;

  while (i < length) {
    const ch = source.charAt(i);

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // {Namespace:Name} reference (name may contain spaces, dashes, dots, …)
    if (ch === '{') {
      // Nested braces are allowed: {Control:{GUID}}
      let depth = 0;
      let end = -1;
      for (let j = i; j < length; j++) {
        const c = source.charAt(j);
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
          end = j;
          break;
        }
      }
      if (end < 0) {
        throw new LexerError('Unterminated reference "{"', i);
      }
      tokens.push({ type: 'reference', value: source.substring(i + 1, end), pos: i });
      i = end + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      let text = '';
      i++;
      let closed = false;
      while (i < length) {
        const c = source.charAt(i);
        if (c === '\\' && i + 1 < length) {
          const next = source.charAt(i + 1);
          if (next === quote || next === '\\') {
            text += next;
            i += 2;
            continue;
          }
        }
        if (c === quote) {
          // A doubled quote inside a string is an escaped quote ("a""b").
          if (source.charAt(i + 1) === quote) {
            text += quote;
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        text += c;
        i++;
      }
      if (!closed) {
        throw new LexerError('Unterminated string literal', start);
      }
      tokens.push({ type: 'string', value: text, pos: start });
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source.charAt(i + 1)))) {
      const start = i;
      while (i < length && isDigit(source.charAt(i))) i++;
      if (source.charAt(i) === '.' && isDigit(source.charAt(i + 1))) {
        i++;
        while (i < length && isDigit(source.charAt(i))) i++;
      }
      if ((source.charAt(i) === 'e' || source.charAt(i) === 'E') && /[0-9+-]/.test(source.charAt(i + 1))) {
        const save = i;
        i++;
        if (source.charAt(i) === '+' || source.charAt(i) === '-') i++;
        if (!isDigit(source.charAt(i))) {
          i = save;
        } else {
          while (i < length && isDigit(source.charAt(i))) i++;
        }
      }
      tokens.push({ type: 'number', value: source.substring(start, i), pos: start });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      i++;
      for (;;) {
        while (i < length && isIdentPart(source.charAt(i))) i++;
        // Dashes and dots are allowed inside identifiers when followed by a letter: fn-IsMemberOfGroup
        const c = source.charAt(i);
        if ((c === '-' || c === '.') && isIdentStart(source.charAt(i + 1))) {
          i++;
          continue;
        }
        break;
      }
      tokens.push({ type: 'identifier', value: source.substring(start, i), pos: start });
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, pos: i });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      // Some locales use ';' as argument separator.
      tokens.push({ type: 'comma', value: ch, pos: i });
      i++;
      continue;
    }

    const two = source.substring(i, i + 2);
    if (TWO_CHAR_OPERATORS.indexOf(two) >= 0) {
      tokens.push({ type: 'operator', value: two === '<>' ? '!=' : two, pos: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPERATORS.indexOf(ch) >= 0) {
      // A single "=" is accepted as equality (lenient, older Nintex formulas).
      tokens.push({ type: 'operator', value: ch === '=' ? '==' : ch, pos: i });
      i++;
      continue;
    }
    if (ch === '&' || ch === '|') {
      throw new LexerError(`Unexpected character "${ch}" (did you mean "${ch}${ch}"?)`, i);
    }

    throw new LexerError(`Unexpected character "${ch}"`, i);
  }

  tokens.push({ type: 'eof', value: '', pos: length });
  return tokens;
}
