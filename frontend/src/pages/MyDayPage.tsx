import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Play,
  ArrowRight,
} from 'lucide-react';
import { format, addDays, isSameDay } from 'date-fns';
import api from '../lib/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { useVoiceStore, StructuredExtraction } from '../store/useVoiceStore';
import { TimelineCanvas, TimelineBlock } from '../components/TimelineCanvas';
import { VoiceOrb } from '../components/VoiceOrb';
import { ApprovalCard, PendingActionData } from '../components/ApprovalCard';
import { DatePickerPopover } from '../components/DatePickerPopover';

interface TaskItem {
  id: string;
  title: string;
  priority: number;
  status: string;
  estimate_minutes?: number;
  deadline_at?: string;
}

const getLocalDatePrefix = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const MyDayPage: React.FC = () => {
  const { lens, terms, selectedDate, setSelectedDate } = useWorkspaceStore();
  const { setState, speak } = useVoiceStore();

  const [blocks, setBlocks] = useState<TimelineBlock[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingActionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlanning, setIsPlanning] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickEstimate, setQuickEstimate] = useState(60);
  const [agentReply, setAgentReply] = useState<string | null>(null);
  const [operatingStartHour, setOperatingStartHour] = useState<number>(9);
  const [operatingEndHour, setOperatingEndHour] = useState<number>(18);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Fetch today's commitments, plans, and pending actions
  const fetchDayData = async () => {
    setIsLoading(true);
    try {
      // 0. Fetch user preferences for operating hours
      try {
        const prefRes = await api.get('/users/me/preferences');
        if (prefRes.data?.working_hours?.monday) {
          const wh = prefRes.data.working_hours.monday;
          if (wh.start_hour !== undefined) setOperatingStartHour(wh.start_hour);
          if (wh.end_hour !== undefined) setOperatingEndHour(wh.end_hour);
        }
      } catch (e) {
        // use defaults
      }
      // 1. Fetch tasks
      const tasksRes = await api.get('/tasks?status=todo');
      setTasks(tasksRes.data);

      // 2. Fetch events
      const eventsRes = await api.get('/calendar/events');
      const events = eventsRes.data;

      // 3. Fetch latest active plan
      const plansRes = await api.get('/plans');
      let planBlocks: TimelineBlock[] = [];

      const selectedDatePrefix = getLocalDatePrefix(selectedDate);

      if (plansRes.data && plansRes.data.length > 0) {
        const matchingPlanSummary =
          plansRes.data.find((p: any) => {
            if (p.inputs?.target_date === selectedDatePrefix) return true;
            try {
              const d = new Date(p.horizon_start);
              const dYear = d.getFullYear();
              const dMonth = String(d.getMonth() + 1).padStart(2, '0');
              const dDay = String(d.getDate()).padStart(2, '0');
              return `${dYear}-${dMonth}-${dDay}` === selectedDatePrefix;
            } catch {
              return false;
            }
          }) || plansRes.data[0];
        try {
          const planDetailRes = await api.get(`/plans/${matchingPlanSummary.id}`);
          const detailedPlan = planDetailRes.data;
          if (detailedPlan.blocks) {
            planBlocks = detailedPlan.blocks.map((b: any) => ({
              id: b.id,
              kind: b.kind,
              title: b.title,
              starts_at: b.starts_at,
              ends_at: b.ends_at,
              task_id: b.task_id,
              rationale: b.rationale,
              pinned: b.pinned,
              color: b.color,
            }));
          }
        } catch (err) {
          console.error('Error fetching plan detail:', err);
        }
      }

      // Filter events for selectedDate
      const eventsForDate = events.filter((e: any) => {
        try {
          const d = new Date(e.starts_at);
          const dYear = d.getFullYear();
          const dMonth = String(d.getMonth() + 1).padStart(2, '0');
          const dDay = String(d.getDate()).padStart(2, '0');
          return `${dYear}-${dMonth}-${dDay}` === selectedDatePrefix;
        } catch {
          return true;
        }
      });

      const fixedBlocks: TimelineBlock[] = eventsForDate.map((e: any) => ({
        id: e.id,
        kind: 'fixed_event',
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        pinned: true,
      }));

      // Filter planBlocks for selectedDate
      const planBlocksForDate = planBlocks.filter((b: any) => {
        try {
          const d = new Date(b.starts_at);
          const dYear = d.getFullYear();
          const dMonth = String(d.getMonth() + 1).padStart(2, '0');
          const dDay = String(d.getDate()).padStart(2, '0');
          return `${dYear}-${dMonth}-${dDay}` === selectedDatePrefix;
        } catch {
          return true;
        }
      });

      // Deduplicate blocks
      const combined = [...fixedBlocks, ...planBlocksForDate.filter((b) => b.kind !== 'fixed_event')];
      setBlocks(combined);

      // Auto-expand operatingStartHour if any early commitments exist (e.g. 6 AM temple visit)
      if (combined.length > 0) {
        const earliestHour = combined.reduce((acc, b) => {
          try {
            return Math.min(acc, new Date(b.starts_at).getHours());
          } catch {
            return acc;
          }
        }, 9);
        if (earliestHour < 9) {
          setOperatingStartHour(earliestHour);
        }
      }

      // 4. Fetch pending actions
      const actionsRes = await api.get(`/actions/pending?target_date=${selectedDatePrefix}`);
      if (actionsRes.data && actionsRes.data.length > 0) {
        setPendingAction(actionsRes.data[0]);
      } else {
        setPendingAction(null);
      }
    } catch (err) {
      console.error('Failed to load day data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDayData();
  }, [selectedDate, lens]);

  // Handle plan generation trigger
  const handleGeneratePlan = async () => {
    setIsPlanning(true);
    setState('thinking');
    try {
      const res = await api.post('/plans/generate', {
        horizon_hours: 10,
        is_simulation: false,
        lens: lens === 'all' ? undefined : lens,
      });

      const planData = res.data;
      if (planData.blocks && planData.blocks.length > 0) {
        const newBlocks: TimelineBlock[] = planData.blocks.map((b: any) => ({
          id: b.id,
          kind: b.kind,
          title: b.title,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          task_id: b.task_id,
          rationale: b.rationale,
          pinned: b.pinned,
        }));
        setBlocks(newBlocks);
      }

      // Refresh actions
      const selectedDatePrefix = getLocalDatePrefix(selectedDate);
      const actionsRes = await api.get(`/actions/pending?target_date=${selectedDatePrefix}`);
      if (actionsRes.data && actionsRes.data.length > 0) {
        setPendingAction(actionsRes.data[0]);
        setState('awaiting_approval');
        speak('I have drafted your schedule. Please inspect the proposal on your timeline and approve when ready.');
      } else {
        setState('idle');
        if (!planData.blocks || planData.blocks.length === 0) {
          speak('No tasks could be scheduled. Add tasks or check your available hours.');
        }
      }
    } catch (err: any) {
      console.error('Failed to generate plan:', err);
      setState('error');
    } finally {
      setIsPlanning(false);
    }
  };

  // Handle quick task creation
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    try {
      await api.post('/tasks', {
        title: quickTitle.trim(),
        estimate_minutes: quickEstimate,
        priority: 2,
        source: 'ui',
      });
      setQuickTitle('');
      fetchDayData();
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  };

  // Handle task complete
  const handleCompleteTask = async (taskId: string) => {
    try {
      await api.post(`/tasks/${taskId}/complete`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  };

  // Handle AI Agent Message (from voice orb or text)
  const handleAgentMessage = async (msgText: string) => {
    setState('thinking');
    setAgentReply(null);
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const res = await api.post('/agent/messages', { message: msgText, timezone: userTz });
      const data = res.data;
      setAgentReply(data.reply);

      // Refresh day data
      await fetchDayData();

      if (data.pending_action_id) {
        setState('awaiting_approval');
      } else {
        setState('speaking');
      }

      if (data.reply) {
        speak(data.reply);
      }
    } catch (err: any) {
      console.error('Agent message error:', err);
      setState('error');
    }
  };

  // Handle Confirmed Extracted Plan (from ExtractionReviewCard)
  const handlePlanExtracted = async (extraction: StructuredExtraction) => {
    setState('thinking');
    setAgentReply(null);
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const res = await api.post('/agent/plan-extracted', {
        target_date: extraction.target_date,
        tasks: extraction.tasks,
        fixed_commitments: extraction.fixed_commitments,
        preferences: extraction.preferences,
        constraints: extraction.constraints,
        conflicts: extraction.conflicts,
        lens: lens === 'all' ? undefined : lens,
        timezone: userTz,
      });
      const data = res.data;
      setAgentReply(data.reply);

      // If target date is tomorrow or a specific date, update selectedDate so timeline displays tomorrow!
      if (extraction.target_date) {
        const [y, m, d] = extraction.target_date.split('-').map(Number);
        const newDate = new Date(y, m - 1, d);
        setSelectedDate(newDate);
      }

      await fetchDayData();

      if (data.pending_action_id) {
        setState('awaiting_approval');
      } else {
        setState('speaking');
      }

      if (data.reply) {
        speak(data.reply);
      }
    } catch (err: any) {
      console.error('Failed to plan extracted items:', err);
      setState('error');
    }
  };

  // Handle action approval
  const handleApproveAction = async (actionId: string, payloadHash: string) => {
    setState('executing');
    try {
      await api.post(`/actions/${actionId}/approve`, { payload_hash: payloadHash });
      setPendingAction((prev) => (prev ? { ...prev, status: 'succeeded' } : null));
      setState('speaking');
      speak('Plan approved and committed to your day.');
      await fetchDayData();
    } catch (err) {
      setState('error');
      throw err;
    }
  };

  // Handle action rejection
  const handleRejectAction = async (actionId: string) => {
    try {
      await api.post(`/actions/${actionId}/reject`);
      setPendingAction(null);
      setState('idle');
    } catch (err) {
      setState('error');
      throw err;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Top Banner / Hero greeting */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#F26A3D]">
            {terms.focusBlockName} Workflow
          </span>
          <h2 className="font-serif text-3xl md:text-4xl font-normal text-[#15181F] dark:text-[#ECEFF4] mt-1">
            {terms.scheduleAction}
          </h2>
          <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1">
            Deterministic plan generated for your {lens} profile commitments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Enhanced Date Navigation Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-[#151922] p-1.5 rounded-2xl border border-[#E8E3D9] dark:border-[#262B36] shadow-xs">
            {/* Previous / Next Day Arrows */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2330] text-[#5A6070] dark:text-[#A0A8B6] transition-colors cursor-pointer"
                title="Previous day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1E2330] text-[#5A6070] dark:text-[#A0A8B6] transition-colors cursor-pointer"
                title="Next day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="h-4 w-[1px] bg-[#E8E3D9] dark:border-[#262B36] mx-0.5" />

            {/* Quick Action: Today & Tomorrow */}
            <div className="flex items-center gap-1 font-mono text-xs">
              <button
                type="button"
                onClick={() => setSelectedDate(new Date())}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  isSameDay(selectedDate, new Date())
                    ? 'bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#FFA67F] font-semibold border border-[#F26A3D]/30'
                    : 'text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-[#1E2330]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setSelectedDate(tomorrow);
                }}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  isSameDay(selectedDate, addDays(new Date(), 1))
                    ? 'bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#FFA67F] font-semibold border border-[#F26A3D]/30'
                    : 'text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-[#1E2330]'
                }`}
              >
                Tomorrow
              </button>
            </div>

            <div className="h-4 w-[1px] bg-[#E8E3D9] dark:border-[#262B36] mx-0.5" />

            {/* Calendar Date Picker Interactive Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDatePicker((prev) => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] hover:border-[#F26A3D]/60 transition-colors cursor-pointer"
                title="Open calendar picker"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-[#F26A3D]" />
                <span className="font-serif text-xs md:text-sm font-medium text-[#15181F] dark:text-[#ECEFF4] pr-1">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </span>
              </button>

              {showDatePicker && (
                <DatePickerPopover
                  selectedDate={selectedDate}
                  onSelectDate={(date) => {
                    setSelectedDate(date);
                    setShowDatePicker(false);
                  }}
                  onClose={() => setShowDatePicker(false)}
                />
              )}
            </div>
          </div>

          <button
            onClick={fetchDayData}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-[#5A6070] dark:text-[#A0A8B6]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleGeneratePlan}
            disabled={isPlanning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white font-semibold text-xs uppercase tracking-wider hover:opacity-90 shadow-sm transition-opacity cursor-pointer"
          >
            {isPlanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Computing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Unfold Schedule</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Pending Action Banner if proposal exists */}
      <AnimatePresence>
        {pendingAction && (
          <ApprovalCard
            action={pendingAction}
            onApprove={handleApproveAction}
            onReject={handleRejectAction}
          />
        )}
      </AnimatePresence>

      {/* Agent Response banner if recently spoken */}
      {agentReply && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-gradient-to-r from-[#FFF1EB] to-white dark:from-[#2A1710] dark:to-[#12151C] border border-[#F26A3D]/30 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#F26A3D] shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-[#F26A3D] font-bold block">
                Dayfold Assistant
              </span>
              <p className="text-sm text-[#15181F] dark:text-[#ECEFF4] mt-1">{agentReply}</p>
            </div>
          </div>
          <button
            onClick={() => setAgentReply(null)}
            className="text-xs text-[#5A6070] hover:text-[#15181F] dark:hover:text-white"
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* Main Grid: TimelineCanvas on left, Tasks & Voice on right */}
      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: TimelineCanvas */}
        <div className="lg:col-span-8 space-y-6">
          <TimelineCanvas
            blocks={blocks}
            date={selectedDate}
            startHour={operatingStartHour}
            endHour={operatingEndHour}
          />
        </div>

        {/* Right Column: Voice Orb Dock & Open Tasks */}
        <div className="lg:col-span-4 space-y-6">
          {/* Voice Orb Interaction Card */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col items-center text-center overflow-hidden w-full">
            <h4 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4] mb-1">
              Voice Planning Dock
            </h4>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mb-4">
              Tap the orb to speak, or type your commitments directly.
            </p>

            <VoiceOrb
              onSendMessage={handleAgentMessage}
              onPlanExtracted={handlePlanExtracted}
              size="md"
            />
          </div>

          {/* Quick Task Creation */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-5 shadow-sm">
            <h4 className="text-xs font-mono uppercase tracking-wider text-[#5A6070] dark:text-[#A0A8B6] mb-3">
              Quick Add {terms.taskSingular}
            </h4>
            <form onSubmit={handleQuickAdd} className="space-y-3">
              <input
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder="e.g. DBMS Normalization Exercise..."
                className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40"
              />
              <div className="flex items-center justify-between gap-2">
                <select
                  value={quickEstimate}
                  onChange={(e) => setQuickEstimate(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-lg text-[#5A6070] dark:text-[#A0A8B6]"
                >
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                  <option value={120}>120 min</option>
                  <option value={180}>180 min</option>
                </select>

                <button
                  type="submit"
                  disabled={!quickTitle.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#15181F] dark:bg-white text-white dark:text-black hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>
          </div>

          {/* Open Commitments List */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono uppercase tracking-wider text-[#5A6070] dark:text-[#A0A8B6]">
                {terms.taskPlural} ({tasks.length})
              </h4>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] bg-slate-50/50 dark:bg-[#1A1E27]/50 text-xs hover:border-[#F26A3D]/40 transition-colors"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      className="w-4 h-4 rounded border border-slate-400 hover:bg-green-500 hover:border-green-500 transition-colors shrink-0"
                      title="Mark as done"
                    />
                    <span className="truncate font-medium text-[#15181F] dark:text-[#ECEFF4]">
                      {task.title}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-[#5A6070] dark:text-[#A0A8B6] shrink-0 ml-2">
                    {task.estimate_minutes ? `${task.estimate_minutes}m` : '60m'}
                  </span>
                </div>
              ))}

              {tasks.length === 0 && (
                <p className="text-xs text-[#7B8191] text-center py-4 italic">
                  No pending {terms.taskPlural.toLowerCase()}. Add one above or tell Dayfold.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

