import DOMPurify from 'dompurify';

const FORBID_TAGS: string[] = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'style', 'link', 'meta', 'base'];

/**
 * Sanitizes HTML from the form definition (rich text labels) or from rich text fields before rendering
 * (Rendszerterv §14): inline `style` is kept, scripts, frames and `on*` handlers are removed.
 */
export function sanitizeHtml(html: string | undefined): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR: ['srcset'],
    ALLOW_DATA_ATTR: false
  }) as unknown as string;
}

/** Plain text of an HTML fragment (for aria labels and responsive headings). */
export function htmlToText(html: string | undefined): string {
  if (!html) return '';
  const sanitized = sanitizeHtml(html);
  const div = document.createElement('div');
  div.innerHTML = sanitized;
  return (div.textContent || '').replace(/ /g, ' ').trim();
}
