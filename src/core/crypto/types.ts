export interface Argon2Parameters {
  algorithm: 'argon2id' | 'argon2d';
  version: 16 | 19;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

export interface CryptoProvider {
  random(length: number): Uint8Array;
  argon2(password: Uint8Array, salt: Uint8Array, parameters: Argon2Parameters, length?: number): Promise<Uint8Array>;
  encrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  decrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  sha256(data: Uint8Array): Promise<Uint8Array>;
}

export const NEW_VAULT_KDF: Argon2Parameters = {
  algorithm: 'argon2id', version: 19, memoryKiB: 65_536, iterations: 3, parallelism: 1,
};
