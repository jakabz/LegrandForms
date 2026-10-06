import type * as React from 'react';
import type { ControlType } from '../../nintex/model/controls';
import { AttachmentControl } from './AttachmentControl';
import { ButtonControl } from './ButtonControl';
import { CalculationControl } from './CalculationControl';
import { ChoiceControl } from './ChoiceControl';
import { DateTimeControl } from './DateTimeControl';
import { ImageControl } from './ImageControl';
import { LabelControl } from './LabelControl';
import { LookupControl } from './LookupControl';
import { MultiLineTextBoxControl } from './MultiLineTextBoxControl';
import { PeoplePickerControl } from './PeoplePickerControl';
import { TextBoxControl } from './TextBoxControl';
import type { IControlProps } from './types';
import { UnsupportedControl } from './UnsupportedControl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each component narrows its own definition type
type AnyControlComponent = React.ComponentType<IControlProps<any>>;

/** Control type → component. Panels are rendered by ControlHost (nested layout). */
export const controlRegistry: Record<ControlType, AnyControlComponent | undefined> = {
  Label: LabelControl,
  TextBox: TextBoxControl,
  MultiLineTextBox: MultiLineTextBoxControl,
  Choice: ChoiceControl,
  DateTime: DateTimeControl,
  PeoplePicker: PeoplePickerControl,
  Lookup: LookupControl,
  Attachment: AttachmentControl,
  Calculation: CalculationControl,
  Image: ImageControl,
  Button: ButtonControl,
  Panel: undefined,
  Unsupported: UnsupportedControl
};
