# Voice Form — React POC

A small React reference implementation for voice-assisted clinical form filling. It contains the original browser speech demos and a separate OP Visit experiment that combines speech recognition, server-side transcription, structured extraction, and human review.

The API helper uses Node 18+ built-in `fetch`, `FormData`, and `Blob` APIs.

## Quick start

```bash
cd voice-form-react
npm install
npm run dev          # UI http://localhost:5173
npm test             # run all tests
```

For the OP Visit flow, copy `.env.example` to `.env` and add the server-side
`SARVAM_API_KEY` and comma-separated `GROQ_API_KEYS`. These values are read only
by Node and are never exposed to the browser. The recommended one-command
workflow starts both POC processes:

```bash
npm run dev          # Vite client + Node API
```

If you prefer separate terminals, use `npm run dev:client` and
`npm run dev:server`. The API listens on `PORT` (default `8787`).

Select `OP Visit POC` at the top of the existing intake page. Browser recognition
is selected by default. Sarvam mode records a WebM clip, sends it to
`/api/op-visit/process`, and then sends the transcript through Groq. Suggestions
are editable and must be reviewed before they are applied to the form.

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
server/
├── index.js                       # small Node HTTP server entry point
├── app.js                         # Sarvam/Groq orchestration and API handler
├── visitSchema.js                 # extraction schema + response normalization
├── keyPool.js                     # round-robin Groq key retry logic
└── *.test.js                      # API/schema/key-pool tests
```

The files most likely to be lifted into the real app:
- **`src/parsers.js`** — pure functions, no DOM, no React, no globals. Drop into any JS codebase.
- **`src/useSpeechRecognition.js`** — React hook; copy and adapt props as needed.
- **`src/GuidedSidebarV2.jsx`** — Guided conversational wizard with automated flows.

The OP Visit page intentionally reuses `useSpeechRecognition.js` for Browser
mode. Its table controls and review panel are specific to the OP Visit schema,
so they are kept separate from the small `VoiceField` used by the original demo.

## OP Visit POC architecture

1. Browser recognition produces a transcript directly in the browser, or Sarvam
   mode records WebM audio and sends it as JSON/base64 to the local API.
2. The API calls Sarvam when audio is supplied, then calls Groq with a strict
   OP Visit JSON Schema.
3. The UI displays the transcript and editable suggestions. Nothing changes in
   the form until the user clicks `Apply selected`.
4. The page remains local-only and provides `Reset` and `Copy JSON`; it does not
   persist or submit clinical data.

The API server exists because this repository is a Vite-only POC and provider
keys must not be placed in browser code. It is deliberately small and uses
Node's built-in HTTP server, `fetch`, and `FormData`; it does not require
Express or a multipart middleware. In the actual clinical application, this
server may not be needed: move the provider calls into the application's
existing backend/API route, server action, or service layer and keep only the
client-side recording/review flow from this reference.

### Environment

`.env.example` documents the supported variables:

```text
SARVAM_API_KEY=...
GROQ_API_KEYS=key_one,key_two
GROQ_MODEL=openai/gpt-oss-20b
PORT=8787
```

The key pool starts each request at the next key in circular order and moves to
the next key for rate-limit, authentication, timeout, network, or server errors.
It gives up after trying each configured key once. Client/schema errors are not
retried.

---

## Clinical Trials Discovery POC

A third POC that takes a small normalized oncology patient profile and retrieves
relevant **ongoing** and **recently completed** (past 6 months) cancer trials
from ClinicalTrials.gov. It validates that the three ARISTO patient inputs —
primary site, histology, and positive biomarkers — are sufficient to construct
useful searches and produce a compact, reusable results sidebar.

Select `Clinical Trials POC` at the top of the app. Enter a primary site
(required), optionally a histology and positive biomarkers, then click
`Find Clinical Trials`.

### How it works

1. **Normalize** — `Primary site` → `Lung Cancer` (no blind append if the value
   already carries a cancer type); histology is title-cased; biomarkers are
   canonicalized via an alias map covering the ARISTO biomarker list
   (`HER2/neu (FISH)`/`Her2 neu (IHC)` → `HER2`, `Somatic BRCA 2 mutation` →
   `BRCA2`, `c-KIT` → `KIT`, `p53` → `TP53`, …). Unknown biomarkers fall back
   to their flattened token, so new markers appearing in the data later are
   handled without code changes.
2. **Two searches per level** — active trials (`RECRUITING`,
   `NOT_YET_RECRUITING`, `ENROLLING_BY_INVITATION`, `ACTIVE_NOT_RECRUITING`) and
   recently completed trials (`COMPLETED` with a dynamically computed
   `AREA[CompletionDate]RANGE[today-6mo, today]` filter — never hard-coded).
3. **Progressive fallback** — level 1 (site + histology + biomarkers) → level 2
   (site + biomarkers) → level 3 (site + histology) → level 4 (site only), until
   at least 3 valid results are found.
4. **Parse, dedupe, validate, rank** — nested `protocolSection` responses are
   mapped to flat records, records without an NCT ID/title are dropped,
   duplicates are removed by `nctId`, status/date are re-verified, and results
   are ranked deterministically (site > histology > biomarker match, then API
   relevance and recency). Active trials are shown before completed ones, capped
   at 15.
5. **Retry** — if a call fails and returns an HTML/non-JSON response (e.g. a
   proxy or edge error page), it is automatically retried up to 5 times before
   that call fails for real.

The API needs no authentication or API key and is called directly from the
browser. The HTTP layer is isolated in `fetchStudies` so it can later be moved
behind an ARISTO backend endpoint without touching the rest of the module.

### File layout

```
src/
├── ClinicalTrialsPage.jsx                 # POC page: form + debug panel + wiring
└── clinicalTrials/
    ├── ClinicalTrialsSidebar.jsx         # ★ reusable results sidebar (presentation only)
    ├── query.js                          # ★ input normalization + query builder (pure)
    ├── parse.js                          # ★ response parsing + validation (pure)
    ├── service.js                        # ★ search orchestration, retry, ranking
    ├── clinicalTrials.css                # styles
    └── *.test.js                         # Vitest tests
```

The files most likely to be lifted into the real app:
- **`src/clinicalTrials/ClinicalTrialsSidebar.jsx`** — accepts normalized trial
  data only; it knows nothing about the API. Copy it into ARISTO and feed it
  from the search service using `patient.primary_site`,
  `patient.histology_description`, and `patient.biomarkers[]` instead of the POC
  form.
- **`src/clinicalTrials/query.js` / `parse.js` / `service.js`** — pure logic, no
  DOM, unit-tested.

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
* **Fix**: Refactored `stopActive` in [useSpeechRecognition.js](src/useSpeechRecognition.js) to be callback-based. The hook now intercepts the active recognizer's `onend` event, ensuring the previous session has fully closed before launching the new session.

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

`npm test` runs parser, hook, API, schema, and key-pool tests covering:
- English, Hindi, Marathi name extraction
- Age clamping (0–130)
- Pound → kg conversion
- Address normalisation
- Smart-parse routing
- Speech recognition hook lastInterim fallbacks
- transcript and empty-request API behavior
- numeric/list normalization and Groq key rotation

35 tests, all passing at the time of this update.
