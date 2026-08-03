import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackDescription, isFallbackDescription, formatDateStr } from './format.js';

const jun11 = new Date(2026, 5, 11, 14, 30);

test('fallbackDescription uses the configured date format', () => {
  assert.equal(fallbackDescription(jun11, 'DD/MM/YYYY'), '11/06/2026');
  assert.equal(fallbackDescription(jun11, 'MM/DD/YYYY'), '06/11/2026');
  assert.equal(fallbackDescription(jun11, 'YYYY-MM-DD'), '2026-06-11');
});

test('fallbackDescription defaults to DD/MM/YYYY', () => {
  assert.equal(fallbackDescription(jun11), formatDateStr(jun11, 'DD/MM/YYYY'));
});

test('isFallbackDescription recognises a generated title', () => {
  assert.equal(isFallbackDescription('11/06/2026', jun11, 'DD/MM/YYYY'), true);
  assert.equal(isFallbackDescription('  11/06/2026 ', jun11, 'DD/MM/YYYY'), true);
});

test('isFallbackDescription recognises titles written in another date format', () => {
  assert.equal(isFallbackDescription('2026-06-11', jun11, 'DD/MM/YYYY'), true);
  assert.equal(isFallbackDescription('06/11/2026', jun11, 'YYYY-MM-DD'), true);
});

test('isFallbackDescription leaves real descriptions alone', () => {
  assert.equal(isFallbackDescription('Client meeting', jun11, 'DD/MM/YYYY'), false);
  assert.equal(isFallbackDescription('', jun11, 'DD/MM/YYYY'), false);
  // A date, but not this entry's start date.
  assert.equal(isFallbackDescription('12/06/2026', jun11, 'DD/MM/YYYY'), false);
});
