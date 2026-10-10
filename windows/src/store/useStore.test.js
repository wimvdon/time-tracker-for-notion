import test from 'node:test';
import assert from 'node:assert/strict';

test('init is idempotent when React StrictMode invokes its effect twice', async () => {
  let settingsReads = 0;
  let intervalCount = 0;

  globalThis.window = {
    notionAPI: {
      getSettings: async () => {
        settingsReads += 1;
        return {};
      },
    },
  };
  globalThis.document = {
    documentElement: {
      classList: { add() {}, remove() {} },
    },
  };

  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => {
    intervalCount += 1;
    return intervalCount;
  };

  try {
    const { useStore } = await import('./useStore.js');
    await Promise.all([useStore.getState().init(), useStore.getState().init()]);

    assert.equal(settingsReads, 1);
    assert.equal(intervalCount, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
});

test('a failed running-timer query keeps the active timer instead of clearing it', async () => {
  const { useStore } = await import('./useStore.js');
  const api = globalThis.window.notionAPI;
  const saved = [];
  api.saveSettings = async (data) => { saved.push(data); };
  api.setTimerRunning = () => {};
  api.getPageProperties = async () => ({});

  const ws = {
    id: 'ws1',
    name: 'Work',
    timeEntriesDbId: 'db1',
    propertyMap: { timeEntryStatusProp: 'Status', timeEntryStatusRunning: 'Running', timeEntryDateProp: 'Date' },
  };
  const runningTimer = () => ({
    running: true,
    notionPageId: 'p1',
    workspaceId: 'ws1',
    rawStart: new Date(),
    tickInterval: null,
    propertyMap: ws.propertyMap,
  });

  api.fetchRunningTimers = async () => { throw new Error('Network error reaching Notion'); };
  useStore.setState({ apiKey: 'k', workspaces: [ws], timer: runningTimer(), runningTimers: [], runningTimersLoading: false });
  await useStore.getState().loadRunningTimers();
  assert.equal(useStore.getState().timer.running, true);
  assert.ok(!saved.some((d) => 'activeTimer' in d && d.activeTimer === null));

  // A query that succeeds without the entry still means it was stopped elsewhere.
  api.fetchRunningTimers = async () => [];
  await useStore.getState().loadRunningTimers();
  assert.equal(useStore.getState().timer.running, false);
});
