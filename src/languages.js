export const LANGUAGES = [
  { code: 'en-IN', label: 'English', shortLabel: 'English' },
  { code: 'hi-IN', label: 'हिन्दी', shortLabel: 'Hindi' },
  { code: 'mr-IN', label: 'मराठी', shortLabel: 'Marathi' },
  { code: 'gu-IN', label: 'ગુજરાતી', shortLabel: 'Gujarati' },
  { code: 'ta-IN', label: 'தமிழ்', shortLabel: 'Tamil' },
  { code: 'te-IN', label: 'తెలుగు', shortLabel: 'Telugu' },
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

/** Returns the short, human-readable label for a language code. */
export function getLangShortLabel(code) {
  const lang = LANGUAGES.find(l => l.code === code);
  return lang ? lang.shortLabel : code;
}
