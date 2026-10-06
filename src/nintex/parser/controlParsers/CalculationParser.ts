import type { CalculationControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { bool, int, nonEmptyText, text, XmlNode } from '../xml';
import { plainText, readFieldBase } from './common';

export function parseCalculation(node: XmlNode, ctx: ParseContext): CalculationControl {
  const base = readFieldBase(node, 'Calculation', ctx);
  const control: CalculationControl = {
    ...base,
    formula: ctx.compileExpression(text(node, 'Formula'), { controlId: base.id, property: 'Formula' }),
    recalculateOnNew: bool(node, 'RecalculateOnNew', true),
    recalculateOnEdit: bool(node, 'RecalculateOnEdit', true),
    recalculateOnView: bool(node, 'RecalculateOnView', true),
    dataType: nonEmptyText(node, 'DataType') || 'String',
    decimals: Math.max(0, int(node, 'Decimals', 0)),
    showAsPercent: bool(node, 'ShowAsPercent', false),
    showThousandSeparator: bool(node, 'ShowThousandSeparator', false)
  };
  const prefix = plainText(node, 'ValuePrefix');
  if (prefix) control.prefix = prefix;
  const suffix = plainText(node, 'ValueSuffix');
  if (suffix) control.suffix = suffix;
  return control;
}
