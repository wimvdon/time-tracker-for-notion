import enGB from '../locales/en-GB.js';
import nlBE from '../locales/nl-BE.js';
import frFR from '../locales/fr.js';
import deDE from '../locales/de.js';
import esES from '../locales/es.js';
import itIT from '../locales/it.js';

export function detectLocale() {
  const lang = (navigator.language || navigator.languages?.[0] || 'en-GB').toLowerCase();
  if (lang.startsWith('nl')) return 'nl-BE';
  if (lang.startsWith('fr')) return 'fr';
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('es')) return 'es';
  if (lang.startsWith('it')) return 'it';
  return 'en-GB';
}

const locales = {
  'en-GB': enGB,
  'nl-BE': nlBE,
  'fr': frFR,
  'de': deDE,
  'es': esES,
  'it': itIT
};

let activeLocale = 'system';
let resolvedLocaleStr = detectLocale();

export function setLocale(locale) {
  activeLocale = locale;
  if (locale === 'system' || !locale) {
    resolvedLocaleStr = detectLocale();
  } else {
    resolvedLocaleStr = locale;
  }
}

export function getActiveLocale() {
  return resolvedLocaleStr;
}

export function t(key) {
  const strings = locales[resolvedLocaleStr] || enGB;
  return strings[key] ?? enGB[key] ?? key;
}
