import type { LabelControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { text, XmlNode } from '../xml';
import { plainText, readControlBase } from './common';

export function parseLabel(node: XmlNode, ctx: ParseContext): LabelControl {
  const label: LabelControl = {
    ...readControlBase(node, 'Label', ctx),
    // Label text is HTML (rich text labels); it is sanitized at render time, not decoded here.
    text: text(node, 'Text') || ''
  };
  const associated = plainText(node, 'AssociatedControl');
  if (associated) label.associatedControlName = associated;
  return label;
}
