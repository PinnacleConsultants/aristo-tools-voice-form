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

const LOCALIZED_QUESTIONS = {
  name: {
    'en-IN': 'What is your name?',
    'hi-IN': 'आपका नाम क्या है?',
    'mr-IN': 'तुमचे नाव काय आहे?',
    'gu-IN': 'તમારું નામ શું છે?',
    'ta-IN': 'உங்கள் பெயர் என்ன?',
    'te-IN': 'మీ పేరు ఏమిటి?'
  },
  age: {
    'en-IN': 'What is your age?',
    'hi-IN': 'आपकी उम्र क्या है?',
    'mr-IN': 'तुमचे वय काय आहे?',
    'gu-IN': 'તમારી ઉંમર શું છે?',
    'ta-IN': 'உங்கள் வயது என்ன?',
    'te-IN': 'మీ వయస్సు ఎంత?'
  },
  weight: {
    'en-IN': 'What is your weight?',
    'hi-IN': 'आपका वजन कितना है?',
    'mr-IN': 'तुमचे वजन किती आहे?',
    'gu-IN': 'તમારું વજન કેટલું છે?',
    'ta-IN': 'உங்கள் எடை என்ன?',
    'te-IN': 'మీ బరువు ఎంత?'
  },
  address: {
    'en-IN': 'What is your address?',
    'hi-IN': 'आपका पता क्या है?',
    'mr-IN': 'तुमचा पत्ता काय आहे?',
    'gu-IN': 'તમારું સરનામું શું છે?',
    'ta-IN': 'உங்கள் முகவரி என்ன?',
    'te-IN': 'మీ చిరునామా ఏమిటి?'
  }
};

// Pre-warm SpeechSynthesis voices
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
}

function speakText(text, lang, onEndCallback) {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEndCallback?.();
    return;
  }
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  
  // Find a native browser voice matching the target language code
  const voices = window.speechSynthesis.getVoices();
  const normalize = (l) => l.replace('_', '-').toLowerCase();
  const target = normalize(lang);
  
  let matchedVoice = voices.find(v => normalize(v.lang) === target);
  if (!matchedVoice) {
    const base = target.split('-')[0];
    matchedVoice = voices.find(v => normalize(v.lang).startsWith(base));
  }
  
  if (matchedVoice) {
    utterance.voice = matchedVoice;
    console.log(`Selected TTS voice: ${matchedVoice.name} (${matchedVoice.lang})`);
  } else {
    console.warn(`No TTS voice found for lang: ${lang}, falling back to system default.`);
  }

  utterance.onend = () => {
    onEndCallback?.();
  };
  utterance.onerror = (e) => {
    console.error('SpeechSynthesis error:', e);
    onEndCallback?.();
  };
  window.speechSynthesis.speak(utterance);
}

function playChime(type) {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  
  try {
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'start') {
      // Short upward clinical chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'success') {
      // Pleasant double tap confirmation
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1109.73, now + 0.08);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.setValueAtTime(0.08, now + 0.08);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'skip') {
      // Soft downward tap
      osc.type = 'sine';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.setValueAtTime(261.63, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.setValueAtTime(0.05, now + 0.1);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    console.warn('Audio chime failed to play:', e);
  }
}

