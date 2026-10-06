import type { EvaluationContext } from '../expression/context';
import { evaluateCondition } from '../expression/evaluator';
import { evaluateValueSource } from '../expression/valueSource';
import {
  compareValues,
  ExprValue,
  isEmptyValue,
  looseEquals,
  parseNumber,
  toDate,
  toNumber,
  toText
} from '../expression/values';
import type { CompareOperator, ControlDefinition, ControlValidators } from '../model/controls';
import { createDiagnostic } from '../model/Diagnostic';
import type { ValidationIssue } from './types';

export interface ControlValidationInput {
  control: ControlDefinition;
  /** Current value as an expression value (attachments: array of file names). */
  value: ExprValue;
  required: boolean;
  /** Context for custom validation expressions; `selfValue` is set by the caller. */
  ctx: EvaluationContext;
  /** Resolves `ControlToCompare` (a control Name) to its current value. */
  getValueByName(name: string): ExprValue | undefined;
}

type ValueKind = 'number' | 'integer' | 'date' | 'text';

function valueKind(control: ControlDefinition): ValueKind {
  if (control.type === 'DateTime') return 'date';
  if (control.type === 'TextBox') {
    if (control.dataType === 'Integer') return 'integer';
    if (control.dataType === 'Double' || control.dataType === 'Currency') return 'number';
  }
  return 'text';
}

function typed(kind: ValueKind, value: ExprValue | undefined): ExprValue {
  if (value === undefined || value === null) return null;
  switch (kind) {
    case 'number':
    case 'integer': {
      const n = typeof value === 'number' ? value : parseNumber(toText(value));
      return isNaN(n) ? null : n;
    }
    case 'date':
      return toDate(value);
    default:
      return toText(value);
  }
}

function satisfies(operator: CompareOperator, left: ExprValue, right: ExprValue): boolean {
  if (operator === 'Equal') return looseEquals(left, right);
  if (operator === 'NotEqual') return !looseEquals(left, right);
  const result = compareValues(left, right);
  if (isNaN(result)) return false;
  switch (operator) {
    case 'GreaterThan':
      return result > 0;
    case 'GreaterThanEqual':
      return result >= 0;
    case 'LessThan':
      return result < 0;
    case 'LessThanEqual':
      return result <= 0;
    default:
      return true;
  }
}

/** Data type check for typed text boxes and date controls. */
function checkDataType(kind: ValueKind, value: ExprValue): ValidationIssue | undefined {
  if (kind === 'text') return undefined;
  if (kind === 'date') return toDate(value) ? undefined : { code: 'date' };
  const n = typeof value === 'number' ? value : parseNumber(toText(value));
  if (isNaN(n)) return { code: kind === 'integer' ? 'integer' : 'number' };
  if (kind === 'integer' && Math.floor(n) !== n) return { code: 'integer' };
  return undefined;
}

function checkRegex(validators: ControlValidators, text: string, input: ControlValidationInput): ValidationIssue | undefined {
  if (!validators.regex) return undefined;
  let pattern: RegExp;
  try {
    // ASP.NET RegularExpressionValidator semantics: the whole value must match.
    // The pattern comes from the form definition by design (admin-controlled XML).
    // eslint-disable-next-line @rushstack/security/no-unsafe-regexp
    pattern = new RegExp(`^(?:${validators.regex.pattern})$`);
  } catch (e) {
    if (input.ctx.report) {
      input.ctx.report(
        createDiagnostic('warn', 'InvalidValue', `Invalid regular expression: ${(e as Error).message}`, {
          controlId: input.control.id,
          source: validators.regex.pattern
        })
      );
    }
    return undefined;
  }
  return pattern.test(text) ? undefined : { code: 'regex', message: validators.regex.message };
}

function checkRange(validators: ControlValidators, kind: ValueKind, value: ExprValue): ValidationIssue | undefined {
  const range = validators.range;
  if (!range) return undefined;
  const typedValue = typed(kind, value);
  const minimum = range.minimum !== undefined ? typed(kind, range.minimum) : null;
  const maximum = range.maximum !== undefined ? typed(kind, range.maximum) : null;
  const tooLow = minimum !== null && compareValues(typedValue, minimum) < 0;
  const tooHigh = maximum !== null && compareValues(typedValue, maximum) > 0;
  if (!tooLow && !tooHigh) return undefined;
  return {
    code: 'range',
    message: range.message,
    params: { minimum: range.minimum || '', maximum: range.maximum || '' }
  };
}

