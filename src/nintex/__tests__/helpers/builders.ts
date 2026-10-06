import { parseExpression } from '../../expression/parser';
import { compileValueSource } from '../../expression/valueSource';
import type {
  AttachmentControl,
  CalculationControl,
  ChoiceControl,
  ControlDefinition,
  DateTimeControl,
  PeoplePickerControl,
  TextBoxControl,
  ValueSource
} from '../../model/controls';
import type { FormDefinition, RuleDefinition } from '../../model/FormDefinition';

export function ast(source: string): ReturnType<typeof parseExpression>['ast'] {
  const result = parseExpression(source);
  if (result.error) throw new Error(`Bad test expression ${source}: ${result.error.message}`);
  return result.ast;
}

export function value(text: string): ValueSource {
  return compileValueSource(text).value;
}

/** A binding value (InsertReferences): always an expression. */
export function binding(text: string): ValueSource {
  return { kind: 'expression', source: text, ast: ast(text) };
}

const base = { isVisible: true, isEnabled: true, canResizeAtRuntime: false, style: {}, bindings: [] };
const field = { isRequired: false, controlMode: 'Auto' as const, validators: {} };

export function textBox(id: string, extra: Partial<TextBoxControl> = {}): TextBoxControl {
  return {
    ...base,
    ...field,
    id,
    type: 'TextBox',
    rawType: 'TextBoxFormControlProperties',
    name: id,
    dataField: { source: 'List', internalName: id },
    dataType: 'String',
    isPassword: false,
    showAsPercent: false,
    ...extra
  };
}

export function choice(id: string, extra: Partial<ChoiceControl> = {}): ChoiceControl {
  return {
    ...base,
    ...field,
    id,
    type: 'Choice',
    rawType: 'ChoiceFormControlProperties',
    name: id,
    dataField: { source: 'List', internalName: id },
    choices: [],
    displayFormat: 'DropDownList',
    fillInChoice: false,
    repeatColumns: 1,
    repeatDirection: 'Vertical',
    dataType: 'String',
    ...extra
  };
}

export function dateTime(id: string, extra: Partial<DateTimeControl> = {}): DateTimeControl {
  return {
    ...base,
    ...field,
    id,
    type: 'DateTime',
    rawType: 'DateTimeFormControlProperties',
    name: id,
    dataField: { source: 'List', internalName: id },
    dateOnly: true,
    defaultValueType: 'Blank',
    ...extra
  };
}

export function people(id: string, extra: Partial<PeoplePickerControl> = {}): PeoplePickerControl {
  return {
    ...base,
    ...field,
    id,
    type: 'PeoplePicker',
    rawType: 'PeoplePickerFormControlProperties',
    name: id,
    dataField: { source: 'List', internalName: id },
    multiSelect: false,
    maximumEntities: 25,
    accountTypes: ['User'],
    ...extra
  };
}

export function attachment(id: string, extra: Partial<AttachmentControl> = {}): AttachmentControl {
  return {
    ...base,
    id,
    type: 'Attachment',
    rawType: 'AttachmentFormControlProperties',
    name: 'Attachments',
    minimumAttachments: 0,
    maximumFileSize: 0,
    whitelist: [],
    blockedExtensions: [],
    ...extra
  };
}

export function calculation(id: string, formula: string, extra: Partial<CalculationControl> = {}): CalculationControl {
  return {
    ...base,
    ...field,
    id,
    type: 'Calculation',
    rawType: 'CalculationFormControlProperties',
    formula: { source: formula, ast: ast(formula) },
    recalculateOnNew: true,
    recalculateOnEdit: true,
    recalculateOnView: true,
    dataType: 'String',
    decimals: 0,
    showAsPercent: false,
    showThousandSeparator: false,
    ...extra
  };
}

export function rule(id: string, expression: string, controlIds: string[], extra: Partial<RuleDefinition> = {}): RuleDefinition {
  return {
    id,
    title: id,
    type: 'Formatting',
    controlIds,
    expression: expression ? ast(expression) : null,
    expressionSource: expression,
    hide: false,
    disable: false,
    format: {},
    inert: !expression || (!controlIds.length && (extra.type || 'Formatting') === 'Formatting'),
    ...extra
  };
}

export function formOf(controls: ControlDefinition[], rules: RuleDefinition[] = []): FormDefinition {
  const map: Record<string, ControlDefinition> = {};
  const byName: Record<string, string> = {};
  controls.forEach((c) => {
    map[c.id] = c;
    if (c.name) byName[c.name.toLowerCase()] = c.id;
  });
  return {
    parserVersion: 1,
    id: 'test',
    version: '1',
    formType: 'ListForm',
    css: '',
    layouts: [{ name: 'Desktop', width: 700, height: 500, isMobileAppLayout: false, style: {}, items: [] }],
    controls: map,
    controlsByName: byName,
    rules,
    variables: [],
    unsupported: { script: false, scriptUrls: [], cssUrls: [] },
    diagnostics: []
  };
}
