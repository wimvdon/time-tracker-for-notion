/**
 * Time rounding logic. Must exactly replicate the Notion Start/Stop button
 * formulas.
 */

/**
 * Rounds a Date to the nearest N-minute boundary (N must be a divisor of 60).
 * Uses standard mathematical rounding (0.5 rounds up).
 */
export function roundToNearestN(date, minutes) {
  const ms = minutes * 60 * 1000;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

/**
 * Computes the rounded start time for a new time entry.
 */
export function computeStartTime(now = new Date(), minutes = 15) {
  return roundToNearestN(now, minutes);
}

/**
 * Computes the rounded end time, enforcing a minimum duration of `minutes`.
 *
 * @param {Date} startTime - the already-rounded start time stored when the
 *   timer began (NOT the raw timestamp)
 * @param {Date} now
 * @param {number} minutes - rounding interval
 * @returns {Date}
 */
export function computeEndTime(startTime, now = new Date(), minutes = 15) {
  const roundedNow = roundToNearestN(now, minutes);
  const minEnd = new Date(startTime.getTime() + minutes * 60 * 1000);
  return roundedNow < minEnd ? minEnd : roundedNow;
}

// Backwards compat alias
export const roundToNearest15 = (date) => roundToNearestN(date, 15);
