import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { Pivot, PivotItem } from '@fluentui/react/lib/Pivot';
import { Toggle } from '@fluentui/react/lib/Toggle';
import * as React from 'react';
import type { Diagnostic } from '../nintex/model/Diagnostic';
import type { RuleTraceEntry } from '../nintex/rules/types';
import type { FormStore } from '../state/FormStore';

export interface DiagnosticsPanelProps {
  store: FormStore;
  isOpen: boolean;
  onDismiss(): void;
  showControlIds: boolean;
  onShowControlIdsChange(show: boolean): void;
  /** Hide EmptyRule entries (config `emptyRuleBehavior = ignore`). */
  hideEmptyRules: boolean;
  strings: INintexFormFormCustomizerStrings;
}

const LEVEL_ORDER: Record<string, number> = { error: 0, warn: 1, info: 2 };

function controlName(store: FormStore, controlId: string | undefined): string {
  if (!controlId) return '';
  const control = store.definition.controls[controlId];
  return control ? `${control.type} ${control.name || control.displayName || ''} (${controlId.substring(0, 8)})` : controlId;
}

function ruleName(store: FormStore, ruleId: string | undefined): string {
  if (!ruleId) return '';
  const rule = store.definition.rules.filter((r) => r.id === ruleId)[0];
  return rule ? rule.title : ruleId;
}

const cell: React.CSSProperties = { borderBottom: '1px solid #edebe9', padding: '4px 6px', verticalAlign: 'top', textAlign: 'left' };

/** Debug side panel (Rendszerterv F-15): diagnostics, rule trace, control id overlay. */
export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = (props) => {
  const { store, isOpen, onDismiss, strings, showControlIds, onShowControlIdsChange, hideEmptyRules } = props;
  const diagnostics: Diagnostic[] = isOpen
    ? store.diagnostics
        .filter((d) => !(hideEmptyRules && d.code === 'EmptyRule'))
        .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
    : [];
  const trace: RuleTraceEntry[] = isOpen ? store.ruleTrace.slice().reverse() : [];

  return (
    <Panel isOpen={isOpen} onDismiss={onDismiss} type={PanelType.medium} headerText={strings.DiagnosticsTitle} isLightDismiss>
      <Toggle label={strings.ShowControlIds} checked={showControlIds} onChange={(e, checked) => onShowControlIdsChange(!!checked)} />
      <Pivot>
        <PivotItem headerText={`${strings.DiagnosticsTab} (${diagnostics.length})`}>
          {!diagnostics.length ? (
            <p>{strings.NoDiagnostics}</p>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={cell}>{strings.ColumnLevel}</th>
                  <th style={cell}>{strings.ColumnCode}</th>
                  <th style={cell}>{strings.ColumnMessage}</th>
                  <th style={cell}>{strings.ColumnControl}</th>
                  <th style={cell}>{strings.ColumnRule}</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.map((d, index) => (
                  <tr key={index}>
                    <td style={cell}>{d.level}</td>
                    <td style={cell}>{d.code}</td>
                    <td style={cell}>
                      {d.message}
                      {d.source && <div style={{ color: '#605e5c', fontFamily: 'monospace' }}>{d.source}</div>}
                    </td>
                    <td style={cell}>{controlName(store, d.controlId)}</td>
                    <td style={cell}>{ruleName(store, d.ruleId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PivotItem>
        <PivotItem headerText={`${strings.RuleTraceTab} (${trace.length})`}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={cell}>#</th>
                <th style={cell}>{strings.ColumnRule}</th>
                <th style={cell}>{strings.ColumnControl}</th>
                <th style={cell}>{strings.ColumnResult}</th>
              </tr>
            </thead>
            <tbody>
              {trace.map((entry) => (
                <tr key={entry.sequence}>
                  <td style={cell}>{entry.sequence}</td>
                  <td style={cell}>{entry.title}</td>
                  <td style={cell}>{controlName(store, entry.controlId)}</td>
                  <td style={cell}>{entry.result ? 'true' : 'false'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PivotItem>
      </Pivot>
    </Panel>
  );
};
