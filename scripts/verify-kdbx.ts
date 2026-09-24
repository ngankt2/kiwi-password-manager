import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { previewKeePass } from '../src/core/kdbx/importer';
import { deriveContext, openVault, sealVault } from '../src/core/vault-format/codec';
import { saveItem } from '../src/domain/services/items';
import { testCrypto } from '../tests/helpers/crypto';
import { NEW_VAULT_KDF } from '../src/core/crypto/types';
import { equalBytes, wipe } from '../src/core/bytes';

// Opt-in local verification. Never print entries, field values or credentials.
const path = process.argv[2];
const password = process.env.KIRO_TEST_PASSWORD;
if (!path || password === undefined) {
  process.stderr.write('Provide a KDBX path and KIRO_TEST_PASSWORD in the environment.\n');
  process.exit(2);
}
const temporary = await mkdtemp(join(tmpdir(), 'kiro-compatibility-'));
let stage = 'read source';
const keys: Uint8Array[] = [];
try {
  const source = new Uint8Array(await readFile(path));
  const originalHash = await testCrypto.sha256(source);
  const keyFile = process.env.KIRO_TEST_KEY_FILE ? new Uint8Array(await readFile(process.env.KIRO_TEST_KEY_FILE)) : undefined;
  stage = 'decrypt and validate KDBX';
  const started = performance.now();
  const preview = await previewKeePass(testCrypto, source, password, 'local-compatibility', basename(path), keyFile);
  wipe(keyFile);
  const decryptMs = Math.round(performance.now() - started);
  stage = 'create encrypted vault';
  const context = await deriveContext(testCrypto, password, NEW_VAULT_KDF); keys.push(context.key);
  const bytes = await sealVault(testCrypto, preview.vault, context);
  const output = join(temporary, 'converted.vault');
  await writeFile(output, bytes, { mode: 0o600, flag: 'wx' });
  wipe(context.key);
  stage = 'reopen and compare all content';
  const reopened = await openVault(testCrypto, new Uint8Array(await readFile(output)), password); keys.push(reopened.context.key);
  if (!isDeepStrictEqual(preview.vault, reopened.vault)) throw new Error('CONTENT_MISMATCH');
  const item = reopened.vault.items[0];
  if (item) {
    stage = 'edit and reopen';
    const updated = saveItem(reopened.vault, { ...item, title: `${item.title} [compatibility check]` }, 'local-check-version');
    const changed = await sealVault(testCrypto, updated, reopened.context);
    await writeFile(join(temporary, 'edited.vault'), changed, { mode: 0o600, flag: 'wx' });
    const final = await openVault(testCrypto, new Uint8Array(await readFile(join(temporary, 'edited.vault'))), password); keys.push(final.context.key);
    if (!isDeepStrictEqual(updated, final.vault)) throw new Error('CONTENT_MISMATCH');
  }
  stage = 'verify original is unchanged';
  if (!equalBytes(originalHash, await testCrypto.sha256(new Uint8Array(await readFile(path))))) throw new Error('SOURCE_CHANGED');
  process.stdout.write(JSON.stringify({ file: basename(path), passed: true, source: preview.source, counts: preview.counts,
    decryptMs, convertedReopen: true, editReopen: Boolean(item), originalUnchanged: true }, null, 2) + '\n');
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'VERIFICATION_FAILED';
  process.stdout.write(JSON.stringify({ file: basename(path), passed: false, stage, code }) + '\n');
  process.exitCode = 1;
} finally {
  keys.forEach((key) => wipe(key));
  await rm(temporary, { recursive: true, force: true });
}
