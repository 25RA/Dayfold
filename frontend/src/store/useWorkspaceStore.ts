import { create } from 'zustand';

export type ProfileLens = 'student' | 'professional' | 'personal' | 'all';
export type ThemeMode = 'light' | 'dark';

interface Terminology {
  taskSingular: string;
  taskPlural: string;
  focusBlockName: string;
  projectTerm: string;
  scheduleAction: string;
  emptyStatePrompt: string;
}

const TERMINOLOGY_MAP: Record<ProfileLens, Terminology> = {
  student: {
    taskSingular: 'Assignment / Study Task',
    taskPlural: 'Assignments & Study',
    focusBlockName: 'Study Block',
    projectTerm: 'Course / Subject',
    scheduleAction: 'Plan Study Schedule',
    emptyStatePrompt: 'Add your upcoming assignments, exams, or class lectures...',
  },
  professional: {
    taskSingular: 'Deliverable',
    taskPlural: 'Deliverables & Follow-ups',
    focusBlockName: 'Focus Block',
    projectTerm: 'Project / Initiative',
    scheduleAction: 'Organize Workday',
    emptyStatePrompt: 'Add client meetings, deliverables, and focus commitments...',
  },
  personal: {
    taskSingular: 'Errand / Commitment',
    taskPlural: 'Errands & Routines',
    focusBlockName: 'Dedicated Time',
    projectTerm: 'Life Area',
    scheduleAction: 'Plan My Day',
    emptyStatePrompt: 'Add errands, personal goals, doctor visits, or routines...',
  },
  all: {
    taskSingular: 'Task',
    taskPlural: 'All Commitments',
    focusBlockName: 'Focus Block',
    projectTerm: 'Project',
    scheduleAction: 'Plan The Day',
    emptyStatePrompt: 'Tell Dayfold what you need to achieve today...',
  },
};

interface WorkspaceState {
  lens: ProfileLens;
  theme: ThemeMode;
  selectedDate: Date;
  terms: Terminology;
  setLens: (lens: ProfileLens) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSelectedDate: (date: Date) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => {
  const savedTheme = typeof window !== 'undefined' ? (localStorage.getItem('dayfold_theme') as ThemeMode) : null;
  const initialTheme: ThemeMode = savedTheme || 'light';
  const initialLens = (typeof window !== 'undefined' ? (localStorage.getItem('dayfold_lens') as ProfileLens) : null) || 'student';

  // Apply theme to document element
  if (typeof document !== 'undefined') {
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  return {
    lens: initialLens,
    theme: initialTheme,
    selectedDate: new Date(),
    terms: TERMINOLOGY_MAP[initialLens],

    setLens: (lens) => {
      localStorage.setItem('dayfold_lens', lens);
      set({ lens, terms: TERMINOLOGY_MAP[lens] });
    },

    setTheme: (theme) => {
      localStorage.setItem('dayfold_theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      set({ theme });
    },

    toggleTheme: () => {
      set((state) => {
        const next = state.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('dayfold_theme', next);
        if (next === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        return { theme: next };
      });
    },

    setSelectedDate: (selectedDate) => set({ selectedDate }),
  };
});

