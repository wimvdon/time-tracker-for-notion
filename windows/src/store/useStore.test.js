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
