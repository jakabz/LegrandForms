import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Dialog, DialogFooter, DialogType } from '@fluentui/react/lib/Dialog';
import { Link } from '@fluentui/react/lib/Link';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import * as React from 'react';
import { scopeClassName } from '../nintex/css/cssScoper';
import type { ButtonControl } from '../nintex/model/controls';
import type { Diagnostic } from '../nintex/model/Diagnostic';
import type { LayoutDefinition } from '../nintex/model/FormDefinition';
import type { ResolvedConfig } from '../services/ConfigResolver';
import type { FormStore } from '../state/FormStore';
import { useAnyStoreChange } from '../state/useControlState';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { FormCanvas } from './FormCanvas';
import { errorDomId, FormContext, FormContextValue, FormServices, labelDomId } from './FormContext';
import { format, issueMessage } from './messages';
import styles from './NintexForm.module.scss';

export type NintexFormState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; diagnostics?: Diagnostic[] }
  | { kind: 'ready'; store: FormStore; config: ResolvedConfig };

export interface INintexFormProps {
  state: NintexFormState;
  strings: INintexFormFormCustomizerStrings;
  services: FormServices;
  /** List URL for the "back to the list" fallback link. */
  listUrl?: string;
  onSaved(): void;
  onClosed(): void;
}

function pickLayout(layouts: LayoutDefinition[], name: string): LayoutDefinition | undefined {
  const lower = name.toLowerCase();
  return (
    layouts.filter((l) => l.name.toLowerCase() === lower && !l.isMobileAppLayout)[0] ||
    layouts.filter((l) => !l.isMobileAppLayout)[0] ||
    layouts[0]
  );
}

/** controlId → ids of labels pointing at it (AssociatedControl), for aria-labelledby. */
function buildLabelIndex(store: FormStore): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  Object.keys(store.definition.controls).forEach((id) => {
    const control = store.definition.controls[id];
    if (control.type === 'Label' && control.associatedControlId) {
      (index[control.associatedControlId] = index[control.associatedControlId] || []).push(labelDomId(id));
    }
  });
  return index;
}

