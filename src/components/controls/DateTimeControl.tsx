import { DatePicker, IDatePickerStrings } from '@fluentui/react/lib/DatePicker';
import { DayOfWeek } from '@fluentui/react/lib/DateTimeUtilities';
import * as React from 'react';
import { formatDateValue } from '../../nintex/expression/functions/date';
import { isValidDate, toDate } from '../../nintex/expression/values';
import type { DateTimeControl as DateTimeDefinition } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import { DisplayValue } from './DisplayValue';
import { LazyBoundary, LazyDateTimePicker, PNP_TIME_CONVENTION } from './lazyPnpControls';
import type { IControlProps } from './types';

const DATE_FORMAT: string = 'yyyy. MM. dd.';
const DATE_TIME_FORMAT: string = 'yyyy. MM. dd. HH:mm';

export const DateTimeControl: React.FC<IControlProps<DateTimeDefinition>> = (props) => {
  const { def, value, onChange, mode, disabled, required, error, inputId, labelledBy, describedBy } = props;
  const { strings, store } = useFormContext();
  const date = isValidDate(value) ? value : null;
  const hungarian = store.locale.toLowerCase().indexOf('hu') === 0;
  const format = (d: Date): string => formatDateValue(d, def.dateOnly ? (hungarian ? DATE_FORMAT : 'd') : hungarian ? DATE_TIME_FORMAT : 'g', store.locale);

  const pickerStrings: IDatePickerStrings = React.useMemo(
    () => ({
      months: strings.Months,
      shortMonths: strings.ShortMonths,
      days: strings.Days,
      shortDays: strings.ShortDays,
      goToToday: strings.GoToToday,
      prevMonthAriaLabel: strings.PrevMonth,
      nextMonthAriaLabel: strings.NextMonth,
      isRequiredErrorMessage: strings.Required,
      invalidInputErrorMessage: strings.Date
    }),
    [strings]
  );

  if (mode === 'Display') {
    return <DisplayValue id={inputId} text={date ? format(date) : ''} labelledBy={labelledBy} />;
  }

  if (!def.dateOnly) {
    return (
      <div id={inputId} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={!!error}>
        <LazyBoundary>
          <LazyDateTimePicker
            value={date || undefined}
            onChange={(d?: Date) => onChange(d || null)}
            disabled={disabled}
            timeConvention={hungarian ? PNP_TIME_CONVENTION.Hours24 : PNP_TIME_CONVENTION.Hours12}
            formatDate={(d: Date) => formatDateValue(d, hungarian ? DATE_FORMAT : 'd', store.locale)}
            showLabels={false}
            allowTextInput
            placeholder={strings.DatePlaceholder}
          />
        </LazyBoundary>
      </div>
    );
  }

  return (
    <DatePicker
      id={inputId}
      value={date || undefined}
      onSelectDate={(d) => onChange(d || null)}
      disabled={disabled}
      isRequired={required}
      allowTextInput
      formatDate={(d?: Date) => (d ? format(d) : '')}
      parseDateFromString={(text: string) => toDate(text) as Date}
      firstDayOfWeek={hungarian ? DayOfWeek.Monday : DayOfWeek.Sunday}
      strings={pickerStrings}
      placeholder={strings.DatePlaceholder}
      textField={{ 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': !!error }}
    />
  );
};
