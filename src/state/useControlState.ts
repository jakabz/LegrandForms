import * as React from 'react';
import type { ExprValue } from '../nintex/expression/values';
import type { ControlRuleState, ValidationIssue } from '../nintex/rules/types';
import { ANY_CHANGE, FormStore } from './FormStore';

export interface ControlStateSnapshot {
  value: ExprValue;
  state: ControlRuleState;
  errors: ValidationIssue[];
}

/** Re-renders when `key` (a control id or ANY_CHANGE) is notified by the store. */
export function useStoreSubscription(store: FormStore, key: string): number {
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    let mounted = true;
    const unsubscribe = store.subscribe(key, () => {
      if (mounted) setVersion((v) => v + 1);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [store, key]);
  return version;
}

/**
 * Value, rule state and errors of one control. Only this control re-renders when it changes
 * (React 17 has no useSyncExternalStore; a version counter drives the update).
 */
export function useControlState(store: FormStore, controlId: string): ControlStateSnapshot {
  useStoreSubscription(store, controlId);
  return {
    value: store.getValue(controlId),
    state: store.getState(controlId),
    errors: store.getErrors(controlId)
  };
}

/** Re-renders on every store change (layout, form-level summaries). */
export function useAnyStoreChange(store: FormStore): number {
  return useStoreSubscription(store, ANY_CHANGE);
}
