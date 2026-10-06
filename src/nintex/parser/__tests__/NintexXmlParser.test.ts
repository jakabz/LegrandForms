import type { ChoiceControl, LabelControl, TextBoxControl } from '../../model/controls';
import { parseNintexForm, parseNintexFormBytes } from '../NintexXmlParser';
import { decodeXmlBytes } from '../xml';

const NS =
  'xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.datacontract.org/2004/07/Nintex.Forms"';
const ARR = 'xmlns:d4p1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"';

function control(type: string, typeId: string, id: string, inner: string): string {
  return `<d2p1:FormControlProperties i:type="d2p1:${type}">
    <d2p1:FormControlTypeUniqueId>${typeId}</d2p1:FormControlTypeUniqueId>
    <d2p1:UniqueId>${id}</d2p1:UniqueId>
    <d2p1:IsVisible>true</d2p1:IsVisible>
    <d2p1:InsertReferences ${ARR}/>
    ${inner}
  </d2p1:FormControlProperties>`;
}

function form(controls: string, extra: string = ''): string {
  return `<?xml version="1.0" encoding="utf-16"?><Form ${NS}>
  <Css>.a{&amp;nbsp;color:red}</Css>
  <FormControls xmlns:d2p1="http://schemas.datacontract.org/2004/07/Nintex.Forms.FormControls">${controls}</FormControls>
  <FormLayouts><FormLayout><DeviceName>Desktop</DeviceName><Width>700</Width><Height>300</Height>
    <FormControlLayouts>
      <FormControlLayout><FormControlLayouts/><FormControlUniqueId>11111111-1111-1111-1111-111111111111</FormControlUniqueId><Height>50</Height><Left>0</Left><Top>10</Top><Width>200</Width><ZIndex>100</ZIndex></FormControlLayout>
      <FormControlLayout><FormControlLayouts/><FormControlUniqueId>22222222-2222-2222-2222-222222222222</FormControlUniqueId><Height>50</Height><Left>200</Left><Top>10</Top><Width>500</Width><ZIndex>100</ZIndex></FormControlLayout>
    </FormControlLayouts>
  </FormLayout></FormLayouts>
  <FormType>ListForm</FormType>
  <Id>{ABCDEF00-0000-0000-0000-00000000000A}</Id>
  ${extra}
  <Script/>
  <ScriptUrls xmlns:d2p1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><d2p1:string/></ScriptUrls>
  <Version>101.3.1.10</Version>
</Form>`;
}

const LABEL = control(
  'LabelFormControlProperties',
  'c0a89c70-0781-4bd4-8623-f73675005e00',
  '11111111-1111-1111-1111-111111111111',
  '<d2p1:Name i:nil="true"/><d2p1:Text>&lt;strong&gt;Cím&lt;/strong&gt;</d2p1:Text><d2p1:AssociatedControl>title</d2p1:AssociatedControl>'
);
const TEXTBOX = control(
  'TextBoxFormControlProperties',
  'C0A89C70-0781-4BD4-8623-F73675005E05',
  '22222222-2222-2222-2222-222222222222',
  `<d2p1:Name>Title</d2p1:Name><d2p1:DataField>List:Doc_x0020_Title</d2p1:DataField><d2p1:IsRequired>true</d2p1:IsRequired>
   <d2p1:DataType>Double</d2p1:DataType><d2p1:MaxLength>15</d2p1:MaxLength><d2p1:DefaultValue i:nil="true"/>
   <d2p1:UseRegularExpressionValidation>true</d2p1:UseRegularExpressionValidation><d2p1:RegularExpression>^\\d+$</d2p1:RegularExpression>
   <d2p1:RegularExpressionErrorMessage>Csak szám</d2p1:RegularExpressionErrorMessage>`
);

