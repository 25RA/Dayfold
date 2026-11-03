import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Check, X, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { useReflectionVoice } from '../../hooks/useReflectionVoice';

export interface VoiceTargetOption {
  id: string;
  label: string;
}

interface VoiceReflectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTranscript: (text: string, targetField: string) => void;
  initialTargetField?: string;
  targetOptions?: VoiceTargetOption[];
}

const DEFAULT_TARGET_OPTIONS: VoiceTargetOption[] = [
  { id: 'went_well', label: '1. What went well' },
  { id: 'remained_unfinished', label: '2. Unfinished' },
  { id: 'do_differently', label: '3. Do differently' },
  { id: 'additional_notes_0', label: 'Optional thoughts' },
];

export const VoiceReflectionModal: React.FC<VoiceReflectionModalProps> = ({
  isOpen,
  onClose,
  onApplyTranscript,
  initialTargetField = 'went_well',
  targetOptions,
}) => {
  const options = targetOptions && targetOptions.length > 0 ? targetOptions : DEFAULT_TARGET_OPTIONS;

  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript,
  } = useReflectionVoice();

  const [selectedField, setSelectedField] = useState<string>(initialTargetField);
  const [editableText, setEditableText] = useState('');

  // Sync hook transcript to local editable buffer
  useEffect(() => {
    if (transcript) {
      setEditableText(transcript);
    }
  }, [transcript]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedField(initialTargetField);
      resetTranscript();
      setEditableText('');
    } else {
      stopListening();
    }
  }, [isOpen, initialTargetField]);

  if (!isOpen) return null;

  const handleApply = () => {
    stopListening();
    const finalContent = editableText.trim();
    if (finalContent) {
      onApplyTranscript(finalContent, selectedField);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#FFF1EB] dark:bg-[#2A1710] flex items-center justify-center text-[#F26A3D]">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
                  Voice Reflection
                </h3>
                <p className="text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
                  Speak naturally • Review and edit your transcript before applying
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#7B8191] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 overflow-y-auto">
            {/* Target Field Selector */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[#7B8191] dark:text-[#A0A8B6] mb-1.5">
                Apply transcript to:
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F5F2EB] dark:bg-[#191D26] rounded-xl text-xs font-medium max-h-36 overflow-y-auto">
                {options.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedField(f.id)}
                    className={`py-1.5 px-2.5 rounded-lg text-left transition-all cursor-pointer truncate ${
                      selectedField === f.id
                        ? 'bg-white dark:bg-[#262B36] text-[#15181F] dark:text-[#ECEFF4] font-semibold shadow-xs'
                        : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mic Pulse / Status */}
            <div className="flex flex-col items-center justify-center py-4 bg-[#FCFBF8] dark:bg-[#151922] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl">
              <div className="relative mb-3">
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md ${
                    isListening
                      ? 'bg-[#F26A3D] text-white ring-4 ring-[#F26A3D]/25 animate-pulse'
                      : 'bg-white dark:bg-[#202530] border border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#F26A3D]'
                  }`}
                >
                  {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6 text-[#F26A3D]" />}
                </button>
              </div>

              <div className="text-center space-y-1">
                <p className="text-xs font-medium text-[#15181F] dark:text-[#ECEFF4]">
                  {isListening ? 'Listening to your voice...' : 'Tap the microphone to begin speaking'}
                </p>
                {interimTranscript && (
                  <p className="text-xs italic text-[#7B8191] dark:text-[#A0A8B6] max-w-sm px-4 truncate">
                    "{interimTranscript}"
                  </p>
                )}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900/40">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Editable Transcript Review */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#7B8191] dark:text-[#A0A8B6]">
                  Transcript (Editable review)
                </label>
                {editableText && (
                  <button
                    type="button"
                    onClick={resetTranscript}
                    className="flex items-center gap-1 text-[11px] text-[#7B8191] hover:text-red-500 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
              <textarea
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                placeholder="Your spoken words will appear here. You can refine or edit the text before adding it..."
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] bg-white dark:bg-[#151922] text-[#15181F] dark:text-[#ECEFF4] placeholder-[#7B8191]/50 text-xs font-sans focus:outline-hidden focus:ring-2 focus:ring-[#F26A3D]/30 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!editableText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F26A3D] text-white text-xs font-medium hover:bg-[#D4542B] disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply to Reflection</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

