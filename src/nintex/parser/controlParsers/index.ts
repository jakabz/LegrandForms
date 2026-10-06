import type { ControlDefinition } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import type { XmlNode } from '../xml';
import { parseAttachment } from './AttachmentParser';
import { parseButton } from './ButtonParser';
import { parseCalculation } from './CalculationParser';
import { parseChoice } from './ChoiceParser';
import type { ControlParser } from './common';
import { parseDateTime } from './DateTimeParser';
import { parseImage } from './ImageParser';
import { parseLabel } from './LabelParser';
import { parseLookup } from './LookupParser';
import { parseMultiLineTextBox } from './MultiLineTextBoxParser';
import { parsePanel } from './PanelParser';
import { parsePeoplePicker } from './PeoplePickerParser';
import { parseTextBox } from './TextBoxParser';
import { parseUnsupported } from './UnsupportedParser';

export type AnyControlParser = ControlParser<ControlDefinition>;

/** Parsers keyed by `i:type` (without namespace prefix). */
export const controlParsersByType: Record<string, AnyControlParser> = {
  LabelFormControlProperties: parseLabel,
  TextBoxFormControlProperties: parseTextBox,
  MultiLineTextBoxFormControlProperties: parseMultiLineTextBox,
  ChoiceFormControlProperties: parseChoice,
  DateTimeFormControlProperties: parseDateTime,
  PeoplePickerFormControlProperties: parsePeoplePicker,
  SharePointLookupFormControlProperties: parseLookup,
  AttachmentFormControlProperties: parseAttachment,
  CalculationFormControlProperties: parseCalculation,
  ImageFormControlProperties: parseImage,
  ButtonFormControlProperties: parseButton,
  PanelFormControlProperties: parsePanel
};

/** Parsers keyed by `FormControlTypeUniqueId` (secondary identification). */
export const controlParsersByTypeId: Record<string, AnyControlParser> = {
  'c0a89c70-0781-4bd4-8623-f73675005e00': parseLabel,
  'c0a89c70-0781-4bd4-8623-f73675005e02': parseChoice,
  'c0a89c70-0781-4bd4-8623-f73675005e03': parseDateTime,
  'c0a89c70-0781-4bd4-8623-f73675005e05': parseTextBox,
  'c0a89c70-0781-4bd4-8623-f73675005e06': parseMultiLineTextBox,
  'c0a89c70-0781-4bd4-8623-f73675005e08': parseImage,
  'c0a89c70-0781-4bd4-8623-f73675005e09': parseButton,
  'c0a89c70-0781-4bd4-8623-f73675005e12': parsePeoplePicker,
  'c0a89c70-0781-4bd4-8623-f73675005e15': parseLookup,
  'c0a89c70-0781-4bd4-8623-f73675005e17': parseCalculation,
  '5f8b447a-4195-485b-9a04-477d7f24be73': parseAttachment
};

/** Picks the parser by `i:type`, then by type id; unknown types get the Unsupported parser. Never throws. */
export function parseControl(node: XmlNode, rawType: string, typeId: string, ctx: ParseContext): ControlDefinition {
  const parser = controlParsersByType[rawType] || controlParsersByTypeId[typeId] || parseUnsupported;
  return parser(node, ctx);
}
