import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { selectRecentVault, VaultSession, type BiometricPort } from '../src/domain/services/session';
import { JournalVaultStorage } from '../src/core/storage/journal';
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '../src/core/security/settings';
import { MemoryFiles } from './helpers/memory-files';
import { FIXTURE_PASSWORD, testCrypto } from './helpers/crypto';
import { createItem, saveItem } from '../src/domain/services/items';
import { openVault, readEnvelope } from '../src/core/vault-format/codec';
import { wipe } from '../src/core/bytes';

const biometrics: BiometricPort = { async available() { return false; }, async enrolled() { return false; }, async enroll() {}, async recover() { return null; }, async revoke() {} };
const preferences = { async read() { return DEFAULT_SETTINGS; }, async write() {} };
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

test('the last successfully opened vault is remembered across sessions without rewriting it', async () => {
  const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
  let saved: Settings = { ...DEFAULT_SETTINGS, language: 'fr', theme: 'dark' };
  const persistedPreferences = { async read() { return saved; }, async write(settings: Settings) { saved = settings; } };
  const session = new VaultSession(testCrypto, storage, persistedPreferences, biometrics);
  await session.initialize();
  await session.create('First vault', FIXTURE_PASSWORD);
  const firstId = session.getSnapshot().current!.id;
  const firstRecord = await storage.read(firstId);
  await session.create('Second vault', FIXTURE_PASSWORD);
  const secondId = session.getSnapshot().current!.id;
  session.lock();
  await session.unlock(firstId, FIXTURE_PASSWORD);
  expect(selectRecentVault(session.getSnapshot())?.id).toBe(firstId);
  session.lock();
  const restarted = new VaultSession(testCrypto, storage, persistedPreferences, biometrics);
  await restarted.initialize();
  expect(restarted.getSnapshot().status).toBe('locked');
  expect(restarted.getSnapshot().vault).toBeNull();
  expect(selectRecentVault(restarted.getSnapshot())?.id).toBe(firstId);
  expect(saved).toMatchObject({ lastOpenedVaultId: firstId, language: 'fr', theme: 'dark' });
  expect(await storage.read(firstId)).toEqual(firstRecord);
  await expect(restarted.unlock(secondId, 'wrong-password')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
  expect(saved.lastOpenedVaultId).toBe(firstId);
  restarted.lock();
});

test('recent-vault selection handles existing preferences, missing vaults and explicit current vaults', () => {
  const earlier = { id: 'earlier', name: 'Earlier', location: 'local', updatedAt: '2026-01-01T00:00:00.000Z' };
  const latest = { ...earlier, id: 'latest', name: 'Latest', updatedAt: '2026-02-01T00:00:00.000Z' };
  const legacySettings = SettingsSchema.parse({ language: 'fr', autoLockSeconds: 60 });
  expect(legacySettings.lastOpenedVaultId).toBeNull();
  expect(legacySettings).toMatchObject({ language: 'fr', autoLockSeconds: 60 });
  const state = { current: null, recents: [earlier, latest], settings: legacySettings };
  expect(selectRecentVault(state)?.id).toBe('latest');
  expect(selectRecentVault({ ...state, settings: { ...legacySettings, lastOpenedVaultId: 'earlier' } })?.id).toBe('earlier');
  expect(selectRecentVault({ ...state, current: earlier })?.id).toBe('earlier');
  expect(selectRecentVault({ ...state, current: { ...earlier, id: 'removed' }, settings: { ...legacySettings, lastOpenedVaultId: 'removed' } })?.id).toBe('latest');
  expect(selectRecentVault({ ...state, recents: [] })).toBeUndefined();
});

test('a recent-vault preference failure does not fail authentication or weaken saved security settings', async () => {
  const session = new VaultSession(testCrypto, new JournalVaultStorage(new MemoryFiles(), testCrypto), {
    async read() { return { ...DEFAULT_SETTINGS, requireAuthenticationToReveal: true }; },
    async write() { throw new Error('Preferences unavailable'); },
  }, biometrics);
  await session.initialize();
  await session.create('Usable vault', FIXTURE_PASSWORD);
  const id = session.getSnapshot().current!.id;
  session.lock();
  await session.unlock(id, FIXTURE_PASSWORD);
  expect(session.getSnapshot().status).toBe('unlocked');
  expect(session.getSnapshot().settings.requireAuthenticationToReveal).toBe(true);
  expect(selectRecentVault(session.getSnapshot())?.id).toBe(id);
  session.lock();
});

test('update restart drains a queued save before busy is visible and fences new writes', async () => {
  const files = new MemoryFiles();
  const session = new VaultSession(testCrypto, new JournalVaultStorage(files, testCrypto), preferences, biometrics);
  await session.initialize(); await session.create('Before restart', FIXTURE_PASSWORD);
  const save = session.mutate((vault) => ({ ...vault, name: 'Saved before restart' }));
  expect(session.getSnapshot().busy).toBe(false);
  const preparing = session.prepareForRestart();
  await expect(session.mutate((vault) => ({ ...vault, name: 'Must not save' }))).rejects.toMatchObject({ code: 'CANCELLED' });
  await expect(session.create('Must not create', FIXTURE_PASSWORD)).rejects.toMatchObject({ code: 'CANCELLED' });
  const release = await preparing; await save;
  expect((await session.readDiskVersion()).name).toBe('Saved before restart');
  release();
  await session.mutate((vault) => ({ ...vault, name: 'Restart cancelled' }));
  expect((await session.readDiskVersion()).name).toBe('Restart cancelled');
  session.lock();
});

test('update restart cannot interrupt preferences and releases its fence on a failed save', async () => {
  const pending = deferred();
  const session = new VaultSession(testCrypto, new JournalVaultStorage(new MemoryFiles(), testCrypto), { ...preferences, write: () => pending.promise }, biometrics);
  await session.initialize();
  const write = session.updateSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
  await expect(session.prepareForRestart()).rejects.toMatchObject({ code: 'CONFLICT' });
  pending.resolve(); await write;
  await session.create('Restart failure', FIXTURE_PASSWORD);
  await expect(session.mutate(() => { throw new Error('synthetic save failure'); })).rejects.toThrow('synthetic save failure');
  await expect(session.prepareForRestart()).rejects.toThrow('synthetic save failure');
  await session.mutate((vault) => ({ ...vault, name: 'Can save after restart failure' }));
  const release = await session.prepareForRestart(); release(); session.lock();
});

test('legacy vaults export as .akpr and reopen with identical encrypted content', async () => {
  const legacy = new Uint8Array(await readFile('fixtures/vault/schema-v2.vault'));
  const source = new VaultSession(testCrypto, new JournalVaultStorage(new MemoryFiles(), testCrypto), preferences, biometrics);
  const restored = new VaultSession(testCrypto, new JournalVaultStorage(new MemoryFiles(), testCrypto), preferences, biometrics);
  try {
    await source.initialize();
    await source.importVault(legacy, 'schema-v2.vault', FIXTURE_PASSWORD);
    const exported = await source.encryptedExport();
    expect(exported.name).toBe('Compatibility fixture.akpr');
    expect(exported.bytes).toEqual(legacy);
    await restored.initialize();
    await expect(restored.importVault(exported.bytes, exported.name, 'wrong-password')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
    await restored.importVault(exported.bytes, exported.name, FIXTURE_PASSWORD);
    expect(restored.getSnapshot().vault).toEqual(source.getSnapshot().vault);
  } finally { source.lock(); restored.lock(); }
});

test('session create/edit/lock/unlock persists only encrypted data; password rotation works', async () => {
  const files = new MemoryFiles(); const storage = new JournalVaultStorage(files, testCrypto);
  const session = new VaultSession(testCrypto, storage, preferences, biometrics);
  await session.initialize(); await session.create('Work', 'original-master-password');
  const item = { ...createItem('entry', 'login'), title: 'Example login' }; item.fields[1].value = 'UNIQUE-SECRET-FOR-TEST';
  await session.mutate((vault) => saveItem(vault, item, 'v1'));
  const id = session.getSnapshot().current!.id;
  session.lock(); expect(session.getSnapshot().vault).toBeNull(); expect(session.getSnapshot().status).toBe('locked');
  for (const value of files.data.values()) expect(Buffer.from(value).includes(Buffer.from('UNIQUE-SECRET-FOR-TEST'))).toBe(false);
  await session.unlock(id, 'original-master-password'); expect(session.getSnapshot().vault?.items[0].fields[1].value).toBe('UNIQUE-SECRET-FOR-TEST');
  await session.changePassword('original-master-password', 'new-independent-master-password'); session.lock();
  await expect(session.unlock(id, 'original-master-password')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
  await session.unlock(id, 'new-independent-master-password'); expect(session.getSnapshot().vault?.items).toHaveLength(1);
  session.lock();
});

test('locking during a pending unlock cannot resurrect decrypted state', async () => {
  const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
  const session = new VaultSession(testCrypto, storage, preferences, biometrics);
  await session.initialize(); await session.create('Work', 'original-master-password');
  const id = session.getSnapshot().current!.id; session.lock();
  const unlocking = session.unlock(id, 'original-master-password'); session.lock();
  await expect(unlocking).rejects.toMatchObject({ code: 'LOCKED' });
  expect(session.getSnapshot().vault).toBeNull(); expect(session.getSnapshot().status).toBe('locked');
});

test('concurrent mutations are serialized using the most recent model', async () => {
  const session = new VaultSession(testCrypto, new JournalVaultStorage(new MemoryFiles(), testCrypto), preferences, biometrics);
  await session.initialize(); await session.create('Work', 'original-master-password');
  await Promise.all(['a', 'b'].map((id) => session.mutate((vault) => saveItem(vault, { ...createItem(id, 'login'), title: id }, id))));
  expect(session.getSnapshot().vault?.items).toHaveLength(2); session.lock();
});

test('backup restore keeps a recovery copy and restores all verified content', async () => {
  const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
  const session = new VaultSession(testCrypto, storage, preferences, biometrics);
  await session.initialize(); await session.create('Work', 'original-master-password');
  const item = { ...createItem('entry', 'login'), title: 'Before restore' };
  await session.mutate((vault) => saveItem(vault, item, 'v1'));
  const backup = await session.createBackup();
  await session.mutate((vault) => saveItem(vault, { ...vault.items[0], title: 'Later change' }, 'v2'));
  const opened = await openVault(testCrypto, await storage.readBackup(backup.id), 'original-master-password');
  try { await session.restore(opened.vault); } finally { wipe(opened.context.key); }
  expect(session.getSnapshot().vault?.items[0].title).toBe('Before restore');
  const recovery = (await storage.backups(backup.vaultId)).find((item) => item.reason === 'restore');
  expect(recovery).toBeDefined();
  const previous = await openVault(testCrypto, await storage.readBackup(recovery!.id), 'original-master-password');
  expect(previous.vault.items[0].title).toBe('Later change'); wipe(previous.context.key); session.lock();
});

test('Save As preserves an unsaved draft after conflict and creates an independent KDF salt', async () => {
  const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
  const a = new VaultSession(testCrypto, storage, preferences, biometrics);
  const b = new VaultSession(testCrypto, storage, preferences, biometrics);
  await a.initialize(); await b.initialize(); await a.create('Source', 'original-master-password');
  const id = a.getSnapshot().current!.id;
  const originalHeader = readEnvelope((await storage.read(id)).bytes).header;
  await b.unlock(id, 'original-master-password');
  await b.mutate((vault) => saveItem(vault, { ...createItem('external', 'login'), title: 'External change' }, 'v1'));
  const draft = { ...createItem('draft', 'login'), title: 'Unsaved draft' };
  await expect(a.mutate((vault) => saveItem(vault, draft, 'v1'))).rejects.toMatchObject({ code: 'CONFLICT' });
  await a.saveAs('Recovered draft', 'original-master-password', (vault) => saveItem(vault, draft, 'v1'));
  expect(a.getSnapshot().vault?.items[0].title).toBe('Unsaved draft');
  const copiedHeader = readEnvelope((await storage.read(a.getSnapshot().current!.id)).bytes).header;
  expect(copiedHeader.kdf.salt).not.toBe(originalHeader.kdf.salt);
  expect(copiedHeader.vaultId).not.toBe(originalHeader.vaultId);
  const source = await openVault(testCrypto, (await storage.read(id)).bytes, 'original-master-password');
  expect(source.vault.items[0].title).toBe('External change'); wipe(source.context.key); a.lock(); b.lock();
});

test('locking during disk authentication, export or conflict review cancels the stale read', async () => {
  for (const operation of ['reauthenticate', 'encryptedExport', 'readDiskVersion'] as const) {
    const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
    const session = new VaultSession(testCrypto, storage, preferences, biometrics);
    await session.initialize(); await session.create('Work', 'original-master-password');
    const read = storage.read.bind(storage); const gate = deferred();
    storage.read = async (id) => { await gate.promise; return read(id); };
    const pending = operation === 'reauthenticate' ? session.reauthenticate('original-master-password') : session[operation]();
    session.lock(); gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'LOCKED' });
    expect(session.getSnapshot().vault).toBeNull();
  }
});

test('queued high-risk operations cannot act on a session after it locks', async () => {
  const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
  const session = new VaultSession(testCrypto, storage, preferences, biometrics);
  await session.initialize(); await session.create('Work', 'original-master-password');
  const id = session.getSnapshot().current!.id;
  const write = storage.writeAtomic.bind(storage); const started = deferred(); const gate = deferred();
  storage.writeAtomic = async (...args) => { started.resolve(); await gate.promise; return write(...args); };
  const saving = session.mutate((vault) => ({ ...vault, name: 'Pending change' }));
  await started.promise;
  const results = Promise.allSettled([
    saving, session.createBackup(), session.saveAs('Stale copy', 'original-master-password'),
    session.changePassword('original-master-password', 'replacement-master-password'), session.deleteCurrent('original-master-password'),
  ]);
  session.lock(); gate.resolve();
  for (const result of await results) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toMatchObject({ code: 'LOCKED' });
  }
  expect((await storage.list()).map((vault) => vault.id)).toEqual([id]);
});

test('locking during delete authentication cleanup preserves the vault', async () => {
  const started = deferred(); const gate = deferred();
  const storage = new JournalVaultStorage(new MemoryFiles(), testCrypto);
  const session = new VaultSession(testCrypto, storage, preferences, {
    ...biometrics, async revoke() { started.resolve(); await gate.promise; },
  });
  await session.initialize(); await session.create('Work', 'original-master-password');
  const id = session.getSnapshot().current!.id;
  const deleting = session.deleteCurrent('original-master-password');
  await started.promise; session.lock(); gate.resolve();
  await expect(deleting).rejects.toMatchObject({ code: 'LOCKED' });
  expect((await storage.list()).map((vault) => vault.id)).toEqual([id]);
});
