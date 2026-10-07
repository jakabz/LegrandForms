import * as React from 'react';
import { scopeClassName, scopeCss } from '../nintex/css/cssScoper';
import { computeAbsoluteLayout } from '../nintex/layout/absoluteLayout';
import { computeResponsiveRows } from '../nintex/layout/responsiveLayout';
import type { LayoutDefinition } from '../nintex/model/FormDefinition';
import { useAnyStoreChange } from '../state/useControlState';
import { ControlHost } from './ControlHost';
import { useFormContext } from './FormContext';

export interface FormCanvasProps {
  layout: LayoutDefinition;
  collapseHiddenRows: boolean;
  responsiveBreakpoint: number;
  /** Leave out the layout background image (`hideImages`). */
  hideBackgroundImage?: boolean;
  /** Cleaned (unscoped) custom CSS of the content type; applied after the form CSS. */
  customCss?: string;
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement>): number {
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = (): void => setWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [ref]);
  return width;
}

/**
 * Lays out the controls like the Nintex canvas (absolute px, z-index) or, below the breakpoint, as a single
 * responsive column (Rendszerterv §10). The form CSS is cleaned at parse time and scoped here (§11.1); style mode,
 * custom CSS and removed images follow the configuration (§11.4).
 */
export const FormCanvas: React.FC<FormCanvasProps> = ({ layout, collapseHiddenRows, responsiveBreakpoint, hideBackgroundImage, customCss }) => {
  const { store, services, styleMode, isRemoved } = useFormContext();
  const fluent = styleMode === 'fluent';
  const version = useAnyStoreChange(store);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const [measured, setMeasured] = React.useState<Record<string, number>>({});

  const onMeasure = React.useCallback((controlId: string, height: number | undefined) => {
    setMeasured((previous) => {
      if (previous[controlId] === height) return previous;
      const next = { ...previous };
      if (height === undefined) delete next[controlId];
      else next[controlId] = height;
      return next;
    });
  }, []);

  // Fluent mode drops the form CSS of the export; the custom CSS always comes last so it wins at equal specificity.
  const scopedCss = React.useMemo(() => {
    const scope = scopeClassName(store.definition.id);
    return [fluent ? '' : scopeCss(store.definition.css, scope), scopeCss(customCss || '', scope)].filter((css) => !!css).join('\n');
  }, [store, fluent, customCss]);

  const isHidden = React.useCallback(
    (controlId: string): boolean => {
      const def = store.definition.controls[controlId];
      if (!def || isRemoved(controlId)) return true;
      if (def.type === 'Button' && !store.isButtonVisible(def)) return true;
      return store.getState(controlId).hidden;
    },
    // `version` changes whenever rule states change
    [store, isRemoved, version]
  );

  const responsive = width > 0 && width < responsiveBreakpoint;
  const backgroundImage = hideBackgroundImage ? undefined : layout.backgroundImageUrl;
  const backgroundStyle: React.CSSProperties = {
    backgroundColor: fluent ? undefined : layout.backgroundColor,
    backgroundImage: backgroundImage ? `url("${services.rewriteUrl(backgroundImage).replace(/"/g, '%22')}")` : undefined,
    backgroundRepeat: layout.backgroundImageRepeat ? layout.backgroundImageRepeat.toLowerCase().replace('norepeat', 'no-repeat') : undefined
  };

  let content: React.ReactNode;
  if (responsive) {
    const rows = computeResponsiveRows(layout, isHidden);
    content = (
      <div className="nf-form-canvas nf-responsive" style={backgroundStyle}>
        {rows.map((row) => (
          <div key={`${row.top}-${row.controlIds[0]}`} className="nf-responsive-row">
            {row.controlIds.map((id) => (
              <ControlHost key={id} controlId={id} />
            ))}
          </div>
        ))}
      </div>
    );
  } else {
    const result = computeAbsoluteLayout({ layout, isHidden, isRemoved, measuredHeights: measured, collapseHiddenRows });
    const percent = width > 0 && width < layout.width;
    content = (
      <div
        className="nf-form-canvas"
        style={{ ...backgroundStyle, position: 'relative', width: percent ? '100%' : layout.width, height: result.height, margin: '0 auto' }}
      >
        {result.boxes.map((box) => (
          <ControlHost
            key={box.controlId}
            controlId={box.controlId}
            box={box}
            layoutWidth={layout.width}
            percent={percent}
            height={measured[box.controlId] !== undefined ? Math.max(box.height, measured[box.controlId]) : box.height}
            onMeasure={onMeasure}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`nf-canvas-container ${layout.cssClass || ''}`}>
      {/* Cleaned (no expression(), @import, javascript:) and scoped to this form's root class. */}
      {scopedCss && <style>{scopedCss}</style>}
      {content}
    </div>
  );
};
