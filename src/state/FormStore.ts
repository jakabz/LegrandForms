import { collectReferencedItemProperties } from '../nintex/analysis/inventory';
import type { FormMode } from '../nintex/expression/context';
import type { ExprValue, PersonValue } from '../nintex/expression/values';
import { isEmptyValue } from '../nintex/expression/values';
import type { AttachmentControl, ButtonControl, ControlDefinition } from '../nintex/model/controls';
import { getListFieldName } from '../nintex/model/controls';
import type { Diagnostic } from '../nintex/model/Diagnostic';
import { DiagnosticBag } from '../nintex/model/Diagnostic';
import type { FormDefinition } from '../nintex/model/FormDefinition';
import { RuleEngine } from '../nintex/rules/RuleEngine';
import type { ControlRuleState, RuleTraceEntry, ValidationIssue } from '../nintex/rules/types';
import type { FieldSchema } from '../services/FieldSchema';
import type { IFormPersistence } from '../services/ItemPersistence';
import { SaveError } from '../services/ItemPersistence';
import type { AttachmentInfo, LoadedItem } from '../services/SpDataService';
import { fromSharePoint } from '../services/ValueMapper';
import { coerceControlValue, isValueControl, valuesEqual } from './controlValues';
import { buildSaveChanges } from './saveStrategy';

export interface FormStoreOptions {
  definition: FormDefinition;
  mode: FormMode;
  /** List field schemas by internal name (empty when unknown, e.g. in tests). */
  fields: Record<string, FieldSchema>;
  /** Loaded item (Edit/Display). */
  item?: LoadedItem | null;
  itemId?: number;
  attachments?: AttachmentInfo[];
  currentUser: PersonValue | null;
  currentUserGroups: string[];
  locale: string;
  persistence?: IFormPersistence;
  now?: () => Date;
  debug?: boolean;
}

export type SubmitOutcome =
  | { kind: 'saved'; itemId: number; attachmentErrors: string[] }
  | { kind: 'invalid' }
  | { kind: 'closed' }
  | { kind: 'error'; error: SaveError };

export interface AttachmentState {
  existing: AttachmentInfo[];
  removed: string[];
  added: File[];
}

export interface RejectedFile {
  fileName: string;
  issue: ValidationIssue;
}

type Listener = () => void;

/** Key used to subscribe to every change (layout, summaries). */
export const ANY_CHANGE: string = '*';

const CLOSE_COMMANDS: ReadonlyArray<string> = ['Cancel', 'Close'];

