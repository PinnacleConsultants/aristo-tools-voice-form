import { useCallback, useState } from 'react';
import { VoiceField } from './VoiceField';
import { LanguagePills } from './LanguagePills';
import { SmartFillButton } from './SmartFillButton';
import { DEFAULT_LANG, nextLang, resolveLang } from './languages';
import { cleanName, parseAge, parseWeight, cleanAddress } from './parsers';
import { isSpeechSupported } from './useSpeechRecognition';
import { GuidedSidebar } from './GuidedSidebar';
import './App.css';

const INITIAL_FIELDS = { name: '', age: '', weight: '', address: '' };

export default function App() {
  const [defaultLang, setDefaultLang] = useState(DEFAULT_LANG);
  const [fieldLang, setFieldLang] = useState({});   // per-field overrides
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [status, setStatus] = useState({ msg: 'Ready.', kind: '' });
  const [guidedActive, setGuidedActive] = useState(false);

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

  return (
    <div className="wrap">
      <header>
        <h1>🎙️ Voice Form <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>React POC</span></h1>
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

        <GuidedSidebar
          langFor={langFor}
          onChange={setField}
          onActiveChange={setGuidedActive}
        />
      </div>

      <div className="help">
        <b>How it works:</b> each 🎤 button calls <code>new webkitSpeechRecognition()</code>,
        listens once, and writes the transcript into the matching field. The smart-fill
        button listens to a longer sentence and routes values to fields using keywords
        like <code>name is</code>, <code>age</code>, <code>weigh</code>/<code>weight</code>.
        Numeric fields pull the first number (and convert pounds → kg when "pounds" / "lbs" is heard).
      </div>

      {!isSpeechSupported && (
        <div className="unsupported">
          ⚠️ Your browser doesn't support the Web Speech API. Try Chrome, Edge, or Safari.
          (Firefox does not support <code>SpeechRecognition</code> yet.)
        </div>
      )}
    </div>
  );
}
