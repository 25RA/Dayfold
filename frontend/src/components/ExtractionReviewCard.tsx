import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  Check,
  X,
  Edit2,
  Trash2,
  Plus,
  Sparkles,
  AlertCircle,
  ArrowLeft,
  Tag,
  ShieldAlert,
} from 'lucide-react';
import {
  ExtractedTask,
  ExtractedFixedCommitment,
  StructuredExtraction,
  ExtractedConflict,
} from '../store/useVoiceStore';

interface ExtractionReviewCardProps {
  extraction: StructuredExtraction;
  onConfirm: (confirmedExtraction: StructuredExtraction) => void;
  onBackToTranscript: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export const ExtractionReviewCard: React.FC<ExtractionReviewCardProps> = ({
  extraction,
  onConfirm,
  onBackToTranscript,
  onCancel,
  isSubmitting = false,
}) => {
  const [targetDate, setTargetDate] = useState<string>(extraction.target_date);
  const [targetDateLabel, setTargetDateLabel] = useState<string>(extraction.target_date_label);
  const [tasks, setTasks] = useState<ExtractedTask[]>(extraction.tasks || []);
  const [fixedCommitments, setFixedCommitments] = useState<ExtractedFixedCommitment[]>(
    extraction.fixed_commitments || []
  );
  const [preferences, setPreferences] = useState<string[]>(extraction.preferences || []);
  const [constraints, setConstraints] = useState<string[]>(extraction.constraints || []);
  const [conflicts, setConflicts] = useState<ExtractedConflict[]>(extraction.conflicts || []);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingCommitmentId, setEditingCommitmentId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(45);
  const [showAddTask, setShowAddTask] = useState(false);

  // Toggle quick target date (Today vs Tomorrow)
  const toggleDate = (isTomorrow: boolean) => {
    const today = new Date();
    const target = new Date();
    if (isTomorrow) {
      target.setDate(today.getDate() + 1);
    }
    const iso = target.toISOString().split('T')[0];
    const label = target.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    setTargetDate(iso);
    setTargetDateLabel(label);
  };

  const handleTaskTitleChange = (id: string, newTitle: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t))
    );
  };

  const handleTaskDurationChange = (id: string, duration: number) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, duration_minutes: duration, duration_needs_confirmation: false } : t
      )
    );
  };

  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleDeleteCommitment = (id: string) => {
    setFixedCommitments((prev) => prev.filter((fc) => fc.id !== id));
  };

  const handleCommitmentChange = (id: string, updates: Partial<ExtractedFixedCommitment>) => {
    setFixedCommitments((prev) =>
      prev.map((fc) => (fc.id === id ? { ...fc, ...updates } : fc))
    );
  };

  const handleAddNewTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const newTask: ExtractedTask = {
      id: 'task_' + Math.random().toString(36).substring(2, 9),
      title: newTaskTitle.trim(),
      duration_minutes: newTaskDuration,
      duration_needs_confirmation: false,
      priority: 3,
    };
    setTasks((prev) => [...prev, newTask]);
    setNewTaskTitle('');
    setShowAddTask(false);
  };

  const handleRemovePreference = (idx: number) => {
    setPreferences((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRemoveConstraint = (idx: number) => {
    setConstraints((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFinalSubmit = () => {
    const confirmed: StructuredExtraction = {
      ...extraction,
      target_date: targetDate,
      target_date_label: targetDateLabel,
      tasks,
      fixed_commitments: fixedCommitments,
      preferences,
      constraints,
      conflicts: [],
    };
    onConfirm(confirmed);
  };

  const durationPresets = [15, 30, 45, 60, 90, 120];
  const dateConflicts = conflicts.filter((c) => c.type === 'date_conflict');
  const otherConflicts = conflicts.filter((c) => c.type !== 'date_conflict');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#161A23] border border-[#E8E3D9] dark:border-[#262B36] shadow-2xl space-y-5 text-left custom-scrollbar"
    >
      {/* Header with Target Date Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8E3D9] dark:border-[#262B36] pb-3.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#F26A3D] font-bold block">
              Step 1 of 2: Review Extracted Schedule & Preferences
            </span>
            {extraction.extraction_source === 'gemini' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-mono">
                <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                Gemini AI ({extraction.model_name || 'gemini-3.6-flash'})
              </span>
            )}
            {extraction.fallback_used && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-mono">
                <AlertCircle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                Rule Fallback
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Calendar className="w-4 h-4 text-[#F26A3D]" />
            <h4 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
              {targetDateLabel}
            </h4>
          </div>
        </div>

        {/* Date Toggles & Close */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#1E2330] p-1 rounded-xl text-xs font-mono">
            <button
              type="button"
              onClick={() => toggleDate(false)}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                !targetDate.endsWith(
                  new Date(Date.now() + 86400000).toISOString().split('T')[0]
                )
                  ? 'bg-white dark:bg-[#12151C] text-[#C74E22] dark:text-[#FFA67F] font-semibold shadow-xs'
                  : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F]'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => toggleDate(true)}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                targetDate.endsWith(
                  new Date(Date.now() + 86400000).toISOString().split('T')[0]
                )
                  ? 'bg-white dark:bg-[#12151C] text-[#C74E22] dark:text-[#FFA67F] font-semibold shadow-xs'
                  : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F]'
              }`}
            >
              Tomorrow
            </button>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[#7B8191] hover:text-[#15181F] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E2330] transition-colors cursor-pointer"
            title="Close review"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fallback Notice Banner */}
      {extraction.fallback_used && (
        <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-[#2A1E14]/90 border border-amber-500/50 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="font-semibold text-amber-900 dark:text-amber-200">
              Deterministic Schedule Extraction Active
            </h5>
            <p className="text-amber-800 dark:text-amber-300 font-sans leading-relaxed text-[11px]">
              {extraction.fallback_reason || 'Deterministic pattern engine active. Extracted using standard schedule rules.'}
              <span className="block mt-0.5 text-amber-900/80 dark:text-amber-200/80 font-medium">
                Please review titles, durations, and commitments below before generating the plan.
              </span>
            </p>
          </div>
        </div>
      )}

      {/* 1. Date Discrepancy Conflict Banner */}
      {dateConflicts.map((dc, idx) => (
        <div
          key={`dc_${idx}`}
          className="p-4 rounded-xl bg-amber-50 dark:bg-[#2A1E14] border-2 border-amber-500/60 text-xs space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                Target Date Discrepancy
              </h5>
              <p className="text-amber-800 dark:text-amber-300 leading-relaxed font-sans">
                {dc.message}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1 sm:pl-7.5">
            <button
              type="button"
              onClick={() => {
                if (dc.spoken_date) {
                  setTargetDate(dc.spoken_date);
                  setTargetDateLabel(dc.spoken_date_label || dc.spoken_date);
                }
                setConflicts((prev) => prev.filter((c) => c !== dc));
              }}
              className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer text-left sm:text-center"
            >
              Use spoken date: {dc.spoken_date_label || dc.spoken_date} (Recommended)
            </button>
            <button
              type="button"
              onClick={() => {
                if (dc.interface_date) {
                  setTargetDate(dc.interface_date);
                  setTargetDateLabel(dc.interface_date_label || dc.interface_date);
                }
                setConflicts((prev) => prev.filter((c) => c !== dc));
              }}
              className="px-3.5 py-2 rounded-lg bg-white dark:bg-[#1A1E27] border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs transition-colors cursor-pointer"
            >
              Keep interface date: {dc.interface_date_label || dc.interface_date}
            </button>
          </div>
        </div>
      ))}

      {/* 2. Schedule & Wake Conflict Warning & Resolution Banner */}
      {otherConflicts.map((conflict, idx) => (
        <div
          key={`oc_${idx}`}
          className="p-4 rounded-xl bg-amber-50 dark:bg-[#2A1E14] border-2 border-amber-500/60 text-xs space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                Schedule Conflict Detected
              </h5>
              <p className="text-amber-800 dark:text-amber-300 leading-relaxed font-sans">
                {conflict.message ||
                  `Your ${conflict.commitment_title || 'commitment'} starts at ${conflict.commitment_start || 'start time'}, but your wake-up time is ${conflict.wake_up_time || 'set later'}.`}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1 sm:pl-7.5">
            <button
              type="button"
              onClick={() => {
                const wakeTime = conflict.suggested_wake_up || '5:30 AM';
                setPreferences((prev) => [
                  ...prev.filter((p) => !p.toLowerCase().includes('wake')),
                  `Wake up at ${wakeTime}`,
                ]);
                setConflicts((prev) => prev.filter((c) => c !== conflict));
              }}
              className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer text-left sm:text-center"
            >
              Wake up at {conflict.suggested_wake_up || '5:30 AM'} before {conflict.commitment_title || 'commitment'} (Recommended)
            </button>
            <button
              type="button"
              onClick={() => {
                setConflicts((prev) => prev.filter((c) => c !== conflict));
              }}
              className="px-3.5 py-2 rounded-lg bg-white dark:bg-[#1A1E27] border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs transition-colors cursor-pointer"
            >
              Keep {conflict.wake_up_time || '7 AM'} & Proceed
            </button>
          </div>
        </div>
      ))}

      {/* Clarification notices if any */}
      {extraction.clarification_required && extraction.clarification_required.length > 0 && (
        <div className="p-3 rounded-xl bg-[#FFF8EB] dark:bg-[#2A2318] border border-[#F5B04C]/40 text-xs text-[#8A5B14] dark:text-[#FDD58E] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F5B04C]" />
          <div className="space-y-0.5">
            <span className="font-semibold block">Attention Needed:</span>
            {extraction.clarification_required.map((notice, idx) => (
              <p key={idx} className="text-[11px] opacity-90 leading-relaxed">
                • {notice}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Section 1: Fixed Commitments (Appointments, Classes, Temple) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-[#5A6070] dark:text-[#A0A8B6]">
          <span className="flex items-center gap-1.5 font-bold">
            <Clock className="w-3.5 h-3.5 text-[#1B7F83]" />
            Fixed Commitments ({fixedCommitments.length})
          </span>
          <span className="text-[10px] text-[#7B8191]">Fixed Time Windows</span>
        </div>

        {fixedCommitments.length === 0 ? (
          <p className="text-xs italic text-[#7B8191] dark:text-[#636C7E] px-2 py-1">
            No fixed calendar appointments or classes detected.
          </p>
        ) : (
          <div className="space-y-2">
            {fixedCommitments.map((fc) => {
              const isEditing = editingCommitmentId === fc.id;
              return (
                <div
                  key={fc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] text-xs"
                >
                  {isEditing ? (
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={fc.title}
                        onChange={(e) => handleCommitmentChange(fc.id, { title: e.target.value })}
                        className="flex-1 min-w-[120px] px-2.5 py-1 rounded bg-white dark:bg-[#161922] border border-[#E8E3D9] dark:border-[#262B36] text-xs"
                      />
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <input
                          type="time"
                          value={fc.start_time}
                          onChange={(e) => handleCommitmentChange(fc.id, { start_time: e.target.value })}
                          className="px-2 py-0.5 rounded bg-white dark:bg-[#161922] border border-[#E8E3D9] dark:border-[#262B36]"
                        />
                        <span>–</span>
                        <input
                          type="time"
                          value={fc.end_time}
                          onChange={(e) =>
                            handleCommitmentChange(fc.id, {
                              end_time: e.target.value,
                              time_needs_confirmation: false,
                            })
                          }
                          className="px-2 py-0.5 rounded bg-white dark:bg-[#161922] border border-[#E8E3D9] dark:border-[#262B36]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingCommitmentId(null)}
                        className="p-1 rounded bg-[#1B7F83] text-white"
                        title="Done"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-[#1B7F83]" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#15181F] dark:text-white">
                            {fc.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingCommitmentId(fc.id)}
                            className="p-0.5 text-[#7B8191] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer"
                            title="Edit commitment"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-[11px] font-mono text-[#1B7F83] dark:text-[#28A5AA]">
                          {fc.start_time} — {fc.end_time} ({fc.duration_minutes}m)
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {fc.time_needs_confirmation && !isEditing && (
                      <span className="text-[10px] font-mono bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md">
                        Estimated End
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteCommitment(fc.id)}
                      className="p-1 rounded-md text-[#7B8191] hover:text-[#D6453D] transition-colors cursor-pointer"
                      title="Remove commitment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Flexible Tasks */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-[#5A6070] dark:text-[#A0A8B6]">
          <span className="flex items-center gap-1.5 font-bold">
            <Tag className="w-3.5 h-3.5 text-[#F26A3D]" />
            Flexible Activities & Tasks ({tasks.length})
          </span>
          <button
            type="button"
            onClick={() => setShowAddTask(!showAddTask)}
            className="text-[11px] text-[#C74E22] dark:text-[#F26A3D] hover:underline flex items-center gap-1 cursor-pointer font-sans"
          >
            <Plus className="w-3 h-3" />
            <span>Add Item</span>
          </button>
        </div>

        {/* Add Item Inline Form */}
        {showAddTask && (
          <form
            onSubmit={handleAddNewTask}
            className="p-3 rounded-xl bg-[#FFF5F0] dark:bg-[#2A1710] border border-[#F26A3D]/40 space-y-2 text-xs"
          >
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="e.g. 45-minute reading or study session..."
              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#161922] border border-[#E8E3D9] dark:border-[#262B36] text-[#15181F] dark:text-white"
              autoFocus
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-[#5A6070]">Duration:</span>
                <select
                  value={newTaskDuration}
                  onChange={(e) => setNewTaskDuration(Number(e.target.value))}
                  className="px-2 py-1 rounded bg-white dark:bg-[#161922] border border-[#E8E3D9] dark:border-[#262B36] text-xs"
                >
                  {durationPresets.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddTask(false)}
                  className="px-2.5 py-1 text-xs text-[#7B8191]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg bg-[#F26A3D] text-white font-semibold text-xs cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          </form>
        )}

        {tasks.length === 0 ? (
          <p className="text-xs italic text-[#7B8191] dark:text-[#636C7E] px-2 py-1">
            No flexible tasks detected.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const isEditing = editingTaskId === task.id;
              return (
                <div
                  key={task.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:px-4 rounded-xl bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] text-xs hover:border-[#F26A3D]/30 transition-colors"
                >
                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => handleTaskTitleChange(task.id, e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-[#161922] border border-[#E8E3D9] dark:border-[#262B36] text-xs text-[#15181F] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F26A3D]"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setEditingTaskId(null)}
                        className="p-1.5 rounded-lg bg-[#1B7F83] text-white hover:bg-[#155F62] transition-colors"
                        title="Done"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#F26A3D] shrink-0" />
                      <span className="font-semibold text-sm text-[#15181F] dark:text-white truncate">
                        {task.title}
                      </span>
                      {task.constraint && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F26A3D]/10 text-[#C74E22] dark:text-[#FFA67F] shrink-0">
                          {task.constraint}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingTaskId(task.id)}
                        className="p-1 text-[#7B8191] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer shrink-0"
                        title="Edit title"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Duration Selector & Delete */}
                  <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={task.duration_minutes}
                        onChange={(e) =>
                          handleTaskDurationChange(task.id, Number(e.target.value))
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium border cursor-pointer ${
                          task.duration_needs_confirmation
                            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 ring-2 ring-amber-400/30'
                            : 'border-[#E8E3D9] dark:border-[#262B36] bg-white dark:bg-[#161922] text-[#15181F] dark:text-white'
                        }`}
                        title={
                          task.duration_needs_confirmation
                            ? 'Estimated duration — please confirm or change'
                            : 'Task duration'
                        }
                      >
                        {(durationPresets.includes(task.duration_minutes)
                          ? durationPresets
                          : [...durationPresets, task.duration_minutes].sort((a, b) => a - b)
                        ).map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>

                      {task.duration_needs_confirmation ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-medium whitespace-nowrap">
                          Needs check
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-[#7B8191] dark:text-[#A0A8B6] whitespace-nowrap">
                          Confirmed
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 rounded-lg text-[#7B8191] hover:text-[#D6453D] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer ml-1"
                      title="Remove task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Preferences & Constraints */}
      {(preferences.length > 0 || constraints.length > 0) && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] text-xs space-y-2.5">
          {preferences.length > 0 && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A6070] dark:text-[#A0A8B6] font-bold block mb-1">
                Extracted Preferences
              </span>
              <div className="flex flex-wrap gap-1.5">
                {preferences.map((p, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#161922] border border-[#E8E3D9] dark:border-[#262B36] text-[11px] text-[#15181F] dark:text-[#ECEFF4]"
                  >
                    <span>✓ {p}</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePreference(idx)}
                      className="text-[#7B8191] hover:text-[#D6453D] transition-colors cursor-pointer"
                      title="Remove preference"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {constraints.length > 0 && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#5A6070] dark:text-[#A0A8B6] font-bold block mb-1">
                Scheduling Constraints
              </span>
              <div className="flex flex-wrap gap-1.5">
                {constraints.map((c, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF5F0] dark:bg-[#2A1710] border border-[#F26A3D]/30 text-[11px] text-[#C74E22] dark:text-[#FFA67F]"
                  >
                    <span>⏱ {c}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveConstraint(idx)}
                      className="text-[#7B8191] hover:text-[#D6453D] transition-colors cursor-pointer"
                      title="Remove constraint"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#E8E3D9] dark:border-[#262B36]">
        <button
          type="button"
          onClick={onBackToTranscript}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Edit Spoken Words</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3.5 py-2 rounded-xl text-xs font-mono text-[#7B8191] hover:text-[#15181F] dark:hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={
              isSubmitting ||
              conflicts.length > 0 ||
              (tasks.length === 0 && fixedCommitments.length === 0)
            }
            title={
              conflicts.length > 0
                ? 'Please resolve the conflicts above to proceed'
                : 'Confirm and unfold schedule'
            }
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white font-semibold text-xs tracking-wider uppercase hover:opacity-95 shadow-md transition-opacity cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Computing Plan...' : 'Confirm & Unfold Schedule'}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};

