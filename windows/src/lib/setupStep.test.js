import test from 'node:test';
import assert from 'node:assert/strict';
import { setupStep } from './setupStep.js';

test('when not signed in the first step is signing in to Notion', () => {
  assert.equal(setupStep(true, false, 0), 'signIn');
  assert.equal(setupStep(true, false, 2), 'signIn');
});

test('signed in but no workspace: the step is adding a workspace', () => {
  assert.equal(setupStep(true, true, 0), 'workspace');
});

test('signed in with a workspace: nothing is left to set up', () => {
  assert.equal(setupStep(true, true, 1), null);
});

test('nothing is shown while the settings are still loading', () => {
  assert.equal(setupStep(false, false, 0), null);
});
