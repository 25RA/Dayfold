var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// frontend/src/store/useWorkspaceStore.ts
var useWorkspaceStore_exports = {};
__export(useWorkspaceStore_exports, {
  useWorkspaceStore: () => useWorkspaceStore
});
import { create } from "zustand";
var TERMINOLOGY_MAP, useWorkspaceStore;
var init_useWorkspaceStore = __esm({
  "frontend/src/store/useWorkspaceStore.ts"() {
    TERMINOLOGY_MAP = {
      student: {
        taskSingular: "Assignment / Study Task",
        taskPlural: "Assignments & Study",
        focusBlockName: "Study Block",
        projectTerm: "Course / Subject",
        scheduleAction: "Plan Study Schedule",
        emptyStatePrompt: "Add your upcoming assignments, exams, or class lectures..."
      },
      professional: {
        taskSingular: "Deliverable",
        taskPlural: "Deliverables & Follow-ups",
        focusBlockName: "Focus Block",
        projectTerm: "Project / Initiative",
        scheduleAction: "Organize Workday",
        emptyStatePrompt: "Add client meetings, deliverables, and focus commitments..."
      },
      personal: {
        taskSingular: "Errand / Commitment",
        taskPlural: "Errands & Routines",
        focusBlockName: "Dedicated Time",
        projectTerm: "Life Area",
        scheduleAction: "Plan My Day",
        emptyStatePrompt: "Add errands, personal goals, doctor visits, or routines..."
      },
      all: {
        taskSingular: "Task",
        taskPlural: "All Commitments",
        focusBlockName: "Focus Block",
        projectTerm: "Project",
        scheduleAction: "Plan The Day",
        emptyStatePrompt: "Tell Dayfold what you need to achieve today..."
      }
    };
    useWorkspaceStore = create((set) => {
      const savedTheme = typeof window !== "undefined" ? localStorage.getItem("dayfold_theme") : null;
      const initialTheme = savedTheme || "light";
      const initialLens = (typeof window !== "undefined" ? localStorage.getItem("dayfold_lens") : null) || "student";
      if (typeof document !== "undefined") {
        if (initialTheme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
      return {
        lens: initialLens,
        theme: initialTheme,
        selectedDate: /* @__PURE__ */ new Date(),
        terms: TERMINOLOGY_MAP[initialLens],
        setLens: (lens) => {
          localStorage.setItem("dayfold_lens", lens);
          set({ lens, terms: TERMINOLOGY_MAP[lens] });
        },
        setTheme: (theme) => {
          localStorage.setItem("dayfold_theme", theme);
          if (theme === "dark") {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
          set({ theme });
        },
        toggleTheme: () => {
          set((state) => {
            const next = state.theme === "light" ? "dark" : "light";
            localStorage.setItem("dayfold_theme", next);
            if (next === "dark") {
              document.documentElement.classList.add("dark");
            } else {
              document.documentElement.classList.remove("dark");
            }
            return { theme: next };
          });
        },
        setSelectedDate: (selectedDate) => set({ selectedDate })
      };
    });
  }
});

// frontend/src/store/useAuthStore.ts
import { create as create2 } from "zustand";

// frontend/src/lib/api.ts
import axios from "axios";
var apiBase = '"http://localhost:8000"' ? `${'"http://localhost:8000"'.replace(/\/$/, "")}/api/v1` : "/api/v1";
var api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
  // Send and receive HttpOnly SameSite authentication cookies
  headers: {
    "Content-Type": "application/json"
  }
});
function getCsrfToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)dayfold_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
api.interceptors.request.use((config) => {
  if (typeof localStorage !== "undefined") {
    const token = localStorage.getItem("dayfold_access_token");
    if (token && config.headers) {
      const hasAuth = typeof config.headers.get === "function" ? !!config.headers.get("Authorization") : !!config.headers["Authorization"];
      if (!hasAuth) {
        if (typeof config.headers.set === "function") {
          config.headers.set("Authorization", `Bearer ${token}`);
        } else {
          config.headers["Authorization"] = `Bearer ${token}`;
        }
      }
    }
  }
  const method = config.method?.toUpperCase();
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken && config.headers) {
      config.headers["X-CSRF-Token"] = csrfToken;
    }
  }
  return config;
});
function clearStoredAuthAndRedirect() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("dayfold_user");
    localStorage.removeItem("dayfold_access_token");
    localStorage.removeItem("dayfold_refresh_token");
  }
  if (typeof window !== "undefined" && window.location.pathname !== "/login" && window.location.pathname !== "/signup" && window.location.pathname !== "/") {
    window.location.href = "/login";
  }
}
var isRefreshing = false;
var failedQueue = [];
var processQueue = (error = null, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    } else {
      prom.reject(new Error("Session refresh failed: missing access token."));
    }
  });
  failedQueue = [];
};
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || "";
    const isAuthEndpoint = requestUrl.includes("/auth/login") || requestUrl.includes("/auth/register") || requestUrl.includes("/auth/refresh") || requestUrl.includes("/auth/logout");
    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest) {
            originalRequest._retry = true;
            if (originalRequest.headers) {
              if (typeof originalRequest.headers.set === "function") {
                originalRequest.headers.set("Authorization", `Bearer ${token}`);
              } else {
                originalRequest.headers["Authorization"] = `Bearer ${token}`;
              }
            }
          }
          return api(originalRequest);
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      const refreshToken = typeof localStorage !== "undefined" ? localStorage.getItem("dayfold_refresh_token") : null;
      if (!refreshToken || !refreshToken.trim()) {
        isRefreshing = false;
        const noTokenError = new Error("No refresh token available");
        processQueue(noTokenError, null);
        clearStoredAuthAndRedirect();
        return Promise.reject(error);
      }
      try {
        const refreshRes = await api.post("/auth/refresh", { refresh_token: refreshToken.trim() });
        const { access_token, refresh_token: newRefreshToken, user } = refreshRes.data || {};
        if (!access_token || typeof access_token !== "string" || !access_token.trim()) {
          throw new Error("Refresh response missing valid access token");
        }
        const validAccessToken = access_token.trim();
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("dayfold_access_token", validAccessToken);
          if (newRefreshToken && typeof newRefreshToken === "string" && newRefreshToken.trim()) {
            localStorage.setItem("dayfold_refresh_token", newRefreshToken.trim());
          }
          if (user) {
            localStorage.setItem("dayfold_user", JSON.stringify(user));
          }
        }
        isRefreshing = false;
        processQueue(null, validAccessToken);
        if (originalRequest?.headers) {
          if (typeof originalRequest.headers.set === "function") {
            originalRequest.headers.set("Authorization", `Bearer ${validAccessToken}`);
          } else {
            originalRequest.headers["Authorization"] = `Bearer ${validAccessToken}`;
          }
        }
        return api(originalRequest);
      } catch (refreshErr) {
        isRefreshing = false;
        processQueue(refreshErr, null);
        clearStoredAuthAndRedirect();
        return Promise.reject(refreshErr);
      }
    }
    if (error.response?.status === 401 && isAuthEndpoint) {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("dayfold_user");
        localStorage.removeItem("dayfold_access_token");
        localStorage.removeItem("dayfold_refresh_token");
      }
    }
    return Promise.reject(error);
  }
);
var api_default = api;

