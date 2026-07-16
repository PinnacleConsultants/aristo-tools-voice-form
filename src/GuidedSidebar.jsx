import React, { useState, useEffect } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { cleanName, parseAge, parseWeight, cleanAddress } from './parsers';

const STEPS = [
  {
    id: 'name',
    key: 'name',
    label: 'Name',
    example: 'say name "Rahul", "Madhuri"',
    parser: cleanName,
    long: false,
  },
  {
    id: 'age',
    key: 'age',
    label: 'Age',
    example: 'say age "29", "18"',
    parser: parseAge,
    long: false,
  },
  {
    id: 'weight',
    key: 'weight',
    label: 'Weight',
    example: 'say weight "62 kilos", "150 pounds"',
    parser: parseWeight,
    long: false,
  },
  {
    id: 'address',
    key: 'address',
    label: 'Address',
    example: 'say address "221 Baker Street London"',
    parser: cleanAddress,
    long: true,
  },
];

export function GuidedSidebar({ langFor, onChange, onActiveChange }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tempTranscript, setTempTranscript] = useState('');

  const currentStep = STEPS[currentStepIndex];
  const currentLang = langFor(currentStep.id);

  const { start, stop, isListening, interim } = useSpeechRecognition({
    lang: currentLang,
    long: currentStep.long,
    onResult: (text) => {
      const parsed = currentStep.parser ? currentStep.parser(text) : text;
      setTempTranscript(parsed);
    },
    onError: (e) => console.error('Guided mic error:', e.error),
    onStatus: (msg) => console.log('Guided mic status:', msg),
  });

  // Automatically start the mic when guided mode is activated or step changes
  useEffect(() => {
    if (isActive) {
      start();
    } else {
      stop();
    }
  }, [isActive, currentStepIndex, start, stop]);

  // Synchronize active state with parent to disable/dim standard mic buttons
  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  const handleStart = () => {
    setCurrentStepIndex(0);
    setTempTranscript('');
    setIsActive(true);
  };

  const handleAccept = () => {
    if (!tempTranscript) return;
    onChange(currentStep.id, tempTranscript);
    setTempTranscript('');

    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      setIsActive(false);
    }
  };

  const handleRedo = () => {
    setTempTranscript('');
    start();
  };

  const handleExit = () => {
    stop();
    setIsActive(false);
    setTempTranscript('');
  };

  if (!isActive) {
    return (
      <div className="card guided-sidebar">
        <h2>🎙️ Guided Voice Mode</h2>
        <p className="guided-desc">
          Fill the entire form step-by-step using guided voice commands.
        </p>
        <button className="btn primary btn-guided-start" onClick={handleStart}>
          Start Guided Mode
        </button>
      </div>
    );
  }

  return (
    <div className="card guided-sidebar active">
      <div className="guided-header">
        <span className="guided-step">Step {currentStepIndex + 1} of {STEPS.length}</span>
        <div className={`guided-status-indicator ${isListening ? 'listening' : ''}`}>
          {isListening ? 'Listening…' : 'Speech Stopped'}
        </div>
      </div>

      <div className="guided-question-wrap">
        <span className="guided-question-static">What is your </span>
        <span className="guided-question-key">{currentStep.key}</span>
        <span className="guided-question-static">?</span>
      </div>

      <div className="guided-example-wrap">
        <span className="guided-example-prefix">Try: </span>
        <code className="guided-example-code">{currentStep.example}</code>
      </div>

      <div className="guided-transcript-area">
        {isListening ? (
          <div className="guided-live listening">
            <span className="tag">…</span>
            {interim || <span className="listening-placeholder">Speak now…</span>}
          </div>
        ) : (
          <div className="guided-result-preview">
            <div className="result-bubble">
              <div className="result-label">Understood (you can edit):</div>
              {currentStep.id === 'address' ? (
                <textarea
                  className="guided-input-edit"
                  rows={3}
                  value={tempTranscript}
                  onChange={(e) => setTempTranscript(e.target.value)}
                  placeholder="Type or speak to edit…"
                />
              ) : (
                <input
                  type={currentStep.id === 'age' || currentStep.id === 'weight' ? 'number' : 'text'}
                  step={currentStep.id === 'weight' ? '0.1' : undefined}
                  className="guided-input-edit"
                  value={tempTranscript}
                  onChange={(e) => setTempTranscript(e.target.value)}
                  placeholder="Type or speak to edit…"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="guided-actions">
        <button
          className="btn primary"
          onClick={handleAccept}
          disabled={!tempTranscript}
          title="Accept the recognized text and go to the next field"
        >
          Accept & Next
        </button>
        <button
          className="btn"
          onClick={handleRedo}
          title="Reset and start dictation again"
        >
          Redo
        </button>
        <button
          className="btn ghost text-danger"
          onClick={handleExit}
          style={{ marginLeft: 'auto' }}
          title="Exit Guided Mode"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
