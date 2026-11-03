import { useState, useRef, useEffect, useCallback } from 'react';

interface IWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
}

export interface UseReflectionVoiceReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  setTranscript: (text: string) => void;
}

/**
 * Isolated speech recognition hook dedicated strictly to Reflection dictation.
 * Does NOT import or touch the planner voice store or VoiceOrb.
 * Automatically releases audio/mic streams on unmount or pause.
 */
export function useReflectionVoice(): UseReflectionVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef<string>('');

  const win = typeof window !== 'undefined' ? (window as unknown as IWindow) : null;
  const SpeechRecognitionClass = win?.SpeechRecognition || win?.webkitSpeechRecognition;
  const isSupported = !!SpeechRecognitionClass;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser. Please type directly.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      setError(null);
      accumulatedRef.current = transcript ? transcript.trim() + ' ' : '';
      setInterimTranscript('');

      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            accumulatedRef.current += text + ' ';
            setTranscript(accumulatedRef.current.trim());
          } else {
            currentInterim += text;
          }
        }
        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return;
        console.warn('Reflection voice recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please enable microphone permissions in your browser.');
        } else {
          setError(`Recognition notice: ${event.error}`);
        }
        stopListening();
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognition.start();
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize voice recognition.');
      setIsListening(false);
    }
  }, [isSupported, transcript, stopListening]);

  const resetTranscript = useCallback(() => {
    stopListening();
    accumulatedRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, [stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript,
  };
}

