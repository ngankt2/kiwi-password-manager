import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS, SettingsSchema, weakensSecurity, type Settings } from '../src/core/security/settings';
import { JournalVaultStorage } from '../src/core/storage/journal';
import { VaultSession, type BiometricPort } from '../src/domain/services/session';
import { MemoryFiles } from './helpers/memory-files';
import { testCrypto } from './helpers/crypto';

describe('appearance preferences', () => {
  test('existing preferences adopt System without resetting saved choices', () => {
    const { theme: _theme, ...previous } = DEFAULT_SETTINGS;
    const settings = SettingsSchema.parse({ ...previous, language: 'fr', desktopLayout: 'B', compactRows: true, backgroundLockSeconds: 60, requireAuthenticationToReveal: true });
    expect(settings.theme).toBe('system');
    expect(settings.language).toBe('fr');
    expect(settings.desktopLayout).toBe('B');
    expect(settings.compactRows).toBe(true);
    expect(settings.backgroundLockSeconds).toBe(60);
    expect(settings.requireAuthenticationToReveal).toBe(true);
    expect(SettingsSchema.safeParse({ ...settings, theme: 'unknown' }).success).toBe(false);
  });

  test('each appearance is restored in a new session, including while locked', async () => {
    let stored = JSON.stringify({ ...DEFAULT_SETTINGS, requireAuthenticationToReveal: true });
    const preferences = {
      async read() { return JSON.parse(stored); },
      async write(settings: Settings) { stored = JSON.stringify(settings); },
    };
    const biometrics: BiometricPort = { async available() { return false; }, async enrolled() { return false; }, async enroll() {}, async recover() { return null; }, async revoke() {} };
    const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
    const session = new VaultSession(testCrypto, storage, preferences, biometrics);
    await session.initialize();
    for (const theme of ['dark', 'light', 'system'] as const) {
      const previous = session.getSnapshot().settings;
      const next = { ...previous, theme };
      expect(weakensSecurity(previous, next)).toBe(false);
      await session.updateSettings(next);
      expect(session.getSnapshot().status).toBe('locked');
      const reopened = new VaultSession(testCrypto, storage, preferences, biometrics);
      await reopened.initialize();
      expect(reopened.getSnapshot().settings.theme).toBe(theme);
      expect(reopened.getSnapshot().settings.requireAuthenticationToReveal).toBe(true);
    }
  });

  test('switching appearance keeps the unlocked vault and draft boundary intact', async () => {
    let stored: unknown = DEFAULT_SETTINGS;
    const preferences = { async read() { return stored; }, async write(settings: Settings) { stored = settings; } };
    const biometrics: BiometricPort = { async available() { return false; }, async enrolled() { return false; }, async enroll() {}, async recover() { return null; }, async revoke() {} };
    const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
    const session = new VaultSession(testCrypto, storage, preferences, biometrics);
    await session.initialize();
    await session.create('Appearance test vault', 'only-a-theme-test-password');
    const before = session.getSnapshot();
    await session.updateSettings({ ...before.settings, theme: 'dark' });
    const after = session.getSnapshot();
    expect(after.status).toBe('unlocked');
    expect(after.vault).toBe(before.vault);
    expect(after.current).toBe(before.current);
    expect(after.epoch).toBe(before.epoch);
    expect(after.privacyEpoch).toBe(before.privacyEpoch);
    expect(after.settings.autoLockSeconds).toBe(before.settings.autoLockSeconds);
    expect(after.settings.backgroundLockSeconds).toBe(before.settings.backgroundLockSeconds);
    session.lock();
  });
});
