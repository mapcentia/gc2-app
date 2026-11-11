// Helpers for the `body` of a Vidi configuration: JSON kept as text.
// The v4 API stores the text byte for byte and only accepts text that parses
// to an object or an array.

/** Why a body cannot be saved; `null` when it can. */
export type BodyProblem =
  | { kind: 'required' }
  | { kind: 'syntax'; detail: string }
  | { kind: 'notObject' }
  | { kind: 'empty' };

export function bodyProblem(text: string): BodyProblem | null {
  if (!text.trim()) return { kind: 'required' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { kind: 'syntax', detail: e instanceof Error ? e.message : String(e) };
  }
  if (parsed === null || typeof parsed !== 'object') return { kind: 'notObject' };
  // v4 accepts {} but the old Dashboard cannot save an empty body; both edit the same rows.
  if (Object.keys(parsed).length === 0) return { kind: 'empty' };
  return null;
}

/** Pretty-print with 4 spaces, as the Dashboard does. Invalid JSON is returned unchanged. */
export function formatBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 4);
  } catch {
    return text;
  }
}

/** Starting point for a new configuration; the same template as the Dashboard. */
export const STARTER_BODY = JSON.stringify(
  {
    schemata: ['public'],
    brandName: 'MapCentia ApS',
    aboutBox: '<p>My awesome web map</p>',
    enabledExtensions: ['conflictSearch', 'streetView', 'coordinates', 'session', 'editor', 'offlineMap'],
    template: 'default.tmpl',
  },
  null,
  4,
);
