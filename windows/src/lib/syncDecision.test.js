import test from 'node:test';
import assert from 'node:assert/strict';
import { syncDecision } from './syncDecision.js';

const T1 = '2026-10-31T10:00:00.000Z';
const T2 = '2026-10-31T11:00:00.000Z';

test('newer settings on the server are pulled', () => {
  assert.equal(syncDecision({ settingsUpdatedAt: T1, lastSyncedUpdatedAt: T1, hasSettings: true }, { updatedAt: T2 }), 'pull');
  assert.equal(syncDecision({ settingsUpdatedAt: null, lastSyncedUpdatedAt: null, hasSettings: false }, { updatedAt: T1 }), 'pull');
});

test('local edits the server does not have yet are pushed', () => {
  assert.equal(syncDecision({ settingsUpdatedAt: T2, lastSyncedUpdatedAt: T1, hasSettings: true }, { updatedAt: T1 }), 'push');
  assert.equal(syncDecision({ settingsUpdatedAt: T2, lastSyncedUpdatedAt: null, hasSettings: true }, { updatedAt: T1 }), 'push');
});

test('an empty server gets the settings of this device', () => {
  assert.equal(syncDecision({ settingsUpdatedAt: T1, lastSyncedUpdatedAt: T1, hasSettings: true }, null), 'push');
  // Settings from before sync existed have no timestamp yet.
  assert.equal(syncDecision({ settingsUpdatedAt: null, lastSyncedUpdatedAt: null, hasSettings: true }, null), 'push');
});

test('a new install with nothing to share never pushes', () => {
  assert.equal(syncDecision({ settingsUpdatedAt: null, lastSyncedUpdatedAt: null, hasSettings: false }, null), 'none');
});

test('in step: nothing to do', () => {
  assert.equal(syncDecision({ settingsUpdatedAt: T1, lastSyncedUpdatedAt: T1, hasSettings: true }, { updatedAt: T1 }), 'none');
});
