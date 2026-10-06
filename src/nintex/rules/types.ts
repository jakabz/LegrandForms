import type { FormMode } from '../expression/context';
import type { ExprValue, PersonValue } from '../expression/values';
import type { ControlStyle } from '../model/controls';
import type { Diagnostic } from '../model/Diagnostic';

/** Effective, rule-driven state of a control (Rendszerterv §9.1). */
export interface ControlRuleState {
  hidden: boolean;
  disabled: boolean;
  required: boolean;
  /** Formatting of the true Formatting rules, in XML order (last one wins per property). */
  style: ControlStyle;
  cssClasses: string[];
}

export type ValidationCode =
  | 'required'
  | 'number'
  | 'integer'
  | 'date'
  | 'maxLength'
  | 'regex'
  | 'range'
  | 'compare'
  | 'custom'
  | 'rule'
  | 'maxEntities'
  | 'minAttachments'
  | 'maxAttachments'
  | 'fileType'
  | 'fileSize'
  /** Error returned by SharePoint when saving (list validation, required column). */
  | 'server';

/** A validation error. `message` is set when the form defines one; otherwise the UI formats a default by `code`. */
export interface ValidationIssue {
  code: ValidationCode;
  message?: string;
  params?: Record<string, string | number>;
  /** Rule id for `rule` issues. */
  ruleId?: string;
}

export interface ValidationResult {
  valid: boolean;
  /** controlId → issues (only controls with issues). */
  controlErrors: Record<string, ValidationIssue[]>;
  /** Form-level messages (Validation rules without target controls). */
  formErrors: ValidationIssue[];
}

/** Data the engine reads; supplied by the FormStore (or tests). Must be synchronous. */
export interface RuleEngineEnvironment {
  mode: FormMode;
  /** Current form value of a non-calculated control as an expression value; undefined for unknown controls. */
  getControlValue(controlId: string): ExprValue | undefined;
  /** Item snapshot at load time (`{ItemProperty:X}`); empty in New mode. */
  getItemProperty(internalName: string): ExprValue | undefined;
  getVariable?(name: string): ExprValue | undefined;
  currentUser: PersonValue | null;
  currentUserGroups: ReadonlyArray<string>;
  now(): Date;
  locale?: string;
  report?(diagnostic: Diagnostic): void;
}

/** One rule evaluation, recorded for the diagnostics panel (debug mode). */
export interface RuleTraceEntry {
  ruleId: string;
  title: string;
  /** Target control when the rule reads `{Self}`. */
  controlId?: string;
  result: boolean;
  /** Increasing sequence number. */
  sequence: number;
}
