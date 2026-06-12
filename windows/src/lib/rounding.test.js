import test from 'node:test';
import assert from 'node:assert/strict';
import { roundToNearest15, roundToNearestN, computeStartTime, computeEndTime } from './rounding.js';

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

test('roundToNearestN rounds to 5 minutes', () => {
  assert.equal(hhmm(roundToNearestN(at(14, 2), 5)), '14:00');
  assert.equal(hhmm(roundToNearestN(at(14, 3), 5)), '14:05');
  assert.equal(hhmm(roundToNearestN(at(14, 7), 5)), '14:05');
  assert.equal(hhmm(roundToNearestN(at(14, 8), 5)), '14:10');
});

test('roundToNearestN rounds to 10 minutes', () => {
  assert.equal(hhmm(roundToNearestN(at(14, 4), 10)), '14:00');
  assert.equal(hhmm(roundToNearestN(at(14, 5), 10)), '14:10');
  assert.equal(hhmm(roundToNearestN(at(14, 14), 10)), '14:10');
  assert.equal(hhmm(roundToNearestN(at(14, 15), 10)), '14:20');
});

test('computeStartTime rounds the current time', () => {
  assert.equal(hhmm(computeStartTime(at(9, 11), 15)), '09:15');
  assert.equal(hhmm(computeStartTime(at(9, 11), 5)), '09:10');
  assert.equal(hhmm(computeStartTime(at(9, 11), 10)), '09:10');
});

test('computeEndTime enforces a minimum duration of 15 minutes', () => {
  const start = at(14, 0);
  // Stopped 3 minutes in: rounded now is 14:00 == start → forced to 14:15
  assert.equal(hhmm(computeEndTime(start, at(14, 3), 15)), '14:15');
  // Stopped 8 minutes in: rounded now is 14:15, exactly the minimum
  assert.equal(hhmm(computeEndTime(start, at(14, 8), 15)), '14:15');
});

test('computeEndTime uses the rounded now when past the minimum', () => {
  const start = at(14, 0);
  assert.equal(hhmm(computeEndTime(start, at(14, 40), 15)), '14:45');
  assert.equal(hhmm(computeEndTime(start, at(15, 50), 15)), '15:45');
});

test('computeEndTime enforces a minimum duration of 5 minutes', () => {
  const start = at(14, 0);
  assert.equal(hhmm(computeEndTime(start, at(14, 2), 5)), '14:05');
  assert.equal(hhmm(computeEndTime(start, at(14, 3), 5)), '14:05');
  assert.equal(hhmm(computeEndTime(start, at(14, 8), 5)), '14:10');
});
