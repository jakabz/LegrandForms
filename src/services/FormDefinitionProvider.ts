import type { Diagnostic } from '../nintex/model/Diagnostic';
import type { FormDefinition } from '../nintex/model/FormDefinition';
import { parseNintexFormBytes, PARSER_VERSION } from '../nintex/parser/NintexXmlParser';

/** Where definitions come from (PnPjs in production, fakes in tests). */
export interface IDefinitionSource {
  /** Current ETag (version) of the file; throws when the file does not exist. */
  getETag(serverRelativeUrl: string): Promise<string>;
  /** Raw bytes; Nintex exports are UTF-16LE, so text decoding must not happen in the transport. */
  getBytes(serverRelativeUrl: string): Promise<ArrayBuffer>;
}

/** Minimal Storage interface (sessionStorage). */
export interface IKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface LoadedDefinition {
  definition: FormDefinition;
  diagnostics: Diagnostic[];
  fromCache: boolean;
}

export class FormDefinitionLoadError extends Error {
  public readonly diagnostics: Diagnostic[];

  public constructor(message: string, diagnostics: Diagnostic[] = []) {
    super(message);
    this.diagnostics = diagnostics;
    Object.setPrototypeOf(this, FormDefinitionLoadError.prototype);
  }
}

const CACHE_PREFIX: string = 'nf:def:';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value as object).forEach((key) => deepFreeze((value as Record<string, unknown>)[key]));
  }
  return value;
}

/**
 * Loads and parses a Nintex XML definition; caches the parsed model in sessionStorage keyed by URL + ETag +
 * parser version (Rendszerterv §5.3).
 */
export class FormDefinitionProvider {
  private readonly _source: IDefinitionSource;
  private readonly _storage: IKeyValueStorage | undefined;
  private readonly _freeze: boolean;

  public constructor(source: IDefinitionSource, storage?: IKeyValueStorage, options: { freeze?: boolean } = {}) {
    this._source = source;
    this._storage = storage;
    this._freeze = !!options.freeze;
  }

  public static cacheKey(url: string, etag: string): string {
    return `${CACHE_PREFIX}${PARSER_VERSION}:${url.toLowerCase()}:${etag}`;
  }

  public async load(url: string): Promise<LoadedDefinition> {
    let etag: string;
    try {
      etag = await this._source.getETag(url);
    } catch (e) {
      throw new FormDefinitionLoadError(`The form definition cannot be read: ${url} (${(e as Error).message})`);
    }
    const key = FormDefinitionProvider.cacheKey(url, etag);
    const cached = this._readCache(key);
    if (cached) {
      return { definition: this._finish(cached), diagnostics: cached.diagnostics, fromCache: true };
    }

    const bytes = await this._source.getBytes(url);
    const result = parseNintexFormBytes(new Uint8Array(bytes));
    if (!result.definition) {
      throw new FormDefinitionLoadError(`The form definition is not a valid Nintex export: ${url}`, result.diagnostics);
    }
    this._writeCache(url, key, result.definition);
    return { definition: this._finish(result.definition), diagnostics: result.diagnostics, fromCache: false };
  }

  private _finish(definition: FormDefinition): FormDefinition {
    return this._freeze ? deepFreeze(definition) : definition;
  }

  private _readCache(key: string): FormDefinition | undefined {
    if (!this._storage) return undefined;
    try {
      const text = this._storage.getItem(key);
      if (!text) return undefined;
      const parsed = JSON.parse(text) as FormDefinition;
      return parsed && parsed.parserVersion === PARSER_VERSION ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private _writeCache(url: string, key: string, definition: FormDefinition): void {
    const storage = this._storage;
    if (!storage) return;
    try {
      // Drop older versions of the same file.
      const urlPart = `:${url.toLowerCase()}:`;
      const stale: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const existing = storage.key(i);
        if (existing && existing.indexOf(CACHE_PREFIX) === 0 && existing.indexOf(urlPart) > 0 && existing !== key) stale.push(existing);
      }
      stale.forEach((k) => storage.removeItem(k));
      storage.setItem(key, JSON.stringify(definition));
    } catch {
      // Quota exceeded or storage disabled: caching is an optimization only.
    }
  }
}
