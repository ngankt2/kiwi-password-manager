import { expect, test } from 'bun:test';
import { AutoLockPolicy } from '../src/core/security/auto-lock';
import { DEFAULT_SETTINGS, SettingsSchema, weakensSecurity } from '../src/core/security/settings';
import { SecureClipboard } from '../src/core/security/clipboard';
import { DEFAULT_PASSWORD_OPTIONS, generatePassword, generatePassphrase } from '../src/core/security/generator';
import { generateOtp } from '../src/core/security/otp';
import { testCrypto } from './helpers/crypto';
import { PASSPHRASE_WORDS } from '../src/core/security/words';

test('clipboard ownership prevents overwriting newer user content', async () => {
  let owned: string | null = null; let text = ''; let now = 0;
  const clipboard = new SecureClipboard({ supportsOwnership: true,
    async write(value) { text = value; owned = 'owned'; return owned; },
    async clearIfOwned(token) { if (token !== owned) return false; text = ''; owned = null; return true; },
  }, () => now);
  await clipboard.copy('fake-secret'); owned = 'someone-else'; text = 'new user content';
  now = 31000; await clipboard.resume(); expect(text).toBe('new user content');
  await clipboard.copy('fake-secret'); expect(await clipboard.clear()).toBe(true); expect(text).toBe('');
});

test('web clipboard does not claim to support safe automatic deletion', async () => {
  let clears = 0;
  const clipboard = new SecureClipboard({ supportsOwnership: false, async write() { return null; }, async clearIfOwned() { clears++; return false; } });
  expect((await clipboard.copy('fake')).autoClears).toBe(false); await clipboard.clear(); expect(clears).toBe(0);
});

test('locking during an asynchronous clipboard write clears that write', async () => {
  let finish: (() => void) | undefined;
  let value = '';
  const clipboard = new SecureClipboard({ supportsOwnership: true,
    async write(text) { await new Promise<void>((resolve) => { finish = resolve; }); value = text; return 'pending-owner'; },
    async clearIfOwned() { value = ''; return true; },
  });
  const copy = clipboard.copy('fixture-secret');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const lock = clipboard.clear(); finish?.();
  await Promise.all([copy, lock]); expect(value).toBe('');
});

test('an initial foreground event does not trigger immediate background lock', () => {
  let locks = 0;
  const policy = new AutoLockPolicy({ ...DEFAULT_SETTINGS, backgroundLockSeconds: 0 }, () => locks++);
  policy.foreground(); expect(locks).toBe(0);
  policy.background(); expect(locks).toBe(1);
});

test('background deadlines survive suspension and device lock is unconditional', () => {
  let now = 0; let locks = 0;
  const policy = new AutoLockPolicy({ ...DEFAULT_SETTINGS, backgroundLockSeconds: 60 }, () => locks++, () => now);
  policy.background(); now = 61000; policy.foreground(); expect(locks).toBe(1);
  policy.configure({ ...DEFAULT_SETTINGS, autoLockSeconds: -1, backgroundLockSeconds: -1 }); policy.deviceLocked(); expect(locks).toBe(2);
});

test('the default departure grace is three minutes, independent of earlier idle time', () => {
  let now = 0; let locks = 0;
  const policy = new AutoLockPolicy(DEFAULT_SETTINGS, () => locks++, () => now);
  now = 299_000; policy.background();
  now += 179_999; policy.tick(); expect(locks).toBe(0);
  now += 1; policy.tick(); expect(locks).toBe(1);
  policy.tick(); policy.foreground(); expect(locks).toBe(1);
});

test('duplicate departures and activity in a blurred window cannot extend its deadline', () => {
  let now = 0; let locks = 0;
  const policy = new AutoLockPolicy(DEFAULT_SETTINGS, () => locks++, () => now);
  policy.background(); now = 90_000; policy.background(); policy.activity();
  now = 180_000; policy.tick(); expect(locks).toBe(1);
});

test('returning before the deadline cancels it and the next departure gets a fresh grace', () => {
  let now = 0; let locks = 0;
  const policy = new AutoLockPolicy(DEFAULT_SETTINGS, () => locks++, () => now);
  policy.background(); now = 179_999; policy.foreground(); policy.tick();
  now = 200_000; policy.background();
  now = 379_999; policy.tick(); expect(locks).toBe(0);
  now = 380_000; policy.foreground(); expect(locks).toBe(1);
  policy.reset(); now += 299_999; policy.tick(); expect(locks).toBe(1);
  now++; policy.tick(); expect(locks).toBe(2);
});

test('idle and departure timeouts can be configured independently, including disabled', () => {
  let now = 0; let locks = 0;
  const policy = new AutoLockPolicy({ ...DEFAULT_SETTINGS, autoLockSeconds: 60, backgroundLockSeconds: -1 }, () => locks++, () => now);
  policy.background(); now = 600_000; policy.tick(); policy.foreground(); expect(locks).toBe(0);
  now += 60_000; policy.tick(); expect(locks).toBe(1);
  policy.reset(); policy.configure({ ...DEFAULT_SETTINGS, autoLockSeconds: -1, backgroundLockSeconds: 60 });
  now += 600_000; policy.tick(); expect(locks).toBe(1);
  policy.background(); now += 60_000; policy.tick(); expect(locks).toBe(2);
});

test('legacy preferences adopt a three-minute grace without losing other preferences', () => {
  const settings = SettingsSchema.parse({ lockOnBackground: true, autoLockSeconds: 0, language: 'fr', clipboardSeconds: 60, backupRetention: 21 });
  expect(settings).toMatchObject({ backgroundLockSeconds: 180, autoLockSeconds: -1, language: 'fr', clipboardSeconds: 60, backupRetention: 21 });
  expect('lockOnBackground' in settings).toBe(false);
  expect(SettingsSchema.parse({ ...settings, backgroundLockSeconds: 0 }).backgroundLockSeconds).toBe(0);
  expect(SettingsSchema.safeParse({ backgroundLockSeconds: 7 }).success).toBe(false);
  expect(weakensSecurity(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, backgroundLockSeconds: 300 })).toBe(true);
  expect(weakensSecurity(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, backgroundLockSeconds: 60 })).toBe(false);
});

test('password generator honors the selected alphabet and all required classes', () => {
  const password = generatePassword(testCrypto, DEFAULT_PASSWORD_OPTIONS);
  expect(password.length).toBe(20); expect(password).toMatch(/[A-Z]/); expect(password).toMatch(/[a-z]/); expect(password).toMatch(/[2-9]/); expect(password).toMatch(/[^a-zA-Z0-9]/); expect(password).not.toMatch(/[Il1O0]/);
  expect(() => generatePassword(testCrypto, { ...DEFAULT_PASSWORD_OPTIONS, uppercase: false, lowercase: false, numbers: false, symbols: false })).toThrow();
});

test('passphrases select from the full EFF word list', () => {
  expect(PASSPHRASE_WORDS).toHaveLength(7776);
  const phrase = generatePassphrase(testCrypto, { words: 6, separator: ' ', capitalize: false, includeNumber: false });
  expect(phrase.split(' ')).toHaveLength(6);
  for (const word of phrase.split(' ')) expect(PASSPHRASE_WORDS.includes(word)).toBe(true);
});

test('TOTP matches RFC 6238 SHA-1 vector', () => {
  const result = generateOtp('otpauth://totp/Fixture?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8&period=30&algorithm=SHA1', 59000);
  expect(result.code).toBe('94287082'); expect(result.remaining).toBe(1);
});
