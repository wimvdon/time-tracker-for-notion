import test from 'node:test';
import assert from 'node:assert/strict';
import { withPresetTitles, needsPresetTitles } from './presets.js';

test('untitled presets take their default description, else the workspace name', () => {
  const ws = {
    name: 'Acme',
    presets: [
      { id: 'a', name: 'Standup', pageTitle: 'Daily' },
      { id: 'b', name: '', pageTitle: ' Review ' },
      { id: 'c', name: '  ', pageTitle: '' },
      { id: 'd', name: ' Padded ' },
    ],
  };
  assert.equal(needsPresetTitles(ws), true);
  const migrated = withPresetTitles(ws);
  assert.deepEqual(migrated.presets.map((p) => p.name), ['Standup', 'Review', 'Acme', 'Padded']);
  assert.equal(migrated.presets[0], ws.presets[0]);
  assert.equal(needsPresetTitles(migrated), false);
});

test('a workspace without presets is left alone', () => {
  assert.equal(needsPresetTitles({ name: 'Acme' }), false);
  assert.deepEqual(withPresetTitles({ name: 'Acme' }).presets, []);
});
