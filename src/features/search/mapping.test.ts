import { describe, it, expect } from 'vitest';
import { buildOverrides, inferType, isLegacyIndex, isLegacyType, readOverrides } from './mapping';

describe('inferType', () => {
  it('derives the mapping type from the PostgreSQL type', () => {
    expect(inferType('character varying')).toBe('text');
    expect(inferType('text')).toBe('text');
    expect(inferType('integer')).toBe('integer');
    expect(inferType('bigint')).toBe('long');
    expect(inferType('real')).toBe('float');
    expect(inferType('double precision')).toBe('double');
    expect(inferType('numeric')).toBe('double');
    expect(inferType('timestamp with time zone')).toBe('date');
    expect(inferType('date')).toBe('date');
  });

  it('maps point geometry to geo_point and other geometry to geo_shape', () => {
    expect(inferType('geometry', 'POINT')).toBe('geo_point');
    expect(inferType('geometry', 'MULTIPOLYGON')).toBe('geo_shape');
    expect(inferType('geometry', null)).toBe('geo_shape');
  });

  it('returns null for types without a documented derivation', () => {
    expect(inferType('uuid')).toBeNull();
    expect(inferType(undefined)).toBeNull();
  });
});

describe('legacy values', () => {
  it('flags v2 types and index values', () => {
    expect(isLegacyType('string')).toBe(true);
    expect(isLegacyType('text')).toBe(false);
    expect(isLegacyType(undefined)).toBe(false);
    expect(isLegacyIndex('not_analyzed')).toBe(true);
    expect(isLegacyIndex(false)).toBe(false);
    expect(isLegacyIndex(undefined)).toBe(false);
  });
});

describe('buildOverrides', () => {
  it('keeps every column with overrides and drops empty values', () => {
    const { overrides, errors } = buildOverrides(
      {
        name: { elasticsearchtype: 'text', analyzer: 'auto_complete_analyzer', search_analyzer: '' },
        category: { elasticsearchtype: 'keyword' },
        cleared: { elasticsearchtype: '', analyzer: null },
      },
      {},
    );
    expect(errors).toEqual({});
    expect(overrides).toEqual({
      name: { elasticsearchtype: 'text', analyzer: 'auto_complete_analyzer' },
      category: { elasticsearchtype: 'keyword' },
    });
  });

  it('preserves unknown v2 keys and index: false on round-trip', () => {
    const stored = { name: { id: 'name', column: 'name', type: 'character varying', elasticsearchtype: 'text', index: false } };
    expect(buildOverrides(readOverrides(stored), {}).overrides).toEqual(stored);
  });

  it('parses the fields JSON and reports invalid JSON per column', () => {
    const ok = buildOverrides({ name: { elasticsearchtype: 'text' } }, { name: '{"raw": {"type": "keyword"}}' });
    expect(ok.overrides?.name.fields).toEqual({ raw: { type: 'keyword' } });

    const bad = buildOverrides({ name: {} }, { name: '{nope' });
    expect(bad.overrides).toBeUndefined();
    expect(bad.errors.name).toBeTruthy();

    expect(buildOverrides({ name: {} }, { name: '[1]' }).errors.name).toBe('object');
  });

  it('drops a stored fields value when its text is cleared', () => {
    const { overrides } = buildOverrides({ name: { elasticsearchtype: 'text', fields: { raw: {} } } }, { name: '' });
    expect(overrides).toEqual({ name: { elasticsearchtype: 'text' } });
  });

  it('types null_value after the override or the inferred type', () => {
    const { overrides } = buildOverrides(
      { a: { null_value: '0' }, b: { elasticsearchtype: 'boolean', null_value: 'false' }, c: { null_value: 'n/a' } },
      {},
      { a: 'integer', c: 'text' },
    );
    expect(overrides).toEqual({
      a: { null_value: 0 },
      b: { elasticsearchtype: 'boolean', null_value: false },
      c: { null_value: 'n/a' },
    });
  });
});

describe('readOverrides', () => {
  it('treats a missing or malformed block as no overrides', () => {
    expect(readOverrides(undefined)).toEqual({});
    expect(readOverrides(null)).toEqual({});
    expect(readOverrides([])).toEqual({});
    expect(readOverrides({ a: 'x', b: { elasticsearchtype: 'keyword' } })).toEqual({ b: { elasticsearchtype: 'keyword' } });
  });
});
