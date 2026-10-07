import * as React from 'react';
import type { LookupValue } from '../nintex/expression/values';
import type { ButtonControl } from '../nintex/model/controls';
import type { StyleMode } from '../services/ConfigResolver';
import type { FormStore } from '../state/FormStore';

/** Data the controls need from SharePoint (implemented by SpDataService; faked in tests). */
export interface ILookupSource {
  getLookupItems(listTitle: string, field: string, webUrl?: string): Promise<LookupValue[]>;
}

export interface FormServices {
  lookups?: ILookupSource;
  /**
   * Context for the PnP PeoplePicker ({ absoluteUrl, msGraphClientFactory, spHttpClient }).
   * Typed loosely because the PnP controls depend on a different SPFx patch version.
   */
  peoplePickerContext?: unknown;
  /** Absolute URL of the current web. */
  webAbsoluteUrl: string;
  /** Applies the configured URL rewrites (on-prem → SPO). */
  rewriteUrl(url: string | undefined): string;
}

export interface FormContextValue {
  store: FormStore;
  strings: INintexFormFormCustomizerStrings;
  services: FormServices;
  /** controlId → ids of the labels associated with it (aria-labelledby). */
  labelsByControl: Record<string, string[]>;
  debug: boolean;
  /** "fluent": the static XML styles (colors, fonts, borders) are not applied (Rendszerterv §11.4). */
  styleMode: StyleMode;
  /** Controls left out by configuration (`hideImages`); they are not rendered at all. */
  isRemoved(controlId: string): boolean;
  showControlIds: boolean;
  /** Runs a button command (validation, confirmation, save/close). */
  onCommand(button: ButtonControl): void;
}

export const FormContext: React.Context<FormContextValue | undefined> = React.createContext<FormContextValue | undefined>(undefined);

export function useFormContext(): FormContextValue {
  const value = React.useContext(FormContext);
  if (!value) {
    throw new Error('useFormContext must be used inside <FormContext.Provider>');
  }
  return value;
}

/** DOM id of a control's input element. */
export function inputDomId(controlId: string): string {
  return `nf-input-${controlId}`;
}

/** DOM id of a label control. */
export function labelDomId(controlId: string): string {
  return `nf-label-${controlId}`;
}

/** DOM id of a control's error message. */
export function errorDomId(controlId: string): string {
  return `nf-error-${controlId}`;
}
