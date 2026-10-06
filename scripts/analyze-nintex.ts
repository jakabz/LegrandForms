/**
 * Offline analyzer for Nintex Forms XML exports (Rendszerterv F-16).
 *
 *   npm run analyze -- samples/*.xml [--out temp/analysis] [--fail-on-error]
 *
 * For every file it writes `<name>.json` (parsed FormDefinition) and a combined `report.md`
 * (control/rule counts, diagnostics, bound fields, external dependencies) to the output folder.
 * Reuses the pure core in src/nintex, so the result matches what the form customizer sees at runtime.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  collectBoundFields,
  collectExternalDependencies,
  collectFunctionUsage,
  collectReferencedItemProperties,
  countControlsByType,
  Diagnostic,
  FormDefinition,
  parseNintexFormBytes
} from '../src/nintex';

interface Options {
  files: string[];
  outDir: string;
  failOnError: boolean;
}

interface FileResult {
  file: string;
  definition: FormDefinition | null;
  diagnostics: Diagnostic[];
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Expands `dir/*.xml` patterns (Windows shells do not expand globs). */
function expandPattern(pattern: string): string[] {
  if (!/[*?]/.test(pattern)) return [pattern];
  const dir = path.dirname(pattern);
  const matcher = globToRegExp(path.basename(pattern));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => matcher.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

function parseArgs(argv: string[]): Options {
  const options: Options = { files: [], outDir: path.join('temp', 'analysis'), failOnError: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') options.outDir = argv[++i];
    else if (arg === '--fail-on-error') options.failOnError = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run analyze -- <file.xml|pattern>... [--out <dir>] [--fail-on-error]');
      process.exit(0);
    } else options.files.push(...expandPattern(arg));
  }
  return options;
}

function countByLevel(diagnostics: Diagnostic[]): Record<'error' | 'warn' | 'info', number> {
  const counts = { error: 0, warn: 0, info: 0 };
  diagnostics.forEach((d) => counts[d.level]++);
  return counts;
}

function escapeCell(value: string | undefined): string {
  return (value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function controlLabel(definition: FormDefinition | null, controlId: string | undefined): string {
  if (!controlId) return '';
  const control = definition && definition.controls[controlId];
  if (!control) return controlId;
  return `${control.type} ${control.name || control.displayName || ''} (${controlId.substring(0, 8)})`.replace(/\s+/g, ' ');
}

function ruleLabel(definition: FormDefinition | null, ruleId: string | undefined): string {
  if (!ruleId) return '';
  const rule = definition && definition.rules.filter((r) => r.id === ruleId)[0];
  return rule ? rule.title : ruleId;
}

function renderReport(results: FileResult[]): string {
  const lines: string[] = [];
  lines.push('# Nintex XML elemzés', '', `Készült: ${new Date().toISOString()}`, '');
  lines.push('| Fájl | FormType | Layout | Vezérlő | Szabály | error | warn | info |', '|---|---|---|---|---|---|---|---|');
  results.forEach(({ file, definition, diagnostics }) => {
    const c = countByLevel(diagnostics);
    const layout = definition && definition.layouts[0] ? `${definition.layouts[0].width} × ${definition.layouts[0].height}` : '-';
    lines.push(
      `| ${path.basename(file)} | ${definition ? definition.formType : '-'} | ${layout} | ${
        definition ? Object.keys(definition.controls).length : '-'
      } | ${definition ? definition.rules.length : '-'} | ${c.error} | ${c.warn} | ${c.info} |`
    );
  });

  results.forEach(({ file, definition, diagnostics }) => {
    lines.push('', `## ${path.basename(file)}`, '');
    if (!definition) {
      lines.push('**A fájl nem dolgozható fel.**', '');
    } else {
      const counts = countControlsByType(definition);
      lines.push(
        `- Form Id: \`${definition.id}\`, verzió ${definition.version}`,
        `- Vezérlők: ${Object.keys(counts)
          .sort()
          .map((k) => `${k} ${counts[k]}`)
          .join(', ')}`,
        `- Szabályok: ${definition.rules.length} (${definition.rules.filter((r) => r.type === 'Validation').length} validáció, ${
          definition.rules.filter((r) => r.inert).length
        } hatástalan)`
      );
      const usage = collectFunctionUsage(definition);
      lines.push(`- Függvények: ${Object.keys(usage).sort().map((k) => `${k} ×${usage[k]}`).join(', ') || '–'}`);
      const deps = collectExternalDependencies(definition);
      lines.push(`- Lookup listák (cím alapján, K-06): ${deps.lookupLists.join(', ') || '–'}`);
      lines.push(`- SharePoint csoportok: ${deps.groups.join(', ') || '–'}`);
      lines.push(`- \`{ItemProperty:…}\` mezők: ${collectReferencedItemProperties(definition).join(', ') || '–'}`, '');

      lines.push('### Kötött mezők', '', '| Belső név | Javasolt típus | Kötelező | Vezérlő(k) |', '|---|---|---|---|');
      collectBoundFields(definition).forEach((field) => {
        lines.push(
          `| \`${field.internalName}\` | ${field.suggestedType} | ${field.required ? 'igen' : ''} | ${field.controlTypes.join(', ')} |`
        );
      });
      lines.push('');
    }

    lines.push('### Diagnosztika', '');
    if (!diagnostics.length) {
      lines.push('Nincs.');
    } else {
      lines.push('| Szint | Kód | Üzenet | Vezérlő | Szabály |', '|---|---|---|---|---|');
      diagnostics.forEach((d) => {
        lines.push(
          `| ${d.level} | ${d.code} | ${escapeCell(d.message)} | ${escapeCell(controlLabel(definition, d.controlId))} | ${escapeCell(
            ruleLabel(definition, d.ruleId)
          )} |`
        );
      });
    }
  });
  return lines.join('\n') + '\n';
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!options.files.length) {
    console.error('No input files. Usage: npm run analyze -- samples/*.xml');
    process.exit(2);
  }
  fs.mkdirSync(options.outDir, { recursive: true });

  const results: FileResult[] = options.files.map((file) => {
    const bytes = new Uint8Array(fs.readFileSync(file));
    const result = parseNintexFormBytes(bytes);
    const base = path.basename(file).replace(/\.xml$/i, '');
    if (result.definition) {
      fs.writeFileSync(path.join(options.outDir, `${base}.json`), JSON.stringify(result.definition, null, 2));
    }
    return { file, definition: result.definition, diagnostics: result.diagnostics };
  });

  const reportPath = path.join(options.outDir, 'report.md');
  fs.writeFileSync(reportPath, renderReport(results));

  let errors = 0;
  results.forEach(({ file, definition, diagnostics }) => {
    const c = countByLevel(diagnostics);
    errors += c.error;
    const summary = definition
      ? `${Object.keys(definition.controls).length} controls, ${definition.rules.length} rules`
      : 'NOT PARSED';
    console.log(`${path.basename(file).padEnd(16)} ${summary.padEnd(26)} error ${c.error}  warn ${c.warn}  info ${c.info}`);
    diagnostics
      .filter((d) => d.level === 'error')
      .forEach((d) => console.log(`    ERROR ${d.code}: ${d.message}${d.source ? `  [${d.source}]` : ''}`));
  });
  console.log(`\nReport: ${reportPath}`);
  if (options.failOnError && errors > 0) {
    process.exit(1);
  }
}

main();
