import type { ExprValue } from '../nintex/expression/values';
import type { FieldSchema } from './FieldSchema';
import type { SpDataService } from './SpDataService';
import { SharePointRequestError } from './errors';
import { toSharePoint } from './ValueMapper';

/** One field write produced by the save strategy. */
export interface SaveChange {
  field: FieldSchema;
  /** Control the value comes from (for mapping server errors back to the UI). */
  controlId: string;
  value: ExprValue;
}

export interface SaveRequest {
  mode: 'New' | 'Edit';
  itemId?: number;
  /** ETag of the item when it was loaded (optimistic concurrency, Rendszerterv §12.3). */
  etag?: string;
  changes: SaveChange[];
  attachmentsToDelete: string[];
  attachmentsToAdd: File[];
}

export interface SaveResponse {
  itemId: number;
  /** Attachment operations that failed (the item itself was saved). */
  attachmentErrors: string[];
}

export type SaveErrorKind = 'concurrency' | 'validation' | 'unknown';

export class SaveError extends Error {
  public readonly kind: SaveErrorKind;
  /** Internal name of the field the server complained about, when it could be identified. */
  public readonly fieldName?: string;

  public constructor(kind: SaveErrorKind, message: string, fieldName?: string) {
    super(message);
    this.kind = kind;
    this.fieldName = fieldName;
    Object.setPrototypeOf(this, SaveError.prototype);
  }
}

/** Persists form changes; implemented with PnPjs, faked in tests. */
export interface IFormPersistence {
  save(request: SaveRequest): Promise<SaveResponse>;
}

/** Finds the field a SharePoint error message refers to (quoted internal name or title). */
export function findFieldInMessage(message: string, changes: SaveChange[]): string | undefined {
  const quoted: string[] = [];
  const pattern = /['"„“]([^'"”]+)['"”]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) quoted.push(match[1].toLowerCase());
  const hit = changes.filter(
    (c) => quoted.indexOf(c.field.internalName.toLowerCase()) >= 0 || quoted.indexOf(c.field.title.toLowerCase()) >= 0
  )[0];
  return hit ? hit.field.internalName : undefined;
}

export class ItemPersistence implements IFormPersistence {
  private readonly _data: SpDataService;

  public constructor(data: SpDataService) {
    this._data = data;
  }

  public async save(request: SaveRequest): Promise<SaveResponse> {
    const payload: Record<string, unknown> = {};
    for (const change of request.changes) {
      Object.assign(payload, await toSharePoint(change.field, change.value, (person) => this._data.ensureUser(person)));
    }

    let itemId: number;
    try {
      if (request.mode === 'New') {
        itemId = (await this._data.addItem(payload)).id;
      } else {
        if (request.itemId === undefined) throw new SaveError('unknown', 'Missing item id');
        itemId = request.itemId;
        await this._data.updateItem(itemId, payload, request.etag);
      }
    } catch (e) {
      if (e instanceof SaveError) throw e;
      if (e instanceof SharePointRequestError) {
        if (e.status === 412) throw new SaveError('concurrency', e.message);
        if (e.status === 400) throw new SaveError('validation', e.message, findFieldInMessage(e.message, request.changes));
      }
      throw new SaveError('unknown', (e as Error).message);
    }

    // Attachments after the item exists (New mode needs the id): deletions first, then uploads.
    const attachmentErrors: string[] = [];
    for (const fileName of request.attachmentsToDelete) {
      try {
        await this._data.deleteAttachment(itemId, fileName);
      } catch (e) {
        attachmentErrors.push(`${fileName}: ${(e as Error).message}`);
      }
    }
    for (const file of request.attachmentsToAdd) {
      try {
        await this._data.addAttachment(itemId, file);
      } catch (e) {
        attachmentErrors.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    return { itemId, attachmentErrors };
  }
}