describe('parseNintexForm – structure', () => {
  const result = parseNintexForm(form(LABEL + TEXTBOX));
  const definition = result.definition!;

  it('reads form properties with normalized guid', () => {
    expect(definition.id).toBe('abcdef00-0000-0000-0000-00000000000a');
    expect(definition.version).toBe('101.3.1.10');
    expect(definition.formType).toBe('ListForm');
    expect(definition.css).toBe('.a {\n  color:red;\n}');
  });

  it('identifies controls by i:type and type id (case-insensitive)', () => {
    const textBox = definition.controls['22222222-2222-2222-2222-222222222222'] as TextBoxControl;
    expect(textBox.type).toBe('TextBox');
    expect(textBox.typeId).toBe('c0a89c70-0781-4bd4-8623-f73675005e05');
    expect(textBox.dataField).toEqual({ source: 'List', internalName: 'Doc_x0020_Title' });
    expect(textBox.isRequired).toBe(true);
    expect(textBox.dataType).toBe('Double');
    expect(textBox.maxLength).toBe(15);
    expect(textBox.defaultValue).toBeUndefined();
    expect(textBox.validators).toEqual({ regex: { pattern: '^\\d+$', message: 'Csak szám' } });
  });

  it('resolves label AssociatedControl by Name, case-insensitively', () => {
    const label = definition.controls['11111111-1111-1111-1111-111111111111'] as LabelControl;
    expect(label.text).toBe('<strong>Cím</strong>');
    expect(label.associatedControlName).toBe('title');
    expect(label.associatedControlId).toBe('22222222-2222-2222-2222-222222222222');
    expect(definition.controlsByName).toEqual({ title: '22222222-2222-2222-2222-222222222222' });
  });

  it('reads the layout', () => {
    expect(definition.layouts).toHaveLength(1);
    expect(definition.layouts[0]).toEqual(
      expect.objectContaining({ name: 'Desktop', width: 700, height: 300, isMobileAppLayout: false })
    );
    expect(definition.layouts[0].items[1]).toEqual({
      controlId: '22222222-2222-2222-2222-222222222222',
      left: 200,
      top: 10,
      width: 500,
      height: 50,
      zIndex: 100,
      children: []
    });
  });

  it('produces no diagnostics for a clean form', () => {
    expect(result.diagnostics).toEqual([]);
  });

  it('produces a JSON-serializable model', () => {
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });

  it('can deep-freeze the definition', () => {
    const frozen = parseNintexForm(form(LABEL + TEXTBOX), { freeze: true }).definition!;
    expect(Object.isFrozen(frozen.controls['22222222-2222-2222-2222-222222222222'])).toBe(true);
  });
});

describe('parseNintexForm – rules', () => {
  function rule(inner: string): string {
    return `<Rule><Bold>false</Bold><ControlIds ${ARR}>${inner}</Rule>`;
  }
  const rules = `<Rules>
    ${rule(`<d4p1:string>22222222-2222-2222-2222-222222222222</d4p1:string></ControlIds>
      <Expression>&lt;a reftext="x"&gt;BROKEN&lt;/a&gt;</Expression>
      <ExpressionValue>{ItemProperty:Status}&amp;nbsp;== "&amp;lt;típus&amp;gt;"</ExpressionValue>
      <Hide>true</Hide><Disable>false</Disable><Id>AAAAAAAA-0000-0000-0000-000000000001</Id><RuleType>Formatting</RuleType><Title>Hide</Title>
      <Color>red</Color><Align>Center</Align><ValidationMessage i:nil="true"/>`)}
    ${rule(`<d4p1:string>22222222-2222-2222-2222-222222222222</d4p1:string></ControlIds>
      <ExpressionValue/><Hide>true</Hide><Id>AAAAAAAA-0000-0000-0000-000000000002</Id><RuleType>Formatting</RuleType><Title>New rule 12</Title>`)}
    ${rule(`</ControlIds>
      <ExpressionValue>{Common:IsNewMode}</ExpressionValue><Hide>true</Hide><Id>AAAAAAAA-0000-0000-0000-000000000003</Id><RuleType>Formatting</RuleType><Title>HideWhenNew</Title>`)}
    ${rule(`</ControlIds>
      <ExpressionValue>{Control:291A341C-3058-4F1C-BF7E-A776D8D4E512}=="x"</ExpressionValue><Id>AAAAAAAA-0000-0000-0000-000000000004</Id><RuleType>Validation</RuleType><Title>FormLevel</Title>
      <ValidationMessage>Hibás &amp;amp; rossz</ValidationMessage>`)}
  </Rules>`;
  const result = parseNintexForm(form(LABEL + TEXTBOX, rules));
  const definition = result.definition!;

  it('uses ExpressionValue (normalized), never Expression', () => {
    const first = definition.rules[0];
    expect(first.expressionSource).toBe('{ItemProperty:Status} == "<típus>"');
    expect(first.expression).toEqual({
      kind: 'Binary',
      operator: '==',
      left: { kind: 'Reference', namespace: 'ItemProperty', name: 'Status' },
      right: { kind: 'Literal', value: '<típus>' }
    });
    expect(first).toEqual(
      expect.objectContaining({ id: 'aaaaaaaa-0000-0000-0000-000000000001', type: 'Formatting', hide: true, disable: false, inert: false })
    );
    expect(first.format).toEqual({ fontColor: 'red', horizontalAlignment: 'Center' });
  });

  it('marks empty-expression and target-less formatting rules inert (EmptyRule)', () => {
    expect(definition.rules[1]).toEqual(expect.objectContaining({ expression: null, inert: true }));
    expect(definition.rules[2]).toEqual(expect.objectContaining({ controlIds: [], inert: true }));
    const emptyRules = result.diagnostics.filter((d) => d.code === 'EmptyRule').map((d) => d.ruleId);
    expect(emptyRules).toEqual(['aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003']);
  });

  it('keeps target-less validation rules as form-level validations', () => {
    expect(definition.rules[3]).toEqual(
      expect.objectContaining({ type: 'Validation', controlIds: [], inert: false, validationMessage: 'Hibás & rossz' })
    );
  });

  it('reports orphan control references without throwing', () => {
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'OrphanReference',
        level: 'warn',
        ruleId: 'aaaaaaaa-0000-0000-0000-000000000004'
      })
    );
  });
});

