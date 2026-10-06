import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import * as React from 'react';
import type { ControlDefinition } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import { format } from '../messages';
import type { IControlProps } from './types';

/** Placeholder for control types the renderer does not implement; only visible in debug mode. */
export const UnsupportedControl: React.FC<IControlProps<ControlDefinition>> = ({ def }) => {
  const { debug, strings } = useFormContext();
  if (!debug) return null;
  return <MessageBar messageBarType={MessageBarType.warning}>{format(strings.UnsupportedControl, { type: def.rawType })}</MessageBar>;
};
