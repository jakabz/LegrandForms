import type {
  CompareOperator,
  ControlBase,
  ControlMode,
  ControlStyle,
  ControlType,
  ControlValidators,
  DataFieldRef,
  FieldControlBase,
  HorizontalAlignment,
  KnownBindingProperty,
  PropertyBinding
} from '../../model/controls';
import { normalizeGuid, normalizeTextValue } from '../normalize';
import type { ParseContext } from '../ParseContext';
import { bool, child, children, int, nonEmptyText, text, XmlNode } from '../xml';

export type ControlParser<T> = (node: XmlNode, ctx: ParseContext) => T;

/** `i:type` without namespace prefix, e.g. `d2p1:TextBoxFormControlProperties` → `TextBoxFormControlProperties`. */
export function rawTypeOf(node: XmlNode): string {
  const type = node['@_type'];
  const value = typeof type === 'string' ? type : '';
  const colon = value.lastIndexOf(':');
  return colon >= 0 ? value.substring(colon + 1) : value;
}

export function controlIdOf(node: XmlNode): string {
  return normalizeGuid(text(node, 'UniqueId'));
}

/** Plain text property: entities decoded, NBSP → space, trimmed; empty → undefined. */
export function plainText(node: XmlNode, key: string): string | undefined {
  const value = normalizeTextValue(text(node, key));
  return value ? value : undefined;
}

/** SharePoint RTE font size classes (`nf-rteFontSize-N`) used by the Nintex designer. */
const FONT_SIZE_CLASSES: Record<string, string> = {
  '1': '8pt',
  '2': '10pt',
  '3': '12pt',
  '4': '18pt',
  '5': '24pt',
  '6': '36pt',
  '7': '48pt'
};

const ALIGNMENTS: ReadonlyArray<HorizontalAlignment> = ['Left', 'Center', 'Right', 'Justify'];

export function readStyle(node: XmlNode): ControlStyle {
  const style: ControlStyle = {};
  if (bool(node, 'Bold', false)) style.bold = true;
  if (bool(node, 'Italics', false)) style.italics = true;
  if (bool(node, 'Underline', false)) style.underline = true;
  if (bool(node, 'StrikeThrough', false)) style.strikeThrough = true;
  const fontColor = nonEmptyText(node, 'FontColor');
  if (fontColor) style.fontColor = fontColor.trim();
  const backgroundColor = nonEmptyText(node, 'BackgroundColor');
  if (backgroundColor) style.backgroundColor = backgroundColor.trim();
  let fontSize = nonEmptyText(node, 'FontSize');
  if (!fontSize) {
    const sizeClass = /nf-rteFontSize-(\d)/.exec(nonEmptyText(node, 'FontSizeItemId') || '');
    if (sizeClass) fontSize = FONT_SIZE_CLASSES[sizeClass[1]];
  }
  if (fontSize) style.fontSize = fontSize.trim();
  const fontFamily = nonEmptyText(node, 'FontFamily');
  if (fontFamily) style.fontFamily = fontFamily.trim();
  const alignment = nonEmptyText(node, 'HorizontalAlignment');
  if (alignment && ALIGNMENTS.indexOf(alignment as HorizontalAlignment) >= 0) {
    style.horizontalAlignment = alignment as HorizontalAlignment;
  }
  const border = child(node, 'Border');
  const linePosition = border ? nonEmptyText(border, 'LinePosition') : undefined;
  if (linePosition) {
    style.border = { linePosition };
    const color = nonEmptyText(node, 'BorderColor');
    if (color) style.border.color = color;
    const width = int(node, 'BorderWidth', NaN);
    if (!isNaN(width)) style.border.width = width;
    const borderStyle = nonEmptyText(node, 'BorderStyle');
    if (borderStyle) style.border.style = borderStyle;
  }
  return style;
}

const KNOWN_BINDINGS: ReadonlyArray<KnownBindingProperty> = ['IsEnabled', 'IsVisible', 'IsRequired', 'DefaultValue'];

/** `InsertReferences` → property bindings. Unknown keys → `UnknownBinding` diagnostic, ignored. */
export function readBindings(node: XmlNode, controlId: string, ctx: ParseContext): PropertyBinding[] {
  const bindings: PropertyBinding[] = [];
  children(child(node, 'InsertReferences'), 'KeyValueOfstringstring').forEach((pair) => {
    const key = (text(pair, 'Key') || '').trim();
    const rawValue = text(pair, 'Value');
    const known = KNOWN_BINDINGS.filter((k) => k.toLowerCase() === key.toLowerCase())[0];
    if (!known) {
      ctx.diagnostics.report('warn', 'UnknownBinding', `Ignored property binding ${key} = ${rawValue || ''}`, {
        controlId,
        source: rawValue
      });
      return;
    }
    const value = ctx.compileValue(rawValue, { controlId, property: `InsertReferences.${known}` }, true);
    if (value) {
      bindings.push({ property: known, value });
    }
  });
  return bindings;
}

