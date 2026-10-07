import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { ChoiceGroup, IChoiceGroupOption } from '@fluentui/react/lib/ChoiceGroup';
import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import * as React from 'react';
import { isLookupValue, LookupValue } from '../../nintex/expression/values';
import type { LookupControl as LookupDefinition } from '../../nintex/model/controls';
import { isRadioDisplayFormat } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import { DisplayValue } from './DisplayValue';
import { repeatLayoutStyle } from './repeatLayout';
import type { IControlProps } from './types';

type LoadState = { status: 'idle' | 'loading' | 'ready' | 'error'; items: LookupValue[] };

const listBoxStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  height: '100%',
  minHeight: 32,
  overflowY: 'auto',
  padding: '4px 8px',
  border: '1px solid #8a8886',
  borderRadius: 2
};

/** SharePoint lookup bound to a source list referenced by title (K-06). Options load lazily. */
export const LookupControl: React.FC<IControlProps<LookupDefinition>> = (props) => {
  const { def, value, onChange, mode, disabled, required, error, inputId, labelledBy, describedBy } = props;
  const { services, strings } = useFormContext();
  const selected = Array.isArray(value) ? (value.filter(isLookupValue) as LookupValue[]) : [];
  const [state, setState] = React.useState<LoadState>({ status: 'idle', items: [] });
  const executes = mode === 'New' ? def.executeInNewMode : mode === 'Edit' ? def.executeInEditMode : def.executeInViewMode;
  const shouldLoad = mode !== 'Display' && !disabled && executes && !!services.lookups && !!def.lookupList;

  // The load runs once per source list; state.status must not be a dependency, otherwise the
  // 'loading' transition would run the cleanup and drop the result (stuck on "Loading…").
  const lookups = services.lookups;
  React.useEffect(() => {
    if (!shouldLoad || !lookups) return;
    let active = true;
    setState({ status: 'loading', items: [] });
    lookups
      .getLookupItems(def.lookupList, def.lookupField, def.lookupWeb)
      .then((items) => active && setState({ status: 'ready', items }))
      .catch(() => active && setState({ status: 'error', items: [] }));
    return () => {
      active = false;
    };
  }, [shouldLoad, lookups, def.lookupList, def.lookupField, def.lookupWeb]);

  if (mode === 'Display' || !shouldLoad) {
    return <DisplayValue id={inputId} text={selected.map((s) => s.title).join('; ')} labelledBy={labelledBy} />;
  }

  // Keep the current values selectable even before/without the option list.
  const items = state.items.slice();
  selected.forEach((s) => {
    if (!items.some((i) => i.id === s.id)) items.push(s);
  });
  const selectedKeys = selected.map((s) => s.id);
  const statusText = state.status === 'loading' ? strings.LookupLoading : state.status === 'error' ? strings.LookupLoadError : undefined;
  const aria = { 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': !!error };
  const grid = repeatLayoutStyle(items.length, def.repeatColumns, def.repeatDirection);

  if (def.allowMultipleValues) {
    // Multi-value lookup: a scrollable checkbox list filling the control box (Nintex MultiSelect).
    return (
      <div id={inputId} role="group" className="nf-lookup-multi" style={listBoxStyle} {...aria}>
        {statusText && <span>{statusText}</span>}
        <div style={grid}>
          {items.map((item) => (
            <Checkbox
              key={item.id}
              label={item.title}
              checked={selectedKeys.indexOf(item.id) >= 0}
              disabled={disabled}
              onChange={(e, checked) => onChange(checked ? selected.concat([item]) : selected.filter((s) => s.id !== item.id))}
            />
          ))}
        </div>
      </div>
    );
  }
  if (isRadioDisplayFormat(def.displayFormat) || isRadioDisplayFormat(def.singleDisplayMode)) {
    const radioOptions: IChoiceGroupOption[] = items.map((i) => ({ key: String(i.id), text: i.title }));
    return (
      <div id={inputId} className="nf-lookup-radio" {...aria}>
        {statusText && <span>{statusText}</span>}
        <ChoiceGroup
          options={radioOptions}
          selectedKey={selectedKeys.length ? String(selectedKeys[0]) : null}
          disabled={disabled}
          required={required}
          onChange={(e, option) => {
            const item = option && items.find((i) => String(i.id) === option.key);
            if (item) onChange([item]);
          }}
          styles={{ flexContainer: grid }}
        />
      </div>
    );
  }
  const options: IDropdownOption[] = items.map((i) => ({ key: i.id, text: i.title, data: i }));
  return (
    <Dropdown
      id={inputId}
      options={options}
      disabled={disabled}
      required={required}
      placeholder={statusText || strings.SelectPlaceholder}
      selectedKey={selectedKeys.length ? selectedKeys[0] : null}
      onChange={(e, option) => option && onChange([option.data as LookupValue])}
      {...aria}
    />
  );
};
