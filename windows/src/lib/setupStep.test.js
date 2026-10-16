import test from 'node:test';
import assert from 'node:assert/strict';
import { setupStep } from './setupStep.js';

test('without an API key the first step is connecting to Notion', () => {
  assert.equal(setupStep(true, '', 0), 'apiKey');
  assert.equal(setupStep(true, '  ', 2), 'apiKey');
});

test('with a key but no workspace the step is adding a workspace', () => {
  assert.equal(setupStep(true, 'secret_abc', 0), 'workspace');
});

test('with a key and a workspace nothing is left to set up', () => {
  assert.equal(setupStep(true, 'secret_abc', 1), null);
});

test('nothing is shown while the settings are still loading', () => {
  assert.equal(setupStep(false, '', 0), null);
});
