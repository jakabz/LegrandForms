import {
  isDateValue,
  isEmptyValue,
  isLookupValue,
  isPersonValue,
  toDate,
  toText
} from '../nintex/expression/values';
import type { ExprArrayItem, ExprValue, LookupValue, PersonValue } from '../nintex/expression/values';
import type { ChoiceControl, ControlDefinition } from '../nintex/model/controls';
import { isCheckBoxDisplayFormat } from '../nintex/model/controls';
import type { FieldSchema } from '../services/FieldSchema';

/** Controls that hold a value (everything except Label, Image, Button, Panel, Unsupported). */
export function isValueControl(control: ControlDefinition): boolean {
  return (
    control.type === 'TextBox' ||
    control.type === 'MultiLineTextBox' ||
    control.type === 'Choice' ||
    control.type === 'DateTime' ||
    control.type === 'PeoplePicker' ||
    control.type === 'Lookup' ||
    control.type === 'Attachment'
  );
}

/** Multi-select choice: check box display, or a MultiChoice field. */
export function isMultiChoice(control: ChoiceControl, field: FieldSchema | undefined): boolean {
  return isCheckBoxDisplayFormat(control.displayFormat) || (!!field && field.type === 'MultiChoice');
}

function arrayItems(value: ExprValue | undefined): ReadonlyArray<ExprArrayItem> {
  if (Array.isArray(value)) return value as ReadonlyArray<ExprArrayItem>;
  if (value === null || value === undefined) return [];
  return [toText(value as ExprValue)];
}

/** Text shown in a number input: locale decimal separator, no grouping. */
export function formatNumberForInput(value: number, locale: string): string {
  if (isNaN(value)) return '';
  const text = String(value);
  return locale.toLowerCase().indexOf('hu') === 0 ? text.replace('.', ',') : text;
}

function toLookupValues(value: ExprValue | undefined): LookupValue[] {
  const result: LookupValue[] = [];
  arrayItems(value).forEach((item) => {
    if (isLookupValue(item)) {
      result.push(item);
      return;
    }
    if (typeof item === 'string') {
      // "1;#Title;#2;#Other" (SharePoint lookup string)
      const parts = item.split(';#');
      for (let i = 0; i + 1 < parts.length; i += 2) {
        const id = parseInt(parts[i], 10);
        if (!isNaN(id)) result.push({ kind: 'lookup', id, title: parts[i + 1] });
      }
    }
  });
  return result;
}

/**
 * Converts an expression value (item value, default value, binding result) to the value representation a control
 * holds in the FormStore:
 * TextBox/MultiLine → string; Choice → string or string[]; DateTime → Date|null; PeoplePicker → PersonValue[];
 * Lookup → LookupValue[]; Attachment → string[] (file names).
 */
export function coerceControlValue(
  control: ControlDefinition,
  value: ExprValue | undefined,
  field: FieldSchema | undefined,
  locale: string
): ExprValue {
  switch (control.type) {
    case 'TextBox':
      if (typeof value === 'number') return formatNumberForInput(value, locale);
      return toText(value === undefined ? null : value);
    case 'MultiLineTextBox':
      return toText(value === undefined ? null : value);
    case 'Choice': {
      if (isMultiChoice(control, field)) {
        if (typeof value === 'string') {
          return value
            .split(/;#|;/)
            .map((v) => v.trim())
            .filter((v) => v.length > 0);
        }
        return arrayItems(value)
          .map((v) => toText(v as ExprValue))
          .filter((v) => v.length > 0);
      }
      const first = Array.isArray(value) ? (value.length ? value[0] : null) : value;
      return toText(first === undefined ? null : (first as ExprValue));
    }
    case 'DateTime':
      return isDateValue(value) ? value : toDate(value === undefined ? null : value);
    case 'PeoplePicker':
      return arrayItems(value).filter(isPersonValue) as PersonValue[];
    case 'Lookup':
      return toLookupValues(value);
    case 'Attachment':
      return arrayItems(value).map((v) => toText(v as ExprValue));
    default:
      return value === undefined ? null : value;
  }
}

/** Deep value equality used for dirty tracking and change detection (`null` equals empty). */
export function valuesEqual(a: ExprValue | undefined, b: ExprValue | undefined): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (isDateValue(a) && isDateValue(b)) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const key = (item: ExprArrayItem): string =>
      isPersonValue(item) ? `p:${item.id || ''}:${item.loginName || item.email || item.displayName}` : isLookupValue(item) ? `l:${item.id}` : `s:${item}`;
    return a.every((item, i) => key(item as ExprArrayItem) === key(b[i] as ExprArrayItem));
  }
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  return a === b;
}
