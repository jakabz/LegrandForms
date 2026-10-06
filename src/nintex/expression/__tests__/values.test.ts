import {
  addValues,
  compareValues,
  dateToText,
  isEmptyValue,
  looseEquals,
  parseNumber,
  PersonValue,
  toBoolean,
  toDate,
  toNumber,
  toText
} from '../values';

const BOB: PersonValue = { kind: 'person', displayName: 'Bob', loginName: 'bob' };

describe('values', () => {
  it('toText', () => {
    expect(toText(null)).toBe('');
    expect(toText(undefined)).toBe('');
    expect(toText(1.5)).toBe('1.5');
    expect(toText(NaN)).toBe('');
    expect(toText(false)).toBe('false');
    expect(toText([BOB, { kind: 'person', displayName: '', email: 'e@x' }])).toBe('Bob;e@x');
    expect(toText([{ kind: 'lookup', id: 1, title: 'A' }, 'B'])).toBe('A;B');
    expect(toText(new Date(2024, 0, 2))).toBe('2024-01-02');
    expect(toText(new Date(2024, 0, 2, 13, 4))).toBe('2024-01-02 13:04');
    expect(dateToText(new Date(NaN))).toBe('');
  });

  it('isEmptyValue', () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue(' ')).toBe(false);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(new Date(NaN))).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
  });

  it('parseNumber accepts Hungarian and English formats', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('-3')).toBe(-3);
    expect(parseNumber('50%')).toBe(50);
    expect(parseNumber('abc')).toBeNaN();
    expect(parseNumber('')).toBeNaN();
  });

  it('toNumber / toBoolean', () => {
    expect(toNumber(true)).toBe(1);
    expect(toNumber(['4'])).toBe(4);
    expect(toNumber(['4', '5'])).toBeNaN();
    expect(toNumber(null)).toBeNaN();
    expect(toBoolean('FALSE')).toBe(false);
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean('x')).toBe(true);
    expect(toBoolean([BOB])).toBe(true);
    expect(toBoolean(new Date())).toBe(true);
    expect(toBoolean(NaN)).toBe(false);
  });

  it('toDate', () => {
    expect(toDate('2024-05-01')).toEqual(new Date(2024, 4, 1));
    expect(toDate('2024. 05. 01.')).toEqual(new Date(2024, 4, 1));
    expect(toDate('2024.5.1 10:30')).toEqual(new Date(2024, 4, 1, 10, 30));
    expect(toDate('2024-05-01T10:00:00Z')).toEqual(new Date(Date.UTC(2024, 4, 1, 10)));
    expect(toDate('2024-02-30')).toBeNull();
    expect(toDate('hello')).toBeNull();
    expect(toDate(5)).toBeNull();
    expect(toDate(['2024-05-01'])).toEqual(new Date(2024, 4, 1));
  });

  it('looseEquals', () => {
    expect(looseEquals(null, '')).toBe(true);
    expect(looseEquals([], null)).toBe(true);
    expect(looseEquals([BOB], 'Bob')).toBe(true);
    expect(looseEquals(new Date(2024, 0, 1), new Date(2024, 0, 1))).toBe(true);
    expect(looseEquals(1, 1)).toBe(true);
    expect(looseEquals(true, false)).toBe(false);
    expect(looseEquals(0, '')).toBe(false);
  });

  it('compareValues / addValues', () => {
    expect(compareValues(new Date(2024, 0, 2), '2024-01-01')).toBeGreaterThan(0);
    expect(compareValues(new Date(2024, 0, 2), 'x')).toBeNaN();
    expect(compareValues('a', 'a')).toBe(0);
    expect(compareValues('a', 'b')).toBeLessThan(0);
    expect(addValues(new Date(2024, 0, 2), '!')).toBe('2024-01-02!');
    expect(addValues(true, 1)).toBe(2);
  });
});
