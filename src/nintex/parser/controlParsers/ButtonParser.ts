import type { ButtonControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { bool, int, nonEmptyText, XmlNode } from '../xml';
import { plainText, readControlBase } from './common';

export function parseButton(node: XmlNode, ctx: ParseContext): ButtonControl {
  const base = readControlBase(node, 'Button', ctx);
  const clientClick = nonEmptyText(node, 'ClientClick');
  const control: ButtonControl = {
    ...base,
    command: nonEmptyText(node, 'ButtonCommand') || 'Save',
    buttonType: nonEmptyText(node, 'ButtonType') || 'Button',
    text: plainText(node, 'Text') || '',
    causesValidation: bool(node, 'CausesValidation', true),
    visibleWhenReadOnly: bool(node, 'VisibleWhenReadOnly', false),
    enabledWhenReadOnly: bool(node, 'EnabledWhenReadOnly', false),
    showOnRibbon: bool(node, 'ShowOnRibbon', false),
    hasClientClick: !!clientClick
  };
  const readOnlyText = plainText(node, 'ReadOnlyText');
  if (readOnlyText) control.readOnlyText = readOnlyText;
  const confirmation = plainText(node, 'ConfirmationMessage');
  if (confirmation) control.confirmationMessage = confirmation;
  const sequence = int(node, 'RibbonButtonSequence', NaN);
  if (!isNaN(sequence)) control.ribbonSequence = sequence;
  const imageUrl = nonEmptyText(node, 'ImageUrl');
  if (imageUrl) control.imageUrl = imageUrl.trim();
  if (clientClick) {
    // Custom JavaScript is never executed (Rendszerterv §14).
    ctx.diagnostics.report('warn', 'ScriptIgnored', 'Button ClientClick script is not executed', {
      controlId: base.id,
      source: clientClick
    });
  }
  return control;
}
