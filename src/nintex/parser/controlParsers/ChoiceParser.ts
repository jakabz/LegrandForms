import type { ChoiceControl, ValueSource } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { bool, int, nonEmptyText, stringList, XmlNode } from '../xml';
import { plainText, readFieldBase } from './common';

export function parseChoice(node: XmlNode, ctx: ParseContext): ChoiceControl {
  const base = readFieldBase(node, 'Choice', ctx);
  const choices: ValueSource[] = [];
  stringList(node, 'Choices').forEach((raw, index) => {
    // Choices may be literals or tokens such as {ItemProperty:AuditOrg} (resolved at runtime).
    const value = ctx.compileValue(raw, { controlId: base.id, property: `Choices[${index}]` });
    if (value) choices.push(value);
  });
  const control: ChoiceControl = {
    ...base,
    choices,
    displayFormat: nonEmptyText(node, 'DisplayFormat') || 'DropDownList',
    fillInChoice: bool(node, 'FillInChoice', false),
    repeatColumns: int(node, 'RepeatColumns', 1),
    repeatDirection: nonEmptyText(node, 'RepeatDirection') || 'Vertical',
    dataType: nonEmptyText(node, 'DataType') || 'String'
  };
  if (bool(node, 'UseCustomPleaseSelectText', false)) {
    const pleaseSelect = plainText(node, 'CustomPleaseSelectText');
    if (pleaseSelect) control.pleaseSelectText = pleaseSelect;
  }
  if (bool(node, 'UseCustomSpecifyValueText', false)) {
    const specify = plainText(node, 'CustomSpecifyValueText');
    if (specify) control.specifyValueText = specify;
  }
  return control;
}
