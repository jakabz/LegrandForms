import { decodeHtmlEntities } from '../parser/normalize';
import { CssNode, parseCss, splitDeclarations, stringifyCss } from './cssParser';

/** Selectors that only make sense in the Nintex designer. */
const DESIGNER_SELECTOR: RegExp = /#uiDesignerSurface/i;

/** Declarations that are dangerous or IE-only. */
const BLOCKED_DECLARATION: RegExp =
  /expression\s*\(|behavior\s*:|-moz-binding|javascript\s*:|vbscript\s*:|progid\s*:|^\s*-ms-filter\s*:|^\s*[*_][\w-]+\s*:/i;

/** At-rules that are dropped entirely (@import loads external code/styles; @charset is meaningless inline). */
const DROPPED_AT_RULES: ReadonlyArray<string> = ['import', 'charset', 'namespace'];

function cleanDeclarations(declarations: string): string {
  return splitDeclarations(declarations)
    .filter((d) => !BLOCKED_DECLARATION.test(d))
    .join('; ');
}

function cleanNodes(nodes: CssNode[]): CssNode[] {
  const result: CssNode[] = [];
  nodes.forEach((node) => {
    if (node.type === 'rule') {
      const selectors = node.selectors.filter((s) => !DESIGNER_SELECTOR.test(s));
      const declarations = cleanDeclarations(node.declarations);
      if (selectors.length && declarations) {
        result.push({ type: 'rule', selectors, declarations });
      }
      return;
    }
    if (DROPPED_AT_RULES.indexOf(node.name) >= 0) {
      return;
    }
    if (node.children) {
      const children = cleanNodes(node.children);
      if (children.length) result.push({ ...node, children });
      return;
    }
    if (node.body !== undefined && BLOCKED_DECLARATION.test(node.body)) {
      return;
    }
    if (node.body !== undefined) {
      result.push(node);
    }
  });
  return result;
}

/**
 * Cleans the form CSS of a Nintex export (Rendszerterv §11.1):
 * entity/NBSP garbage, `#uiDesignerSurface` designer rules, IE hacks, `expression()`, `@import`, `javascript:` URLs.
 */
export function cleanCss(raw: string | undefined): string {
  if (!raw || !raw.trim()) return '';
  const decoded = decodeHtmlEntities(raw).replace(/ /g, ' ');
  return stringifyCss(cleanNodes(parseCss(decoded)));
}

/**
 * Cleans a custom stylesheet (`customCssUrl`, Rendszerterv §11.4) with the same safety rules as the form CSS.
 * The file is plain CSS, so no entity decoding is done.
 */
export function cleanCustomCss(raw: string | undefined): string {
  if (!raw || !raw.trim()) return '';
  return stringifyCss(cleanNodes(parseCss(raw.replace(/^\ufeff/, ''))));
}
