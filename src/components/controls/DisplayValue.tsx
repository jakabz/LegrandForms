import * as React from 'react';

/** Read-only rendering of a value (Display mode). */
export const DisplayValue: React.FC<{ id: string; text: string; labelledBy?: string; multiline?: boolean }> = ({
  id,
  text,
  labelledBy,
  multiline
}) => (
  <div id={id} className="nf-display-value" aria-labelledby={labelledBy} style={multiline ? { whiteSpace: 'pre-wrap' } : undefined}>
    {text}
  </div>
);
