export type Lang = 'da' | 'en';

/**
 * First entry whose primary subtag is `da` or `en` wins; otherwise English.
 * Deliberately stateless: nothing is cached between visits.
 */
export function detectLanguage(preferred: readonly string[] | undefined): Lang {
  for (const tag of preferred ?? []) {
    const primary = tag.split('-')[0].toLowerCase();
    if (primary === 'da' || primary === 'en') return primary;
  }
  return 'en';
}
