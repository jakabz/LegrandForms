import { readSampleBytes } from '../../nintex/__tests__/helpers/samples';
import type { PersonValue } from '../../nintex/expression/values';
import { resolveConfig } from '../ConfigResolver';
import { FieldSchema, toFieldSchema } from '../FieldSchema';
import { FormDefinitionLoadError, FormDefinitionProvider, IDefinitionSource, IKeyValueStorage } from '../FormDefinitionProvider';
import { findFieldInMessage } from '../ItemPersistence';
import { rewriteUrl } from '../urlRewriter';
import { fromSharePoint, selectClauseFor, toSharePoint } from '../ValueMapper';

function field(internalName: string, type: string, extra: Partial<FieldSchema> = {}): FieldSchema {
  return {
    internalName,
    title: internalName,
    type,
    readOnly: false,
    required: false,
    choices: [],
    allowMultipleValues: type.indexOf('Multi') > 0,
    richText: false,
    dateOnly: false,
    ...extra
  };
}

class MemoryStorage implements IKeyValueStorage {
  public readonly data: Record<string, string> = {};
  public get length(): number {
    return Object.keys(this.data).length;
  }
  public getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
  }
  public setItem(key: string, value: string): void {
    this.data[key] = value;
  }
  public removeItem(key: string): void {
    delete this.data[key];
  }
  public key(index: number): string | null {
    return Object.keys(this.data)[index] || null;
  }
}

describe('resolveConfig', () => {
  it('applies defaults', () => {
    expect(resolveConfig({ formDefinitionUrl: '/sites/a/FormDefinitions/AJForm.xml' }, '', false).config).toEqual({
      formDefinitionUrl: '/sites/a/FormDefinitions/AJForm.xml',
      layoutName: 'Desktop',
      responsiveBreakpoint: 640,
      collapseHiddenRows: true,
      urlRewrites: {},
      emptyRuleBehavior: 'warn',
      debug: false,
      styleMode: 'fluent',
      customCssUrl: '',
      hideImages: true
    });
  });

  it('style options: hideImages follows styleMode unless set explicitly', () => {
    const base = { formDefinitionUrl: '/a.xml' };
    expect(resolveConfig({ ...base, styleMode: 'nintex' }, '', false).config).toEqual(
      expect.objectContaining({ styleMode: 'nintex', hideImages: false })
    );
    expect(resolveConfig({ ...base, styleMode: 'nintex', hideImages: true }, '', false).config).toEqual(
      expect.objectContaining({ styleMode: 'nintex', hideImages: true })
    );
    expect(resolveConfig('{"formDefinitionUrl":"/a.xml","styleMode":"bogus","hideImages":"false","customCssUrl":" /c.css "}', '', false).config).toEqual(
      expect.objectContaining({ styleMode: 'fluent', hideImages: false, customCssUrl: '/c.css' })
    );
  });

  it('look switches in the URL work in debug builds or with debug configured; nfCss only in debug builds', () => {
    const search = '?nfStyle=nintex&nfHideImages=1&nfCss=%2Fx.css';
    expect(resolveConfig({ formDefinitionUrl: '/a.xml' }, search, false).config).toEqual(
      expect.objectContaining({ styleMode: 'fluent', hideImages: true, customCssUrl: '' })
    );
    expect(resolveConfig({ formDefinitionUrl: '/a.xml', debug: true }, search, false).config).toEqual(
      expect.objectContaining({ styleMode: 'nintex', hideImages: true, customCssUrl: '' })
    );
    expect(resolveConfig({ formDefinitionUrl: '/a.xml' }, search, true).config).toEqual(
      expect.objectContaining({ styleMode: 'nintex', hideImages: true, customCssUrl: '/x.css' })
    );
  });

  it('accepts JSON strings and validates formDefinitionUrl', () => {
    expect(resolveConfig('{"formDefinitionUrl":"/x.xml","collapseHiddenRows":"false","responsiveBreakpoint":500}', '', false).config).toEqual(
      expect.objectContaining({ formDefinitionUrl: '/x.xml', collapseHiddenRows: false, responsiveBreakpoint: 500 })
    );
    expect(resolveConfig(undefined, '', false).error).toContain('formDefinitionUrl');
    expect(resolveConfig('{bad', '', false).error).toContain('JSON');
  });

  it('URL overrides only in debug builds', () => {
    const props = { formDefinitionUrl: '/a.xml' };
    expect(resolveConfig(props, '?nfDef=%2Fb.xml&nfDebug=1', false).config).toEqual(expect.objectContaining({ formDefinitionUrl: '/a.xml', debug: false }));
    expect(resolveConfig(props, '?nfDef=%2Fb.xml&nfDebug=1', true).config).toEqual(expect.objectContaining({ formDefinitionUrl: '/b.xml', debug: true }));
  });
});

