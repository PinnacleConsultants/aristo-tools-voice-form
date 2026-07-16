# Voice Form — React POC

A small React port of the single-page voice form. The goal is a **reference implementation** showing how the Web Speech API integrates into a component-based UI, with the field-parsing logic isolated as pure functions for easy reuse.

## Quick start

```bash
cd voice-form-react
npm install
npm run dev          # http://localhost:5173
npm test             # run the parser test suite
```

## File layout (the parts that matter)

```
src/
├── App.jsx                       # top-level state + layout
├── VoiceField.jsx                # generic field (label + input + mic + lang tag)
├── LanguagePills.jsx             # the 7-pill global language bar
├── SmartFillButton.jsx           # the long-listen "fill all" mic
├── languages.js                  # LANGUAGES array, DEFAULT_LANG, resolveLang, nextLang
├── parsers.js                    # ★ pure functions: cleanName, parseAge, parseWeight, cleanAddress, smartParse
├── useSpeechRecognition.js       # ★ custom hook wrapping the Web Speech API
└── parsers.test.js               # Vitest tests for parsers.js
```

The two files most likely to be lifted into the real app:
- **`src/parsers.js`** — pure functions, no DOM, no React, no globals. Drop into any JS codebase.
- **`src/useSpeechRecognition.js`** — React hook; copy and adapt props as needed.

## Architecture notes

### State (in `App.jsx`)
- `defaultLang` — global default language (BCP-47 code)
- `fieldLang` — per-field overrides (`{name: 'hi-IN', age: 'en-IN', ...}`)
- `fields` — current field values
- `status` — last status message

Per-field language is resolved as `fieldLang[id] || defaultLang` (see `resolveLang` in `languages.js`).

### The `useSpeechRecognition` hook
A small wrapper that:
1. Creates a `SpeechRecognition` instance per call to `start()`.
2. Enforces the "only one recognizer at a time" rule via a module-level `activeRecognizer` ref.
3. Manages three timers when `long: true` (for the address field):
   - **Elapsed ticker** (1s) — updates `elapsed` state for the UI timer
   - **Silence stop** (3s) — reset on every `onresult` event; fires `rec.stop()` after 3s of no speech
   - **Hard cap** (60s) — `setTimeout` that always stops the recognizer
4. Exposes `{ start, stop, isListening, interim, elapsed }` to the caller.

### Why parsers are pure functions
Google's Web Speech API returns Indic number-words as digits across all supported languages
(Hindi, Marathi, Gujarati, etc.). The parsers work for any language by:
- `extractNumber` — pulls the first decimal/integer from the transcript
- `cleanName` — strips leading filler phrases (English + Indic transliterations + Devanagari/Gujarati script)
- `parseAge` / `parseWeight` — number extraction with unit handling and clamping
- `cleanAddress` — normalises spoken punctuation ("new line" → ",", "comma" → ",", etc.)
- `smartParse` — routes a long single-transcript to all fields using keyword triggers

### Why we don't use `\b` for Indic triggers
JavaScript regex `\b` (word boundary) does not behave correctly with Devanagari
combining marks (virama U+094D), so the smart-parse regexes use explicit Unicode
range lookarounds (`[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F]`)
for word boundaries on Indic text.

### Why the hook remembers `lastInterim`
When `rec.stop()` is called (e.g. by the silence timer or the user clicking
the mic again), the Web Speech API fires `onend` **without finalizing the
last interim result**, and may also fire an empty/reset `onresult` event. 

To preserve the user's speech:
1. **Looping all results**: The hook processes the entire `event.results` array from `0` to build `finalTranscript` and `interimChunk`, ensuring no previously finalized speech is lost.
2. **Preventing empty overwrites**: The hook updates `lastInterim` only when the new interim chunk is non-empty, and clears it only when `finalTranscript` actually changes.
3. **Combining transcripts**: The final transcript is computed by concatenating `finalTranscript` and `lastInterim` rather than choosing one or the other, as both can coexist in continuous mode.
See the regression tests in `src/useSpeechRecognition.test.js`.

## Tests

`npm test` runs `parsers.test.js`, covering:
- English, Hindi, Marathi name extraction
- Age clamping (0–130)
- Pound → kg conversion
- Address normalisation
- Smart-parse routing

20 tests, all passing.
