import type { UnsupportedControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import type { XmlNode } from '../xml';
import { rawTypeOf, readControlBase } from './common';

/** Fallback for control types the renderer does not implement (Repeating Section, List View, …). */
export function parseUnsupported(node: XmlNode, ctx: ParseContext): UnsupportedControl {
  const base = readControlBase(node, 'Unsupported', ctx);
  const rawType = rawTypeOf(node) || 'unknown';
  ctx.diagnostics.report('warn', 'UnsupportedControl', `Unsupported control type ${rawType}`, { controlId: base.id });
  return { ...base, reason: `Unsupported control type ${rawType}` };
}
