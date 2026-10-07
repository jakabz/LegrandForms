import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { FormDisplayMode, Log } from '@microsoft/sp-core-library';
import { BaseFormCustomizer } from '@microsoft/sp-listview-extensibility';
import { spfi, SPFx } from '@pnp/sp';
import * as strings from 'NintexFormFormCustomizerStrings';

import { FormServices } from '../../components/FormContext';
import NintexForm, { INintexFormProps, NintexFormState } from '../../components/NintexForm';
import type { FormMode } from '../../nintex/expression/context';
import { INintexFormProperties, resolveConfig } from '../../services/ConfigResolver';
import { FormDefinitionLoadError, FormDefinitionProvider, IKeyValueStorage } from '../../services/FormDefinitionProvider';
import { createDiagnostic } from '../../nintex/model/Diagnostic';
import { loadCustomCss } from '../../services/CustomCssLoader';
import { ItemPersistence } from '../../services/ItemPersistence';
import { SpDataService } from '../../services/SpDataService';
import { rewriteUrl } from '../../services/urlRewriter';
import { loadFormSession } from '../../state/loadFormSession';

/** Set by the SPFx webpack configuration (true in debug builds). */
declare const DEBUG: boolean;

const LOG_SOURCE: string = 'NintexFormFormCustomizer';

/** ClientSideComponentProperties of the content type (see ConfigResolver / Fejlesztői leírás §8.3). */
export type INintexFormFormCustomizerProperties = INintexFormProperties;

function toFormMode(mode: FormDisplayMode): FormMode {
  switch (mode) {
    case FormDisplayMode.New:
      return 'New';
    case FormDisplayMode.Edit:
      return 'Edit';
    default:
      return 'Display';
  }
}

function sessionStorageOrUndefined(): IKeyValueStorage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Generic form customizer that renders list forms from Nintex Forms (classic) XML exports.
 * No form-specific code: everything comes from the XML referenced by `formDefinitionUrl`.
 */
export default class NintexFormFormCustomizer extends BaseFormCustomizer<INintexFormFormCustomizerProperties> {
  private _state: NintexFormState = { kind: 'loading' };
  private _services: FormServices = { webAbsoluteUrl: '', rewriteUrl: (url) => url || '' };

  public async onInit(): Promise<void> {
    await super.onInit();
    const debugBuild = typeof DEBUG !== 'undefined' && DEBUG;
    const resolution = resolveConfig(this.properties, window.location.search, debugBuild);
    if (!resolution.config) {
      this._state = { kind: 'error', message: (strings.LoadErrorConfig || '{message}').replace('{message}', resolution.error || '') };
      Log.warn(LOG_SOURCE, resolution.error || 'Invalid configuration');
      return;
    }
    const config = resolution.config;
    const web = this.context.pageContext.web;
    const origin = window.location.origin;
    const sp = spfi().using(SPFx(this.context));
    const data = new SpDataService(sp, this.context.list.guid.toString());

    this._services = {
      lookups: data,
      peoplePickerContext: {
        absoluteUrl: web.absoluteUrl,
        msGraphClientFactory: this.context.msGraphClientFactory,
        spHttpClient: this.context.spHttpClient
      },
      webAbsoluteUrl: web.absoluteUrl,
      rewriteUrl: (url) => rewriteUrl(url, config.urlRewrites, origin)
    };

    // The custom CSS is optional: a missing file must not block the form (diagnostic only).
    const customCssUrl = config.customCssUrl;
    const customCss: Promise<{ css: string; error?: string }> = customCssUrl
      ? loadCustomCss(data, customCssUrl).then(
          (css) => ({ css }),
          (e: Error) => ({ css: '', error: e.message })
        )
      : Promise.resolve({ css: '' });

    try {
      const sessionPromise = loadFormSession({
        definitionUrl: config.formDefinitionUrl,
        provider: new FormDefinitionProvider(data, sessionStorageOrUndefined(), { freeze: debugBuild }),
        data,
        persistence: new ItemPersistence(data),
        mode: toFormMode(this.displayMode),
        itemId: this.context.itemId,
        locale: this.context.pageContext.cultureInfo.currentUICultureName || 'hu-HU',
        debug: config.debug
      });
      const [store, css] = await Promise.all([sessionPromise, customCss]);
      if (css.error !== undefined) {
        Log.warn(LOG_SOURCE, `Custom CSS cannot be loaded: ${customCssUrl} (${css.error})`);
        store.addDiagnostic(createDiagnostic('warn', 'CustomCssError', `The custom CSS cannot be loaded: ${customCssUrl} (${css.error})`));
      }
      this._state = { kind: 'ready', store, config, customCss: css.css };
      if (config.debug) {
        store.diagnostics.forEach((d) => Log.verbose(LOG_SOURCE, `${d.level} ${d.code}: ${d.message}`));
      }
    } catch (e) {
      const error = e as Error;
      Log.error(LOG_SOURCE, error);
      this._state = {
        kind: 'error',
        message: error.message,
        diagnostics: e instanceof FormDefinitionLoadError ? e.diagnostics : undefined
      };
    }
  }

  public render(): void {
    const element: React.ReactElement<INintexFormProps> = React.createElement(NintexForm, {
      state: this._state,
      strings,
      services: this._services,
      listUrl: this.context.list.serverRelativeUrl,
      onSaved: this._onSaved,
      onClosed: this._onClosed
    });
    ReactDOM.render(element, this.domElement);
  }

  public onDispose(): void {
    ReactDOM.unmountComponentAtNode(this.domElement);
    super.onDispose();
  }

  private _onSaved = (): void => {
    // Must be called after a successful save.
    this.formSaved();
  };

  private _onClosed = (): void => {
    this.formClosed();
  };
}
