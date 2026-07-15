/**
 * Languages supported by the form.
 * Order in the array determines the order in the pill bar AND
 * the per-field cycle order (click the badge on a mic to cycle).
 */
export const LANGUAGES = [
  { code: 'en-IN', label: '🇬🇧 English' },
  { code: 'hi-IN', label: '🇮🇳 हिन्दी' },
  { code: 'mr-IN', label: '🇮🇳 मराठी' },
  { code: 'gu-IN', label: '🇮🇳 ગુજરાતી' },
  { code: 'ta-IN', label: '🇮🇳 தமிழ்' },
  { code: 'te-IN', label: '🇮🇳 తెలుగు' },
];

export const DEFAULT_LANG = 'en-IN';

/** Resolves the language to use for a field: override → default. */
export function resolveLang(fieldLang, defaultLang, fieldId) {
  return fieldLang[fieldId] || defaultLang;
}

/** Returns the next language in the cycle for a given field. */
export function nextLang(current) {
  const idx = LANGUAGES.findIndex(l => l.code === current);
  return LANGUAGES[(idx + 1) % LANGUAGES.length].code;
}
