import * as React from 'react';
import type { LabelControl as LabelDefinition } from '../../nintex/model/controls';
import { inputDomId, labelDomId, useFormContext } from '../FormContext';
import { sanitizeHtml } from '../sanitize';
import type { IControlProps } from './types';

/** Rich text label. Rendered as <label for> when associated with an input control (AssociatedControl). */
export const LabelControl: React.FC<IControlProps<LabelDefinition>> = ({ def }) => {
  const { store } = useFormContext();
  const html = React.useMemo(() => sanitizeHtml(def.text), [def.text]);
  const target = def.associatedControlId ? store.definition.controls[def.associatedControlId] : undefined;
  const props = {
    id: labelDomId(def.id),
    className: 'nf-label-control',
    // Sanitized with DOMPurify (Rendszerterv §14).
    dangerouslySetInnerHTML: { __html: html }
  };
  if (target && target.type !== 'Attachment' && target.type !== 'Calculation') {
    return <label htmlFor={inputDomId(target.id)} {...props} />;
  }
  return <div {...props} />;
};
