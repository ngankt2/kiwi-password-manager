import { argon2d, argon2id } from 'hash-wasm';
import { validateKdf } from '../src/core/crypto/calibrate';
import type { Argon2Parameters } from '../src/core/crypto/types';

self.onmessage = async (event: MessageEvent<{ password: ArrayBuffer; salt: ArrayBuffer; parameters: Argon2Parameters; length: number }>) => {
  const { password, salt, parameters, length } = event.data;
  const bytes = new Uint8Array(password);
  try {
    validateKdf(parameters);
    if (parameters.version !== 19 || length < 4 || length > 64) throw new Error('unsupported');
    const hash = parameters.algorithm === 'argon2d' ? argon2d : argon2id;
    const result = await hash({ password: bytes, salt: new Uint8Array(salt), parallelism: parameters.parallelism,
      iterations: parameters.iterations, memorySize: parameters.memoryKiB, hashLength: length, outputType: 'binary' });
    self.postMessage({ result: result.buffer });
    result.fill(0);
  } catch { self.postMessage({ error: true }); }
  finally { bytes.fill(0); new Uint8Array(salt).fill(0); }
};
