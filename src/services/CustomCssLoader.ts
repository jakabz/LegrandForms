import { cleanCustomCss } from '../nintex/css/cssCleaner';
import { decodeXmlBytes } from '../nintex/parser/xml';
import type { IDefinitionSource } from './FormDefinitionProvider';

/**
 * Loads the custom stylesheet of a content type (`customCssUrl`, Rendszerterv §11.4) and cleans it with the form
 * CSS rules. The result is unscoped; the renderer scopes it to the form root. Throws when the file cannot be read.
 */
export async function loadCustomCss(source: Pick<IDefinitionSource, 'getBytes'>, url: string): Promise<string> {
  const bytes = await source.getBytes(url);
  // Byte decoding handles UTF-8 (with or without BOM) as well as UTF-16 files saved by Windows editors.
  return cleanCustomCss(decodeXmlBytes(new Uint8Array(bytes)));
}
