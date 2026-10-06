import type { ValidationIssue } from '../nintex/rules/types';

/** Replaces `{name}` placeholders. */
export function format(template: string, params: Record<string, string | number | undefined> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match: string, key: string) => (params[key] === undefined ? match : String(params[key])));
}

const DEFAULT_MESSAGES: Record<string, keyof INintexFormFormCustomizerStrings> = {
  required: 'Required',
  number: 'Number',
  integer: 'Integer',
  date: 'Date',
  maxLength: 'MaxLength',
  regex: 'Regex',
  range: 'Range',
  compare: 'Compare',
  custom: 'Custom',
  rule: 'Rule',
  maxEntities: 'MaxEntities',
  minAttachments: 'MinAttachments',
  maxAttachments: 'MaxAttachments',
  fileType: 'FileType',
  fileSize: 'FileSize',
  server: 'Server'
};

/** The message shown for a validation issue: the form-defined message, or the localized default. */
export function issueMessage(issue: ValidationIssue, strings: INintexFormFormCustomizerStrings): string {
  if (issue.message) return issue.message;
  const key = DEFAULT_MESSAGES[issue.code];
  const template = key ? strings[key] : strings.Custom;
  return format(typeof template === 'string' ? template : strings.Custom, issue.params);
}
