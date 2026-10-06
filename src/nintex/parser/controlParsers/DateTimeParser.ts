import type { DateTimeControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { bool, nonEmptyText, XmlNode } from '../xml';
import { readFieldBase } from './common';

export function parseDateTime(node: XmlNode, ctx: ParseContext): DateTimeControl {
  return {
    ...readFieldBase(node, 'DateTime', ctx),
    dateOnly: bool(node, 'DateOnly', true),
    defaultValueType: nonEmptyText(node, 'DefaultValueType') || 'Blank'
  };
}
