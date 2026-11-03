import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  GraduationCap,
  Briefcase,
  Heart,
  Layers,
  Clock,
  ShieldCheck,
  Check,
  AlertCircle,
  History,
  CheckCircle2,
  Calendar,
  Sparkles,
  Trash2,
  LogIn,
  LogOut as LogOutIcon,
  Activity,
} from 'lucide-react';
import { useWorkspaceStore, ProfileLens } from '../store/useWorkspaceStore';
import { useAuthStore } from '../store/useAuthStore';
import { DayfoldLogo } from '../components/DayfoldLogo';
import api from '../lib/api';
import { ALL_24_HOURS } from '../lib/timeOptions';

interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata?: any;
  at: string;
}

export const SettingsPage: React.FC = () => {
  const { lens, setLens, theme, setTheme } = useWorkspaceStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'preferences' | 'activity'>('preferences');

  // Preferences state
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [focusLength, setFocusLength] = useState(90);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);

  // Activity History state
  const [activityLogs, setActivityLogs] = useState<ActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  const loadPrefs = async () => {
    try {
      const res = await api.get('/users/me/preferences');
      if (res.data) {
        const wh = res.data.working_hours?.monday || res.data.working_hours?.sunday;
        if (wh) {
          setStartHour(wh.start_hour !== undefined ? wh.start_hour : 9);
          setEndHour(wh.end_hour !== undefined ? wh.end_hour : 18);
        }
        if (res.data.focus_block_minutes) {
          setFocusLength(res.data.focus_block_minutes);
        }
      }
    } catch (err) {
      console.error('Failed to load preferences:', err);
    }
  };

  useEffect(() => {
    loadPrefs();
  }, []);

  useEffect(() => {
    if (activeTab === 'activity') {
      const loadActivity = async () => {
        setIsLoadingActivity(true);
        try {
          const res = await api.get('/users/me/activity');
          setActivityLogs(res.data || []);
        } catch (err) {
          console.error('Failed to load activity history:', err);
        } finally {
          setIsLoadingActivity(false);
        }
      };
      loadActivity();
    }
  }, [activeTab]);

  const handleStartHourChange = (newStart: number) => {
    setStartHour(newStart);
    setSaveError(null);
    if (newStart >= endHour) {
      setEndHour(Math.min(23, newStart + 1));
      setTimeError(null);
    } else {
      setTimeError(null);
    }
  };

  const handleEndHourChange = (newEnd: number) => {
    setSaveError(null);
    if (newEnd <= startHour) {
      setTimeError('Day end time must be after day start time.');
    } else {
      setTimeError(null);
    }
    setEndHour(newEnd);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    if (endHour <= startHour) {
      setTimeError('Day end time must be after day start time.');
      return;
    }

    setIsSaving(true);
    try {
      const workingHours: Record<string, any> = {};
      const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of allDays) {
        workingHours[day] = {
          start_hour: startHour,
          start_minute: 0,
          end_hour: endHour,
          end_minute: 0,
        };
      }

      await api.put('/users/me/preferences', {
        working_hours: workingHours,
        focus_block_minutes: focusLength,
      });

      setIsSaved(true);
      setTimeError(null);
      await loadPrefs();
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      const detail = err.response?.data?.detail || 'Failed to save preferences. Please check your inputs and try again.';
      setSaveError(detail);
      setIsSaved(false);
    } finally {
      setIsSaving(false);
    }
  };

  const lenses: { id: ProfileLens; label: string; icon: any }[] = [
    { id: 'student', label: 'Student', icon: GraduationCap },
    { id: 'professional', label: 'Professional', icon: Briefcase },
    { id: 'personal', label: 'Personal', icon: Heart },
    { id: 'all', label: 'All Lenses', icon: Layers },
  ];

  // Format activity action into customer-facing label and styling
  const getActivityPresentation = (item: ActivityItem) => {
    switch (item.action) {
      case 'task.create':
        return {
          title: 'Task Created',
          description: 'Added a new commitment to your task list',
          icon: CheckCircle2,
          color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/40',
        };
      case 'task.complete':
        return {
          title: 'Task Completed',
          description: 'Marked commitment as done',
          icon: Check,
          color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
        };
      case 'task.delete':
        return {
          title: 'Task Removed',
          description: 'Deleted commitment from your workspace',
          icon: Trash2,
          color: 'text-red-500 bg-red-50 dark:bg-red-950/40',
        };
      case 'action.approve':
      case 'plan.commit':
        return {
          title: 'Schedule Approved & Committed',
          description: 'Locked in focus blocks on your day timeline',
          icon: Calendar,
          color: 'text-[#F26A3D] bg-[#FFF1EB] dark:bg-[#2A1710]',
        };
      case 'plan.generate':
        return {
          title: 'Plan Draft Generated',
          description: 'Deterministic scheduler organized your day',
          icon: Clock,
          color: 'text-[#1B7F83] bg-[#E1F2F2] dark:bg-[#12302F]',
        };
      case 'simulation.run':
        return {
          title: 'What-If Simulation Evaluated',
          description: 'Simulated downstream impact without calendar changes',
          icon: Sparkles,
          color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40',
        };
      case 'login':
        return {
          title: 'Signed In',
          description: 'Authenticated session started',
          icon: LogIn,
          color: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
        };
      case 'logout':
        return {
          title: 'Signed Out',
          description: 'Session closed',
          icon: LogOutIcon,
          color: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
        };
      case 'register':
        return {
          title: 'Account Created',
          description: 'Welcome to Dayfold — The Unfolding Day',
          icon: ShieldCheck,
          color: 'text-[#F26A3D] bg-[#FFF1EB] dark:bg-[#2A1710]',
        };
      default:
        return {
          title: item.action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          description: 'Dayfold activity record',
          icon: Activity,
          color: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
        };
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header & Tabs */}
      {/* Header with Brand Logo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E8E3D9] dark:border-[#262B36]">
        <div className="flex items-center gap-4">
          <DayfoldLogo size="md" variant="icon" />
          <div>
            <h2 className="font-serif text-3xl font-normal text-[#15181F] dark:text-[#ECEFF4]">
              Settings & Activity
            </h2>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-0.5">
              Dayfold workspace configuration, scheduling window, and audit history.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#1A1E27] p-1 rounded-xl border border-[#E8E3D9] dark:border-[#262B36]">
          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'preferences'
                ? 'bg-white dark:bg-[#202531] text-[#15181F] dark:text-white shadow-xs font-semibold'
                : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Preferences</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'activity'
                ? 'bg-white dark:bg-[#202531] text-[#15181F] dark:text-white shadow-xs font-semibold'
                : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity History</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Preferences Form */}
      {activeTab === 'preferences' && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Workspace Lens Card */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-serif text-xl font-medium">Default Workspace Lens</h3>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6]">
              Select which lens Dayfold defaults to when loading your schedule and priorities.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {lenses.map((l) => {
                const Icon = l.icon;
                const isSelected = lens === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLens(l.id)}
                    className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#F26A3D] bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#F26A3D] font-semibold'
                        : 'border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{l.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Theme Settings */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-serif text-xl font-medium">Appearance & Theme</h3>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6]">
              Choose between Warm Paper Light and Deep Ink Dark mode.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'border-[#F26A3D] bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#F26A3D] font-semibold'
                    : 'border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Sun className="w-5 h-5 text-amber-500" />
                  <div className="text-left">
                    <span className="text-sm block">Warm Paper</span>
                    <span className="text-[11px] text-[#7B8191] font-normal">Light editorial warmth</span>
                  </div>
                </div>
                {theme === 'light' && <Check className="w-4 h-4 text-[#F26A3D]" />}
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'border-[#F26A3D] bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#F26A3D] font-semibold'
                    : 'border-[#E8E3D9] dark:border-[#262B36] text-[#5A6070] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Moon className="w-5 h-5 text-indigo-400" />
                  <div className="text-left">
                    <span className="text-sm block">Deep Ink</span>
                    <span className="text-[11px] text-[#7B8191] font-normal">Dark calm minimalism</span>
                  </div>
                </div>
                {theme === 'dark' && <Check className="w-4 h-4 text-[#F26A3D]" />}
              </button>
            </div>
          </div>

          {/* Operating Hours & Planning Window */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-serif text-xl font-medium">Daily Planning Window</h3>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6]">
              Define your preferred hours for focus sessions. The planner schedules tasks inside this window while preserving fixed commitments anytime.
            </p>

            {timeError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-[#D6453D]/30 flex items-center gap-2 text-xs text-[#D6453D]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{timeError}</span>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Day Starts At
                </label>
                <select
                  value={startHour}
                  onChange={(e) => handleStartHourChange(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  {ALL_24_HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Day Ends At
                </label>
                <select
                  value={endHour}
                  onChange={(e) => handleEndHourChange(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  {ALL_24_HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                Target Focus Session Length
              </label>
              <select
                value={focusLength}
                onChange={(e) => setFocusLength(Number(e.target.value))}
                className="w-full sm:w-1/2 px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
              >
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes (1 hour)</option>
                <option value={90}>90 minutes (Standard deep work block)</option>
                <option value={120}>120 minutes (2 hours)</option>
              </select>
            </div>
          </div>

          {/* Save Button & Feedback */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 pt-2">
            {saveError && (
              <span className="text-xs text-red-600 dark:text-red-400 font-mono flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{saveError}</span>
              </span>
            )}
            {isSaved && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Preferences saved successfully</span>
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-[#F26A3D] hover:bg-[#D95325] text-white text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Customer-Facing Activity History */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm">
            <h3 className="font-serif text-xl font-medium mb-1">Recent Activity</h3>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mb-4">
              Chronological receipts of tasks created, schedules approved, and actions taken in your account.
            </p>

            {isLoadingActivity ? (
              <div className="p-8 text-center text-xs text-[#7B8191]">Loading activity history...</div>
            ) : activityLogs.length > 0 ? (
              <div className="divide-y divide-[#E8E3D9] dark:divide-[#262B36]">
                {activityLogs.map((item) => {
                  const pres = getActivityPresentation(item);
                  const Icon = pres.icon;
                  const formattedTime = new Date(item.at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={item.id}
                      className="py-3.5 flex items-start justify-between gap-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl shrink-0 ${pres.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-medium text-[#15181F] dark:text-[#ECEFF4] block">
                            {pres.title}
                          </span>
                          <span className="text-[11px] text-[#5A6070] dark:text-[#A0A8B6] block mt-0.5">
                            {pres.description}
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono text-[#7B8191] dark:text-[#636C7E] shrink-0">
                        {formattedTime}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-[#5A6070] dark:text-[#A0A8B6]">
                <History className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#F26A3D]" />
                <p className="font-serif text-lg text-[#15181F] dark:text-[#ECEFF4]">
                  No activity recorded yet
                </p>
                <p className="text-xs mt-1">Actions you perform across your day will appear here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
