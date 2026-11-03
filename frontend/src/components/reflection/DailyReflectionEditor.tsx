import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Mic,
  CheckCircle2,
  Calendar,
  Save,
  Loader2,
  Lock,
  Info,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit3,
  X,
} from 'lucide-react';
import { format, parseISO, addDays, subDays } from 'date-fns';
import { VoiceReflectionModal, VoiceTargetOption } from './VoiceReflectionModal';
import {
  parseAdditionalThoughts,
  serializeAdditionalThoughts,
} from '../../lib/reflectionUtils';
import api from '../../lib/api';

interface DailyReflectionEditorProps {
  initialDate?: string; // YYYY-MM-DD
  editingReflection?: { id: string; date: string } | null;
  onCancelEdit?: () => void;
  onSaved?: () => void;
}

export const DailyReflectionEditor: React.FC<DailyReflectionEditorProps> = ({
  initialDate,
  editingReflection,
  onCancelEdit,
  onSaved,
}) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState<string>(
    editingReflection ? editingReflection.date : initialDate || todayStr
  );

  const [wentWell, setWentWell] = useState('');
  const [remainedUnfinished, setRemainedUnfinished] = useState('');
  const [doDifferently, setDoDifferently] = useState('');
  const [additionalThoughts, setAdditionalThoughts] = useState<string[]>(['']);
  const [voiceUsed, setVoiceUsed] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Voice modal state
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceTargetField, setVoiceTargetField] = useState<string>('went_well');

  // Load reflection data
  const loadReflectionData = async (reflectionId?: string, dateStr?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSaveSuccess(false);
    try {
      let data;
      if (reflectionId) {
        const res = await api.get(`/reflections/${reflectionId}`);
        data = res.data;
      } else if (dateStr) {
        const res = await api.get(`/reflections/by-date/${dateStr}`);
        data = res.data;
      }
      if (data) {
        setWentWell(data.went_well || '');
        setRemainedUnfinished(data.remained_unfinished || '');
        setDoDifferently(data.do_differently || '');
        setAdditionalThoughts(parseAdditionalThoughts(data.additional_notes));
        setVoiceUsed(data.voice_used || false);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Clear for new reflection
        setWentWell('');
        setRemainedUnfinished('');
        setDoDifferently('');
        setAdditionalThoughts(['']);
        setVoiceUsed(false);
      } else {
        console.error('Failed to load reflection:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (editingReflection) {
      setSelectedDate(editingReflection.date);
      loadReflectionData(editingReflection.id, editingReflection.date);
    } else {
      loadReflectionData(undefined, selectedDate);
    }
  }, [editingReflection?.id, selectedDate]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!wentWell.trim() || !remainedUnfinished.trim() || !doDifferently.trim()) {
      setErrorMessage('Please provide an entry for the three core questions before saving.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const serializedNotes = serializeAdditionalThoughts(additionalThoughts);
      if (editingReflection?.id) {
        await api.put(`/reflections/${editingReflection.id}`, {
          went_well: wentWell.trim(),
          remained_unfinished: remainedUnfinished.trim(),
          do_differently: doDifferently.trim(),
          additional_notes: serializedNotes,
          voice_used: voiceUsed,
        });
      } else {
        await api.post('/reflections', {
          target_date: selectedDate,
          went_well: wentWell.trim(),
          remained_unfinished: remainedUnfinished.trim(),
          do_differently: doDifferently.trim(),
          additional_notes: serializedNotes,
          voice_used: voiceUsed,
        });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onSaved?.();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to save reflection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEditing = () => {
    onCancelEdit?.();
    setSelectedDate(todayStr);
  };

  const handleOpenVoice = (fieldId: string) => {
    setVoiceTargetField(fieldId);
    setVoiceModalOpen(true);
  };

  const handleApplyVoice = (text: string, fieldId: string) => {
    setVoiceUsed(true);
    if (fieldId === 'went_well') {
      setWentWell((prev) => (prev ? `${prev}\n${text}` : text));
    } else if (fieldId === 'remained_unfinished') {
      setRemainedUnfinished((prev) => (prev ? `${prev}\n${text}` : text));
    } else if (fieldId === 'do_differently') {
      setDoDifferently((prev) => (prev ? `${prev}\n${text}` : text));
    } else if (fieldId.startsWith('additional_notes_')) {
      const idx = parseInt(fieldId.replace('additional_notes_', ''), 10);
      if (!isNaN(idx) && idx >= 0) {
        setAdditionalThoughts((prev) => {
          const next = [...prev];
          if (idx < next.length) {
            next[idx] = next[idx] ? `${next[idx]}\n${text}` : text;
          } else {
            next.push(text);
          }
          return next;
        });
      }
    } else if (fieldId === 'additional_notes') {
      setAdditionalThoughts((prev) => {
        const next = [...prev];
        if (next.length > 0) {
          next[0] = next[0] ? `${next[0]}\n${text}` : text;
        } else {
          next.push(text);
        }
        return next;
      });
    }
  };

  // Expandable thoughts helpers
  const handleAddThought = () => {
    setAdditionalThoughts((prev) => [...prev, '']);
  };

  const handleUpdateThought = (index: number, value: string) => {
    setAdditionalThoughts((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveThought = (index: number) => {
    setAdditionalThoughts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
  };

  const shiftDate = (days: number) => {
    if (editingReflection) return; // Prevent shifting while editing
    const current = parseISO(selectedDate);
    const target = days > 0 ? addDays(current, days) : subDays(current, Math.abs(days));
    setSelectedDate(format(target, 'yyyy-MM-dd'));
  };

  const parsedCurrent = parseISO(selectedDate);
  const isToday = selectedDate === todayStr;

  // Build target options for voice modal
  const voiceTargetOptions: VoiceTargetOption[] = [
    { id: 'went_well', label: '1. What went well' },
    { id: 'remained_unfinished', label: '2. Unfinished' },
    { id: 'do_differently', label: '3. Do differently' },
    ...additionalThoughts.map((_, idx) => ({
      id: `additional_notes_${idx}`,
      label: additionalThoughts.length === 1 ? 'Optional thoughts' : `Thought #${idx + 1}`,
    })),
  ];

  return (
    <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Editing Mode Banner */}
      {editingReflection && (
        <div className="flex items-center justify-between px-6 py-3 bg-[#FFF5EE] dark:bg-[#2A1710] border-b border-[#F26A3D]/25">
          <div className="flex items-center gap-2 text-xs text-[#C74E22] dark:text-[#F26A3D] font-medium">
            <Edit3 className="w-4 h-4 text-[#F26A3D]" />
            <span>
              Editing Reflection for{' '}
              <strong>{format(parseISO(editingReflection.date), 'EEEE, MMMM d, yyyy')}</strong>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F26A3D]/10 border border-[#F26A3D]/30">
              Active Edit Mode
            </span>
          </div>
          <button
            type="button"
            onClick={handleCancelEditing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#F26A3D]/30 bg-white dark:bg-[#12151C] text-xs font-mono text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel Edit</span>
          </button>
        </div>
      )}

      {/* Date Navigation & Privacy Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            disabled={Boolean(editingReflection)}
            className="p-1.5 rounded-lg border border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title={editingReflection ? 'Date navigation disabled while editing an existing reflection' : 'Previous day'}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36]">
            <Calendar className="w-4 h-4 text-[#F26A3D]" />
            <span className="font-serif text-base font-medium text-[#15181F] dark:text-[#ECEFF4]">
              {format(parsedCurrent, 'EEEE, MMMM d, yyyy')}
            </span>
            {isToday && (
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#F26A3D] font-semibold border border-[#F26A3D]/20">
                Today
              </span>
            )}
            {editingReflection && (
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FCF1DC] dark:bg-[#3A2A10] text-[#D98A1F] border border-[#D98A1F]/30" title="Date locked to prevent accidental overwrite">
                <Lock className="w-3 h-3" /> Locked
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            disabled={isToday || Boolean(editingReflection)}
            className="p-1.5 rounded-lg border border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            title={editingReflection ? 'Date navigation disabled while editing an existing reflection' : 'Next day'}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
          <Lock className="w-3.5 h-3.5 text-[#1B7F83]" />
          <span>Private reflection • Isolated from tasks</span>
        </div>
      </div>

      {/* Editor Body */}
      <form onSubmit={handleSave} className="p-6 space-y-6">
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-xs border border-red-200 dark:border-red-900/40">
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-[#7B8191]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs font-mono">Loading your thoughts...</span>
          </div>
        ) : (
          <>
            {/* Question 1: What went well? */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4]">
                  <span className="w-5 h-5 rounded-full bg-[#E1F2F2] dark:bg-[#12302F] text-[#1B7F83] flex items-center justify-center text-xs font-mono">
                    1
                  </span>
                  <span>What went well today?</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleOpenVoice('went_well')}
                  className="flex items-center gap-1 text-xs text-[#F26A3D] hover:text-[#C74E22] transition-colors cursor-pointer font-mono"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Speak</span>
                </button>
              </div>
              <p className="text-xs text-[#7B8191] dark:text-[#A0A8B6]">
                Celebrate completed focus blocks, unexpected wins, or positive routines.
              </p>
              <textarea
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
                placeholder="I was able to focus without distractions during the morning hours, finished my math assignment..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922] text-[#15181F] dark:text-[#ECEFF4] placeholder-[#7B8191]/40 text-xs font-sans focus:outline-hidden focus:ring-2 focus:ring-[#F26A3D]/30 resize-none leading-relaxed"
              />
            </div>

            {/* Question 2: What remained unfinished? */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4]">
                  <span className="w-5 h-5 rounded-full bg-[#FFF1EB] dark:bg-[#2A1710] text-[#F26A3D] flex items-center justify-center text-xs font-mono">
                    2
                  </span>
                  <span>What remained unfinished?</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleOpenVoice('remained_unfinished')}
                  className="flex items-center gap-1 text-xs text-[#F26A3D] hover:text-[#C74E22] transition-colors cursor-pointer font-mono"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Speak</span>
                </button>
              </div>
              <p className="text-xs text-[#7B8191] dark:text-[#A0A8B6]">
                Notice friction, underestimated task lengths, or unexpected interruptions without judgment.
              </p>
              <textarea
                value={remainedUnfinished}
                onChange={(e) => setRemainedUnfinished(e.target.value)}
                placeholder="I didn't finish reading chapter 4 because the project meeting ran 30 minutes over..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922] text-[#15181F] dark:text-[#ECEFF4] placeholder-[#7B8191]/40 text-xs font-sans focus:outline-hidden focus:ring-2 focus:ring-[#F26A3D]/30 resize-none leading-relaxed"
              />
            </div>

            {/* Question 3: What would you do differently tomorrow? */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4]">
                  <span className="w-5 h-5 rounded-full bg-[#FCF1DC] dark:bg-[#3A2A10] text-[#D98A1F] flex items-center justify-center text-xs font-mono">
                    3
                  </span>
                  <span>What would you do differently tomorrow?</span>
                </label>
                <button
                  type="button"
                  onClick={() => handleOpenVoice('do_differently')}
                  className="flex items-center gap-1 text-xs text-[#F26A3D] hover:text-[#C74E22] transition-colors cursor-pointer font-mono"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Speak</span>
                </button>
              </div>
              <p className="text-xs text-[#7B8191] dark:text-[#A0A8B6]">
                One realistic takeaway or tactical adjustment for tomorrow's energy and commitments.
              </p>
              <textarea
                value={doDifferently}
                onChange={(e) => setDoDifferently(e.target.value)}
                placeholder="I will block a 15-minute buffer between meetings and tackle demanding code reviews before 11 AM..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922] text-[#15181F] dark:text-[#ECEFF4] placeholder-[#7B8191]/40 text-xs font-sans focus:outline-hidden focus:ring-2 focus:ring-[#F26A3D]/30 resize-none leading-relaxed"
              />
            </div>

            {/* Expandable Additional Thoughts */}
            <div className="space-y-3 pt-4 border-t border-[#E8E3D9]/60 dark:border-[#262B36]/60">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-[#15181F] dark:text-[#ECEFF4]">
                    Optional additional thoughts or notes
                  </label>
                  <p className="text-[11px] text-[#7B8191] dark:text-[#A0A8B6] mt-0.5">
                    Capture distinct thoughts, mood observations, gratitude, or physical energy.
                  </p>
                </div>
              </div>

              {/* Thoughts list */}
              <div className="space-y-3">
                {additionalThoughts.map((thought, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922] space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[11px] font-medium text-[#7B8191] dark:text-[#A0A8B6]">
                        {additionalThoughts.length > 1 ? `Thought #${idx + 1}` : 'Additional thought'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenVoice(`additional_notes_${idx}`)}
                          className="flex items-center gap-1 text-[11px] font-mono text-[#F26A3D] hover:text-[#C74E22] transition-colors cursor-pointer"
                        >
                          <Mic className="w-3 h-3" />
                          <span>Speak</span>
                        </button>
                        {additionalThoughts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveThought(idx)}
                            className="p-1 rounded text-[#7B8191] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                            title="Remove this thought"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={thought}
                      onChange={(e) => handleUpdateThought(idx, e.target.value)}
                      placeholder="Jot down a mood observation, personal gratitude, or reflection on energy..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-[#E8E3D9] dark:border-[#262B36] bg-white dark:bg-[#1A1E27] text-[#15181F] dark:text-[#ECEFF4] placeholder-[#7B8191]/40 text-xs font-sans focus:outline-hidden focus:ring-2 focus:ring-[#F26A3D]/30 resize-none leading-relaxed"
                    />
                  </div>
                ))}
              </div>

              {/* Add another thought button */}
              <div>
                <button
                  type="button"
                  onClick={handleAddThought}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-dashed border-[#E8E3D9] dark:border-[#262B36] bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#F26A3D] dark:hover:text-[#F26A3D] transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add another thought</span>
                </button>
              </div>
            </div>

            {/* Save Action Row */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E8E3D9] dark:border-[#262B36]">
              <div className="text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
                {voiceUsed && (
                  <span className="inline-flex items-center gap-1 text-[#F26A3D]">
                    <Mic className="w-3 h-3" /> Voice-assisted entry
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {editingReflection && (
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    className="px-4 py-2 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}

                {saveSuccess && (
                  <span className="flex items-center gap-1.5 text-xs text-[#2E9E6A] font-medium animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editingReflection ? 'Reflection updated' : 'Reflection saved'}</span>
                  </span>
                )}

                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F26A3D] text-white text-xs font-medium hover:bg-[#D4542B] disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{editingReflection ? 'Update Reflection' : 'Save Reflection'}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </form>

      {/* Voice Reflection Modal */}
      <VoiceReflectionModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onApplyTranscript={handleApplyVoice}
        initialTargetField={voiceTargetField}
        targetOptions={voiceTargetOptions}
      />
    </div>
  );
};
