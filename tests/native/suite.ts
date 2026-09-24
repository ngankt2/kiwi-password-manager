import * as SecureStore from 'expo-secure-store';
import { equalBytes, utf8, wipe } from '../../src/core/bytes';
import { VaultError } from '../../src/core/errors';
import { DEFAULT_SETTINGS } from '../../src/core/security/settings';
import { createI18n, LOCALES } from '../../src/core/i18n';
import type { FilePort } from '../../src/core/storage/types';
import { JournalVaultStorage } from '../../src/core/storage/journal';
import { openVault } from '../../src/core/vault-format/codec';
import { VaultSession } from '../../src/domain/services/session';
import { createItem, saveItem } from '../../src/domain/services/items';
import { cryptoProvider } from '../../src/infrastructure/crypto/provider';
import { biometrics } from '../../src/infrastructure/biometric';
import { nativeSecurity } from '../../src/infrastructure/security/native-module';
import { runNativePoc } from './poc';

export interface NativeResult { fixture: string; passed: boolean; error?: string; entries?: number; stage?: string }
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function rejects(work: () => Promise<unknown>, code?: string) {
  let failure: unknown;
  try { await work(); } catch (error) { failure = error; }
  assert(failure, 'Expected the operation to fail');
  if (code) assert(failure instanceof VaultError && failure.code === code, `Expected ${code}`);
}

