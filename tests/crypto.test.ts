import { describe, expect, test } from 'bun:test';
import { deriveContext, openVault, readEnvelope, sealVault } from '../src/core/vault-format/codec';
import { createItem, createVault } from '../src/domain/services/items';
import { testCrypto, TEST_KDF } from './helpers/crypto';
import { equalBytes, utf8, wipe } from '../src/core/bytes';
import { calibrateKdf, validateKdf } from '../src/core/crypto/calibrate';

describe('cryptographic boundary', () => {
  test('Argon2id matches a fixed reference vector', async () => {
    const result = await testCrypto.argon2(utf8('password'), utf8('somesalt'), { ...TEST_KDF, memoryKiB: 65536, iterations: 2, parallelism: 1 });
    expect(Buffer.from(result).toString('hex')).toBe('09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7');
  });

  test('create → encrypted bytes → close → reopen; no plaintext in file', async () => {
    const vault = createVault('test-vault', 'Private work');
    const item = createItem('test-item', 'login');
    item.title = 'Private service'; item.fields[1].value = 'a-secret-that-must-not-persist'; vault.items.push(item);
    const context = await deriveContext(testCrypto, 'correct horse battery staple', TEST_KDF);
    const encrypted = await sealVault(testCrypto, vault, context);
    wipe(context.key);
    expect(Buffer.from(encrypted).includes(Buffer.from(item.fields[1].value))).toBe(false);
    expect(Buffer.from(encrypted).includes(Buffer.from(vault.name))).toBe(false);
    const result = await openVault(testCrypto, encrypted, 'correct horse battery staple');
    expect(result.vault).toEqual(vault); wipe(result.context.key);
  });

  test('wrong passwords and modified ciphertext fail authentication', async () => {
    const context = await deriveContext(testCrypto, 'right password', TEST_KDF);
    const bytes = await sealVault(testCrypto, createVault('id', 'Vault'), context);
    await expect(openVault(testCrypto, bytes, 'wrong password')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
    bytes[bytes.length - 20] ^= 1;
    await expect(openVault(testCrypto, bytes, 'right password')).rejects.toMatchObject({ code: 'AUTHENTICATION' }); wipe(context.key);
  });

  test('header bytes are authenticated; future versions do not write', async () => {
    const context = await deriveContext(testCrypto, 'right password', TEST_KDF);
    const bytes = await sealVault(testCrypto, createVault('id', 'Vault'), context);
    const copy = Buffer.from(bytes);
    const position = copy.indexOf('"vaultId":"id"');
    copy[position + 11] = 'x'.charCodeAt(0);
    await expect(openVault(testCrypto, copy, 'right password')).rejects.toMatchObject({ code: 'AUTHENTICATION' });
    const versionPosition = Buffer.from(bytes).indexOf('"formatVersion":1');
    bytes[versionPosition + 16] = '9'.charCodeAt(0);
    expect(() => readEnvelope(bytes)).toThrow(); wipe(context.key);
  });

  test('every save receives a new nonce; every new key gets a new salt', async () => {
    const first = await deriveContext(testCrypto, 'password', TEST_KDF);
    const second = await deriveContext(testCrypto, 'password', TEST_KDF);
    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    const vault = createVault('id', 'Vault');
    const a = readEnvelope(await sealVault(testCrypto, vault, first));
    const b = readEnvelope(await sealVault(testCrypto, vault, first));
    expect(a.header.cipher.nonce).not.toBe(b.header.cipher.nonce);
    expect(equalBytes(a.ciphertext, b.ciphertext)).toBe(false); wipe(first.key, second.key);
  });

  test('hostile KDF requests are rejected before work', () => {
    for (const memoryKiB of [0, -1, Infinity, 262145, 64.1]) expect(() => validateKdf({ ...TEST_KDF, memoryKiB })).toThrow();
    expect(() => validateKdf({ ...TEST_KDF, iterations: 1000000 })).toThrow();
    expect(() => validateKdf({ ...TEST_KDF, memoryKiB: 262144, iterations: 33 })).toThrow();
  });

  test('accepts bounded KeePass calibration with 108 passes and four lanes', () => {
    expect(() => validateKdf({ ...TEST_KDF, memoryKiB: 65536, iterations: 108, parallelism: 4 })).not.toThrow();
  });

  test('calibration never weakens the memory or iteration floor', async () => {
    let tick = 0;
    const calibrated = await calibrateKdf({ ...testCrypto, argon2: async () => new Uint8Array(32) }, () => tick++ * 2000);
    expect(calibrated.parameters.memoryKiB).toBe(65536);
    expect(calibrated.parameters.iterations).toBe(3);
  });
});
