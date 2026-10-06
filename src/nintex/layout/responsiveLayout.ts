import type { LayoutDefinition } from '../model/FormDefinition';
import { buildBands, findBackgroundItems } from './collapse';

export interface ResponsiveRow {
  /** Control ids of the row, left to right (rendered stacked, full width). */
  controlIds: string[];
  /** Original top of the row (for debugging / keys). */
  top: number;
}

/**
 * Narrow-screen layout (Rendszerterv §10.2): items ordered by (top, left), grouped into rows by band;
 * inside a row label/input pairs follow each other left to right and are stacked full width by the renderer.
 * Background rectangles become their own row at their top position. Hidden controls are omitted.
 */
export function computeResponsiveRows(layout: LayoutDefinition, isHidden: (controlId: string) => boolean): ResponsiveRow[] {
  const background = findBackgroundItems(layout.items);
  const visible = layout.items.filter((item) => !isHidden(item.controlId));
  const rows: ResponsiveRow[] = buildBands(visible.filter((item) => !background.has(item.controlId))).map((band) => ({
    top: band.top,
    controlIds: band.controlIds
  }));
  visible
    .filter((item) => background.has(item.controlId))
    .forEach((item) => rows.push({ top: item.top - 0.5, controlIds: [item.controlId] }));

  const byId: Record<string, { left: number; top: number }> = {};
  layout.items.forEach((item) => (byId[item.controlId] = item));
  rows.sort((a, b) => a.top - b.top);
  rows.forEach((row) => {
    row.controlIds.sort((a, b) => byId[a].left - byId[b].left || byId[a].top - byId[b].top);
    row.top = Math.ceil(row.top);
  });
  return rows;
}