function today(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Per-form runtime state (Rendszerterv §5.7): values, dirty set, rule state (via RuleEngine), validation errors,
 * attachments and the submit flow. Framework-free; React subscribes through `useControlState`.
 */
export class FormStore {
  public readonly definition: FormDefinition;
  public readonly mode: FormMode;
  public readonly fields: Record<string, FieldSchema>;
  public readonly engine: RuleEngine;
  public readonly locale: string;
  public readonly itemId?: number;

  private readonly _values: Map<string, ExprValue> = new Map();
  private readonly _original: Map<string, ExprValue> = new Map();
  private readonly _dirty: Set<string> = new Set();
  private readonly _itemSnapshot: Record<string, ExprValue> = {};
  private readonly _forcedReadOnly: Set<string> = new Set();
  private readonly _listeners: Map<string, Set<Listener>> = new Map();
  private readonly _runtimeDiagnostics: DiagnosticBag = new DiagnosticBag();
  private readonly _persistence?: IFormPersistence;
  private readonly _etag?: string;
  private _errors: Record<string, ValidationIssue[]> = {};
  private _formErrors: ValidationIssue[] = [];
  private _submitAttempted: boolean = false;
  private _busy: boolean = false;
  private _saveError?: SaveError;
  private _attachments: AttachmentState;

  public constructor(options: FormStoreOptions) {
    this.definition = options.definition;
    this.mode = options.mode;
    this.fields = options.fields;
    this.locale = options.locale;
    this.itemId = options.itemId;
    this._persistence = options.persistence;
    this._etag = options.item ? options.item.etag : undefined;
    this._attachments = { existing: (options.attachments || []).slice(), removed: [], added: [] };
    const now = options.now || (() => new Date());

    this._buildItemSnapshot(options.item);
    this._checkFields();

    this.engine = new RuleEngine(this.definition, {
      mode: this.mode,
      getControlValue: (id) => (this._values.has(id) ? this._values.get(id) : this.definition.controls[id] ? null : undefined),
      getItemProperty: (name) => this._itemSnapshot[name],
      currentUser: options.currentUser,
      currentUserGroups: options.currentUserGroups,
      now,
      locale: this.locale,
      report: (d) => this._runtimeDiagnostics.add(d)
    });

    this._initializeValues(now());
    this.engine.setTracing(!!options.debug);
    this.engine.initialize();
    this._values.forEach((value, id) => this._original.set(id, value));
  }

  // --- reading ----------------------------------------------------------------------------------------------

  public getValue(controlId: string): ExprValue {
    const value = this.engine.getValue(controlId);
    return value === undefined ? null : value;
  }

  public getState(controlId: string): ControlRuleState {
    const state = this.engine.getState(controlId);
    return this._forcedReadOnly.has(controlId) && !state.disabled ? { ...state, disabled: true } : state;
  }

  public getErrors(controlId: string): ValidationIssue[] {
    return this._errors[controlId] || [];
  }

  public get formErrors(): ValidationIssue[] {
    return this._formErrors;
  }

  public get submitAttempted(): boolean {
    return this._submitAttempted;
  }

  public get busy(): boolean {
    return this._busy;
  }

  public get saveError(): SaveError | undefined {
    return this._saveError;
  }

  public get isDirty(): boolean {
    return this._dirty.size > 0 || this._attachments.added.length > 0 || this._attachments.removed.length > 0;
  }

  public get attachments(): AttachmentState {
    return this._attachments;
  }

  /** `{ItemProperty:X}` snapshot (value at load time). */
  public getItemProperty(name: string): ExprValue | undefined {
    return this._itemSnapshot[name];
  }

  /** Parse-time diagnostics of the definition plus runtime diagnostics (orphans, missing fields, …). */
  public get diagnostics(): Diagnostic[] {
    return this.definition.diagnostics.concat(this._runtimeDiagnostics.toArray());
  }

  /** Records a problem found outside the definition (e.g. the custom CSS file could not be loaded). */
  public addDiagnostic(diagnostic: Diagnostic): void {
    this._runtimeDiagnostics.add(diagnostic);
  }

  public get ruleTrace(): ReadonlyArray<RuleTraceEntry> {
    return this.engine.trace;
  }

  /** Whether a button is shown in the current mode (VisibleWhenReadOnly). */
  public isButtonVisible(button: ButtonControl): boolean {
    if (this.mode !== 'Display') return true;
    return button.visibleWhenReadOnly || CLOSE_COMMANDS.indexOf(button.command) >= 0;
  }

  // --- subscriptions ----------------------------------------------------------------------------------------

  /** Subscribes to changes of one control (or `ANY_CHANGE`). Returns the unsubscribe function. */
  public subscribe(key: string, listener: Listener): () => void {
    let set = this._listeners.get(key);
    if (!set) {
      set = new Set();
      this._listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = this._listeners.get(key);
      if (current) current.delete(listener);
    };
  }

  private _notify(controlIds: Iterable<string>): void {
    const called = new Set<Listener>();
    const fire = (key: string): void => {
      const set = this._listeners.get(key);
      if (!set) return;
      set.forEach((listener) => {
        if (!called.has(listener)) {
          called.add(listener);
          listener();
        }
      });
    };
    Array.from(controlIds).forEach(fire);
    fire(ANY_CHANGE);
  }

  private _notifyAll(): void {
    this._notify(Object.keys(this.definition.controls));
  }

  // --- writing ----------------------------------------------------------------------------------------------

  public setValue(controlId: string, value: ExprValue): void {
    const control = this.definition.controls[controlId];
    if (!control || !isValueControl(control) || this.mode === 'Display') return;
    const coerced = coerceControlValue(control, value, this._fieldOf(control), this.locale);
    this._values.set(controlId, coerced);
    if (valuesEqual(coerced, this._original.get(controlId))) this._dirty.delete(controlId);
    else this._dirty.add(controlId);

    const changed = new Set<string>([controlId, ...this.engine.update([controlId])]);
    if (this._submitAttempted) {
      this._revalidate(Array.from(changed));
    } else if (this._errors[controlId]) {
      // Clear a server error once the user edits the field.
      delete this._errors[controlId];
    }
    this._notify(changed);
  }

  /** Adds files to an attachment control after checking size/type limits. Returns the rejected files. */
  public addAttachments(controlId: string, files: File[]): RejectedFile[] {
    const control = this.definition.controls[controlId] as AttachmentControl | undefined;
    if (!control || control.type !== 'Attachment') return [];
    const rejected: RejectedFile[] = [];
    files.forEach((file) => {
      const extension = (file.name.split('.').pop() || '').toLowerCase();
      if (control.maximumFileSize > 0 && file.size > control.maximumFileSize) {
        rejected.push({ fileName: file.name, issue: { code: 'fileSize', params: { maximum: control.maximumFileSize } } });
      } else if (
        control.blockedExtensions.indexOf(extension) >= 0 ||
        (control.whitelist.length > 0 && control.whitelist.indexOf(extension) < 0)
      ) {
        rejected.push({
          fileName: file.name,
          issue: { code: 'fileType', message: control.whitelistErrorMessage, params: { extension } }
        });
      } else {
        // Replacing a file with the same name: drop the pending one / mark the existing one for replacement.
        this._attachments.added = this._attachments.added.filter((f) => f.name !== file.name);
        if (this._attachments.existing.some((a) => a.fileName === file.name) && this._attachments.removed.indexOf(file.name) < 0) {
          this._attachments.removed.push(file.name);
        }
        this._attachments.added.push(file);
      }
    });
    this._attachments = { ...this._attachments };
    this.setValue(controlId, this._attachmentNames());
    return rejected;
  }

  public removeAttachment(controlId: string, fileName: string): void {
    const pending = this._attachments.added.filter((f) => f.name === fileName);
    if (pending.length) {
      this._attachments.added = this._attachments.added.filter((f) => f.name !== fileName);
    } else if (this._attachments.removed.indexOf(fileName) < 0) {
      this._attachments.removed.push(fileName);
    }
    this._attachments = { ...this._attachments };
    this.setValue(controlId, this._attachmentNames());
  }

  /** Validates everything (Save). Errors become visible and update live afterwards. */
  public validate(): boolean {
    const result = this.engine.validate();
    this._errors = result.controlErrors;
    this._formErrors = result.formErrors;
    this._submitAttempted = true;
    this._notifyAll();
    return result.valid;
  }

  /** Runs a button command: Save/SaveAndSubmit → validate + save; Cancel → close. */
  public async submit(button: Pick<ButtonControl, 'command' | 'causesValidation'>): Promise<SubmitOutcome> {
    if (CLOSE_COMMANDS.indexOf(button.command) >= 0 || this.mode === 'Display') {
      return { kind: 'closed' };
    }
    if (this._busy) return { kind: 'invalid' };
    if (button.causesValidation !== false && !this.validate()) {
      return { kind: 'invalid' };
    }
    if (!this._persistence) {
      throw new Error('FormStore has no persistence configured');
    }
    this._setBusy(true);
    this._saveError = undefined;
    try {
      const { changes } = buildSaveChanges({
        definition: this.definition,
        mode: this.mode,
        fields: this.fields,
        getValue: (id) => this.getValue(id),
        dirty: this._dirty,
        getOriginalFieldValue: (name) => this._itemSnapshot[name]
      });
      const response = await this._persistence.save({
        mode: this.mode === 'New' ? 'New' : 'Edit',
        itemId: this.itemId,
        etag: this._etag,
        changes,
        attachmentsToDelete: this._attachments.removed.slice(),
        attachmentsToAdd: this._attachments.added.slice()
      });
      this._dirty.clear();
      return { kind: 'saved', itemId: response.itemId, attachmentErrors: response.attachmentErrors };
    } catch (e) {
      const error = e instanceof SaveError ? e : new SaveError('unknown', (e as Error).message);
      this._saveError = error;
      this._applyServerError(error);
      return { kind: 'error', error };
    } finally {
      this._setBusy(false);
    }
  }

  // --- internals --------------------------------------------------------------------------------------------

  private _setBusy(busy: boolean): void {
    this._busy = busy;
    this._notify([]);
  }

  private _fieldOf(control: ControlDefinition): FieldSchema | undefined {
    const name = getListFieldName(control);
    return name ? this.fields[name] : undefined;
  }

  private _attachmentNames(): string[] {
    const existing = this._attachments.existing.map((a) => a.fileName).filter((n) => this._attachments.removed.indexOf(n) < 0);
    return existing.concat(this._attachments.added.map((f) => f.name));
  }

  private _buildItemSnapshot(item: LoadedItem | null | undefined): void {
    if (this.mode === 'New' || !item) return;
    const names: string[] = [];
    Object.keys(this.definition.controls).forEach((id) => {
      const name = getListFieldName(this.definition.controls[id]);
      if (name && names.indexOf(name) < 0) names.push(name);
    });
    collectReferencedItemProperties(this.definition).forEach((name) => names.indexOf(name) < 0 && names.push(name));
    names.forEach((name) => {
      if (!Object.prototype.hasOwnProperty.call(item.values, name)) return;
      const field = this.fields[name];
      const raw = item.values[name];
      if (field) {
        this._itemSnapshot[name] = fromSharePoint(field, raw);
      } else if (raw === null || typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        this._itemSnapshot[name] = raw;
      }
    });
  }

  /** Bound controls whose field is missing from the list become read-only (MissingField, K-02). */
  private _checkFields(): void {
    if (!Object.keys(this.fields).length) return;
    Object.keys(this.definition.controls).forEach((id) => {
      const control = this.definition.controls[id];
      const name = getListFieldName(control);
      if (!name || this.fields[name]) return;
      if (isValueControl(control)) this._forcedReadOnly.add(id);
      this._runtimeDiagnostics.report('warn', 'MissingField', `List field "${name}" does not exist; the control is read-only`, {
        controlId: id
      });
    });
  }

  private _initializeValues(now: Date): void {
    const ids = Object.keys(this.definition.controls).filter((id) => isValueControl(this.definition.controls[id]));
    ids.forEach((id) => {
      const control = this.definition.controls[id];
      const field = this._fieldOf(control);
      let initial: ExprValue = null;
      if (control.type === 'Attachment') {
        initial = this._attachmentNames();
      } else if (this.mode !== 'New') {
        const name = getListFieldName(control);
        initial = name ? (this._itemSnapshot[name] === undefined ? null : this._itemSnapshot[name]) : null;
      }
      this._values.set(id, coerceControlValue(control, initial, field, this.locale));
    });
    if (this.mode !== 'New') return;

    // New mode defaults, in control order (a default may read other controls' defaults).
    ids.forEach((id) => {
      const control = this.definition.controls[id];
      const field = this._fieldOf(control);
      let value: ExprValue = null;
      if (control.type === 'DateTime' && control.defaultValueType === 'Today') {
        value = today(now);
      } else {
        value = this.engine.evaluateDefaultValue(control);
      }
      if (isEmptyValue(value) && field && field.defaultValue !== undefined) {
        value = this._sharePointDefault(field, now);
      }
      if (!isEmptyValue(value)) {
        this._values.set(id, coerceControlValue(control, value, field, this.locale));
      }
    });
  }

  /** Column default of the list field (Nintex `DefaultValueSource = Inherit`). */
  private _sharePointDefault(field: FieldSchema, now: Date): ExprValue {
    const raw = field.defaultValue || '';
    switch (field.type) {
      case 'Text':
      case 'Note':
      case 'Choice':
        return raw;
      case 'MultiChoice':
        return raw.split(';#').filter((c) => c.length > 0);
      case 'Number':
      case 'Currency':
        return Number(raw);
      case 'DateTime':
        return /^\[today\]$/i.test(raw) ? today(now) : fromSharePoint(field, raw);
      default:
        return null;
    }
  }

  private _revalidate(controlIds: string[]): void {
    const result = this.engine.validate({ controlIds });
    controlIds.forEach((id) => {
      if (result.controlErrors[id]) this._errors[id] = result.controlErrors[id];
      else delete this._errors[id];
    });
  }

  private _applyServerError(error: SaveError): void {
    if (error.kind !== 'validation' || !error.fieldName) {
      this._notifyAll();
      return;
    }
    const targets = Object.keys(this.definition.controls).filter((id) => getListFieldName(this.definition.controls[id]) === error.fieldName);
    targets.forEach((id) => {
      this._errors[id] = [{ code: 'server', message: error.message }];
    });
    this._notifyAll();
  }
}
