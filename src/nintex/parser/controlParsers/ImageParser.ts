import type { ImageControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { nonEmptyText, XmlNode } from '../xml';
import { plainText, readControlBase } from './common';

export function parseImage(node: XmlNode, ctx: ParseContext): ImageControl {
  const control: ImageControl = {
    ...readControlBase(node, 'Image', ctx),
    imageUrl: (nonEmptyText(node, 'ImageUrl') || '').trim()
  };
  const alternateText = plainText(node, 'AlternateText');
  if (alternateText) control.alternateText = alternateText;
  const width = nonEmptyText(node, 'HorizontalWidth');
  if (width) control.horizontalWidth = width.trim();
  const height = nonEmptyText(node, 'VerticalHeight');
  if (height) control.verticalHeight = height.trim();
  return control;
}
