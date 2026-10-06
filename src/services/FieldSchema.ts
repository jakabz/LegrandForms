/** The subset of a SharePoint field definition the form needs (from `lists/fields`). */
export interface FieldSchema {
  internalName: string;
  title: string;
  /** `TypeAsString`: Text, Note, Number, Currency, Choice, MultiChoice, DateTime, User, UserMulti, Lookup, … */
  type: string;
  readOnly: boolean;
  required: boolean;
  choices: string[];
  /** Lookup target list id (guid) for Lookup fields. */
  lookupListId?: string;
  /** Lookup display field internal name. */
  lookupField?: string;
  allowMultipleValues: boolean;
  richText: boolean;
  /** DateTime: date only (DisplayFormat 0). */
  dateOnly: boolean;
  defaultValue?: string;
}

const READ_ONLY_TYPES: ReadonlyArray<string> = ['Calculated', 'Computed', 'Counter', 'Attachments', 'ContentTypeId', 'File', 'Guid'];

export function isWritableField(field: FieldSchema): boolean {
  return !field.readOnly && READ_ONLY_TYPES.indexOf(field.type) < 0;
}

export function isUserField(field: FieldSchema): boolean {
  return field.type === 'User' || field.type === 'UserMulti';
}

export function isLookupField(field: FieldSchema): boolean {
  return field.type === 'Lookup' || field.type === 'LookupMulti';
}

export function isMultiValueField(field: FieldSchema): boolean {
  return field.type === 'UserMulti' || field.type === 'LookupMulti' || field.type === 'MultiChoice' || field.allowMultipleValues;
}

/** Raw field info as returned by SharePoint REST (minimal metadata). */
export interface RawFieldInfo {
  InternalName: string;
  Title?: string;
  TypeAsString?: string;
  ReadOnlyField?: boolean;
  Required?: boolean;
  Choices?: string[] | { results?: string[] };
  LookupList?: string;
  LookupField?: string;
  AllowMultipleValues?: boolean;
  RichText?: boolean;
  DisplayFormat?: number;
  DefaultValue?: string | null;
}

export function toFieldSchema(raw: RawFieldInfo): FieldSchema {
  const choices = Array.isArray(raw.Choices) ? raw.Choices : raw.Choices && raw.Choices.results ? raw.Choices.results : [];
  const type = raw.TypeAsString || 'Text';
  const schema: FieldSchema = {
    internalName: raw.InternalName,
    title: raw.Title || raw.InternalName,
    type,
    readOnly: !!raw.ReadOnlyField,
    required: !!raw.Required,
    choices,
    allowMultipleValues: !!raw.AllowMultipleValues || type === 'UserMulti' || type === 'LookupMulti',
    richText: !!raw.RichText,
    dateOnly: type === 'DateTime' && raw.DisplayFormat === 0
  };
  if (raw.LookupList) schema.lookupListId = raw.LookupList.replace(/[{}]/g, '').toLowerCase();
  if (raw.LookupField) schema.lookupField = raw.LookupField;
  if (raw.DefaultValue !== undefined && raw.DefaultValue !== null && raw.DefaultValue !== '') schema.defaultValue = raw.DefaultValue;
  return schema;
}
