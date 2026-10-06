import { Ast, walkAst } from '../expression/ast';
import { collectItemProperties } from '../expression/references';
import type { ControlDefinition, ValueSource } from '../model/controls';
import { getListFieldName } from '../model/controls';
import type { FormDefinition } from '../model/FormDefinition';

export interface BoundField {
  internalName: string;
  /** Controls bound to this field (a field may be bound more than once, e.g. overlapping controls). */
  controlIds: string[];
  controlTypes: string[];
  /** Suggested SharePoint field type for test-list provisioning (`Text`, `Note`, `Choice`, `User`, …). */
  suggestedType: string;
  multi: boolean;
  required: boolean;
  displayName?: string;
}

function suggestType(control: ControlDefinition): { type: string; multi: boolean } {
  switch (control.type) {
    case 'TextBox':
      return { type: /^(Double|Integer)$/.test(control.dataType) ? 'Number' : control.dataType === 'Currency' ? 'Currency' : 'Text', multi: false };
    case 'MultiLineTextBox':
      return { type: 'Note', multi: false };
    case 'Choice': {
      const multi = control.displayFormat === 'CheckBoxes';
      return { type: multi ? 'MultiChoice' : 'Choice', multi };
    }
    case 'DateTime':
      return { type: 'DateTime', multi: false };
    case 'PeoplePicker':
      return { type: control.multiSelect ? 'UserMulti' : 'User', multi: control.multiSelect };
    case 'Lookup':
      return { type: control.allowMultipleValues ? 'LookupMulti' : 'Lookup', multi: control.allowMultipleValues };
    case 'Calculation':
      return { type: 'Text', multi: false };
    default:
      return { type: 'Text', multi: false };
  }
}

/** List fields bound through `DataField = List:<InternalName>`, in control order. */
export function collectBoundFields(definition: FormDefinition): BoundField[] {
  const byName: Record<string, BoundField> = {};
  const order: string[] = [];
  Object.keys(definition.controls).forEach((id) => {
    const control = definition.controls[id];
    const internalName = getListFieldName(control);
    if (!internalName) return;
    const suggestion = suggestType(control);
    let field = byName[internalName];
    if (!field) {
      field = byName[internalName] = {
        internalName,
        controlIds: [],
        controlTypes: [],
        suggestedType: suggestion.type,
        multi: suggestion.multi,
        required: false
      };
      order.push(internalName);
    }
    field.controlIds.push(id);
    if (field.controlTypes.indexOf(control.type) < 0) field.controlTypes.push(control.type);
    // An input control determines the type better than a calculation bound to the same field.
    if (control.type !== 'Calculation' && field.controlTypes[0] === 'Calculation') {
      field.suggestedType = suggestion.type;
      field.multi = suggestion.multi;
    }
    if ('isRequired' in control && control.isRequired) field.required = true;
    if ('dataFieldDisplayName' in control && control.dataFieldDisplayName && !field.displayName) {
      field.displayName = control.dataFieldDisplayName;
    }
  });
  return order.map((name) => byName[name]);
}

function valueSourceAsts(source: ValueSource | undefined): Ast[] {
  if (!source) return [];
  if (source.kind === 'expression') return [source.ast];
  const refs: Ast[] = [];
  if (source.kind === 'template') {
    source.parts.forEach((part) => {
      if (part.kind === 'reference') refs.push(part.ref);
    });
  }
  return refs;
}

/** Every AST in a definition (rules, formulas, defaults, choices, bindings, custom validation, variables). */
export function collectAllAsts(definition: FormDefinition): Ast[] {
  const asts: Ast[] = [];
  definition.rules.forEach((rule) => {
    if (rule.expression) asts.push(rule.expression);
  });
  definition.variables.forEach((variable) => asts.push(...valueSourceAsts(variable.expression)));
  Object.keys(definition.controls).forEach((id) => {
    const control = definition.controls[id];
    control.bindings.forEach((binding) => asts.push(...valueSourceAsts(binding.value)));
    if ('defaultValue' in control) asts.push(...valueSourceAsts(control.defaultValue));
    if ('customValidation' in control && control.customValidation) {
      asts.push(control.customValidation.ast);
      asts.push(...valueSourceAsts(control.customValidation.message));
    }
    if (control.type === 'Calculation' && control.formula) asts.push(control.formula.ast);
    if (control.type === 'Choice') control.choices.forEach((choice) => asts.push(...valueSourceAsts(choice)));
  });
  return asts;
}

/** Field names read through `{ItemProperty:X}` anywhere in the form. */
export function collectReferencedItemProperties(definition: FormDefinition): string[] {
  const names: string[] = [];
  collectAllAsts(definition).forEach((ast) =>
    collectItemProperties(ast).forEach((name) => {
      if (names.indexOf(name) < 0) names.push(name);
    })
  );
  return names;
}

/** Function usage counts (lower-cased names). */
export function collectFunctionUsage(definition: FormDefinition): Record<string, number> {
  const usage: Record<string, number> = {};
  collectAllAsts(definition).forEach((ast) =>
    walkAst(ast, (node) => {
      if (node.kind === 'Call') {
        const key = node.name.toLowerCase();
        usage[key] = (usage[key] || 0) + 1;
      }
    })
  );
  return usage;
}

/** Lookup source lists (by title, K-06) and SharePoint groups (People filter + fn-IsMemberOfGroup). */
export function collectExternalDependencies(definition: FormDefinition): { lookupLists: string[]; groups: string[] } {
  const lookupLists: string[] = [];
  const groups: string[] = [];
  const add = (list: string[], value: string | undefined): void => {
    if (value && list.indexOf(value) < 0) list.push(value);
  };
  Object.keys(definition.controls).forEach((id) => {
    const control = definition.controls[id];
    if (control.type === 'Lookup') add(lookupLists, control.lookupList);
    if (control.type === 'PeoplePicker') add(groups, control.sharePointGroup);
  });
  collectAllAsts(definition).forEach((ast) =>
    walkAst(ast, (node) => {
      if (node.kind === 'Call' && /^(fn-)?ismemberofgroup$/i.test(node.name) && node.args[0] && node.args[0].kind === 'Literal') {
        add(groups, String(node.args[0].value));
      }
    })
  );
  return { lookupLists, groups };
}

/** Count of controls by type. */
export function countControlsByType(definition: FormDefinition): Record<string, number> {
  const counts: Record<string, number> = {};
  Object.keys(definition.controls).forEach((id) => {
    const type = definition.controls[id].type;
    counts[type] = (counts[type] || 0) + 1;
  });
  return counts;
}
