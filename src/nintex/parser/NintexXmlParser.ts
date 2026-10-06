import { cleanCss } from '../css/cssCleaner';
import { walkAst } from '../expression/ast';
import { defaultRegistry } from '../expression/functions';
import { isKnownCommonReference, isKnownNamespace } from '../expression/references';
import type { ControlDefinition, HorizontalAlignment, LabelControl } from '../model/controls';
import type { Diagnostic } from '../model/Diagnostic';
import type {
  FormDefinition,
  FormVariableDefinition,
  LayoutDefinition,
  LayoutItem,
  RuleDefinition,
  RuleFormat
} from '../model/FormDefinition';
import { parseControl } from './controlParsers';
import { rawTypeOf, readStyle } from './controlParsers/common';
import { normalizeExpressionSource, normalizeGuid, normalizeTextValue } from './normalize';
import { ParseContext } from './ParseContext';
import { bool, child, children, decodeXmlBytes, int, nonEmptyText, parseXml, stringList, text, XmlNode } from './xml';

/** Bump when the produced model changes shape or semantics (invalidates cached definitions). */
export const PARSER_VERSION: number = 1;

export interface ParseFormResult {
  /** null only when the XML itself cannot be parsed. */
  definition: FormDefinition | null;
  diagnostics: Diagnostic[];
}

export interface ParseFormOptions {
  /** Deep-freeze the resulting definition (development builds). */
  freeze?: boolean;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value as object).forEach((key) => deepFreeze((value as Record<string, unknown>)[key]));
  }
  return value;
}

function parseLayoutItems(container: XmlNode | undefined): LayoutItem[] {
  return children(child(container, 'FormControlLayouts'), 'FormControlLayout').map((node) => ({
    controlId: normalizeGuid(text(node, 'FormControlUniqueId')),
    left: int(node, 'Left', 0),
    top: int(node, 'Top', 0),
    width: int(node, 'Width', 0),
    height: int(node, 'Height', 0),
    zIndex: int(node, 'ZIndex', 0),
    children: parseLayoutItems(node)
  }));
}

function parseLayouts(form: XmlNode): LayoutDefinition[] {
  return children(child(form, 'FormLayouts'), 'FormLayout').map((node) => {
    const title = nonEmptyText(node, 'Title');
    const layout: LayoutDefinition = {
      name: (nonEmptyText(node, 'DeviceName') || title || 'Desktop').trim(),
      width: int(node, 'Width', 700),
      height: int(node, 'Height', 0),
      isMobileAppLayout: bool(node, 'IsMobileAppLayout', false),
      style: readStyle(node),
      items: parseLayoutItems(node)
    };
    if (title) layout.title = title.trim();
    const backgroundColor = nonEmptyText(node, 'BackgroundColor');
    if (backgroundColor) layout.backgroundColor = backgroundColor.trim();
    const backgroundImageUrl = nonEmptyText(node, 'BackgroundImageUrl');
    if (backgroundImageUrl) layout.backgroundImageUrl = backgroundImageUrl.trim();
    const repeat = nonEmptyText(node, 'BackgroundImageRepeat');
    if (repeat && backgroundImageUrl) layout.backgroundImageRepeat = repeat;
    const cssClass = nonEmptyText(node, 'LayoutCssClass');
    if (cssClass) layout.cssClass = cssClass.trim();
    return layout;
  });
}

const ALIGNMENTS: ReadonlyArray<string> = ['Left', 'Center', 'Right', 'Justify'];

