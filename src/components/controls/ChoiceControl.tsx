import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';
import { ComboBox, IComboBoxOption } from '@fluentui/react/lib/ComboBox';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { TextField } from '@fluentui/react/lib/TextField';
import * as React from 'react';
import { evaluateValueSource } from '../../nintex/expression/valueSource';
import { toText } from '../../nintex/expression/values';
import type { ExprValue } from '../../nintex/expression/values';
import type { ChoiceControl as ChoiceDefinition } from '../../nintex/model/controls';
import { getListFieldName } from '../../nintex/model/controls';
import { isMultiChoice } from '../../state/controlValues';
import { useFormContext } from '../FormContext';
import { DisplayValue } from './DisplayValue';
import type { IControlProps } from './types';

function textsOf(value: ExprValue): string[] {
  if (Array.isArray(value)) return value.map((v) => toText(v as ExprValue)).filter((t) => t.length > 0);
  const text = toText(value);
  return text ? [text] : [];
}

/** Resolves the choices: literals, or tokens such as {ItemProperty:AuditOrg} (multi-values become one choice each). */
function useChoices(def: ChoiceDefinition): string[] {
  const { store } = useFormContext();
  return React.useMemo(() => {
    const result: string[] = [];
    const add = (text: string): void => {
      if (text && result.indexOf(text) < 0) result.push(text);
    };
    def.choices.forEach((choice) => {
      const evaluated = evaluateValueSource(choice, store.engine.context);
      if (Array.isArray(evaluated)) evaluated.forEach((v) => add(toText(v as ExprValue)));
      else add(toText(evaluated));
    });
    if (!result.length) {
      const fieldName = getListFieldName(def);
      const field = fieldName ? store.fields[fieldName] : undefined;
      if (field) field.choices.forEach(add);
    }
    return result;
  }, [def, store]);
}

export const ChoiceControl: React.FC<IControlProps<ChoiceDefinition>> = (props) => {
  const { def, value, onChange, mode, disabled, required, error, inputId, labelledBy, describedBy } = props;
  const { store, strings } = useFormContext();
  const fieldName = getListFieldName(def);
  const multi = isMultiChoice(def, fieldName ? store.fields[fieldName] : undefined);
  const choices = useChoices(def);
  const selected = textsOf(value);
  // Values that are not among the choices (fill-in values, legacy data) stay selectable.
  const all = choices.concat(selected.filter((s) => choices.indexOf(s) < 0));

  if (mode === 'Display') {
    return <DisplayValue id={inputId} text={selected.join('; ')} labelledBy={labelledBy} />;
  }
  const common = { 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': !!error };
  const format = def.displayFormat;

  if (multi && format === 'CheckBoxes') {
    return (
      <div id={inputId} role="group" className="nf-choice-checkboxes" {...common}>
        {all.map((choice) => (
          <Checkbox
            key={choice}
            label={choice}
            checked={selected.indexOf(choice) >= 0}
            disabled={disabled}
            onChange={(e, checked) => onChange(checked ? selected.concat([choice]) : selected.filter((s) => s !== choice))}
            styles={{ root: { marginBottom: 4 } }}
          />
        ))}
      </div>
    );
  }

  if (multi) {
    const options: IDropdownOption[] = all.map((c) => ({ key: c, text: c }));
    return (
      <Dropdown
        id={inputId}
        multiSelect
        options={options}
        selectedKeys={selected}
        disabled={disabled}
        required={required}
        placeholder={def.pleaseSelectText || strings.SelectPlaceholder}
        onChange={(e, option) => {
          if (!option) return;
          const key = String(option.key);
          onChange(option.selected ? selected.concat([key]) : selected.filter((s) => s !== key));
        }}
        {...common}
      />
    );
  }

  const current = selected.length ? selected[0] : '';
  if (format === 'OptionButtons' || format === 'RadioButtons') {
    const options: IChoiceGroupOption[] = all.map((c) => ({ key: c, text: c }));
    const isOwnValue = !!current && choices.indexOf(current) < 0;
    return (
      <div id={inputId} {...common}>
        <ChoiceGroup
          options={options}
          selectedKey={isOwnValue ? undefined : current || undefined}
          disabled={disabled}
          required={required}
          onChange={(e, option) => option && onChange(String(option.key))}
        />
        {def.fillInChoice && (
          <TextField
            label={def.specifyValueText || strings.SpecifyOwnValue}
            value={isOwnValue ? current : ''}
            disabled={disabled}
            onChange={(e, v) => onChange(v || '')}
          />
        )}
      </div>
    );
  }

  if (def.fillInChoice) {
    const options: IComboBoxOption[] = all.map((c) => ({ key: c, text: c }));
    return (
      <ComboBox
        id={inputId}
        allowFreeform
        autoComplete="on"
        options={options}
        text={current}
        selectedKey={choices.indexOf(current) >= 0 ? current : null}
        disabled={disabled}
        required={required}
        placeholder={def.pleaseSelectText || strings.SelectPlaceholder}
        onChange={(e, option, index, text) => onChange(option ? String(option.key) : text || '')}
        {...common}
      />
    );
  }

  const options: IDropdownOption[] = (required ? [] : [{ key: '', text: strings.EmptyOption }]).concat(all.map((c) => ({ key: c, text: c })));
  return (
    <Dropdown
      id={inputId}
      options={options}
      selectedKey={current}
      disabled={disabled}
      required={required}
      placeholder={def.pleaseSelectText || strings.SelectPlaceholder}
      onChange={(e, option) => option && onChange(String(option.key))}
      {...common}
    />
  );
};
