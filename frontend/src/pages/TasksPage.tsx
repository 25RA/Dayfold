import React, { useState, useEffect } from 'react';
import {
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Calendar,
  AlertCircle,
  Layers,
  GraduationCap,
  Briefcase,
  Heart,
  Edit2,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import api from '../lib/api';
import { useWorkspaceStore, ProfileLens } from '../store/useWorkspaceStore';
import { DayfoldDatePicker } from '../components/DayfoldDatePicker';

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: number;
  deadline_at?: string;
  estimate_minutes?: number;
  status: string;
  created_at: string;
  lens?: 'student' | 'professional' | 'personal' | null;
}

export const TasksPage: React.FC = () => {
  const { lens, setLens, terms } = useWorkspaceStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(2);
  const [estimate, setEstimate] = useState(60);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [taskCategory, setTaskCategory] = useState<string>(lens === 'all' ? 'personal' : lens);
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState(2);
  const [editEstimate, setEditEstimate] = useState(60);
  const [editDeadline, setEditDeadline] = useState<string | null>(null);
  const [editLens, setEditLens] = useState<'student' | 'professional' | 'personal'>('personal');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Deletion confirmation modal
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchTasks = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.append('status', filter);
      if (lens !== 'all') params.append('lens', lens);

      const queryStr = params.toString();
      const endpoint = queryStr ? `/tasks?${queryStr}` : '/tasks';
      const res = await api.get(endpoint);
      setTasks(res.data);
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
      setActionError(err.response?.data?.detail || 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [filter, lens]);

  // Keep creation category aligned with active lens
  useEffect(() => {
    if (lens !== 'all') {
      setTaskCategory(lens);
    }
  }, [lens]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const targetLens = lens === 'all' ? taskCategory : lens;
      await api.post('/tasks', {
        title: title.trim(),
        priority,
        estimate_minutes: estimate,
        deadline_at: deadline || null,
        lens: targetLens,
      });
      setTitle('');
      setDeadline(null);
      fetchTasks();
    } catch (err: any) {
      console.error('Failed to create task:', err);
      setActionError(err.response?.data?.detail || 'Failed to create task');
    }
  };

  const handleToggleStatus = async (task: Task) => {
    try {
      if (task.status !== 'done') {
        await api.post(`/tasks/${task.id}/complete`);
      } else {
        await api.patch(`/tasks/${task.id}`, { status: 'todo' });
      }
      fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  // Open Edit Modal
  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority);
    setEditEstimate(task.estimate_minutes || 60);
    setEditDeadline(task.deadline_at || null);
    setEditLens((task.lens as any) || (lens === 'all' ? 'personal' : lens));
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    setIsSavingEdit(true);
    setActionError(null);
    try {
      await api.patch(`/tasks/${editingTask.id}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        estimate_minutes: editEstimate,
        deadline_at: editDeadline || null,
        lens: editLens,
      });
      setEditingTask(null);
      fetchTasks();
    } catch (err: any) {
      console.error('Failed to update task:', err);
      setActionError(err.response?.data?.detail || 'Failed to save changes');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Execute Deletion after confirmation
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await api.delete(`/tasks/${taskToDelete.id}`);
      // Optimistic removal
      setTasks((prev) => prev.filter((t) => t.id !== taskToDelete.id));
      setTaskToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete task:', err);
      setActionError(err.response?.data?.detail || 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  const getLensBadge = (t: Task) => {
    const taskLens = t.lens;
    if (taskLens === 'student') {
      return {
        label: 'Student',
        className: 'bg-[#EEF0FF] dark:bg-[#1C1F3D] text-[#4F58E2] dark:text-[#888FFA] border-[#C7CCFB]/40',
      };
    }
    if (taskLens === 'professional') {
      return {
        label: 'Professional',
        className: 'bg-[#E1F2F2] dark:bg-[#12302F] text-[#1B7F83] dark:text-[#28A5AA] border-[#A8DBDC]/40',
      };
    }
    if (taskLens === 'personal') {
      return {
        label: 'Personal',
        className: 'bg-[#FCF1DC] dark:bg-[#3A2A10] text-[#D98A1F] dark:text-[#F3B356] border-[#F5D59A]/40',
      };
    }
    return null;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#F26A3D]">
            {lens.toUpperCase()} WORKSPACE
          </span>
          <h2 className="font-serif text-3xl font-normal text-[#15181F] dark:text-[#ECEFF4] mt-0.5">
            {terms.taskPlural}
          </h2>
          <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1">
            Prioritize, estimate, and assign commitments isolated for your {lens === 'all' ? 'complete day' : `${lens} workflow`}.
          </p>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#1A1E27] p-1 rounded-xl border border-[#E8E3D9] dark:border-[#262B36]">
          {(['all', 'todo', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filter === f
                  ? 'bg-white dark:bg-[#202531] text-[#15181F] dark:text-white shadow-xs font-semibold'
                  : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'todo' ? 'Open' : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-[#D6453D]/30 flex items-center justify-between gap-2 text-xs text-[#D6453D]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="hover:opacity-75">✕</button>
        </div>
      )}

      {/* Quick Task Creation Form */}
      <form
        onSubmit={handleCreateTask}
        className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
      >
        <div className="md:col-span-4">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Add new ${terms.taskSingular.toLowerCase()}...`}
            className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40 text-[#15181F] dark:text-white"
          />
        </div>

        {lens === 'all' && (
          <div className="md:col-span-2">
            <select
              value={taskCategory}
              onChange={(e) => setTaskCategory(e.target.value)}
              className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#5A6070] dark:text-[#A0A8B6]"
              title="Workspace Lens"
            >
              <option value="student">Student</option>
              <option value="professional">Professional</option>
              <option value="personal">Personal</option>
            </select>
          </div>
        )}

        <div className={lens === 'all' ? 'md:col-span-2' : 'md:col-span-2'}>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#5A6070] dark:text-[#A0A8B6]"
          >
            <option value={1}>P1: Critical</option>
            <option value={2}>P2: High</option>
            <option value={3}>P3: Medium</option>
            <option value={4}>P4: Low</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <select
            value={estimate}
            onChange={(e) => setEstimate(Number(e.target.value))}
            className="w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#5A6070] dark:text-[#A0A8B6]"
          >
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
          </select>
        </div>

        <div className={lens === 'all' ? 'md:col-span-2 flex gap-2' : 'md:col-span-4 flex gap-2'}>
          <div className="flex-1">
            <DayfoldDatePicker
              value={deadline || undefined}
              onChange={(val) => setDeadline(val)}
              placeholder="Due date..."
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white text-xs font-semibold hover:opacity-90 shrink-0 cursor-pointer shadow-xs flex items-center justify-center"
            title="Create Task"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Task List */}
      <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl overflow-hidden shadow-sm">
        <div className="divide-y divide-[#E8E3D9] dark:divide-[#262B36]">
          {tasks.map((task) => {
            const isDone = task.status === 'done';
            const priorityBadge = {
              1: 'bg-red-100 dark:bg-red-950/60 text-[#D6453D] border-red-200',
              2: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 border-amber-200',
              3: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 border-blue-200',
              4: 'bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200',
            }[task.priority] || 'bg-slate-100 text-slate-600';

            const lensBadge = getLensBadge(task);

            return (
              <div
                key={task.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-[#1A1E27]/50 transition-colors"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <button
                    onClick={() => handleToggleStatus(task)}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                      isDone
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-[#E8E3D9] dark:border-[#262B36] hover:border-[#F26A3D]'
                    }`}
                  >
                    {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>

                  <div className="overflow-hidden">
                    <span
                      className={`text-sm font-medium block truncate ${
                        isDone
                          ? 'line-through text-[#7B8191] dark:text-[#7C8695]'
                          : 'text-[#15181F] dark:text-[#ECEFF4]'
                      }`}
                    >
                      {task.title}
                    </span>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-[#5A6070] dark:text-[#A0A8B6] mt-0.5">
                      <span>{task.estimate_minutes || 60}m estimate</span>
                      {task.deadline_at && (
                        <span>Due: {new Date(task.deadline_at).toLocaleDateString()}</span>
                      )}
                      {task.description && (
                        <span className="truncate max-w-[200px] opacity-75">{task.description}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {lensBadge && (
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${lensBadge.className}`}>
                      {lensBadge.label}
                    </span>
                  )}

                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${priorityBadge}`}>
                    P{task.priority}
                  </span>

                  {/* Edit Button */}
                  <button
                    onClick={() => openEditModal(task)}
                    className="p-1.5 rounded-lg text-[#7B8191] hover:text-[#15181F] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit task"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => setTaskToDelete(task)}
                    className="p-1.5 rounded-lg text-[#7B8191] hover:text-[#D6453D] hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title="Delete task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {tasks.length === 0 && !isLoading && (
            <div className="p-12 text-center text-[#5A6070] dark:text-[#A0A8B6]">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#F26A3D]" />
              <p className="font-serif text-lg text-[#15181F] dark:text-[#ECEFF4]">
                No {terms.taskPlural.toLowerCase()} in this view
              </p>
              <p className="text-xs mt-1">
                {lens !== 'all'
                  ? `Create a task for your ${lens} profile above or speak your commitments on My Day.`
                  : 'Add commitments using the form above.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* In-Place Task Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-[#151821] border border-[#E8E3D9] dark:border-[#262B36] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E3D9] dark:border-[#262B36]">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#F26A3D]" />
                <h3 className="font-serif text-xl font-normal text-[#15181F] dark:text-[#ECEFF4]">
                  Edit {terms.taskSingular}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="p-1 text-[#7B8191] hover:text-[#15181F] dark:hover:text-white rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl focus:ring-2 focus:ring-[#F26A3D]/40 text-[#15181F] dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Additional context or links..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl focus:ring-2 focus:ring-[#F26A3D]/40 text-[#15181F] dark:text-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                    Priority
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                  >
                    <option value={1}>P1: Critical</option>
                    <option value={2}>P2: High</option>
                    <option value={3}>P3: Medium</option>
                    <option value={4}>P4: Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                    Duration Estimate
                  </label>
                  <select
                    value={editEstimate}
                    onChange={(e) => setEditEstimate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                    <option value={180}>3 hours</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                    Workspace Lens
                  </label>
                  <select
                    value={editLens}
                    onChange={(e) => setEditLens(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                  >
                    <option value="student">Student</option>
                    <option value="professional">Professional</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                    Due Date & Time
                  </label>
                  <DayfoldDatePicker
                    value={editDeadline || undefined}
                    onChange={(val) => setEditDeadline(val)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E3D9] dark:border-[#262B36]">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl bg-[#F26A3D] text-white text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Deletion Confirmation Dialog */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-[#151821] border border-[#E8E3D9] dark:border-[#262B36] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-red-100 dark:bg-red-950/60 text-[#D6453D] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-normal text-[#15181F] dark:text-[#ECEFF4]">
                  Delete {terms.taskSingular}?
                </h3>
                <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1.5 leading-relaxed">
                  Are you sure you want to remove <strong>"{taskToDelete.title}"</strong>? This will remove it from future schedule calculations.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTaskToDelete(null)}
                className="px-4 py-2 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-[#D6453D] text-white text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-xs"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
