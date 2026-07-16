/**
 * Tests for the useSpeechRecognition hook.
 *
 * The critical regression we're guarding against: when the silence timer
 * calls rec.stop() before the recognizer has marked the last interim result
 * as `isFinal: true`, the hook must still emit the transcript (recovered
 * from `lastInterim`) rather than dropping it. Without this, the Smart Fill
 * feature looked like it heard something (live transcript visible in red)
 * but the field never got populated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechRecognition } from './useSpeechRecognition';

function makeMockSR() {
  return {
    lang: '',
    continuous: false,
    interimResults: false,
    maxAlternatives: 1,
    start: vi.fn(),
    stop: vi.fn(),
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
  };
}

/** Build a result event where the result has the given transcript + isFinal.
 *  The Web Speech API structure is:
 *    event.results[i]        => SpeechRecognitionResult (array-like of alternatives)
 *    event.results[i][0]     => SpeechRecognitionAlternative
 *    event.results[i].isFinal => boolean
 *  So the hook reads `event.results[i][0].transcript` and `event.results[i].isFinal`.
 */
function makeResultEvent(transcript, isFinal) {
  const alternative = { transcript, confidence: 1.0 };
  const result = [alternative];
  result.isFinal = isFinal;
  return {
    resultIndex: 0,
    results: [result],
  };
}

describe('useSpeechRecognition', () => {
  let mockSR;
  let originalSR;
  let originalWindowSR;

  beforeEach(() => {
    originalSR = globalThis.SpeechRecognition;
    originalWindowSR = window.SpeechRecognition;
    mockSR = null;
    // The hook reads `window.SpeechRecognition` at call time via getSR(),
    // so we install our mock on BOTH globalThis and window.
    const Ctor = function MockSR() {
      mockSR = makeMockSR();
      return mockSR;
    };
    globalThis.SpeechRecognition = Ctor;
    window.SpeechRecognition = Ctor;
  });

  afterEach(() => {
    globalThis.SpeechRecognition = originalSR;
    if (originalWindowSR) {
      window.SpeechRecognition = originalWindowSR;
    } else {
      delete window.SpeechRecognition;
    }
    vi.useRealTimers();
  });

  it('REGRESSION: falls back to lastInterim when onend fires after stop() without a finalized result', () => {
    // The bug: user says "my name is arjun", recognizer emits only an interim
    // chunk (isFinal: false), silence timer fires stop(), recognizer ends
    // WITHOUT marking the interim as final. Hook should still emit the
    // transcript so the field gets populated.
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: 'en-US', onResult, long: true })
    );

    act(() => result.current.start());
    expect(mockSR).not.toBeNull();
    act(() => mockSR.onstart?.());

    // Interim result only (isFinal: false)
    act(() => mockSR.onresult?.(makeResultEvent('my name is arjun', false)));

    // Silence timer fires stop(); recognizer ends without any final result
    act(() => {
      mockSR.stop();
      mockSR.onend?.();
    });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toBe('my name is arjun');
  });

  it('falls back to lastInterim even if an empty interim result is received right before onend', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: 'en-US', onResult, long: true })
    );

    act(() => result.current.start());
    expect(mockSR).not.toBeNull();
    act(() => mockSR.onstart?.());

    // Interim result
    act(() => mockSR.onresult?.(makeResultEvent('my name is arjun', false)));

    // Empty interim result (simulating Chrome stopping and firing onresult with empty interim chunk)
    act(() => mockSR.onresult?.({
      resultIndex: 0,
      results: []
    }));

    // onend fires
    act(() => {
      mockSR.onend?.();
    });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toBe('my name is arjun');
  });

  it('uses the finalized transcript when present', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: 'en-US', onResult, long: true })
    );

    act(() => result.current.start());
    act(() => mockSR.onstart?.());

    act(() => mockSR.onresult?.(makeResultEvent('my name is arjun', true)));
    act(() => mockSR.onend?.());

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0]).toBe('my name is arjun');
  });

  it('calls onError when start() throws', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: 'en-US', onError, long: false })
    );

    // Override the constructor to throw on start()
    const ThrowingCtor = function ThrowingSR() {
      mockSR = makeMockSR();
      mockSR.start = vi.fn(() => { throw new Error('already started'); });
      return mockSR;
    };
    globalThis.SpeechRecognition = ThrowingCtor;
    window.SpeechRecognition = ThrowingCtor;

    act(() => result.current.start());

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'start-failed' })
    );
  });

  it('reports "No speech detected" when onend fires with no transcript at all', () => {
    const onResult = vi.fn();
    const onStatus = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ lang: 'en-US', onResult, onStatus, long: false })
    );

    act(() => result.current.start());
    act(() => mockSR.onstart?.());
    // No onresult events — just end immediately
    act(() => mockSR.onend?.());

    expect(onResult).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('No speech detected.');
  });
});
