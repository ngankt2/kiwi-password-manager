import { equalBytes, fromBase64, toBase64, wipe } from '@/core/bytes';
import { VaultError, type VaultErrorCode } from '@/core/errors';
import type { QuickUnlockOptions, QuickUnlockPort } from '@/core/security/quick-unlock';
import type { DesktopBiometrics } from '@/infrastructure/desktop/bridge';

const codes: VaultErrorCode[] = ['CANCELLED', 'VALIDATION', 'QUICK_UNLOCK_UNSUPPORTED', 'QUICK_UNLOCK_UNAVAILABLE'];
function nativeError(error: unknown): VaultError {
  if (error instanceof VaultError) return error;
  const message = error instanceof Error ? error.message : '';
  return new VaultError(codes.find((code) => code === message) ?? 'QUICK_UNLOCK_UNAVAILABLE');
}
const check = (options: QuickUnlockOptions) => { if (options.signal?.aborted) throw new VaultError('CANCELLED'); };
function decodeKey(value: string | null): Uint8Array | null {
  if (!value) return null;
  const key = fromBase64(value);
  if (key.length === 32) return key;
  wipe(key); return null;
}

/** Touch ID on the macOS desktop host: the native helper seals the vault key in the Secure Enclave. */
export function touchIdUnlock(native: DesktopBiometrics): QuickUnlockPort {
  return {
    async support() {
      try { return await native.support(); } catch (error) { throw nativeError(error); }
    },
    async available() { return (await this.support!()).available; },
    async enrolled(id) {
      try { return await native.enrolled(id); } catch (error) { throw nativeError(error); }
    },
    async enroll(id, binding, key, options = {}) {
      let added = false;
      let verified: Uint8Array | null = null;
      try {
        check(options);
        if (key.length !== 32) throw new VaultError('VALIDATION');
        await native.enroll(id, binding, toBase64(key)); added = true;
        check(options);
        // Creating the Secure Enclave key does not prompt; confirm Touch ID opens it before reporting success.
        verified = decodeKey(await native.recover(id, binding, options.prompt ?? 'unlock your vault'));
        check(options);
        if (!verified || !equalBytes(verified, key)) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
      } catch (error) {
        if (added) await native.revoke(id).catch(() => undefined);
        throw nativeError(error);
      } finally { wipe(verified ?? undefined); }
    },
    async recover(id, binding, options = {}) {
      try {
        check(options);
        const key = decodeKey(await native.recover(id, binding, options.prompt ?? 'unlock your vault'));
        if (options.signal?.aborted) { wipe(key ?? undefined); throw new VaultError('CANCELLED'); }
        return key;
      } catch (error) { throw nativeError(error); }
    },
    async revoke(id) {
      try { await native.revoke(id); } catch (error) { throw nativeError(error); }
    },
  };
}