describe('parseNintexForm – literal vs expression properties', () => {
  const choice = control(
    'ChoiceFormControlProperties',
    'c0a89c70-0781-4bd4-8623-f73675005e02',
    '33333333-3333-3333-3333-333333333333',
    `<d2p1:Name>Status</d2p1:Name><d2p1:DataField>List:Status</d2p1:DataField>
     <d2p1:Choices ${ARR}><d4p1:string>Készítés alatt</d4p1:string><d4p1:string>{ItemProperty:AuditOrg}</d4p1:string><d4p1:string/></d2p1:Choices>
     <d2p1:DefaultValue>Készítés alatt</d2p1:DefaultValue>
     <d2p1:UseCustomValidation>true</d2p1:UseCustomValidation>
     <d2p1:CustomValidationFunction>{ItemProperty:TypeofDoc}=="&amp;lt;típus&amp;gt;"</d2p1:CustomValidationFunction>
     <d2p1:CustomErrorMessage>If({ItemProperty:Form}=="Minőségcél","A","B")</d2p1:CustomErrorMessage>
     <d2p1:InsertReferences ${ARR}><d4p1:KeyValueOfstringstring><d4p1:Key>IsEnabled</d4p1:Key><d4p1:Value>fn-IsMemberOfGroup("Hungary Owners")</d4p1:Value></d4p1:KeyValueOfstringstring>
       <d4p1:KeyValueOfstringstring><d4p1:Key>DateOnly</d4p1:Key><d4p1:Value>{ItemProperty:Created}</d4p1:Value></d4p1:KeyValueOfstringstring></d2p1:InsertReferences>`
  ).replace(`<d2p1:InsertReferences ${ARR}/>`, '');
  const result = parseNintexForm(form(choice));
  const parsed = result.definition!.controls['33333333-3333-3333-3333-333333333333'] as ChoiceControl;

  it('classifies choices and defaults', () => {
    expect(parsed.choices).toEqual([
      { kind: 'literal', text: 'Készítés alatt' },
      { kind: 'expression', source: '{ItemProperty:AuditOrg}', ast: { kind: 'Reference', namespace: 'ItemProperty', name: 'AuditOrg' } }
    ]);
    expect(parsed.defaultValue).toEqual({ kind: 'literal', text: 'Készítés alatt' });
  });

  it('compiles custom validation and its message', () => {
    expect(parsed.customValidation && parsed.customValidation.source).toBe('{ItemProperty:TypeofDoc}=="<típus>"');
    expect(parsed.customValidation && parsed.customValidation.message && parsed.customValidation.message.kind).toBe('expression');
  });

  it('reads known InsertReferences and reports unknown ones', () => {
    expect(parsed.bindings).toEqual([
      {
        property: 'IsEnabled',
        value: {
          kind: 'expression',
          source: 'fn-IsMemberOfGroup("Hungary Owners")',
          ast: { kind: 'Call', name: 'fn-IsMemberOfGroup', args: [{ kind: 'Literal', value: 'Hungary Owners' }] }
        }
      }
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'UnknownBinding', controlId: '33333333-3333-3333-3333-333333333333' })
    );
  });
});

