import enGB from '../locales/en-GB.js';
import nlBE from '../locales/nl-BE.js';

/**
 * Picks the UI locale from the Windows display language (navigator.language
 * reflects it in Electron). Dutch in any flavour (nl-BE, nl-NL) maps to
 * nl-BE; everything else falls back to en-GB. No manual toggle.
 */
export function detectLocale() {
  const lang = (navigator.language || navigator.languages?.[0] || 'en-GB').toLowerCase();
  if (lang.startsWith('nl')) return 'nl-BE';
  return 'en-GB';
}

const locales = { 'en-GB': enGB, 'nl-BE': nlBE };

const locale = detectLocale();
const strings = locales[locale] || enGB;

/** Fallback chain: active locale → en-GB → the key itself. */
export function t(key) {
  return strings[key] ?? enGB[key] ?? key;
}

export { locale };
