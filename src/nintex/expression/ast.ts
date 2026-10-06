/**
 * Expression AST. Nodes are plain JSON objects so a parsed FormDefinition can be cached
 * (sessionStorage) and snapshot-tested.
 */

export type BinaryOperator = '||' | '&&' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '+' | '-' | '*' | '/' | '%';
export type UnaryOperator = '!' | '-';

export interface LiteralNode {
  kind: 'Literal';
  value: string | number | boolean | null;
}

/** `{Namespace:Name}`, e.g. `{Control:<guid>}`, `{ItemProperty:Status}`, `{Common:IsNewMode}`, `{Self}`. */
export interface ReferenceNode {
  kind: 'Reference';
  namespace: string;
  /** Lower-cased guid for `Control`, verbatim otherwise. Empty for `{Self}`. */
  name: string;
}

export interface CallNode {
  kind: 'Call';
  /** Function name as written in the source (lookups are case-insensitive). */
  name: string;
  args: Ast[];
}

export interface UnaryNode {
  kind: 'Unary';
  operator: UnaryOperator;
  operand: Ast;
}

export interface BinaryNode {
  kind: 'Binary';
  operator: BinaryOperator;
  left: Ast;
  right: Ast;
}

/** Result of a failed parse. Evaluates to `null` (false in a rule, empty text in a calculation). */
export interface ErrorNode {
  kind: 'Error';
  message: string;
}

export type Ast = LiteralNode | ReferenceNode | CallNode | UnaryNode | BinaryNode | ErrorNode;

/** Depth-first walk over every node of an AST. */
export function walkAst(ast: Ast, visit: (node: Ast) => void): void {
  visit(ast);
  switch (ast.kind) {
    case 'Call':
      ast.args.forEach((arg) => walkAst(arg, visit));
      break;
    case 'Unary':
      walkAst(ast.operand, visit);
      break;
    case 'Binary':
      walkAst(ast.left, visit);
      walkAst(ast.right, visit);
      break;
    default:
      break;
  }
}