describe('rewriteUrl', () => {
  const rewrites = {
    'http://appfrlgs243.eu.dir.grpleg.com/sites/': 'https://legrand.sharepoint.com/sites/',
    'http://appfrlgs243.eu.dir.grpleg.com/sites/hungary/': 'https://legrand.sharepoint.com/sites/hu/'
  };
  it('replaces the longest matching prefix, case-insensitively', () => {
    expect(rewriteUrl('HTTP://appfrlgs243.eu.dir.grpleg.com/sites/hungary/workflow/a.jpg', rewrites, 'https://legrand.sharepoint.com')).toBe(
      'https://legrand.sharepoint.com/sites/hu/workflow/a.jpg'
    );
  });
  it('resolves server-relative URLs and drops unsafe schemes', () => {
    expect(rewriteUrl('/sites/hungary/x.png', {}, 'https://t.sharepoint.com/')).toBe('https://t.sharepoint.com/sites/hungary/x.png');
    // eslint-disable-next-line no-script-url -- verifies that script URLs are rejected
    expect(rewriteUrl('javascript:alert(1)', {}, 'https://t')).toBe('');
    expect(rewriteUrl('//evil.com/x', {}, 'https://t')).toBe('');
    expect(rewriteUrl(undefined, {}, 'https://t')).toBe('');
  });
});

describe('FieldSchema', () => {
  it('maps REST field info', () => {
    expect(
      toFieldSchema({ InternalName: 'Due', TypeAsString: 'DateTime', DisplayFormat: 0, Required: true, DefaultValue: '[today]' })
    ).toEqual(expect.objectContaining({ type: 'DateTime', dateOnly: true, required: true, defaultValue: '[today]' }));
    expect(
      toFieldSchema({ InternalName: 'Org', TypeAsString: 'LookupMulti', LookupList: '{ABC}', LookupField: 'Title', Choices: { results: [] } })
    ).toEqual(expect.objectContaining({ allowMultipleValues: true, lookupListId: 'abc', lookupField: 'Title' }));
  });
});

describe('ValueMapper', () => {
  const ALICE: PersonValue = { kind: 'person', id: 5, displayName: 'Alice', email: 'a@x', loginName: 'i:0#.f|membership|a@x' };

  it('reads REST values into expression values', () => {
    expect(fromSharePoint(field('A', 'User'), { Id: 5, Title: 'Alice', EMail: 'a@x', Name: 'i:0#.f|membership|a@x' })).toEqual([ALICE]);
    expect(fromSharePoint(field('A', 'UserMulti'), null)).toEqual([]);
    expect(fromSharePoint(field('L', 'LookupMulti', { lookupField: 'Title' }), [{ Id: 1, Title: 'X' }])).toEqual([{ kind: 'lookup', id: 1, title: 'X' }]);
    expect(fromSharePoint(field('D', 'DateTime'), '2024-05-01T22:00:00Z')).toEqual(new Date('2024-05-01T22:00:00Z'));
    expect(fromSharePoint(field('C', 'MultiChoice'), ['a', 'b'])).toEqual(['a', 'b']);
    expect(fromSharePoint(field('N', 'Number'), 3.5)).toBe(3.5);
    expect(fromSharePoint(field('T', 'Text'), null)).toBe(null);
    expect(fromSharePoint(field('U', 'URL'), { Url: 'https://x', Description: 'x' })).toBe('https://x');
    expect(fromSharePoint(field('B', 'Boolean'), true)).toBe(true);
  });

  it('builds $select/$expand clauses', () => {
    expect(selectClauseFor(field('Author', 'User'))).toEqual({
      select: ['Author/Id', 'Author/Title', 'Author/EMail', 'Author/Name'],
      expand: ['Author']
    });
    expect(selectClauseFor(field('Org', 'LookupMulti', { lookupField: 'Title' }))).toEqual({ select: ['Org/Id', 'Org/Title'], expand: ['Org'] });
    expect(selectClauseFor(field('Jegyzokonyvezett_x0020_auditorok', 'Note')).select).toEqual(['Jegyzokonyvezett_x0020_auditorok']);
  });

  it('writes REST payloads (People → {Field}Id via ensureUser)', async () => {
    const ensureUser = jest.fn(async () => 99);
    expect(await toSharePoint(field('A', 'User'), [ALICE], ensureUser)).toEqual({ AId: 5 });
    expect(await toSharePoint(field('A', 'UserMulti'), [ALICE, { kind: 'person', displayName: 'Bob', loginName: 'bob' }], ensureUser)).toEqual({
      AId: [5, 99]
    });
    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(await toSharePoint(field('A', 'User'), [], ensureUser)).toEqual({ AId: null });
    expect(await toSharePoint(field('L', 'Lookup'), [{ kind: 'lookup', id: 3, title: 'x' }], ensureUser)).toEqual({ LId: 3 });
    expect(await toSharePoint(field('L', 'LookupMulti'), [], ensureUser)).toEqual({ LId: [] });
    expect(await toSharePoint(field('N', 'Number'), '12,5', ensureUser)).toEqual({ N: 12.5 });
    expect(await toSharePoint(field('N', 'Number'), '', ensureUser)).toEqual({ N: null });
    expect(await toSharePoint(field('D', 'DateTime'), new Date(Date.UTC(2024, 0, 2)), ensureUser)).toEqual({ D: '2024-01-02T00:00:00.000Z' });
    expect(await toSharePoint(field('C', 'MultiChoice'), ['a', ''], ensureUser)).toEqual({ C: ['a'] });
    expect(await toSharePoint(field('T', 'Text'), '', ensureUser)).toEqual({ T: null });
    expect(await toSharePoint(field('X', 'Calculated'), 'x', ensureUser)).toEqual({});
    expect(await toSharePoint(field('R', 'Text', { readOnly: true }), 'x', ensureUser)).toEqual({});
  });
});

