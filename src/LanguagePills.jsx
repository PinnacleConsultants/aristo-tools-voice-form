import { LANGUAGES } from './languages';

export function LanguagePills({ active, onChange }) {
  return (
    <div className="lang-bar">
      <span className="lang-bar-label">Default language:</span>
      <div className="lang-pills" id="lang-pills">
        {LANGUAGES.map(lang => (
          <button
            key={lang.code}
            className={`lang-pill ${active === lang.code ? 'active' : ''}`}
            data-lang={lang.code}
            onClick={() => onChange(lang.code)}
          >
            {lang.label}
          </button>
        ))}
      </div>
      <span className="hint">
        Tip: click the small language tag on a mic to override per-field.
      </span>
    </div>
  );
}
