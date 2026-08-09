import { useCallback, useState } from 'react';
import { VoiceField } from './VoiceField';
import { LanguagePills } from './LanguagePills';
import { SmartFillButton } from './SmartFillButton';
import { DEFAULT_LANG, nextLang, resolveLang } from './languages';
import { cleanName, parseAge, parseWeight, cleanAddress } from './parsers';
import { isSpeechSupported } from './useSpeechRecognition';
import { GuidedSidebarV2 } from './GuidedSidebarV2';
import { OpVisitPage } from './OpVisitPage';
import { ClinicalTrialsPage } from './ClinicalTrialsPage';
import './App.css';

const INITIAL_FIELDS = { name: '', age: '', weight: '', address: '' };

export default function App() {
  const [defaultLang, setDefaultLang] = useState(DEFAULT_LANG);
  const [fieldLang, setFieldLang] = useState({});   // per-field overrides
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [status, setStatus] = useState({ msg: 'Ready.', kind: '' });
  const [guidedActive, setGuidedActive] = useState(false);
  const [page, setPage] = useState('intake');

  const setStatusMsg = useCallback((msg, kind = '') => {
    setStatus({ msg, kind });
  }, []);

  // Single source of truth for a single field's value.
  // Pass to <VoiceField> as `value` and `onChange`.
  const setField = useCallback((fieldId, value) => {
    setFields(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  // Per-field language cycle handler
  const cycleFieldLang = useCallback((fieldId) => {
    setFieldLang(prev => {
      const current = prev[fieldId] || defaultLang;
      return { ...prev, [fieldId]: nextLang(current) };
    });
  }, [defaultLang]);

  // Smart fill: merge a partial result into current state
  const applySmartFill = useCallback((filled) => {
    setFields(prev => ({
      name:    filled.name    || prev.name,
      age:     filled.age     || prev.age,
      weight:  filled.weight  || prev.weight,
      address: filled.address || prev.address,
    }));
  }, []);

  const langFor = (fieldId) => resolveLang(fieldLang, defaultLang, fieldId);

  if (page === 'op-visit') {
    return (
      <>
        <div className="app-switch op-switch">
          <button type="button" className="active" onClick={() => setPage('op-visit')}>OP Visit POC</button>
          <button type="button" onClick={() => setPage('clinical-trials')}>Clinical Trials POC</button>
          <button type="button" onClick={() => setPage('intake')}>Clinical Voice Intake</button>
        </div>
        <OpVisitPage />
      </>
    );
  }

  if (page === 'clinical-trials') {
    return (
      <>
        <div className="app-switch op-switch">
          <button type="button" onClick={() => setPage('op-visit')}>OP Visit POC</button>
          <button type="button" className="active" onClick={() => setPage('clinical-trials')}>Clinical Trials POC</button>
          <button type="button" onClick={() => setPage('intake')}>Clinical Voice Intake</button>
        </div>
        <ClinicalTrialsPage />
      </>
    );
  }

  return (
    <>
      <div className="app-switch">
        <button type="button" onClick={() => setPage('op-visit')}>OP Visit POC</button>
        <button type="button" onClick={() => setPage('clinical-trials')}>Clinical Trials POC</button>
        <button type="button" className="active" onClick={() => setPage('intake')}>Clinical Voice Intake</button>
      </div>
      <div className="wrap">
      <header>
        <h1 style={{ display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="clinical-icon" style={{ width: 28, height: 28, color: 'var(--accent)', marginRight: 10 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3L9 5l4 14 3-9 2 2h3" />
          </svg>
          Clinical Voice Intake
          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 10, fontWeight: 500 }}>React Clinical Portal</span>
        </h1>
        <p>
          Uses the browser's <code>SpeechRecognition</code> (Web Speech API) — the
          same engine that powers YouTube's mic button. Click a mic and speak.
        </p>
        <LanguagePills active={defaultLang} onChange={setDefaultLang} />
      </header>

      <div className="layout-grid">
        <div className={`card form-container ${guidedActive ? 'guided-active' : ''}`}>
          <VoiceField
            id="name"
            label="Name"
            placeholder="Say your name…"
            lang={langFor('name')}
            onLangCycle={cycleFieldLang}
            parser={cleanName}
            value={fields.name}
            onChange={(v) => setField('name', v)}
            onStatus={setStatusMsg}
          />

          <VoiceField
            id="age"
            label="Age"
            type="number"
            placeholder="Say your age…"
            lang={langFor('age')}
            onLangCycle={cycleFieldLang}
            parser={parseAge}
            value={fields.age}
            onChange={(v) => setField('age', v)}
            onStatus={setStatusMsg}
          />

          <VoiceField
            id="weight"
            label="Weight (kg)"
            type="number"
            step="0.1"
            placeholder="Say your weight…"
            lang={langFor('weight')}
            onLangCycle={cycleFieldLang}
            parser={parseWeight}
            value={fields.weight}
            onChange={(v) => setField('weight', v)}
            onStatus={setStatusMsg}
          />

          <VoiceField
            id="address"
            label="Address"
            placeholder="Say your full address…"
            rows={2}
            long
            lang={langFor('address')}
            onLangCycle={cycleFieldLang}
            parser={cleanAddress}
            value={fields.address}
            onChange={(v) => setField('address', v)}
            onStatus={setStatusMsg}
          />

          <SmartFillButton
            lang={defaultLang}
            onFill={applySmartFill}
            onStatus={setStatusMsg}
          />

          <div className="actions">
            <button
              className="btn ghost"
              onClick={() => {
                setFields(INITIAL_FIELDS);
                setStatusMsg('Cleared.', 'ok');
              }}
            >
              Clear all
            </button>
            <button
              className="btn primary"
              onClick={() => {
                const data = {
                  name: fields.name.trim(),
                  age: fields.age.trim(),
                  weight: fields.weight.trim(),
                  address: fields.address.trim(),
                };
                console.log('Submitted:', data);
                setStatusMsg(`Submitted: ${JSON.stringify(data)}`, 'ok');
              }}
            >
              Submit
            </button>
          </div>

          <div className={`status ${status.kind}`}>{status.msg}</div>
        </div>

        <GuidedSidebarV2
          langFor={langFor}
          onChange={setField}
          onActiveChange={setGuidedActive}
        />
      </div>

      <div className="help">
        <b>How it works:</b> each microphone button calls <code>new webkitSpeechRecognition()</code>,
        listens once, and writes the transcript into the matching field. The smart-fill
        button listens to a longer sentence and routes values to fields using keywords
        like <code>name is</code>, <code>age</code>, <code>weigh</code>/<code>weight</code>.
        Numeric fields pull the first number (and convert pounds → kg when "pounds" / "lbs" is heard).
      </div>

      {!isSpeechSupported && (
        <div className="unsupported" style={{ display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20, marginRight: 8, flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          Your browser doesn't support the Web Speech API. Try Chrome, Edge, or Safari. (Firefox does not support SpeechRecognition yet.)
        </div>
      )}
      </div>
    </>
  );
}
