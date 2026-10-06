import type { FormMode } from '../../expression/context';
import type { ExprValue, PersonValue } from '../../expression/values';
import { getListFieldName } from '../../model/controls';
import type { Diagnostic } from '../../model/Diagnostic';
import type { FormDefinition } from '../../model/FormDefinition';
import { RuleEngine } from '../../rules/RuleEngine';
import type { ControlRuleState, ValidationResult } from '../../rules/types';

export interface TestStoreOptions {
  mode: FormMode;
  /** Saved item values by internal field name (Edit/Display: also the initial control values). */
  item?: Record<string, ExprValue>;
  /** Control value overrides by control id (applied after item/default initialization). */
  values?: Record<string, ExprValue>;
  currentUser?: PersonValue | null;
  groups?: string[];
  now?: Date;
}

export interface TestStore {
  engine: RuleEngine;
  diagnostics: Diagnostic[];
  ruleState(controlId: string): ControlRuleState;
  value(controlId: string): ExprValue | undefined;
  setValue(controlId: string, value: ExprValue): string[];
  validate(): ValidationResult;
}

/**
 * Minimal, framework-free form session for rule scenarios: control values initialized from the item (Edit/Display)
 * or defaults (New), `{ItemProperty:X}` read from the item snapshot (empty in New mode).
 */
export function createTestStore(definition: FormDefinition, options: TestStoreOptions): TestStore {
  const item = options.mode === 'New' ? {} : options.item || {};
  const values: Record<string, ExprValue> = {};
  const diagnostics: Diagnostic[] = [];
  Object.keys(definition.controls).forEach((id) => {
    const control = definition.controls[id];
    const field = getListFieldName(control);
    if (control.type === 'Calculation' || control.type === 'Label' || control.type === 'Image' || control.type === 'Button') return;
    values[id] = field && Object.prototype.hasOwnProperty.call(item, field) ? item[field] : null;
  });

  const engine = new RuleEngine(definition, {
    mode: options.mode,
    getControlValue: (id) => (Object.prototype.hasOwnProperty.call(values, id) ? values[id] : undefined),
    getItemProperty: (name) => (Object.prototype.hasOwnProperty.call(item, name) ? item[name] : undefined),
    currentUser: options.currentUser === undefined ? null : options.currentUser,
    currentUserGroups: options.groups || [],
    now: () => options.now || new Date(2026, 9, 6, 12, 0, 0),
    locale: 'hu-HU',
    report: (d) => diagnostics.push(d)
  });

  if (options.mode === 'New') {
    Object.keys(values).forEach((id) => {
      const control = definition.controls[id];
      if (control.type === 'DateTime' && control.defaultValueType === 'Today') {
        const now = options.now || new Date(2026, 9, 6, 12, 0, 0);
        values[id] = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return;
      }
      const defaultValue = engine.evaluateDefaultValue(control);
      if (defaultValue !== null) values[id] = defaultValue;
    });
  }
  Object.keys(options.values || {}).forEach((id) => {
    values[id] = (options.values || {})[id];
  });
  engine.initialize();

  return {
    engine,
    diagnostics,
    ruleState: (id) => engine.getState(id),
    value: (id) => engine.getValue(id),
    setValue: (id, value) => {
      values[id] = value;
      return engine.update([id]);
    },
    validate: () => engine.validate()
  };
}
