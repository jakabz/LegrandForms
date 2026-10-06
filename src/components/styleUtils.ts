import type * as React from 'react';
import type { ControlStyle } from '../nintex/model/controls';

/** Nintex control style → CSS (Rendszerterv §11.2). Rule formats are merged on top by the caller. */
export function toCss(style: ControlStyle): React.CSSProperties {
  const css: React.CSSProperties = {};
  if (style.bold) css.fontWeight = 'bold';
  if (style.italics) css.fontStyle = 'italic';
  const decorations: string[] = [];
  if (style.underline) decorations.push('underline');
  if (style.strikeThrough) decorations.push('line-through');
  if (decorations.length) css.textDecoration = decorations.join(' ');
  if (style.fontColor) css.color = style.fontColor;
  if (style.backgroundColor) css.backgroundColor = style.backgroundColor;
  if (style.fontSize) css.fontSize = style.fontSize;
  if (style.fontFamily) css.fontFamily = style.fontFamily;
  if (style.horizontalAlignment) css.textAlign = style.horizontalAlignment.toLowerCase() as React.CSSProperties['textAlign'];
  return css;
}

/** Border of the control box (`Border/LinePosition`). */
export function toBorderCss(style: ControlStyle): React.CSSProperties {
  const border = style.border;
  if (!border) return {};
  const value = `${border.width !== undefined ? border.width : 1}px ${(border.style || 'solid').toLowerCase()} ${border.color || '#000'}`;
  switch (border.linePosition.toLowerCase()) {
    case 'top':
      return { borderTop: value };
    case 'bottom':
      return { borderBottom: value };
    case 'left':
      return { borderLeft: value };
    case 'right':
      return { borderRight: value };
    default:
      return { border: value };
  }
}

/** Merges the static style with the rule style (rule properties win). */
export function mergeStyles(base: ControlStyle, rules: ControlStyle): ControlStyle {
  return { ...base, ...rules };
}
