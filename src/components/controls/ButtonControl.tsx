import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import * as React from 'react';
import type { ButtonControl as ButtonDefinition } from '../../nintex/model/controls';
import { useAnyStoreChange } from '../../state/useControlState';
import { useFormContext } from '../FormContext';
import type { IControlProps } from './types';

const SAVE_COMMANDS: ReadonlyArray<string> = ['Save', 'SaveAndSubmit', 'SaveAndContinue'];

export function buttonText(def: ButtonDefinition, mode: string, strings: INintexFormFormCustomizerStrings): string {
  if (mode === 'Display' && def.readOnlyText) return def.readOnlyText;
  if (def.text) return def.text;
  switch (def.command) {
    case 'Save':
      return strings.Save;
    case 'SaveAndSubmit':
      return strings.SaveAndSubmit;
    case 'Cancel':
      return mode === 'Display' ? strings.Close : strings.Cancel;
    default:
      return def.command;
  }
}

/** Save / SaveAndSubmit / Cancel. `ClientClick` script is never executed (logged as ScriptIgnored). */
export const ButtonControl: React.FC<IControlProps<ButtonDefinition>> = ({ def, mode, disabled }) => {
  const { store, strings, onCommand } = useFormContext();
  useAnyStoreChange(store); // re-render on busy changes
  const primary = SAVE_COMMANDS.indexOf(def.command) >= 0 && mode !== 'Display';
  const text = store.busy && primary ? strings.Saving : buttonText(def, mode, strings);
  const isDisabled = store.busy || (disabled && !(mode === 'Display' && (def.enabledWhenReadOnly || def.command === 'Cancel')));
  const Button = primary ? PrimaryButton : DefaultButton;
  return <Button className="nf-button" text={text} disabled={isDisabled} onClick={() => onCommand(def)} styles={{ root: { width: '100%', height: '100%' } }} />;
};
