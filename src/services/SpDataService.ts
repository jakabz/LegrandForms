import { SPFI } from '@pnp/sp';
import { Web } from '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/fields';
import '@pnp/sp/files';
import '@pnp/sp/attachments';
import '@pnp/sp/site-users/web';
import '@pnp/sp/site-groups/web';
import type { LookupValue, PersonValue } from '../nintex/expression/values';
import type { FieldSchema, RawFieldInfo } from './FieldSchema';
import { toFieldSchema } from './FieldSchema';
import type { IDefinitionSource } from './FormDefinitionProvider';
import type { IFormDataSource } from './IFormDataSource';
import { toRequestError } from './errors';
import { selectClauseFor } from './ValueMapper';

export interface AttachmentInfo {
  fileName: string;
  serverRelativeUrl: string;
}

export interface LoadedItem {
  /** Raw REST properties (expanded People/Lookup objects). */
  values: Record<string, unknown>;
  etag?: string;
}

const PRINCIPAL_TYPES: Record<number, string> = { 1: 'User', 2: 'DL', 4: 'SecGroup', 8: 'SPGroup' };

/**
 * SharePoint data access through PnPjs v4 (Rendszerterv §5.8). Thin wrapper: no form semantics here.
 */
export class SpDataService implements IDefinitionSource, IFormDataSource {
  private readonly _sp: SPFI;
  private readonly _listId: string;
  private readonly _lookupCache: Map<string, Promise<LookupValue[]>> = new Map();

  public constructor(sp: SPFI, listId: string) {
    this._sp = sp;
    this._listId = listId;
  }

  private get _list(): ReturnType<SPFI['web']['lists']['getById']> {
    return this._sp.web.lists.getById(this._listId);
  }

  // --- IDefinitionSource -------------------------------------------------------------------------------------

  public async getETag(serverRelativeUrl: string): Promise<string> {
    const info = await this._sp.web.getFileByServerRelativePath(serverRelativeUrl).select('ETag', 'TimeLastModified')();
    return info.ETag || String(info.TimeLastModified || '');
  }

  public getBytes(serverRelativeUrl: string): Promise<ArrayBuffer> {
    return this._sp.web.getFileByServerRelativePath(serverRelativeUrl).getBuffer();
  }

  // --- schema & item -----------------------------------------------------------------------------------------

  public async getFields(): Promise<Record<string, FieldSchema>> {
    const raw = (await this._list.fields()) as unknown as RawFieldInfo[];
    const result: Record<string, FieldSchema> = {};
    raw.forEach((f) => {
      if (f && f.InternalName) result[f.InternalName] = toFieldSchema(f);
    });
    return result;
  }

  /** Loads an item with exactly the fields the form needs (dynamic $select/$expand, §12.1). */
  public async getItem(itemId: number, fields: FieldSchema[]): Promise<LoadedItem> {
    const select: string[] = ['Id'];
    const expand: string[] = [];
    fields.forEach((field) => {
      const clause = selectClauseFor(field);
      clause.select.forEach((s) => select.indexOf(s) < 0 && select.push(s));
      clause.expand.forEach((e) => expand.indexOf(e) < 0 && expand.push(e));
    });
    let query = this._list.items.getById(itemId).select(...select);
    if (expand.length) query = query.expand(...expand);
    const values = (await query()) as Record<string, unknown>;
    const etag = values['odata.etag'];
    return { values, etag: typeof etag === 'string' ? etag : undefined };
  }

  public async addItem(properties: Record<string, unknown>): Promise<{ id: number; etag?: string }> {
    try {
      const result = (await this._list.items.add(properties)) as Record<string, unknown>;
      const id = (result.Id !== undefined ? result.Id : result.ID) as number;
      const etag = result['odata.etag'];
      return { id, etag: typeof etag === 'string' ? etag : undefined };
    } catch (e) {
      throw await toRequestError(e);
    }
  }

  public async updateItem(itemId: number, properties: Record<string, unknown>, etag?: string): Promise<void> {
    if (!Object.keys(properties).length) return;
    try {
      await this._list.items.getById(itemId).update(properties, etag || '*');
    } catch (e) {
      throw await toRequestError(e);
    }
  }

  // --- attachments -------------------------------------------------------------------------------------------

  public async getAttachments(itemId: number): Promise<AttachmentInfo[]> {
    const files = (await this._list.items.getById(itemId).attachmentFiles()) as { FileName: string; ServerRelativeUrl: string }[];
    return files.map((f) => ({ fileName: f.FileName, serverRelativeUrl: f.ServerRelativeUrl }));
  }

  public async addAttachment(itemId: number, file: File): Promise<void> {
    const content = await file.arrayBuffer();
    await this._list.items.getById(itemId).attachmentFiles.add(file.name, content);
  }

  public async deleteAttachment(itemId: number, fileName: string): Promise<void> {
    await this._list.items.getById(itemId).attachmentFiles.getByName(fileName).recycle();
  }

  // --- users & groups ----------------------------------------------------------------------------------------

  public async getCurrentUser(): Promise<PersonValue> {
    const user = await this._sp.web.currentUser();
    return {
      kind: 'person',
      id: user.Id,
      loginName: user.LoginName,
      email: user.Email,
      displayName: user.Title,
      principalType: PRINCIPAL_TYPES[user.PrincipalType] || 'User'
    };
  }

  /** Titles of the site groups of the current user (preloaded for fn-IsMemberOfGroup). */
  public async getCurrentUserGroups(): Promise<string[]> {
    try {
      const groups = await this._sp.web.currentUser.groups();
      return groups.map((g) => g.Title);
    } catch {
      return [];
    }
  }

  /** Resolves a person picked in the UI to a site user id (needed for `{Field}Id` writes). */
  public async ensureUser(person: PersonValue): Promise<number> {
    const login = person.loginName || person.email;
    if (!login) throw new Error(`Cannot resolve user "${person.displayName}"`);
    const user = await this._sp.web.ensureUser(login);
    return user.Id;
  }

  // --- lookups -----------------------------------------------------------------------------------------------

  /**
   * Items of a lookup source list referenced by title (K-06). Cached per list/field/web for the form's lifetime.
   */
  public getLookupItems(listTitle: string, field: string, webUrl?: string): Promise<LookupValue[]> {
    const key = `${webUrl || ''}|${listTitle}|${field}`.toLowerCase();
    let pending = this._lookupCache.get(key);
    if (!pending) {
      pending = this._loadLookupItems(listTitle, field, webUrl);
      this._lookupCache.set(key, pending);
      pending.catch(() => this._lookupCache.delete(key));
    }
    return pending;
  }

  private async _loadLookupItems(listTitle: string, field: string, webUrl?: string): Promise<LookupValue[]> {
    // LookupWeb: a (server-)relative or absolute web URL; empty → current web.
    const web = webUrl ? Web([this._sp.web, webUrl]) : this._sp.web;
    const result: LookupValue[] = [];
    // Async iteration pages through large lists (5000 items per page).
    const items = web.lists.getByTitle(listTitle).items.select('Id', field).top(5000);
    for await (const page of items) {
      (page as Record<string, unknown>[]).forEach((row) => {
        const title = row[field];
        result.push({ kind: 'lookup', id: row.Id as number, title: title === null || title === undefined ? '' : String(title) });
      });
    }
    result.sort((a, b) => a.title.localeCompare(b.title, 'hu'));
    return result;
  }
}
