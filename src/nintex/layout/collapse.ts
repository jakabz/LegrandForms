import type { LayoutItem } from '../model/FormDefinition';

/** A horizontal band: the union of vertically overlapping items (Rendszerterv §10.3). */
export interface Band {
  top: number;
  bottom: number;
  controlIds: string[];
}

export interface BandAdjustment extends Band {
  /** Vertical offset applied to the items of this band. */
  offset: number;
  /** Offset applied to everything below the band. */
  offsetAfter: number;
  collapsed: boolean;
  /** Extra height caused by controls that grew at runtime. */
  growth: number;
}

export interface CollapseInput {
  items: LayoutItem[];
  isHidden(controlId: string): boolean;
  /** Runtime heights of controls that can grow (CanResizeAtRuntime); smaller values are ignored. */
  measuredHeights?: Record<string, number>;
  /** Remove bands whose controls are all hidden. */
  collapseHiddenRows: boolean;
  /**
   * Controls removed from the form by configuration (e.g. `hideImages`). Unlike hidden controls their space is
   * always reclaimed, independently of `collapseHiddenRows`.
   */
  isRemoved?(controlId: string): boolean;
}

export interface CollapseResult {
  bands: BandAdjustment[];
  /** Items excluded from banding (large background rectangles). */
  backgroundIds: string[];
  /** Maps an original y coordinate to the adjusted one. */
  mapY(y: number): number;
}

function contains(outer: LayoutItem, inner: LayoutItem): boolean {
  return (
    outer !== inner &&
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.left + inner.width <= outer.left + outer.width &&
    inner.top + inner.height <= outer.top + outer.height
  );
}

/**
 * Background rectangles: items that fully cover at least two other items (e.g. AJForm's green section label
 * 890–1185). They do not take part in banding, otherwise they would merge many rows into one band.
 */
export function findBackgroundItems(items: LayoutItem[]): Set<string> {
  const result = new Set<string>();
  items.forEach((candidate) => {
    let covered = 0;
    for (const other of items) {
      if (contains(candidate, other) && ++covered >= 2) {
        result.add(candidate.controlId);
        break;
      }
    }
  });
  return result;
}

/** Groups items into bands of overlapping `[top, top + height)` intervals. Touching items form separate bands. */
export function buildBands(items: LayoutItem[]): Band[] {
  const sorted = items.slice().sort((a, b) => a.top - b.top || a.left - b.left);
  const bands: Band[] = [];
  sorted.forEach((item) => {
    const bottom = item.top + item.height;
    const current = bands[bands.length - 1];
    if (current && item.top < current.bottom) {
      current.bottom = Math.max(current.bottom, bottom);
      current.controlIds.push(item.controlId);
    } else {
      bands.push({ top: item.top, bottom, controlIds: [item.controlId] });
    }
  });
  return bands;
}

/**
 * Computes the vertical adjustments: hidden bands collapse (optional), grown controls push the rows below down.
 */
export function computeCollapse(input: CollapseInput): CollapseResult {
  const measured = input.measuredHeights || {};
  const isRemoved = input.isRemoved || (() => false);
  // Removed items never act as background rectangles (they take no space at all).
  const background = findBackgroundItems(input.items.filter((item) => !isRemoved(item.controlId)));
  const banded = input.items.filter((item) => !background.has(item.controlId));
  const byId: Record<string, LayoutItem> = {};
  input.items.forEach((item) => (byId[item.controlId] = item));

  const bands = buildBands(banded);
  const adjusted: BandAdjustment[] = [];
  let offset = 0;
  bands.forEach((band, index) => {
    const kept = band.controlIds.filter((id) => !isRemoved(id));
    const visible = kept.filter((id) => !input.isHidden(id));
    const collapsed = kept.length === 0 || (input.collapseHiddenRows && visible.length === 0);
    // A band that loses some of its items to removal shrinks to the extent of the remaining ones
    // (AT: the header image 0–155 with a calculation 130–155 on top of it → the band starts at 130).
    let leadCut = 0;
    let bottom = band.bottom;
    if (!collapsed && kept.length < band.controlIds.length) {
      leadCut = Math.min(...kept.map((id) => byId[id].top)) - band.top;
      bottom = Math.max(...kept.map((id) => byId[id].top + byId[id].height));
    }
    let growth = 0;
    visible.forEach((id) => {
      const item = byId[id];
      const height = measured[id] !== undefined && measured[id] > item.height ? measured[id] : item.height;
      growth = Math.max(growth, item.top + height - bottom);
    });
    const bandOffset = offset - leadCut;
    if (collapsed) {
      const next = bands[index + 1];
      offset -= (next ? next.top : band.bottom) - band.top;
    } else {
      offset = bandOffset - (band.bottom - bottom) + growth;
    }
    adjusted.push({ ...band, offset: bandOffset, offsetAfter: offset, collapsed, growth: collapsed ? 0 : growth });
  });

  const mapY = (y: number): number => {
    let result = y;
    for (const band of adjusted) {
      if (y < band.top) break;
      if (y < band.bottom) {
        // inside a band: collapsed bands squash to their (shifted) top
        return band.collapsed ? band.top + band.offset : y + band.offset;
      }
      result = y + band.offsetAfter;
    }
    return result;
  };

  return { bands: adjusted, backgroundIds: Array.from(background), mapY };
}
