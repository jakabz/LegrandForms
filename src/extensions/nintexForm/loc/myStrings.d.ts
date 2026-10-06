declare interface INintexFormFormCustomizerStrings {
  Save: string;
  SaveAndSubmit: string;
  Cancel: string;
  Close: string;
  Loading: string;
  Saving: string;
  Ok: string;
  ConfirmTitle: string;

  LoadErrorTitle: string;
  LoadErrorConfig: string;
  BackToList: string;
  ValidationSummary: string;
  SaveErrorTitle: string;
  ConcurrencyError: string;
  Reload: string;
  AttachmentErrors: string;

  Required: string;
  Number: string;
  Integer: string;
  Date: string;
  MaxLength: string;
  Regex: string;
  Range: string;
  Compare: string;
  Custom: string;
  Rule: string;
  MaxEntities: string;
  MinAttachments: string;
  MaxAttachments: string;
  FileType: string;
  FileSize: string;
  Server: string;

  SelectPlaceholder: string;
  EmptyOption: string;
  SpecifyOwnValue: string;
  PeoplePickerPlaceholder: string;
  LookupLoading: string;
  LookupLoadError: string;
  AttachFile: string;
  RemoveAttachment: string;
  NoAttachments: string;
  PendingUpload: string;
  UnsupportedControl: string;

  DatePlaceholder: string;
  GoToToday: string;
  PrevMonth: string;
  NextMonth: string;
  Months: string[];
  ShortMonths: string[];
  Days: string[];
  ShortDays: string[];

  DiagnosticsButton: string;
  DiagnosticsTitle: string;
  DiagnosticsTab: string;
  RuleTraceTab: string;
  ShowControlIds: string;
  NoDiagnostics: string;
  ColumnLevel: string;
  ColumnCode: string;
  ColumnMessage: string;
  ColumnControl: string;
  ColumnRule: string;
  ColumnResult: string;
}

declare module 'NintexFormFormCustomizerStrings' {
  const strings: INintexFormFormCustomizerStrings;
  export = strings;
}
