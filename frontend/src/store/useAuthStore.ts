import { create } from 'zustand';
import api from '../lib/api';

export interface User {
  id: string;
  email: string;
  display_name: string;
  timezone?: string;
  is_onboarded: boolean;
}

export interface DemoProfileTaskSpec {
  seed_id: string;
  title: string;
  priority: number;
  estimate_minutes: number;
  deadline_hour?: number;
  lens: string;
}

export interface DemoProfileEventSpec {
  seed_id: string;
  title: string;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  is_busy: boolean;
}

export interface DemoProfileConfig {
  displayName: string;
  focusBlockMinutes: number;
  breakMinutes: number;
  workingHours: Record<string, { start_hour: number; start_minute: number; end_hour: number; end_minute: number }>;
  tasks: DemoProfileTaskSpec[];
  events: DemoProfileEventSpec[];
}

export const DEMO_PROFILES: Record<'student' | 'professional' | 'personal', DemoProfileConfig> = {
  student: {
    displayName: 'Alex Chen (Student)',
    focusBlockMinutes: 60,
    breakMinutes: 15,
    workingHours: {
      monday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      tuesday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      wednesday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      thursday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      friday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      saturday: { start_hour: 9, start_minute: 0, end_hour: 20, end_minute: 0 },
      sunday: { start_hour: 10, start_minute: 0, end_hour: 20, end_minute: 0 },
    },
    tasks: [
      {
        seed_id: 'student_task_1',
        title: 'CS 450 Problem Set 3 (Paging & Virtual Memory)',
        priority: 1,
        estimate_minutes: 90,
        deadline_hour: 18,
        lens: 'student',
      },
      {
        seed_id: 'student_task_2',
        title: 'Read Distributed Systems Chapter 4',
        priority: 2,
        estimate_minutes: 60,
        deadline_hour: 21,
        lens: 'student',
      },
      {
        seed_id: 'student_task_3',
        title: 'Review Midterm Practice Solutions',
        priority: 3,
        estimate_minutes: 45,
        lens: 'student',
      },
    ],
    events: [
      {
        seed_id: 'student_event_1',
        title: 'CS 450 Lecture: Memory Virtualization',
        start_hour: 10,
        start_minute: 0,
        end_hour: 11,
        end_minute: 30,
        is_busy: true,
      },
      {
        seed_id: 'student_event_2',
        title: 'Distributed Systems Lab',
        start_hour: 14,
        start_minute: 0,
        end_hour: 15,
        end_minute: 30,
        is_busy: true,
      },
    ],
  },
  professional: {
    displayName: 'Sarah Vance (Staff Lead)',
    focusBlockMinutes: 90,
    breakMinutes: 15,
    workingHours: {
      monday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      tuesday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      wednesday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      thursday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      friday: { start_hour: 9, start_minute: 0, end_hour: 18, end_minute: 0 },
    },
    tasks: [
      {
        seed_id: 'prof_task_1',
        title: 'Q4 Product Strategy Memo Draft',
        priority: 1,
        estimate_minutes: 90,
        deadline_hour: 17,
        lens: 'professional',
      },
      {
        seed_id: 'prof_task_2',
        title: 'Design System Architectural Review',
        priority: 2,
        estimate_minutes: 60,
        deadline_hour: 19,
        lens: 'professional',
      },
      {
        seed_id: 'prof_task_3',
        title: 'Team 1:1 Agenda & OKR Follow-ups',
        priority: 3,
        estimate_minutes: 30,
        lens: 'professional',
      },
    ],
    events: [
      {
        seed_id: 'prof_event_1',
        title: 'Leadership Alignment Sync',
        start_hour: 11,
        start_minute: 0,
        end_hour: 12,
        end_minute: 0,
        is_busy: true,
      },
      {
        seed_id: 'prof_event_2',
        title: 'Cross-functional Architecture Review',
        start_hour: 14,
        start_minute: 0,
        end_hour: 15,
        end_minute: 0,
        is_busy: true,
      },
    ],
  },
  personal: {
    displayName: 'Jordan Miller (Personal)',
    focusBlockMinutes: 45,
    breakMinutes: 15,
    workingHours: {
      monday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      tuesday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      wednesday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      thursday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      friday: { start_hour: 7, start_minute: 0, end_hour: 23, end_minute: 0 },
      saturday: { start_hour: 8, start_minute: 0, end_hour: 23, end_minute: 0 },
      sunday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
    },
    tasks: [
      {
        seed_id: 'pers_task_1',
        title: 'Schedule Annual Dental Checkup',
        priority: 1,
        estimate_minutes: 30,
        deadline_hour: 16,
        lens: 'personal',
      },
      {
        seed_id: 'pers_task_2',
        title: 'Weekly Grocery Restock & Meal Prep',
        priority: 2,
        estimate_minutes: 60,
        lens: 'personal',
      },
      {
        seed_id: 'pers_task_3',
        title: 'Vehicle Registration Renewal',
        priority: 3,
        estimate_minutes: 45,
        lens: 'personal',
      },
    ],
    events: [
      {
        seed_id: 'pers_event_1',
        title: 'Pediatrician Follow-up Appointment',
        start_hour: 13,
        start_minute: 0,
        end_hour: 14,
        end_minute: 0,
        is_busy: true,
      },
      {
        seed_id: 'pers_event_2',
        title: 'Evening Yoga & Mobility Session',
        start_hour: 18,
        start_minute: 30,
        end_hour: 19,
        end_minute: 30,
        is_busy: true,
      },
    ],
  },
};

