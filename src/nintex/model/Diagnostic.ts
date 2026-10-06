export type DiagnosticLevel = 'info' | 'warn' | 'error';

/**
 * Diagnostic codes (Rendszerterv §16). The core reports bad input with these instead of throwing.
 */
export type DiagnosticCode =
  | 'XmlParseError'
  | 'UnsupportedControl'
  | 'UnsupportedFunction'
  | 'UnsupportedReference'
  | 'OrphanReference'
  | 'EmptyRule'
  | 'ExpressionParseError'
  | 'ExpressionRuntimeError'
  | 'MissingField'
  | 'MissingLayout'
  | 'UnknownBinding'
  | 'ScriptIgnored'
  | 'CircularDependency'
  | 'UnresolvedLabel'
  | 'InvalidValue';

export interface Diagnostic {
  level: DiagnosticLevel;
  code: DiagnosticCode;
  message: string;
  controlId?: string;
  ruleId?: string;
  /** Source text that caused the diagnostic (expression, CSS fragment, …). */
  source?: string;
}

export function createDiagnostic(
  level: DiagnosticLevel,
  code: DiagnosticCode,
  message: string,
  extra?: Pick<Diagnostic, 'controlId' | 'ruleId' | 'source'>
): Diagnostic {
  const diagnostic: Diagnostic = { level, code, message };
  if (extra) {
    if (extra.controlId !== undefined) diagnostic.controlId = extra.controlId;
    if (extra.ruleId !== undefined) diagnostic.ruleId = extra.ruleId;
    if (extra.source !== undefined) diagnostic.source = extra.source;
  }
  return diagnostic;
}

/** Collects diagnostics and de-duplicates identical entries (same code, ids and message). */
export class DiagnosticBag {
  private readonly _items: Diagnostic[] = [];
  private readonly _keys: Set<string> = new Set();

  public add(diagnostic: Diagnostic): void {
    const key = [diagnostic.level, diagnostic.code, diagnostic.controlId, diagnostic.ruleId, diagnostic.message].join('|');
    if (this._keys.has(key)) {
      return;
    }
    this._keys.add(key);
    this._items.push(diagnostic);
  }

  public report(
    level: DiagnosticLevel,
    code: DiagnosticCode,
    message: string,
    extra?: Pick<Diagnostic, 'controlId' | 'ruleId' | 'source'>
  ): void {
    this.add(createDiagnostic(level, code, message, extra));
  }

  public get items(): ReadonlyArray<Diagnostic> {
    return this._items;
  }

  public toArray(): Diagnostic[] {
    return this._items.slice();
  }
}