// frontend/src/store/useAuthStore.ts
var DEMO_PROFILES = {
  student: {
    displayName: "Alex Chen (Student)",
    focusBlockMinutes: 60,
    breakMinutes: 15,
    workingHours: {
      monday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      tuesday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      wednesday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      thursday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      friday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 },
      saturday: { start_hour: 9, start_minute: 0, end_hour: 20, end_minute: 0 },
      sunday: { start_hour: 10, start_minute: 0, end_hour: 20, end_minute: 0 }
    },
    tasks: [
      {
        seed_id: "student_task_1",
        title: "CS 450 Problem Set 3 (Paging & Virtual Memory)",
        priority: 1,
        estimate_minutes: 90,
        deadline_hour: 18,
        lens: "student"
      },
      {
        seed_id: "student_task_2",
        title: "Read Distributed Systems Chapter 4",
        priority: 2,
        estimate_minutes: 60,
        deadline_hour: 21,
        lens: "student"
      },
      {
        seed_id: "student_task_3",
        title: "Review Midterm Practice Solutions",
        priority: 3,
        estimate_minutes: 45,
        lens: "student"
      }
    ],
    events: [
      {
        seed_id: "student_event_1",
        title: "CS 450 Lecture: Memory Virtualization",
        start_hour: 10,
        start_minute: 0,
        end_hour: 11,
        end_minute: 30,
        is_busy: true
      },
      {
        seed_id: "student_event_2",
        title: "Distributed Systems Lab",
        start_hour: 14,
        start_minute: 0,
        end_hour: 15,
        end_minute: 30,
        is_busy: true
      }
    ]
  },
  professional: {
    displayName: "Sarah Vance (Staff Lead)",
    focusBlockMinutes: 90,
    breakMinutes: 15,
    workingHours: {
      monday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      tuesday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      wednesday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      thursday: { start_hour: 9, start_minute: 0, end_hour: 19, end_minute: 0 },
      friday: { start_hour: 9, start_minute: 0, end_hour: 18, end_minute: 0 }
    },
    tasks: [
      {
        seed_id: "prof_task_1",
        title: "Q4 Product Strategy Memo Draft",
        priority: 1,
        estimate_minutes: 90,
        deadline_hour: 17,
        lens: "professional"
      },
      {
        seed_id: "prof_task_2",
        title: "Design System Architectural Review",
        priority: 2,
        estimate_minutes: 60,
        deadline_hour: 19,
        lens: "professional"
      },
      {
        seed_id: "prof_task_3",
        title: "Team 1:1 Agenda & OKR Follow-ups",
        priority: 3,
        estimate_minutes: 30,
        lens: "professional"
      }
    ],
    events: [
      {
        seed_id: "prof_event_1",
        title: "Leadership Alignment Sync",
        start_hour: 11,
        start_minute: 0,
        end_hour: 12,
        end_minute: 0,
        is_busy: true
      },
      {
        seed_id: "prof_event_2",
        title: "Cross-functional Architecture Review",
        start_hour: 14,
        start_minute: 0,
        end_hour: 15,
        end_minute: 0,
        is_busy: true
      }
    ]
  },
  personal: {
    displayName: "Jordan Miller (Personal)",
    focusBlockMinutes: 45,
    breakMinutes: 15,
    workingHours: {
      monday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      tuesday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      wednesday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      thursday: { start_hour: 7, start_minute: 0, end_hour: 22, end_minute: 0 },
      friday: { start_hour: 7, start_minute: 0, end_hour: 23, end_minute: 0 },
      saturday: { start_hour: 8, start_minute: 0, end_hour: 23, end_minute: 0 },
      sunday: { start_hour: 8, start_minute: 0, end_hour: 22, end_minute: 0 }
    },
    tasks: [
      {
        seed_id: "pers_task_1",
        title: "Schedule Annual Dental Checkup",
        priority: 1,
        estimate_minutes: 30,
        deadline_hour: 16,
        lens: "personal"
      },
      {
        seed_id: "pers_task_2",
        title: "Weekly Grocery Restock & Meal Prep",
        priority: 2,
        estimate_minutes: 60,
        lens: "personal"
      },
      {
        seed_id: "pers_task_3",
        title: "Vehicle Registration Renewal",
        priority: 3,
        estimate_minutes: 45,
        lens: "personal"
      }
    ],
    events: [
      {
        seed_id: "pers_event_1",
        title: "Pediatrician Follow-up Appointment",
        start_hour: 13,
        start_minute: 0,
        end_hour: 14,
        end_minute: 0,
        is_busy: true
      },
      {
        seed_id: "pers_event_2",
        title: "Evening Yoga & Mobility Session",
        start_hour: 18,
        start_minute: 30,
        end_hour: 19,
        end_minute: 30,
        is_busy: true
      }
    ]
  }
};
function safeLocalStorageGet(key) {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch {
  }
  return null;
}
function safeLocalStorageSet(key, value) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
  }
}
function safeLocalStorageRemove(key) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {
  }
}
function safeSessionStorageGet(key) {
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem(key);
    }
  } catch {
  }
  return null;
}
function safeSessionStorageSet(key, value) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, value);
    }
  } catch {
  }
}
function safeSessionStorageRemove(key) {
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(key);
    }
  } catch {
  }
}
function safeParseUser(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.email === "string") {
      return parsed;
    }
  } catch {
  }
  return null;
}
function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data;
    for (const key of ["items", "data", "tasks", "events", "plans"]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return null;
}
var LOCK_LEASE_MS = 3e4;
var inFlightInitPromises = /* @__PURE__ */ new Map();
async function ensureDemoDataInitialized(profile, user, customApi = api_default) {
  if (!user?.email || !user.email.startsWith("demo.") || !user.email.endsWith("@dayfold.app")) {
    return false;
  }
  if (inFlightInitPromises.has(user.id)) {
    const activePromise = inFlightInitPromises.get(user.id);
    if (activePromise) {
      return await activePromise;
    }
  }
  const runInit = async () => {
    const lockKey = `dayfold_demo_seeding_${user.id}`;
    const currentStatus = safeSessionStorageGet(lockKey);
    if (currentStatus === "completed") {
      return true;
    }
    if (currentStatus && currentStatus.startsWith("in_progress:")) {
      const lockTimestamp = parseInt(currentStatus.slice("in_progress:".length), 10);
      if (!isNaN(lockTimestamp) && Date.now() - lockTimestamp < LOCK_LEASE_MS) {
        return false;
      }
    }
    safeSessionStorageSet(lockKey, `in_progress:${Date.now()}`);
    let hasFailure = false;
    try {
      const config = DEMO_PROFILES[profile];
      if (!config) return false;
      if (!user.is_onboarded) {
        try {
          await customApi.post("/users/me/onboarding/complete", {
            profiles: [profile],
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            working_hours: config.workingHours,
            focus_block_minutes: config.focusBlockMinutes,
            break_minutes: config.breakMinutes
          });
          user.is_onboarded = true;
          safeLocalStorageSet("dayfold_user", JSON.stringify(user));
        } catch (onboardingErr) {
          console.error("Demo onboarding required operation failed:", onboardingErr);
          hasFailure = true;
          return false;
        }
      }
      const now = /* @__PURE__ */ new Date();
      const currentHour = now.getHours();
      const isEvening = currentHour >= 17;
      const getEventTimes = (eSpec, index, totalEvents) => {
        const durationMs = ((eSpec.end_hour - eSpec.start_hour) * 60 + (eSpec.end_minute - eSpec.start_minute)) * 60 * 1e3;
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
          ends_at: endD.toISOString()
        };
      };
      const getTaskDeadline = (deadlineHour) => {
        if (deadlineHour === void 0) return null;
        const d = new Date(now);
        if (isEvening && deadlineHour <= currentHour) {
          d.setHours(Math.min(currentHour + 2, 23), 59, 0, 0);
        } else {
          d.setHours(deadlineHour, 0, 0, 0);
        }
        return d.toISOString();
      };
      let existingTasks = null;
      let existingEvents = null;
      try {
        const [tasksRes, eventsRes] = await Promise.all([
          customApi.get("/tasks"),
          customApi.get("/calendar/events")
        ]);
        existingTasks = extractArray(tasksRes.data);
        existingEvents = extractArray(eventsRes.data);
      } catch (fetchErr) {
        console.warn("Failed to fetch existing records for demo reconciliation:", fetchErr);
        hasFailure = true;
      }
      if (existingTasks === null || existingEvents === null) {
        console.error("Failed to parse tasks or events envelope; aborting reconciliation");
        hasFailure = true;
        return false;
      }
      const seedOperations = [];
      for (const tSpec of config.tasks) {
        const marker = `[demo_seed:${tSpec.seed_id}]`;
        const alreadyExists = existingTasks.some(
          (t) => typeof t?.description === "string" && t.description.includes(marker)
        );
        if (!alreadyExists) {
          seedOperations.push(
            (async () => {
              try {
                await customApi.post("/tasks", {
                  title: tSpec.title,
                  priority: tSpec.priority,
                  estimate_minutes: tSpec.estimate_minutes,
                  deadline_at: getTaskDeadline(tSpec.deadline_hour),
                  lens: tSpec.lens,
                  description: `${marker} Auto-generated demo task for ${profile} profile.`
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
          (e) => typeof e?.description === "string" && e.description.includes(marker)
        );
        if (!alreadyExists) {
          seedOperations.push(
            (async () => {
              try {
                const { starts_at, ends_at } = getEventTimes(eSpec, i, config.events.length);
                await customApi.post("/calendar/events", {
                  title: eSpec.title,
                  starts_at,
                  ends_at,
                  is_busy: eSpec.is_busy,
                  description: `${marker} Auto-generated demo calendar event for ${profile} profile.`
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
      try {
        const plansRes = await customApi.get("/plans");
        const existingPlans = extractArray(plansRes.data);
        if (existingPlans && existingPlans.length === 0) {
          try {
            await customApi.post("/plans/generate", { horizon_hours: 12 });
          } catch (planErr) {
            console.warn("Optional plan generation failed during demo init:", planErr);
          }
        }
      } catch (planErr) {
        console.warn("Failed to inspect plans during demo init:", planErr);
      }
      return !hasFailure;
    } catch (err) {
      console.error("Unexpected error during demo data initialization:", err);
      hasFailure = true;
      return false;
    } finally {
      if (!hasFailure) {
        safeSessionStorageSet(lockKey, "completed");
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
var useAuthStore = create2((set) => ({
  user: safeParseUser(safeLocalStorageGet("dayfold_user")),
  token: safeLocalStorageGet("dayfold_access_token"),
  isLoading: false,
  isAuthenticated: !!(safeLocalStorageGet("dayfold_access_token") || safeLocalStorageGet("dayfold_user")),
  login: async (email, password) => {
    set({ isLoading: true });
    try {
      const res = await api_default.post("/auth/login", { email, password });
      const { user, access_token, refresh_token } = res.data;
      if (!access_token || typeof access_token !== "string" || !access_token.trim()) {
        throw new Error("Authentication response missing valid access token");
      }
      const validAccessToken = access_token.trim();
      safeLocalStorageSet("dayfold_access_token", validAccessToken);
      if (refresh_token && typeof refresh_token === "string" && refresh_token.trim()) {
        safeLocalStorageSet("dayfold_refresh_token", refresh_token.trim());
      }
      if (user) {
        safeLocalStorageSet("dayfold_user", JSON.stringify(user));
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
      const res = await api_default.post("/auth/register", { email, password, display_name: displayName });
      const { user, access_token, refresh_token } = res.data;
      if (!access_token || typeof access_token !== "string" || !access_token.trim()) {
        throw new Error("Registration response missing valid access token");
      }
      const validAccessToken = access_token.trim();
      safeLocalStorageSet("dayfold_access_token", validAccessToken);
      if (refresh_token && typeof refresh_token === "string" && refresh_token.trim()) {
        safeLocalStorageSet("dayfold_refresh_token", refresh_token.trim());
      }
      if (user) {
        safeLocalStorageSet("dayfold_user", JSON.stringify(user));
      }
      set({ user, token: validAccessToken, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },
  demoLogin: async (profile) => {
    set({ isLoading: true });
    try {
      let demoSessionId = safeLocalStorageGet("dayfold_demo_session_id");
      if (!demoSessionId) {
        demoSessionId = Math.random().toString(36).substring(2, 8);
        safeLocalStorageSet("dayfold_demo_session_id", demoSessionId);
      }
      const email = `demo.${profile}.${demoSessionId}@dayfold.app`;
      const password = "DemoPassword123!";
      const displayName = DEMO_PROFILES[profile]?.displayName || `${profile.charAt(0).toUpperCase() + profile.slice(1)} Demo`;
      let res;
      try {
        res = await api_default.post("/auth/login", { email, password });
      } catch (loginErr) {
        const statusCode = loginErr?.response?.status;
        if (statusCode === 401 || statusCode === 404) {
          try {
            res = await api_default.post("/auth/register", { email, password, display_name: displayName });
          } catch (regErr) {
            if (regErr?.response?.status === 409) {
              res = await api_default.post("/auth/login", { email, password });
            } else {
              throw regErr;
            }
          }
        } else {
          throw loginErr;
        }
      }
      const { user, access_token, refresh_token } = res.data || {};
      if (!access_token || typeof access_token !== "string" || !access_token.trim()) {
        throw new Error("Demo login response missing valid access token");
      }
      const validAccessToken = access_token.trim();
      safeLocalStorageSet("dayfold_access_token", validAccessToken);
      if (refresh_token && typeof refresh_token === "string" && refresh_token.trim()) {
        safeLocalStorageSet("dayfold_refresh_token", refresh_token.trim());
      }
      if (user) {
        safeLocalStorageSet("dayfold_user", JSON.stringify(user));
      }
      safeLocalStorageSet("dayfold_lens", profile);
      set({ user, token: validAccessToken, isAuthenticated: true });
      const { useWorkspaceStore: useWorkspaceStore2 } = await Promise.resolve().then(() => (init_useWorkspaceStore(), useWorkspaceStore_exports));
      useWorkspaceStore2.getState().setLens(profile);
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
    const currentUser = safeParseUser(safeLocalStorageGet("dayfold_user"));
    if (!currentUser?.email || !currentUser.email.startsWith("demo.") || !currentUser.email.endsWith("@dayfold.app")) {
      console.warn("resetDemoData safety check: Cannot reset non-demo account");
      return;
    }
    const accessToken = safeLocalStorageGet("dayfold_access_token");
    const refreshToken = safeLocalStorageGet("dayfold_refresh_token");
    const headers = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    try {
      await api_default.post("/auth/logout", { refresh_token: refreshToken }, { headers });
    } catch {
    }
    safeLocalStorageRemove("dayfold_demo_session_id");
    safeLocalStorageRemove("dayfold_user");
    safeLocalStorageRemove("dayfold_access_token");
    safeLocalStorageRemove("dayfold_refresh_token");
    safeLocalStorageRemove("dayfold_lens");
    try {
      if (typeof sessionStorage !== "undefined") {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("dayfold_demo_seeding_")) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => sessionStorage.removeItem(key));
      }
    } catch {
    }
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },
  logout: () => {
    const accessToken = safeLocalStorageGet("dayfold_access_token");
    const refreshToken = safeLocalStorageGet("dayfold_refresh_token");
    const headers = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    api_default.post("/auth/logout", { refresh_token: refreshToken }, { headers }).catch(() => {
    });
    safeLocalStorageRemove("dayfold_user");
    safeLocalStorageRemove("dayfold_access_token");
    safeLocalStorageRemove("dayfold_refresh_token");
    set({ user: null, token: null, isAuthenticated: false });
  },
  checkAuth: async () => {
    const token = safeLocalStorageGet("dayfold_access_token");
    const cachedUser = safeLocalStorageGet("dayfold_user");
    const refreshToken = safeLocalStorageGet("dayfold_refresh_token");
    if (!token && !cachedUser && !refreshToken) {
      set({ user: null, token: null, isAuthenticated: false });
      return;
    }
    try {
      const res = await api_default.get("/auth/me");
      const latestToken = safeLocalStorageGet("dayfold_access_token") || token || null;
      safeLocalStorageSet("dayfold_user", JSON.stringify(res.data));
      set({ user: res.data, token: latestToken, isAuthenticated: true });
    } catch {
      safeLocalStorageRemove("dayfold_user");
      safeLocalStorageRemove("dayfold_access_token");
      safeLocalStorageRemove("dayfold_refresh_token");
      set({ user: null, token: null, isAuthenticated: false });
    }
  }
}));
export {
  DEMO_PROFILES,
  LOCK_LEASE_MS,
  ensureDemoDataInitialized,
  extractArray,
  inFlightInitPromises,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeParseUser,
  safeSessionStorageGet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
  useAuthStore
};
