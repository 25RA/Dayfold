import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureDemoDataInitialized,
  safeParseUser,
  DEMO_PROFILES,
  inFlightInitPromises,
  useAuthStore,
} from './useAuthStore.test.mjs';

// Setup Mock In-Memory Storage
const mockSessionStorage = new Map();
const mockLocalStorage = new Map();

globalThis.sessionStorage = {
  getItem: (k) => mockSessionStorage.get(k) ?? null,
  setItem: (k, v) => mockSessionStorage.set(k, String(v)),
  removeItem: (k) => mockSessionStorage.delete(k),
  clear: () => mockSessionStorage.clear(),
  get length() { return mockSessionStorage.size; },
  key: (i) => Array.from(mockSessionStorage.keys())[i] ?? null,
  [Symbol.iterator]: function* () { yield* mockSessionStorage.keys(); }
};
Object.defineProperty(globalThis.sessionStorage, 'forEach', {
  value: (cb) => mockSessionStorage.forEach((v, k) => cb(k))
});

globalThis.localStorage = {
  getItem: (k) => mockLocalStorage.get(k) ?? null,
  setItem: (k, v) => mockLocalStorage.set(k, String(v)),
  removeItem: (k) => mockLocalStorage.delete(k),
  clear: () => mockLocalStorage.clear(),
  get length() { return mockLocalStorage.size; },
  key: (i) => Array.from(mockLocalStorage.keys())[i] ?? null,
  [Symbol.iterator]: function* () { yield* mockLocalStorage.keys(); }
};

function createMockApi(overrides = {}) {
  const store = {
    onboardingCompleted: false,
    tasks: [],
    events: [],
    plans: [],
    calls: [],
  };

  const api = {
    store,
    get: async (url) => {
      store.calls.push({ method: 'GET', url });
      if (overrides.get) {
        const custom = overrides.get(url, store);
        if (custom !== undefined) return custom;
      }
      if (url === '/tasks') return { data: store.tasks };
      if (url === '/calendar/events') return { data: store.events };
      if (url === '/plans') return { data: store.plans };
      return { data: [] };
    },
    post: async (url, data) => {
      store.calls.push({ method: 'POST', url, data });
      if (overrides.post) {
        const custom = overrides.post(url, data, store);
        if (custom !== undefined) return custom;
      }
      if (url === '/users/me/onboarding/complete') {
        store.onboardingCompleted = true;
        return { data: { status: 'ok' } };
      }
      if (url === '/tasks') {
        const item = { id: `task_${Date.now()}_${Math.random()}`, ...data };
        store.tasks.push(item);
        return { data: item };
      }
      if (url === '/calendar/events') {
        const item = { id: `event_${Date.now()}_${Math.random()}`, ...data };
        store.events.push(item);
        return { data: item };
      }
      if (url === '/plans/generate') {
        const plan = { id: `plan_${Date.now()}`, ...data };
        store.plans.push(plan);
        return { data: plan };
      }
      if (url === '/auth/logout') {
        return { data: { status: 'logged_out' } };
      }
      return { data: {} };
    },
  };
  return api;
}

test('1. New demo account initialization', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  const mockApi = createMockApi();
  const user = {
    id: 'usr_student_1',
    email: 'demo.student.sess1@dayfold.app',
    display_name: 'Alex Chen',
    is_onboarded: false,
  };

  const success = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(success, true, 'Initialization must succeed');
  assert.equal(mockApi.store.onboardingCompleted, true, 'Onboarding must be called');
  assert.equal(mockApi.store.tasks.length, 3, 'Student profile must seed 3 tasks');
  assert.equal(mockApi.store.events.length, 2, 'Student profile must seed 2 events');
  assert.equal(mockApi.store.plans.length, 1, 'Baseline plan must be generated');

  const lockStatus = mockSessionStorage.get('dayfold_demo_seeding_usr_student_1');
  assert.equal(lockStatus, 'completed', 'Lock must be marked completed');
});

test('2. Existing account missing sample data (already onboarded)', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  const mockApi = createMockApi();
  const user = {
    id: 'usr_prof_1',
    email: 'demo.professional.sess2@dayfold.app',
    display_name: 'Sarah Vance',
    is_onboarded: true, // Already onboarded
  };

  const success = await ensureDemoDataInitialized('professional', user, mockApi);
  assert.equal(success, true);
  assert.equal(mockApi.store.onboardingCompleted, false, 'Onboarding must not be re-run');
  assert.equal(mockApi.store.tasks.length, 3, 'Professional tasks seeded');
  assert.equal(mockApi.store.events.length, 2, 'Professional events seeded');
});

