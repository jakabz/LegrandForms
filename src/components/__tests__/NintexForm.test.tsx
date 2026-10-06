// PnP reusable controls ship ES modules; they are replaced by simple stand-ins in Jest (CommonJS).
// jest.mock calls must stay above the imports (the compiled output is not hoisted).
jest.mock('@pnp/spfx-controls-react/lib/PeoplePicker', () => ({
  PeoplePicker: () => null,
  PrincipalType: { User: 1, DistributionList: 2, SecurityGroup: 4, SharePointGroup: 8 }
}));
jest.mock('@pnp/spfx-controls-react/lib/RichText', () => ({ RichText: () => null }));
jest.mock('@pnp/spfx-controls-react/lib/DateTimePicker', () => ({ DateTimePicker: () => null, TimeConvention: { Hours12: 1, Hours24: 2 } }));

import { setIconOptions } from '@fluentui/react/lib/Styling';
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { parseSample } from '../../nintex/__tests__/helpers/samples';
import type { PersonValue } from '../../nintex/expression/values';
import { resolveConfig } from '../../services/ConfigResolver';
import type { FieldSchema } from '../../services/FieldSchema';
import type { IFormPersistence, SaveRequest } from '../../services/ItemPersistence';
import { FormStore, FormStoreOptions } from '../../state/FormStore';
import { formatCalculation } from '../controls/CalculationControl';
import type { FormServices } from '../FormContext';
import { NintexForm } from '../NintexForm';
import { sanitizeHtml } from '../sanitize';

