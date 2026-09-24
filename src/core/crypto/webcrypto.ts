import { buffer } from '../bytes';
import type { CryptoProvider } from './types';

/** Shared WebCrypto AEAD implementation; the Argon2 implementation is injected. */
export function webCryptoProvider(argon2: CryptoProvider['argon2'], engine: Crypto = globalThis.crypto): CryptoProvider {
  return {
    argon2,
    random(length) {
      const bytes = new Uint8Array(length);
      for (let offset = 0; offset < length; offset += 65_536) engine.getRandomValues(bytes.subarray(offset, offset + 65_536));
      return bytes;
    },
    async encrypt(key, nonce, plaintext, aad) {
      const imported = await engine.subtle.importKey('raw', buffer(key), 'AES-GCM', false, ['encrypt']);
      return new Uint8Array(await engine.subtle.encrypt({ name: 'AES-GCM', iv: buffer(nonce), additionalData: buffer(aad), tagLength: 128 }, imported, buffer(plaintext)));
    },
    async decrypt(key, nonce, ciphertext, aad) {
      const imported = await engine.subtle.importKey('raw', buffer(key), 'AES-GCM', false, ['decrypt']);
      return new Uint8Array(await engine.subtle.decrypt({ name: 'AES-GCM', iv: buffer(nonce), additionalData: buffer(aad), tagLength: 128 }, imported, buffer(ciphertext)));
    },
    async sha256(data) { return new Uint8Array(await engine.subtle.digest('SHA-256', buffer(data))); },
  };
}
