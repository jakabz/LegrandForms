import { TextField } from '@fluentui/react/lib/TextField';
import * as React from 'react';
import { toText } from '../../nintex/expression/values';
import type { TextBoxControl as TextBoxDefinition } from '../../nintex/model/controls';
import { DisplayValue } from './DisplayValue';
import type { IControlProps } from './types';

export const TextBoxControl: React.FC<IControlProps<TextBoxDefinition>> = (props) => {
  const { def, value, onChange, mode, disabled, required, error, inputId, labelledBy, describedBy } = props;
  const text = toText(value);
  if (mode === 'Display') {
    return <DisplayValue id={inputId} text={def.isPassword ? '••••••' : text} labelledBy={labelledBy} />;
  }
  const numeric = def.dataType === 'Double' || def.dataType === 'Integer' || def.dataType === 'Currency';
  return (
    <TextField
      id={inputId}
      value={text}
      onChange={(e, newValue) => onChange(newValue || '')}
      disabled={disabled}
      required={required}
      type={def.isPassword ? 'password' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      maxLength={def.maxLength}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={!!error}
      suffix={def.showAsPercent ? '%' : undefined}
      autoComplete="off"
    />
  );
};
