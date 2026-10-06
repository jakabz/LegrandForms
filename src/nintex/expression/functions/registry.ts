import type { Ast } from '../ast';
import type { EvaluationContext } from '../context';
import type { ExprValue } from '../values';

/** Receives already evaluated arguments. */
export type EagerFunction = (args: ExprValue[], ctx: EvaluationContext) => ExprValue;

/** Receives unevaluated arguments (control flow: `If`, `and`, `or`). */
export type LazyFunction = (args: Ast[], ctx: EvaluationContext, evaluate: (ast: Ast) => ExprValue) => ExprValue;

export interface FunctionOptions {
  /** No side effects and no context reads besides arguments. Informational. */
  pure?: boolean;
  minArgs?: number;
  /** Omit for variadic functions. */
  maxArgs?: number;
}

export type FunctionDefinition =
  | { name: string; lazy: false; impl: EagerFunction; options: FunctionOptions }
  | { name: string; lazy: true; impl: LazyFunction; options: FunctionOptions };

/** Case-insensitive function table. Names may contain `-` (`fn-IsMemberOfGroup`). */
export class FunctionRegistry {
  private readonly _functions: Record<string, FunctionDefinition> = {};

  public register(name: string, impl: EagerFunction, options: FunctionOptions = {}): void {
    this._functions[name.toLowerCase()] = { name, lazy: false, impl, options };
  }

  public registerLazy(name: string, impl: LazyFunction, options: FunctionOptions = {}): void {
    this._functions[name.toLowerCase()] = { name, lazy: true, impl, options };
  }

  /** Registers additional names for an existing function. */
  public alias(existing: string, ...aliases: string[]): void {
    const definition = this.get(existing);
    if (!definition) {
      throw new Error(`Cannot alias unknown function "${existing}"`);
    }
    aliases.forEach((alias) => {
      this._functions[alias.toLowerCase()] = { ...definition, name: alias };
    });
  }

  public get(name: string): FunctionDefinition | undefined {
    return this._functions[name.toLowerCase()];
  }

  public has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  public names(): string[] {
    return Object.keys(this._functions)
      .map((key) => this._functions[key].name)
      .sort();
  }
}

/** The registry used by default by the evaluator. */
export const defaultRegistry: FunctionRegistry = new FunctionRegistry();

export function registerFunction(name: string, impl: EagerFunction, options?: FunctionOptions): void {
  defaultRegistry.register(name, impl, options);
}

export function registerLazyFunction(name: string, impl: LazyFunction, options?: FunctionOptions): void {
  defaultRegistry.registerLazy(name, impl, options);
}

export function aliasFunction(existing: string, ...aliases: string[]): void {
  defaultRegistry.alias(existing, ...aliases);
}