const ReadyForm: React.FC<{
  store: FormStore;
  config: ResolvedConfig;
  strings: INintexFormFormCustomizerStrings;
  services: FormServices;
  onSaved(): void;
  onClosed(): void;
}> = ({ store, config, strings, services, onSaved, onClosed }) => {
  useAnyStoreChange(store);
  const [showIds, setShowIds] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<ButtonControl | undefined>(undefined);
  const [summary, setSummary] = React.useState<string | undefined>(undefined);
  const [attachmentWarning, setAttachmentWarning] = React.useState<string | undefined>(undefined);
  const labelsByControl = React.useMemo(() => buildLabelIndex(store), [store]);
  const layout = pickLayout(store.definition.layouts, config.layoutName);

  const run = React.useCallback(
    async (button: ButtonControl) => {
      setSummary(undefined);
      const outcome = await store.submit(button);
      switch (outcome.kind) {
        case 'closed':
          onClosed();
          break;
        case 'saved':
          if (outcome.attachmentErrors.length) {
            // The item exists; report the attachment problems before leaving.
            setAttachmentWarning(format(strings.AttachmentErrors, { files: outcome.attachmentErrors.join('; ') }));
          } else {
            onSaved();
          }
          break;
        case 'invalid': {
          setSummary(strings.ValidationSummary);
          const first = Object.keys(store.definition.controls).filter((id) => store.getErrors(id).length > 0)[0];
          const element = first ? document.getElementById(errorDomId(first)) : null;
          if (element && element.scrollIntoView) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
        default:
          break;
      }
    },
    [store, strings, onSaved, onClosed]
  );

  const onCommand = React.useCallback(
    (button: ButtonControl) => {
      if (button.confirmationMessage && store.mode !== 'Display' && button.command !== 'Cancel') {
        setConfirm(button);
        return;
      }
      run(button).catch((e: Error) => setSummary(e.message));
    },
    [run, store]
  );

  const context: FormContextValue = React.useMemo(
    () => ({ store, strings, services, labelsByControl, debug: config.debug, showControlIds: showIds, onCommand }),
    [store, strings, services, labelsByControl, config.debug, showIds, onCommand]
  );

  const hasButtons = Object.keys(store.definition.controls).some((id) => store.definition.controls[id].type === 'Button');
  const saveError = store.saveError;

  return (
    <FormContext.Provider value={context}>
      <div className={`${styles.root} ${scopeClassName(store.definition.id)}`} lang={store.locale}>
        {config.debug && (
          <div className={styles.toolbar}>
            <DefaultButton iconProps={{ iconName: 'Bug' }} text={strings.DiagnosticsButton} onClick={() => setPanelOpen(true)} />
          </div>
        )}
        <div className={styles.messages} aria-live="assertive">
          {summary && <MessageBar messageBarType={MessageBarType.error}>{summary}</MessageBar>}
          {store.formErrors.map((issue, index) => (
            <MessageBar key={index} messageBarType={MessageBarType.error}>
              {issueMessage(issue, strings)}
            </MessageBar>
          ))}
          {saveError && saveError.kind === 'concurrency' && (
            <MessageBar
              messageBarType={MessageBarType.severeWarning}
              actions={<DefaultButton text={strings.Reload} onClick={() => window.location.reload()} />}
            >
              {strings.ConcurrencyError}
            </MessageBar>
          )}
          {saveError && saveError.kind !== 'concurrency' && (
            <MessageBar messageBarType={MessageBarType.error}>{format(strings.SaveErrorTitle, { message: saveError.message })}</MessageBar>
          )}
          {attachmentWarning && (
            <MessageBar messageBarType={MessageBarType.warning} actions={<DefaultButton text={strings.Ok} onClick={onSaved} />}>
              {attachmentWarning}
            </MessageBar>
          )}
        </div>

        {layout && (
          <FormCanvas layout={layout} collapseHiddenRows={config.collapseHiddenRows} responsiveBreakpoint={config.responsiveBreakpoint} />
        )}

        {!hasButtons && (
          // Forms without button controls still need a way to save or leave.
          <div className={styles.footer}>
            {store.mode !== 'Display' && (
              <PrimaryButton
                text={store.busy ? strings.Saving : strings.Save}
                disabled={store.busy}
                onClick={() => onCommand({ command: 'Save', causesValidation: true } as ButtonControl)}
              />
            )}
            <DefaultButton
              text={store.mode === 'Display' ? strings.Close : strings.Cancel}
              onClick={() => onCommand({ command: 'Cancel', causesValidation: false } as ButtonControl)}
            />
          </div>
        )}

        {store.busy && <Spinner size={SpinnerSize.small} label={strings.Saving} />}

        <Dialog
          hidden={!confirm}
          onDismiss={() => setConfirm(undefined)}
          dialogContentProps={{ type: DialogType.normal, title: strings.ConfirmTitle, subText: confirm ? confirm.confirmationMessage : '' }}
        >
          <DialogFooter>
            <PrimaryButton
              text={strings.Ok}
              onClick={() => {
                const button = confirm;
                setConfirm(undefined);
                if (button) run(button).catch((e: Error) => setSummary(e.message));
              }}
            />
            <DefaultButton text={strings.Cancel} onClick={() => setConfirm(undefined)} />
          </DialogFooter>
        </Dialog>

        {config.debug && (
          <DiagnosticsPanel
            store={store}
            isOpen={panelOpen}
            onDismiss={() => setPanelOpen(false)}
            showControlIds={showIds}
            onShowControlIdsChange={setShowIds}
            hideEmptyRules={config.emptyRuleBehavior === 'ignore'}
            strings={strings}
          />
        )}
      </div>
    </FormContext.Provider>
  );
};

/** Root component: loading, load errors (with fallback link) and the rendered form. */
export const NintexForm: React.FC<INintexFormProps> = (props) => {
  const { state, strings, listUrl } = props;
  if (state.kind === 'loading') {
    return <Spinner className={styles.loading} size={SpinnerSize.large} label={strings.Loading} />;
  }
  if (state.kind === 'error') {
    return (
      <MessageBar messageBarType={MessageBarType.error} isMultiline>
        <div>
          <strong>{strings.LoadErrorTitle}</strong>
        </div>
        <div>{state.message}</div>
        {state.diagnostics &&
          state.diagnostics
            .filter((d) => d.level === 'error')
            .map((d, index) => <div key={index}>{d.message}</div>)}
        {listUrl && <Link href={listUrl}>{strings.BackToList}</Link>}
      </MessageBar>
    );
  }
  return (
    <ErrorBoundary title={strings.LoadErrorTitle} backText={strings.BackToList} backUrl={listUrl}>
      <ReadyForm {...props} store={state.store} config={state.config} />
    </ErrorBoundary>
  );
};

export default NintexForm;
