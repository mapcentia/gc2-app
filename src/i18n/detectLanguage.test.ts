import { it, expect } from 'vitest';
import { detectLanguage } from './detectLanguage';

it.each([
  [['da-DK', 'en'], 'da'],
  [['da'], 'da'],
  [['DA-dk'], 'da'],
  [['en-US', 'da'], 'en'],
  [['en-GB'], 'en'],
  [['de', 'da', 'en'], 'da'],
  [['de', 'en', 'da'], 'en'],
  [['nb', 'sv'], 'en'],
  [['dan'], 'en'],
  [[], 'en'],
  [undefined, 'en'],
])('detectLanguage(%j) → %s', (input, expected) => {
  expect(detectLanguage(input as readonly string[] | undefined)).toBe(expected);
});
