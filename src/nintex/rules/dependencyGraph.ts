import { collectControlIds, usesSelf } from '../expression/references';
import type { ControlDefinition, ValueSource } from '../model/controls';
import type { FormDefinition, RuleDefinition } from '../model/FormDefinition';

function valueSourceControlIds(source: ValueSource | undefined): string[] {
  if (!source) return [];
  if (source.kind === 'expression') return collectControlIds(source.ast);
  if (source.kind === 'template') {
    const ids: string[] = [];
    source.parts.forEach((part) => {
      if (part.kind === 'reference' && part.ref.namespace === 'Control' && ids.indexOf(part.ref.name) < 0) {
        ids.push(part.ref.name);
      }
    });
    return ids;
  }
  return [];
}

function valueSourceUsesSelf(source: ValueSource | undefined): boolean {
  if (!source) return false;
  if (source.kind === 'expression') return usesSelf(source.ast);
  if (source.kind === 'template') return source.parts.some((p) => p.kind === 'reference' && p.ref.namespace === 'Self');
  return false;
}

function addAll(target: Set<string>, values: string[]): void {
  values.forEach((v) => target.add(v));
}

/**
 * Static dependency graph between controls and their consumers (rules, calculations, bindings).
 * Built once per definition; used to re-evaluate only what a value change can affect (Rendszerterv §9.3).
 */
export class DependencyGraph {
  /** Calculation controls in topological order (dependencies first). */
  public readonly calculationOrder: string[];
  /** Calculation ids that take part in a cycle. */
  public readonly cyclicCalculations: string[];

  private readonly _rulesByDependency: Map<string, Set<string>> = new Map();
  private readonly _bindingsByDependency: Map<string, Set<string>> = new Map();
  private readonly _calcsByDependency: Map<string, Set<string>> = new Map();
  private readonly _calcDependencies: Map<string, string[]> = new Map();

  public constructor(definition: FormDefinition) {
    definition.rules.forEach((rule) => this._indexRule(rule));
    const calculationIds: string[] = [];
    Object.keys(definition.controls).forEach((id) => {
      const control = definition.controls[id];
      this._indexBindings(control);
      if (control.type === 'Calculation') {
        calculationIds.push(id);
        const deps = control.formula ? collectControlIds(control.formula.ast) : [];
        this._calcDependencies.set(id, deps);
        deps.forEach((dep) => this._add(this._calcsByDependency, dep, id));
      }
    });
    const { order, cyclic } = this._sortCalculations(calculationIds);
    this.calculationOrder = order;
    this.cyclicCalculations = cyclic;
  }

  /** Control ids a rule depends on (including its targets when it reads `{Self}`). */
  public static ruleDependencies(rule: RuleDefinition): string[] {
    const deps = collectControlIds(rule.expression);
    if (usesSelf(rule.expression)) {
      rule.controlIds.forEach((id) => {
        if (deps.indexOf(id) < 0) deps.push(id);
      });
    }
    return deps;
  }

  public calculationDependencies(calculationId: string): string[] {
    return this._calcDependencies.get(calculationId) || [];
  }

  /** Calculations (transitively) affected by a change of the given controls, in evaluation order. */
  public affectedCalculations(changed: Iterable<string>): string[] {
    const affected = new Set<string>();
    const queue: string[] = Array.from(changed);
    while (queue.length) {
      const id = queue.shift() as string;
      const consumers = this._calcsByDependency.get(id);
      if (!consumers) continue;
      consumers.forEach((calc) => {
        if (!affected.has(calc)) {
          affected.add(calc);
          queue.push(calc);
        }
      });
    }
    return this.calculationOrder.filter((id) => affected.has(id)).concat(this.cyclicCalculations.filter((id) => affected.has(id)));
  }

  /** Rules whose expression reads one of the given controls. */
  public affectedRules(changed: Iterable<string>): Set<string> {
    return this._collect(this._rulesByDependency, changed);
  }

  /** Controls whose property bindings (InsertReferences) read one of the given controls. */
  public affectedBindings(changed: Iterable<string>): Set<string> {
    return this._collect(this._bindingsByDependency, changed);
  }

  private _collect(index: Map<string, Set<string>>, changed: Iterable<string>): Set<string> {
    const result = new Set<string>();
    Array.from(changed).forEach((id) => {
      const consumers = index.get(id);
      if (consumers) consumers.forEach((c) => result.add(c));
    });
    return result;
  }

  private _add(index: Map<string, Set<string>>, dependency: string, consumer: string): void {
    let set = index.get(dependency);
    if (!set) {
      set = new Set<string>();
      index.set(dependency, set);
    }
    set.add(consumer);
  }

  private _indexRule(rule: RuleDefinition): void {
    if (rule.inert || !rule.expression) return;
    DependencyGraph.ruleDependencies(rule).forEach((dep) => this._add(this._rulesByDependency, dep, rule.id));
  }

  private _indexBindings(control: ControlDefinition): void {
    const deps = new Set<string>();
    control.bindings.forEach((binding) => {
      addAll(deps, valueSourceControlIds(binding.value));
      if (valueSourceUsesSelf(binding.value)) deps.add(control.id);
    });
    deps.forEach((dep) => this._add(this._bindingsByDependency, dep, control.id));
  }

  /** Kahn's algorithm over calculation → calculation edges. */
  private _sortCalculations(ids: string[]): { order: string[]; cyclic: string[] } {
    const isCalc = new Set(ids);
    const inDegree = new Map<string, number>();
    ids.forEach((id) => inDegree.set(id, 0));
    ids.forEach((id) =>
      this.calculationDependencies(id).forEach((dep) => {
        if (isCalc.has(dep) && dep !== id) inDegree.set(id, (inDegree.get(id) || 0) + 1);
        if (dep === id) inDegree.set(id, (inDegree.get(id) || 0) + 1);
      })
    );
    const order: string[] = [];
    const ready = ids.filter((id) => inDegree.get(id) === 0);
    while (ready.length) {
      const id = ready.shift() as string;
      order.push(id);
      const consumers = this._calcsByDependency.get(id);
      if (!consumers) continue;
      consumers.forEach((consumer) => {
        if (!isCalc.has(consumer) || consumer === id) return;
        const remaining = (inDegree.get(consumer) || 0) - 1;
        inDegree.set(consumer, remaining);
        if (remaining === 0) ready.push(consumer);
      });
    }
    const cyclic = ids.filter((id) => order.indexOf(id) < 0);
    return { order, cyclic };
  }
}
