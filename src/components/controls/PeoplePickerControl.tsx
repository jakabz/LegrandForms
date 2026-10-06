import type { IPersonaProps } from '@fluentui/react/lib/Persona';
import * as React from 'react';
import { isPersonValue, PersonValue } from '../../nintex/expression/values';
import type { PeoplePickerControl as PeoplePickerDefinition } from '../../nintex/model/controls';
import { useFormContext } from '../FormContext';
import { DisplayValue } from './DisplayValue';
import { LazyBoundary, LazyPeoplePicker, PNP_PRINCIPAL_TYPE } from './lazyPnpControls';
import type { IControlProps } from './types';

const PRINCIPALS: Record<string, number> = {
  user: PNP_PRINCIPAL_TYPE.User,
  dl: PNP_PRINCIPAL_TYPE.DistributionList,
  secgroup: PNP_PRINCIPAL_TYPE.SecurityGroup,
  spgroup: PNP_PRINCIPAL_TYPE.SharePointGroup
};

/** PnP people picker item → PersonValue. With `ensureUser`, `id` is the site user id. */
function toPerson(item: IPersonaProps & { loginName?: string; id?: string }): PersonValue {
  const id = item.id !== undefined ? parseInt(String(item.id), 10) : NaN;
  const person: PersonValue = { kind: 'person', displayName: item.text || item.secondaryText || '' };
  if (!isNaN(id)) person.id = id;
  if (item.loginName) person.loginName = item.loginName;
  if (item.secondaryText) person.email = item.secondaryText;
  return person;
}

export const PeoplePickerControl: React.FC<IControlProps<PeoplePickerDefinition>> = (props) => {
  const { def, value, onChange, mode, disabled, required, error, inputId, labelledBy, describedBy } = props;
  const { services, strings } = useFormContext();
  const people = Array.isArray(value) ? (value.filter(isPersonValue) as PersonValue[]) : [];

  if (mode === 'Display' || !services.peoplePickerContext) {
    return <DisplayValue id={inputId} text={people.map((p) => p.displayName).join('; ')} labelledBy={labelledBy} />;
  }
  const principalTypes = def.accountTypes.map((t) => PRINCIPALS[t.toLowerCase()]).filter((t) => t !== undefined);
  // Login names (claims) or e-mail addresses identify the preselected users.
  const selected = people.map((p) => p.loginName || p.email || p.displayName).filter((k) => !!k) as string[];

  return (
    <div id={inputId} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={!!error}>
      <LazyBoundary>
        <LazyPeoplePicker
          context={services.peoplePickerContext}
          webAbsoluteUrl={services.webAbsoluteUrl}
          groupName={def.sharePointGroup}
          personSelectionLimit={def.multiSelect ? Math.max(1, def.maximumEntities) : 1}
          principalTypes={principalTypes.length ? principalTypes : [PNP_PRINCIPAL_TYPE.User]}
          defaultSelectedUsers={selected}
          disabled={disabled}
          required={required}
          ensureUser={true}
          resolveDelay={300}
          placeholder={strings.PeoplePickerPlaceholder}
          onChange={(items: IPersonaProps[]) => onChange(items.map((item) => toPerson(item)))}
        />
      </LazyBoundary>
    </div>
  );
};
