import type { PanelControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import type { XmlNode } from '../xml';
import { readControlBase } from './common';

/** Panels are containers; their children come from the nested `FormControlLayouts`. */
export function parsePanel(node: XmlNode, ctx: ParseContext): PanelControl {
  return readControlBase(node, 'Panel', ctx);
}
