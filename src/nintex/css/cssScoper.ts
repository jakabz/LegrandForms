import { CssNode, parseCss, stringifyCss } from './cssParser';

/** CSS class used as the scope root of a rendered form. */
export function scopeClassName(formId: string): string {
  return `nf-root-${formId.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

const ROOT_SELECTOR: RegExp = /^(html|body|:root)(?=$|[\s>+~.:#[])/i;

/** Prefixes one selector with the scope. `html`/`body`/`:root` are replaced by the scope itself. */
export function scopeSelector(selector: string, scope: string): string {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  let rest = trimmed;
  let replaced = false;
  let attached = false;
  // "html body .x" → ".scope .x"; "body.dark .x" → ".scope.dark .x"
  for (;;) {
    const match = ROOT_SELECTOR.exec(rest);
    if (!match) break;
    replaced = true;
    const after = rest.substring(match[0].length);
    if (after && !/^\s/.test(after)) {
      // compound part attached to the root element (".dark", ":hover", "[dir=rtl]") or a combinator (">")
      rest = after;
      attached = !/^[>+~]/.test(after);
      break;
    }
    rest = after.trim();
  }
  if (!replaced) return `${scope} ${trimmed}`;
  if (!rest) return scope;
  return attached ? `${scope}${rest}` : `${scope} ${rest}`;
}

function scopeNodes(nodes: CssNode[], scope: string): CssNode[] {
  return nodes.map((node) => {
    if (node.type === 'rule') {
      return { ...node, selectors: node.selectors.map((s) => scopeSelector(s, scope)) };
    }
    if (node.children) {
      return { ...node, children: scopeNodes(node.children, scope) };
    }
    // @font-face, @keyframes, @page: no selectors to scope.
    return node;
  });
}

/**
 * Scopes every selector of (already cleaned) CSS under `.scopeClass` (Rendszerterv §11.1, F-13),
 * including selectors inside @media/@supports blocks.
 */
export function scopeCss(css: string, scopeClass: string): string {
  if (!css || !css.trim()) return '';
  const scope = scopeClass.charAt(0) === '.' ? scopeClass : `.${scopeClass}`;
  return stringifyCss(scopeNodes(parseCss(css), scope));
}
