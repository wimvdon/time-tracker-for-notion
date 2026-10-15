import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoSaveDescription } from './descriptionAutoSave.js';

test('a changed description is saved', () => {
  assert.equal(shouldAutoSaveDescription('Meeting with Anna', 'Meeting'), true);
  assert.equal(shouldAutoSaveDescription('Meeting', ''), true);
});

test('an unchanged description is not saved again', () => {
  assert.equal(shouldAutoSaveDescription('Meeting', 'Meeting'), false);
});

test('spaces around the text do not count as a change', () => {
  assert.equal(shouldAutoSaveDescription('Meeting ', 'Meeting'), false);
  assert.equal(shouldAutoSaveDescription('  Meeting', 'Meeting '), false);
});

test('an emptied field is not saved while typing', () => {
  assert.equal(shouldAutoSaveDescription('', 'Meeting'), false);
  assert.equal(shouldAutoSaveDescription('   ', 'Meeting'), false);
  assert.equal(shouldAutoSaveDescription(undefined, 'Meeting'), false);
});
