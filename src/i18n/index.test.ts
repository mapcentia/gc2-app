import { test, expect } from 'vitest';
import i18n, { formatNumber, formatTime, preferredLanguages } from './index';

test('server text is interpolated verbatim', () => {
  expect(i18n.getFixedT('en')('common.errorWithMessage', { message: '<b>a & b</b> {{x}}' })).toBe(
    'Error: <b>a & b</b> {{x}}',
  );
});

test('server text is interpolated verbatim in Danish', () => {
  expect(i18n.getFixedT('da')('common.errorWithMessage', { message: '<b>a & b</b> {{x}}' })).toBe(
    'Fejl: <b>a & b</b> {{x}}',
  );
});

test('formatNumber follows the given language', () => {
  expect(formatNumber(1234567, 'en')).toBe('1,234,567');
  expect(formatNumber(1234567, 'da')).toBe('1.234.567');
});

test('formatTime is 24-hour in both languages', () => {
  const d = new Date(2026, 0, 1, 15, 4, 5);
  expect(formatTime(d, 'en')).toMatch(/^15/);
  expect(formatTime(d, 'da')).toMatch(/^15/);
});

test('plural picks _one for 1 and _other for 0 and 2', () => {
  for (const l of ['en', 'da'] as const) {
    const t = i18n.getFixedT(l);
    expect(t('common.selectedCount', { count: 1 })).toBe(l === 'en' ? '1 selected' : '1 valgt');
    expect(t('common.selectedCount', { count: 0 })).toBe(l === 'en' ? '0 selected' : '0 valgte');
    expect(t('common.selectedCount', { count: 2 })).toBe(l === 'en' ? '2 selected' : '2 valgte');
  }
});

test('unknown da key falls back to English', () => {
  const translation = i18n.store.data.en.translation as Record<string, unknown>;
  translation.probeKey = 'Probe';
  try {
    expect(i18n.getFixedT('da')('probeKey' as never)).toBe('Probe');
  } finally {
    delete translation.probeKey; // do not leak the probe into other tests
  }
});

test('preferredLanguages uses navigator.languages when present', () => {
  expect(preferredLanguages({ languages: ['da-DK', 'en'], language: 'en-US' })).toEqual(['da-DK', 'en']);
});

test('preferredLanguages falls back to navigator.language when languages is empty or missing', () => {
  expect(preferredLanguages({ languages: [], language: 'da-DK' })).toEqual(['da-DK']);
  expect(preferredLanguages({ language: 'da-DK' })).toEqual(['da-DK']);
});

test('preferredLanguages returns [] without a navigator or any language', () => {
  expect(preferredLanguages(undefined)).toEqual([]);
  expect(preferredLanguages({})).toEqual([]);
});
