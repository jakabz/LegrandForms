import type { Ast } from '../expression/ast';
import type { ControlDefinition, ControlStyle, ValueSource } from './controls';
import type { Diagnostic } from './Diagnostic';

export interface LayoutItem {
  controlId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  zIndex: number;
  /** Nested layouts (Panel). */
  children: LayoutItem[];
}

export interface LayoutDefinition {
  /** `DeviceName` (falls back to `Title`), e.g. `Desktop`. */
  name: string;
  title?: string;
  width: number;
  height: number;
  isMobileAppLayout: boolean;
  backgroundColor?: string;
  backgroundImageUrl?: string;
  backgroundImageRepeat?: string;
  style: ControlStyle;
  cssClass?: string;
  items: LayoutItem[];
}

export type RuleType = 'Formatting' | 'Validation';

export interface RuleFormat extends ControlStyle {
  cssClass?: string;
}

export interface RuleDefinition {
  id: string;
  title: string;
  type: RuleType;
  controlIds: string[];
  /** `null` when `ExpressionValue` is empty → the rule is inert. */
  expression: Ast | null;
  /** Normalized `ExpressionValue` (for diagnostics). `Rule/Expression` is never used. */
  expressionSource: string;
  hide: boolean;
  disable: boolean;
  format: RuleFormat;
  validationMessage?: string;
  /**
   * True when the rule can never have an effect: empty expression, or a Formatting rule without target controls.
   * A Validation rule without target controls is a form-level validation (not inert).
   */
  inert: boolean;
}

export interface FormVariableDefinition {
  id: string;
  name: string;
  type: string;
  expression?: ValueSource;
  connectedTo?: string;
  recalculateOnNewMode: boolean;
  recalculateOnEditMode: boolean;
  recalculateOnViewMode: boolean;
}

export interface FormDefinition {
  /** Version of the parser that produced this model (cache invalidation). */
  parserVersion: number;
  /** `Form/Id` (lower-case guid). */
  id: string;
  /** `Form/Version`, e.g. `101.3.1.10`. */
  version: string;
  formType: 'ListForm' | 'Global' | string;
  /** Cleaned form CSS (not yet scoped). */
  css: string;
  layouts: LayoutDefinition[];
  /** UniqueId → definition (lower-case guid, no braces). */
  controls: Record<string, ControlDefinition>;
  /** lower(Name) → UniqueId. */
  controlsByName: Record<string, string>;
  rules: RuleDefinition[];
  variables: FormVariableDefinition[];
  unsupported: { script: boolean; scriptUrls: string[]; cssUrls: string[] };
  diagnostics: Diagnostic[];
}
