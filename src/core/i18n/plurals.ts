import type { Locale } from './locales';

// CLDR's cardinal "one" category for the five supported locales.
// Hermes does not provide Intl.PluralRules on every supported platform.
export function usesSingular(locale: Locale, count: number): boolean {
  if (!Number.isFinite(count)) return false;
  const value = Math.abs(count);
  if (locale === 'en' || locale === 'es') return value === 1;
  if (locale === 'fr') return value < 2;
  return false;
}
