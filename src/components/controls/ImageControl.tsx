import * as React from 'react';
import type { ImageControl as ImageDefinition } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import type { IControlProps } from './types';

/** Static image; on-prem URLs are rewritten through `urlRewrites` (Rendszerterv §11.3). */
export const ImageControl: React.FC<IControlProps<ImageDefinition>> = ({ def }) => {
  const { services } = useFormContext();
  const src = services.rewriteUrl(def.imageUrl);
  if (!src) return null;
  return (
    <img
      className="nf-image"
      src={src}
      alt={def.alternateText || ''}
      style={{ width: def.horizontalWidth || '100%', height: def.verticalHeight || '100%', objectFit: 'contain', objectPosition: 'left top' }}
    />
  );
};
