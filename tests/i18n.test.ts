import { describe, expect, test } from 'bun:test';
import { catalog, createI18n, LOCALES, vietnamese, type MessageKey } from '../src/core/i18n';
import { ERROR_MESSAGES, VaultError } from '../src/core/errors';
import { DEFAULT_SETTINGS, SettingsSchema, weakensSecurity } from '../src/core/security/settings';
import { fieldsForType } from '../src/domain/entities/templates';
import { localizedFieldLabel } from '../src/shared/i18n/field-label';
import { VaultSession, type BiometricPort } from '../src/domain/services/session';
import { JournalVaultStorage } from '../src/core/storage/journal';
import { MemoryFiles } from './helpers/memory-files';
import { testCrypto } from './helpers/crypto';
import { usesSingular } from '../src/core/i18n/plurals';

const placeholders = (value: string) => [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();

describe('native-language catalogs', () => {
  test('native plural selection matches CLDR for every supported locale', () => {
    for (const locale of LOCALES) {
      const rules = new Intl.PluralRules(locale);
      for (const count of [-2, -1.5, -1, -0.5, 0, 0.1, 0.5, 1, 1.2, 1.9, 2, 3, 1000, 1000000, NaN, Infinity]) {
        expect(usesSingular(locale, count), `${locale}: ${count}`).toBe(rules.select(count) === 'one');
      }
    }
  });

  test('every message has four complete locales with matching placeholders', () => {
    for (const [key, translations] of Object.entries(catalog)) {
      expect(translations.length).toBe(4);
      const expected = placeholders(key);
      expect(placeholders(vietnamese[key as MessageKey] ?? key)).toEqual(expected);
      for (const entry of translations) {
        const variants = typeof entry === 'string' ? [entry] : [entry.one, entry.other];
        for (const variant of variants) {
          expect(variant.trim().length, key).toBeGreaterThan(0);
          expect(placeholders(variant), key).toEqual(expected);
        }
      }
    }
  });

  test('counts follow the grammar of the selected locale', () => {
    expect(createI18n('en').t('{count} mục', { count: 1 })).toBe('1 item');
    expect(createI18n('en').t('{count} mục', { count: 2 })).toBe('2 items');
    expect(createI18n('es').t('{count} mục', { count: 1 })).toBe('1 elemento');
    expect(createI18n('es').t('{count} mục', { count: 2 })).toBe('2 elementos');
    expect(createI18n('fr').t('{count} mục', { count: 1 })).toBe('1 élément');
    expect(createI18n('fr').t('{count} mục', { count: 2 })).toBe('2 éléments');
    expect(createI18n('zh-CN').t('{count} mục', { count: 2 })).toBe('2 个项目');
    expect(createI18n('vi').t('{count} mục', { count: 2 })).toBe('2 mục');
  });

  test('user content in placeholders is preserved verbatim', () => {
    const name = 'Thư mục {count} <script> & 中文';
    for (const locale of LOCALES) expect(createI18n(locale).t('Mở {name}', { name })).toContain(name);
  });

  test('only unchanged built-in field labels are localized', () => {
    const username = fieldsForType('login')[0];
    const i18n = createI18n('fr');
    expect(localizedFieldLabel(username, 'login', i18n.text)).toBe('Nom d’utilisateur');
    expect(localizedFieldLabel({ ...username, id: 'my-custom-field' }, 'login', i18n.text)).toBe('Username');
    expect(localizedFieldLabel({ ...username, label: 'Tên riêng của tôi' }, 'login', i18n.text)).toBe('Tên riêng của tôi');
    expect(localizedFieldLabel(username, 'card', i18n.text)).toBe('Username');
  });

  test('safe errors are localized without exposing the original cause', () => {
    for (const locale of LOCALES) {
      const i18n = createI18n(locale);
      for (const code of Object.keys(ERROR_MESSAGES) as (keyof typeof ERROR_MESSAGES)[]) {
        expect(i18n.text(ERROR_MESSAGES[code])).toBe(i18n.error(new VaultError(code)));
      }
      expect(i18n.error(new Error('private-secret-value'))).not.toContain('private-secret-value');
    }
  });
});

describe('compact update timestamps', () => {
  const { compactDateTime } = createI18n('vi');

  test('today shows hours and minutes, including midnight in the 24-hour clock', () => {
    const now = new Date(2026, 8, 24, 12, 0);
    expect(compactDateTime(new Date(2026, 8, 24, 8, 5).toISOString(), now)).toBe('08:05');
    expect(compactDateTime(new Date(2026, 8, 24, 0, 5).toISOString(), now)).toBe('00:05');
    expect(createI18n('en').compactDateTime(new Date(2026, 8, 24, 0, 5).toISOString(), now)).toBe('00:05');
  });

  test('other local calendar days in this year show day and month even across midnight', () => {
    const now = new Date(2026, 8, 24, 0, 5);
    expect(compactDateTime(new Date(2026, 8, 23, 23, 55).toISOString(), now)).toBe('23/09');
    expect(compactDateTime(new Date(2026, 7, 24, 12, 0).toISOString(), now)).toBe('24/08');
  });

  test('another year is included even when the date matches or the update was minutes ago', () => {
    expect(compactDateTime(new Date(2025, 8, 24, 8, 5).toISOString(), new Date(2026, 8, 24, 12, 0))).toBe('24/09/2025');
    expect(compactDateTime(new Date(2026, 11, 31, 23, 55).toISOString(), new Date(2027, 0, 1, 0, 5))).toBe('31/12/2026');
  });
});

describe('language preferences', () => {
  test('language can be saved while locked and is restored in a new session', async () => {
    let stored = JSON.stringify(DEFAULT_SETTINGS);
    const preferences = { async read() { return JSON.parse(stored); }, async write(settings: typeof DEFAULT_SETTINGS) { stored = JSON.stringify(settings); } };
    const biometrics: BiometricPort = { async available() { return false; }, async enrolled() { return false; }, async enroll() {}, async recover() { return null; }, async revoke() {} };
    const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
    const first = new VaultSession(testCrypto, storage, preferences, biometrics);
    await first.initialize();
    await first.updateSettings({ ...first.getSnapshot().settings, language: 'fr' });
    expect(first.getSnapshot().status).toBe('locked');
    const reopened = new VaultSession(testCrypto, storage, preferences, biometrics);
    await reopened.initialize();
    expect(reopened.getSnapshot().settings.language).toBe('fr');
    await reopened.create('Tên kho do người dùng đặt', 'only-a-test-master-password');
    const before = reopened.getSnapshot();
    await reopened.updateSettings({ ...before.settings, language: 'zh-CN' });
    const after = reopened.getSnapshot();
    expect(after.vault).toBe(before.vault);
    expect(after.vault?.name).toBe('Tên kho do người dùng đặt');
    expect(after.epoch).toBe(before.epoch);
    expect(after.privacyEpoch).toBe(before.privacyEpoch);
    expect(after.status).toBe('unlocked');
    reopened.lock();
  });

  test('old preferences gain Vietnamese while preserving security choices', () => {
    const { language: _language, ...legacy } = DEFAULT_SETTINGS;
    const migrated = SettingsSchema.parse({ ...legacy, clipboardSeconds: 10, requireAuthenticationToReveal: true });
    expect(migrated.language).toBe('vi');
    expect(migrated.clipboardSeconds).toBe(10);
    expect(migrated.requireAuthenticationToReveal).toBe(true);
  });

  test('all supported locales survive persistence and do not weaken security', () => {
    for (const language of LOCALES) {
      const settings = SettingsSchema.parse(JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS, language })));
      expect(settings.language).toBe(language);
      expect(weakensSecurity(DEFAULT_SETTINGS, settings)).toBe(false);
    }
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, language: 'invalid' }).success).toBe(false);
  });
});