function parseRuleFormat(node: XmlNode): RuleFormat {
  const format: RuleFormat = {};
  if (bool(node, 'Bold', false)) format.bold = true;
  if (bool(node, 'Italics', false)) format.italics = true;
  if (bool(node, 'Underline', false)) format.underline = true;
  if (bool(node, 'StrikeThrough', false)) format.strikeThrough = true;
  const color = nonEmptyText(node, 'Color');
  if (color) format.fontColor = color.trim();
  const backgroundColor = nonEmptyText(node, 'BackgroundColor');
  if (backgroundColor) format.backgroundColor = backgroundColor.trim();
  const fontSize = nonEmptyText(node, 'FontSize');
  if (fontSize) format.fontSize = fontSize.trim();
  const fontFamily = nonEmptyText(node, 'FontTypeValue') || nonEmptyText(node, 'FontType');
  if (fontFamily) format.fontFamily = fontFamily.trim();
  const align = nonEmptyText(node, 'Align');
  if (align && ALIGNMENTS.indexOf(align.trim()) >= 0) format.horizontalAlignment = align.trim() as HorizontalAlignment;
  const cssClass = nonEmptyText(node, 'CssClass');
  if (cssClass) format.cssClass = cssClass.trim();
  return format;
}

function parseRules(form: XmlNode, ctx: ParseContext): RuleDefinition[] {
  return children(child(form, 'Rules'), 'Rule').map((node, index) => {
    const id = normalizeGuid(text(node, 'Id')) || `rule-${index}`;
    const title = normalizeTextValue(text(node, 'Title')) || `Rule ${index + 1}`;
    const type = (text(node, 'RuleType') || 'Formatting').trim() === 'Validation' ? 'Validation' : 'Formatting';
    const controlIds = stringList(node, 'ControlIds').map(normalizeGuid).filter((g) => g.length > 0);
    // Rule/ExpressionValue is the clean expression; Rule/Expression contains <a reftext=…> markup and is never used.
    const compiled = ctx.compileExpression(text(node, 'ExpressionValue'), { ruleId: id, property: 'ExpressionValue' });
    const expressionSource = normalizeExpressionSource(text(node, 'ExpressionValue'));

    const rule: RuleDefinition = {
      id,
      title,
      type,
      controlIds,
      expression: compiled ? compiled.ast : null,
      expressionSource,
      hide: bool(node, 'Hide', false),
      disable: bool(node, 'Disable', false),
      format: parseRuleFormat(node),
      inert: false
    };
    const message = normalizeTextValue(text(node, 'ValidationMessage'));
    if (message) rule.validationMessage = message;

    if (!compiled) {
      rule.inert = true;
      ctx.diagnostics.report('warn', 'EmptyRule', `Rule "${title}" has an empty expression and is ignored`, { ruleId: id });
    } else if (!controlIds.length && type === 'Formatting') {
      rule.inert = true;
      ctx.diagnostics.report('warn', 'EmptyRule', `Rule "${title}" targets no controls and is ignored`, {
        ruleId: id,
        source: expressionSource
      });
    }
    return rule;
  });
}

function parseVariables(form: XmlNode, ctx: ParseContext): FormVariableDefinition[] {
  return children(child(form, 'UserFormVariables'), 'UserFormVariable').map((node) => {
    const id = normalizeGuid(text(node, 'Id'));
    const variable: FormVariableDefinition = {
      id,
      name: normalizeTextValue(text(node, 'Name')),
      type: (text(node, 'Type') || 'String').trim(),
      recalculateOnNewMode: bool(node, 'RecalculateOnNewMode', true),
      recalculateOnEditMode: bool(node, 'RecalculateOnEditMode', true),
      recalculateOnViewMode: bool(node, 'RecalculateOnViewMode', true)
    };
    const expression = ctx.compileValue(text(node, 'Expression'), { property: `UserFormVariable.${variable.name}` });
    if (expression) variable.expression = expression;
    const connectedTo = nonEmptyText(node, 'ConnectedTo');
    if (connectedTo) variable.connectedTo = connectedTo.trim();
    return variable;
  });
}

function buildNameIndex(controls: Record<string, ControlDefinition>): Record<string, string> {
  const index: Record<string, string> = {};
  Object.keys(controls).forEach((id) => {
    const control = controls[id];
    if (!control.name) return;
    const key = control.name.trim().toLowerCase();
    const existing = index[key];
    // Prefer input controls over labels when names collide (AssociatedControl targets inputs).
    if (!existing || (controls[existing].type === 'Label' && control.type !== 'Label')) {
      index[key] = id;
    }
  });
  return index;
}

