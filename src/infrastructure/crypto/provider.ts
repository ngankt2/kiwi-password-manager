import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, digest, CryptoDigestAlgorithm, getRandomValues } from 'expo-crypto';
import { argon2, install } from 'react-native-quick-crypto';

import { buffer } from '@/core/bytes';
import { validateKdf } from '@/core/crypto/calibrate';
import type { CryptoProvider } from '@/core/crypto/types';

// Kdbxweb needs AES-CBC, HMAC and WebCrypto in addition to the vault's AEAD.
install();

export const cryptoProvider: CryptoProvider = {
  // getRandomBytes has a debugger fallback; this API fails closed instead.
  random(length) { return getRandomValues(new Uint8Array(length)); },
  argon2(password, salt, parameters, length = 32) {
    validateKdf(parameters);
    return new Promise((resolve, reject) => {
      argon2(parameters.algorithm, {
        message: buffer(password), nonce: buffer(salt), memory: parameters.memoryKiB,
        passes: parameters.iterations, parallelism: parameters.parallelism,
        tagLength: length, version: parameters.version,
      }, (error, result) => {
        if (error) reject(error);
        else { const bytes = new Uint8Array(result); result.fill(0); resolve(bytes); }
      });
    });
  },
  async encrypt(key, nonce, plaintext, aad) {
    const imported = await AESEncryptionKey.import(key);
    const sealed = await aesEncryptAsync(plaintext, imported, { nonce: { bytes: nonce }, additionalData: aad, tagLength: 16 });
    return sealed.ciphertext({ encoding: 'bytes', includeTag: true });
  },
  async decrypt(key, nonce, ciphertext, aad) {
    const imported = await AESEncryptionKey.import(key);
    return aesDecryptAsync(AESSealedData.fromParts(nonce, ciphertext, 16), imported, { additionalData: aad });
  },
  async sha256(data) { return new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(data))); },
};
