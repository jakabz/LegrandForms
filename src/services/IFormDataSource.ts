import type { PersonValue } from '../nintex/expression/values';
import type { FieldSchema } from './FieldSchema';
import type { AttachmentInfo, LoadedItem } from './SpDataService';

/** Read access the form session needs at load time (SpDataService; fakes in tests). */
export interface IFormDataSource {
  getFields(): Promise<Record<string, FieldSchema>>;
  getItem(itemId: number, fields: FieldSchema[]): Promise<LoadedItem>;
  getAttachments(itemId: number): Promise<AttachmentInfo[]>;
  getCurrentUser(): Promise<PersonValue>;
  getCurrentUserGroups(): Promise<string[]>;
}
