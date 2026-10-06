import * as React from 'react';
import { formatDateValue } from '../../nintex/expression/functions/date';
import { isDateValue, isPersonValue, isLookupValue, toText } from '../../nintex/expression/values';
import type { ExprArrayItem, ExprValue } from '../../nintex/expression/values';
import type { CalculationControl as CalculationDefinition } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import type { IControlProps } from './types';

/** Display text of a calculated value: decimals, percent, thousand separator, prefix/suffix (Rendszerterv §6). */
export function formatCalculation(def: CalculationDefinition, value: ExprValue, locale: string): string {
  let text: string;
  if (value === null || value === undefined) {
    text = '';
  } else if (typeof value === 'number') {
    if (isNaN(value)) {
      text = '';
    } else {
      const n = def.showAsPercent ? value * 100 : value;
      text = new Intl.NumberFormat(locale, {
        minimumFractionDigits: def.decimals,
        maximumFractionDigits: def.decimals,
        useGrouping: def.showThousandSeparator
      }).format(n);
      if (def.showAsPercent) text += '%';
    }
  } else if (isDateValue(value)) {
    text = formatDateValue(value, locale.toLowerCase().indexOf('hu') === 0 ? 'yyyy. MM. dd.' : 'd', locale);
  } else if (Array.isArray(value)) {
    text = (value as ReadonlyArray<ExprArrayItem>)
      .map((item) => (isPersonValue(item) ? item.displayName : isLookupValue(item) ? item.title : String(item)))
      .join('; ');
  } else {
    text = toText(value);
  }
  if (!text) return '';
  return `${def.prefix || ''}${text}${def.suffix || ''}`;
}

export const CalculationControl: React.FC<IControlProps<CalculationDefinition>> = ({ def, value, inputId, labelledBy }) => {
  const { store } = useFormContext();
  return (
    <div id={inputId} className="nf-calculation-value" aria-labelledby={labelledBy} aria-live="polite">
      {formatCalculation(def, value, store.locale)}
    </div>
  );
};
