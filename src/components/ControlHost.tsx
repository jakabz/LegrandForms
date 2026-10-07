import * as React from 'react';
import type { ControlDefinition } from '../nintex/model/controls';
import type { LayoutBox } from '../nintex/layout/absoluteLayout';
import { useControlState } from '../state/useControlState';
import { controlRegistry } from './controls/registry';
import { errorDomId, inputDomId, useFormContext } from './FormContext';
import { issueMessage } from './messages';
import { mergeStyles, toBorderCss, toCss } from './styleUtils';

export interface ControlHostProps {
  controlId: string;
  /** Absolute box; undefined in responsive mode. */
  box?: LayoutBox;
  /** Layout width, for percentage positioning when the canvas is narrower than the design. */
  layoutWidth?: number;
  /** Use percentage left/width (canvas narrower than the layout, above the responsive breakpoint). */
  percent?: boolean;
  /** Height including runtime growth (absolute mode). */
  height?: number;
  /** Reports the height the control needs (absolute mode, growable content). */
  onMeasure?(controlId: string, height: number | undefined): void;
}

/** True for controls whose content may need more space than the design box (inputs, labels, validation text). */
function measurable(def: ControlDefinition): boolean {
  return def.type !== 'Image' && def.type !== 'Button' && def.type !== 'Panel';
}

/**
 * Positions one control and applies Nintex classes, static + rule styles, hidden/disabled state and validation
 * messages (Rendszerterv §5.10). Re-renders only when this control's state changes.
 */
export const ControlHost: React.FC<ControlHostProps> = React.memo((props: ControlHostProps) => {
  const { controlId, box, layoutWidth, percent, height, onMeasure } = props;
  const ctx = useFormContext();
  const { store, strings, labelsByControl, showControlIds, styleMode, isRemoved } = ctx;
  const def = store.definition.controls[controlId];
  const { value, state, errors } = useControlState(store, controlId);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const lastReported = React.useRef<number | undefined>(undefined);
  const visible = !!def && !isRemoved(controlId) && !state.hidden && !(def.type === 'Button' && !store.isButtonVisible(def));

  // Report growth of the content (multi-line text, people, validation messages) so rows below move down.
  React.useEffect(() => {
    if (!visible || !box || !onMeasure || !def || !measurable(def)) return undefined;
    const content = contentRef.current;
    const inner = innerRef.current;
    if (!content || !inner) return undefined;
    const measure = (): void => {
      const chrome = (height || box.height) - inner.clientHeight;
      const needed = Math.ceil(content.scrollHeight + chrome);
      const report = needed > box.height + 1 ? needed : undefined;
      if (report !== lastReported.current) {
        lastReported.current = report;
        onMeasure(controlId, report);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(content);
    return () => observer.disconnect();
  }, [visible, box, height, onMeasure, controlId, def, errors.length]);

  React.useEffect(
    () => () => {
      if (onMeasure && lastReported.current !== undefined) onMeasure(controlId, undefined);
    },
    [onMeasure, controlId]
  );

  if (!def || !visible) return null;

  // Fluent mode keeps only the rule formats (they carry meaning, e.g. a red highlight), not the static XML look.
  const style = styleMode === 'fluent' ? state.style : mergeStyles(def.style, state.style);
  const classes = ['nf-filler-control', `nf-ctl-${def.type.toLowerCase()}`];
  if (def.cssClass) classes.push(def.cssClass);
  classes.push(...state.cssClasses);
  if (state.disabled) classes.push('nf-disabled');
  if (errors.length) classes.push('nf-invalid');

  const outerStyle: React.CSSProperties = box
    ? {
        position: 'absolute',
        left: percent && layoutWidth ? `${(box.left / layoutWidth) * 100}%` : box.left,
        top: box.top,
        width: percent && layoutWidth ? `${(box.width / layoutWidth) * 100}%` : box.width,
        height: height || box.height,
        zIndex: box.zIndex
      }
    : { position: 'relative', width: '100%' };

  const Component = controlRegistry[def.type];
  const labelledBy = (labelsByControl[controlId] || []).join(' ') || undefined;
  const firstError = errors.length ? issueMessage(errors[0], strings) : undefined;
  const contentClass = ['nf-control-content'];
  if ('controlCssClass' in def && def.controlCssClass) contentClass.push(def.controlCssClass);

  return (
    <div className={classes.join(' ')} style={outerStyle} data-control-id={controlId} data-control-name={def.name}>
      <div className="nf-filler-control-border" style={{ ...toBorderCss(style), backgroundColor: style.backgroundColor }}>
        <div ref={innerRef} className="nf-filler-control-inner" style={toCss({ ...style, backgroundColor: undefined })}>
          <div ref={contentRef} className={contentClass.join(' ')}>
            {def.type === 'Panel' && box
              ? box.children.map((child) => (
                  <ControlHost key={child.controlId} controlId={child.controlId} box={child} />
                ))
              : Component && (
                  <Component
                    def={def}
                    value={value}
                    onChange={(v: typeof value) => store.setValue(controlId, v)}
                    mode={store.mode}
                    disabled={state.disabled}
                    required={state.required}
                    error={firstError}
                    inputId={inputDomId(controlId)}
                    labelledBy={labelledBy}
                    describedBy={errors.length ? errorDomId(controlId) : undefined}
                  />
                )}
            {errors.length > 0 && (
              <div id={errorDomId(controlId)} className="nf-validation-error" role="alert">
                {errors.map((issue, index) => (
                  <div key={index}>{issueMessage(issue, strings)}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {showControlIds && (
        <span className="nf-debug-id" title={`${def.type} ${def.name || ''}`}>
          {controlId.substring(0, 8)}
        </span>
      )}
    </div>
  );
});
ControlHost.displayName = 'ControlHost';
