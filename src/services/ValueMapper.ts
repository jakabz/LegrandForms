import { isLookupValue, isPersonValue, isValidDate, toDate, toNumber, toText } from '../nintex/expression/values';
import type { ExprArrayItem, ExprValue, LookupValue, PersonValue } from '../nintex/expression/values';
import type { FieldSchema } from './FieldSchema';
import { isLookupField, isUserField, isWritableField } from './FieldSchema';

/** Expanded user value as returned by `$expand=Field&$select=Field/Id,Field/Title,Field/EMail,Field/Name`. */
interface RawUser {
  Id?: number;
  ID?: number;
  Title?: string;
  EMail?: string;
  Name?: string;
}

interface RawLookup {
  Id?: number;
  ID?: number;
  [field: string]: unknown;
}

function asArray(raw: unknown): unknown[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Array.isArray((raw as { results?: unknown[] }).results)) {
    return (raw as { results: unknown[] }).results;
  }
  return [raw];
}

function toPerson(raw: RawUser): PersonValue {
  const person: PersonValue = { kind: 'person', displayName: raw.Title || raw.EMail || raw.Name || '' };
  const id = raw.Id !== undefined ? raw.Id : raw.ID;
  if (id !== undefined) person.id = id;
  if (raw.Name) person.loginName = raw.Name;
  if (raw.EMail) person.email = raw.EMail;
  return person;
}

function toLookup(raw: RawLookup, displayField: string): LookupValue {
  const id = raw.Id !== undefined ? raw.Id : raw.ID;
  const title = raw[displayField];
  return { kind: 'lookup', id: id === undefined ? 0 : id, title: title === undefined || title === null ? '' : String(title) };
}

/**
 * SharePoint REST value → expression/form value (Rendszerterv §12.2). Used for the `{ItemProperty:X}` snapshot and
 * for the initial control values.
 */
export function fromSharePoint(field: FieldSchema, raw: unknown): ExprValue {
  if (raw === undefined || raw === null) {
    if (isUserField(field) || isLookupField(field) || field.type === 'MultiChoice') return [];
    return null;
  }
  switch (field.type) {
    case 'User':
    case 'UserMulti':
      return asArray(raw)
        .filter((u) => u && typeof u === 'object')
        .map((u) => toPerson(u as RawUser));
    case 'Lookup':
    case 'LookupMulti':
      return asArray(raw)
        .filter((l) => l && typeof l === 'object')
        .map((l) => toLookup(l as RawLookup, field.lookupField || 'Title'));
    case 'MultiChoice':
      return asArray(raw).map((c) => String(c));
    case 'DateTime': {
      const date = new Date(String(raw));
      return isNaN(date.getTime()) ? null : date;
    }
    case 'Number':
    case 'Currency':
    case 'Counter':
    case 'Integer':
      return typeof raw === 'number' ? raw : toNumber(String(raw));
    case 'Boolean':
      return raw === true || raw === 'true' || raw === 1 || raw === '1';
    case 'URL':
      return typeof raw === 'object' ? String((raw as { Url?: string }).Url || '') : String(raw);
    case 'TaxonomyFieldType':
    case 'TaxonomyFieldTypeMulti':
      return asArray(raw)
        .map((t) => (t && typeof t === 'object' ? String((t as { Label?: string }).Label || '') : String(t)))
        .join(';');
    default:
      return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  }
}

/** Expanded REST property name of an item field (`Author` → `Author`, `{Field}Id` handled at write time). */
export function selectClauseFor(field: FieldSchema): { select: string[]; expand: string[] } {
  if (isUserField(field)) {
    const f = field.internalName;
    return { select: [`${f}/Id`, `${f}/Title`, `${f}/EMail`, `${f}/Name`], expand: [f] };
  }
  if (isLookupField(field)) {
    const f = field.internalName;
    const display = field.lookupField || 'Title';
    return { select: [`${f}/Id`, `${f}/${display}`], expand: [f] };
  }
  return { select: [field.internalName], expand: [] };
}

export type EnsureUser = (person: PersonValue) => Promise<number>;

function items(value: ExprValue): ReadonlyArray<ExprArrayItem> {
  if (Array.isArray(value)) return value as ReadonlyArray<ExprArrayItem>;
  if (value === null || value === undefined || value === '') return [];
  return [toText(value)];
}

async function personIds(value: ExprValue, ensureUser: EnsureUser): Promise<number[]> {
  const ids: number[] = [];
  for (const item of items(value)) {
    if (isPersonValue(item)) {
      ids.push(item.id !== undefined && item.id > 0 ? item.id : await ensureUser(item));
    }
  }
  return ids;
}

function lookupIds(value: ExprValue): number[] {
  return items(value)
    .filter(isLookupValue)
    .map((l) => l.id)
    .filter((id) => id > 0);
}

/**
 * Form value → REST payload properties for one field. People values are resolved to site user ids (`ensureUser`
 * when the picker returned only a login name). Returns an empty object for read-only fields.
 */
export async function toSharePoint(field: FieldSchema, value: ExprValue, ensureUser: EnsureUser): Promise<Record<string, unknown>> {
  if (!isWritableField(field)) return {};
  const name = field.internalName;
  switch (field.type) {
    case 'User': {
      const ids = await personIds(value, ensureUser);
      return { [`${name}Id`]: ids.length ? ids[0] : null };
    }
    case 'UserMulti':
      return { [`${name}Id`]: await personIds(value, ensureUser) };
    case 'Lookup': {
      const ids = lookupIds(value);
      return { [`${name}Id`]: ids.length ? ids[0] : null };
    }
    case 'LookupMulti':
      return { [`${name}Id`]: lookupIds(value) };
    case 'MultiChoice':
      return { [name]: items(value).map((c) => toText(c as ExprValue)).filter((c) => c.length > 0) };
    case 'DateTime': {
      const date = isValidDate(value) ? value : toDate(value);
      return { [name]: date ? date.toISOString() : null };
    }
    case 'Number':
    case 'Currency':
    case 'Integer': {
      const text = toText(value).trim();
      if (!text) return { [name]: null };
      const n = typeof value === 'number' ? value : toNumber(text);
      return { [name]: isNaN(n) ? null : n };
    }
    case 'Boolean':
      return { [name]: value === true || toText(value).toLowerCase() === 'true' || toText(value) === '1' };
    case 'URL': {
      const url = toText(value).trim();
      return { [name]: url ? { Url: url, Description: url } : null };
    }
    default: {
      const text = toText(value);
      return { [name]: text === '' ? null : text };
    }
  }
}
