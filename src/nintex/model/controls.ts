import type { Ast, ReferenceNode } from '../expression/ast';

export type ControlType =
  | 'Label'
  | 'TextBox'
  | 'MultiLineTextBox'
  | 'Choice'
  | 'DateTime'
  | 'PeoplePicker'
  | 'Lookup'
  | 'Attachment'
  | 'Calculation'
  | 'Image'
  | 'Button'
  | 'Panel'
  | 'Unsupported';

export type HorizontalAlignment = 'Left' | 'Center' | 'Right' | 'Justify';

export interface BorderDefinition {
  /** Nintex `Border/LinePosition`, e.g. `Top`. */
  linePosition: string;
  color?: string;
  width?: number;
  style?: string;
}

/** Visual style of a control. Only explicitly set properties are present. */
export interface ControlStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strikeThrough?: boolean;
  fontColor?: string;
  backgroundColor?: string;
  fontSize?: string;
  fontFamily?: string;
  horizontalAlignment?: HorizontalAlignment;
  border?: BorderDefinition;
}

/** A piece of a text template: literal text or a `{Namespace:Name}` token. */
export type TemplatePart = { kind: 'text'; text: string } | { kind: 'reference'; ref: ReferenceNode };

/**
 * A property that may be plain text, a token template or an expression (Rendszerterv §8.1).
 * - literal:    `Készítés alatt`
 * - template:   `Created by {Common:CurrentUser} on …` (tokens substituted as text)
 * - expression: `If({ItemProperty:Form}=="X","a","b")`, `{ItemProperty:AuditOrg}`
 */
export type ValueSource =
  | { kind: 'literal'; text: string }
  | { kind: 'template'; source: string; parts: TemplatePart[] }
  | { kind: 'expression'; source: string; ast: Ast };

export interface CompiledExpression {
  /** Normalized source text. */
  source: string;
  ast: Ast;
}

export type KnownBindingProperty = 'IsEnabled' | 'IsVisible' | 'IsRequired' | 'DefaultValue';

/** `InsertReferences` entry: a control property bound to an expression. */
export interface PropertyBinding {
  property: KnownBindingProperty;
  value: ValueSource;
}

export interface DataFieldRef {
  /** `List` for list item fields; other sources (`Task`) are ignored by the runtime. */
  source: string;
  /** SharePoint internal name, `_x0020_` encoding preserved. */
  internalName: string;
}

export type ControlMode = 'Auto' | 'Edit' | 'Display' | 'ReadOnly';

export type CompareOperator =
  | 'Equal'
  | 'NotEqual'
  | 'GreaterThan'
  | 'GreaterThanEqual'
  | 'LessThan'
  | 'LessThanEqual'
  | 'DataTypeCheck';

export interface ControlValidators {
  regex?: { pattern: string; message?: string };
  range?: { minimum?: string; maximum?: string; message?: string };
  compare?: {
    operator: CompareOperator;
    /** `Value` or `Control` (Nintex `CompareTo`). */
    compareTo: string;
    valueToCompare?: string;
    /** Name of the control to compare with (resolved case-insensitively). */
    controlToCompare?: string;
    message?: string;
  };
}

export interface ControlBase {
  id: string;
  type: ControlType;
  /** Nintex `i:type` without namespace prefix, e.g. `TextBoxFormControlProperties`. */
  rawType: string;
  /** Nintex `FormControlTypeUniqueId` (lower-case). */
  typeId?: string;
  name?: string;
  displayName?: string;
  cssClass?: string;
  isVisible: boolean;
  isEnabled: boolean;
  canResizeAtRuntime: boolean;
  style: ControlStyle;
  helpText?: string;
  bindings: PropertyBinding[];
}

export interface FieldControlBase extends ControlBase {
  dataField?: DataFieldRef;
  dataFieldDisplayName?: string;
  isRequired: boolean;
  requiredErrorMessage?: string;
  controlMode: ControlMode;
  controlCssClass?: string;
  defaultValue?: ValueSource;
  /** Present only when `UseCustomValidation` is true and the function is not empty. Expression true → error (K-03). */
  customValidation?: CompiledExpression & { message?: ValueSource };
  validators: ControlValidators;
}

export interface LabelControl extends ControlBase {
  type: 'Label';
  /** May contain HTML; sanitize before rendering. */
  text: string;
  /** Target control `Name` as written in the XML (may be misspelled or point nowhere). */
  associatedControlName?: string;
  /** Resolved target control id (case-insensitive `Name` match). */
  associatedControlId?: string;
}

export type TextDataType = 'String' | 'Double' | 'Integer' | 'Currency' | string;

export interface TextBoxControl extends FieldControlBase {
  type: 'TextBox';
  dataType: TextDataType;
  maxLength?: number;
  isPassword: boolean;
  showAsPercent: boolean;
}

export interface MultiLineTextBoxControl extends FieldControlBase {
  type: 'MultiLineTextBox';
  isRichText: boolean;
  richTextMode: 'FullHtml' | 'Compatible' | string;
  isAppendText: boolean;
}

/** Nintex classic exports `RadioButtonList` / `CheckBoxList`; older names are accepted too. */
export type ChoiceDisplayFormat = 'DropDownList' | 'RadioButtonList' | 'OptionButtons' | 'RadioButtons' | 'CheckBoxList' | 'CheckBoxes' | 'ListBox' | string;

