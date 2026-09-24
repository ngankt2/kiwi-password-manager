import { wipe } from '../bytes';
import { VaultError } from '../errors';
import { NEW_VAULT_KDF, type Argon2Parameters, type CryptoProvider } from './types';

export function validateKdf(parameters: Argon2Parameters): void {
  const { memoryKiB, iterations, parallelism, version, algorithm } = parameters;
  if (!['argon2id', 'argon2d'].includes(algorithm) || ![16, 19].includes(version)
    || !Number.isSafeInteger(memoryKiB) || memoryKiB < 8 || memoryKiB > 262_144
    || !Number.isSafeInteger(iterations) || iterations < 1 || iterations > 512
    || !Number.isSafeInteger(parallelism) || parallelism < 1 || parallelism > 16
    // KeePass calibrates on the creating machine; valid databases can exceed
    // 100 passes. Bound memory and total work without reducing their KDF cost.
    || memoryKiB < parallelism * 8 || memoryKiB * iterations > 8_388_608) {
    throw new VaultError('LIMIT_EXCEEDED');
  }
}

export async function calibrateKdf(crypto: CryptoProvider, now = () => performance.now()): Promise<{ parameters: Argon2Parameters; measuredMs: number }> {
  const sample = crypto.random(32);
  const salt = crypto.random(16);
  const started = now();
  try {
    const result = await crypto.argon2(sample, salt, NEW_VAULT_KDF);
    wipe(result);
    const measuredMs = Math.max(1, now() - started);
    const iterations = Math.min(8, Math.max(3, Math.ceil(750 / measuredMs * 3)));
    return { parameters: { ...NEW_VAULT_KDF, iterations }, measuredMs };
  } finally { wipe(sample, salt); }
}
