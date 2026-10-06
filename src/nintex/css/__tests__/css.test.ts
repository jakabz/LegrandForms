import { cleanCss } from '../cssCleaner';
import { parseCss, splitSelectorList, stringifyCss } from '../cssParser';
import { scopeClassName, scopeCss, scopeSelector } from '../cssScoper';

/** Excerpt of the <Css> block shared by the sample exports (after XML entity decoding). */
const NINTEX_CSS = `
/* Template styles *//* Banner/Logo at top of form */
.Nintex-Forms-banner
{
&nbsp;background: no-repeat fixed left top;
} .nf-form-input .nf-filler-control-inner, .nf-form-label .nf-filler-control-inner
{
top: 10px;
bottom: 10px;
}
.nf-form-label
{
&nbsp;&nbsp;&nbsp; display: block;
&nbsp;&nbsp;&nbsp; text-align: right;
}
.nf-mobile-form .nf-form-label
{
&nbsp;text-align: left;
&nbsp;
}/* IE 8 designer fix */
.nf-mobile-form #uiDesignerSurface .nf-section
{
border-top: inherit;
}
#uiDesignerSurface input[type=text], #uiDesignerSurface&nbsp; select, .keep-me
{
background-color: rgb(253, 253, 253) !important;
}`;

describe('cssParser', () => {
  it('splits selector lists outside parentheses/brackets', () => {
    expect(splitSelectorList('a, b:not(.x, .y), [data-a="1,2"]')).toEqual(['a', 'b:not(.x, .y)', '[data-a="1,2"]']);
  });

  it('parses nested at-rules and block-less at-rules', () => {
    const nodes = parseCss('@import url(x.css); @media (max-width: 600px) { .a { color: red } } @font-face { font-family: X; } .b{}');
    expect(nodes.map((n) => (n.type === 'rule' ? `rule:${n.selectors.join(',')}` : `@${n.name}`))).toEqual([
      '@import',
      '@media',
      '@font-face',
      'rule:.b'
    ]);
    expect(stringifyCss(nodes)).toContain('@media (max-width: 600px) {\n  .a {\n    color: red;\n  }\n}');
  });

  it('keeps semicolons inside data URIs', () => {
    const css = '.a { background: url(data:image/png;base64,AAA=); color: red }';
    expect(stringifyCss(parseCss(css))).toBe('.a {\n  background: url(data:image/png;base64,AAA=);\n  color: red;\n}');
    expect(cleanCss(css)).toBe('.a {\n  background: url(data:image/png;base64,AAA=);\n  color: red;\n}');
  });

  it('drops unbalanced trailing input', () => {
    expect(parseCss('.a { color: red } .b { color: ')).toHaveLength(1);
  });
});

describe('cleanCss', () => {
  it('removes &nbsp; garbage and designer selectors, keeps real rules', () => {
    const cleaned = cleanCss(NINTEX_CSS);
    expect(cleaned).not.toMatch(/&nbsp;| /);
    expect(cleaned).not.toMatch(/uiDesignerSurface/);
    expect(cleaned).toContain('.nf-form-label {\n  display: block;\n  text-align: right;\n}');
    expect(cleaned).toContain('.keep-me {\n  background-color: rgb(253, 253, 253) !important;\n}');
    expect(cleaned).toContain('.nf-form-input .nf-filler-control-inner,\n.nf-form-label .nf-filler-control-inner {');
  });

  it('removes dangerous constructs and IE hacks', () => {
    const cleaned = cleanCss(
      '@import url(http://evil); .a { width: expression(alert(1)); color: red; *zoom: 1; _height: 1px; background: url(javascript:alert(1)); filter: progid:DXImageTransform.Microsoft.gradient(); behavior: url(x.htc) }'
    );
    expect(cleaned).toBe('.a {\n  color: red;\n}');
  });

  it('drops rules that become empty', () => {
    expect(cleanCss('.a { *zoom: 1 } #uiDesignerSurface .b { color: red }')).toBe('');
    expect(cleanCss(undefined)).toBe('');
  });
});

describe('scopeCss', () => {
  it('builds the scope class from the form id', () => {
    expect(scopeClassName('a9244a5f-7575-4972-a6e9-b1e6a4d52bbe')).toBe('nf-root-a9244a5f-7575-4972-a6e9-b1e6a4d52bbe');
  });

  it.each([
    ['.nf-form-label', '.s .nf-form-label'],
    ['body', '.s'],
    ['html body .x', '.s .x'],
    ['body .x', '.s .x'],
    ['body.dark .x', '.s.dark .x'],
    ['body > .x', '.s > .x'],
    [':root', '.s'],
    ['.bodyText', '.s .bodyText'],
    ['input[type=text]', '.s input[type=text]']
  ])('scopeSelector(%j)', (selector, expected) => {
    expect(scopeSelector(selector, '.s')).toBe(expected);
  });

  it('prefixes every selector, also inside @media; leaves @keyframes alone', () => {
    const scoped = scopeCss(
      '.a, .b { color: red } @media print { .c { display: none } } @keyframes spin { from { opacity: 0 } to { opacity: 1 } }',
      'nf-root-x'
    );
    expect(scoped).toContain('.nf-root-x .a,\n.nf-root-x .b {');
    expect(scoped).toContain('@media print {\n  .nf-root-x .c {');
    expect(scoped).toContain('@keyframes spin {\n  from { opacity: 0 } to { opacity: 1 }\n}');
    expect(scopeCss('', 'x')).toBe('');
  });
});
