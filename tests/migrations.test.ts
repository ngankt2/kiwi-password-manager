import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { openVault, openWithKey, readEnvelope, sealVault } from '../src/core/vault-format/codec';
import { testCrypto, FIXTURE_PASSWORD } from './helpers/crypto';
import { MemoryFiles } from './helpers/memory-files';
import { JournalVaultStorage } from '../src/core/storage/journal';
import { wipe } from '../src/core/bytes';

for (const schema of [1, 2]) {
  test(`checked-in schema ${schema} fixture opens in the current reader`, async () => {
    const bytes = new Uint8Array(await readFile(`fixtures/vault/schema-v${schema}.vault`));
    const original = bytes.slice();
    const result = await openVault(testCrypto, bytes, FIXTURE_PASSWORD);
    expect(result.migrated).toBe(schema === 1);
    expect(result.vault.schemaVersion).toBe(2);
    expect(result.vault.items[0].fields[1].value).toBe('FAKE-fixture-password');
    expect(result.vault.items[0].archivedAt).toBeNull();
    expect(bytes).toEqual(original); wipe(result.context.key);
  });
}

test('schema migration saves a verified new generation and backs up original bytes', async () => {
  const files = new MemoryFiles(); const storage = new JournalVaultStorage(files, testCrypto);
  const bytes = new Uint8Array(await readFile('fixtures/vault/schema-v1.vault'));
  const result = await openVault(testCrypto, bytes, FIXTURE_PASSWORD);
  const verify = async (data: Uint8Array) => { await openWithKey(testCrypto, data, result.context.key); };
  const record = await storage.create('fixture', 'Fixture', bytes, verify);
  const migrated = await sealVault(testCrypto, result.vault, result.context);
  await storage.writeAtomic('fixture', 'Fixture', migrated, record.revision, verify, { automaticBackup: false, retention: 3, reason: 'migration' });
  expect(readEnvelope((await storage.read('fixture')).bytes).header.schemaVersion).toBe(2);
  const backup = (await storage.backups('fixture'))[0];
  expect(await storage.readBackup(backup.id)).toEqual(bytes); wipe(result.context.key);
});
