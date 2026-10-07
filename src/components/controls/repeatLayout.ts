/** Grid style usable both as a React `style` and as a Fluent `styles` slot. */
export interface IRepeatLayoutStyle {
  display: string;
  gridTemplateColumns: string;
  gridTemplateRows?: string;
  gridAutoFlow?: string;
  columnGap?: string;
  rowGap: string;
}

/**
 * Grid for option lists honouring Nintex `RepeatColumns` / `RepeatDirection`:
 * Vertical fills column by column, Horizontal row by row.
 */
export function repeatLayoutStyle(count: number, columns: number, direction: string): IRepeatLayoutStyle {
  const cols = Math.max(1, Math.min(columns || 1, count || 1));
  if (cols === 1) return { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: '4px' };
  const style: IRepeatLayoutStyle = { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: '16px', rowGap: '4px' };
  if (direction !== 'Horizontal') {
    style.gridTemplateRows = `repeat(${Math.ceil(count / cols)}, auto)`;
    style.gridAutoFlow = 'column';
  }
  return style;
}