export function readControlBase<T extends ControlType>(node: XmlNode, type: T, ctx: ParseContext): ControlBase & { type: T } {
  const id = controlIdOf(node);
  const base: ControlBase & { type: T } = {
    id,
    type,
    rawType: rawTypeOf(node),
    isVisible: bool(node, 'IsVisible', true),
    isEnabled: bool(node, 'IsEnabled', true),
    canResizeAtRuntime: bool(node, 'CanResizeAtRuntime', false),
    style: readStyle(node),
    bindings: readBindings(node, id, ctx)
  };
  const typeId = normalizeGuid(text(node, 'FormControlTypeUniqueId'));
  if (typeId) base.typeId = typeId;
  const name = plainText(node, 'Name');
  if (name) base.name = name;
  const displayName = plainText(node, 'DisplayName');
  if (displayName) base.displayName = displayName;
  const cssClass = plainText(node, 'CssClass');
  if (cssClass) base.cssClass = cssClass.replace(/\s+/g, ' ');
  const helpText = plainText(node, 'HelpText');
  if (helpText) base.helpText = helpText;
  return base;
}

/** `List:Title` → { source: 'List', internalName: 'Title' }. Values without a source prefix are ignored. */
export function parseDataField(raw: string | undefined): DataFieldRef | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  const colon = value.indexOf(':');
  if (colon <= 0 || colon === value.length - 1) return undefined;
  return { source: value.substring(0, colon), internalName: value.substring(colon + 1) };
}

const CONTROL_MODES: ReadonlyArray<ControlMode> = ['Auto', 'Edit', 'Display', 'ReadOnly'];
const COMPARE_OPERATORS: ReadonlyArray<CompareOperator> = [
  'Equal',
  'NotEqual',
  'GreaterThan',
  'GreaterThanEqual',
  'LessThan',
  'LessThanEqual',
  'DataTypeCheck'
];

export function readValidators(node: XmlNode): ControlValidators {
  const validators: ControlValidators = {};
  const pattern = text(node, 'RegularExpression');
  if (bool(node, 'UseRegularExpressionValidation', false) && pattern && pattern.trim()) {
    validators.regex = { pattern };
    const message = plainText(node, 'RegularExpressionErrorMessage');
    if (message) validators.regex.message = message;
  }
  if (bool(node, 'UseRangeValidation', false)) {
    validators.range = {};
    const minimum = plainText(node, 'MinimumValue');
    const maximum = plainText(node, 'MaximumValue');
    const message = plainText(node, 'RangeErrorMessage');
    if (minimum) validators.range.minimum = minimum;
    if (maximum) validators.range.maximum = maximum;
    if (message) validators.range.message = message;
  }
  if (bool(node, 'UseCompareValidation', false)) {
    const operator = nonEmptyText(node, 'CompareOperator') || 'Equal';
    validators.compare = {
      operator: (COMPARE_OPERATORS.indexOf(operator as CompareOperator) >= 0 ? operator : 'Equal') as CompareOperator,
      compareTo: nonEmptyText(node, 'CompareTo') || 'Value'
    };
    const valueToCompare = plainText(node, 'ValueToCompare');
    const controlToCompare = plainText(node, 'ControlToCompare');
    const message = plainText(node, 'CompareErrorMessage');
    if (valueToCompare) validators.compare.valueToCompare = valueToCompare;
    if (controlToCompare) validators.compare.controlToCompare = controlToCompare;
    if (message) validators.compare.message = message;
  }
  return validators;
}

export function readFieldBase<T extends ControlType>(node: XmlNode, type: T, ctx: ParseContext): FieldControlBase & { type: T } {
  const base = readControlBase(node, type, ctx);
  const modeText = nonEmptyText(node, 'ControlMode') || 'Auto';
  const field: FieldControlBase & { type: T } = {
    ...base,
    isRequired: bool(node, 'IsRequired', false),
    controlMode: (CONTROL_MODES.indexOf(modeText as ControlMode) >= 0 ? modeText : 'Auto') as ControlMode,
    validators: readValidators(node)
  };
  const dataField = parseDataField(text(node, 'DataField'));
  if (dataField) field.dataField = dataField;
  const dataFieldDisplayName = plainText(node, 'DataFieldDisplayName');
  if (dataFieldDisplayName) field.dataFieldDisplayName = dataFieldDisplayName;
  const requiredErrorMessage = plainText(node, 'RequiredErrorMessage');
  if (requiredErrorMessage) field.requiredErrorMessage = requiredErrorMessage;
  const controlCssClass = plainText(node, 'ControlCssClass');
  if (controlCssClass) field.controlCssClass = controlCssClass;
  const defaultValue = ctx.compileValue(text(node, 'DefaultValue'), { controlId: base.id, property: 'DefaultValue' });
  if (defaultValue) field.defaultValue = defaultValue;
  if (bool(node, 'UseCustomValidation', false)) {
    const expression = ctx.compileExpression(text(node, 'CustomValidationFunction'), {
      controlId: base.id,
      property: 'CustomValidationFunction'
    });
    if (expression) {
      field.customValidation = { ...expression };
      const message = ctx.compileValue(text(node, 'CustomErrorMessage'), { controlId: base.id, property: 'CustomErrorMessage' });
      if (message) field.customValidation.message = message;
    }
  }
  return field;
}
