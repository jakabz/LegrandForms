import type { LayoutDefinition, LayoutItem } from '../model/FormDefinition';
import { computeCollapse } from './collapse';

export interface LayoutBox {
  controlId: string;
  left: number;
  top: number;
  width: number;
  /** Design height (grown controls keep this; the UI lets them expand). */
  height: number;
  zIndex: number;
  hidden: boolean;
  /** Nested boxes (Panel), relative to the parent box. */
  children: LayoutBox[];
}

export interface AbsoluteLayoutInput {
  layout: LayoutDefinition;
  isHidden(controlId: string): boolean;
  measuredHeights?: Record<string, number>;
  collapseHiddenRows: boolean;
  /** Controls removed by configuration (`hideImages`): not rendered, their space is reclaimed. */
  isRemoved?(controlId: string): boolean;
}

export interface AbsoluteLayoutResult {
  width: number;
  height: number;
  /** Top-level boxes, sorted by z-index then position (stable render order). */
  boxes: LayoutBox[];
}

function toBox(item: LayoutItem, top: number, height: number, hidden: boolean, isHidden: (id: string) => boolean): LayoutBox {
  return {
    controlId: item.controlId,
    left: item.left,
    top,
    width: item.width,
    height,
    zIndex: item.zIndex,
    hidden,
    children: item.children.map((child) => toBox(child, child.top, child.height, isHidden(child.controlId), isHidden))
  };
}

/**
 * Absolute (pixel-faithful) layout of the Nintex canvas (Rendszerterv §10.1, §10.3, §10.4):
 * positions from the XML, hidden-band collapse (optional), removal of configured controls and push-down of grown
 * controls.
 */
export function computeAbsoluteLayout(input: AbsoluteLayoutInput): AbsoluteLayoutResult {
  const { layout } = input;
  const collapse = computeCollapse({
    items: layout.items,
    isHidden: input.isHidden,
    measuredHeights: input.measuredHeights,
    collapseHiddenRows: input.collapseHiddenRows,
    isRemoved: input.isRemoved
  });
  const isRemoved = input.isRemoved || (() => false);
  const background = new Set(collapse.backgroundIds);
  const measured = input.measuredHeights || {};

  let contentBottom = 0;
  const boxes = layout.items.filter((item) => !isRemoved(item.controlId)).map((item) => {
    const hidden = input.isHidden(item.controlId);
    let top: number;
    let height: number;
    if (background.has(item.controlId)) {
      // Background rectangles stretch with the rows they cover.
      top = collapse.mapY(item.top);
      height = Math.max(0, collapse.mapY(item.top + item.height) - top);
    } else {
      top = collapse.mapY(item.top);
      height = item.height;
    }
    if (!hidden) {
      const grown = measured[item.controlId] !== undefined ? Math.max(height, measured[item.controlId]) : height;
      contentBottom = Math.max(contentBottom, top + grown);
    }
    return toBox(item, top, height, hidden, input.isHidden);
  });

  boxes.sort((a, b) => a.zIndex - b.zIndex || a.top - b.top || a.left - b.left);
  const designHeight = layout.height > 0 ? collapse.mapY(layout.height) : 0;
  return {
    width: layout.width,
    height: Math.max(designHeight, contentBottom),
    boxes
  };
}