export function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch { }
  return null;
}

export function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch { }
}

export function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch { }
}

export function safeSessionStorageGet(key: string): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(key);
    }
  } catch { }
  return null;
}

export function safeSessionStorageSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
    }
  } catch { }
}

export function safeSessionStorageRemove(key: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch { }
}

export function safeParseUser(raw: string | null): User | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.email === 'string') {
      return parsed as User;
    }
  } catch { }
  return null;
}

export function extractArray<T>(data: unknown): T[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['items', 'data', 'tasks', 'events', 'plans']) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return null;
}

export const LOCK_LEASE_MS = 30_000;
export const inFlightInitPromises = new Map<string, Promise<boolean>>();

export async function ensureDemoDataInitialized(
  profile: 'student' | 'professional' | 'personal',
  user: User,
  customApi: any = api
): Promise<boolean> {
  // Safety guard: ONLY run for verified demo accounts
  if (!user?.email || !user.email.startsWith('demo.') || !user.email.endsWith('@dayfold.app')) {
    return false;
  }

  // 1. Prevent duplicate concurrent initialization within the same browser tab via in-flight promise
  if (inFlightInitPromises.has(user.id)) {
    const activePromise = inFlightInitPromises.get(user.id);
    if (activePromise) {
      return await activePromise;
    }
  }

  const runInit = async (): Promise<boolean> => {
    const lockKey = `dayfold_demo_seeding_${user.id}`;
    const currentStatus = safeSessionStorageGet(lockKey);

    if (currentStatus === 'completed') {
      return true; // Already initialized successfully
    }

    if (currentStatus && currentStatus.startsWith('in_progress:')) {
      const lockTimestamp = parseInt(currentStatus.slice('in_progress:'.length), 10);
      if (!isNaN(lockTimestamp) && Date.now() - lockTimestamp < LOCK_LEASE_MS) {
        // Active unexpired lease in another tab/process
        return false;
      }
      // Stale lease (> 30s): allow recovery
    }

    // Acquire lock lease
    safeSessionStorageSet(lockKey, `in_progress:${Date.now()}`);

    let hasFailure = false;

    try {
      const config = DEMO_PROFILES[profile];
      if (!config) return false;

      // Mandatory Onboarding Operation
      if (!user.is_onboarded) {
        try {
          await customApi.post('/users/me/onboarding/complete', {
            profiles: [profile],
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            working_hours: config.workingHours,
            focus_block_minutes: config.focusBlockMinutes,
            break_minutes: config.breakMinutes,
          });
          user.is_onboarded = true;
          safeLocalStorageSet('dayfold_user', JSON.stringify(user));
        } catch (onboardingErr) {
          console.error('Demo onboarding required operation failed:', onboardingErr);
          hasFailure = true;
          return false; // Exit early on onboarding failure so no partial seeding occurs
        }
      }

      // Defensive relative date/time policy:
      // Anchor sample events to today's date so they display on /today.
      // If user logs in during late afternoon or evening (>= 17:00), adjust upcoming sample events
      // so that at least one event is upcoming tonight rather than having every event in the past.
      const now = new Date();
      const currentHour = now.getHours();
      const isEvening = currentHour >= 17;

      const getEventTimes = (eSpec: DemoProfileEventSpec, index: number, totalEvents: number) => {
        const durationMs = ((eSpec.end_hour - eSpec.start_hour) * 60 + (eSpec.end_minute - eSpec.start_minute)) * 60 * 1000;
        const startD = new Date(now);

        if (isEvening && index === totalEvents - 1) {
          const eveningStartHour = Math.min(Math.max(currentHour + 1, eSpec.start_hour), 21);
          startD.setHours(eveningStartHour, 0, 0, 0);
        } else {
          startD.setHours(eSpec.start_hour, eSpec.start_minute, 0, 0);
        }
        const endD = new Date(startD.getTime() + durationMs);
        return {
          starts_at: startD.toISOString(),
          ends_at: endD.toISOString(),
        };
      };

      const getTaskDeadline = (deadlineHour?: number) => {
        if (deadlineHour === undefined) return null;
        const d = new Date(now);
        if (isEvening && deadlineHour <= currentHour) {
          d.setHours(Math.min(currentHour + 2, 23), 59, 0, 0);
        } else {
          d.setHours(deadlineHour, 0, 0, 0);
        }
        return d.toISOString();
      };

      // 2. Fetch existing tasks and events concurrently (1 roundtrip instead of 2)
      let existingTasks: any[] | null = null;
      let existingEvents: any[] | null = null;

      try {
        const [tasksRes, eventsRes] = await Promise.all([
          customApi.get('/tasks'),
          customApi.get('/calendar/events'),
        ]);
        existingTasks = extractArray<any>(tasksRes.data);
        existingEvents = extractArray<any>(eventsRes.data);
      } catch (fetchErr) {
        console.warn('Failed to fetch existing records for demo reconciliation:', fetchErr);
        hasFailure = true;
      }

      if (existingTasks === null || existingEvents === null) {
        console.error('Failed to parse tasks or events envelope; aborting reconciliation');
        hasFailure = true;
        return false;
      }

      // 3. Reconcile missing tasks and calendar events in parallel
      const seedOperations: Promise<void>[] = [];

      for (const tSpec of config.tasks) {
        const marker = `[demo_seed:${tSpec.seed_id}]`;
        const alreadyExists = existingTasks.some(
          (t) => typeof t?.description === 'string' && t.description.includes(marker)
        );

        if (!alreadyExists) {
          seedOperations.push(
            (async () => {
              try {
                await customApi.post('/tasks', {
                  title: tSpec.title,
                  priority: tSpec.priority,
                  estimate_minutes: tSpec.estimate_minutes,
                  deadline_at: getTaskDeadline(tSpec.deadline_hour),
                  lens: tSpec.lens,
                  description: `${marker} Auto-generated demo task for ${profile} profile.`,
                });
              } catch (tErr) {
                console.warn(`Failed to seed demo task "${tSpec.title}":`, tErr);
                hasFailure = true;
              }
            })()
          );
        }
      }

      for (let i = 0; i < config.events.length; i++) {
        const eSpec = config.events[i];
        const marker = `[demo_seed:${eSpec.seed_id}]`;
        const alreadyExists = existingEvents.some(
          (e) => typeof e?.description === 'string' && e.description.includes(marker)
        );

        if (!alreadyExists) {
          seedOperations.push(
            (async () => {
              try {
                const { starts_at, ends_at } = getEventTimes(eSpec, i, config.events.length);
                await customApi.post('/calendar/events', {
                  title: eSpec.title,
                  starts_at,
                  ends_at,
                  is_busy: eSpec.is_busy,
                  description: `${marker} Auto-generated demo calendar event for ${profile} profile.`,
                });
              } catch (eErr) {
                console.warn(`Failed to seed demo event "${eSpec.title}":`, eErr);
                hasFailure = true;
              }
            })()
          );
        }
      }

      if (seedOperations.length > 0) {
        await Promise.all(seedOperations);
      }

      // 4. Ensure a baseline plan exists (optional optimization)
      try {
        const plansRes = await customApi.get('/plans');
        const existingPlans = extractArray<any>(plansRes.data);
        if (existingPlans && existingPlans.length === 0) {
          try {
            await customApi.post('/plans/generate', { horizon_hours: 12 });
          } catch (planErr) {
            console.warn('Optional plan generation failed during demo init:', planErr);
          }
        }
      } catch (planErr) {
        console.warn('Failed to inspect plans during demo init:', planErr);
      }

      return !hasFailure;
    } catch (err) {
      console.error('Unexpected error during demo data initialization:', err);
      hasFailure = true;
      return false;
    } finally {
      if (!hasFailure) {
        safeSessionStorageSet(lockKey, 'completed');
      } else {
        safeSessionStorageRemove(lockKey);
      }
    }
  };

  const initPromise = runInit().finally(() => {
    inFlightInitPromises.delete(user.id);
  });
  inFlightInitPromises.set(user.id, initPromise);

  return await initPromise;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  demoLogin: (profile: 'student' | 'professional' | 'personal') => Promise<void>;
  resetDemoData: () => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: safeParseUser(safeLocalStorageGet('dayfold_user')),
  token: safeLocalStorageGet('dayfold_access_token'),
  isLoading: false,
  isAuthenticated: !!(safeLocalStorageGet('dayfold_access_token') || safeLocalStorageGet('dayfold_user')),

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user, access_token, refresh_token } = res.data;
      if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
        throw new Error('Authentication response missing valid access token');
      }
      const validAccessToken = access_token.trim();
      safeLocalStorageSet('dayfold_access_token', validAccessToken);
      if (refresh_token && typeof refresh_token === 'string' && refresh_token.trim()) {
        safeLocalStorageSet('dayfold_refresh_token', refresh_token.trim());
      }
      if (user) {
        safeLocalStorageSet('dayfold_user', JSON.stringify(user));
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
      safeLocalStorageSet('dayfold_access_token', validAccessToken);
      if (refresh_token && typeof refresh_token === 'string' && refresh_token.trim()) {
        safeLocalStorageSet('dayfold_refresh_token', refresh_token.trim());
      }
      if (user) {
        safeLocalStorageSet('dayfold_user', JSON.stringify(user));
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
      let demoSessionId = safeLocalStorageGet('dayfold_demo_session_id');
      if (!demoSessionId) {
        demoSessionId = Math.random().toString(36).substring(2, 8);
        safeLocalStorageSet('dayfold_demo_session_id', demoSessionId);
      }

      const email = `demo.${profile}.${demoSessionId}@dayfold.app`;
      const password = 'DemoPassword123!';
      const displayName = DEMO_PROFILES[profile]?.displayName || `${profile.charAt(0).toUpperCase() + profile.slice(1)} Demo`;

      let res;
      try {
        res = await api.post('/auth/login', { email, password });
      } catch (loginErr: any) {
        const statusCode = loginErr?.response?.status;
        // Only 401 or 404 triggers registration fallback
        if (statusCode === 401 || statusCode === 404) {
          try {
            res = await api.post('/auth/register', { email, password, display_name: displayName });
          } catch (regErr: any) {
            if (regErr?.response?.status === 409) {
              // Concurrency conflict retry: account was registered concurrently
              res = await api.post('/auth/login', { email, password });
            } else {
              throw regErr;
            }
          }
        } else {
          // Network errors, 500 server errors, 429 rate limit etc. surfaced directly
          throw loginErr;
        }
      }

      const { user, access_token, refresh_token } = res.data || {};
      if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
        throw new Error('Demo login response missing valid access token');
      }
      const validAccessToken = access_token.trim();
      safeLocalStorageSet('dayfold_access_token', validAccessToken);
      if (refresh_token && typeof refresh_token === 'string' && refresh_token.trim()) {
        safeLocalStorageSet('dayfold_refresh_token', refresh_token.trim());
      }
      if (user) {
        safeLocalStorageSet('dayfold_user', JSON.stringify(user));
      }
      safeLocalStorageSet('dayfold_lens', profile);

      set({ user, token: validAccessToken, isAuthenticated: true });

      // Immediately activate the matching lens in workspace store
      const { useWorkspaceStore } = await import('./useWorkspaceStore');
      useWorkspaceStore.getState().setLens(profile);

      // Self-healing, idempotent initialization of profile-tailored demo sample data
      await ensureDemoDataInitialized(profile, user);

      set({ user, token: validAccessToken, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  /**
   * Resets local demo identity and browser session data.
   * NOTE: This is a client-side session reset utility that purges the active demo session ID,
   * authentication tokens, and initialization locks from browser storage. It safely revokes
   * the active session on the backend via /auth/logout, but DOES NOT delete historical backend
   * records (tasks, events, plans) from the database.
   *
   * Safety guard: This operation is strictly restricted to verified demo accounts
   * (emails matching demo.*@dayfold.app) and will never clear normal registered user data.
   */
  resetDemoData: async () => {
    const currentUser = safeParseUser(safeLocalStorageGet('dayfold_user'));
    // Safety guard: only execute for verified demo accounts
    if (!currentUser?.email || !currentUser.email.startsWith('demo.') || !currentUser.email.endsWith('@dayfold.app')) {
      console.warn('resetDemoData safety check: Cannot reset non-demo account');
      return;
    }

    const accessToken = safeLocalStorageGet('dayfold_access_token');
    const refreshToken = safeLocalStorageGet('dayfold_refresh_token');

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      await api.post('/auth/logout', { refresh_token: refreshToken }, { headers });
    } catch {
      // Server-side revocation attempt caught without suppressing client cleanup or claiming false success
    }

    safeLocalStorageRemove('dayfold_demo_session_id');
    safeLocalStorageRemove('dayfold_user');
    safeLocalStorageRemove('dayfold_access_token');
    safeLocalStorageRemove('dayfold_refresh_token');
    safeLocalStorageRemove('dayfold_lens');

    try {
      if (typeof sessionStorage !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith('dayfold_demo_seeding_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => sessionStorage.removeItem(key));
      }
    } catch { }

    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  logout: () => {
    const accessToken = safeLocalStorageGet('dayfold_access_token');
    const refreshToken = safeLocalStorageGet('dayfold_refresh_token');

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    api.post('/auth/logout', { refresh_token: refreshToken }, { headers }).catch(() => {
      // Network failure during logout caught gracefully
    });

    safeLocalStorageRemove('dayfold_user');
    safeLocalStorageRemove('dayfold_access_token');
    safeLocalStorageRemove('dayfold_refresh_token');

    set({ user: null, token: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const token = safeLocalStorageGet('dayfold_access_token');
    const cachedUser = safeLocalStorageGet('dayfold_user');
    const refreshToken = safeLocalStorageGet('dayfold_refresh_token');

    if (!token && !cachedUser && !refreshToken) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    try {
      const res = await api.get('/auth/me');
      const latestToken = safeLocalStorageGet('dayfold_access_token') || token || null;
      safeLocalStorageSet('dayfold_user', JSON.stringify(res.data));
      set({ user: res.data, token: latestToken, isAuthenticated: true });
    } catch {
      safeLocalStorageRemove('dayfold_user');
      safeLocalStorageRemove('dayfold_access_token');
      safeLocalStorageRemove('dayfold_refresh_token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },
}));