test('3. Existing account with completed demo tasks is not duplicated', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  const mockApi = createMockApi();
  // Pre-populate with completed demo task
  mockApi.store.tasks.push({
    id: 'existing_t1',
    title: 'CS 450 Problem Set 3 (Paging & Virtual Memory)',
    status: 'done',
    description: '[demo_seed:student_task_1] Completed task',
  });

  const user = {
    id: 'usr_student_3',
    email: 'demo.student.sess3@dayfold.app',
    display_name: 'Alex Chen',
    is_onboarded: true,
  };

  const success = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(success, true);
  // Total tasks should be 3 (the 1 completed + 2 newly seeded, NOT 4)
  assert.equal(mockApi.store.tasks.length, 3);
  const task1Matches = mockApi.store.tasks.filter((t) => t.description.includes('[demo_seed:student_task_1]'));
  assert.equal(task1Matches.length, 1, 'Completed task 1 must not be duplicated');
});

test('4. Onboarding failure followed by successful retry', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  let attempt = 0;
  const mockApi = createMockApi({
    post: (url) => {
      if (url === '/users/me/onboarding/complete') {
        attempt++;
        if (attempt === 1) {
          throw new Error('500 Onboarding database timeout');
        }
      }
    },
  });

  const user = {
    id: 'usr_student_onb_fail',
    email: 'demo.student.fail1@dayfold.app',
    display_name: 'Alex Chen',
    is_onboarded: false,
  };

  // First run fails
  const res1 = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(res1, false, 'First run must report failure');
  const lockStatusAfterFail = mockSessionStorage.get('dayfold_demo_seeding_usr_student_onb_fail');
  assert.equal(lockStatusAfterFail, undefined, 'Lock must be released on failure to permit retry');
  assert.equal(mockApi.store.tasks.length, 0, 'No tasks should be seeded when onboarding fails');

  // Second run succeeds
  const res2 = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(res2, true, 'Retry must succeed');
  assert.equal(mockApi.store.onboardingCompleted, true);
  assert.equal(mockApi.store.tasks.length, 3);
});

test('5. Partial task creation failure followed by successful retry', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  let taskPostCount = 0;
  const mockApi = createMockApi({
    post: (url, data, store) => {
      if (url === '/tasks') {
        taskPostCount++;
        if (taskPostCount === 2) {
          throw new Error('429 Rate limited during task 2');
        }
      }
    },
  });

  const user = {
    id: 'usr_student_task_fail',
    email: 'demo.student.taskfail@dayfold.app',
    display_name: 'Alex Chen',
    is_onboarded: true,
  };

  const res1 = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(res1, false, 'Partial task failure must report failure');
  assert.equal(mockSessionStorage.get('dayfold_demo_seeding_usr_student_task_fail'), undefined, 'Lock must be released');
  assert.equal(mockApi.store.tasks.length, 2, 'Tasks 1 and 3 created (task 2 failed)');

  // Retry run: taskPostCount will not fail now
  const res2 = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(res2, true, 'Retry must succeed');
  assert.equal(mockApi.store.tasks.length, 3, 'All 3 tasks reconciled without duplicating task 1 or 3');
});

test('6. Partial event creation failure followed by successful retry', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  let eventPostCount = 0;
  const mockApi = createMockApi({
    post: (url) => {
      if (url === '/calendar/events') {
        eventPostCount++;
        if (eventPostCount === 1) {
          throw new Error('500 Calendar event lock conflict');
        }
      }
    },
  });

  const user = {
    id: 'usr_student_event_fail',
    email: 'demo.student.eventfail@dayfold.app',
    display_name: 'Alex Chen',
    is_onboarded: true,
  };

  const res1 = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(res1, false, 'Must report failure when an event fails');
  assert.equal(mockSessionStorage.get('dayfold_demo_seeding_usr_student_event_fail'), undefined);

  // Retry
  const res2 = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(res2, true, 'Retry completes remaining event');
  assert.equal(mockApi.store.events.length, 2, 'Exactly 2 events exist');
});

test('7. Interrupted/stale initialization lock recovery', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  const user = {
    id: 'usr_stale_lock',
    email: 'demo.student.stale@dayfold.app',
    display_name: 'Alex Chen',
    is_onboarded: true,
  };

  const lockKey = `dayfold_demo_seeding_${user.id}`;
  // Simulate stale lock from 45 seconds ago (LOCK_LEASE_MS is 30s)
  const staleTimestamp = Date.now() - 45_000;
  mockSessionStorage.set(lockKey, `in_progress:${staleTimestamp}`);

  const mockApi = createMockApi();
  const success = await ensureDemoDataInitialized('student', user, mockApi);
  assert.equal(success, true, 'Must recover stale lock and complete initialization');
  assert.equal(mockSessionStorage.get(lockKey), 'completed');
});

