import { createDiagnostic } from '../model/Diagnostic';
import { Ast, ReferenceNode, walkAst } from './ast';
import type { EvaluationContext } from './context';
import type { ExprValue } from './values';

export type ReferenceResolver = (ref: ReferenceNode, ctx: EvaluationContext) => ExprValue;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const COMMON_RESOLVERS: Record<string, (ctx: EvaluationContext) => ExprValue> = {
  isnewmode: (ctx) => ctx.mode === 'New',
  iseditmode: (ctx) => ctx.mode === 'Edit',
  isdisplaymode: (ctx) => ctx.mode === 'Display',
  isviewmode: (ctx) => ctx.mode === 'Display',
  currentuser: (ctx) => (ctx.currentUser ? [ctx.currentUser] : null),
  currentusername: (ctx) => (ctx.currentUser ? ctx.currentUser.displayName : null),
  currentuserlogin: (ctx) => (ctx.currentUser ? ctx.currentUser.loginName || null : null),
  currentuseremail: (ctx) => (ctx.currentUser ? ctx.currentUser.email || null : null),
  currentdate: (ctx) => startOfDay(ctx.now()),
  today: (ctx) => startOfDay(ctx.now()),
  currenttime: (ctx) => ctx.now(),
  now: (ctx) => ctx.now()
};

function reportUnsupported(ref: ReferenceNode, ctx: EvaluationContext): null {
  if (ctx.report) {
    ctx.report(
      createDiagnostic('warn', 'UnsupportedReference', `Unsupported reference {${ref.namespace}:${ref.name}}`, {
        source: `{${ref.namespace}:${ref.name}}`
      })
    );
  }
  return null;
}

/**
 * Resolvers by namespace. To support a new namespace (e.g. `{WorkflowVariable:X}`) add an entry here;
 * unknown namespaces resolve to `null` with an `UnsupportedReference` diagnostic.
 */
export const resolvers: Record<string, ReferenceResolver> = {
  Control: (ref, ctx) => {
    const value = ctx.getControlValue(ref.name);
    if (value === undefined) {
      if (ctx.report) {
        ctx.report(
          createDiagnostic('warn', 'OrphanReference', `Reference to unknown control ${ref.name}`, {
            source: `{Control:${ref.name}}`
          })
        );
      }
      return null;
    }
    return value;
  },
  ItemProperty: (ref, ctx) => {
    const value = ctx.getItemProperty(ref.name);
    return value === undefined ? null : value;
  },
  Common: (ref, ctx) => {
    const resolver = COMMON_RESOLVERS[ref.name.toLowerCase()];
    return resolver ? resolver(ctx) : reportUnsupported(ref, ctx);
  },
  Self: (ref, ctx) => (ctx.selfValue === undefined ? null : ctx.selfValue),
  FormVariable: (ref, ctx) => resolveVariable(ref, ctx),
  Variable: (ref, ctx) => resolveVariable(ref, ctx)
};

function resolveVariable(ref: ReferenceNode, ctx: EvaluationContext): ExprValue {
  const value = ctx.getVariable ? ctx.getVariable(ref.name) : undefined;
  return value === undefined ? reportUnsupported(ref, ctx) : value;
}

export function resolveReference(ref: ReferenceNode, ctx: EvaluationContext): ExprValue {
  const resolver = resolvers[ref.namespace];
  return resolver ? resolver(ref, ctx) : reportUnsupported(ref, ctx);
}

export function isKnownCommonReference(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMON_RESOLVERS, name.toLowerCase());
}

export function isKnownNamespace(namespace: string): boolean {
  return Object.prototype.hasOwnProperty.call(resolvers, namespace);
}

/** All reference nodes of an AST (in source order, duplicates kept). */
export function collectReferences(ast: Ast | null | undefined): ReferenceNode[] {
  const refs: ReferenceNode[] = [];
  if (ast) {
    walkAst(ast, (node) => {
      if (node.kind === 'Reference') refs.push(node);
    });
  }
  return refs;
}

function unique(values: string[]): string[] {
  const seen: Record<string, boolean> = {};
  return values.filter((v) => (seen[v] ? false : (seen[v] = true)));
}

/** Distinct `{Control:<guid>}` ids referenced by an AST. */
export function collectControlIds(ast: Ast | null | undefined): string[] {
  return unique(collectReferences(ast).filter((r) => r.namespace === 'Control').map((r) => r.name));
}

/** Distinct `{ItemProperty:X}` field names referenced by an AST. */
export function collectItemProperties(ast: Ast | null | undefined): string[] {
  return unique(collectReferences(ast).filter((r) => r.namespace === 'ItemProperty').map((r) => r.name));
}

/** True when the AST reads `{Self}`. */
export function usesSelf(ast: Ast | null | undefined): boolean {
  return collectReferences(ast).some((r) => r.namespace === 'Self');
}

/** Distinct function names (as written) called by an AST. */
export function collectFunctionNames(ast: Ast | null | undefined): string[] {
  const names: string[] = [];
  if (ast) {
    walkAst(ast, (node) => {
      if (node.kind === 'Call') names.push(node.name);
    });
  }
  return unique(names);
}
