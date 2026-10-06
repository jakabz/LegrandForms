import { Dropdown, IDropdownOption } from '@fluentui/react/lib/Dropdown';
import * as React from 'react';
import { isLookupValue, LookupValue } from '../../nintex/expression/values';
import type { LookupControl as LookupDefinition } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import { DisplayValue } from './DisplayValue';
import type { IControlProps } from './types';

type LoadState = { status: 'idle' | 'loading' | 'ready' | 'error'; items: LookupValue[] };

/** SharePoint lookup bound to a source list referenced by title (K-06). Options load lazily. */
export const LookupControl: React.FC<IControlProps<LookupDefinition>> = (props) => {
  const { def, value, onChange, mode, disabled, required, error, inputId, labelledBy, describedBy } = props;
  const { services, strings } = useFormContext();
  const selected = Array.isArray(value) ? (value.filter(isLookupValue) as LookupValue[]) : [];
  const [state, setState] = React.useState<LoadState>({ status: 'idle', items: [] });
  const executes = mode === 'New' ? def.executeInNewMode : mode === 'Edit' ? def.executeInEditMode : def.executeInViewMode;
  const shouldLoad = mode !== 'Display' && !disabled && executes && !!services.lookups && !!def.lookupList;

  React.useEffect(() => {
    if (!shouldLoad || state.status !== 'idle' || !services.lookups) return;
    let active = true;
    setState({ status: 'loading', items: [] });
    services.lookups
      .getLookupItems(def.lookupList, def.lookupField, def.lookupWeb)
      .then((items) => active && setState({ status: 'ready', items }))
      .catch(() => active && setState({ status: 'error', items: [] }));
    return () => {
      active = false;
    };
  }, [shouldLoad, def, services.lookups, state.status]);

  if (mode === 'Display' || !shouldLoad) {
    return <DisplayValue id={inputId} text={selected.map((s) => s.title).join('; ')} labelledBy={labelledBy} />;
  }

  // Keep the current values selectable even before/without the option list.
  const items = state.items.slice();
  selected.forEach((s) => {
    if (!items.some((i) => i.id === s.id)) items.push(s);
  });
  const options: IDropdownOption[] = items.map((i) => ({ key: i.id, text: i.title, data: i }));
  const selectedKeys = selected.map((s) => s.id);
  const placeholder = state.status === 'loading' ? strings.LookupLoading : state.status === 'error' ? strings.LookupLoadError : strings.SelectPlaceholder;
  const common = { id: inputId, options, disabled, required, placeholder, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy, 'aria-invalid': !!error };

  if (def.allowMultipleValues) {
    return (
      <Dropdown
        {...common}
        multiSelect
        selectedKeys={selectedKeys}
        onChange={(e, option) => {
          if (!option) return;
          const item = option.data as LookupValue;
          onChange(option.selected ? selected.concat([item]) : selected.filter((s) => s.id !== item.id));
        }}
      />
    );
  }
  return (
    <Dropdown
      {...common}
      selectedKey={selectedKeys.length ? selectedKeys[0] : null}
      onChange={(e, option) => option && onChange([option.data as LookupValue])}
    />
  );
};