describe('FormDefinitionProvider', () => {
  function source(etag: string): IDefinitionSource & { reads: number } {
    const bytes = readSampleBytes('Form.xml');
    const fake = {
      reads: 0,
      getETag: async () => etag,
      getBytes: async () => {
        fake.reads++;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
    };
    return fake;
  }

  it('parses the UTF-16 export and caches by URL + ETag', async () => {
    const storage = new MemoryStorage();
    const src = source('"{A},1"');
    const provider = new FormDefinitionProvider(src, storage);
    const first = await provider.load('/sites/x/FormDefinitions/Form.xml');
    expect(first.fromCache).toBe(false);
    expect(Object.keys(first.definition.controls)).toHaveLength(18);
    const second = await provider.load('/sites/x/FormDefinitions/Form.xml');
    expect(second.fromCache).toBe(true);
    expect(src.reads).toBe(1);
    expect(second.definition).toEqual(first.definition);
  });

  it('a new ETag replaces the cached version', async () => {
    const storage = new MemoryStorage();
    await new FormDefinitionProvider(source('"v1"'), storage).load('/f.xml');
    await new FormDefinitionProvider(source('"v2"'), storage).load('/f.xml');
    expect(Object.keys(storage.data)).toEqual([FormDefinitionProvider.cacheKey('/f.xml', '"v2"')]);
  });

  it('freezes when asked and reports unreadable files', async () => {
    const frozen = await new FormDefinitionProvider(source('"v"'), undefined, { freeze: true }).load('/f.xml');
    expect(Object.isFrozen(frozen.definition.controls)).toBe(true);
    const missing: IDefinitionSource = {
      getETag: async () => {
        throw new Error('404');
      },
      getBytes: async () => new ArrayBuffer(0)
    };
    await expect(new FormDefinitionProvider(missing).load('/missing.xml')).rejects.toBeInstanceOf(FormDefinitionLoadError);
    const garbage: IDefinitionSource = { getETag: async () => 'x', getBytes: async () => new Uint8Array([60, 120]).buffer };
    await expect(new FormDefinitionProvider(garbage).load('/bad.xml')).rejects.toBeInstanceOf(FormDefinitionLoadError);
  });
});

describe('findFieldInMessage', () => {
  it('maps quoted field names or titles', () => {
    const changes = [{ field: field('Title', 'Text', { title: 'Cím' }), controlId: 'c', value: 'x' }];
    expect(findFieldInMessage("The value of field 'Title' is invalid", changes)).toBe('Title');
    expect(findFieldInMessage('A(z) „Cím” mező kötelező', changes)).toBe('Title');
    expect(findFieldInMessage('List data validation failed.', changes)).toBeUndefined();
  });
});
