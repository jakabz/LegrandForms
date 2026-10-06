/**
 * Minimal CSS block parser: enough structure to clean and scope selectors safely
 * (qualified rules, nested at-rules such as @media/@supports, block-less at-rules such as @import).
 * Declarations are kept as raw text.
 */

export interface CssRule {
  type: 'rule';
  selectors: string[];
  declarations: string;
}

export interface CssAtRule {
  type: 'at';
  /** Lower-case name without `@`, e.g. `media`. */
  name: string;
  prelude: string;
  /** Nested rules for grouping at-rules (@media, @supports, @document). */
  children?: CssNode[];
  /** Raw block body for non-grouping at-rules (@font-face, @keyframes, @page). */
  body?: string;
}

export type CssNode = CssRule | CssAtRule;

const GROUPING_AT_RULES: ReadonlyArray<string> = ['media', 'supports', 'document', 'container', 'layer'];

export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(\*\/|$)/g, '');
}

/** Splits on commas that are not inside parentheses, brackets or strings. */
export function splitSelectorList(selectorText: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText.charAt(i);
    if (quote) {
      current += ch;
      if (ch === quote && selectorText.charAt(i - 1) !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ',' && depth === 0) {
      if (current.trim()) result.push(current.trim().replace(/\s+/g, ' '));
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim().replace(/\s+/g, ' '));
  return result;
}

/** Finds the index of the `}` matching the `{` at `open`, skipping strings. Returns -1 when unbalanced. */
function findBlockEnd(css: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < css.length; i++) {
    const ch = css.charAt(i);
    if (quote) {
      if (ch === quote && css.charAt(i - 1) !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Parses CSS (comments removed first). Unbalanced trailing input is dropped. */
export function parseCss(css: string): CssNode[] {
  return parseBlock(stripCssComments(css));
}

function parseBlock(css: string): CssNode[] {
  const nodes: CssNode[] = [];
  let i = 0;
  while (i < css.length) {
    // skip whitespace and stray semicolons / closing braces
    while (i < css.length && /[\s;}]/.test(css.charAt(i))) i++;
    if (i >= css.length) break;

    const braceIndex = css.indexOf('{', i);
    if (css.charAt(i) === '@') {
      const semicolon = css.indexOf(';', i);
      if (semicolon >= 0 && (braceIndex < 0 || semicolon < braceIndex)) {
        // block-less at-rule: @import url(x);
        const statement = css.substring(i + 1, semicolon).trim();
        const nameMatch = /^([\w-]+)\s*([\s\S]*)$/.exec(statement);
        nodes.push({
          type: 'at',
          name: nameMatch ? nameMatch[1].toLowerCase() : statement.toLowerCase(),
          prelude: nameMatch ? nameMatch[2].trim() : ''
        });
        i = semicolon + 1;
        continue;
      }
    }
    if (braceIndex < 0) break;
    const end = findBlockEnd(css, braceIndex);
    if (end < 0) break;
    const head = css.substring(i, braceIndex).trim();
    const body = css.substring(braceIndex + 1, end);
    if (head.charAt(0) === '@') {
      const nameMatch = /^@([\w-]+)\s*([\s\S]*)$/.exec(head);
      const name = nameMatch ? nameMatch[1].toLowerCase() : '';
      const prelude = nameMatch ? nameMatch[2].trim() : '';
      if (GROUPING_AT_RULES.indexOf(name) >= 0) {
        nodes.push({ type: 'at', name, prelude, children: parseBlock(body) });
      } else {
        nodes.push({ type: 'at', name, prelude, body: body.trim() });
      }
    } else if (head) {
      nodes.push({ type: 'rule', selectors: splitSelectorList(head), declarations: body.trim() });
    }
    i = end + 1;
  }
  return nodes;
}

/** Splits a declaration block on `;` outside parentheses and strings (data URIs contain `;`). */
export function splitDeclarations(declarations: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (let i = 0; i < declarations.length; i++) {
    const ch = declarations.charAt(i);
    if (quote) {
      current += ch;
      if (ch === quote && declarations.charAt(i - 1) !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function formatDeclarations(declarations: string, indent: string): string {
  return splitDeclarations(declarations)
    .map((d) => `${indent}  ${d};`)
    .join('\n');
}

/** Serializes nodes back to CSS text. */
export function stringifyCss(nodes: CssNode[], indent: string = ''): string {
  const out: string[] = [];
  nodes.forEach((node) => {
    if (node.type === 'rule') {
      if (!node.selectors.length) return;
      out.push(`${indent}${node.selectors.join(`,\n${indent}`)} {\n${formatDeclarations(node.declarations, indent)}\n${indent}}`);
    } else if (node.children) {
      const inner = stringifyCss(node.children, indent + '  ');
      out.push(`${indent}@${node.name} ${node.prelude} {\n${inner}\n${indent}}`);
    } else if (node.body !== undefined) {
      out.push(`${indent}@${node.name}${node.prelude ? ' ' + node.prelude : ''} {\n${indent}  ${node.body}\n${indent}}`);
    } else {
      out.push(`${indent}@${node.name}${node.prelude ? ' ' + node.prelude : ''};`);
    }
  });
  return out.join('\n');
}
