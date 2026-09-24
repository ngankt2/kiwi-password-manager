import { z } from 'zod';
import { concat, equalBytes, fromBase64, text, toBase64, utf8, wipe } from '../bytes';
import { validateKdf } from '../crypto/calibrate';
import type { Argon2Parameters, CryptoProvider } from '../crypto/types';
import { VaultError } from '../errors';
import { migrateVault } from '../migrations';
import { validateVault, type Vault } from '@/domain/entities/vault';

export const MAGIC = utf8('KIROVLT\0');
export const MAX_VAULT_BYTES = 67_108_864;
export const MAX_HEADER_BYTES = 4096;

const HeaderSchema = z.object({
  formatVersion: z.literal(1), cryptoVersion: z.literal(1), schemaVersion: z.number().int().min(1).max(2),
  vaultId: z.string().min(1).max(160),
  kdf: z.object({ algorithm: z.literal('argon2id'), version: z.literal(19), memoryKiB: z.number().int(),
    iterations: z.number().int(), parallelism: z.number().int(), salt: z.string().max(64) }).strict(),
  cipher: z.object({ algorithm: z.literal('aes-256-gcm'), nonce: z.string().max(24) }).strict(),
}).strict();

export type VaultHeader = z.infer<typeof HeaderSchema>;
export type KeyContext = { key: Uint8Array; kdf: VaultHeader['kdf'] };

export function readEnvelope(bytes: Uint8Array): { header: VaultHeader; aad: Uint8Array; ciphertext: Uint8Array } {
  if (bytes.length > MAX_VAULT_BYTES) throw new VaultError('LIMIT_EXCEEDED');
  if (bytes.length < 28 || !equalBytes(bytes.subarray(0, 8), MAGIC)) throw new VaultError('INVALID_FILE');
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, false);
  if (length < 2 || length > MAX_HEADER_BYTES || 12 + length + 16 > bytes.length) throw new VaultError('CORRUPT');
  let json: unknown;
  try { json = JSON.parse(text(bytes.subarray(12, 12 + length))); }
  catch { throw new VaultError('CORRUPT'); }
  if (typeof json === 'object' && json !== null) {
    const versions = json as Record<string, unknown>;
    if (versions.formatVersion !== 1 || versions.cryptoVersion !== 1 || (typeof versions.schemaVersion === 'number' && versions.schemaVersion > 2)) throw new VaultError('UNSUPPORTED_VERSION');
  }
  const parsed = HeaderSchema.safeParse(json);
  if (!parsed.success) throw new VaultError('CORRUPT');
  validateKdf(parsed.data.kdf);
  if (fromBase64(parsed.data.kdf.salt).length !== 16 || fromBase64(parsed.data.cipher.nonce).length !== 12) throw new VaultError('CORRUPT');
  return { header: parsed.data, aad: bytes.subarray(0, 12 + length), ciphertext: bytes.subarray(12 + length) };
}

export async function deriveContext(crypto: CryptoProvider, password: string, parameters: Argon2Parameters): Promise<KeyContext> {
  if (parameters.algorithm !== 'argon2id' || parameters.version !== 19) throw new VaultError('VALIDATION');
  validateKdf(parameters);
  const salt = crypto.random(16);
  const passwordBytes = utf8(password);
  try { return { key: await crypto.argon2(passwordBytes, salt, parameters), kdf: { ...parameters, algorithm: 'argon2id', version: 19, salt: toBase64(salt) } }; }
  finally { wipe(passwordBytes, salt); }
}

export async function sealVault(crypto: CryptoProvider, vault: Vault, context: KeyContext): Promise<Uint8Array> {
  validateVault(vault);
  const nonce = crypto.random(12);
  const header: VaultHeader = { formatVersion: 1, cryptoVersion: 1, schemaVersion: 2, vaultId: vault.id,
    kdf: context.kdf, cipher: { algorithm: 'aes-256-gcm', nonce: toBase64(nonce) } };
  const serialized = utf8(JSON.stringify(HeaderSchema.parse(header)));
  const prefix = new Uint8Array(12);
  prefix.set(MAGIC);
  new DataView(prefix.buffer).setUint32(8, serialized.length, false);
  const aad = concat(prefix, serialized);
  const plaintext = utf8(JSON.stringify(vault));
  if (plaintext.length + aad.length + 16 > MAX_VAULT_BYTES) { wipe(plaintext); throw new VaultError('LIMIT_EXCEEDED'); }
  try { return concat(aad, await crypto.encrypt(context.key, nonce, plaintext, aad)); }
  finally { wipe(plaintext); }
}

export async function openWithKey(crypto: CryptoProvider, bytes: Uint8Array, key: Uint8Array): Promise<{ vault: Vault; migrated: boolean; header: VaultHeader }> {
  const { header, aad, ciphertext } = readEnvelope(bytes);
  let plaintext: Uint8Array;
  try { plaintext = await crypto.decrypt(key, fromBase64(header.cipher.nonce), ciphertext, aad); }
  catch { throw new VaultError('AUTHENTICATION'); }
  try {
    let data: unknown;
    try { data = JSON.parse(text(plaintext)); } catch { throw new VaultError('CORRUPT'); }
    const result = migrateVault(data, header.schemaVersion);
    if (result.vault.id !== header.vaultId) throw new VaultError('CORRUPT');
    return { ...result, header };
  } finally { wipe(plaintext); }
}

export async function openVault(crypto: CryptoProvider, bytes: Uint8Array, password: string): Promise<{ vault: Vault; migrated: boolean; context: KeyContext }> {
  const { header } = readEnvelope(bytes);
  const passwordBytes = utf8(password);
  let key: Uint8Array | undefined;
  try {
    key = await crypto.argon2(passwordBytes, fromBase64(header.kdf.salt), header.kdf);
    const result = await openWithKey(crypto, bytes, key);
    return { vault: result.vault, migrated: result.migrated, context: { key, kdf: header.kdf } };
  } catch (error) { wipe(key); throw error; }
  finally { wipe(passwordBytes); }
}
