import { create } from 'zustand';

export type VoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'reviewing'
  | 'reviewing_extraction'
  | 'thinking'
  | 'speaking'
  | 'awaiting_approval'
  | 'executing'
  | 'error';

export interface ExtractedTask {
  id: string;
  title: string;
  kind?: string;
  duration_minutes: number;
  duration_needs_confirmation?: boolean;
  priority?: number;
  deadline?: string | null;
  details?: string | null;
  constraint?: string | null;
}

export interface ExtractedFixedCommitment {
  id: string;
  title: string;
  kind?: string;
  duration_minutes: number;
  start_time: string;
  end_time: string;
  time_needs_confirmation?: boolean;
  duration_needs_confirmation?: boolean;
}

export interface ExtractedConflict {
  type: string;
  severity: 'warning' | 'critical';
  message: string;
  options?: string[];
  commitment_title?: string;
  commitment_start?: string;
  wake_up_time?: string;
  suggested_wake_up?: string;
  spoken_date?: string;
  spoken_date_label?: string;
  interface_date?: string;
  interface_date_label?: string;
}

export interface StructuredExtraction {
  target_date: string;
  target_date_label: string;
  is_explicit_date: boolean;
  tasks: ExtractedTask[];
  fixed_commitments: ExtractedFixedCommitment[];
  preferences: string[];
  constraints?: string[];
  conflicts?: ExtractedConflict[];
  clarification_required: string[];
  original_message: string;
  extraction_source?: 'gemini' | 'heuristic_fallback';
  model_name?: string | null;
  fallback_used?: boolean;
  fallback_reason?: string | null;
  latency_ms?: number;
}

export type VoiceLanguage = 'en-US' | 'en-IN' | 'en-GB' | 'hi-IN';

export interface LanguageOption {
  code: VoiceLanguage;
  label: string;
  flag: string;
  description: string;
}

export const SUPPORTED_VOICE_LANGUAGES: LanguageOption[] = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸', description: 'Standard US English accent' },
  { code: 'en-IN', label: 'English (India)', flag: '🇮🇳', description: 'Indian English pronunciation & idioms' },
  { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧', description: 'British English accent' },
  { code: 'hi-IN', label: 'Hindi / Hinglish', flag: '🇮🇳', description: 'Hindi & mixed conversational phrasing' },
];

interface VoiceStoreState {
  state: VoiceState;
  transcript: string;
  interimTranscript: string;
  language: VoiceLanguage;
  errorMessage: string | null;
  infoMessage: string | null;
  isSupported: boolean;
  extractedData: StructuredExtraction | null;
  spokenCaption: string | null;
  
  // Actions
  setState: (state: VoiceState) => void;
  setTranscript: (text: string) => void;
  setInterimTranscript: (text: string) => void;
  setSpokenCaption: (caption: string | null) => void;
  setLanguage: (lang: VoiceLanguage) => void;
  setError: (err: string | null) => void;
  setInfoMessage: (msg: string | null) => void;
  setExtractedData: (data: StructuredExtraction | null) => void;
  startListening: () => void;
  stopListening: () => void;
  cancelListening: () => void;
  speak: (text: string, onEnd?: () => void) => void;
  stopSpeaking: () => void;
}

interface IWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
}