/** Radio button display (Choice `DisplayFormat`, Lookup `DisplayFormat` / `SingleDisplayMode`). */
export function isRadioDisplayFormat(format: string | undefined): boolean {
  return !!format && /^(RadioButtonList|RadioButtons|OptionButtons)$/i.test(format);
}

/** Check box display (Choice `DisplayFormat`, Lookup `MultipleDisplayMode`). */
export function isCheckBoxDisplayFormat(format: string | undefined): boolean {
  return !!format && /^(CheckBoxList|CheckBoxes)$/i.test(format);
}

export interface ChoiceControl extends FieldControlBase {
  type: 'Choice';
  choices: ValueSource[];
  displayFormat: ChoiceDisplayFormat;
  fillInChoice: boolean;
  repeatColumns: number;
  repeatDirection: 'Vertical' | 'Horizontal' | string;
  dataType: string;
  pleaseSelectText?: string;
  specifyValueText?: string;
}

export interface DateTimeControl extends FieldControlBase {
  type: 'DateTime';
  dateOnly: boolean;
  /** `Blank`, `Today` or `Expression`. */
  defaultValueType: string;
}

export interface PeoplePickerControl extends FieldControlBase {
  type: 'PeoplePicker';
  multiSelect: boolean;
  maximumEntities: number;
  sharePointGroup?: string;
  /** `User`, `SecGroup`, `SPGroup`, `DL`. */
  accountTypes: string[];
  dialogTitle?: string;
}

export interface LookupCascade {
  controlName?: string;
  controlId?: string;
  field?: string;
  type: string;
  emptyFilterAction?: string;
}

export interface LookupControl extends FieldControlBase {
  type: 'Lookup';
  /** Source list referenced by title (K-06). */
  lookupList: string;
  lookupField: string;
  lookupWeb?: string;
  lookupView?: string;
  allowMultipleValues: boolean;
  displayFormat: string;
  singleDisplayMode?: string;
  multipleDisplayMode?: string;
  /** Option list columns for radio / check box display. */
  repeatColumns: number;
  repeatDirection: 'Vertical' | 'Horizontal' | string;
  cascade?: LookupCascade;
  executeInNewMode: boolean;
  executeInEditMode: boolean;
  executeInViewMode: boolean;
}

export interface AttachmentControl extends ControlBase {
  type: 'Attachment';
  minimumAttachments: number;
  minimumAttachmentsErrorMessage?: string;
  /** 0 or missing → unlimited. */
  maximumAttachments?: number;
  /** Bytes; 0 → unlimited. */
  maximumFileSize: number;
  whitelist: string[];
  whitelistErrorMessage?: string;
  blockedExtensions: string[];
}

export interface CalculationControl extends FieldControlBase {
  type: 'Calculation';
  formula: CompiledExpression | null;
  recalculateOnNew: boolean;
  recalculateOnEdit: boolean;
  recalculateOnView: boolean;
  dataType: string;
  decimals: number;
  prefix?: string;
  suffix?: string;
  showAsPercent: boolean;
  showThousandSeparator: boolean;
}

export interface ImageControl extends ControlBase {
  type: 'Image';
  imageUrl: string;
  alternateText?: string;
  horizontalWidth?: string;
  verticalHeight?: string;
}

export type ButtonCommand = 'Save' | 'SaveAndSubmit' | 'Cancel' | 'SaveAndContinue' | 'Print' | string;

export interface ButtonControl extends ControlBase {
  type: 'Button';
  command: ButtonCommand;
  buttonType: string;
  text: string;
  readOnlyText?: string;
  causesValidation: boolean;
  visibleWhenReadOnly: boolean;
  enabledWhenReadOnly: boolean;
  confirmationMessage?: string;
  showOnRibbon: boolean;
  ribbonSequence?: number;
  imageUrl?: string;
  /** True when the export contains `ClientClick` script (never executed). */
  hasClientClick: boolean;
}

export interface PanelControl extends ControlBase {
  type: 'Panel';
}

export interface UnsupportedControl extends ControlBase {
  type: 'Unsupported';
  reason: string;
}

export type ControlDefinition =
  | LabelControl
  | TextBoxControl
  | MultiLineTextBoxControl
  | ChoiceControl
  | DateTimeControl
  | PeoplePickerControl
  | LookupControl
  | AttachmentControl
  | CalculationControl
  | ImageControl
  | ButtonControl
  | PanelControl
  | UnsupportedControl;

export type FieldControlDefinition =
  | TextBoxControl
  | MultiLineTextBoxControl
  | ChoiceControl
  | DateTimeControl
  | PeoplePickerControl
  | LookupControl
  | CalculationControl;

const FIELD_CONTROL_TYPES: ReadonlyArray<ControlType> = [
  'TextBox',
  'MultiLineTextBox',
  'Choice',
  'DateTime',
  'PeoplePicker',
  'Lookup',
  'Calculation'
];

export function isFieldControl(control: ControlDefinition): control is FieldControlDefinition {
  return FIELD_CONTROL_TYPES.indexOf(control.type) >= 0;
}

/** Internal name of the list field a control is bound to, or undefined (unbound or non-`List` source). */
export function getListFieldName(control: ControlDefinition): string | undefined {
  if (!isFieldControl(control) || !control.dataField || control.dataField.source !== 'List') {
    return undefined;
  }
  return control.dataField.internalName;
}
