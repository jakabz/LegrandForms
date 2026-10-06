import { collectBoundFields, collectReferencedItemProperties } from '../nintex/analysis/inventory';
import type { FormMode } from '../nintex/expression/context';
import type { FieldSchema } from '../services/FieldSchema';
import type { FormDefinitionProvider } from '../services/FormDefinitionProvider';
import type { IFormDataSource } from '../services/IFormDataSource';
import type { IFormPersistence } from '../services/ItemPersistence';
import type { AttachmentInfo, LoadedItem } from '../services/SpDataService';
import { FormStore } from './FormStore';

export interface LoadFormSessionInput {
  definitionUrl: string;
  provider: FormDefinitionProvider;
  data: IFormDataSource;
  persistence: IFormPersistence;
  mode: FormMode;
  itemId?: number;
  locale: string;
  debug: boolean;
}

/**
 * Loads everything a form needs, in parallel where possible (Rendszerterv §4.2, §15): definition, field schemas,
 * current user and groups; then the item (only the fields the form reads) and its attachments.
 */
export async function loadFormSession(input: LoadFormSessionInput): Promise<FormStore> {
  const [loaded, fields, currentUser, groups] = await Promise.all([
    input.provider.load(input.definitionUrl),
    input.data.getFields(),
    input.data.getCurrentUser(),
    input.data.getCurrentUserGroups()
  ]);
  const definition = loaded.definition;

  let item: LoadedItem | null = null;
  let attachments: AttachmentInfo[] = [];
  if (input.mode !== 'New' && input.itemId !== undefined) {
    const names: string[] = collectBoundFields(definition).map((f) => f.internalName);
    collectReferencedItemProperties(definition).forEach((name) => names.indexOf(name) < 0 && names.push(name));
    const schemas = names.map((name) => fields[name]).filter((f): f is FieldSchema => !!f);
    const hasAttachments = Object.keys(definition.controls).some((id) => definition.controls[id].type === 'Attachment');
    [item, attachments] = await Promise.all([
      input.data.getItem(input.itemId, schemas),
      hasAttachments ? input.data.getAttachments(input.itemId) : Promise.resolve([] as AttachmentInfo[])
    ]);
  }

  return new FormStore({
    definition,
    mode: input.mode,
    fields,
    item,
    itemId: input.itemId,
    attachments,
    currentUser,
    currentUserGroups: groups,
    locale: input.locale,
    persistence: input.persistence,
    debug: input.debug
  });
}