function resolveLabels(controls: Record<string, ControlDefinition>, byName: Record<string, string>, ctx: ParseContext): void {
  Object.keys(controls).forEach((id) => {
    const control = controls[id];
    if (control.type !== 'Label' || !control.associatedControlName) return;
    const label = control as LabelControl;
    const targetName = control.associatedControlName;
    const target = byName[targetName.trim().toLowerCase()];
    if (target && target !== id) {
      label.associatedControlId = target;
    } else {
      ctx.diagnostics.report('info', 'UnresolvedLabel', `Label is associated with unknown control "${targetName}"`, {
        controlId: id
      });
    }
  });
}

function checkLayouts(layouts: LayoutDefinition[], controls: Record<string, ControlDefinition>, ctx: ParseContext): void {
  if (!layouts.length) {
    ctx.diagnostics.report('error', 'MissingLayout', 'The form has no layout');
    return;
  }
  const placed: Record<string, boolean> = {};
  const visit = (items: LayoutItem[]): void =>
    items.forEach((item) => {
      if (!controls[item.controlId]) {
        ctx.diagnostics.report('warn', 'OrphanReference', `Layout references unknown control ${item.controlId}`, {
          controlId: item.controlId
        });
      }
      placed[item.controlId] = true;
      visit(item.children);
    });
  visit(layouts[0].items);
  Object.keys(controls).forEach((id) => {
    if (!placed[id]) {
      ctx.diagnostics.report('info', 'MissingLayout', `Control is not placed on the "${layouts[0].name}" layout`, { controlId: id });
    }
  });
}

function checkRuleTargets(rules: RuleDefinition[], controls: Record<string, ControlDefinition>, ctx: ParseContext): void {
  rules.forEach((rule) =>
    rule.controlIds.forEach((controlId) => {
      if (!controls[controlId]) {
        ctx.diagnostics.report('warn', 'OrphanReference', `Rule "${rule.title}" targets unknown control ${controlId}`, {
          ruleId: rule.id,
          controlId
        });
      }
    })
  );
}

/** Static checks over every compiled expression: orphan controls, unknown functions/arity, unknown references. */
function checkExpressions(controls: Record<string, ControlDefinition>, ctx: ParseContext): void {
  ctx.expressions.forEach((tracked) => {
    const extra = { controlId: tracked.owner.controlId, ruleId: tracked.owner.ruleId, source: tracked.source };
    walkAst(tracked.ast, (node) => {
      if (node.kind === 'Reference') {
        if (node.namespace === 'Control' && !controls[node.name]) {
          ctx.diagnostics.report('warn', 'OrphanReference', `${tracked.owner.property} references unknown control ${node.name}`, extra);
        } else if (node.namespace === 'Common' && !isKnownCommonReference(node.name)) {
          ctx.diagnostics.report('warn', 'UnsupportedReference', `${tracked.owner.property}: unsupported reference {Common:${node.name}}`, extra);
        } else if (!isKnownNamespace(node.namespace)) {
          ctx.diagnostics.report('warn', 'UnsupportedReference', `${tracked.owner.property}: unsupported reference namespace ${node.namespace}`, extra);
        }
      } else if (node.kind === 'Call') {
        const fn = defaultRegistry.get(node.name);
        if (!fn) {
          ctx.diagnostics.report('error', 'UnsupportedFunction', `${tracked.owner.property}: unsupported function ${node.name}()`, extra);
        } else {
          const { minArgs, maxArgs } = fn.options;
          if ((minArgs !== undefined && node.args.length < minArgs) || (maxArgs !== undefined && node.args.length > maxArgs)) {
            ctx.diagnostics.report(
              'error',
              'ExpressionParseError',
              `${tracked.owner.property}: ${node.name}() called with ${node.args.length} argument(s)`,
              extra
            );
          }
        }
      }
    });
  });
}

