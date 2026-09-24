import { z } from 'zod';
import { buffer, concat, equalBytes, fromBase64, text, toBase64, utf8, wipe } from '@/core/bytes';
import type { CryptoProvider } from '@/core/crypto/types';
import { VaultError } from '@/core/errors';
import type { QuickUnlockOptions, QuickUnlockPort, QuickUnlockSupport } from '@/core/security/quick-unlock';
import type { PasskeyStore } from './passkey-store';

export interface PasskeyClient {
  origin: string;
  rpId: string;
  supported(): Promise<boolean>;
  create(options: CredentialCreationOptions): Promise<PublicKeyCredential | null>;
  get(options: CredentialRequestOptions): Promise<PublicKeyCredential | null>;
}

const RecordSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(256),
  binding: z.string().min(1).max(4096),
  origin: z.string().min(1).max(2048),
  credentialId: z.string().min(4).max(1400),
  publicKey: z.string().min(4).max(512),
  prfInput: z.string().length(44),
  nonce: z.string().length(16),
  ciphertext: z.string().length(64),
}).strict();
type PasskeyRecord = z.infer<typeof RecordSchema>;
type Metadata = Omit<PasskeyRecord, 'nonce' | 'ciphertext'>;
const base64url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bytesOf = (source: BufferSource): Uint8Array => source instanceof ArrayBuffer
  ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new VaultError('CANCELLED'); };
const aad = ({ version, id, binding, origin, credentialId, publicKey, prfInput }: Metadata) =>
  utf8(JSON.stringify(['appkiro-passkey-wrap', version, id, binding, origin, credentialId, publicKey, prfInput]));

function safePasskeyError(error: unknown): VaultError {
  if (error instanceof VaultError) return error.code === 'AUTHENTICATION' || error.code === 'CORRUPT' ? new VaultError('QUICK_UNLOCK_UNAVAILABLE') : error;
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return new VaultError('CANCELLED');
  if (name === 'NotSupportedError' || name === 'SecurityError') return new VaultError('QUICK_UNLOCK_UNSUPPORTED');
  return new VaultError('QUICK_UNLOCK_UNAVAILABLE');
}

/** WebAuthn ES256 signatures use DER; Web Crypto verifies fixed-width r || s. */
function rawSignature(der: Uint8Array): Uint8Array {
  if (der.length < 8 || der.length > 72 || der[0] !== 0x30 || der[1] !== der.length - 2) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
  const raw = new Uint8Array(64);
  let offset = 2;
  for (let index = 0; index < 2; index++) {
    if (der[offset++] !== 2) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
    const length = der[offset++];
    if (!length || length > 33 || offset + length > der.length || der[offset] & 0x80) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
    let integer = der.subarray(offset, offset + length); offset += length;
    if (integer.length > 1 && integer[0] === 0) {
      if (!(integer[1] & 0x80)) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
      integer = integer.subarray(1);
    }
    if (integer.length > 32) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
    raw.set(integer, index * 32 + 32 - integer.length);
  }
  if (offset !== der.length) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
  return raw;
}

