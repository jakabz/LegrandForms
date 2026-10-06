import type { MultiLineTextBoxControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { bool, nonEmptyText, XmlNode } from '../xml';
import { readFieldBase } from './common';

export function parseMultiLineTextBox(node: XmlNode, ctx: ParseContext): MultiLineTextBoxControl {
  return {
    ...readFieldBase(node, 'MultiLineTextBox', ctx),
    isRichText: bool(node, 'IsRichText', false),
    richTextMode: nonEmptyText(node, 'RichTextMode') || 'Compatible',
    isAppendText: bool(node, 'IsAppendText', false)
  };
}
