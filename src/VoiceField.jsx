import { useSpeechRecognition } from './useSpeechRecognition';
import { nextLang } from './languages';

/**
 * Generic voice field. Controlled component: value + onChange are owned by
 * the parent, which is what allows "Clear all" to work — resetting the
 * parent's state propagates here and clears the input.
 */
export function VoiceField({
  id,
  label,
  placeholder,
  type = 'text',
  rows,
  step,
  long = false,
  parser,
  lang,
  onLangCycle,
  onStatus,
  value,
  onChange,
}) {
  const { start, stop, isListening, interim, elapsed } = useSpeechRecognition({
    lang,
    long,
    onResult: (text) => {
      const cleaned = parser ? parser(text) : text;
      onChange(cleaned);
      onStatus?.(`Filled "${id}" → ${cleaned}`, 'ok');
    },
    onError: (e) => onStatus?.(`Mic error: ${e.error}`, 'err'),
    onStatus: (msg) => onStatus?.(msg),
  });

  const InputTag = rows ? 'textarea' : 'input';

  return (
    <div className={`field ${rows ? 'field-wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <InputTag
          id={id}
          type={rows ? undefined : type}
          rows={rows}
          step={step}
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={isListening ? 'listening' : ''}
        />
      </div>
      <button
        className={`mic ${isListening ? 'active' : ''} ${long && isListening ? 'timer' : ''}`}
        onClick={isListening ? stop : start}
        aria-label={`Dictate ${label}`}
        title={`Dictate ${label}${long ? ' (up to 60s)' : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
        </svg>
        {long && isListening && <span className="timer-text">{elapsed}s</span>}
      </button>
      <button
        type="button"
        className="lang-toggle"
        onClick={() => onLangCycle(id)}
        aria-label={`Change language for ${label}, currently ${lang}`}
        title={`Change language for ${label} (currently ${lang})`}
      >
        {lang}
        <span className="arrow">▾</span>
      </button>
      <div className="live">
        {interim && (
          <>
            <span className="tag">…</span>
            {interim}
          </>
        )}
      </div>
    </div>
  );
}
