import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Loader2,
  Square,
  Globe,
  Edit3,
  RotateCcw,
  Check,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  useVoiceStore,
  VoiceState,
  VoiceLanguage,
  SUPPORTED_VOICE_LANGUAGES,
  StructuredExtraction,
} from '../store/useVoiceStore';
import { ExtractionReviewCard } from './ExtractionReviewCard';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import api from '../lib/api';

interface VoiceOrbProps {
  onSendMessage?: (text: string) => void;
  onPlanExtracted?: (extraction: StructuredExtraction) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showInputFallback?: boolean;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  onSendMessage,
  onPlanExtracted,
  size = 'md',
  className = '',
  showInputFallback = true,
}) => {
  const {
    state,
    transcript,
    interimTranscript,
    language,
    errorMessage,
    infoMessage,
    isSupported,
    extractedData,
    spokenCaption,
    setState,
    setLanguage,
    setTranscript,
    setExtractedData,
    startListening,
    stopListening,
    cancelListening,
    stopSpeaking,
  } = useVoiceStore();

  const [textInput, setTextInput] = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync editedTranscript when reviewing starts
  useEffect(() => {
    if (state === 'reviewing') {
      setEditedTranscript(transcript);
    }
  }, [state, transcript]);

  const handleOrbClick = () => {
    if (state === 'speaking') {
      stopSpeaking();
    } else if (state === 'listening') {
      stopListening();
    } else if (state === 'reviewing') {
      handleConfirmPlan();
    } else {
      startListening();
    }
  };

  const { selectedDate } = useWorkspaceStore();

  const processInstruction = async (textToSubmit: string) => {
    if (!textToSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (onPlanExtracted) {
        setState('thinking');
        const d = selectedDate ? new Date(selectedDate) : new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const interfaceDate = `${yyyy}-${mm}-${dd}`;

        const res = await api.post('/agent/extract', {
          message: textToSubmit,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          interface_date: interfaceDate,
        });
        const extData: StructuredExtraction = res.data;
        if (
          (extData.tasks && extData.tasks.length > 0) ||
          (extData.fixed_commitments && extData.fixed_commitments.length > 0)
        ) {
          setExtractedData(extData);
          setState('reviewing_extraction');
          setIsSubmitting(false);
          return;
        }
      }
      // Fallback to conversational message
      if (onSendMessage) {
        onSendMessage(textToSubmit);
      }
    } catch (err: any) {
      console.error('Failed to extract structured plan:', err);
      if (onSendMessage) {
        onSendMessage(textToSubmit);
      }
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 500);
    }
  };

  const handleConfirmPlan = () => {
    const textToSubmit = (editedTranscript || transcript).trim();
    if (!textToSubmit) {
      cancelListening();
      return;
    }
    processInstruction(textToSubmit);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isSubmitting) return;
    const txt = textInput.trim();
    setTextInput('');
    processInstruction(txt);
  };

  const currentLanguageOption =
    SUPPORTED_VOICE_LANGUAGES.find((l) => l.code === language) || SUPPORTED_VOICE_LANGUAGES[0];

  // Dimensions
  const sizeMap = {
    sm: 'w-14 h-14',
    md: 'w-20 h-20',
    lg: 'w-28 h-28',
  };
  const orbSize = sizeMap[size];

  // Visual treatments per state
  const getOrbVisuals = (s: VoiceState) => {
    switch (s) {
      case 'listening':
        return {
          ring: 'border-[#1B7F83] ring-4 ring-[#1B7F83]/30 shadow-[0_0_35px_rgba(27,127,131,0.55)]',
          bg: 'bg-gradient-to-br from-[#1B7F83] to-[#12585B]',
          glow: 'bg-[#1B7F83]/40',
          label: 'Listening... (Tap to Finish)',
        };
      case 'reviewing':
        return {
          ring: 'border-[#F26A3D] ring-4 ring-[#F26A3D]/30 shadow-[0_0_30px_rgba(242,106,61,0.5)]',
          bg: 'bg-gradient-to-br from-[#F26A3D] to-[#D95326]',
          glow: 'bg-[#F26A3D]/30',
          label: 'Review Instruction',
        };
      case 'reviewing_extraction':
        return {
          ring: 'border-[#F26A3D] ring-4 ring-[#F26A3D]/40 shadow-[0_0_35px_rgba(242,106,61,0.6)]',
          bg: 'bg-gradient-to-br from-[#F26A3D] to-[#D95326]',
          glow: 'bg-[#F26A3D]/30',
          label: 'Review Schedule Items',
        };
      case 'thinking':
        return {
          ring: 'border-[#F5B04C] ring-4 ring-[#F5B04C]/30 shadow-[0_0_35px_rgba(245,176,76,0.6)]',
          bg: 'bg-gradient-to-br from-[#F5B04C] to-[#F26A3D]',
          glow: 'bg-[#F5B04C]/35',
          label: 'Unfolding Schedule...',
        };
      case 'speaking':
        return {
          ring: 'border-[#F26A3D] shadow-[0_0_35px_rgba(242,106,61,0.6)]',
          bg: 'bg-gradient-to-br from-[#F26A3D] to-[#E4527F]',
          glow: 'bg-[#E4527F]/40',
          label: 'Speaking (Tap to Mute)',
        };
      case 'awaiting_approval':
        return {
          ring: 'border-[#F5B04C] ring-2 ring-[#F5B04C]/30 shadow-[0_0_25px_rgba(245,176,76,0.5)]',
          bg: 'bg-gradient-to-br from-[#F5B04C] to-[#D98A1F]',
          glow: 'bg-[#F5B04C]/20',
          label: 'Plan Ready • Approve Below',
        };
      case 'executing':
        return {
          ring: 'border-[#15181F] dark:border-white shadow-[0_0_25px_rgba(21,24,31,0.3)]',
          bg: 'bg-gradient-to-br from-[#15181F] to-[#5A6070] dark:from-white dark:to-slate-300',
          glow: 'bg-black/20 dark:bg-white/20',
          label: 'Committing to Timeline...',
        };
      case 'error':
        return {
          ring: 'border-[#D6453D] shadow-[0_0_25px_rgba(214,69,61,0.5)]',
          bg: 'bg-gradient-to-br from-[#D6453D] to-[#A23C17]',
          glow: 'bg-[#D6453D]/30',
          label: 'Voice Error',
        };
      case 'idle':
      default:
        return {
          ring: 'border-[#E8E3D9] dark:border-[#262B36] shadow-md hover:shadow-lg hover:border-[#F26A3D]/60',
          bg: 'bg-gradient-to-br from-[#FBF9F5] via-white to-[#F4F1EB] dark:from-[#1A1E27] dark:via-[#161922] dark:to-[#12151C]',
          glow: 'bg-[#F26A3D]/10',
          label: 'Tap to Speak',
        };
    }
  };

  const visuals = getOrbVisuals(state);

  return (
    <div className={`flex flex-col items-center gap-3.5 w-full max-w-lg ${className}`}>
      {/* Language Selector Bar */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border border-[#E8E3D9] dark:border-[#262B36] bg-[#FBF9F5] dark:bg-[#161922] text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer"
          title="Select Voice Language"
        >
          <span className="text-sm">{currentLanguageOption.flag}</span>
          <span>{currentLanguageOption.label}</span>
          <Globe className="w-3 h-3 opacity-60 ml-0.5" />
        </button>

        {showLanguageMenu && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-40 w-56 p-1.5 rounded-xl bg-white dark:bg-[#181C26] border border-[#E8E3D9] dark:border-[#262B36] shadow-xl text-xs space-y-1">
            <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[#7B8191]">
              Select Recognition Accent
            </div>
            {SUPPORTED_VOICE_LANGUAGES.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  setLanguage(opt.code);
                  setShowLanguageMenu(false);
                }}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer ${language === opt.code
                    ? 'bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#FFA67F] font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-[#1E2330] text-[#5A6070] dark:text-[#A0A8B6]'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <span>{opt.flag}</span>
                  <div>
                    <div className="text-xs">{opt.label}</div>
                    <div className="text-[10px] opacity-75">{opt.description}</div>
                  </div>
                </div>
                {language === opt.code && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Voice Orb Button with Dynamic Aura */}
      <div className="relative flex items-center justify-center my-1">
        {/* Animated outer aura glow */}
        <AnimatePresence>
          {(state === 'listening' || state === 'thinking' || state === 'speaking') && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{
                scale: state === 'listening' ? [1, 1.4, 1] : [1, 1.25, 1],
                opacity: [0.6, 0.2, 0.6],
              }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              className={`absolute inset-0 rounded-full blur-xl pointer-events-none ${visuals.glow}`}
            />
          )}
        </AnimatePresence>

        {/* Core Orb Container */}
        <motion.button
          onClick={handleOrbClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300 cursor-pointer ${orbSize} ${visuals.ring} ${visuals.bg}`}
          title={
            state === 'listening'
              ? 'Tap to stop & review'
              : state === 'speaking'
                ? 'Tap to mute'
                : 'Tap to speak'
          }
          aria-label={visuals.label}
        >
          {/* Inner animation according to state */}
          {state === 'idle' && (
            <Mic className="w-7 h-7 text-[#15181F] dark:text-[#ECEFF4] opacity-85" />
          )}

          {state === 'listening' && (
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="flex items-center justify-center"
            >
              <Mic className="w-8 h-8 text-white drop-shadow-md" />
            </motion.div>
          )}

          {state === 'reviewing' && (
            <Check className="w-8 h-8 text-white drop-shadow-md" />
          )}

          {state === 'thinking' && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
            >
              <Sparkles className="w-8 h-8 text-white drop-shadow-md" />
            </motion.div>
          )}

          {state === 'speaking' && (
            <motion.div
              animate={{ scale: [0.95, 1.2, 0.95] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="flex items-center gap-1"
            >
              <span className="w-1.5 h-4 bg-white rounded-full animate-bounce" />
              <span className="w-1.5 h-6 bg-white rounded-full animate-bounce delay-100" />
              <span className="w-1.5 h-3 bg-white rounded-full animate-bounce delay-200" />
            </motion.div>
          )}

          {state === 'executing' && (
            <Loader2 className="w-8 h-8 animate-spin text-white dark:text-black" />
          )}

          {state === 'awaiting_approval' && (
            <CheckCircle className="w-8 h-8 text-white drop-shadow-md" />
          )}

          {state === 'error' && (
            <AlertCircle className="w-8 h-8 text-white drop-shadow-md" />
          )}
        </motion.button>
      </div>

      {/* State Label & Subtitle */}
      <div className="text-center space-y-0.5">
        <span className="text-xs font-mono uppercase tracking-wider font-semibold text-[#15181F] dark:text-[#ECEFF4] block">
          {visuals.label}
        </span>
        {infoMessage && (
          <p className="text-[11px] text-[#5A6070] dark:text-[#A0A8B6] max-w-sm">
            {infoMessage}
          </p>
        )}
      </div>

      {/* Live Speech Captions when Speaking */}
      {state === 'speaking' && spokenCaption && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="w-full max-w-md mx-auto p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 shadow-xs space-y-1.5 text-center"
        >
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-800 dark:text-amber-400 font-semibold">
            <Volume2 className="w-3.5 h-3.5 animate-pulse text-[#C74E22] dark:text-[#F26A3D]" />
            <span>Assistant Speaking</span>
            <button
              type="button"
              onClick={stopSpeaking}
              className="ml-2 text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
            >
              Mute
            </button>
          </div>
          <p className="text-xs sm:text-sm text-[#15181F] dark:text-[#ECEFF4] font-medium leading-relaxed italic px-2">
            "{spokenCaption}"
          </p>
        </motion.div>
      )}

      {/* Live Stream while Listening */}
      {state === 'listening' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full p-4 rounded-2xl bg-white dark:bg-[#161A23] border border-[#1B7F83]/40 shadow-sm space-y-2 text-left"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#1B7F83] dark:text-[#28A5AA] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#1B7F83] animate-ping" />
              Live Speech Stream
            </span>
            <button
              type="button"
              onClick={stopListening}
              className="text-xs font-mono text-[#C74E22] dark:text-[#F26A3D] hover:underline cursor-pointer flex items-center gap-1"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Finish Speaking</span>
            </button>
          </div>

          <div className="text-sm font-medium min-h-[40px] text-[#15181F] dark:text-[#ECEFF4] leading-relaxed">
            {transcript && <span>{transcript} </span>}
            {interimTranscript && (
              <span className="italic text-[#7B8191] dark:text-[#A0A8B6]">
                {interimTranscript}...
              </span>
            )}
            {!transcript && !interimTranscript && (
              <span className="text-xs italic text-[#7B8191] dark:text-[#636C7E]">
                Start speaking your commitments...
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Transcript Confirmation & Correction Card (Reviewing State) */}
      <AnimatePresence>
        {state === 'reviewing' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="w-full p-5 rounded-2xl bg-white dark:bg-[#161A23] border-2 border-[#F26A3D]/40 shadow-lg space-y-4 text-left"
          >
            <div className="flex items-center justify-between border-b border-[#E8E3D9] dark:border-[#262B36] pb-2.5">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#F26A3D]" />
                <h4 className="font-serif text-base font-medium text-[#15181F] dark:text-[#ECEFF4]">
                  Confirm Spoken Instruction
                </h4>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                Editable
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                You can correct any misheard words or numbers before Dayfold plans your day:
              </label>
              <textarea
                value={editedTranscript}
                onChange={(e) => setEditedTranscript(e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40 leading-relaxed"
                placeholder="Spoken instruction text..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelListening}
                  className="px-3 py-1.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white text-xs font-mono transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => startListening()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white text-xs font-mono transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Re-speak</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleConfirmPlan}
                disabled={!editedTranscript.trim() || isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white text-xs uppercase font-mono font-bold tracking-wider hover:opacity-95 disabled:opacity-40 transition-opacity cursor-pointer shadow-sm"
                title="Extract intentions and review schedule items"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Analyzing...' : 'Unfold Schedule'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Structured Extraction Review Card (Reviewing Extraction State) */}
      <AnimatePresence>
        {state === 'reviewing_extraction' && extractedData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="w-full max-w-2xl sm:max-w-3xl my-auto">
              <ExtractionReviewCard
                extraction={extractedData}
                onConfirm={(confirmed) => {
                  if (onPlanExtracted) {
                    onPlanExtracted(confirmed);
                  }
                }}
                onBackToTranscript={() => {
                  setState('reviewing');
                }}
                onCancel={() => {
                  cancelListening();
                }}
                isSubmitting={isSubmitting}
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Message Pill */}
      {errorMessage && (
        <div className="text-xs text-[#D6453D] bg-red-50 dark:bg-red-950/40 border border-[#D6453D]/30 px-4 py-2 rounded-xl max-w-md text-center">
          {errorMessage}
        </div>
      )}

      {/* Text Input Fallback (always ready) */}
      {showInputFallback && state !== 'reviewing' && state !== 'reviewing_extraction' && state !== 'listening' && (
        <form onSubmit={handleTextSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full max-w-full">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={state === 'thinking' || isSubmitting}
            placeholder="Or type tasks (e.g. 'CS exam prep for 2 hours, class from 10 to 12')..."
            className="flex-1 min-w-0 px-3.5 py-2.5 text-xs bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40 text-[#15181F] dark:text-[#ECEFF4] placeholder:text-[#7B8191]"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || state === 'thinking' || isSubmitting}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white text-xs font-mono font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0 shadow-sm whitespace-nowrap"
            title="Unfold Schedule: Extract intentions and open review modal"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Unfold Schedule</span>
          </button>
        </form>
      )}
    </div>
  );
};
