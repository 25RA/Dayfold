import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Sparkles,
  Brain,
  History,
  PenTool,
  Lock,
} from 'lucide-react';
import { DailyReflectionEditor } from '../components/reflection/DailyReflectionEditor';
import { ReflectionHistoryList } from '../components/reflection/ReflectionHistoryList';
import { WeeklyReviewCard } from '../components/reflection/WeeklyReviewCard';
import { PatternDiscoveryCard } from '../components/reflection/PatternDiscoveryCard';

type ReflectionTab = 'journal' | 'weekly' | 'patterns' | 'history';

export const ReflectionPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReflectionTab>('journal');
  const [editingReflection, setEditingReflection] = useState<{ id: string; date: string } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const handleSelectDateToEdit = (dateStr: string, reflectionId: string) => {
    setEditingReflection({ id: reflectionId, date: dateStr });
    setActiveTab('journal');
  };

  const handleCancelEdit = () => {
    setEditingReflection(null);
  };

  const handleSaved = () => {
    setEditingReflection(null);
    setRefreshTrigger((prev) => prev + 1);
  };

  const tabs: { id: ReflectionTab; label: string; icon: any; badge?: string }[] = [
    { id: 'journal', label: 'Daily Journal', icon: PenTool },
    { id: 'weekly', label: 'Weekly Review', icon: Sparkles },
    { id: 'patterns', label: 'Pattern Discovery', icon: Brain },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="min-h-full px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-6">
      {/* Top Editorial Banner */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E8E3D9] dark:border-[#262B36] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#F26A3D] font-semibold">
              Self-Awareness & Learning
            </span>
            <span className="text-[#E8E3D9] dark:text-[#262B36]">•</span>
            <span className="flex items-center gap-1 text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
              <Lock className="w-3 h-3 text-[#1B7F83]" /> Private & Optional
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-medium text-[#15181F] dark:text-[#ECEFF4] tracking-tight">
            Dayfold Reflection
          </h1>
          <p className="text-xs sm:text-sm text-[#5A6070] dark:text-[#A0A8B6] mt-1 max-w-xl">
            Turn every day into learning. Reflect on wins, notice friction without judgment, and uncover evidence-backed productivity patterns.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-[#F4F1EB] dark:bg-[#1A1E27] rounded-xl border border-[#E8E3D9] dark:border-[#262B36] self-start sm:self-auto overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-[#262B36] text-[#F26A3D] dark:text-[#F26A3D] font-semibold shadow-xs'
                    : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab View */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'journal' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2">
                <DailyReflectionEditor
                  initialDate={editingReflection ? editingReflection.date : undefined}
                  editingReflection={editingReflection}
                  onCancelEdit={handleCancelEdit}
                  onSaved={handleSaved}
                />
              </div>
              <div className="lg:col-span-1">
                <ReflectionHistoryList
                  onSelectDateToEdit={handleSelectDateToEdit}
                  refreshTrigger={refreshTrigger}
                />
              </div>
            </div>
          )}

          {activeTab === 'weekly' && (
            <div className="max-w-3xl mx-auto">
              <WeeklyReviewCard />
            </div>
          )}

          {activeTab === 'patterns' && (
            <div className="max-w-3xl mx-auto">
              <PatternDiscoveryCard />
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-3xl mx-auto">
              <ReflectionHistoryList
                onSelectDateToEdit={handleSelectDateToEdit}
                refreshTrigger={refreshTrigger}
              />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default ReflectionPage;

