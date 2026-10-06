import type { FormMode } from '../../nintex/expression/context';
import type { ExprValue } from '../../nintex/expression/values';
import type { ControlDefinition } from '../../nintex/model/controls';

/** Common props of every control component (Rendszerterv §5.10). */
export interface IControlProps<TDef extends ControlDefinition = ControlDefinition> {
  def: TDef;
  value: ExprValue;
  onChange(value: ExprValue): void;
  mode: FormMode;
  /** Disabled by rules, bindings, ControlMode or Display mode. */
  disabled: boolean;
  required: boolean;
  /** Message of the first validation issue (rendered by ControlHost; used for aria-invalid). */
  error?: string;
  /** DOM id for the focusable input element. */
  inputId: string;
  /** Space separated ids of associated labels (aria-labelledby). */
  labelledBy?: string;
  /** Id of the error message element (aria-describedby). */
  describedBy?: string;
}