export const useVoiceStore = create<VoiceStoreState>((set, get) => {
  const win = typeof window !== 'undefined' ? (window as unknown as IWindow) : null;
  const SpeechRecognitionClass = win?.SpeechRecognition || win?.webkitSpeechRecognition;
  const isSupported = !!SpeechRecognitionClass;

  let recognitionInstance: any = null;
  let accumulatedFinal = '';
  let currentInterimSnapshot = '';
  let silenceTimeout: any = null;

  const initialLang: VoiceLanguage =
    (typeof localStorage !== 'undefined' && (localStorage.getItem('dayfold_voice_lang') as VoiceLanguage)) ||
    'en-US';

  return {
    state: 'idle',
    transcript: '',
    interimTranscript: '',
    language: initialLang,
    errorMessage: null,
    infoMessage: null,
    isSupported,
    extractedData: null,
    spokenCaption: null,

    setState: (state) => set({ state }),
    setTranscript: (transcript) => set({ transcript }),
    setInterimTranscript: (interimTranscript) => set({ interimTranscript }),
    setSpokenCaption: (spokenCaption) => set({ spokenCaption }),
    setLanguage: (language) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dayfold_voice_lang', language);
      }
      set({ language });
    },
    setError: (errorMessage) => set({ errorMessage, state: errorMessage ? 'error' : 'idle' }),
    setInfoMessage: (infoMessage) => set({ infoMessage }),
    setExtractedData: (extractedData) => set({ extractedData }),

    startListening: () => {
      // 1. Cancel any active speech synthesis so it doesn't feed into mic
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      if (!isSupported) {
        set({
          state: 'error',
          errorMessage: 'Speech recognition is not supported in this browser. Please use Chrome or Edge, or type below.',
        });
        return;
      }

      try {
        if (recognitionInstance) {
          try {
            recognitionInstance.abort();
          } catch {}
          recognitionInstance = null;
        }

        accumulatedFinal = '';
        currentInterimSnapshot = '';
        if (silenceTimeout) clearTimeout(silenceTimeout);

        const recognition = new SpeechRecognitionClass();
        recognitionInstance = recognition;

        // Continuous recognition allows natural pauses between sentences
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = get().language;

        set({
          state: 'listening',
          transcript: '',
          interimTranscript: '',
          errorMessage: null,
          infoMessage: 'Listening... Speak your tasks, meetings, and deadlines naturally.',
        });

        recognition.onstart = () => {
          set({ state: 'listening', errorMessage: null });
        };

        recognition.onresult = (event: any) => {
          let newlyFinal = '';
          let interim = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
              newlyFinal += res[0].transcript + ' ';
            } else {
              interim += res[0].transcript;
            }
          }

          if (newlyFinal) {
            accumulatedFinal += newlyFinal;
          }
          currentInterimSnapshot = interim;

          const displayTranscript = accumulatedFinal.trim();
          set({
            transcript: displayTranscript,
            interimTranscript: interim.trim(),
            infoMessage: null,
          });
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'aborted') {
            return;
          }
          if (event.error === 'no-speech') {
            // Friendly prompt if no speech detected
            if (!accumulatedFinal.trim()) {
              set({
                infoMessage: 'No speech detected. Tap the mic and speak when you are ready, or type below.',
                state: 'idle',
              });
            }
            return;
          }
          if (event.error === 'not-allowed') {
            set({
              state: 'error',
              errorMessage: 'Microphone permission was denied. Please allow microphone access in your browser address bar.',
            });
            return;
          }
          set({
            state: 'error',
            errorMessage: `Voice recognition notice: ${event.error}. You can also type your instructions directly.`,
          });
        };

        recognition.onend = () => {
          const currentState = get().state;
          // If we were listening and user stopped speaking or browser stopped:
          if (currentState === 'listening') {
            const fullSpoken = (accumulatedFinal + ' ' + currentInterimSnapshot).trim();
            if (fullSpoken.length > 0) {
              // Transition to reviewing state for confirmation and editing!
              set({
                state: 'reviewing',
                transcript: fullSpoken,
                interimTranscript: '',
                infoMessage: 'Review your instruction below before planning.',
              });
            } else {
              set({
                state: 'idle',
                interimTranscript: '',
                infoMessage: 'Tap the mic when you are ready to speak.',
              });
            }
          }
        };

        recognition.start();
      } catch (err: any) {
        set({
          state: 'error',
          errorMessage: err.message || 'Failed to initialize speech recognition.',
        });
      }
    },

    stopListening: () => {
      if (silenceTimeout) clearTimeout(silenceTimeout);
      if (recognitionInstance) {
        try {
          recognitionInstance.stop();
        } catch {}
        recognitionInstance = null;
      }

      const fullSpoken = (accumulatedFinal + ' ' + currentInterimSnapshot).trim();
      if (fullSpoken.length > 0) {
        set({
          state: 'reviewing',
          transcript: fullSpoken,
          interimTranscript: '',
          infoMessage: 'Please review and confirm what we heard before generating your schedule.',
        });
      } else {
        set({
          state: 'idle',
          transcript: '',
          interimTranscript: '',
          infoMessage: 'No speech captured. Tap mic to try again, or type below.',
        });
      }
    },

    cancelListening: () => {
      if (silenceTimeout) clearTimeout(silenceTimeout);
      if (recognitionInstance) {
        try {
          recognitionInstance.abort();
        } catch {}
        recognitionInstance = null;
      }
      accumulatedFinal = '';
      currentInterimSnapshot = '';
      set({
        state: 'idle',
        transcript: '',
        interimTranscript: '',
        errorMessage: null,
        infoMessage: null,
      });
    },

    speak: (text: string, onEnd?: () => void) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;

      try {
        if ((window as any).__ttsWatchdogTimer) {
          clearTimeout((window as any).__ttsWatchdogTimer);
        }
        window.speechSynthesis.cancel();
        
        // Clean speech text (strip markdown symbols like *, #, etc.)
        const cleanText = text
          .replace(/[*#_`~]/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .trim();

        if (!cleanText) {
          set({ state: 'idle' });
          return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        // Retain top-level window reference to prevent Chromium garbage collection bug
        (window as any).__activeUtterance = utterance;

        utterance.rate = 1.02;
        utterance.pitch = 1.0;

        const lang = get().language;
        utterance.lang = lang;

        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const matchedVoice =
            voices.find((v) => v.lang === lang && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))) ||
            voices.find((v) => v.lang.startsWith(lang.slice(0, 2))) ||
            voices.find((v) => v.lang.startsWith('en'));
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }

        set({ state: 'speaking', spokenCaption: cleanText });

        const cleanup = () => {
          if ((window as any).__ttsWatchdogTimer) {
            clearTimeout((window as any).__ttsWatchdogTimer);
            (window as any).__ttsWatchdogTimer = null;
          }
          (window as any).__activeUtterance = null;
          if (get().state === 'speaking') {
            set({ state: 'idle', spokenCaption: null });
          }
        };

        utterance.onend = () => {
          cleanup();
          if (onEnd) onEnd();
        };

        utterance.onerror = () => {
          cleanup();
        };

        // Safety watchdog: Chromium sometimes pauses or drops onend events
        const estimatedDurationMs = Math.max(5000, (cleanText.split(' ').length / 2.5) * 1000 + 4000);
        (window as any).__ttsWatchdogTimer = setTimeout(() => {
          cleanup();
        }, estimatedDurationMs);

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Speech synthesis error:', e);
        set({ state: 'idle' });
      }
    },

    stopSpeaking: () => {
      if ((window as any).__ttsWatchdogTimer) {
        clearTimeout((window as any).__ttsWatchdogTimer);
        (window as any).__ttsWatchdogTimer = null;
      }
      (window as any).__activeUtterance = null;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      }
      set({ state: 'idle', spokenCaption: null });
    },
  };
});
