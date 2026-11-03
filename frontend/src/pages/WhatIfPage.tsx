import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldCheck,
  Undo2,
  Play,
  Eye,
  SplitSquareHorizontal,
  Layers,
  Info,
} from 'lucide-react';
import api from '../lib/api';
import { TimelineCanvas, TimelineBlock } from '../components/TimelineCanvas';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

interface TaskOption {
  id: string;
  title: string;
  deadline_at?: string;
  estimate_minutes?: number;
}

export const WhatIfPage: React.FC = () => {
  const { lens, terms } = useWorkspaceStore();
  const [simulationType, setSimulationType] = useState<'emergency' | 'deadline' | 'hours'>('emergency');

  // Scenarios state
  const [emergencyTitle, setEmergencyTitle] = useState('Urgent Client Sync');
  const [emergencyDuration, setEmergencyDuration] = useState(90);
  const [emergencyStartOffsetHours, setEmergencyStartOffsetHours] = useState(1);

  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [advanceHours, setAdvanceHours] = useState(4);

  const [hoursReduced, setHoursReduced] = useState(2);

  // Schedules state
  const [baselineBlocks, setBaselineBlocks] = useState<TimelineBlock[]>([]);
  const [simulatedBlocks, setSimulatedBlocks] = useState<TimelineBlock[]>([]);
  const [unscheduledTasks, setUnscheduledTasks] = useState<any[]>([]);

  // Synchronized scroll state
  const [sharedScrollTop, setSharedScrollTop] = useState<number | undefined>(undefined);
  const isSyncing = useRef(false);

  const handleSyncScroll = (top: number) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    setSharedScrollTop(top);
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  // UI views & loading
  const [viewMode, setViewMode] = useState<'comparison' | 'simulated_only' | 'baseline_only'>('comparison');
  const [isSimulating, setIsSimulating] = useState(false);
  const [hasSimulated, setHasSimulated] = useState(false);
  const [metrics, setMetrics] = useState<{
    capacity: number;
    scheduled: number;
    displacedCount: number;
    baselineScheduled: number;
  } | null>(null);

  // Fetch baseline data on mount & when lens changes
  useEffect(() => {
    const fetchBaseline = async () => {
      try {
        const tasksQuery = lens === 'all' ? '/tasks?status=todo' : `/tasks?status=todo&lens=${lens}`;
        const [tasksRes, plansRes, eventsRes] = await Promise.all([
          api.get(tasksQuery),
          api.get('/plans'),
          api.get('/calendar/events'),
        ]);

        if (tasksRes.data && tasksRes.data.length > 0) {
          setTasks(tasksRes.data);
          setSelectedTaskId(tasksRes.data[0].id);
        } else {
          setTasks([]);
          setSelectedTaskId('');
        }

        const events = eventsRes.data || [];
        const fixedBlocks: TimelineBlock[] = events.map((e: any) => ({
          id: e.id,
          kind: 'fixed_event',
          title: e.title,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          pinned: true,
        }));

        let planBlocks: TimelineBlock[] = [];
        if (plansRes.data && plansRes.data.length > 0) {
          const latestPlan = plansRes.data[0];
          const planDetail = await api.get(`/plans/${latestPlan.id}`);
          if (planDetail.data?.blocks) {
            planBlocks = planDetail.data.blocks.map((b: any) => ({
              id: b.id,
              kind: b.kind,
              title: b.title,
              starts_at: b.starts_at,
              ends_at: b.ends_at,
              task_id: b.task_id,
              rationale: b.rationale,
              pinned: b.pinned,
            }));
          }
        }

        setBaselineBlocks([...fixedBlocks, ...planBlocks.filter((b) => b.kind !== 'fixed_event')]);
      } catch (err) {
        console.error('Failed to load baseline what-if data:', err);
      }
    };

    fetchBaseline();
    handleReset();
  }, [lens]);

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const now = new Date();
      let overrides: any = {};

      if (simulationType === 'emergency') {
        const emergencyStart = new Date(now.getTime() + emergencyStartOffsetHours * 60 * 60 * 1000).toISOString();
        const emergencyEnd = new Date(
          now.getTime() + (emergencyStartOffsetHours * 60 + emergencyDuration) * 60 * 1000
        ).toISOString();

        overrides.extra_busy_periods = [
          {
            title: emergencyTitle,
            starts_at: emergencyStart,
            ends_at: emergencyEnd,
          },
        ];
      } else if (simulationType === 'deadline') {
        if (selectedTaskId) {
          const taskObj = tasks.find((t) => t.id === selectedTaskId);
          const currentDeadline = taskObj?.deadline_at ? new Date(taskObj.deadline_at) : new Date(now.getTime() + 8 * 3600 * 1000);
          const newDeadline = new Date(currentDeadline.getTime() - advanceHours * 3600 * 1000);

          overrides.deadline_changes = {
            [selectedTaskId]: newDeadline.toISOString(),
          };
        }
      } else if (simulationType === 'hours') {
        overrides.reduced_hours = hoursReduced;
      }

      const res = await api.post('/plans/generate', {
        horizon_hours: 12,
        is_simulation: true,
        simulation_overrides: overrides,
        lens: lens === 'all' ? undefined : lens,
      });

      const planData = res.data;
      let calculatedSimulatedMins = 0;
      if (planData.blocks) {
        const simBlocks: TimelineBlock[] = planData.blocks.map((b: any) => ({
          id: b.id,
          kind: b.kind,
          title: b.title,
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          task_id: b.task_id,
          rationale: b.rationale,
          pinned: b.pinned,
          is_simulation: true,
        }));
        setSimulatedBlocks(simBlocks);

        calculatedSimulatedMins = simBlocks
          .filter((b) => b.kind === 'task')
          .reduce((acc, b) => {
            const s = new Date(b.starts_at).getTime();
            const e = new Date(b.ends_at).getTime();
            return acc + Math.round((e - s) / 60000);
          }, 0);
      }

      setUnscheduledTasks(planData.unscheduled || []);

      const baselineMins = baselineBlocks.reduce((acc, b) => {
        if (b.kind === 'task') {
          const s = new Date(b.starts_at).getTime();
          const e = new Date(b.ends_at).getTime();
          return acc + Math.round((e - s) / 60000);
        }
        return acc;
      }, 0);

      setMetrics({
        capacity: planData.metrics?.capacity_minutes ?? 480,
        scheduled: planData.metrics?.scheduled_minutes ?? calculatedSimulatedMins,
        displacedCount: planData.unscheduled?.length ?? 0,
        baselineScheduled: baselineMins,
      });

      setHasSimulated(true);
    } catch (err) {
      console.error('Simulation execution failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleReset = () => {
    setHasSimulated(false);
    setSimulatedBlocks([]);
    setMetrics(null);
    setUnscheduledTasks([]);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-mono mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simulation only · Your actual schedule remains unchanged</span>
        </div>
        <h2 className="font-serif text-3xl md:text-4xl font-normal text-[#15181F] dark:text-[#ECEFF4]">
          What-If Schedule Simulation
        </h2>
        <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1 max-w-2xl">
          Simulate disruptions, sudden meetings, moved deadlines, or lost hours for your {lens} commitments. Dayfold computes downstream effects with side-by-side comparison, zero database mutations, and zero risk to your real schedule.
        </p>
      </div>

      {/* Scenario Builder Card */}
      <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <h3 className="font-serif text-xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
            1. Select Simulation Scenario
          </h3>
          <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-0.5">
            Choose what hypothetical constraint change to simulate against your current workload.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {/* Sudden Commitment */}
          <button
            type="button"
            onClick={() => setSimulationType('emergency')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              simulationType === 'emergency'
                ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 ring-1 ring-amber-500 text-amber-950 dark:text-amber-200'
                : 'border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-xs">Sudden Commitment</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-[11px] opacity-80 leading-relaxed">
              Inject an urgent unscheduled meeting, client call, or appointment into your day.
            </p>
          </button>

          {/* Deadline Advanced */}
          <button
            type="button"
            onClick={() => setSimulationType('deadline')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              simulationType === 'deadline'
                ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 ring-1 ring-amber-500 text-amber-950 dark:text-amber-200'
                : 'border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-xs">Deadline Advanced</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-[11px] opacity-80 leading-relaxed">
              Move up a deliverable's due time to see if other tasks get displaced or compressed.
            </p>
          </button>

          {/* Reduced Available Hours */}
          <button
            type="button"
            onClick={() => setSimulationType('hours')}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              simulationType === 'hours'
                ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/40 ring-1 ring-amber-500 text-amber-950 dark:text-amber-200'
                : 'border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-xs">Reduced Available Hours</span>
              <ShieldCheck className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-[11px] opacity-80 leading-relaxed">
              Simulate losing afternoon hours due to errands, travel, or an early finish.
            </p>
          </button>
        </div>

        {/* Dynamic Scenario Parameter Configuration */}
        <div className="pt-2 border-t border-[#E8E3D9] dark:border-[#262B36]">
          <h4 className="text-xs font-mono uppercase tracking-wider text-[#7B8191] dark:text-[#7C8695] mb-3">
            2. Configure Scenario Parameters
          </h4>

          {simulationType === 'emergency' && (
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Commitment Title
                </label>
                <input
                  type="text"
                  value={emergencyTitle}
                  onChange={(e) => setEmergencyTitle(e.target.value)}
                  placeholder="e.g., Emergency Incident Sync"
                  className="w-full px-3.5 py-2 text-xs bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Start Offset From Now
                </label>
                <select
                  value={emergencyStartOffsetHours}
                  onChange={(e) => setEmergencyStartOffsetHours(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  <option value={0.5}>Starts in 30 minutes</option>
                  <option value={1}>Starts in 1 hour</option>
                  <option value={2}>Starts in 2 hours</option>
                  <option value={4}>Starts in 4 hours</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Duration
                </label>
                <select
                  value={emergencyDuration}
                  onChange={(e) => setEmergencyDuration(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                  <option value={180}>3 hours</option>
                </select>
              </div>
            </div>
          )}

          {simulationType === 'deadline' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Target Task to Advance
                </label>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  {tasks.length > 0 ? (
                    tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} ({t.estimate_minutes || 60}m)
                      </option>
                    ))
                  ) : (
                    <option value="">No open tasks found in {lens} workspace</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Move Deadline Earlier By
                </label>
                <select
                  value={advanceHours}
                  onChange={(e) => setAdvanceHours(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  <option value={2}>2 hours earlier</option>
                  <option value={4}>4 hours earlier</option>
                  <option value={6}>6 hours earlier</option>
                  <option value={12}>12 hours earlier</option>
                  <option value={24}>24 hours earlier (Tomorrow to Today)</option>
                </select>
              </div>
            </div>
          )}

          {simulationType === 'hours' && (
            <div className="max-w-md">
              <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                Hours Lost From Operating Window
              </label>
              <select
                value={hoursReduced}
                onChange={(e) => setHoursReduced(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
              >
                <option value={1}>Leave 1 hour early</option>
                <option value={2}>Leave 2 hours early</option>
                <option value={3}>Lose 3 hours (half afternoon)</option>
                <option value={4}>Lose 4 hours</option>
              </select>
            </div>
          )}
        </div>

        {/* Action Button Bar */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs text-[#7B8191]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Simulation only · Your actual schedule remains unchanged.</span>
          </div>

          <div className="flex items-center gap-3">
            {hasSimulated && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] hover:text-[#15181F] dark:hover:text-white text-xs font-mono transition-colors cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Reset Simulation</span>
              </button>
            )}

            <button
              onClick={handleRunSimulation}
              disabled={isSimulating}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{isSimulating ? 'Simulating Schedule...' : 'Run Simulation'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Simulation Results & Side-by-Side Comparison */}
      {hasSimulated && metrics && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Delta Metrics Banner */}
          <div className="grid sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B8191]">
                Available Capacity
              </span>
              <div className="text-2xl font-bold font-mono text-[#15181F] dark:text-[#ECEFF4] mt-1">
                {(metrics.capacity / 60).toFixed(1)} hrs
              </div>
              <span className="text-[10px] text-[#7B8191] mt-0.5 block">
                Total free focus window
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B8191]">
                Simulated Focus Work
              </span>
              <div className="text-2xl font-bold font-mono text-[#1B7F83] dark:text-[#28A5AA] mt-1">
                {(metrics.scheduled / 60).toFixed(1)} hrs
              </div>
              <span className="text-[10px] text-[#7B8191] mt-0.5 block">
                Baseline was {(metrics.baselineScheduled / 60).toFixed(1)} hrs
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B8191]">
                Displaced Tasks
              </span>
              <div
                className={`text-2xl font-bold font-mono mt-1 ${
                  metrics.displacedCount > 0 ? 'text-[#D6453D]' : 'text-emerald-600'
                }`}
              >
                {metrics.displacedCount} tasks
              </div>
              <span className="text-[10px] text-[#7B8191] mt-0.5 block">
                {metrics.displacedCount > 0 ? 'Pushed past horizon' : 'All tasks fit cleanly'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] shadow-sm">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#7B8191]">
                Downstream Impact
              </span>
              <div className="text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4] mt-1.5 flex items-center gap-1.5">
                {metrics.displacedCount > 0 ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Schedule Adjusted</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Feasible Without Loss</span>
                  </>
                )}
              </div>
              <span className="text-[10px] text-[#7B8191] mt-0.5 block">
                Zero calendar edits committed
              </span>
            </div>
          </div>

          {/* Displaced tasks alert details if any */}
          {unscheduledTasks.length > 0 && (
            <div className="p-4 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs">
              <div className="flex items-center gap-2 font-semibold text-red-800 dark:text-red-300 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Tasks Displaced by This Scenario:</span>
              </div>
              <ul className="space-y-1 pl-6 list-disc text-red-700 dark:text-red-300">
                {unscheduledTasks.map((u, i) => (
                  <li key={i}>
                    <strong>{u.task_title || u.title || 'Task'}</strong>: {u.reason || 'Insufficient capacity within horizon'}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* View Mode Selector Tabs */}
          <div className="flex items-center justify-between border-b border-[#E8E3D9] dark:border-[#262B36] pb-3">
            <h4 className="font-serif text-xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
              Schedule Comparison
            </h4>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#161922] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('comparison')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  viewMode === 'comparison'
                    ? 'bg-white dark:bg-[#202531] text-[#15181F] dark:text-white shadow-sm font-semibold'
                    : 'text-[#7B8191] hover:text-[#15181F] dark:hover:text-white'
                }`}
              >
                <SplitSquareHorizontal className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('simulated_only')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  viewMode === 'simulated_only'
                    ? 'bg-white dark:bg-[#202531] text-[#15181F] dark:text-white shadow-sm font-semibold'
                    : 'text-[#7B8191] hover:text-[#15181F] dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Simulated Only</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('baseline_only')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer ${
                  viewMode === 'baseline_only'
                    ? 'bg-white dark:bg-[#202531] text-[#15181F] dark:text-white shadow-sm font-semibold'
                    : 'text-[#7B8191] hover:text-[#15181F] dark:hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Baseline Only</span>
              </button>
            </div>
          </div>

          {/* Timeline View Display */}
          {viewMode === 'comparison' && (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Baseline Schedule */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-2 text-xs font-mono text-[#7B8191]">
                  <span className="font-semibold uppercase tracking-wider text-[#15181F] dark:text-[#ECEFF4]">
                    Current Baseline Schedule
                  </span>
                  <span>{baselineBlocks.length} blocks</span>
                </div>
                <TimelineCanvas
                  blocks={baselineBlocks}
                  date={new Date()}
                  isSimulationMode={false}
                  onScroll={handleSyncScroll}
                  syncScrollTop={sharedScrollTop}
                />
              </div>

              {/* Simulated What-If Schedule */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-2 text-xs font-mono text-amber-600 dark:text-amber-400">
                  <span className="font-semibold uppercase tracking-wider">
                    Hypothetical Simulated Schedule
                  </span>
                  <span>{simulatedBlocks.length} blocks</span>
                </div>
                <TimelineCanvas
                  blocks={simulatedBlocks}
                  date={new Date()}
                  isSimulationMode={true}
                  onScroll={handleSyncScroll}
                  syncScrollTop={sharedScrollTop}
                />
              </div>
            </div>
          )}

          {viewMode === 'simulated_only' && (
            <div className="space-y-2">
              <div className="px-2 text-xs font-mono text-amber-600 dark:text-amber-400">
                <span className="font-semibold uppercase tracking-wider">
                  Hypothetical Simulated Schedule
                </span>
              </div>
              <TimelineCanvas
                blocks={simulatedBlocks}
                date={new Date()}
                isSimulationMode={true}
              />
            </div>
          )}

          {viewMode === 'baseline_only' && (
            <div className="space-y-2">
              <div className="px-2 text-xs font-mono text-[#7B8191]">
                <span className="font-semibold uppercase tracking-wider text-[#15181F] dark:text-[#ECEFF4]">
                  Current Baseline Schedule
                </span>
              </div>
              <TimelineCanvas
                blocks={baselineBlocks}
                date={new Date()}
                isSimulationMode={false}
              />
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};
