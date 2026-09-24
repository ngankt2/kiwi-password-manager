import { buffer } from '@/core/bytes';
import { validateKdf } from '@/core/crypto/calibrate';
import { webCryptoProvider } from '@/core/crypto/webcrypto';
import { VaultError } from '@/core/errors';

export const cryptoProvider = webCryptoProvider((password, salt, parameters, length = 32) => {
  validateKdf(parameters);
  if (parameters.version !== 19) throw new VaultError('UNSUPPORTED_KDBX');
  if (typeof Worker === 'undefined' || !globalThis.crypto?.subtle) throw new VaultError('CRYPTO_UNAVAILABLE');
  return new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker('/argon2.worker.js');
    const timeout = setTimeout(() => { worker.terminate(); reject(new VaultError('LIMIT_EXCEEDED')); }, 60_000);
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = (event: MessageEvent<{ result?: ArrayBuffer; error?: boolean }>) => {
      finish();
      if (event.data.result instanceof ArrayBuffer) resolve(new Uint8Array(event.data.result));
      else reject(new VaultError('CRYPTO_UNAVAILABLE'));
    };
    worker.onerror = () => { finish(); reject(new VaultError('CRYPTO_UNAVAILABLE')); };
    const input = buffer(password);
    const nonce = buffer(salt);
    worker.postMessage({ password: input, salt: nonce, parameters, length }, [input, nonce]);
  });
});