function checkCompare(
  validators: ControlValidators,
  kind: ValueKind,
  value: ExprValue,
  input: ControlValidationInput
): ValidationIssue | undefined {
  const compare = validators.compare;
  if (!compare || compare.operator === 'DataTypeCheck') return undefined;
  let other: ExprValue | undefined;
  if (compare.compareTo === 'Control' && compare.controlToCompare) {
    other = input.getValueByName(compare.controlToCompare);
    if (other === undefined) return undefined;
  } else if (compare.valueToCompare !== undefined) {
    other = compare.valueToCompare;
  } else {
    return undefined;
  }
  return satisfies(compare.operator, typed(kind, value), typed(kind, other))
    ? undefined
    : { code: 'compare', message: compare.message, params: { operator: compare.operator, value: toText(other) } };
}

/**
 * Control-level validation (Rendszerterv §9.4). Order: required → data type → length → regex → range → compare →
 * custom. Callers must skip hidden/disabled controls and Display mode.
 */
export function validateControl(input: ControlValidationInput): ValidationIssue[] {
  const { control, value, required } = input;
  const issues: ValidationIssue[] = [];
  const empty = isEmptyValue(value) || (typeof value === 'string' && value.trim() === '');

  if (control.type === 'Attachment') {
    const count = Array.isArray(value) ? value.length : 0;
    const minimum = Math.max(control.minimumAttachments, required ? 1 : 0);
    if (count < minimum) {
      issues.push({
        code: required && count === 0 && control.minimumAttachments <= 1 ? 'required' : 'minAttachments',
        message: control.minimumAttachmentsErrorMessage,
        params: { minimum }
      });
    }
    if (control.maximumAttachments !== undefined && count > control.maximumAttachments) {
      issues.push({ code: 'maxAttachments', params: { maximum: control.maximumAttachments } });
    }
    return issues;
  }

  if (!('validators' in control)) {
    return issues;
  }

  if (empty) {
    if (required) {
      issues.push({ code: 'required', message: control.requiredErrorMessage });
    }
    // Format checks do not apply to empty values; custom validation still runs (it may test other controls).
  } else {
    const kind = valueKind(control);
    const typeIssue = checkDataType(kind, value);
    if (typeIssue) {
      issues.push(typeIssue);
    } else {
      const text = toText(value);
      if (control.type === 'TextBox' && control.maxLength !== undefined && text.length > control.maxLength) {
        issues.push({ code: 'maxLength', params: { maxLength: control.maxLength } });
      }
      const regexIssue = kind === 'text' || kind === 'number' || kind === 'integer' ? checkRegex(control.validators, text, input) : undefined;
      if (regexIssue) issues.push(regexIssue);
      const rangeIssue = checkRange(control.validators, kind, value);
      if (rangeIssue) issues.push(rangeIssue);
      const compareIssue = checkCompare(control.validators, kind, value, input);
      if (compareIssue) issues.push(compareIssue);
    }
    if (control.type === 'PeoplePicker' && Array.isArray(value)) {
      const maximum = control.multiSelect ? control.maximumEntities : 1;
      if (maximum > 0 && value.length > maximum) issues.push({ code: 'maxEntities', params: { maximum } });
    }
  }

  // K-03: CustomValidationFunction is an expression; true means the value is INVALID (same as Validation rules).
  if (control.customValidation) {
    const ctx: EvaluationContext = { ...input.ctx, selfValue: value };
    if (evaluateCondition(control.customValidation.ast, ctx)) {
      const message = control.customValidation.message ? toText(evaluateValueSource(control.customValidation.message, ctx)) : '';
      issues.push({ code: 'custom', message: message || undefined });
    }
  }
  return issues;
}

/** Numeric value of a typed text box (`""` → null), for saving. */
export function numericValue(value: ExprValue): number | null {
  if (isEmptyValue(value)) return null;
  const n = typeof value === 'number' ? value : toNumber(value);
  return isNaN(n) ? null : n;
}
