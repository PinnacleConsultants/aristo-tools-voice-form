import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Module-level singleton: only one SpeechRecognition can be active per page.
 * We hold the current recognizer here so any caller can stop it before
 * starting a new one (the Web Speech API spec enforces this).
 */
let activeRecognizer = null;
function stopActive() {
  if (activeRecognizer) {
    try { activeRecognizer.stop(); } catch { /* noop */ }
    activeRecognizer = null;
  }
}

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export const isSpeechSupported = !!SR;

/** Lazily resolve the SpeechRecognition constructor (re-reads window at call time
 *  so tests can swap the global). Returns null if unsupported. */
function getSR() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * useSpeechRecognition — wraps the Web Speech API in a React hook.
 *
 * @param {object}   opts
 * @param {string}   opts.lang       BCP-47 language code (e.g. 'en-IN', 'hi-IN')
 * @param {boolean}  [opts.long]     If true, use continuous mode with silence
 *                                   auto-stop and a 60s hard cap (for long utterances)
 * @param {function} opts.onResult   Called with the final transcript when recognition ends
 * @param {function} [opts.onError]  Called with an error event
 * @param {function} [opts.onStatus] Called with a human-readable status string
 */
export function useSpeechRecognition({ lang, long = false, onResult, onError, onStatus }) {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);   // seconds, only meaningful in long mode

  // Refs hold values that change every recognition session but
  // shouldn't trigger the `start` callback to re-create.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  const stop = useCallback(() => {
    stopActive();
  }, []);

  const start = useCallback(() => {
    const Ctor = getSR();
    if (!Ctor) {
      onErrorRef.current?.({ error: 'not-supported' });
      return;
    }
    stopActive();   // spec: only one recognizer at a time

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = !!long;
    rec.maxAlternatives = 1;

    let finalTranscript = '';
    let lastInterim = '';   // remember the most recent interim; when rec.stop() is
                            // called (e.g. by the silence timer) the recognizer
                            // may fire onend WITHOUT finalizing the last interim,
                            // so we fall back to it.
    let silenceTimer = null;
    let hardStopTimer = null;
    let elapsedTimer = null;
    let elapsedSec = 0;

    const SILENCE_MS = 3000;
    const HARD_MAX_MS = 60000;

    rec.onstart = () => {
      activeRecognizer = rec;
      setIsListening(true);
      setInterim('');
      onStatusRef.current?.(long ? `Listening (long mode, ${lang})…` : `Listening (${lang})…`);

      if (long) {
        elapsedSec = 0;
        setElapsed(0);
        elapsedTimer = setInterval(() => {
          elapsedSec += 1;
          setElapsed(elapsedSec);
        }, 1000);
        hardStopTimer = setTimeout(() => rec.stop(), HARD_MAX_MS);
      }
    };

    rec.onresult = (event) => {
      let interimChunk = '';
      finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const tr = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += tr + ' ';
        else interimChunk += tr;
      }
      finalTranscript = finalTranscript.trim();
      lastInterim = interimChunk;
      setInterim(finalTranscript || interimChunk);

      if (long) {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => rec.stop(), SILENCE_MS);
      }
    };

    rec.onerror = (e) => {
      onErrorRef.current?.(e);
    };

    rec.onend = () => {
      clearTimeout(silenceTimer);
      clearTimeout(hardStopTimer);
      clearInterval(elapsedTimer);
      setIsListening(false);
      setInterim('');
      setElapsed(0);
      if (activeRecognizer === rec) activeRecognizer = null;

      // When rec.stop() is called (e.g. by the silence timer), the recognizer
      // may fire onend WITHOUT finalizing the last interim result. Fall back
      // to lastInterim so the user's speech isn't dropped on the floor.
      const transcript = (finalTranscript || lastInterim).trim();
      if (transcript) {
        onResultRef.current?.(transcript, { elapsedSec, lang });
      } else {
        onStatusRef.current?.('No speech detected.');
      }
    };

    try {
      rec.start();
    } catch (e) {
      onErrorRef.current?.({ error: 'start-failed', message: e.message });
    }
  }, [lang, long]);

  // Cleanup on unmount
  useEffect(() => stop, [stop]);

  return { start, stop, isListening, interim, elapsed };
}
