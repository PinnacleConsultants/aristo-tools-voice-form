import { useSpeechRecognition } from './useSpeechRecognition';
import { smartParse } from './parsers';

export function SmartFillButton({ lang, onFill, onStatus }) {
  const { start, stop, isListening, interim } = useSpeechRecognition({
    lang,
    long: true,   // smart fill always listens for a long sentence
    onResult: (text) => {
      const filled = smartParse(text);
      onFill(filled);
      onStatus?.('Smart fill complete. Review and adjust if needed.', 'ok');
    },
    onError: (e) => onStatus?.(`Smart fill error: ${e.error}`, 'err'),
    onStatus: (msg) => onStatus?.(msg),
  });

  return (
    <div className="field field-wide">
      <label>Smart Fill</label>
      <div className="input-wrap" style={{ color: 'var(--muted)', fontSize: 14 }}>
        Say everything at once, e.g. <i>"my name is Anya, I am 29, I weigh 62 kilos, my address is…"</i>
      </div>
      <button
        className={`mic ${isListening ? 'active' : ''}`}
        onClick={isListening ? stop : start}
        aria-label="Smart fill"
        title="Smart fill all fields from one sentence"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
        </svg>
      </button>
      <div className="live">
        {interim && (<><span className="tag">…</span>{interim}</>)}
      </div>
    </div>
  );
}
