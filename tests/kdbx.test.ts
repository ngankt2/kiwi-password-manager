import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { previewKeePass } from '../src/core/kdbx/importer';
import { deriveContext, openVault, sealVault } from '../src/core/vault-format/codec';
import { saveItem } from '../src/domain/services/items';
import { testCrypto, TEST_KDF } from './helpers/crypto';
import { fromBase64, wipe } from '../src/core/bytes';

const fixture = async (name: string) => new Uint8Array(await readFile(join(import.meta.dir, '../fixtures/kdbx', name)));
export const fixtureMatrix = [
  { file: 'demo.kdbx', password: 'demo', key: 'demo.key', version: '3.1', kdf: 'AES-KDF', cipher: 'AES-256' },
  { file: 'Argon2.kdbx', password: 'demo', key: 'demo.key', version: '4.0', kdf: 'Argon2d', cipher: 'AES-256' },
  { file: 'Argon2id.kdbx', password: 'demo', key: 'demo.key', version: '4.0', kdf: 'Argon2id', cipher: 'AES-256' },
  { file: 'Argon2ChaCha.kdbx', password: 'demo', key: 'demo.key', version: '4.0', kdf: 'Argon2d', cipher: 'ChaCha20' },
  { file: 'AesChaCha.kdbx', password: 'demo', key: 'demo.key', version: '3.1', kdf: 'AES-KDF', cipher: 'ChaCha20' },
  // Despite the upstream filename, this fixture's actual header is KDBX 3.1.
  { file: 'AesKdfKdbx4.kdbx', password: 'demo', version: '3.1', kdf: 'AES-KDF', cipher: 'AES-256' },
  { file: 'KDBX4.1.kdbx', password: 'test', version: '4.1', kdf: 'AES-KDF', cipher: 'AES-256' },
];

describe('KeePass fixtures → converted vault → edit → encrypted reopen', () => {
  for (const row of fixtureMatrix) {
    test(row.file, async () => {
      const original = await fixture(row.file);
      const before = original.slice();
      const preview = await previewKeePass(testCrypto, original, row.password, 'converted', row.file, row.key ? await fixture(row.key) : undefined);
      expect(original).toEqual(before);
      expect(preview.source.version).toBe(row.version);
      expect(preview.source.kdf).toBe(row.kdf);
      expect(preview.source.cipher).toBe(row.cipher);
      expect(preview.counts.entries).toBeGreaterThan(0);
      expect(preview.counts.folders).toBe(preview.vault.folders.length);
      const context = await deriveContext(testCrypto, 'new independent master password', TEST_KDF);
      const encrypted = await sealVault(testCrypto, preview.vault, context);
      const reopened = await openVault(testCrypto, encrypted, 'new independent master password');
      expect(reopened.vault).toEqual(preview.vault);
      const item = reopened.vault.items[0];
      const edited = saveItem(reopened.vault, { ...item, title: `${item.title} edited` }, 'new-history-version');
      const changed = await sealVault(testCrypto, edited, context);
      const final = await openVault(testCrypto, changed, 'new independent master password');
      expect(final.vault.items[0].history).toHaveLength(item.history.length + 1);
      expect(final.vault.items[0].fields).toEqual(item.fields);
      expect(final.vault.items[0].attachments).toEqual(item.attachments);
      expect(final.vault.items[0].tags).toEqual(item.tags);
      expect(final.vault.folders).toEqual(preview.vault.folders);
      expect(final.vault.metadata).toEqual(preview.vault.metadata);
      wipe(context.key, reopened.context.key, final.context.key);
    });
  }

  test('real KeePass fixture maps custom fields, attachments and history without loss', async () => {
    const preview = await previewKeePass(testCrypto, await fixture('demo.kdbx'), 'demo', 'id', 'demo.kdbx', await fixture('demo.key'));
    expect(preview.source.generator).toBe('KeePass');
    expect(preview.counts.customFields).toBeGreaterThan(0);
    expect(preview.counts.attachments).toBeGreaterThan(0);
    expect(preview.counts.history).toBeGreaterThan(0);
    const attachment = preview.vault.items.flatMap((item) => item.attachments)[0];
    expect(fromBase64(attachment.data).length).toBe(attachment.size);
  });

  test('KDBX 4.1 group tags and quality-check metadata are preserved', async () => {
    const preview = await previewKeePass(testCrypto, await fixture('KDBX4.1.kdbx'), 'test', 'id', 'KDBX4.1.kdbx');
    expect(preview.vault.folders.find((group) => group.name === 'With tags')?.tags).toEqual(['Another tag', 'Tag1']);
    const metadata = preview.vault.items.find((item) => item.title === 'DisabledQ')?.metadata.keepass;
    expect(metadata).toMatchObject({ qualityCheck: false });
  });

  test('wrong password and missing required keyfile are rejected', async () => {
    const bytes = await fixture('demo.kdbx');
    await expect(previewKeePass(testCrypto, bytes, 'wrong', 'id', 'demo.kdbx', await fixture('demo.key'))).rejects.toMatchObject({ code: 'AUTHENTICATION' });
    await expect(previewKeePass(testCrypto, bytes, 'demo', 'id', 'demo.kdbx')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
  });
});
