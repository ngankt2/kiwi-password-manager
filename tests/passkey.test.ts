import 'fake-indexeddb/auto';
import { describe, expect, test } from 'bun:test';
import { PasskeyUnlock, type PasskeyClient } from '../src/infrastructure/biometric/passkey';
import { IndexedDbPasskeyStore, type PasskeyStore } from '../src/infrastructure/biometric/passkey-store';
import { buffer, concat, fromBase64, toBase64, utf8 } from '../src/core/bytes';
import { VaultError } from '../src/core/errors';
import { testCrypto } from './helpers/crypto';

const b64url = (source: BufferSource) => toBase64(new Uint8Array(source instanceof ArrayBuffer ? source : buffer(new Uint8Array(source.buffer, source.byteOffset, source.byteLength)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const array = (source: BufferSource) => new Uint8Array(source instanceof ArrayBuffer ? source : source.buffer);
function derSignature(raw: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(raw);
  const integers = [bytes.slice(0, 32), bytes.slice(32)].map((number) => {
    let index = 0;
    while (index < number.length - 1 && number[index] === 0) index++;
    const unsigned = number.slice(index);
    const positive = unsigned[0] & 0x80 ? concat(new Uint8Array([0]), unsigned) : unsigned;
    return concat(new Uint8Array([2, positive.length]), positive);
  });
  const sequence = concat(...integers);
  return buffer(concat(new Uint8Array([0x30, sequence.length]), sequence));
}

class MemoryPasskeys implements PasskeyStore {
  records = new Map<string, unknown>();
  afterAdd?: () => void;
  async read(id: string) { return structuredClone(this.records.get(id)); }
  async add(id: string, value: unknown) {
    if (this.records.has(id)) throw new VaultError('CONFLICT');
    this.records.set(id, structuredClone(value)); this.afterAdd?.();
  }
  async remove(id: string) { this.records.delete(id); }
}

/** A test authenticator signs real WebAuthn assertions and derives a stable PRF. */
class TestAuthenticator implements PasskeyClient {
  origin = 'https://appkiro.example';
  rpId = 'appkiro.example';
  supportsPrf = true;
  prfOnCreate = false;
  cancel = false;
  violation: 'presence' | 'verification' | 'origin' | 'challenge' | 'rpId' | 'signature' | 'credential' | null = null;
  lastPrf?: Uint8Array;
  creates: CredentialCreationOptions[] = [];
  gets: CredentialRequestOptions[] = [];
  private rawId = testCrypto.random(32);
  private signingKey?: CryptoKeyPair;
  private secret = testCrypto.random(32);
  async supported() { return true; }
  private async prf(input: BufferSource) {
    const key = await crypto.subtle.importKey('raw', buffer(this.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    this.lastPrf = new Uint8Array(await crypto.subtle.sign('HMAC', key, buffer(array(input))));
    return this.lastPrf;
  }
  private clientData(type: string, challenge: BufferSource) {
    return buffer(utf8(JSON.stringify({ type, challenge: this.violation === 'challenge' ? 'wrong' : b64url(challenge),
      origin: this.violation === 'origin' ? 'https://untrusted.example' : this.origin, crossOrigin: false })));
  }
  private async authData() {
    const flags = this.violation === 'presence' ? 4 : this.violation === 'verification' ? 1 : 5;
    return concat(await testCrypto.sha256(utf8(this.violation === 'rpId' ? 'untrusted.example' : this.rpId)), new Uint8Array([flags, 0, 0, 0, 1]));
  }
  async create(options: CredentialCreationOptions): Promise<PublicKeyCredential | null> {
    this.creates.push(options);
    if (this.cancel) return null;
    this.signingKey = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publicKey = await crypto.subtle.exportKey('spki', this.signingKey.publicKey);
    const authData = await this.authData();
    const first = this.supportsPrf && this.prfOnCreate ? await this.prf(options.publicKey!.extensions!.prf!.eval!.first) : undefined;
    return { id: b64url(buffer(this.rawId)), rawId: buffer(this.rawId), type: 'public-key', response: {
      clientDataJSON: this.clientData('webauthn.create', options.publicKey!.challenge),
      getAuthenticatorData: () => buffer(authData), getPublicKey: () => publicKey, getPublicKeyAlgorithm: () => -7,
    }, getClientExtensionResults: () => ({ prf: { enabled: this.supportsPrf, ...(first ? { results: { first } } : {}) } }) } as unknown as PublicKeyCredential;
  }
  async get(options: CredentialRequestOptions): Promise<PublicKeyCredential | null> {
    this.gets.push(options);
    if (this.cancel) return null;
    const requestedId = b64url(options.publicKey!.allowCredentials![0].id);
    const first = await this.prf(options.publicKey!.extensions!.prf!.evalByCredential![requestedId].first);
    const authData = await this.authData();
    const clientDataJSON = this.clientData('webauthn.get', options.publicKey!.challenge);
    const message = concat(authData, await testCrypto.sha256(new Uint8Array(clientDataJSON)));
    const signature = derSignature(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.signingKey!.privateKey, buffer(message)));
    if (this.violation === 'signature') new Uint8Array(signature)[signature.byteLength - 1] ^= 1;
    const rawId = this.violation === 'credential' ? testCrypto.random(32) : this.rawId;
    return { id: b64url(buffer(rawId)), rawId: buffer(rawId), type: 'public-key', response: {
      clientDataJSON, authenticatorData: buffer(authData), signature,
    }, getClientExtensionResults: () => ({ prf: this.supportsPrf ? { results: { first } } : {} }) } as unknown as PublicKeyCredential;
  }
}

const setup = () => {
  const client = new TestAuthenticator();
  const store = new MemoryPasskeys();
  return { client, store, unlock: new PasskeyUnlock(client, store, testCrypto), key: testCrypto.random(32) };
};

describe('passkey protected vault keys', () => {
  for (const prfOnCreate of [false, true]) test(`registration with PRF on create = ${prfOnCreate} persists only a wrapped key and reopens`, async () => {
    const { client, store, unlock, key } = setup(); client.prfOnCreate = prfOnCreate;
    await unlock.enroll('vault-a', 'binding-a', key, { name: 'Test vault' });
    expect(await unlock.enrolled('vault-a')).toBe(true);
    expect(JSON.stringify(await store.read('vault-a'))).not.toContain(toBase64(key));
    expect(client.creates[0].publicKey?.authenticatorSelection?.userVerification).toBe('required');
    expect(client.creates[0].publicKey?.authenticatorSelection?.residentKey).toBe('required');
    expect(client.lastPrf?.every((byte) => byte === 0)).toBe(true);
    const reopened = new PasskeyUnlock(client, store, testCrypto);
    expect(await reopened.recover('vault-a', 'binding-a')).toEqual(key);
    expect(client.gets.at(-1)?.publicKey?.userVerification).toBe('required');
    expect(client.lastPrf?.every((byte) => byte === 0)).toBe(true);
  });

  test('a credential without PRF cannot enable unlock or leave key material in storage', async () => {
    const { client, store, unlock, key } = setup(); client.supportsPrf = false;
    await expect(unlock.enroll('vault-a', 'binding-a', key)).rejects.toMatchObject({ code: 'QUICK_UNLOCK_UNSUPPORTED' });
    expect(store.records.size).toBe(0);
  });

  for (const violation of ['presence', 'verification', 'origin', 'challenge', 'rpId', 'signature', 'credential'] as const) {
    test(`an assertion with invalid ${violation} cannot release the vault key`, async () => {
      const { client, unlock, key } = setup(); client.prfOnCreate = true;
      await unlock.enroll('vault-a', 'binding-a', key);
      client.violation = violation;
      await expect(unlock.recover('vault-a', 'binding-a')).rejects.toMatchObject({ code: 'QUICK_UNLOCK_UNAVAILABLE' });
      expect(client.lastPrf?.every((byte) => byte === 0)).toBe(true);
    });
  }

  test('changed vault bindings and copied enrollment records do not invoke an authenticator', async () => {
    const { client, store, unlock, key } = setup(); client.prfOnCreate = true;
    await unlock.enroll('vault-a', 'binding-a', key);
    store.records.set('vault-b', await store.read('vault-a'));
    expect(await unlock.recover('vault-a', 'rotated-password-binding')).toBeNull();
    expect(await unlock.recover('vault-b', 'binding-a')).toBeNull();
    expect(client.gets).toHaveLength(0);
  });

  for (const field of ['ciphertext', 'prfInput', 'nonce'] as const) test(`tampering with ${field} fails authenticated decryption`, async () => {
    const { store, unlock, key } = setup();
    await unlock.enroll('vault-a', 'binding-a', key);
    const record = await store.read('vault-a') as Record<string, string>;
    const bytes = fromBase64(record[field]); bytes[0] ^= 1; record[field] = toBase64(bytes);
    store.records.set('vault-a', record);
    await expect(unlock.recover('vault-a', 'binding-a')).rejects.toMatchObject({ code: 'QUICK_UNLOCK_UNAVAILABLE' });
  });

  test('cancelling authentication preserves enrollment and a later attempt succeeds', async () => {
    const { client, unlock, key } = setup();
    await unlock.enroll('vault-a', 'binding-a', key); client.cancel = true;
    await expect(unlock.recover('vault-a', 'binding-a')).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(await unlock.enrolled('vault-a')).toBe(true);
    client.cancel = false;
    expect(await unlock.recover('vault-a', 'binding-a')).toEqual(key);
  });

  test('aborting while enrollment is being committed removes the new wrapper', async () => {
    const { client, store, unlock, key } = setup(); const controller = new AbortController();
    store.afterAdd = () => controller.abort();
    await expect(unlock.enroll('vault-a', 'binding-a', key, { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(store.records.size).toBe(0);
    expect(client.lastPrf?.every((byte) => byte === 0)).toBe(true);
  });

  test('damaged enrollments can be disabled and set up again', async () => {
    const { store, unlock, key } = setup();
    store.records.set('vault-a', { damaged: true });
    expect(await unlock.enrolled('vault-a')).toBe(true);
    expect(await unlock.recover('vault-a', 'binding-a')).toBeNull();
    await unlock.revoke('vault-a');
    await unlock.enroll('vault-a', 'binding-a', key);
    expect(await unlock.recover('vault-a', 'binding-a')).toEqual(key);
  });

  test('IndexedDB persists wrappers across adapter instances and rejects accidental replacement', async () => {
    const name = `passkey-test-${crypto.randomUUID()}`;
    const first = new IndexedDbPasskeyStore(name); const second = new IndexedDbPasskeyStore(name);
    await first.add('vault-a', { ciphertext: 'only-an-encrypted-wrapper' });
    expect(await second.read('vault-a')).toEqual({ ciphertext: 'only-an-encrypted-wrapper' });
    await expect(second.add('vault-a', { replacement: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await first.read('vault-a')).toEqual({ ciphertext: 'only-an-encrypted-wrapper' });
    await second.remove('vault-a');
    expect(await first.read('vault-a')).toBeUndefined();
  });
});
