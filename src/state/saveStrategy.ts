import type { FormMode } from '../nintex/expression/context';
import { isEmptyValue } from '../nintex/expression/values';
import type { ExprValue } from '../nintex/expression/values';
import { getListFieldName } from '../nintex/model/controls';
import type { FormDefinition } from '../nintex/model/FormDefinition';
import type { FieldSchema } from '../services/FieldSchema';
import { isWritableField } from '../services/FieldSchema';
import type { SaveChange } from '../services/ItemPersistence';
import { valuesEqual } from './controlValues';

export interface SaveStrategyInput {
  definition: FormDefinition;
  mode: FormMode;
  fields: Record<string, FieldSchema>;
  /** Current value of a control (calculations included). */
  getValue(controlId: string): ExprValue | undefined;
  /** Controls the user changed. */
  dirty: ReadonlySet<string>;
  /** Stored item value of a field at load time (for bound calculations in Edit mode). */
  getOriginalFieldValue(internalName: string): ExprValue | undefined;
}

export interface SkippedField {
  controlId: string;
  internalName: string;
  reason: 'missingField' | 'readOnlyField' | 'empty' | 'unchanged';
}

export interface SaveStrategyResult {
  changes: SaveChange[];
  skipped: SkippedField[];
}

interface Candidate {
  change: SaveChange;
  priority: number;
}

/**
 * Which fields to write (Rendszerterv §12.3, CLAUDE.md rule 11):
 * - New: every bound, non-empty value, including defaults and bound calculations;
 * - Edit: only dirty fields plus bound calculations whose value differs from the stored one. Untouched disabled
 *   fields are never written back (workflows own Status, ApprovedBy, …).
 * - Display: nothing.
 * When several controls are bound to the same field, a dirty control wins over an untouched one, and an input
 * control wins over a calculation.
 */
export function buildSaveChanges(input: SaveStrategyInput): SaveStrategyResult {
  const result: SaveStrategyResult = { changes: [], skipped: [] };
  if (input.mode === 'Display') return result;
  const candidates: Record<string, Candidate> = {};
  const order: string[] = [];

  Object.keys(input.definition.controls).forEach((controlId) => {
    const control = input.definition.controls[controlId];
    const internalName = getListFieldName(control);
    if (!internalName) return;
    const field = input.fields[internalName];
    if (!field) {
      result.skipped.push({ controlId, internalName, reason: 'missingField' });
      return;
    }
    if (!isWritableField(field)) {
      result.skipped.push({ controlId, internalName, reason: 'readOnlyField' });
      return;
    }
    const value = input.getValue(controlId);
    const isCalculation = control.type === 'Calculation';
    const dirty = input.dirty.has(controlId);
    let include: boolean;
    if (input.mode === 'New') {
      include = !isEmptyValue(value === undefined ? null : value);
      if (!include) result.skipped.push({ controlId, internalName, reason: 'empty' });
    } else if (isCalculation) {
      include = !valuesEqual(value, input.getOriginalFieldValue(internalName));
      if (!include) result.skipped.push({ controlId, internalName, reason: 'unchanged' });
    } else {
      include = dirty;
      if (!include) result.skipped.push({ controlId, internalName, reason: 'unchanged' });
    }
    if (!include) return;

    const priority = (dirty ? 2 : 0) + (isCalculation ? 0 : 1);
    const existing = candidates[internalName];
    if (!existing) order.push(internalName);
    if (!existing || priority > existing.priority) {
      candidates[internalName] = { change: { field, controlId, value: value === undefined ? null : value }, priority };
    }
  });

  result.changes = order.map((name) => candidates[name].change);
  return result;
}
