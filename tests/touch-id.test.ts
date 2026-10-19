import { expect, test } from 'bun:test';
import { toBase64 } from '../src/core/bytes';
import { VaultError } from '../src/core/errors';
import type { DesktopBiometrics } from '../src/infrastructure/desktop/bridge';
import { touchIdUnlock } from '../src/infrastructure/biometric/touch-id';

function fakeNative(overrides: Partial<DesktopBiometrics> = {}) {
  const records = new Map<string, { binding: string; key: string }>();
  const prompts: string[] = [];
  const native: DesktopBiometrics = {
    async support() { return { method: 'touchId', available: true }; },
    async enrolled(id) { return records.has(id); },
    async enroll(id, binding, key) { records.set(id, { binding, key }); },
    async recover(id, binding, prompt) {
      prompts.push(prompt);
      const record = records.get(id);
      return record && record.binding === binding ? record.key : null;
    },
    async revoke(id) { records.delete(id); },
    ...overrides,
  };
  return { native, records, prompts };
}
const key = () => crypto.getRandomValues(new Uint8Array(32));

test('enrolling verifies the key through Touch ID and recovers it for the same binding only', async () => {
  const { native, prompts } = fakeNative();
  const unlock = touchIdUnlock(native);
  const secret = key();
  await unlock.enroll('vault', 'binding', secret, { prompt: 'unlock your password vault' });
  expect(prompts).toEqual(['unlock your password vault']);
  expect(await unlock.enrolled('vault')).toBe(true);
  expect(await unlock.recover('vault', 'binding')).toEqual(secret);
  expect(await unlock.recover('vault', 'other-binding')).toBeNull();
  await unlock.revoke('vault');
  expect(await unlock.enrolled('vault')).toBe(false);
});

test('a cancelled or mismatched verification removes the new record', async () => {
  const cancelled = fakeNative({ async recover() { throw new Error('CANCELLED'); } });
  await expect(touchIdUnlock(cancelled.native).enroll('vault', 'binding', key())).rejects.toMatchObject({ code: 'CANCELLED' });
  expect(cancelled.records.size).toBe(0);

  const wrong = fakeNative({ async recover() { return toBase64(key()); } });
  await expect(touchIdUnlock(wrong.native).enroll('vault', 'binding', key())).rejects.toMatchObject({ code: 'QUICK_UNLOCK_UNAVAILABLE' });
  expect(wrong.records.size).toBe(0);
});

test('native failures map to safe vault errors and malformed keys are rejected', async () => {
  const unknown = fakeNative({ async recover() { throw new Error('SOMETHING_ELSE'); } });
  await expect(touchIdUnlock(unknown.native).recover('vault', 'binding')).rejects.toBeInstanceOf(VaultError);
  await expect(touchIdUnlock(unknown.native).recover('vault', 'binding')).rejects.toMatchObject({ code: 'QUICK_UNLOCK_UNAVAILABLE' });

  const short = fakeNative({ async recover() { return toBase64(new Uint8Array(16)); } });
  expect(await touchIdUnlock(short.native).recover('vault', 'binding')).toBeNull();
  await expect(touchIdUnlock(fakeNative().native).enroll('vault', 'binding', new Uint8Array(16))).rejects.toMatchObject({ code: 'VALIDATION' });

  const controller = new AbortController(); controller.abort();
  await expect(touchIdUnlock(fakeNative().native).recover('vault', 'binding', { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
});
