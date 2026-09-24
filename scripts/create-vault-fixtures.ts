import { mkdir, writeFile } from 'node:fs/promises';
import { createItem, createVault } from '../src/domain/services/items';
import { deriveContext, MAGIC, sealVault } from '../src/core/vault-format/codec';
import { concat, toBase64, utf8, wipe } from '../src/core/bytes';
import { testCrypto, TEST_KDF, FIXTURE_PASSWORD } from '../tests/helpers/crypto';

const now = '2026-09-23T00:00:00.000Z';
const vault = createVault('fixture-vault', 'Compatibility fixture', now);
const item = createItem('fixture-login', 'login', null, now);
item.title = 'Example service'; item.fields[0].value = 'fixture@example.invalid'; item.fields[1].value = 'FAKE-fixture-password';
vault.items.push(item);
const context = await deriveContext(testCrypto, FIXTURE_PASSWORD, TEST_KDF);
await mkdir('fixtures/vault', { recursive: true });
await writeFile('fixtures/vault/schema-v2.vault', await sealVault(testCrypto, vault, context));

const { revision: _revision, ...v1base } = vault;
const v1 = { ...v1base, schemaVersion: 1, items: vault.items.map(({ archivedAt: _archive, deletedAt: _delete, ...entry }) => entry) };
const nonce = testCrypto.random(12);
const header = utf8(JSON.stringify({ formatVersion: 1, cryptoVersion: 1, schemaVersion: 1, vaultId: vault.id, kdf: context.kdf,
  cipher: { algorithm: 'aes-256-gcm', nonce: toBase64(nonce) } }));
const prefix = new Uint8Array(12); prefix.set(MAGIC); new DataView(prefix.buffer).setUint32(8, header.length);
const aad = concat(prefix, header); const plaintext = utf8(JSON.stringify(v1));
await writeFile('fixtures/vault/schema-v1.vault', concat(aad, await testCrypto.encrypt(context.key, nonce, plaintext, aad)));
wipe(context.key, plaintext);