export function GuidedSidebarV2({ langFor, onChange, onActiveChange, onSubmit }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tempTranscript, setTempTranscript] = useState('');
  const [previousFieldData, setPreviousFieldData] = useState(null);
  
  const [countdown, setCountdown] = useState(null);
  const [countdownType, setCountdownType] = useState(null); // 'advance' or 'skip'
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const currentStep = STEPS[currentStepIndex];
  const currentLang = langFor(currentStep.id);

  const getLocalizedQuestion = (fieldId, langCode) => {
    const fieldDict = LOCALIZED_QUESTIONS[fieldId];
    if (fieldDict) {
      return fieldDict[langCode] || fieldDict['en-IN'];
    }
    return `What is your ${fieldId}?`;
  };

  const { start, stop, isListening, interim } = useSpeechRecognition({
    lang: currentLang,
    long: currentStep.long,
    onResult: (text) => {
      const cleanText = text.trim().toLowerCase().replace(/[.,!?]$/, '');
      
      // Standalone Voice Commands for Hands-Free control
      if (cleanText === 'next' || cleanText === 'accept') {
        if (tempTranscript.trim()) {
          handleAccept();
        }
        return;
      }
      if (cleanText === 'redo' || cleanText === 'retry') {
        handleRedo();
        return;
      }
      if (cleanText === 'skip') {
        if (!currentStep.required) {
          handleSkip();
        }
        return;
      }
      if (cleanText === 'back') {
        handleGoBackAndRedo();
        return;
      }
      if (cleanText === 'exit' || cleanText === 'stop') {
        handleExit();
        return;
      }

      // Parse normally if it's not a control command
      const parsed = currentStep.parser ? currentStep.parser(text) : text;
      setTempTranscript(parsed);
    },
    onError: (e) => console.error('Guided V2 mic error:', e.error),
    onStatus: (msg) => console.log('Guided V2 mic status:', msg),
  });

  // Read question aloud when guided mode starts or step changes (unless muted)
  useEffect(() => {
    if (!isActive) {
      setIsSpeaking(false);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    // Stop mic before speaking or starting
    stop();

    // Check if the browser actually has a voice loaded for this language code
    const voices = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    const normalize = (l) => l.replace('_', '-').toLowerCase();
    const target = normalize(currentLang);
    const hasVoice = voices.some(v => normalize(v.lang) === target || normalize(v.lang).startsWith(target.split('-')[0]));

    // Fallback to English text and English voice if target language voice is missing
    const speakLang = hasVoice ? currentLang : 'en-IN';
    const questionText = getLocalizedQuestion(currentStep.id, speakLang);

    if (isMuted) {
      setIsSpeaking(false);
      // Muted: immediate mic start after short transition delay
      const startTimeout = setTimeout(() => {
        start();
      }, 300);
      return () => clearTimeout(startTimeout);
    } else {
      setIsSpeaking(true);
      const speechTimeout = setTimeout(() => {
        speakText(questionText, speakLang, () => {
          setIsSpeaking(false);
          start();
        });
      }, 150);

      return () => {
        clearTimeout(speechTimeout);
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      };
    }
  }, [isActive, currentStepIndex, isMuted]);

  // Trigger audible chime when mic successfully opens and starts listening
  useEffect(() => {
    if (isActive && isListening) {
      playChime('start');
    }
  }, [isListening, isActive]);

  // Synchronize active state with parent to disable/dim standard mic buttons
  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  // Auto-advance / auto-skip triggers when listening finishes (excluding TTS speaking phase)
  useEffect(() => {
    if (!isActive || isSpeaking) return;

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
  }, [isListening, isActive, currentStepIndex, isSpeaking]);

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

    playChime('success');

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

    playChime('skip');

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

  const handleEditIntent = () => {
    // Cancel active countdown immediately on focus/click (user intent to edit)
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
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
        
        <button
          type="button"
          className={`btn-mute-toggle ${isMuted ? 'muted' : ''}`}
          onClick={() => setIsMuted(prev => !prev)}
          title={isMuted ? "Unmute TTS questions" : "Mute TTS questions"}
        >
          {isMuted ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15, display: 'block' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6L4.5 9H1.5v6h3l4.5 4.5V4.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15, display: 'block' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
          )}
        </button>

        {isSpeaking ? (
          <div className="guided-status-indicator speaking">
            Speaking Question…
          </div>
        ) : countdown !== null ? (
          <div className={`guided-countdown-badge ${countdownType}`}>
            {countdownType === 'advance' ? `Advancing in ${countdown}s` : `Skipping in ${countdown}s`}
          </div>
        ) : (
          <div className={`guided-status-indicator ${isListening ? 'listening' : ''}`}>
            {isListening ? 'Listening…' : 'Speech Stopped'}
            {isListening && (
              <div className="soundwave-visualizer">
                <div className="soundwave-bar"></div>
                <div className="soundwave-bar"></div>
                <div className="soundwave-bar"></div>
                <div className="soundwave-bar"></div>
                <div className="soundwave-bar"></div>
              </div>
            )}
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
        {isSpeaking ? (
          <div className="guided-live speaking-placeholder" style={{ opacity: 0.6, fontStyle: 'italic', textAlign: 'center', width: '100%' }}>
            Speaking question aloud…
          </div>
        ) : isListening ? (
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
                  onFocus={handleEditIntent}
                  onClick={handleEditIntent}
                  placeholder="Type or speak to edit…"
                />
              ) : (
                <input
                  type={currentStep.id === 'age' || currentStep.id === 'weight' ? 'number' : 'text'}
                  step={currentStep.id === 'weight' ? '0.1' : undefined}
                  className="guided-input-edit"
                  value={tempTranscript}
                  onChange={(e) => handleTextEdit(e.target.value)}
                  onFocus={handleEditIntent}
                  onClick={handleEditIntent}
                  placeholder="Type or speak to edit…"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {countdown === null && !isListening && !tempTranscript && currentStep.required && !isSpeaking && (
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
