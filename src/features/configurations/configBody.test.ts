import { describe, expect, it, test } from 'vitest';
import { STARTER_BODY, bodyProblem, formatBody } from './configBody';

describe('bodyProblem', () => {
  it.each([
    ['{"a":1}'],
    ['  {\n  "schemata": ["public"]\n}\n'],
    ['[1]'],
    ['[{"a":1}]'],
  ])('accepts %j', (text) => {
    expect(bodyProblem(text)).toBeNull();
  });

  it.each([[''], ['   '], ['\n\t']])('blank %j is "required"', (text) => {
    expect(bodyProblem(text)).toEqual({ kind: 'required' });
  });

  it.each([['{'], ['{"a":1,}'], ['{a:1}'], ['{"a":1} x']])('invalid JSON %j is "syntax" with the parser message', (text) => {
    const p = bodyProblem(text);
    expect(p?.kind).toBe('syntax');
    expect(p && 'detail' in p && p.detail.length).toBeGreaterThan(0);
  });

  // The API only stores a body that parses to an object or an array.
  it.each([['1'], ['"text"'], ['true'], ['null']])('scalar %j is "notObject"', (text) => {
    expect(bodyProblem(text)).toEqual({ kind: 'notObject' });
  });

  // v4 accepts {} but the old Dashboard cannot save an empty body, so it is refused here.
  it.each([['{}'], ['[]'], [' { } ']])('empty %j is "empty"', (text) => {
    expect(bodyProblem(text)).toEqual({ kind: 'empty' });
  });
});

describe('formatBody', () => {
  test('pretty-prints with 4 spaces like the Dashboard', () => {
    expect(formatBody('{"a":[1,2]}')).toBe('{\n    "a": [\n        1,\n        2\n    ]\n}');
  });

  test('returns the text unchanged when it is not valid JSON', () => {
    expect(formatBody('{"a":')).toBe('{"a":');
  });
});

test('the starter body is valid and matches the Dashboard template', () => {
  expect(bodyProblem(STARTER_BODY)).toBeNull();
  expect(JSON.parse(STARTER_BODY)).toEqual({
    schemata: ['public'],
    brandName: 'MapCentia ApS',
    aboutBox: '<p>My awesome web map</p>',
    enabledExtensions: ['conflictSearch', 'streetView', 'coordinates', 'session', 'editor', 'offlineMap'],
    template: 'default.tmpl',
  });
});
