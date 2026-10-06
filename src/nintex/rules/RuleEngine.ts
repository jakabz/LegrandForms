import type { EvaluationContext } from '../expression/context';
import { evaluate, evaluateCondition } from '../expression/evaluator';
import { usesSelf } from '../expression/references';
import { evaluateValueSource } from '../expression/valueSource';
import { ExprValue, isDateValue, toBoolean } from '../expression/values';
import type { CalculationControl, ControlDefinition, ControlStyle, KnownBindingProperty } from '../model/controls';
import { getListFieldName } from '../model/controls';
import { createDiagnostic } from '../model/Diagnostic';
import type { FormDefinition, RuleDefinition } from '../model/FormDefinition';
import { validateControl } from './controlValidation';
import { DependencyGraph } from './dependencyGraph';
import type { ControlRuleState, RuleEngineEnvironment, RuleTraceEntry, ValidationIssue, ValidationResult } from './types';

const MAX_CYCLE_ITERATIONS: number = 10;
const MAX_TRACE_ENTRIES: number = 500;

function sameValue(a: ExprValue | undefined, b: ExprValue | undefined): boolean {
  if (a === b) return true;
  if (isDateValue(a) && isDateValue(b)) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === 'number' && typeof b === 'number') return isNaN(a) && isNaN(b);
  return false;
}

function sameStyle(a: ControlStyle, b: ControlStyle): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameState(a: ControlRuleState | undefined, b: ControlRuleState): boolean {
  return (
    !!a &&
    a.hidden === b.hidden &&
    a.disabled === b.disabled &&
    a.required === b.required &&
    a.cssClasses.join(' ') === b.cssClasses.join(' ') &&
    sameStyle(a.style, b.style)
  );
}

export interface ValidateOptions {
  /** Restrict control-level validation to these controls (live validation after a change). */
  controlIds?: string[];
}

/**
 * Evaluates Formatting/Validation rules, property bindings and calculations for one form instance.
 * Pure (no UI); all data comes from the {@link RuleEngineEnvironment}.
 *
 * Semantics (CLAUDE.md "Nintex semantics"):
 * - Formatting rule true → apply; Hide/Disable are OR-ed; style props: last true rule in XML order wins.
 * - Validation rule true → error with ValidationMessage; no target controls → form-level error.
 * - Inert rules (empty expression / no targets for Formatting) never run.
 * - Hidden or disabled controls are not validated; no validation in Display mode.
 */
export class RuleEngine {
  public readonly definition: FormDefinition;
  public readonly graph: DependencyGraph;

  private readonly _env: RuleEngineEnvironment;
  private readonly _ctx: EvaluationContext;
  private readonly _rulesByControl: Map<string, RuleDefinition[]> = new Map();
  private readonly _rulesById: Map<string, RuleDefinition> = new Map();
  private readonly _states: Map<string, ControlRuleState> = new Map();
  private readonly _calculated: Map<string, ExprValue> = new Map();
  /** Rule results: boolean, or per-target results for `{Self}` rules. */
  private readonly _ruleResults: Map<string, boolean | Map<string, boolean>> = new Map();
  private readonly _bindingResults: Map<string, Partial<Record<KnownBindingProperty, ExprValue>>> = new Map();
  private readonly _trace: RuleTraceEntry[] = [];
  private _traceSequence: number = 0;
  private _tracing: boolean = false;

  public constructor(definition: FormDefinition, env: RuleEngineEnvironment) {
    this.definition = definition;
    this._env = env;
    this.graph = new DependencyGraph(definition);
    const getVariable = env.getVariable;
    const report = env.report;
    this._ctx = {
      mode: env.mode,
      getControlValue: (id: string) => this.getValue(id),
      getItemProperty: (name: string) => env.getItemProperty(name),
      getVariable: getVariable ? (name: string) => getVariable.call(env, name) : undefined,
      currentUser: env.currentUser,
      currentUserGroups: env.currentUserGroups,
      now: () => env.now(),
      locale: env.locale,
      report: report ? (d) => report.call(env, d) : undefined
    };
    definition.rules.forEach((rule) => {
      this._rulesById.set(rule.id, rule);
      rule.controlIds.forEach((controlId) => {
        const list = this._rulesByControl.get(controlId) || [];
        list.push(rule);
        this._rulesByControl.set(controlId, list);
      });
    });
    if (this.graph.cyclicCalculations.length && env.report) {
      env.report(
        createDiagnostic('warn', 'CircularDependency', `Circular dependency between calculations: ${this.graph.cyclicCalculations.join(', ')}`)
      );
    }
  }

  /** The evaluation context bound to this engine (live control values incl. calculations). */
  public get context(): EvaluationContext {
    return this._ctx;
  }

  /** Enables recording of rule evaluations (diagnostics panel). */
  public setTracing(enabled: boolean): void {
    this._tracing = enabled;
  }

  public get trace(): ReadonlyArray<RuleTraceEntry> {
    return this._trace;
  }

