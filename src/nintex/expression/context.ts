import type { Diagnostic } from '../model/Diagnostic';
import type { ExprValue, PersonValue } from './values';

export type FormMode = 'New' | 'Edit' | 'Display';

/**
 * Everything an expression may read. Evaluation is synchronous: data that needs a request
 * (current user, group membership, item snapshot) is preloaded by the services layer.
 */
export interface EvaluationContext {
  mode: FormMode;
  /** Live form value of a control. `undefined` means the control does not exist (orphan reference). */
  getControlValue(controlId: string): ExprValue | undefined;
  /** Value saved on the item when the form was loaded (`{ItemProperty:X}`); empty in New mode. */
  getItemProperty(internalName: string): ExprValue | undefined;
  /** Form variable by name; `undefined` when unknown. */
  getVariable?(name: string): ExprValue | undefined;
  currentUser: PersonValue | null;
  /** Titles of the SharePoint groups the current user belongs to. */
  currentUserGroups: ReadonlyArray<string>;
  now(): Date;
  /** Value of the control a rule is evaluated for (`{Self}`). */
  selfValue?: ExprValue;
  /** BCP-47 locale for date formatting, e.g. `hu-HU`. */
  locale?: string;
  /** Receives runtime diagnostics (orphan references, unsupported functions, runtime errors). */
  report?(diagnostic: Diagnostic): void;
}

export interface StaticContextOptions {
  mode?: FormMode;
  controls?: Record<string, ExprValue>;
  item?: Record<string, ExprValue>;
  variables?: Record<string, ExprValue>;
  currentUser?: PersonValue | null;
  currentUserGroups?: string[];
  now?: Date;
  selfValue?: ExprValue;
  locale?: string;
  report?(diagnostic: Diagnostic): void;
}

/** Context backed by plain objects. Used by tests and the offline analyzer. */
export function createStaticContext(options: StaticContextOptions = {}): EvaluationContext {
  const controls = options.controls || {};
  const item = options.item || {};
  const variables = options.variables || {};
  const fixedNow = options.now;
  return {
    mode: options.mode || 'New',
    getControlValue: (id: string) => (Object.prototype.hasOwnProperty.call(controls, id) ? controls[id] : undefined),
    getItemProperty: (name: string) => (Object.prototype.hasOwnProperty.call(item, name) ? item[name] : undefined),
    getVariable: (name: string) => (Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : undefined),
    currentUser: options.currentUser === undefined ? null : options.currentUser,
    currentUserGroups: options.currentUserGroups || [],
    now: () => (fixedNow ? new Date(fixedNow.getTime()) : new Date()),
    selfValue: options.selfValue,
    locale: options.locale,
    report: options.report
  };
}
