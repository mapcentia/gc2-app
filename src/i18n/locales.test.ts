import { describe, test, expect } from 'vitest';
import en from './locales/en.json';
import da from './locales/da.json';

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

const flat = { en: flatten(en), da: flatten(da) };
const placeholders = (s: string) => [...s.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('locale files', () => {
  test('da and en have identical key sets', () => {
    expect(Object.keys(flat.da).sort()).toEqual(Object.keys(flat.en).sort());
  });

  test('no empty values', () => {
    for (const lang of ['en', 'da'] as const)
      for (const [k, v] of Object.entries(flat[lang])) expect(v.trim(), `${lang}:${k}`).not.toBe('');
  });

  test('each key uses the same {{placeholders}} in both languages', () => {
    for (const [k, v] of Object.entries(flat.en)) {
      expect(placeholders(flat.da[k] ?? ''), k).toEqual(placeholders(v));
    }
  });

  test('_one and _other keys come in pairs, in both directions', () => {
    for (const lang of ['en', 'da'] as const) {
      for (const k of Object.keys(flat[lang])) {
        if (k.endsWith('_one')) expect(flat[lang], `${lang}:${k}`).toHaveProperty(k.replace(/_one$/, '_other'));
        if (k.endsWith('_other')) expect(flat[lang], `${lang}:${k}`).toHaveProperty(k.replace(/_other$/, '_one'));
      }
    }
  });

  test('both languages use the same plural suffixes per base key', () => {
    const suffixes = (obj: Record<string, string>) => {
      const m: Record<string, string[]> = {};
      for (const k of Object.keys(obj)) {
        const hit = /^(.*)_(zero|one|two|few|many|other)$/.exec(k);
        if (hit) (m[hit[1]] ??= []).push(hit[2]);
      }
      for (const v of Object.values(m)) v.sort();
      return m;
    };
    expect(suffixes(flat.da)).toEqual(suffixes(flat.en));
  });
});