  /** Computes all calculations, bindings, rules and control states. Call once after construction. */
  public initialize(): void {
    this._recalculate(this.graph.calculationOrder.concat(this.graph.cyclicCalculations));
    Object.keys(this.definition.controls).forEach((id) => this._evaluateBindings(id));
    this.definition.rules.forEach((rule) => this._evaluateRule(rule));
    Object.keys(this.definition.controls).forEach((id) => this._states.set(id, this._computeState(id)));
  }

  /**
   * Re-evaluates what depends on the changed controls. Returns the ids of controls whose rule state or
   * calculated value changed (the UI re-renders only those).
   */
  public update(changedControlIds: string[]): string[] {
    const changed = new Set<string>();
    const calculations = this.graph.affectedCalculations(changedControlIds);
    this._recalculate(calculations).forEach((id) => changed.add(id));

    const sources = changedControlIds.concat(Array.from(changed));
    const touched = new Set<string>();
    this.graph.affectedBindings(sources).forEach((controlId) => {
      this._evaluateBindings(controlId);
      touched.add(controlId);
    });
    this.graph.affectedRules(sources).forEach((ruleId) => {
      const rule = this._rulesById.get(ruleId);
      if (!rule) return;
      this._evaluateRule(rule);
      rule.controlIds.forEach((id) => touched.add(id));
    });
    touched.forEach((controlId) => {
      if (!this.definition.controls[controlId]) return;
      const next = this._computeState(controlId);
      if (!sameState(this._states.get(controlId), next)) {
        this._states.set(controlId, next);
        changed.add(controlId);
      }
    });
    return Array.from(changed);
  }

  /** Current value of a control: calculated value for calculations, the environment value otherwise. */
  public getValue(controlId: string): ExprValue | undefined {
    const control = this.definition.controls[controlId];
    if (control && control.type === 'Calculation') {
      return this._calculated.has(controlId) ? this._calculated.get(controlId) : null;
    }
    return this._env.getControlValue(controlId);
  }

  public getCalculatedValue(controlId: string): ExprValue {
    const value = this._calculated.get(controlId);
    return value === undefined ? null : value;
  }

  public getState(controlId: string): ControlRuleState {
    return (
      this._states.get(controlId) || { hidden: false, disabled: this._env.mode === 'Display', required: false, style: {}, cssClasses: [] }
    );
  }

  /** Evaluates the `DefaultValue` binding, falling back to the static `DefaultValue` property. */
  public evaluateDefaultValue(control: ControlDefinition): ExprValue {
    const binding = control.bindings.filter((b) => b.property === 'DefaultValue')[0];
    if (binding) return evaluateValueSource(binding.value, this._ctx);
    if ('defaultValue' in control && control.defaultValue) return evaluateValueSource(control.defaultValue, this._ctx);
    return null;
  }

  /** Full validation (Save). Display mode never validates. */
  public validate(options: ValidateOptions = {}): ValidationResult {
    const controlErrors: Record<string, ValidationIssue[]> = {};
    const formErrors: ValidationIssue[] = [];
    if (this._env.mode === 'Display') {
      return { valid: true, controlErrors, formErrors };
    }
    const ids = options.controlIds || Object.keys(this.definition.controls);
    const validatable = (id: string): boolean => {
      const state = this.getState(id);
      return !!this.definition.controls[id] && !state.hidden && !state.disabled;
    };

    ids.forEach((id) => {
      if (!validatable(id)) return;
      const control = this.definition.controls[id];
      if (control.type === 'Calculation' || control.type === 'Label' || control.type === 'Image' || control.type === 'Button') return;
      const issues = validateControl({
        control,
        value: this._valueForValidation(id),
        required: this.getState(id).required,
        ctx: this._ctx,
        getValueByName: (name: string) => {
          const target = this.definition.controlsByName[name.trim().toLowerCase()];
          return target ? this.getValue(target) : undefined;
        }
      });
      if (issues.length) controlErrors[id] = issues;
    });

    const restrict = options.controlIds ? new Set(options.controlIds) : undefined;
    this.definition.rules.forEach((rule) => {
      if (rule.type !== 'Validation' || !rule.expression || rule.inert) return;
      if (!rule.controlIds.length) {
        // Form-level validation rule; skipped during live per-control validation.
        if (!restrict && this._evaluate(rule, undefined)) {
          formErrors.push({ code: 'rule', message: rule.validationMessage, ruleId: rule.id });
        }
        return;
      }
      rule.controlIds.forEach((id) => {
        if ((restrict && !restrict.has(id)) || !validatable(id)) return;
        if (this._evaluate(rule, usesSelf(rule.expression) ? id : undefined)) {
          (controlErrors[id] = controlErrors[id] || []).push({ code: 'rule', message: rule.validationMessage, ruleId: rule.id });
        }
      });
    });

    return { valid: !Object.keys(controlErrors).length && !formErrors.length, controlErrors, formErrors };
  }

  // -------------------------------------------------------------------------------------------------------------

  private _valueForValidation(controlId: string): ExprValue {
    const value = this.getValue(controlId);
    return value === undefined ? null : value;
  }

