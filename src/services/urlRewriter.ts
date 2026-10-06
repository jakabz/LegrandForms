/**
 * URL rewriting for migrated forms (Rendszerterv §11.3): on-prem prefixes → SPO prefixes, relative URLs
 * resolved against the tenant origin. Only http(s) and relative URLs are allowed in the output.
 */
export function rewriteUrl(url: string | undefined, rewrites: Record<string, string>, origin: string): string {
  if (!url) return '';
  let result = url.trim();
  const lower = result.toLowerCase();
  // Longest matching prefix wins.
  const prefixes = Object.keys(rewrites).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (prefix && lower.indexOf(prefix.toLowerCase()) === 0) {
      result = rewrites[prefix] + result.substring(prefix.length);
      break;
    }
  }
  if (/^\/[^/]/.test(result)) {
    result = origin.replace(/\/$/, '') + result;
  }
  if (!/^https?:\/\//i.test(result)) {
    // javascript:, data:, protocol-relative or garbage → dropped
    return '';
  }
  return result;
}
