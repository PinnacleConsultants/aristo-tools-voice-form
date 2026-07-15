/**
 * Parsers for voice-form fields.
 *
 * Each parser takes a raw transcript string and returns a clean value
 * for its target field. They are pure functions — no side effects, no
 * DOM access — so they can be lifted directly into the real application
 * (e.g. as a `parsers/` module) and unit-tested without a browser.
 *
 * IMPORTANT: Google's Web Speech API returns number-words as digits
 * for all supported Indic languages. So:
 *   "assi"  (Hindi, 80)  → transcript "80"
 *   "एक्कीस" (Hindi, 21) → transcript "21"
 *   "ऐंशी"  (Marathi, 80) → transcript "80"
 *   "એંસી"   (Gujarati, 80) → transcript "80"
 * This is why the same parsers work across all languages.
 */

/** Pulls the first number from a string. Returns '' if none found. */
export function extractNumber(text, { integer = false } = {}) {
  const m = text.match(/-?\d+(\.\d+)?/);
  if (!m) return '';
  const n = parseFloat(m[0]);
  return integer ? String(Math.round(n)) : String(n);
}

/** Strips filler phrases from a name transcript (English + Indic). */
export function cleanName(t) {
  const prefixes = /^(my name is|i am|i'm|this is|call me|mera naam|मेरा नाम|mera name|माझं नाव|mazha naav|mazha nav|माझे नाव|મારું નામ|maru naam|माझे नांव)\s+/i;
  return t.trim()
    .replace(prefixes, '')
    .replace(/[.,!?]+$/, '')
    .replace(/\s+/g, ' ');
}

/** Extracts a clamped integer age from a transcript. */
export function parseAge(text) {
  const n = extractNumber(text, { integer: true });
  if (!n) return '';
  return String(Math.max(0, Math.min(130, parseInt(n, 10))));
}

/** Extracts weight in kg, converting from pounds if "lb/lbs/pound(s)" was said. */
export function parseWeight(text) {
  const isPounds = /\b(pound|pounds|lb|lbs)\b/i.test(text);
  const n = extractNumber(text);
  if (!n) return '';
  let kg = parseFloat(n);
  if (isPounds) kg = kg * 0.45359237;
  return kg.toFixed(1);
}

/** Tidies up a spoken address into a more presentable form. */
export function cleanAddress(t) {
  return t.trim()
    // Handle spoken punctuation FIRST (so subsequent regexes can normalize)
    .replace(/\s+new line\b/gi, ', ')
    .replace(/\bcomma\b/gi, ',')
    .replace(/\bperiod\b|\bdot\b|\bfull stop\b/gi, '.')
    .replace(/\bapartment\b/gi, 'Apt.')
    // Then normalize whitespace and punctuation spacing
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s+/g, ', ')
    .replace(/\s+\./g, '.')
    .replace(/\s+([.,])/g, '$1')
    .replace(/[.,!?]+$/, '')
    .trim();
}

/**
 * Smart-fill parser — takes a single long transcript and routes
 * values to fields using keyword triggers across all supported languages.
 */
export function smartParse(text) {
  const t = text.toLowerCase();
  const out = { name: '', age: '', weight: '', address: '' };

  // Name (English + Hindi + Marathi + Gujarati triggers)
  // We use [^\d,]+? for the capture group (lazy match up to comma or digit)
  // because \p{L} in JS regex does NOT cover Devanagari combining marks,
  // which breaks captures for names like 'राहुल' or 'अर्जुन'.
  const nameMatch = text.match(
    /(?:my name is|i'?m|i am|this is|call me|mera naam|मेरा नाम|mera name|माझं नाव|mazha naav|mazha nav|माझे नाव|મારું નામ|maru naam|माझे नांव)\s+([^\d,.;!?]{1,40}?)(?=[,.;!?]|\s+(?:age|umar|वय|ઉંમर|i am|years|weigh|weight|address|मेरा|माझा|माझं)\b|$)/iu
  );
  if (nameMatch) out.name = nameMatch[1].trim().replace(/[.,!?]+$/, '');

  // Age
  // We avoid \b for Indic triggers because JS regex \b doesn't
  // behave correctly with Devanagari combining marks (virama, etc.).
  // We use lookarounds for non-letter boundaries instead.
  const ageMatch = t.match(
    /(?:^|[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F])(?:age|aged|years? old|umar|उम्र|umr|वय|vay|ઉંમર)(?=[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F]|$)[^\d-]*(\d{1,3})/i
  ) || t.match(
    /(?:^|[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F])(?:i am|मैं हूँ|main hoon|मी आहे|mi ahe|હું છું|hu chhu)(?=[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F]|\d)\s+(\d{1,3})/i
  );
  if (ageMatch) {
    const n = Math.max(0, Math.min(130, parseInt(ageMatch[1], 10)));
    out.age = String(n);
  }

  // Weight
  const isPounds = /\b(pound|pounds|lb|lbs)\b/i.test(t);
  const weightMatch = t.match(
    /(?:^|[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F])(?:weight|weigh|heavy|mass|vazan|वजन|wazan|વજન|vajan)(?=[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F]|\d)[^\d-]*(\d+(?:\.\d+)?)/i
  ) || t.match(/(\d+(?:\.\d+)?)\s*(?:kilo|kilos|kg|kilograms|pound|pounds|lbs?)\b/i);
  if (weightMatch) {
    let kg = parseFloat(weightMatch[1]);
    if (isPounds) kg = kg * 0.45359237;
    out.weight = kg.toFixed(1);
  }

  // Address (lazy match up to the next key phrase or end of string)
  const addrMatch = text.match(
    /(?:my address is|address is|i live at|address:|mera pata|मेरा पता|माझा पत्ता|mazha patta|મારું સરનામું|maru sarnamu|address)\s+([^]*?)(?:\b(?:name|age|weigh|weight|umar|वजन|वय|ઉંમર)\b|$)/i
  );
  if (addrMatch) out.address = cleanAddress(addrMatch[1]);

  return out;
}
