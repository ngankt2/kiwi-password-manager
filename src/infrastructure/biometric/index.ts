import * as SecureStore from 'expo-secure-store';
import * as Authentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { equalBytes, fromBase64, toBase64, wipe } from '@/core/bytes';
import { VaultError } from '@/core/errors';
import type { BiometricPort } from '@/domain/services/session';
import type { QuickUnlockOptions, QuickUnlockSupport } from '@/core/security/quick-unlock';

const storageKey = (id: string) => `kiro.biometric.${id.replace(/[^a-zA-Z0-9_.-]/g, '')}`;
const options: SecureStore.SecureStoreOptions = {
  requireAuthentication: true, keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  authenticationPrompt: 'Unlock your Kiwi Password vault', keychainService: 'com.appkiro.vault.biometric',
};
const requestedOptions = (request: QuickUnlockOptions) => ({ ...options, authenticationPrompt: request.prompt ?? options.authenticationPrompt });
const check = (request: QuickUnlockOptions) => { if (request.signal?.aborted) throw new VaultError('CANCELLED'); };
function errorCode(error: unknown): VaultError {
  if (error instanceof VaultError) return error;
  if (error instanceof Error && error.message.includes('User canceled')) return new VaultError('CANCELLED');
  return new VaultError('QUICK_UNLOCK_UNAVAILABLE');
}
async function support(): Promise<QuickUnlockSupport> {
  const types = await Authentication.supportedAuthenticationTypesAsync();
  const method = Platform.OS === 'ios' ? types.includes(Authentication.AuthenticationType.FACIAL_RECOGNITION) ? 'faceId'
    : types.includes(Authentication.AuthenticationType.FINGERPRINT) ? 'touchId' : 'biometric' : 'biometric';
  const hardware = await SecureStore.isAvailableAsync() && await Authentication.hasHardwareAsync();
  const enrolled = hardware && await Authentication.isEnrolledAsync();
  return { method, available: enrolled && SecureStore.canUseBiometricAuthentication(), reason: hardware && !enrolled ? 'not-enrolled' : 'unsupported' };
}
function readKey(item: string | null, binding: string): Uint8Array | null {
  if (!item) return null;
  const value: unknown = JSON.parse(item);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
    || !('binding' in value) || value.binding !== binding || !('key' in value) || typeof value.key !== 'string' || value.key.length !== 44) return null;
  const key = fromBase64(value.key);
  if (key.length === 32) return key;
  wipe(key); return null;
}
export const biometrics: BiometricPort = {
  support,
  async available() { return (await support()).available; },
  async enrolled(id) { return (await SecureStore.getItemAsync(`${storageKey(id)}.enabled`)) === 'true'; },
  async enroll(id, binding, key, request = {}) {
    let added = false;
    let verified: Uint8Array | null = null;
    try {
      check(request);
      if (key.length !== 32) throw new VaultError('VALIDATION');
      if (!await this.available()) throw new VaultError('QUICK_UNLOCK_UNSUPPORTED');
      const protectedOptions = requestedOptions(request);
      await SecureStore.setItemAsync(storageKey(id), JSON.stringify({ version: 1, binding, key: toBase64(key) }), protectedOptions);
      added = true; check(request);
      // iOS does not prompt when adding a new item. Verify the protected read
      // before advertising biometric unlock as configured.
      verified = readKey(await SecureStore.getItemAsync(storageKey(id), protectedOptions), binding);
      check(request);
      if (!verified || !equalBytes(verified, key)) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
      await SecureStore.setItemAsync(`${storageKey(id)}.enabled`, 'true');
      check(request);
    } catch (error) {
      if (added) await this.revoke(id);
      throw errorCode(error);
    } finally { wipe(verified ?? undefined); }
  },
  async recover(id, binding, request = {}) {
    let key: Uint8Array | null = null;
    try {
      check(request);
      key = readKey(await SecureStore.getItemAsync(storageKey(id), requestedOptions(request)), binding);
      check(request);
      const result = key; key = null; return result;
    } catch (error) { throw errorCode(error); }
    finally { wipe(key ?? undefined); }
  },
  async revoke(id) { await SecureStore.deleteItemAsync(storageKey(id), options); await SecureStore.deleteItemAsync(`${storageKey(id)}.enabled`); },
};
