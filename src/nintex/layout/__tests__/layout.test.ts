import type { LayoutDefinition, LayoutItem } from '../../model/FormDefinition';
import { createTestStore } from '../../__tests__/helpers/testStore';
import { parseSample } from '../../__tests__/helpers/samples';
import { computeAbsoluteLayout } from '../absoluteLayout';
import { buildBands, computeCollapse, findBackgroundItems } from '../collapse';
import { computeResponsiveRows } from '../responsiveLayout';

function item(controlId: string, left: number, top: number, width: number, height: number, zIndex: number = 100): LayoutItem {
  return { controlId, left, top, width, height, zIndex, children: [] };
}

function layoutOf(items: LayoutItem[], height: number = 400): LayoutDefinition {
  return { name: 'Desktop', width: 700, height, isMobileAppLayout: false, style: {}, items };
}

/** label/input rows: r1 [0,50), r2 [50,100), r3 [120,170) */
const ROWS: LayoutItem[] = [
  item('l1', 0, 0, 200, 50),
  item('i1', 200, 0, 500, 50),
  item('l2', 0, 50, 200, 50),
  item('i2', 200, 50, 500, 50),
  item('l3', 0, 120, 200, 50),
  item('i3', 200, 120, 500, 50)
];

const topsOf = (boxes: { controlId: string; top: number }[]): Record<string, number> =>
  boxes.reduce<Record<string, number>>((acc, b) => ({ ...acc, [b.controlId]: b.top }), {});

describe('bands', () => {
  it('touching items form separate bands; overlapping ones merge', () => {
    expect(buildBands(ROWS).map((b) => [b.top, b.bottom])).toEqual([
      [0, 50],
      [50, 100],
      [120, 170]
    ]);
    expect(buildBands([item('a', 0, 0, 10, 60), item('b', 0, 50, 10, 20)]).map((b) => [b.top, b.bottom])).toEqual([[0, 70]]);
  });

  it('detects background rectangles covering ≥ 2 items', () => {
    expect(Array.from(findBackgroundItems([item('bg', 0, 0, 700, 300, 95), ...ROWS]))).toEqual(['bg']);
    expect(Array.from(findBackgroundItems(ROWS))).toEqual([]);
  });
});

describe('computeAbsoluteLayout', () => {
  it('keeps design positions when nothing is hidden', () => {
    const result = computeAbsoluteLayout({ layout: layoutOf(ROWS), isHidden: () => false, collapseHiddenRows: true });
    expect(topsOf(result.boxes)).toEqual({ l1: 0, i1: 0, l2: 50, i2: 50, l3: 120, i3: 120 });
    expect(result.height).toBe(400);
  });

  it('collapses a fully hidden band (including the gap below it)', () => {
    const hidden = new Set(['l2', 'i2']);
    const result = computeAbsoluteLayout({ layout: layoutOf(ROWS), isHidden: (id) => hidden.has(id), collapseHiddenRows: true });
    expect(topsOf(result.boxes)).toEqual(expect.objectContaining({ l1: 0, l3: 50, i3: 50 }));
    expect(result.height).toBe(330);
  });

  it('does not collapse when the option is off or the band is partly visible', () => {
    const off = computeAbsoluteLayout({ layout: layoutOf(ROWS), isHidden: (id) => id === 'l2' || id === 'i2', collapseHiddenRows: false });
    expect(topsOf(off.boxes).l3).toBe(120);
    const partial = computeAbsoluteLayout({ layout: layoutOf(ROWS), isHidden: (id) => id === 'l2', collapseHiddenRows: true });
    expect(topsOf(partial.boxes).l3).toBe(120);
  });

  it('pushes rows down when a control grows at runtime', () => {
    const result = computeAbsoluteLayout({
      layout: layoutOf(ROWS),
      isHidden: () => false,
      measuredHeights: { i2: 90, i1: 30 },
      collapseHiddenRows: true
    });
    expect(topsOf(result.boxes)).toEqual(expect.objectContaining({ l3: 160, i3: 160 }));
    expect(result.height).toBe(440);
  });

  it('stretches background rectangles with the rows they cover', () => {
    const items = [item('bg', 0, 40, 700, 140, 95), ...ROWS];
    const result = computeAbsoluteLayout({ layout: layoutOf(items), isHidden: (id) => id === 'l2' || id === 'i2', collapseHiddenRows: true });
    const bg = result.boxes.filter((b) => b.controlId === 'bg')[0];
    // bg covered [40,180); the band [50,120) collapsed (−70)
    expect([bg.top, bg.height]).toEqual([40, 70]);
    expect(result.boxes[0].controlId).toBe('bg'); // lowest z-index first
  });

  it('mapY maps positions inside and between bands', () => {
    const collapse = computeCollapse({ items: ROWS, isHidden: (id) => id === 'l1' || id === 'i1', collapseHiddenRows: true });
    expect(collapse.mapY(25)).toBe(0);
    expect(collapse.mapY(60)).toBe(10);
    expect(collapse.mapY(110)).toBe(60);
  });
});

describe('AJForm layout (K-09)', () => {
  const def = parseSample('AJForm.xml');
  const layout = def.layouts[0];

  it('toggling the overlapping "Készítette" controls never shifts rows', () => {
    const newStore = createTestStore(def, { mode: 'New' });
    const editStore = createTestStore(def, { mode: 'Edit', item: { DocCreatedBy: [], Author: [] } });
    const run = (store: typeof newStore): Record<string, number> =>
      topsOf(computeAbsoluteLayout({ layout, isHidden: (id) => store.ruleState(id).hidden, collapseHiddenRows: true }).boxes);
    const newTops = run(newStore);
    const editTops = run(editStore);
    const rowBelow = layout.items.filter((i) => i.top > 700 && i.top < 850).map((i) => i.controlId);
    expect(rowBelow.length).toBeGreaterThan(0);
    rowBelow.forEach((id) => expect(newTops[id]).toBe(editTops[id]));
  });

  it('the large low z-index label is treated as background', () => {
    const background = findBackgroundItems(layout.items);
    const bg = layout.items.filter((i) => background.has(i.controlId));
    expect(bg.map((i) => [i.top, i.height, i.zIndex])).toContainEqual([890, 295, 95]);
  });
});

describe('computeResponsiveRows', () => {
  it('orders rows by top, items by left, omits hidden controls', () => {
    const rows = computeResponsiveRows(layoutOf([ROWS[1], ROWS[0], ...ROWS.slice(2)]), (id) => id === 'i3');
    expect(rows.map((r) => r.controlIds)).toEqual([['l1', 'i1'], ['l2', 'i2'], ['l3']]);
  });

  it('puts background rectangles in their own row before the rows they cover', () => {
    const rows = computeResponsiveRows(layoutOf([item('bg', 0, 50, 700, 120, 95), ...ROWS]), () => false);
    expect(rows.map((r) => r.controlIds)).toEqual([['l1', 'i1'], ['bg'], ['l2', 'i2'], ['l3', 'i3']]);
  });
});