function checkScripts(form: XmlNode, ctx: ParseContext): { script: boolean; scriptUrls: string[]; cssUrls: string[] } {
  const script = !!nonEmptyText(form, 'Script');
  const scriptUrls = stringList(form, 'ScriptUrls').map((u) => u.trim());
  const cssUrls = stringList(form, 'CssUrls').map((u) => u.trim());
  if (script) {
    ctx.diagnostics.report('warn', 'ScriptIgnored', 'Custom JavaScript (<Script>) is not executed', {
      source: (text(form, 'Script') || '').substring(0, 200)
    });
  }
  scriptUrls.forEach((url) =>
    ctx.diagnostics.report('warn', 'ScriptIgnored', `External script is not loaded: ${url}`, { source: url })
  );
  cssUrls.forEach((url) => ctx.diagnostics.report('warn', 'ScriptIgnored', `External CSS is not loaded: ${url}`, { source: url }));
  return { script, scriptUrls, cssUrls };
}

/**
 * Parses a Nintex Forms (classic) XML export into a {@link FormDefinition}.
 * Never throws for bad input: problems are reported as diagnostics (also copied to `definition.diagnostics`).
 */
export function parseNintexForm(xml: string, options: ParseFormOptions = {}): ParseFormResult {
  const ctx = new ParseContext();
  const parsed = parseXml(xml);
  const form = parsed.root ? child(parsed.root, 'Form') : undefined;
  if (!form) {
    ctx.diagnostics.report('error', 'XmlParseError', parsed.error || 'The document is not a Nintex form export (missing <Form>)');
    return { definition: null, diagnostics: ctx.diagnostics.toArray() };
  }

  const controls: Record<string, ControlDefinition> = {};
  children(child(form, 'FormControls'), 'FormControlProperties').forEach((node, index) => {
    const rawType = rawTypeOf(node);
    const typeId = normalizeGuid(text(node, 'FormControlTypeUniqueId'));
    const control = parseControl(node, rawType, typeId, ctx);
    if (!control.id) {
      ctx.diagnostics.report('warn', 'InvalidValue', `Control #${index} (${rawType}) has no UniqueId and is ignored`);
      return;
    }
    if (controls[control.id]) {
      ctx.diagnostics.report('warn', 'InvalidValue', `Duplicate control UniqueId ${control.id}; the first one is kept`, {
        controlId: control.id
      });
      return;
    }
    controls[control.id] = control;
  });

  const controlsByName = buildNameIndex(controls);
  resolveLabels(controls, controlsByName, ctx);
  const layouts = parseLayouts(form);
  checkLayouts(layouts, controls, ctx);
  const rules = parseRules(form, ctx);
  checkRuleTargets(rules, controls, ctx);
  const variables = parseVariables(form, ctx);
  const unsupported = checkScripts(form, ctx);
  checkExpressions(controls, ctx);

  const definition: FormDefinition = {
    parserVersion: PARSER_VERSION,
    id: normalizeGuid(text(form, 'Id')),
    version: (text(form, 'Version') || '').trim(),
    formType: (text(form, 'FormType') || 'ListForm').trim(),
    css: cleanCss(text(form, 'Css')),
    layouts,
    controls,
    controlsByName,
    rules,
    variables,
    unsupported,
    diagnostics: ctx.diagnostics.toArray()
  };
  return { definition: options.freeze ? deepFreeze(definition) : definition, diagnostics: ctx.diagnostics.toArray() };
}

/** Decodes the raw bytes of an export (UTF-16LE/UTF-8, see {@link decodeXmlBytes}) and parses it. */
export function parseNintexFormBytes(bytes: Uint8Array, options?: ParseFormOptions): ParseFormResult {
  return parseNintexForm(decodeXmlBytes(bytes), options);
}
