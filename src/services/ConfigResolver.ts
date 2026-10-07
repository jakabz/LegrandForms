/**
 * `ClientSideComponentProperties` of the form customizer (per content type), Rendszerterv §5.2.
 */
export interface INintexFormProperties {
  /** Server-relative URL of the Nintex XML export. */
  formDefinitionUrl: string;
  /** Layout to render (DeviceName); default "Desktop". */
  layoutName?: string;
  /** Below this container width (px) the form is rendered as a single responsive column; default 640. */
  responsiveBreakpoint?: number;
  /** Collapse rows whose controls are all hidden; default true (K-04). */
  collapseHiddenRows?: boolean;
  /** On-prem → SPO URL prefix rewrites, e.g. { "http://old/sites/": "https://tenant.sharepoint.com/sites/" }. */
  urlRewrites?: Record<string, string>;
  /** Whether EmptyRule diagnostics are shown in the diagnostics panel; default "warn". */
  emptyRuleBehavior?: 'ignore' | 'warn';
  /** Diagnostics panel, rule trace and control id overlay. */
  debug?: boolean;
  /**
   * "fluent" (default): only the layout comes from the XML; colors, fonts, borders and the form CSS are replaced
   * by the SharePoint (Fluent) theme. "nintex": Nintex-faithful look (Rendszerterv §11.4).
   */
  styleMode?: StyleMode;
  /** Server-relative URL of a CSS file applied after the form CSS (scoped to the form). */
  customCssUrl?: string;
  /** Leave out Image controls and the layout background image; default true in "fluent", false in "nintex". */
  hideImages?: boolean;
}

export type StyleMode = 'fluent' | 'nintex';

export interface ResolvedConfig {
  formDefinitionUrl: string;
  layoutName: string;
  responsiveBreakpoint: number;
  collapseHiddenRows: boolean;
  urlRewrites: Record<string, string>;
  emptyRuleBehavior: 'ignore' | 'warn';
  debug: boolean;
  styleMode: StyleMode;
  /** Empty when not configured. */
  customCssUrl: string;
  hideImages: boolean;
}

export interface ConfigResolution {
  config?: ResolvedConfig;
  /** Problem with the configuration (e.g. missing formDefinitionUrl). */
  error?: string;
}

export const DEFAULT_RESPONSIVE_BREAKPOINT: number = 640;

function parseQuery(search: string): Record<string, string> {
  const result: Record<string, string> = {};
  search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => pair.length > 0)
    .forEach((pair) => {
      const index = pair.indexOf('=');
      const key = decodeURIComponent(index >= 0 ? pair.substring(0, index) : pair);
      const value = index >= 0 ? decodeURIComponent(pair.substring(index + 1).replace(/\+/g, ' ')) : '';
      result[key.toLowerCase()] = value;
    });
  return result;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  Object.keys(value as Record<string, unknown>).forEach((key) => {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry === 'string') result[key] = entry;
  });
  return result;
}

/**
 * Resolves the customizer configuration. Sources (priority order): ClientSideComponentProperties, then — only when
 * `allowUrlOverrides` (debug builds) — the query string `?nfDef=<url>`, `?nfDebug=1` and `?nfCss=<url>`.
 * The harmless look switches `?nfStyle=nintex|fluent` and `?nfHideImages=0|1` also work when `debug` is configured,
 * so the two looks can be compared on the tenant.
 */
export function resolveConfig(
  properties: Partial<INintexFormProperties> | string | undefined,
  search: string,
  allowUrlOverrides: boolean
): ConfigResolution {
  let props: Partial<INintexFormProperties> = {};
  if (typeof properties === 'string') {
    try {
      props = properties.trim() ? JSON.parse(properties) : {};
    } catch (e) {
      return { error: `ClientSideComponentProperties is not valid JSON: ${(e as Error).message}` };
    }
  } else if (properties) {
    props = properties;
  }

  const query = allowUrlOverrides ? parseQuery(search) : {};
  const formDefinitionUrl = (query.nfdef || props.formDefinitionUrl || '').trim();
  if (!formDefinitionUrl) {
    return { error: 'formDefinitionUrl is not configured for this content type' };
  }
  const breakpoint = Number(props.responsiveBreakpoint);
  const lookQuery = allowUrlOverrides || asBoolean(props.debug, false) ? parseQuery(search) : {};
  const styleSource = (lookQuery.nfstyle !== undefined ? lookQuery.nfstyle : String(props.styleMode || '')).trim().toLowerCase();
  const styleMode: StyleMode = styleSource === 'nintex' ? 'nintex' : 'fluent';
  const hideImages = asBoolean(lookQuery.nfhideimages !== undefined ? lookQuery.nfhideimages : props.hideImages, styleMode === 'fluent');
  return {
    config: {
      formDefinitionUrl,
      layoutName: (props.layoutName || 'Desktop').trim(),
      responsiveBreakpoint: breakpoint > 0 ? breakpoint : DEFAULT_RESPONSIVE_BREAKPOINT,
      collapseHiddenRows: asBoolean(props.collapseHiddenRows, true),
      urlRewrites: asRecord(props.urlRewrites),
      emptyRuleBehavior: props.emptyRuleBehavior === 'ignore' ? 'ignore' : 'warn',
      debug: query.nfdebug !== undefined ? asBoolean(query.nfdebug, true) : asBoolean(props.debug, false),
      styleMode,
      customCssUrl: (query.nfcss !== undefined ? query.nfcss : typeof props.customCssUrl === 'string' ? props.customCssUrl : '').trim(),
      hideImages
    }
  };
}
