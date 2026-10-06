import type { AttachmentControl } from '../../model/controls';
import type { ParseContext } from '../ParseContext';
import { int, nonEmptyText, stringList, XmlNode } from '../xml';
import { plainText, readControlBase } from './common';

function normalizeExtension(ext: string): string {
  return ext.trim().replace(/^\*?\./, '').toLowerCase();
}

export function parseAttachment(node: XmlNode, ctx: ParseContext): AttachmentControl {
  const control: AttachmentControl = {
    ...readControlBase(node, 'Attachment', ctx),
    minimumAttachments: Math.max(0, int(node, 'MinimumAttachments', 0)),
    maximumFileSize: Math.max(0, int(node, 'MaximumFileSize', 0)),
    whitelist: stringList(node, 'Whitelist').map(normalizeExtension).filter((e) => e.length > 0),
    blockedExtensions: stringList(node, 'BlockedFileExtenstions').map(normalizeExtension).filter((e) => e.length > 0)
  };
  const mode = nonEmptyText(node, 'MaximumAttachmentsMode') || 'Limited';
  const maximum = int(node, 'MaximumAttachments', 0);
  if (mode !== 'Unlimited' && maximum > 0) control.maximumAttachments = maximum;
  const minMessage = plainText(node, 'MinimumAttachmentsErrorMessage');
  if (minMessage) control.minimumAttachmentsErrorMessage = minMessage;
  const whitelistMessage = plainText(node, 'WhitelistErrorMessage');
  if (whitelistMessage) control.whitelistErrorMessage = whitelistMessage;
  return control;
}
