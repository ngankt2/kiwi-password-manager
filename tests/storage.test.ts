import 'fake-indexeddb/auto';
import { describe, expect, test } from 'bun:test';
import { JournalVaultStorage } from '../src/core/storage/journal';
import { IndexedDbVaultStorage } from '../src/infrastructure/filesystem/indexeddb';
import { deriveContext, openVault, openWithKey, sealVault } from '../src/core/vault-format/codec';
import { createVault } from '../src/domain/services/items';
import { testCrypto, TEST_KDF } from './helpers/crypto';
import { MemoryFiles } from './helpers/memory-files';
import { wipe } from '../src/core/bytes';

const options = { automaticBackup: true, retention: 3 };

describe('immutable journal recovery', () => {
  for (const failure of ['write', 'promote', 'corrupt'] as const) {
    test(`preserves the previous file after ${failure} failure and removes temporary files`, async () => {
      const files = new MemoryFiles(); const storage = new JournalVaultStorage(files, testCrypto);
      const context = await deriveContext(testCrypto, 'right password', TEST_KDF);
      const vault = createVault('vault1', 'Original vault');
      const original = await sealVault(testCrypto, vault, context);
      const verify = async (bytes: Uint8Array) => { await openWithKey(testCrypto, bytes, context.key); };
      const record = await storage.create('vault1', vault.name, original, verify);
      files.fail = failure;
      await expect(storage.writeAtomic('vault1', 'Changed', await sealVault(testCrypto, { ...vault, name: 'Changed' }, context), record.revision, verify, options)).rejects.toThrow();
      files.fail = null;
      const recovered = await storage.open('vault1');
      expect(recovered.bytes).toEqual(original);
      expect((await openVault(testCrypto, recovered.bytes, 'right password')).vault.name).toBe('Original vault');
      expect([...files.data.keys()].some((key) => key.endsWith('.tmp'))).toBe(false); wipe(context.key);
    });
  }

  test('detects externally modified file content before writing', async () => {
    const files = new MemoryFiles(); const storage = new JournalVaultStorage(files, testCrypto);
    const original = new Uint8Array([1, 2, 3]);
    const record = await storage.create('id', 'Vault', original, async () => undefined);
    files.data.set(record.location, new Uint8Array([7, 8, 9]));
    await expect(storage.writeAtomic('id', 'Vault', original, record.revision, async () => undefined, options)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await storage.read('id')).bytes).toEqual(new Uint8Array([7, 8, 9]));
  });

  test('retains last-known-good even when automatic backups are disabled', async () => {
    const files = new MemoryFiles(); const storage = new JournalVaultStorage(files, testCrypto);
    const record = await storage.create('id', 'Vault', new Uint8Array([1]), async () => undefined);
    await storage.writeAtomic('id', 'Vault', new Uint8Array([2]), record.revision, async () => undefined, { ...options, automaticBackup: false });
    const recoveries = await storage.recoveries('id');
    expect(recoveries).toHaveLength(1);
    expect(await storage.readBackup(recoveries[0].id)).toEqual(new Uint8Array([1]));
  });
});

describe('IndexedDB encrypted transactions', () => {
  test('persists bytes across adapter restart; one concurrent writer wins', async () => {
    const dbName = `test-${crypto.randomUUID()}`;
    const storage = new IndexedDbVaultStorage(dbName);
    const record = await storage.create('id', 'Vault', new Uint8Array([1]), async () => undefined);
    const second = new IndexedDbVaultStorage(dbName);
    expect((await second.read('id')).bytes).toEqual(record.bytes);
    const results = await Promise.allSettled([storage, second].map((adapter, i) => adapter.writeAtomic('id', 'Vault', new Uint8Array([i + 2]), record.revision, async () => undefined, options)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await storage.recoveries('id')).toHaveLength(1);
  });
  test('a failed verification cannot replace a current vault', async () => {
    const storage = new IndexedDbVaultStorage(`test-${crypto.randomUUID()}`);
    const record = await storage.create('id', 'Vault', new Uint8Array([1]), async () => undefined);
    await expect(storage.writeAtomic('id', 'Vault', new Uint8Array([2]), record.revision, async () => { throw new Error('verification failed'); }, options)).rejects.toThrow();
    expect((await storage.read('id')).bytes).toEqual(record.bytes);
  });
});
