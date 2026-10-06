import type { TextBoxControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { bool, int, nonEmptyText, XmlNode } from '../xml';
import { readFieldBase } from './common';

export function parseTextBox(node: XmlNode, ctx: ParseContext): TextBoxControl {
  const control: TextBoxControl = {
    ...readFieldBase(node, 'TextBox', ctx),
    dataType: nonEmptyText(node, 'DataType') || 'String',
    isPassword: bool(node, 'IsPassword', false),
    showAsPercent: bool(node, 'ShowAsPercent', false)
  };
  const maxLength = int(node, 'MaxLength', 0);
  if (maxLength > 0) control.maxLength = maxLength;
  return control;
}