export class PasskeyUnlock implements QuickUnlockPort {
  constructor(private readonly client: PasskeyClient, private readonly store: PasskeyStore, private readonly crypto: CryptoProvider) {}
  async support(): Promise<QuickUnlockSupport> {
    return { method: 'passkey', available: await this.available(), reason: 'unsupported' };
  }
  async available() { try { return await this.client.supported(); } catch { return false; } }
  private parse(value: unknown): PasskeyRecord | null {
    const parsed = RecordSchema.safeParse(value);
    if (!parsed.success) return null;
    try {
      const record = parsed.data;
      const credentialLength = fromBase64(record.credentialId).length;
      if (credentialLength < 1 || credentialLength > 1024 || fromBase64(record.publicKey).length > 256
        || fromBase64(record.prfInput).length !== 32 || fromBase64(record.nonce).length !== 12 || fromBase64(record.ciphertext).length !== 48) return null;
      return record;
    } catch { return null; }
  }
  async enrolled(id: string) {
    // Keep the disable action available even if a stored enrollment is damaged.
    return (await this.store.read(id)) !== undefined;
  }
  private async verifyResponse(credential: PublicKeyCredential, kind: 'create' | 'get', challenge: Uint8Array, authenticatorData: Uint8Array) {
    if (credential.type !== 'public-key' || credential.rawId.byteLength < 1 || credential.rawId.byteLength > 1024
      || credential.id !== base64url(new Uint8Array(credential.rawId)) || credential.response.clientDataJSON.byteLength > 4096) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
    const clientData = JSON.parse(text(new Uint8Array(credential.response.clientDataJSON)));
    if (!clientData || clientData.type !== `webauthn.${kind}` || clientData.challenge !== base64url(challenge)
      || clientData.origin !== this.client.origin || clientData.crossOrigin !== undefined && clientData.crossOrigin !== false) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
    if (authenticatorData.length < 37 || (authenticatorData[32] & 5) !== 5
      || !equalBytes(authenticatorData.subarray(0, 32), await this.crypto.sha256(utf8(this.client.rpId)))) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
  }
  private prf(credential: PublicKeyCredential): Uint8Array {
    const result = credential.getClientExtensionResults().prf?.results?.first;
    if (!result) throw new VaultError('QUICK_UNLOCK_UNSUPPORTED');
    const key = bytesOf(result);
    if (key.length !== 32) { wipe(key); throw new VaultError('QUICK_UNLOCK_UNAVAILABLE'); }
    return key;
  }
  private async authenticate(record: Metadata, options: QuickUnlockOptions): Promise<Uint8Array> {
    cancelled(options.signal);
    const challenge = this.crypto.random(32);
    const credentialId = fromBase64(record.credentialId);
    const credential = await this.client.get({ signal: options.signal, publicKey: {
      challenge: buffer(challenge), rpId: this.client.rpId, timeout: 60_000, userVerification: 'required',
      allowCredentials: [{ id: buffer(credentialId), type: 'public-key' }],
      extensions: { prf: { evalByCredential: { [base64url(credentialId)]: { first: buffer(fromBase64(record.prfInput)) } } } },
    } });
    if (!credential) throw new VaultError('CANCELLED');
    let result: Uint8Array | undefined;
    try {
      result = this.prf(credential);
      cancelled(options.signal);
      if (!equalBytes(new Uint8Array(credential.rawId), credentialId)) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
      const response = credential.response as AuthenticatorAssertionResponse;
      const authenticatorData = new Uint8Array(response.authenticatorData);
      await this.verifyResponse(credential, 'get', challenge, authenticatorData);
      const publicKey = await globalThis.crypto.subtle.importKey('spki', buffer(fromBase64(record.publicKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      const signature = rawSignature(new Uint8Array(response.signature));
      const message = concat(authenticatorData, await this.crypto.sha256(new Uint8Array(response.clientDataJSON)));
      if (!await globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, buffer(signature), buffer(message))) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
      cancelled(options.signal);
      const key = result; result = undefined;
      return key;
    } finally { wipe(result); }
  }
  async enroll(id: string, binding: string, key: Uint8Array, options: QuickUnlockOptions = {}) {
    let wrappingKey: Uint8Array | undefined;
    let added = false;
    try {
      cancelled(options.signal);
      if (key.length !== 32) throw new VaultError('VALIDATION');
      if (!await this.available()) throw new VaultError('QUICK_UNLOCK_UNSUPPORTED');
      if (await this.store.read(id)) throw new VaultError('CONFLICT');
      cancelled(options.signal);
      const challenge = this.crypto.random(32);
      const prfInput = this.crypto.random(32);
      const credential = await this.client.create({ signal: options.signal, publicKey: {
        rp: { id: this.client.rpId, name: 'Kiro Password Manager' },
        user: { id: buffer(await this.crypto.sha256(utf8(id))), name: options.name || 'Kiro Password Manager', displayName: options.name || 'Kiro Password Manager' },
        challenge: buffer(challenge), pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 60_000,
        authenticatorSelection: { userVerification: 'required', residentKey: 'required', requireResidentKey: true },
        attestation: 'none', extensions: { prf: { eval: { first: buffer(prfInput) } } },
      } });
      if (!credential) throw new VaultError('CANCELLED');
      if (credential.getClientExtensionResults().prf?.results?.first) wrappingKey = this.prf(credential);
      cancelled(options.signal);
      const response = credential.response as AuthenticatorAttestationResponse;
      if (credential.getClientExtensionResults().prf?.enabled !== true || typeof response.getPublicKey !== 'function'
        || typeof response.getAuthenticatorData !== 'function' || response.getPublicKeyAlgorithm() !== -7) throw new VaultError('QUICK_UNLOCK_UNSUPPORTED');
      await this.verifyResponse(credential, 'create', challenge, new Uint8Array(response.getAuthenticatorData()));
      const publicKey = response.getPublicKey();
      if (!publicKey) throw new VaultError('QUICK_UNLOCK_UNSUPPORTED');
      const metadata: Metadata = { version: 1, id, binding, origin: this.client.origin, credentialId: toBase64(new Uint8Array(credential.rawId)), publicKey: toBase64(new Uint8Array(publicKey)), prfInput: toBase64(prfInput) };
      // Some authenticators can only evaluate the PRF in a subsequent assertion.
      wrappingKey ??= await this.authenticate(metadata, options);
      cancelled(options.signal);
      const nonce = this.crypto.random(12);
      const ciphertext = await this.crypto.encrypt(wrappingKey, nonce, key, aad(metadata));
      cancelled(options.signal);
      await this.store.add(id, RecordSchema.parse({ ...metadata, nonce: toBase64(nonce), ciphertext: toBase64(ciphertext) }));
      added = true;
      cancelled(options.signal);
    } catch (error) {
      if (added) await this.store.remove(id);
      throw safePasskeyError(error);
    } finally { wipe(wrappingKey); }
  }
  async recover(id: string, binding: string, options: QuickUnlockOptions = {}): Promise<Uint8Array | null> {
    let wrappingKey: Uint8Array | undefined;
    let key: Uint8Array | undefined;
    try {
      const record = this.parse(await this.store.read(id));
      if (!record || record.id !== id || record.binding !== binding || record.origin !== this.client.origin) return null;
      if (!await this.available()) throw new VaultError('QUICK_UNLOCK_UNSUPPORTED');
      wrappingKey = await this.authenticate(record, options);
      key = await this.crypto.decrypt(wrappingKey, fromBase64(record.nonce), fromBase64(record.ciphertext), aad(record));
      cancelled(options.signal);
      if (key.length !== 32) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
      const result = key; key = undefined;
      return result;
    } catch (error) { throw safePasskeyError(error); }
    finally { wipe(wrappingKey, key); }
  }
  revoke(id: string) { return this.store.remove(id); }
}

export const browserPasskeyClient: PasskeyClient = {
  get origin() { return typeof location === 'undefined' ? '' : location.origin; },
  get rpId() { return typeof location === 'undefined' ? '' : location.hostname; },
  async supported() {
    if (typeof window === 'undefined' || !window.isSecureContext || !['https:', 'http:'].includes(location.protocol)
      || !globalThis.crypto?.subtle || !navigator.credentials?.create || !navigator.credentials?.get || typeof PublicKeyCredential === 'undefined') return false;
    if (typeof PublicKeyCredential.getClientCapabilities === 'function') {
      const capabilities = await PublicKeyCredential.getClientCapabilities();
      if (capabilities['extension:prf'] === false) return false;
    }
    return true;
  },
  async create(options) { return await navigator.credentials.create(options) as PublicKeyCredential | null; },
  async get(options) { return await navigator.credentials.get(options) as PublicKeyCredential | null; },
};
