import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  Mic,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../../lib/api';
import { getDisplayableThoughts } from '../../lib/reflectionUtils';

export interface ReflectionRecord {
  id: string;
  user_id: string;
  target_date: string;
  went_well: string;
  remained_unfinished: string;
  do_differently: string;
  additional_notes?: string | null;
  voice_used: boolean;
  created_at: string;
  updated_at: string;
}

interface ReflectionHistoryListProps {
  onSelectDateToEdit?: (dateStr: string, reflectionId: string) => void;
  refreshTrigger?: number;
}

export const ReflectionHistoryList: React.FC<ReflectionHistoryListProps> = ({
  onSelectDateToEdit,
  refreshTrigger,
}) => {
  const [reflections, setReflections] = useState<ReflectionRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ReflectionRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/reflections?limit=50');
      setReflections(res.data);
      if (res.data.length > 0 && !expandedId) {
        setExpandedId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch reflection history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshTrigger]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/reflections/${deleteTarget.id}`);
      setReflections((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete reflection:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FFF1EB] dark:bg-[#2A1710] flex items-center justify-center text-[#F26A3D]">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
              Reflection History
            </h3>
            <p className="text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
              {reflections.length} {reflections.length === 1 ? 'reflection' : 'reflections'} saved
            </p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-[#E8E3D9]/60 dark:divide-[#262B36]/60">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-[#7B8191]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs font-mono">Loading reflections...</span>
          </div>
        ) : reflections.length === 0 ? (
          <div className="py-12 px-6 text-center text-[#7B8191] dark:text-[#A0A8B6] space-y-2">
            <p className="font-serif text-base text-[#15181F] dark:text-[#ECEFF4]">
              No reflections recorded yet
            </p>
            <p className="text-xs max-w-sm mx-auto">
              Your daily entries will appear here. Reflect each day to build self-awareness and uncover recurring patterns.
            </p>
          </div>
        ) : (
          reflections.map((r) => {
            const isExpanded = expandedId === r.id;
            const parsedDate = parseISO(r.target_date);
            return (
              <div key={r.id} className="p-5 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                <div
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-base font-medium text-[#15181F] dark:text-[#ECEFF4]">
                      {format(parsedDate, 'EEEE, MMMM d, yyyy')}
                    </span>
                    {r.voice_used && (
                      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FFF1EB] dark:bg-[#2A1710] text-[#F26A3D]">
                        <Mic className="w-3 h-3" /> Voice
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDateToEdit?.(r.target_date, r.id);
                      }}
                      className="p-1.5 rounded-lg text-[#7B8191] hover:text-[#F26A3D] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                      title="Edit this reflection"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(r);
                      }}
                      className="p-1.5 rounded-lg text-[#7B8191] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      title="Delete this reflection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="text-[#7B8191]">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 space-y-3 pt-3 border-t border-dashed border-[#E8E3D9] dark:border-[#262B36] text-xs leading-relaxed"
                    >
                      <div>
                        <span className="font-semibold text-[#1B7F83] block mb-0.5">
                          What went well:
                        </span>
                        <p className="text-[#15181F] dark:text-[#ECEFF4] whitespace-pre-wrap pl-2 border-l-2 border-[#1B7F83]/40">
                          {r.went_well}
                        </p>
                      </div>

                      <div>
                        <span className="font-semibold text-[#F26A3D] block mb-0.5">
                          What remained unfinished:
                        </span>
                        <p className="text-[#15181F] dark:text-[#ECEFF4] whitespace-pre-wrap pl-2 border-l-2 border-[#F26A3D]/40">
                          {r.remained_unfinished}
                        </p>
                      </div>

                      <div>
                        <span className="font-semibold text-[#D98A1F] block mb-0.5">
                          Do differently tomorrow:
                        </span>
                        <p className="text-[#15181F] dark:text-[#ECEFF4] whitespace-pre-wrap pl-2 border-l-2 border-[#D98A1F]/40">
                          {r.do_differently}
                        </p>
                      </div>

                      {r.additional_notes && (() => {
                        const thoughts = getDisplayableThoughts(r.additional_notes);
                        if (thoughts.length === 0) return null;
                        return (
                          <div>
                            <span className="font-semibold text-[#7B8191] dark:text-[#A0A8B6] block mb-1">
                              Additional thoughts:
                            </span>
                            <div className="space-y-1.5 pl-2 border-l-2 border-[#7B8191]/30">
                              {thoughts.map((note, idx) => (
                                <p key={idx} className="text-[#5A6070] dark:text-[#A0A8B6] italic whitespace-pre-wrap">
                                  {thoughts.length > 1 ? `• ${note}` : note}
                                </p>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-xl p-6 space-y-4"
          >
            <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
                Delete Reflection?
              </h4>
              <p className="text-xs text-[#7B8191] dark:text-[#A0A8B6] mt-1">
                Are you sure you want to delete your reflection for{' '}
                <strong className="text-[#15181F] dark:text-white">
                  {format(parseISO(deleteTarget.target_date), 'MMMM d, yyyy')}
                </strong>
                ? This action removes it from your history and pattern analysis.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-xs text-[#5A6070] dark:text-[#A0A8B6] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

