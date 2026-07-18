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
├── VoiceField.jsx                # generic field (label + input + mic + lang toggle)
├── LanguagePills.jsx             # the global language default selection bar
├── GuidedSidebarV2.jsx           # ★ conversational step-by-step guided intake sidebar
├── SmartFillButton.jsx           # the long-listen "fill all" mic
├── languages.js                  # LANGUAGES list and locale utilities
├── parsers.js                    # ★ pure functions: cleanName, parseAge, parseWeight, cleanAddress, smartParse
├── useSpeechRecognition.js       # ★ custom hook wrapping the Web Speech API
└── parsers.test.js               # Vitest tests for parsers.js and useSpeechRecognition.js
```

The files most likely to be lifted into the real app:
- **`src/parsers.js`** — pure functions, no DOM, no React, no globals. Drop into any JS codebase.
- **`src/useSpeechRecognition.js`** — React hook; copy and adapt props as needed.
- **`src/GuidedSidebarV2.jsx`** — Guided conversational wizard with automated flows.

---

## Architecture notes

### State (in `App.jsx`)
- `defaultLang` — global default language (BCP-47 code)
- `fieldLang` — per-field overrides (`{name: 'hi-IN', age: 'en-IN', ...}`)
- `fields` — current field values
- `status` — last status message

Per-field language is resolved as `fieldLang[id] || defaultLang` (see `resolveLang` in `languages.js`).

### Conversational Guided Intake (V2)
The `GuidedSidebarV2` component guides patients hands-free:
1. **TTS Prompting**: Browser speaks questions aloud (e.g. *"What is your name?"*).
2. **Auto-Advance & Skip Timers**: 
   - Activates a 3-second auto-advance countdown once speech is captured.
   - Activates a 5-second auto-skip countdown if optional fields remain empty (disabled for the required `name` field).
   - Click/Focus triggers (edit intent) automatically cancel any active countdown.
3. **Soundwave Visualizer**: Bouncing CSS visualizer bars offer real-time audio volume feedback.
4. **Mute Control**: Allows patients to mute the audible questions, instantly opening the microphone for rapid dictation.
5. **Redo Step History**: Shows the previous step summary and a **Go Back & Redo** button that clears the field in the parent form and restarts dictation.

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
Google's Web Speech API returns Indic number-words as digits across all supported languages (Hindi, Marathi, Gujarati, etc.). The parsers work for any language by:
- `extractNumber` — pulls the first decimal/integer from the transcript
- `cleanName` — strips leading filler phrases (English + Indic transliterations + Devanagari/Gujarati script)
- `parseAge` / `parseWeight` — number extraction with unit handling and clamping
- `cleanAddress` — normalises spoken punctuation ("new line" → ",", "comma" → ",", etc.)
- `smartParse` — routes a long single-transcript to all fields using keyword triggers

---

## Concurrency & Gotchas worth noting

### 1. SpeechRecognition Stop/Start Race Condition (Redo Bug)
Calling `.start()` on a new `SpeechRecognition` instance immediately after calling `.stop()` on an active instance triggers a synchronous `DOMException` error (`recognition has already started`). This happens because the browser's speech recognition engine is asynchronously shutting down the active recording session and releasing the device.
* **Fix**: Refactored `stopActive` in [useSpeechRecognition.js](file:///d:/Code/iitm_midas/github/voice-form/src/useSpeechRecognition.js) to be callback-based. The hook now intercepts the active recognizer's `onend` event, ensuring the previous session has fully closed before launching the new session.

### 2. SpeechSynthesis Voice Matching (Multi-Language TTS)
Setting the `lang` property on a `SpeechSynthesisUtterance` is not sufficient in Chrome/Edge, which defaults to the system's English voice engine and pronounces non-English text as garbled English sounds (or remains silent).
* **Fix**: Programmatically query `window.speechSynthesis.getVoices()`, normalize underscores/hyphens (e.g., `hi_IN` vs `hi-IN`), find the matching native voice object, and assign it to `utterance.voice`. Additionally, `getVoices()` is pre-warmed on application load to resolve its asynchronous loading latency.

### 4. Why we don't use `\b` for Indic triggers
JavaScript regex `\b` (word boundary) does not behave correctly with Devanagari combining marks (virama U+094D), so the smart-parse regexes use explicit Unicode range lookarounds (`[^a-z\u0900-\u097F\u0980-\u09FF\u0A80-\u0AFF\u0B00-\u0B7F\u0C00-\u0C7F]`) for word boundaries on Indic text.

### 5. Why the hook remembers `lastInterim`
When `rec.stop()` is called (e.g. by the silence timer or the user clicking the mic again), the Web Speech API fires `onend` **without finalizing the last interim result**, and may also fire an empty/reset `onresult` event. 

To preserve the user's speech:
1. **Looping all results**: The hook processes the entire `event.results` array from `0` to build `finalTranscript` and `interimChunk`, ensuring no previously finalized speech is lost.
2. **Preventing empty overwrites**: The hook updates `lastInterim` only when the new interim chunk is non-empty, and clears it only when `finalTranscript` actually changes.
3. **Combining transcripts**: The final transcript is computed by concatenating `finalTranscript` and `lastInterim` rather than choosing one or the other, as both can coexist in continuous mode.
See the regression tests in `src/useSpeechRecognition.test.js`.

---

## Tests

`npm test` runs parser and hook tests covering:
- English, Hindi, Marathi name extraction
- Age clamping (0–130)
- Pound → kg conversion
- Address normalisation
- Smart-parse routing
- Speech recognition hook lastInterim fallbacks

25 tests, all passing.
