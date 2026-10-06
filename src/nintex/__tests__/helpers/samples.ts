import * as fs from 'fs';
import * as path from 'path';
import type { FormDefinition } from '../../model/FormDefinition';
import { parseNintexFormBytes } from '../../parser/NintexXmlParser';

/** Tests run from lib-commonjs/nintex/__tests__/helpers; samples live in <repo>/samples. */
export const SAMPLES_DIR: string = path.resolve(__dirname, '../../../../samples');

export const SAMPLE_FILES: string[] = ['AJForm.xml', 'ATForm.xml', 'Form.xml', 'MUForm.xml', 'NyForm.xml'];

export function readSampleBytes(fileName: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(SAMPLES_DIR, fileName)));
}

const cache: Record<string, FormDefinition> = {};

/** Parses a sample export (cached per test file). Throws if the sample cannot be parsed at all. */
export function parseSample(fileName: string): FormDefinition {
  if (!cache[fileName]) {
    const result = parseNintexFormBytes(readSampleBytes(fileName));
    if (!result.definition) {
      throw new Error(`${fileName}: ${result.diagnostics.map((d) => d.message).join('; ')}`);
    }
    cache[fileName] = result.definition;
  }
  return cache[fileName];
}