  private _shouldRecalculate(control: CalculationControl): boolean {
    switch (this._env.mode) {
      case 'New':
        return control.recalculateOnNew;
      case 'Edit':
        return control.recalculateOnEdit;
      default:
        return control.recalculateOnView;
    }
  }

  /** Recomputes the given calculations in order; returns ids whose value changed. Cycles iterate ≤ 10 times. */
  private _recalculate(ids: string[]): string[] {
    const changed: string[] = [];
    const cyclic = new Set(this.graph.cyclicCalculations);
    const compute = (id: string): boolean => {
      const control = this.definition.controls[id] as CalculationControl;
      let value: ExprValue;
      const field = getListFieldName(control);
      if (!this._shouldRecalculate(control) && field) {
        // Not recalculated in this mode: show the stored value.
        const stored = this._env.getItemProperty(field);
        value = stored === undefined ? null : stored;
      } else {
        value = control.formula ? evaluate(control.formula.ast, this._ctx) : null;
      }
      if (!sameValue(this._calculated.get(id), value) || !this._calculated.has(id)) {
        this._calculated.set(id, value);
        return true;
      }
      return false;
    };
    const acyclic = ids.filter((id) => !cyclic.has(id));
    const inCycle = ids.filter((id) => cyclic.has(id));
    acyclic.forEach((id) => {
      if (compute(id)) changed.push(id);
    });
    for (let i = 0; i < MAX_CYCLE_ITERATIONS && inCycle.length; i++) {
      let any = false;
      inCycle.forEach((id) => {
        if (compute(id)) {
          any = true;
          if (changed.indexOf(id) < 0) changed.push(id);
        }
      });
      if (!any) break;
    }
    return changed;
  }

  private _evaluateBindings(controlId: string): void {
    const control = this.definition.controls[controlId];
    if (!control || !control.bindings.length) return;
    const results: Partial<Record<KnownBindingProperty, ExprValue>> = {};
    const ctx: EvaluationContext = { ...this._ctx, selfValue: this._valueForValidation(controlId) };
    control.bindings.forEach((binding) => {
      if (binding.property !== 'DefaultValue') {
        results[binding.property] = evaluateValueSource(binding.value, ctx);
      }
    });
    this._bindingResults.set(controlId, results);
  }

  private _evaluate(rule: RuleDefinition, selfControlId: string | undefined): boolean {
    const ctx = selfControlId ? { ...this._ctx, selfValue: this._valueForValidation(selfControlId) } : this._ctx;
    const result = evaluateCondition(rule.expression, ctx);
    if (this._tracing) {
      this._trace.push({ ruleId: rule.id, title: rule.title, controlId: selfControlId, result, sequence: ++this._traceSequence });
      if (this._trace.length > MAX_TRACE_ENTRIES) this._trace.splice(0, this._trace.length - MAX_TRACE_ENTRIES);
    }
    return result;
  }

  private _evaluateRule(rule: RuleDefinition): void {
    if (rule.type !== 'Formatting' || rule.inert || !rule.expression) return;
    if (usesSelf(rule.expression)) {
      const perControl = new Map<string, boolean>();
      rule.controlIds.forEach((id) => perControl.set(id, this._evaluate(rule, id)));
      this._ruleResults.set(rule.id, perControl);
    } else {
      this._ruleResults.set(rule.id, this._evaluate(rule, undefined));
    }
  }

  private _ruleIsTrue(rule: RuleDefinition, controlId: string): boolean {
    const result = this._ruleResults.get(rule.id);
    if (result === undefined) return false;
    if (typeof result === 'boolean') return result;
    return result.get(controlId) === true;
  }

  private _computeState(controlId: string): ControlRuleState {
    const control = this.definition.controls[controlId];
    const bindings = this._bindingResults.get(controlId) || {};
    const bound = (property: KnownBindingProperty, fallback: boolean): boolean =>
      property in bindings ? toBoolean(bindings[property] as ExprValue) : fallback;

    let hidden = !bound('IsVisible', control.isVisible);
    let disabled = !bound('IsEnabled', control.isEnabled) || this._env.mode === 'Display';
    if ('controlMode' in control && (control.controlMode === 'ReadOnly' || control.controlMode === 'Display')) {
      disabled = true;
    }
    const required = bound('IsRequired', 'isRequired' in control ? control.isRequired : false);
    const style: ControlStyle = {};
    const cssClasses: string[] = [];
    (this._rulesByControl.get(controlId) || []).forEach((rule) => {
      if (rule.type !== 'Formatting' || rule.inert || !this._ruleIsTrue(rule, controlId)) return;
      if (rule.hide) hidden = true;
      if (rule.disable) disabled = true;
      const { cssClass, ...format } = rule.format;
      Object.keys(format).forEach((key) => {
        (style as Record<string, unknown>)[key] = (format as Record<string, unknown>)[key];
      });
      if (cssClass) cssClasses.push(cssClass);
    });
    return { hidden, disabled, required, style, cssClasses };
  }
}
