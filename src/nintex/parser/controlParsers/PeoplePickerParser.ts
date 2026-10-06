import type { PeoplePickerControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { bool, int, stringList, XmlNode } from '../xml';
import { plainText, readFieldBase } from './common';

export function parsePeoplePicker(node: XmlNode, ctx: ParseContext): PeoplePickerControl {
  const accountTypes = stringList(node, 'SelectionSet', 'PeopleEditor.AccountType').map((t) => t.trim());
  const control: PeoplePickerControl = {
    ...readFieldBase(node, 'PeoplePicker', ctx),
    multiSelect: bool(node, 'MultiSelect', false),
    maximumEntities: int(node, 'MaximumEntities', 25),
    accountTypes: accountTypes.length ? accountTypes : ['User']
  };
  const group = plainText(node, 'SharePointGroup');
  if (group) control.sharePointGroup = group;
  const dialogTitle = plainText(node, 'DialogTitle');
  if (dialogTitle) control.dialogTitle = dialogTitle;
  return control;
}