/** Loads an AMD localization module (`define([], factory)`) the way SPFx does. */
function loadStrings(): INintexFormFormCustomizerStrings {
  let result: INintexFormFormCustomizerStrings | undefined;
  const g = global as unknown as { define?: (deps: string[], factory: () => INintexFormFormCustomizerStrings) => void };
  g.define = (deps, factory) => {
    result = factory();
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../../extensions/nintexForm/loc/hu-hu.js');
  delete g.define;
  if (!result) throw new Error('hu-hu.js did not call define()');
  return result;
}
const strings: INintexFormFormCustomizerStrings = loadStrings();

// Icon fonts are registered by SharePoint at runtime, not in Jest.
setIconOptions({ disableWarnings: true });

const ALICE: PersonValue = { kind: 'person', id: 11, loginName: 'alice', displayName: 'Alice' };
const PLAN_ID = '1f6fd549-bd42-4da6-a5a5-5ddee21d3393';

class FakePersistence implements IFormPersistence {
  public requests: SaveRequest[] = [];
  public async save(request: SaveRequest): Promise<{ itemId: number; attachmentErrors: string[] }> {
    this.requests.push(request);
    return { itemId: 1, attachmentErrors: [] };
  }
}

const services: FormServices = {
  webAbsoluteUrl: 'https://tenant.sharepoint.com/sites/x',
  rewriteUrl: (url) => url || '',
  lookups: { getLookupItems: async () => [{ kind: 'lookup', id: 1, title: 'Gyártás' }] }
};

function textFields(): Record<string, FieldSchema> {
  const def = parseSample('AJForm.xml');
  const fields: Record<string, FieldSchema> = {};
  Object.keys(def.controls).forEach((id) => {
    const c = def.controls[id];
    if ('dataField' in c && c.dataField) {
      const name = c.dataField.internalName;
      fields[name] = { internalName: name, title: name, type: c.type === 'PeoplePicker' ? 'User' : 'Text', readOnly: false, required: false, choices: [], allowMultipleValues: false, richText: false, dateOnly: false };
    }
  });
  return fields;
}

function setup(
  options: Partial<FormStoreOptions> = {},
  configOverrides: Record<string, unknown> = {}
): ReturnType<typeof render> & { store: FormStore; persistence: FakePersistence; onSaved: jest.Mock; onClosed: jest.Mock } {
  const persistence = new FakePersistence();
  const store = new FormStore({
    definition: parseSample('AJForm.xml'),
    mode: 'New',
    fields: textFields(),
    currentUser: ALICE,
    currentUserGroups: [],
    locale: 'hu-HU',
    persistence,
    ...options
  });
  const config = resolveConfig({ formDefinitionUrl: '/x.xml', ...configOverrides }, '', false).config!;
  const onSaved = jest.fn();
  const onClosed = jest.fn();
  const utils = render(
    <NintexForm state={{ kind: 'ready', store, config }} strings={strings} services={services} onSaved={onSaved} onClosed={onClosed} listUrl="/sites/x/Lists/A" />
  );
  return { store, persistence, onSaved, onClosed, ...utils };
}

describe('NintexForm', () => {
  it('renders the loading and error states', async () => {
    const { rerender } = render(<NintexForm state={{ kind: 'loading' }} strings={strings} services={services} onSaved={jest.fn()} onClosed={jest.fn()} />);
    expect(screen.getByText(strings.Loading)).toBeTruthy();
    rerender(
      <NintexForm state={{ kind: 'error', message: 'Nincs ilyen fájl' }} strings={strings} services={services} onSaved={jest.fn()} onClosed={jest.fn()} listUrl="/l" />
    );
    // MessageBar renders its live-region text with a (0 ms) delay.
    expect(await screen.findByText(strings.LoadErrorTitle)).toBeTruthy();
    expect(screen.getByText('Nincs ilyen fájl')).toBeTruthy();
    expect(screen.getByText(strings.BackToList).getAttribute('href')).toBe('/l');
  });

  it('renders controls absolutely positioned inside the scoped root', () => {
    const { container, store } = setup();
    const root = container.querySelector(`.nf-root-${store.definition.id}`);
    expect(root).toBeTruthy();
    const title = container.querySelector(`[data-control-id="${store.definition.controlsByName.title}"]`) as HTMLElement;
    expect(title.style.position).toBe('absolute');
    expect(title.className).toContain('nf-form-input');
    expect(container.querySelector('style')!.textContent).toContain(`.nf-root-${store.definition.id} .nf-form-label`);
  });

  it('hides controls by rules (New mode: created-by calculation hidden)', () => {
    const { container } = setup();
    expect(container.querySelector('[data-control-id="9bda8749-b17f-416c-80c9-2a8f63ca8cfe"]')).toBeNull();
    expect(container.querySelector('[data-control-id="8b0ec417-83e9-466c-b53d-37721cbd8996"]')).toBeTruthy();
  });

  it('labels are associated with their inputs', () => {
    const { container } = setup();
    const input = container.querySelector(`#nf-input-${PLAN_ID}`) as HTMLInputElement;
    expect(input).toBeTruthy();
    const labelledBy = input.getAttribute('aria-labelledby') || '';
    expect(labelledBy).toMatch(/nf-label-/);
    const label = container.querySelector(`label[for="nf-input-${PLAN_ID}"]`);
    expect(label).toBeTruthy();
  });

  it('typing updates the store; Save shows validation errors and blocks saving', async () => {
    const { container, store, persistence, onSaved } = setup();
    const saveButton = screen.getAllByRole('button').filter((b) => /Mentés/.test(b.textContent || ''))[0];
    await act(async () => {
      fireEvent.click(saveButton);
    });
    expect(persistence.requests).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
    expect(await screen.findByText(strings.ValidationSummary)).toBeTruthy();
    expect(container.querySelector(`#nf-error-${PLAN_ID}`)!.textContent).toContain('Az Audit Terv ID nem lehet üres');

    const input = container.querySelector(`#nf-input-${PLAN_ID}`) as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: '42' } });
    });
    expect(store.getValue(PLAN_ID)).toBe('42');
    expect(container.querySelector(`#nf-error-${PLAN_ID}`)).toBeNull();
  });

  it('saves and calls onSaved when the form is valid', async () => {
    const { container, persistence, onSaved, store } = setup();
    act(() => {
      fireEvent.change(container.querySelector(`#nf-input-${PLAN_ID}`) as HTMLInputElement, { target: { value: '42' } });
      fireEvent.change(container.querySelector(`#nf-input-${store.definition.controlsByName.title}`) as HTMLInputElement, {
        target: { value: 'Jelentés' }
      });
    });
    const save = screen.getAllByRole('button').filter((b) => /Mentés/.test(b.textContent || ''))[0];
    await act(async () => {
      fireEvent.click(save);
    });
    expect(persistence.requests).toHaveLength(1);
    expect(onSaved).toHaveBeenCalled();
  });

  it('Display mode renders read-only text and a close button', async () => {
    const { container, onClosed, store } = setup({ mode: 'Display', item: { values: { Title: 'Megjelenített cím' } }, itemId: 1 });
    expect(container.querySelector(`#nf-input-${store.definition.controlsByName.title}`)!.textContent).toBe('Megjelenített cím');
    expect(container.querySelectorAll('input[type="text"]')).toHaveLength(0);
    const close = screen.getAllByRole('button').filter((b) => /Bezárás|Mégse/.test(b.textContent || ''))[0];
    await act(async () => {
      fireEvent.click(close);
    });
    expect(onClosed).toHaveBeenCalled();
  });

  it('debug mode shows the diagnostics button', () => {
    setup({}, { debug: true });
    expect(screen.getByText(strings.DiagnosticsButton)).toBeTruthy();
  });
});

describe('helpers', () => {
  it('sanitizeHtml keeps styles and drops scripts/handlers', () => {
    const html = sanitizeHtml('<span style="color: red" onclick="x()">A</span><script>alert(1)</script><img src="javascript:alert(1)">');
    expect(html).toContain('style="color: red"');
    expect(html).not.toMatch(/onclick|script|javascript/);
  });

  it('formatCalculation applies decimals, percent and people names', () => {
    const def = parseSample('ATForm.xml').controls['e50d8bfb-9342-4ad0-a873-ed775b96b206'];
    if (def.type !== 'Calculation') throw new Error('not a calculation');
    expect(formatCalculation({ ...def, decimals: 2, showThousandSeparator: true }, 1234.5, 'hu-HU')).toMatch(/1\s234,50/);
    expect(formatCalculation({ ...def, showAsPercent: true }, 0.25, 'en-US')).toBe('25%');
    expect(formatCalculation(def, [ALICE], 'hu-HU')).toBe('Alice');
    expect(formatCalculation({ ...def, prefix: 'Év: ' }, '2026', 'hu-HU')).toBe('Év: 2026');
    expect(formatCalculation(def, null, 'hu-HU')).toBe('');
  });
});
