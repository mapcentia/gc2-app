/** One column's OpenSearch mapping override, as stored in the relation's Meta `elasticsearch` block. */
export type ColumnOverride = Record<string, unknown>;
/** The relation's whole `elasticsearch` block, keyed by column name. */
export type Overrides = Record<string, ColumnOverride>;

export const MAPPING_TYPES = [
  'text', 'keyword', 'integer', 'long', 'float', 'double', 'boolean', 'date', 'geo_point', 'geo_shape', 'ip',
] as const;

/** Analyzers every OpenSearch node has, offered next to the database's own. */
export const BUILTIN_ANALYZERS = ['standard', 'simple', 'whitespace', 'keyword', 'stop', 'danish', 'english'];

const NUMERIC_TYPES = new Set(['integer', 'long', 'float', 'double']);

/**
 * The mapping type the index build derives from a column's PostgreSQL type,
 * or null when it is not one of the documented derivations.
 */
export function inferType(pgType: string | undefined, geomType?: string | null): string | null {
  const t = (pgType ?? '').toLowerCase();
  if (!t) return null;
  if (t === 'geometry' || t === 'geography') {
    return (geomType ?? '').toUpperCase() === 'POINT' ? 'geo_point' : 'geo_shape';
  }
  if (t === 'text' || t.startsWith('character') || t === 'varchar' || t === 'char') return 'text';
  if (t === 'smallint' || t === 'integer') return 'integer';
  if (t === 'bigint') return 'long';
  if (t === 'real') return 'float';
  if (t === 'double precision' || t.startsWith('numeric') || t.startsWith('decimal')) return 'double';
  if (t === 'date' || t.startsWith('timestamp')) return 'date';
  return null;
}

/** A v2 type such as "string", which newer OpenSearch rejects. */
export function isLegacyType(value: unknown): boolean {
  return typeof value === 'string' && value !== '' && !(MAPPING_TYPES as readonly string[]).includes(value);
}

/** A v2 index value such as "analyzed" / "not_analyzed"; today it is a boolean. */
export function isLegacyIndex(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' && typeof value !== 'boolean';
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

/** null_value has to be of the field's own type, so a typed-in "0" becomes 0 for a numeric field. */
function coerceNullValue(value: unknown, type: string | null): unknown {
  if (typeof value !== 'string') return value;
  if (type && NUMERIC_TYPES.has(type) && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  if (type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true';
  return value;
}

export interface BuildResult {
  /** The block to PATCH; only present when there are no errors. */
  overrides?: Overrides;
  /** Column -> parse error of its `fields` JSON. */
  errors: Record<string, string>;
}

/**
 * The full `elasticsearch` block to store: every column that still has a value, with
 * empty values dropped. Keys this editor does not know (v2 left `id`, `column` and
 * `type` behind) pass through untouched. `fieldsText` holds each column's `fields`
 * JSON as typed; `inferred` the derived type per column, used to type null_value.
 */
export function buildOverrides(
  overrides: Overrides,
  fieldsText: Record<string, string>,
  inferred: Record<string, string | null> = {},
): BuildResult {
  const out: Overrides = {};
  const errors: Record<string, string> = {};
  for (const [column, override] of Object.entries(overrides)) {
    const next: ColumnOverride = {};
    for (const [key, value] of Object.entries(override)) {
      if (key !== 'fields' && !isEmpty(value)) next[key] = value;
    }
    const text = (fieldsText[column] ?? '').trim();
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) errors[column] = 'object';
        else next.fields = parsed;
      } catch (e) {
        errors[column] = e instanceof Error ? e.message : String(e);
      }
    }
    if ('null_value' in next) {
      const type = typeof next.elasticsearchtype === 'string' ? next.elasticsearchtype : (inferred[column] ?? null);
      next.null_value = coerceNullValue(next.null_value, type);
    }
    if (Object.keys(next).length > 0) out[column] = next;
  }
  return Object.keys(errors).length > 0 ? { errors } : { overrides: out, errors };
}

/** Normalises the stored block: anything but an object of objects counts as no overrides. */
export function readOverrides(stored: unknown): Overrides {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const out: Overrides = {};
  for (const [column, value] of Object.entries(stored as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) out[column] = { ...(value as ColumnOverride) };
  }
  return out;
}