test('8. Concurrent initialization protection within same browser tab', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  const user = {
    id: 'usr_concurrent',
    email: 'demo.student.concurrent@dayfold.app',
    display_name: 'Alex Chen',
    is_onboarded: true,
  };

  const mockApi = createMockApi();

  // Launch two concurrent initializations simultaneously
  const [resA, resB] = await Promise.all([
    ensureDemoDataInitialized('student', user, mockApi),
    ensureDemoDataInitialized('student', user, mockApi),
  ]);

  assert.equal(resA, true);
  assert.equal(resB, true);
  // Tasks must not be duplicated by the concurrent calls
  assert.equal(mockApi.store.tasks.length, 3, 'Must not duplicate tasks during concurrent triggers');
  assert.equal(mockApi.store.events.length, 2, 'Must not duplicate events during concurrent triggers');
});

test('9. Normal account isolation (non-demo emails rejected)', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();
  inFlightInitPromises.clear();

  const normalUsers = [
    { id: 'usr_norm_1', email: 'alice@example.com', display_name: 'Alice', is_onboarded: true },
    { id: 'usr_norm_2', email: 'demo@gmail.com', display_name: 'Imposter', is_onboarded: true },
    { id: 'usr_norm_3', email: 'test.user@dayfold.app', display_name: 'Test', is_onboarded: true },
  ];

  for (const u of normalUsers) {
    const mockApi = createMockApi();
    const success = await ensureDemoDataInitialized('student', u, mockApi);
    assert.equal(success, false, `Normal user ${u.email} must not be seeded`);
    assert.equal(mockApi.store.calls.length, 0, 'Zero API calls should be made for normal user');
  }
});

test('10. All three demo profiles (Student, Professional, Personal)', async () => {
  const profiles = ['student', 'professional', 'personal'];

  for (const prof of profiles) {
    mockSessionStorage.clear();
    mockLocalStorage.clear();
    inFlightInitPromises.clear();

    const user = {
      id: `usr_${prof}`,
      email: `demo.${prof}.sess@dayfold.app`,
      display_name: DEMO_PROFILES[prof].displayName,
      is_onboarded: false,
    };

    const mockApi = createMockApi();
    const success = await ensureDemoDataInitialized(prof, user, mockApi);
    assert.equal(success, true, `Profile ${prof} must initialize successfully`);
    assert.equal(mockApi.store.tasks.length, 3, `${prof} must have 3 tasks`);
    assert.equal(mockApi.store.events.length, 2, `${prof} must have 2 events`);

    // Verify task lenses match profile
    for (const t of mockApi.store.tasks) {
      assert.equal(t.lens, prof, `Task lens must match profile ${prof}`);
    }
  }
});

test('11. Malformed localStorage data safety', () => {
  assert.equal(safeParseUser(null), null);
  assert.equal(safeParseUser(''), null);
  assert.equal(safeParseUser('{ invalid json'), null);
  assert.equal(safeParseUser('12345'), null);
  assert.equal(safeParseUser('{"foo": "bar"}'), null, 'Missing email field returns null');

  const valid = safeParseUser('{"id": "u1", "email": "test@dayfold.app", "display_name": "Test", "is_onboarded": true}');
  assert.equal(valid?.email, 'test@dayfold.app');
  assert.equal(valid?.is_onboarded, true);
});

test('12. Reset behavior and storage cleanup', async () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();

  // A. Demo account reset
  mockLocalStorage.set('dayfold_demo_session_id', 'sess_123');
  mockLocalStorage.set('dayfold_access_token', 'valid_token_xyz');
  mockLocalStorage.set('dayfold_refresh_token', 'valid_ref_xyz');
  mockLocalStorage.set('dayfold_lens', 'student');
  mockLocalStorage.set('dayfold_user', JSON.stringify({
    id: 'u_demo',
    email: 'demo.student.sess_123@dayfold.app',
    display_name: 'Alex Chen',
  }));
  mockSessionStorage.set('dayfold_demo_seeding_u_demo', 'completed');

  // Trigger resetDemoData from store
  await useAuthStore.getState().resetDemoData();

  assert.equal(globalThis.localStorage.getItem('dayfold_demo_session_id'), null);
  assert.equal(globalThis.localStorage.getItem('dayfold_access_token'), null);
  assert.equal(globalThis.localStorage.getItem('dayfold_refresh_token'), null);
  assert.equal(globalThis.localStorage.getItem('dayfold_user'), null);
  assert.equal(globalThis.localStorage.getItem('dayfold_lens'), null);
  assert.equal(globalThis.sessionStorage.getItem('dayfold_demo_seeding_u_demo'), null);

  // B. Safety: Normal user account reset is rejected
  mockLocalStorage.set('dayfold_user', JSON.stringify({
    id: 'u_normal',
    email: 'normal.user@gmail.com',
    display_name: 'Normal User',
  }));
  mockLocalStorage.set('dayfold_access_token', 'user_token_123');

  await useAuthStore.getState().resetDemoData();

  // Storage for normal user must NOT be wiped!
  assert.equal(mockLocalStorage.get('dayfold_access_token'), 'user_token_123', 'Normal user tokens must be preserved');
});
