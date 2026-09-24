import type { CryptoProvider } from '../../src/core/crypto/types';
import type { VaultStorageAdapter } from '../../src/core/storage/types';
import { fromBase64, utf8, wipe } from '../../src/core/bytes';
import { previewKeePass } from '../../src/core/kdbx/importer';
import { deriveContext, openVault, openWithKey, sealVault } from '../../src/core/vault-format/codec';

export async function runNativePoc(crypto: CryptoProvider, storage: VaultStorageAdapter, fixtures: Record<string, string>) {
  const results: { fixture: string; passed: boolean; entries?: number; error?: string; stage?: string }[] = [];
  const parameters = { algorithm: 'argon2id' as const, version: 19 as const, memoryKiB: 65536, iterations: 3, parallelism: 1 };
  try {
    const vector = await crypto.argon2(utf8('password'), utf8('somesalt'), { ...parameters, iterations: 2 });
    const hex = Array.from(vector).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    results.push({ fixture: 'Argon2id native reference vector', passed: hex === '09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7' }); wipe(vector);
  } catch (error) { results.push({ fixture: 'Argon2id native reference vector', passed: false, error: error instanceof Error ? error.message : 'UNEXPECTED' }); }
  try {
    const hash = await crypto.sha256(utf8('abc'));
    const hex = Array.from(hash).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    results.push({ fixture: 'SHA256 native reference vector', passed: hex === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' });
  }
  catch (error) { results.push({ fixture: 'SHA256 native', passed: false, error: error instanceof Error ? error.message : 'UNEXPECTED' }); }
  const matrix = [
    { file: 'demo.kdbx', password: 'demo', key: 'demo.key' },
    { file: 'Argon2.kdbx', password: 'demo', key: 'demo.key' },
    { file: 'Argon2id.kdbx', password: 'demo', key: 'demo.key' },
    { file: 'Argon2ChaCha.kdbx', password: 'demo', key: 'demo.key' },
    { file: 'AesChaCha.kdbx', password: 'demo', key: 'demo.key' },
    { file: 'AesKdfKdbx4.kdbx', password: 'demo' },
    { file: 'KDBX4.1.kdbx', password: 'test' },
  ];
  for (const row of matrix) {
    let stage = 'prepare';
    const id = `poc-${row.file.replace(/[^a-zA-Z0-9]/g, '')}`;
    let key: Uint8Array | undefined;
    try {
      await storage.delete(id);
      stage = 'import';
      const preview = await previewKeePass(crypto, fromBase64(fixtures[row.file]), row.password, id, row.file, row.key ? fromBase64(fixtures[row.key]) : undefined);
      stage = 'derive';
      const context = await deriveContext(crypto, 'native-fixture-password', parameters);
      key = context.key;
      stage = 'encrypt';
      const encrypted = await sealVault(crypto, preview.vault, context);
      stage = 'decrypt in memory';
      await openWithKey(crypto, encrypted, context.key);
      stage = 'persist';
      await storage.create(id, 'Native POC', encrypted, async (bytes) => { await openWithKey(crypto, bytes, context.key); });
      wipe(context.key);
      const persisted = await storage.read(id);
      const reopened = await openVault(crypto, persisted.bytes, 'native-fixture-password');
      const passed = JSON.stringify(reopened.vault) === JSON.stringify(preview.vault);
      wipe(reopened.context.key);
      results.push({ fixture: row.file, passed, entries: preview.counts.entries });
    } catch (error) {
      results.push({ fixture: row.file, passed: false, stage, error: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED' });
    } finally { wipe(key); await storage.delete(id); }
  }
  return results;
}