/** Runs only in an explicitly enabled development build, against dummy data. */
export async function runNativeSuite(files: FilePort, fixtures: Record<string, string>, progress: (results: NativeResult[]) => void) {
  const crypto = cryptoProvider;
  const storage = new JournalVaultStorage(files, crypto);
  const results = await runNativePoc(crypto, storage, fixtures);
  progress(results);
  const run = async (fixture: string, work: () => Promise<void>) => {
    try { await work(); results.push({ fixture, passed: true }); }
    catch (error) { results.push({ fixture, passed: false, error: error instanceof Error ? error.message : 'UNEXPECTED' }); }
    progress(results);
  };
  await run('All five languages initialize and format native counts and dates', async () => {
    const expected = { vi: '2 mục', en: '2 items', es: '2 elementos', fr: '2 éléments', 'zh-CN': '2 个项目' };
    for (const locale of LOCALES) {
      const i18n = createI18n(locale);
      assert(i18n.t('{count} mục', { count: 2 }) === expected[locale], `Incorrect ${locale} count`);
      assert(i18n.number(1234.5).length > 0, `Number formatting unavailable for ${locale}`);
      assert(i18n.dateTime('2026-09-24T00:00:00Z').length > 0, `Date formatting unavailable for ${locale}`);
    }
  });
  await run('AES-256-GCM native reference vector', async () => {
    const key = new Uint8Array(32); const nonce = new Uint8Array(12);
    const sealed = await crypto.encrypt(key, nonce, new Uint8Array(16), new Uint8Array());
    const hex = Array.from(sealed).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    assert(hex === 'cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919', 'AES-GCM vector mismatch');
    assert(equalBytes(await crypto.decrypt(key, nonce, sealed, new Uint8Array()), new Uint8Array(16)), 'AES-GCM round trip mismatch');
  });
  for (const fault of ['tag', 'key', 'aad'] as const) {
    await run(`AES-GCM rejects modified ${fault}`, async () => {
      const key = crypto.random(32); const nonce = crypto.random(12); const aad = utf8('native-qa-header');
      try {
        const sealed = await crypto.encrypt(key, nonce, utf8('dummy-native-qa-secret'), aad);
        if (fault === 'tag') sealed[sealed.length - 1] ^= 1;
        if (fault === 'key') key[0] ^= 1;
        if (fault === 'aad') aad[0] ^= 1;
        await rejects(() => crypto.decrypt(key, nonce, sealed, aad));
      } finally { wipe(key); }
    });
  }
  await run('Native filesystem refuses to overwrite an existing file', async () => {
    const path = 'exclusive-write.bin'; const original = utf8('original dummy bytes');
    await files.remove(path);
    try {
      await files.writeNew(path, original);
      await rejects(() => files.writeNew(path, utf8('replacement')));
      assert(equalBytes(await files.read(path), original), 'Existing file was modified');
    } finally { await files.remove(path); }
  });
  await run('Native filesystem rejects path traversal', async () => {
    await rejects(() => files.read('../outside.bin'), 'VALIDATION');
    await rejects(() => files.writeNew('../outside.bin', new Uint8Array()), 'VALIDATION');
  });
  await run('Native journal preserves the last commit after verification failure', async () => {
    const id = 'qa-failed-commit'; await storage.delete(id);
    try {
      const original = await storage.create(id, 'QA', utf8('first dummy generation'), async () => {});
      await rejects(() => storage.writeAtomic(id, 'QA', utf8('rejected generation'), original.revision,
        async () => { throw new VaultError('CORRUPT'); }, { automaticBackup: false, retention: 2 }), 'CORRUPT');
      assert((await storage.read(id)).revision === original.revision, 'A failed save replaced the previous commit');
      assert(!(await files.list(`vaults/${id}/`)).some((path) => path.endsWith('.tmp')), 'Temporary file was left behind');
    } finally { await storage.delete(id); }
  });
  await run('Native journal rejects a stale revision', async () => {
    const id = 'qa-conflict'; await storage.delete(id);
    try {
      const first = await storage.create(id, 'QA', utf8('first'), async () => {});
      const second = await storage.writeAtomic(id, 'QA', utf8('second'), first.revision, async () => {}, { automaticBackup: true, retention: 2 });
      await rejects(() => storage.writeAtomic(id, 'QA', utf8('stale'), first.revision, async () => {}, { automaticBackup: false, retention: 2 }), 'CONFLICT');
      assert((await storage.read(id)).revision === second.revision, 'Conflict changed committed data');
      assert(equalBytes(await storage.readBackup((await storage.backups(id))[0].id), first.bytes), 'Backup differs from the original');
    } finally { await storage.delete(id); }
  });
  await run('Native session create/edit/lock/reopen/backup/export/password change/delete', async () => {
    const session = new VaultSession(crypto, storage, { async read() { return DEFAULT_SETTINGS; }, async write() {} }, biometrics);
    let id: string | undefined;
    const originalPassword = 'Native-QA-original-2026'; const newPassword = 'Native-QA-rotated-2026';
    try {
      await session.initialize(); await session.create('Native QA', originalPassword);
      id = session.getSnapshot().current!.id;
      const item = { ...createItem('qa-login', 'login'), title: 'Dummy native login' };
      item.fields[1].value = 'DUMMY-SECRET-NATIVE-QA';
      await session.mutate((vault) => saveItem(vault, item, 'qa-v1'));
      const expected = JSON.stringify(session.getSnapshot().vault);
      const backup = await session.createBackup();
      const exported = await session.encryptedExport();
      assert(exported.name === 'Native QA.akpr', 'Export extension is incorrect');
      const reopened = await openVault(crypto, exported.bytes, originalPassword);
      try { assert(JSON.stringify(reopened.vault) === expected, 'Export round trip changed the vault'); } finally { wipe(reopened.context.key); }
      assert(equalBytes(await storage.readBackup(backup.id), exported.bytes), 'Encrypted backup differs');
      session.lock();
      assert(session.getSnapshot().vault === null, 'Lock retained decrypted state');
      await rejects(() => session.unlock(id!, 'incorrect-password'), 'AUTHENTICATION');
      assert(session.getSnapshot().status === 'locked', 'Wrong password opened the vault');
      await session.unlock(id, originalPassword);
      assert(JSON.stringify(session.getSnapshot().vault) === expected, 'Native reopen lost changes');
      await rejects(() => session.enableBiometrics('incorrect-password'), 'AUTHENTICATION');
      assert(!await biometrics.enrolled(id), 'Incorrect password enabled quick unlock');
      await session.changePassword(originalPassword, newPassword); session.lock();
      await rejects(() => session.unlock(id!, originalPassword), 'AUTHENTICATION');
      await session.unlock(id, newPassword);
      assert(JSON.stringify(session.getSnapshot().vault) === expected, 'Password change lost data');
      await rejects(() => session.deleteCurrent('incorrect-password'), 'AUTHENTICATION');
      assert((await storage.read(id)).bytes.length > 0, 'Wrong-password deletion removed data');
      await session.deleteCurrent(newPassword);
      assert(session.getSnapshot().status === 'locked', 'Delete did not lock the session');
      await rejects(() => storage.read(id!), 'NOT_FOUND');
    } finally { session.lock(); if (id) { await biometrics.revoke(id); await storage.delete(id); } }
  });
  await run('SecureStore native write/read/remove', async () => {
    const key = 'kiro.native-qa.probe';
    assert(await SecureStore.isAvailableAsync(), 'SecureStore unavailable');
    try {
      await SecureStore.setItemAsync(key, 'dummy-native-qa-value');
      assert(await SecureStore.getItemAsync(key) === 'dummy-native-qa-value', 'SecureStore value changed');
    } finally { await SecureStore.deleteItemAsync(key); }
    assert(await SecureStore.getItemAsync(key) === null, 'SecureStore removal failed');
  });
  await run('Native security module is linked and reports device-lock state', async () => {
    assert(nativeSecurity, 'KiroSecurity module is not linked');
    assert(typeof await nativeSecurity!.isDeviceLocked() === 'boolean', 'Invalid device lock state');
  });
  await run('Cancelled biometric setup leaves enrollment disabled', async () => {
    const controller = new AbortController(); controller.abort();
    await rejects(() => biometrics.enroll('native-qa-cancelled', 'test-binding', new Uint8Array(32), { signal: controller.signal }), 'CANCELLED');
    assert(!await biometrics.enrolled('native-qa-cancelled'), 'Cancelled setup enabled enrollment');
  });
  return { results, quickUnlock: await biometrics.support?.() };
}
