import { create } from 'zustand';
import api from '../lib/api';

export interface User {
  id: string;
  email: string;
  display_name: string;
  timezone?: string;
  is_onboarded: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  demoLogin: (profile: 'student' | 'professional' | 'personal') => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('dayfold_user')) || 'null'),
  token: (typeof localStorage !== 'undefined' && localStorage.getItem('dayfold_access_token')) || null,
  isLoading: false,
  isAuthenticated: !!(typeof localStorage !== 'undefined' && (localStorage.getItem('dayfold_access_token') || localStorage.getItem('dayfold_user'))),

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user, access_token, refresh_token } = res.data;
      if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
        throw new Error('Authentication response missing valid access token');
      }
      const validAccessToken = access_token.trim();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dayfold_access_token', validAccessToken);
        if (refresh_token && typeof refresh_token === 'string' && refresh_token.trim()) {
          localStorage.setItem('dayfold_refresh_token', refresh_token.trim());
        }
        if (user) {
          localStorage.setItem('dayfold_user', JSON.stringify(user));
        }
      }
      set({ user, token: validAccessToken, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  register: async (email, password, displayName) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/register', { email, password, display_name: displayName });
      const { user, access_token, refresh_token } = res.data;
      if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
        throw new Error('Registration response missing valid access token');
      }
      const validAccessToken = access_token.trim();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dayfold_access_token', validAccessToken);
        if (refresh_token && typeof refresh_token === 'string' && refresh_token.trim()) {
          localStorage.setItem('dayfold_refresh_token', refresh_token.trim());
        }
        if (user) {
          localStorage.setItem('dayfold_user', JSON.stringify(user));
        }
      }
      set({ user, token: validAccessToken, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  demoLogin: async (profile: 'student' | 'professional' | 'personal') => {
    set({ isLoading: true });
    try {
      // Disposable, isolated demo namespace per browser session
      let demoSessionId = localStorage.getItem('dayfold_demo_session_id');
      if (!demoSessionId) {
        demoSessionId = Math.random().toString(36).substring(2, 8);
        localStorage.setItem('dayfold_demo_session_id', demoSessionId);
      }

      const email = `demo.${profile}.${demoSessionId}@dayfold.app`;
      const password = 'DemoPassword123!';
      const displayName =
        profile === 'student'
          ? 'Alex Chen (Student)'
          : profile === 'professional'
          ? 'Sarah Vance (Staff Lead)'
          : 'Jordan Miller (Personal)';

      let isNew = false;
      let res;
      try {
        res = await api.post('/auth/login', { email, password });
      } catch {
        // First time visitor with this session ID -> register fresh isolated account
        res = await api.post('/auth/register', { email, password, display_name: displayName });
        isNew = true;
      }

      const { user, access_token, refresh_token } = res.data;
      if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
        throw new Error('Demo login response missing valid access token');
      }
      const validAccessToken = access_token.trim();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dayfold_access_token', validAccessToken);
        if (refresh_token && typeof refresh_token === 'string' && refresh_token.trim()) {
          localStorage.setItem('dayfold_refresh_token', refresh_token.trim());
        }
        if (user) {
          localStorage.setItem('dayfold_user', JSON.stringify(user));
        }
        localStorage.setItem('dayfold_lens', profile);
      }
      set({ user, token: validAccessToken, isAuthenticated: true });

      // Immediately activate the matching lens in workspace store
      const { useWorkspaceStore } = await import('./useWorkspaceStore');
      useWorkspaceStore.getState().setLens(profile);

      if (isNew) {
        // Complete onboarding with profile-specific hours & focus lengths
        const profileWorkingHours =
          profile === 'student'
            ? {
                monday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
                tuesday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
                wednesday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
                thursday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
                friday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
                saturday: { start_hour: 9, start_minute: 0, end_hour: 20, end_minute: 0 },
                sunday: { start_hour: 10, start_minute: 0, end_hour: 20, end_minute: 0 },
              }
            : profile === 'professional'
            ? {
                monday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
                tuesday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
                wednesday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
                thursday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
                friday: { start_hour: 9, start_minute: 0, end_hour: 18, end_minute: 0 },
              }
            : {
                monday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
                tuesday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
                wednesday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
                thursday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
                friday: { start_hour: 7, start_minute: 0, end_hour: 23, end_minute: 0 },
                saturday: { start_hour: 8, start_minute: 0, end_hour: 23, end_minute: 0 },
                sunday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
              };

        await api.post('/users/me/onboarding/complete', {
          profiles: [profile],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          working_hours: profileWorkingHours,
          focus_block_minutes: profile === 'student' ? 60 : profile === 'professional' ? 90 : 45,
          break_minutes: 15,
        });

        // Seed profile-tailored tasks anchored dynamically to today with explicit lens tag
        const now = new Date();
        const todayStr = (hours: number, minutes = 0) => {
          const d = new Date(now);
          d.setHours(hours, minutes, 0, 0);
          return d.toISOString();
        };

        if (profile === 'student') {
          await api.post('/tasks', {
            title: 'CS 450 Problem Set 3 (Paging & Virtual Memory)',
            priority: 1,
            estimate_minutes: 90,
            deadline_at: todayStr(18, 0),
            lens: 'student',
          });
          await api.post('/tasks', {
            title: 'Read Distributed Systems Chapter 4',
            priority: 2,
            estimate_minutes: 60,
            deadline_at: todayStr(21, 0),
            lens: 'student',
          });
          await api.post('/tasks', {
            title: 'Review Midterm Practice Solutions',
            priority: 3,
            estimate_minutes: 45,
            lens: 'student',
          });
          await api.post('/calendar/events', {
            title: 'CS 450 Lecture: Memory Virtualization',
            starts_at: todayStr(10, 0),
            ends_at: todayStr(11, 30),
            is_busy: true,
          });
        } else if (profile === 'professional') {
          await api.post('/tasks', {
            title: 'Q4 Product Strategy Memo Draft',
            priority: 1,
            estimate_minutes: 90,
            deadline_at: todayStr(17, 0),
            lens: 'professional',
          });
          await api.post('/tasks', {
            title: 'Design System Architectural Review',
            priority: 2,
            estimate_minutes: 60,
            deadline_at: todayStr(19, 0),
            lens: 'professional',
          });
          await api.post('/tasks', {
            title: 'Team 1:1 Agenda & OKR Follow-ups',
            priority: 3,
            estimate_minutes: 30,
            lens: 'professional',
          });
          await api.post('/calendar/events', {
            title: 'Leadership Alignment Sync',
            starts_at: todayStr(11, 0),
            ends_at: todayStr(12, 0),
            is_busy: true,
          });
          await api.post('/calendar/events', {
            title: 'Cross-functional Architecture Review',
            starts_at: todayStr(14, 0),
            ends_at: todayStr(15, 0),
            is_busy: true,
          });
        } else {
          // personal
          await api.post('/tasks', {
            title: 'Schedule Annual Dental Checkup',
            priority: 1,
            estimate_minutes: 30,
            deadline_at: todayStr(16, 0),
            lens: 'personal',
          });
          await api.post('/tasks', {
            title: 'Weekly Grocery Restock & Meal Prep',
            priority: 2,
            estimate_minutes: 60,
            lens: 'personal',
          });
          await api.post('/tasks', {
            title: 'Vehicle Registration Renewal',
            priority: 3,
            estimate_minutes: 45,
            lens: 'personal',
          });
          await api.post('/calendar/events', {
            title: 'Pediatrician Follow-up Appointment',
            starts_at: todayStr(13, 0),
            ends_at: todayStr(14, 0),
            is_busy: true,
          });
        }

        // Generate baseline plan
        try {
          await api.post('/plans/generate', { horizon_hours: 12 });
        } catch (e) {
          console.error('Plan generation error during seed:', e);
        }
      } else {
        // Ensure the active workspace lens is still set for returning demo user
        const { useWorkspaceStore } = await import('./useWorkspaceStore');
        useWorkspaceStore.getState().setLens(profile);
      }

      set({ user, token: access_token || null, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: () => {
    const accessToken = typeof localStorage !== 'undefined' ? localStorage.getItem('dayfold_access_token') : null;
    const refreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('dayfold_refresh_token') : null;

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    api.post('/auth/logout', { refresh_token: refreshToken }, { headers }).catch(() => {});

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('dayfold_user');
      localStorage.removeItem('dayfold_access_token');
      localStorage.removeItem('dayfold_refresh_token');
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('dayfold_access_token') : null;
    const cachedUser = typeof localStorage !== 'undefined' ? localStorage.getItem('dayfold_user') : null;
    const refreshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('dayfold_refresh_token') : null;

    if (!token && !cachedUser && !refreshToken) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    try {
      const res = await api.get('/auth/me');
      const latestToken = (typeof localStorage !== 'undefined' && localStorage.getItem('dayfold_access_token')) || token || null;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('dayfold_user', JSON.stringify(res.data));
      }
      set({ user: res.data, token: latestToken, isAuthenticated: true });
    } catch {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('dayfold_user');
        localStorage.removeItem('dayfold_access_token');
        localStorage.removeItem('dayfold_refresh_token');
      }
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));