describe('parseNintexForm – robustness', () => {
  it('returns XmlParseError for malformed XML', () => {
    const result = parseNintexForm('<Form><Broken></Form>');
    expect(result.definition).toBeNull();
    expect(result.diagnostics[0]).toEqual(expect.objectContaining({ level: 'error', code: 'XmlParseError' }));
  });

  it('returns XmlParseError for a non-Nintex document', () => {
    expect(parseNintexForm('<Other/>').diagnostics[0].code).toBe('XmlParseError');
    expect(parseNintexForm('').diagnostics[0].code).toBe('XmlParseError');
  });

  it('maps unknown control types to Unsupported with a diagnostic', () => {
    const unknown = control('RepeaterFormControlProperties', 'deadbeef-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', '');
    const result = parseNintexForm(form(unknown));
    expect(result.definition!.controls['44444444-4444-4444-4444-444444444444'].type).toBe('Unsupported');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'UnsupportedControl' }));
  });

  it('reports scripts as ScriptIgnored and never keeps them executable', () => {
    const button = control(
      'ButtonFormControlProperties',
      'c0a89c70-0781-4bd4-8623-f73675005e09',
      '55555555-5555-5555-5555-555555555555',
      '<d2p1:ButtonCommand>Save</d2p1:ButtonCommand><d2p1:ClientClick>alert(1)</d2p1:ClientClick>'
    );
    const xml = form(button).replace('<Script/>', '<Script>alert(2)</Script>');
    const result = parseNintexForm(xml);
    expect(result.definition!.unsupported.script).toBe(true);
    expect(result.diagnostics.filter((d) => d.code === 'ScriptIgnored')).toHaveLength(2);
  });

  it('reports parse errors and unknown functions in expressions', () => {
    const calc = control(
      'CalculationFormControlProperties',
      'c0a89c70-0781-4bd4-8623-f73675005e17',
      '66666666-6666-6666-6666-666666666666',
      '<d2p1:Formula>userProfileLookup({Common:CurrentUser}, "Department") + If(1)</d2p1:Formula>'
    );
    const broken = control(
      'CalculationFormControlProperties',
      'c0a89c70-0781-4bd4-8623-f73675005e17',
      '77777777-7777-7777-7777-777777777777',
      '<d2p1:Formula>If(1,</d2p1:Formula>'
    );
    const result = parseNintexForm(form(calc + broken));
    const codes = result.diagnostics.map((d) => `${d.level}:${d.code}`);
    expect(codes).toContain('error:UnsupportedFunction');
    expect(codes).toContain('error:ExpressionParseError');
    expect(result.definition!.controls['77777777-7777-7777-7777-777777777777']).toEqual(
      expect.objectContaining({ formula: expect.objectContaining({ ast: expect.objectContaining({ kind: 'Error' }) }) })
    );
  });
});

describe('decodeXmlBytes', () => {
  function utf16le(text: string, bom: boolean): Uint8Array {
    const bytes = new Uint8Array(text.length * 2 + (bom ? 2 : 0));
    let offset = 0;
    if (bom) {
      bytes[0] = 0xff;
      bytes[1] = 0xfe;
      offset = 2;
    }
    for (let i = 0; i < text.length; i++) {
      bytes[offset + i * 2] = text.charCodeAt(i) & 0xff;
      bytes[offset + i * 2 + 1] = text.charCodeAt(i) >> 8;
    }
    return bytes;
  }

  it('decodes UTF-16LE with and without BOM', () => {
    expect(decodeXmlBytes(utf16le('<a>ő</a>', false))).toBe('<a>ő</a>');
    expect(decodeXmlBytes(utf16le('<a>ő</a>', true))).toBe('<a>ő</a>');
  });

  it('decodes UTF-16BE with BOM', () => {
    expect(decodeXmlBytes(new Uint8Array([0xfe, 0xff, 0, 0x3c, 0, 0x61, 0, 0x3e]))).toBe('<a>');
  });

  it('decodes UTF-8 with and without BOM', () => {
    expect(decodeXmlBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c, 0xc5, 0x91, 0x3e]))).toBe('<ő>');
    expect(decodeXmlBytes(new Uint8Array([0x3c, 0xc5, 0x91, 0x3e]))).toBe('<ő>');
  });

  it('parses a UTF-16 document end-to-end', () => {
    const result = parseNintexFormBytes(utf16le(form(LABEL + TEXTBOX), false));
    expect(result.definition && Object.keys(result.definition.controls)).toHaveLength(2);
  });
});
