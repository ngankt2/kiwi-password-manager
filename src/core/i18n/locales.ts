export const LOCALES = ['vi', 'en', 'es', 'fr', 'zh-CN'] as const;
export type Locale = typeof LOCALES[number];
export const LANGUAGE_NAMES: Record<Locale, string> = {
  vi: 'Tiếng Việt', en: 'English', es: 'Español', fr: 'Français', 'zh-CN': '简体中文',
};
export const FORMAT_LOCALES: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US', es: 'es-ES', fr: 'fr-FR', 'zh-CN': 'zh-CN' };
export type LocalizedMessage = string | { one: string; other: string };
/** English, Spanish, French, Simplified Chinese; the key is the Vietnamese source. */
export type Translations = readonly [LocalizedMessage, LocalizedMessage, LocalizedMessage, LocalizedMessage];
