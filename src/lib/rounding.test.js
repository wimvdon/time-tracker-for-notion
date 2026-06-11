import test from 'node:test';
import assert from 'node:assert/strict';
import { roundToNearest15, computeStartTime, computeEndTime } from './rounding.js';

const at = (h, m, s = 0) => new Date(2026, 5, 11, h, m, s);
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

test('roundToNearest15 rounds down below the midpoint', () => {
  assert.equal(hhmm(roundToNearest15(at(14, 7))), '14:00');
  assert.equal(hhmm(roundToNearest15(at(14, 22))), '14:15');
  assert.equal(hhmm(roundToNearest15(at(14, 52))), '14:45');
});

test('roundToNearest15 rounds up at and above the midpoint', () => {
  assert.equal(hhmm(roundToNearest15(at(14, 8))), '14:15');
  assert.equal(hhmm(roundToNearest15(at(14, 7, 30))), '14:15'); // exact midpoint rounds up
  assert.equal(hhmm(roundToNearest15(at(14, 23))), '14:30');
  assert.equal(hhmm(roundToNearest15(at(14, 53))), '15:00');
});

test('roundToNearest15 keeps exact boundaries untouched', () => {
  assert.equal(hhmm(roundToNearest15(at(14, 0))), '14:00');
  assert.equal(hhmm(roundToNearest15(at(14, 45))), '14:45');
});

test('computeStartTime rounds the current time', () => {
  assert.equal(hhmm(computeStartTime(at(9, 11))), '09:15');
});

test('computeEndTime enforces a minimum duration of 15 minutes', () => {
  const start = at(14, 0);
  // Stopped 3 minutes in: rounded now is 14:00 == start → forced to 14:15
  assert.equal(hhmm(computeEndTime(start, at(14, 3))), '14:15');
  // Stopped 8 minutes in: rounded now is 14:15, exactly the minimum
  assert.equal(hhmm(computeEndTime(start, at(14, 8))), '14:15');
});

test('computeEndTime uses the rounded now when past the minimum', () => {
  const start = at(14, 0);
  assert.equal(hhmm(computeEndTime(start, at(14, 40))), '14:45');
  assert.equal(hhmm(computeEndTime(start, at(15, 50))), '15:45');
});
