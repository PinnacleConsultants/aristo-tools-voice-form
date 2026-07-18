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
    required: true,
  },
  {
    id: 'age',
    key: 'age',
    label: 'Age',
    example: 'say age "29", "18"',
    parser: parseAge,
    long: false,
    required: false,
  },
  {
    id: 'weight',
    key: 'weight',
    label: 'Weight',
    example: 'say weight "62 kilos", "150 pounds"',
    parser: parseWeight,
    long: false,
    required: false,
  },
  {
    id: 'address',
    key: 'address',
    label: 'Address',
    example: 'say address "221 Baker Street London"',
    parser: cleanAddress,
    long: true,
    required: false,
  },
];

export function GuidedSidebarV2({ langFor, onChange, onActiveChange }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tempTranscript, setTempTranscript] = useState('');
  const [previousFieldData, setPreviousFieldData] = useState(null);
  
  const [countdown, setCountdown] = useState(null);
  const [countdownType, setCountdownType] = useState(null); // 'advance' or 'skip'

  const currentStep = STEPS[currentStepIndex];
  const currentLang = langFor(currentStep.id);

  const { start, stop, isListening, interim } = useSpeechRecognition({
    lang: currentLang,
    long: currentStep.long,
    onResult: (text) => {
      const parsed = currentStep.parser ? currentStep.parser(text) : text;
      setTempTranscript(parsed);
    },
    onError: (e) => console.error('Guided V2 mic error:', e.error),
    onStatus: (msg) => console.log('Guided V2 mic status:', msg),
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

  // Auto-advance / auto-skip triggers when listening finishes
  useEffect(() => {
    if (!isActive) return;

    if (isListening) {
      setCountdown(null);
      setCountdownType(null);
      return;
    }

    // Once listening has stopped
    if (tempTranscript.trim()) {
      // Speech captured -> auto-accept countdown (3 seconds)
      setCountdown(3);
      setCountdownType('advance');
    } else {
      // No speech captured
      if (currentStep.required) {
        // Required field: wait for manual action/input, do not skip
        setCountdown(null);
        setCountdownType(null);
      } else {
        // Optional field: auto-skip countdown (5 seconds)
        setCountdown(5);
        setCountdownType('skip');
      }
    }
  }, [isListening, isActive, currentStepIndex]);

  // Countdown timer tick effect
  useEffect(() => {
    if (countdown === null || !isActive) return;

    if (countdown <= 0) {
      if (countdownType === 'advance') {
        handleAccept();
      } else if (countdownType === 'skip') {
        handleSkip();
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, countdownType, isActive]);

  const handleStart = () => {
    setCurrentStepIndex(0);
    setTempTranscript('');
    setPreviousFieldData(null);
    setCountdown(null);
    setCountdownType(null);
    setIsActive(true);
  };

  const handleAccept = () => {
    const finalVal = tempTranscript.trim();
    onChange(currentStep.id, finalVal);
    
    setTempTranscript('');
    setCountdown(null);
    setCountdownType(null);

    setPreviousFieldData({
      id: currentStep.id,
      label: currentStep.label,
      value: finalVal || '(Empty)'
    });

    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      setIsActive(false);
    }
  };

  const handleSkip = () => {
    setTempTranscript('');
    setCountdown(null);
    setCountdownType(null);

    setPreviousFieldData({
      id: currentStep.id,
      label: currentStep.label,
      value: '(Skipped)'
    });

    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      setIsActive(false);
    }
  };

  const handleRedo = () => {
    setTempTranscript('');
    setCountdown(null);
    setCountdownType(null);
    start();
  };

  const handleTextEdit = (val) => {
    setTempTranscript(val);
    // Cancel active countdown when manually editing
    setCountdown(null);
    setCountdownType(null);
  };

  const handleGoBackAndRedo = () => {
    if (!previousFieldData) return;

    const prevIdx = STEPS.findIndex(s => s.id === previousFieldData.id);
    if (prevIdx !== -1) {
      // Clear the value of that field in the parent form
      onChange(previousFieldData.id, '');
      
      stop();
      setCurrentStepIndex(prevIdx);
      setTempTranscript('');
      setCountdown(null);
      setCountdownType(null);
      setPreviousFieldData(null);
    }
  };

  const handleExit = () => {
    stop();
    setIsActive(false);
    setTempTranscript('');
    setCountdown(null);
    setCountdownType(null);
  };

  if (!isActive) {
    return (
      <div className="card guided-sidebar">
        <h2>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 22, height: 22, verticalAlign: 'middle', marginRight: 8, color: 'var(--accent)', display: 'inline-block' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
          </svg>
          Guided Clinical Intake (V2)
        </h2>
        <p className="guided-desc">
          Automated walkthrough of form fields. Speaks next questions automatically and skips optional steps.
        </p>
        <button className="btn primary btn-guided-start" onClick={handleStart}>
          Start Guided Mode V2
        </button>
      </div>
    );
  }

  return (
    <div className="card guided-sidebar active">
      <div className="guided-header">
        <span className="guided-step">Step {currentStepIndex + 1} of {STEPS.length}</span>
        
        {countdown !== null ? (
          <div className={`guided-countdown-badge ${countdownType}`}>
            {countdownType === 'advance' ? `Advancing in ${countdown}s` : `Skipping in ${countdown}s`}
          </div>
        ) : (
          <div className={`guided-status-indicator ${isListening ? 'listening' : ''}`}>
            {isListening ? 'Listening…' : 'Speech Stopped'}
          </div>
        )}
      </div>

      <div className="guided-question-wrap">
        <span className="guided-question-static">What is your </span>
        <span className="guided-question-key">{currentStep.key}</span>
        <span className="guided-question-static">?</span>
        {currentStep.required && <span className="guided-required-badge" title="This field is required">Required</span>}
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
                  onChange={(e) => handleTextEdit(e.target.value)}
                  placeholder="Type or speak to edit…"
                />
              ) : (
                <input
                  type={currentStep.id === 'age' || currentStep.id === 'weight' ? 'number' : 'text'}
                  step={currentStep.id === 'weight' ? '0.1' : undefined}
                  className="guided-input-edit"
                  value={tempTranscript}
                  onChange={(e) => handleTextEdit(e.target.value)}
                  placeholder="Type or speak to edit…"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {countdown === null && !isListening && !tempTranscript && currentStep.required && (
        <div className="guided-warning-msg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          Name is required. Please speak or type to proceed.
        </div>
      )}

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

      {previousFieldData && (
        <div className="guided-footer">
          <div className="guided-prev-info">
            <span className="guided-prev-label">Previous:</span>
            <span className="guided-prev-val" title={previousFieldData.value}>
              <strong>{previousFieldData.label}</strong>: {previousFieldData.value}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-guided-back"
            onClick={handleGoBackAndRedo}
            title={`Go back and redo ${previousFieldData.label}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            Redo
          </button>
        </div>
      )}
    </div>
  );
}
