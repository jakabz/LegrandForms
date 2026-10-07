import type { LookupControl } from '../../model/controls';
import { EMPTY_GUID, normalizeGuid } from '../normalize';
import type { ParseContext } from '../ParseContext';
import { bool, int, nonEmptyText, text, XmlNode } from '../xml';
import { plainText, readFieldBase } from './common';

export function parseLookup(node: XmlNode, ctx: ParseContext): LookupControl {
  const control: LookupControl = {
    ...readFieldBase(node, 'Lookup', ctx),
    lookupList: plainText(node, 'LookupList') || '',
    lookupField: plainText(node, 'LookupField') || 'Title',
    allowMultipleValues: bool(node, 'AllowMultipleValues', false),
    displayFormat: nonEmptyText(node, 'DisplayFormat') || 'DropDownList',
    repeatColumns: int(node, 'RepeatColumns', 1),
    repeatDirection: nonEmptyText(node, 'RepeatDirection') || 'Vertical',
    executeInNewMode: bool(node, 'ExecuteInNewMode', true),
    executeInEditMode: bool(node, 'ExecuteInEditMode', true),
    executeInViewMode: bool(node, 'ExecuteInViewMode', false)
  };
  const lookupWeb = plainText(node, 'LookupWeb');
  if (lookupWeb) control.lookupWeb = lookupWeb;
  const lookupView = plainText(node, 'LookupView');
  if (lookupView) control.lookupView = lookupView;
  const singleDisplayMode = nonEmptyText(node, 'SingleDisplayMode');
  if (singleDisplayMode) control.singleDisplayMode = singleDisplayMode;
  const multipleDisplayMode = nonEmptyText(node, 'MultipleDisplayMode');
  if (multipleDisplayMode) control.multipleDisplayMode = multipleDisplayMode;

  const cascadeType = nonEmptyText(node, 'CascadeType') || 'None';
  if (cascadeType !== 'None') {
    control.cascade = { type: cascadeType };
    const controlName = plainText(node, 'CascadeFilterControl');
    if (controlName) control.cascade.controlName = controlName;
    const controlId = normalizeGuid(text(node, 'CascadeFilterControlId'));
    if (controlId && controlId !== EMPTY_GUID) control.cascade.controlId = controlId;
    const field = plainText(node, 'CascadeFilterField');
    if (field) control.cascade.field = field;
    const emptyFilterAction = nonEmptyText(node, 'EmptyFilterAction');
    if (emptyFilterAction) control.cascade.emptyFilterAction = emptyFilterAction;
  }
  return control;
}
