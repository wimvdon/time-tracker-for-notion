/**
 * Time rounding logic. Must exactly replicate the Notion Start/Stop button
 * formulas.
 */

const MS_15 = 15 * 60 * 1000;

/**
 * Rounds a Date to the nearest 15-minute boundary.
 * Uses standard mathematical rounding (0.5 rounds up).
 *
 * Examples:
 *   14:07 → 14:00   14:08 → 14:15
 *   14:22 → 14:15   14:23 → 14:30
 *   14:52 → 14:45   14:53 → 15:00
 */
export function roundToNearest15(date) {
  return new Date(Math.round(date.getTime() / MS_15) * MS_15);
}

/**
 * Computes the rounded start time for a new Tijdsregistratie.
 * Mirrors the Notion Start button formula exactly.
 */
export function computeStartTime(now = new Date()) {
  return roundToNearest15(now);
}

/**
 * Computes the rounded end time, enforcing a minimum duration of 15 minutes.
 * Mirrors the Notion Stop button formula exactly.
 *
 * Rule:
 *   endTime = roundToNearest15(now)
 *   if (endTime - startTime) < 15 minutes → endTime = startTime + 15 minutes
 *
 * @param {Date} startTime - the already-rounded start time stored when the
 *   timer began (NOT the raw timestamp)
 * @returns {Date}
 */
export function computeEndTime(startTime, now = new Date()) {
  const roundedNow = roundToNearest15(now);
  const minEnd = new Date(startTime.getTime() + MS_15);
  return roundedNow < minEnd ? minEnd : roundedNow;
}
