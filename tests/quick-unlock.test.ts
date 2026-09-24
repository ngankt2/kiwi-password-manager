import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { VaultSession } from '../src/domain/services/session';
import type { QuickUnlockOptions, QuickUnlockPort } from '../src/core/security/quick-unlock';
import { DEFAULT_SETTINGS } from '../src/core/security/settings';
import { JournalVaultStorage } from '../src/core/storage/journal';
import { MemoryFiles } from './helpers/memory-files';
import { FIXTURE_PASSWORD, testCrypto } from './helpers/crypto';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
class DeviceUnlock implements QuickUnlockPort {
  records = new Map<string, { binding: string; key: Uint8Array }>();
  async available() { return true; }
  async enrolled(id: string) { return this.records.has(id); }
  async enroll(id: string, binding: string, key: Uint8Array, _options?: QuickUnlockOptions) { this.records.set(id, { binding, key: key.slice() }); }
  async recover(id: string, binding: string, _options?: QuickUnlockOptions): Promise<Uint8Array | null> {
    const record = this.records.get(id);
    return record?.binding === binding ? record.key.slice() : null;
  }
  async revoke(id: string) { this.records.get(id)?.key.fill(0); this.records.delete(id); }
}
async function ready(device: DeviceUnlock) {
  const session = new VaultSession(testCrypto, new JournalVaultStorage(new MemoryFiles(), testCrypto),
    { async read() { return DEFAULT_SETTINGS; }, async write() {} }, device);
  await session.initialize();
  await session.importVault(new Uint8Array(await readFile('fixtures/vault/schema-v2.vault')), 'fixture.akpr', FIXTURE_PASSWORD);
  return session;
}

test('setup and removal require the master password; quick unlock never changes vault contents', async () => {
  const device = new DeviceUnlock(); const session = await ready(device);
  const id = session.getSnapshot().current!.id;
  const original = session.getSnapshot().vault;
  try {
    await expect(session.enableBiometrics('wrong-password')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
    expect(await device.enrolled(id)).toBe(false);
    await session.enableBiometrics(FIXTURE_PASSWORD);
    session.lock(); await session.quickUnlock(id);
    expect(session.getSnapshot().vault).toEqual(original);
    await expect(session.disableQuickUnlock('wrong-password')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
    expect(await device.enrolled(id)).toBe(true);
    await session.disableQuickUnlock(FIXTURE_PASSWORD);
    expect(await device.enrolled(id)).toBe(false);
    session.lock();
    await expect(session.quickUnlock(id)).rejects.toMatchObject({ code: 'QUICK_UNLOCK_UNAVAILABLE' });
    expect(session.getSnapshot().status).toBe('locked');
    await session.unlock(id, FIXTURE_PASSWORD);
    expect(session.getSnapshot().vault).toEqual(original);
  } finally { session.lock(); await device.revoke(id); }
});

test('locking during enrollment aborts the prompt, wipes the key and revokes a late result', async () => {
  const device = new DeviceUnlock(); const session = await ready(device);
  const started = deferred(); const finish = deferred();
  let enrollmentKey: Uint8Array | undefined; let signal: AbortSignal | undefined;
  device.enroll = async (id, binding, key, options) => {
    enrollmentKey = key; signal = options?.signal;
    const lateKey = key.slice(); started.resolve(); await finish.promise;
    device.records.set(id, { binding, key: lateKey });
  };
  const enabling = session.enableBiometrics(FIXTURE_PASSWORD);
  await started.promise; session.lock();
  expect(signal?.aborted).toBe(true);
  expect(enrollmentKey?.every((byte) => byte === 0)).toBe(true);
  finish.resolve();
  await expect(enabling).rejects.toMatchObject({ code: 'LOCKED' });
  expect(device.records.size).toBe(0);
  expect(session.getSnapshot().status).toBe('locked');
});

test('a biometric or passkey response arriving after a lock cannot restore the session', async () => {
  const device = new DeviceUnlock(); const session = await ready(device);
  const id = session.getSnapshot().current!.id;
  await session.enableBiometrics(FIXTURE_PASSWORD); session.lock();
  const started = deferred(); const finish = deferred();
  const recover = device.recover.bind(device);
  let lateKey: Uint8Array | null = null; let signal: AbortSignal | undefined;
  device.recover = async (id, binding, options) => {
    lateKey = await recover(id, binding); signal = options?.signal;
    started.resolve(); await finish.promise; return lateKey;
  };
  const unlocking = session.quickUnlock(id);
  await started.promise; session.lock(); finish.resolve();
  await expect(unlocking).rejects.toMatchObject({ code: 'LOCKED' });
  expect(signal?.aborted).toBe(true);
  expect((lateKey as Uint8Array | null)?.every((byte) => byte === 0)).toBe(true);
  expect(session.getSnapshot().vault).toBeNull();
  await device.revoke(id);
});

test('password rotation waits for enrollment and revokes the old quick unlock key', async () => {
  const device = new DeviceUnlock(); const session = await ready(device);
  const id = session.getSnapshot().current!.id;
  const started = deferred(); const finish = deferred();
  const enroll = device.enroll.bind(device);
  device.enroll = async (...args) => { started.resolve(); await finish.promise; await enroll(...args); };
  const enabling = session.enableBiometrics(FIXTURE_PASSWORD);
  await started.promise;
  const rotating = session.changePassword(FIXTURE_PASSWORD, 'new-fixture-master-password');
  finish.resolve(); await enabling; await rotating;
  expect(await device.enrolled(id)).toBe(false);
  session.lock();
  await expect(session.quickUnlock(id)).rejects.toMatchObject({ code: 'QUICK_UNLOCK_UNAVAILABLE' });
  await session.unlock(id, 'new-fixture-master-password');
  expect(session.getSnapshot().status).toBe('unlocked');
  session.lock();
});
