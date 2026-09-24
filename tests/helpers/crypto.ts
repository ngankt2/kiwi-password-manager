import { argon2d, argon2id } from 'hash-wasm';
import { webcrypto } from 'node:crypto';
import { webCryptoProvider } from '../../src/core/crypto/webcrypto';
import { validateKdf } from '../../src/core/crypto/calibrate';
import type { Argon2Parameters } from '../../src/core/crypto/types';

export const testCrypto = webCryptoProvider(async (password, salt, parameters, length = 32) => {
  validateKdf(parameters);
  if (parameters.version !== 19) throw new Error('This test provider supports Argon2 v1.3');
  return (parameters.algorithm === 'argon2id' ? argon2id : argon2d)({ password, salt,
    memorySize: parameters.memoryKiB, iterations: parameters.iterations,
    parallelism: parameters.parallelism, hashLength: length, outputType: 'binary' });
}, webcrypto as unknown as Crypto);

// Small, explicitly non-production parameters keep fault-injection tests fast.
export const TEST_KDF: Argon2Parameters = { algorithm: 'argon2id', version: 19, memoryKiB: 1024, iterations: 2, parallelism: 1 };
export const FIXTURE_PASSWORD = 'fixture-only-password';
