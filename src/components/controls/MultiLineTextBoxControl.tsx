import { TextField } from '@fluentui/react/lib/TextField';
import * as React from 'react';
import { toText } from '../../nintex/expression/values';
import type { MultiLineTextBoxControl as MultiLineDefinition } from '../../nintex/model/controls';
import { sanitizeHtml } from '../sanitize';
import { DisplayValue } from './DisplayValue';
import { LazyBoundary, LazyRichText } from './lazyPnpControls';
import type { IControlProps } from './types';

export const MultiLineTextBoxControl: React.FC<IControlProps<MultiLineDefinition>> = (props) => {
  const { def, value, onChange, mode, disabled, required, error, inputId, labelledBy, describedBy } = props;
  const text = toText(value);
  const html = React.useMemo(() => (def.isRichText ? sanitizeHtml(text) : ''), [def.isRichText, text]);

  if (def.isRichText && (mode === 'Display' || disabled)) {
    // Sanitized with DOMPurify (Rendszerterv §14).
    return <div id={inputId} className="nf-display-value nf-rich-text" aria-labelledby={labelledBy} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (mode === 'Display') {
    return <DisplayValue id={inputId} text={text} labelledBy={labelledBy} multiline />;
  }
  if (def.isRichText) {
    return (
      <div id={inputId} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={!!error}>
        <LazyBoundary>
          <LazyRichText
            value={text}
            isEditMode={true}
            onChange={(newValue: string) => {
              onChange(newValue);
              return newValue;
            }}
          />
        </LazyBoundary>
      </div>
    );
  }
  return (
    <TextField
      id={inputId}
      multiline
      autoAdjustHeight
      resizable={false}
      value={text}
      onChange={(e, newValue) => onChange(newValue || '')}
      disabled={disabled}
      required={required}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={!!error}
    />
  );
};
