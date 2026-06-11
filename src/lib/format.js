/** Date/time formatting helpers. */

const pad = (n) => String(n).padStart(2, '0');

/**
 * Formats a Date as ISO 8601 with the local timezone offset,
 * e.g. "2026-06-11T14:00:00.000+02:00". (Date.toISOString() would convert
 * to UTC, which is not what the Notion buttons produce.)
 */
export function toNotionDateTime(date) {
  const tzOffset = -date.getTimezoneOffset();
  const sign = tzOffset >= 0 ? '+' : '-';
  const absOffset = Math.abs(tzOffset);
  const hh = pad(Math.floor(absOffset / 60));
  const mm = pad(absOffset % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00.000` +
    `${sign}${hh}:${mm}`
  );
}

/** "11/06/2026" — used for the fallback page title. */
export function formatDateDDMMYYYY(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "14:00" */
export function formatHHMM(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Seconds → "HH:MM:SS" */
export function formatElapsed(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
