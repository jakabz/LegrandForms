import { isCheckBoxDisplayFormat, isRadioDisplayFormat } from '../controls';

describe('display format helpers', () => {
  it('recognises radio button formats (Nintex classic exports RadioButtonList)', () => {
    ['RadioButtonList', 'RadioButtons', 'OptionButtons', 'radiobuttonlist'].forEach((f) => expect(isRadioDisplayFormat(f)).toBe(true));
    ['DropDownList', 'ListBox', 'CheckBoxList', '', undefined].forEach((f) => expect(isRadioDisplayFormat(f)).toBe(false));
  });

  it('recognises check box formats', () => {
    ['CheckBoxList', 'CheckBoxes'].forEach((f) => expect(isCheckBoxDisplayFormat(f)).toBe(true));
    ['DropDownList', 'RadioButtonList', 'MultiSelect', undefined].forEach((f) => expect(isCheckBoxDisplayFormat(f)).toBe(false));
  });
});
